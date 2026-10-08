// Anslår markedsverdi i NOK. Henter live Finn.no-priser som kontekst til AI-estimatet.
// Krever innlogget bruker og teller mot AI-kvoten. Bruker Claude Haiku.
import { getUser, json, preflight } from '../_shared/http.ts'
import { MODEL, aiErrorResponse, anthropic, claimAiCall, parseJsonReply } from '../_shared/ai.ts'

const DEPRECIATION_RATES: Record<string, number> = {
  'Electronics': 0.30, 'Furniture': 0.08, 'Art & pictures': 0.02,
  'Jewelry': 0.03, 'Books': 0.10, 'Kitchen': 0.12,
  'Clothing & textiles': 0.20, 'Collectibles': -0.03,
  'Tools': 0.10, 'Sports & outdoors': 0.15, 'Decorations': 0.08, 'Other': 0.12,
}
const VALUE_FLOORS: Record<string, number> = {
  'Electronics': 0.05, 'Furniture': 0.20, 'Art & pictures': 0.30,
  'Jewelry': 0.40, 'Collectibles': 0.50, 'Other': 0.10,
}

const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/elektronikk|tv|data|telefon|pc|laptop/i, 'Electronics'],
  [/møbl|stol|bord|sofa|skap|hylle|seng/i, 'Furniture'],
  [/kunst|maleri|bilde|fotografi|skulptur/i, 'Art & pictures'],
  [/smykk|klokke|gull|sølv|ring|armbånd/i, 'Jewelry'],
  [/bok|bøker/i, 'Books'],
  [/kjøkken|porselen|servise|glass|bestikk/i, 'Kitchen'],
  [/klær|tekstil|tøy|jakke|bukse/i, 'Clothing & textiles'],
  [/samle|antikk|minne|arvestykke|vintage/i, 'Collectibles'],
  [/verktøy/i, 'Tools'],
  [/sport|friluft|sykkel|ski/i, 'Sports & outdoors'],
  [/dekor|pynt/i, 'Decorations'],
]
const categoryKey = (label = '') => CATEGORY_KEYWORDS.find(([re]) => re.test(label))?.[1] || 'Other'

// Henter live Finn.no-søkeresultater fra Next.js-dataene i HTML-en
async function searchFinnNo(query: string): Promise<{ prices: number[]; items: string[] }> {
  try {
    const url = `https://www.finn.no/bap/forsale/search.html?q=${encodeURIComponent(query)}&sort=RELEVANCE`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'no-NO,no;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { prices: [], items: [] }
    const html = await res.text()

    // Finn.no er en Next.js-app — all søkedata ligger i __NEXT_DATA__
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!match) return { prices: [], items: [] }

    const data = JSON.parse(match[1])
    // Prøv kjente stier i Next.js-strukturen
    const docs: Record<string, unknown>[] =
      data?.props?.pageProps?.search?.docs ??
      data?.props?.pageProps?.initialProps?.docs ??
      data?.props?.pageProps?.result?.docs ??
      []

    const prices: number[] = []
    const items: string[] = []
    for (const doc of docs.slice(0, 8)) {
      const p =
        (doc.price as Record<string, number> | undefined)?.amount ??
        (doc.price as Record<string, number> | undefined)?.total ??
        (typeof doc.price === 'number' ? doc.price : undefined)
      if (typeof p === 'number' && p > 50) prices.push(p)
      const heading = doc.heading ?? doc.title ?? doc.ad_heading
      if (typeof heading === 'string' && heading) {
        items.push(p ? `${heading} – ${p.toLocaleString('no-NO')} kr` : heading)
      }
    }
    return { prices, items }
  } catch {
    return { prices: [], items: [] }
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const user = await getUser(req)
    if (!user) return json({ success: false, error: 'Du må være logget inn' }, 401)

    const { title, description, category, condition, purchase_price, purchase_year, lang } = await req.json()
    const language = lang === 'en' ? 'English' : 'Norwegian (bokmål)'
    if (typeof title !== 'string' || !title.trim()) return json({ success: false, error: 'Mangler navn på gjenstanden' }, 400)

    const key = categoryKey(category)

    const { denied, quota } = await claimAiCall(req, user, 'estimate-value')
    if (denied) return denied

    // 1. Avskrivningsberegning hvis kjøpspris og år er oppgitt
    let depreciationEstimate = null
    if (purchase_price && purchase_year) {
      const yearsOld = new Date().getFullYear() - parseInt(purchase_year)
      const rate = DEPRECIATION_RATES[key] ?? 0.12
      const floor = VALUE_FLOORS[key] ?? 0.10
      const depreciated = purchase_price * Math.pow(1 - rate, yearsOld)
      depreciationEstimate = {
        value: Math.max(depreciated, purchase_price * floor),
        years_old: yearsOld,
        rate_used: rate,
        original_price: purchase_price,
      }
    }

    // 2. Hent live Finn.no-priser (beste innsats — feiler stille)
    const searchQuery = title.split(' ').slice(0, 5).join(' ')
    const finnData = await searchFinnNo(searchQuery)
    const hasFinnData = finnData.prices.length > 0

    const finnSection = hasFinnData
      ? `\nAktuelle Finn.no-annonser for lignende gjenstander:\n${finnData.items.map(i => `  • ${i}`).join('\n')}\nPrisspenn observert: ${Math.min(...finnData.prices).toLocaleString('no-NO')}–${Math.max(...finnData.prices).toLocaleString('no-NO')} kr (${finnData.prices.length} treff)`
      : `\n(Ingen Finn.no-treff for "${searchQuery}" — basér deg på kjennskap til norsk bruktmarked)`

    // 3. AI-estimat med all tilgjengelig kontekst
    const message = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Du er en erfaren takstmann for bruktgjenstander i Norge. Anslå nåværende markedsverdi i NOK.

GJENSTAND
Tittel: ${title}
Beskrivelse: ${description || '(ingen beskrivelse)'}
Kategori: ${category || '(ukjent)'}
Tilstand: ${condition || 'god'}
${purchase_price ? `Kjøpspris: ${Number(purchase_price).toLocaleString('no-NO')} kr (${purchase_year ?? 'ukjent år'})` : ''}
${depreciationEstimate ? `Beregnet avskrivningsverdi: ca. ${Math.round(depreciationEstimate.value).toLocaleString('no-NO')} kr` : ''}
${finnSection}

INSTRUKSJONER
1. Identifiser merke, modell og alder hvis mulig fra tittel/beskrivelse.
2. Bruk Finn.no-dataene over som primær referanse for prisnivå — de er ferske og norske.
3. Juster for tilstand: excellent +20%, good ±0%, fair −30%, poor −50%.
4. Gi et realistisk intervall — ikke for bredt (ikke 500–10 000 kr for én gjenstand).
5. Skriv begrunnelse og markedsreferanser på ${language}.

Svar KUN med denne JSON-strukturen:
{
  "low_nok": <heltall>,
  "likely_nok": <heltall>,
  "high_nok": <heltall>,
  "reasoning": "Maks 2 setninger: hva er gjenstanden, og hva begrunner prisnivået",
  "market_references": ["Konkret referanse 1, f.eks. 'Tilsvarende på Finn.no: 1 500–2 500 kr'", "Referanse 2"],
  "confidence": "high|medium|low",
  "category_trend": "appreciating|stable|depreciating",
  "finn_data_used": ${hasFinnData}
}`
      }]
    })

    const aiEstimate = parseJsonReply(message)
    const searchTerm = encodeURIComponent(searchQuery)

    return json({
      success: true,
      data: {
        depreciation: depreciationEstimate,
        market: {
          ...aiEstimate,
          price_check_urls: [
            `https://www.finn.no/bap/forsale/search.html?q=${searchTerm}`,
            `https://www.ebay.com/sch/i.html?_nkw=${searchTerm}&LH_Sold=1&LH_Complete=1`,
          ],
        },
        finn_live_prices: hasFinnData ? finnData.prices : null,
        summary: {
          low_nok: aiEstimate.low_nok,
          high_nok: aiEstimate.high_nok,
          likely_nok: aiEstimate.likely_nok,
        },
      },
      quota,
    })
  } catch (error) {
    return aiErrorResponse(error, 'estimate-value')
  }
})
