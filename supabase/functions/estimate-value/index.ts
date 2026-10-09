// Veiledende AI-anslag på bruktverdi i NOK (norsk bruktmarked) for en gjenstand. Bygger på bildeanalysen når
// den finnes (sendt med som «analysis», eller lagret på gjenstanden med «item_id»); bildene analyseres ikke på
// nytt, så kallet er bare tekst. Ingen eksterne kilder. For lite grunnlag gir status «insufficient» og ingen
// verdi (aldri 0 kr). Logikken ligger i _shared/valuation.ts.
// Krever innlogget bruker og teller mot AI-kvoten (demoen: 5 forsøk per besøk). Modell: se _shared/ai.ts.
import { getUser, json, preflight, userClient } from '../_shared/http.ts'
import { aiConfigured, aiErrorJson, aiErrorResponse, callStructured, claimAiCall, currentModel } from '../_shared/ai.ts'
import { categoryKeyFor, depreciatedValue, readEstimateInput, type EstimateInput } from '../_shared/aiCore.ts'
import { normalizeAnalysis, type Analysis } from '../_shared/analysis.ts'
import {
  ESTIMATE_SCHEMA_V2, VALUATION_VERSION, conditionGuidance, describeItem, finalizeEstimate, insufficientWithoutCall, validateEstimateV2, valuationSystem,
} from '../_shared/valuation.ts'

const MAX_ANALYSIS_CHARS = 20_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Analysen fra klienten valideres på nytt (den kan være endret); feil form gir ingen analyse
function readAnalysis(value: unknown): Analysis | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const ai = v.ai ?? v // hele ai_analysis-dokumentet eller bare AI-delen
  if (JSON.stringify(ai).length > MAX_ANALYSIS_CHARS) return null
  const r = normalizeAnalysis([])(ai)
  return r.ok ? r.value : null
}

// Lagret gjenstand: hentes med brukerens egen innlogging, så RLS avgjør om brukeren har tilgang
async function loadItem(req: Request, itemId: string): Promise<{ body: Record<string, unknown>; analysis: unknown } | null> {
  const { data } = await userClient(req).from('items')
    .select('title, description, condition, purchase_price, purchase_year, ai_analysis, categories(label)')
    .eq('id', itemId).maybeSingle()
  if (!data) return null
  const d = data as Record<string, unknown> & { categories?: { label?: string } | null }
  return {
    body: { title: d.title, description: d.description, condition: d.condition, purchase_price: d.purchase_price, purchase_year: d.purchase_year, category: d.categories?.label ?? '' },
    analysis: d.ai_analysis,
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const user = await getUser(req)
    if (!user) return json({ success: false, error: 'Du må være logget inn' }, 401)
    if (!aiConfigured()) return aiErrorJson('ai_unavailable')

    const raw = (await req.json()) ?? {}
    const english = raw.lang === 'en'
    let body: Record<string, unknown> = raw
    let rawAnalysis: unknown = raw.analysis
    if (typeof raw.item_id === 'string') {
      if (!UUID.test(raw.item_id)) return json({ success: false, error: 'Ugyldig gjenstand' }, 400)
      const item = await loadItem(req, raw.item_id)
      if (!item) return json({ success: false, error: 'Fant ikke gjenstanden' }, 404)
      body = item.body
      rawAnalysis = item.analysis
    }
    const input = readEstimateInput(body)
    if (typeof input === 'string') return json({ success: false, error: input }, 400)
    const analysis = readAnalysis(rawAnalysis)
    const key = analysis?.suggestion.category_key && analysis.suggestion.category_key !== 'other'
      ? analysis.suggestion.category_key : categoryKeyFor(input.category)
    const depreciation = depreciatedValue(key, input.purchasePrice, input.purchaseYear)

    // For lite grunnlag: svar uten å spørre AI-en og uten å bruke av kvoten
    const missing = insufficientWithoutCall(input.title, input.description, analysis, english)
    if (missing) return json({ success: true, data: insufficientResponse(missing, '', analysis) })

    const { denied, quota, usageId } = await claimAiCall(req, user, 'estimate-value')
    if (denied) return denied

    const est = await callStructured({
      fn: 'estimate-value', usageId, effort: 'low', maxTokens: 2000, schemaVersion: VALUATION_VERSION,
      system: valuationSystem(english ? 'English' : 'Norwegian (bokmål)'),
      schema: ESTIMATE_SCHEMA_V2,
      validate: validateEstimateV2,
      content: `${describeItem(toFacts(input), analysis, depreciation?.value ?? null)}

${conditionGuidance(key)}

Give status, low_nok, likely_nok and high_nok as whole NOK amounts (low ≤ likely ≤ high), reasoning, confidence (high, medium or low) and missing.`,
    })

    if (est.status === 'insufficient') return json({ success: true, data: insufficientResponse(est.missing, est.reasoning, analysis), quota })

    const final = finalizeEstimate(est, { condition: input.condition, analysis, hasDescription: !!input.description })
    return json({
      success: true,
      data: {
        v: VALUATION_VERSION,
        status: 'ok',
        price_type: 'estimated_price', // senere også sold_price / asking_price / new_price fra en markedsmotor
        market_area: 'NO',
        currency: 'NOK',
        estimate: { low: final.low, likely: final.likely, high: final.high },
        confidence: final.confidence,
        uncertainty: final.uncertainty,
        basis: { used_analysis: !!analysis, identified: final.identified, category_key: key },
        reasoning: est.reasoning,
        missing: est.missing,
        sources: [],
        model: currentModel(),
        depreciation,
        // Feltene appen har brukt hittil
        market: { low_nok: final.low, likely_nok: final.likely, high_nok: final.high, reasoning: est.reasoning, confidence: final.confidence },
        summary: { low_nok: final.low, likely_nok: final.likely, high_nok: final.high },
      },
      quota,
    })
  } catch (error) {
    return aiErrorResponse(error, 'estimate-value')
  }
})

const toFacts = (i: EstimateInput) => ({
  title: i.title, description: i.description, category: i.category, condition: i.condition,
  purchasePrice: i.purchasePrice, purchaseYear: i.purchaseYear, identifiedModel: i.identifiedModel,
})

const insufficientResponse = (missing: string[], reasoning: string, analysis: Analysis | null) => ({
  v: VALUATION_VERSION, status: 'insufficient', price_type: 'estimated_price', market_area: 'NO', currency: 'NOK',
  estimate: null, missing, reasoning, sources: [], basis: { used_analysis: !!analysis },
})
