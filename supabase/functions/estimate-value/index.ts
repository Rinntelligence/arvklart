// Anslår markedsverdi i NOK for en gjenstand (verdifall + AI-estimat).
// Krever innlogget bruker og teller mot AI-kvoten (demoen: 5 forsøk per besøk). Bruker Claude Haiku.
import { getUser, json, preflight } from '../_shared/http.ts'
import { MODEL, aiErrorResponse, anthropic, claimAiCall, parseJsonReply } from '../_shared/ai.ts'

// Depreciation rates per category
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

// Kategoriene i appen er norske og kan navngis fritt per bo; finn nærmeste tabellnøkkel.
const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/elektronikk|tv|data|telefon/i, 'Electronics'],
  [/møbl|stol|bord|sofa/i, 'Furniture'],
  [/kunst|maleri|bilde/i, 'Art & pictures'],
  [/smykk|\bur\b|klokke|gull|sølv/i, 'Jewelry'],
  [/bok|bøker/i, 'Books'],
  [/kjøkken|porselen|servise|glass/i, 'Kitchen'],
  [/klær|tekstil|tøy/i, 'Clothing & textiles'],
  [/samle|antikk|minne|arvestykke/i, 'Collectibles'],
  [/verktøy/i, 'Tools'],
  [/sport|friluft/i, 'Sports & outdoors'],
  [/dekor|pynt/i, 'Decorations'],
]
const categoryKey = (label = '') => CATEGORY_KEYWORDS.find(([re]) => re.test(label))?.[1] || 'Other'

// Free price sources by category
const PRICE_SOURCES: Record<string, string[]> = {
  'Electronics': ['finn.no', 'prisjakt.no', 'ebay.com'],
  'Furniture': ['finn.no', 'ikea.com', 'ebay.com'],
  'Art & pictures': ['finn.no', 'ebay.com', 'invaluable.com'],
  'Jewelry': ['finn.no', 'ebay.com', 'pricecharting.com'],
  'Collectibles': ['ebay.com', 'pricecharting.com', 'finn.no'],
  'Books': ['finn.no', 'ebay.com', 'bokkilden.no'],
  'Other': ['finn.no', 'ebay.com'],
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const user = await getUser(req)
    if (!user) return json({ success: false, error: 'Du må være logget inn' }, 401)

    const { title, description, category, condition, purchase_price, purchase_year, ai_identified_model } = await req.json()
    if (typeof title !== 'string' || !title.trim()) return json({ success: false, error: 'Mangler navn på gjenstanden' }, 400)
    const key = categoryKey(category)

    const { denied, quota } = await claimAiCall(req, user, 'estimate-value')
    if (denied) return denied

    // 1. Depreciation calc if we have purchase data
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

    // 2. AI-estimat av markedsverdi
    const message = await anthropic().messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are an expert Norwegian estate appraiser. Estimate the current Norwegian market value (in NOK) for this item.

Item: ${title}
Description: ${description || 'No description'}
Category: ${category}
Condition: ${condition || 'good'}
${ai_identified_model ? `AI identified as: ${ai_identified_model}` : ''}
${purchase_price ? `Original price: ${purchase_price} NOK (${purchase_year})` : ''}

Use your knowledge of:
- Current Norwegian second-hand market (finn.no prices)
- Typical depreciation for this category
- The specific model/brand if identifiable
- Condition impact

Respond ONLY with this JSON (no other text):
{
  "low_nok": <number>,
  "high_nok": <number>,
  "likely_nok": <number>,
  "reasoning": "2 sentences max explaining the estimate",
  "market_references": ["e.g. Similar Samsung TV on finn.no: 1500-2500 kr", "eBay completed listings: $150-200"],
  "price_check_urls": ["https://www.finn.no/bap/forsale/search.html?q=SEARCH_TERM", "https://www.ebay.com/sch/i.html?_nkw=SEARCH_TERM"],
  "estimated_year": "e.g. 2018-2020",
  "confidence": "high|medium|low",
  "category_trend": "appreciating|stable|depreciating"
}`
        }]
    })
    const aiEstimate = parseJsonReply(message)

    // Fill in search URLs with actual item title
    const searchTerm = encodeURIComponent(title.split(' ').slice(0, 4).join(' '))
    aiEstimate.price_check_urls = [
      `https://www.finn.no/bap/forsale/search.html?q=${searchTerm}`,
      `https://www.ebay.com/sch/i.html?_nkw=${searchTerm}&LH_Sold=1&LH_Complete=1`,
    ]

    const sources = PRICE_SOURCES[key] || PRICE_SOURCES['Other']

    return json({
      success: true,
      data: {
        depreciation: depreciationEstimate,
        market: aiEstimate,
        price_sources: sources,
        summary: {
          low_nok: aiEstimate.low_nok,
          high_nok: aiEstimate.high_nok,
          likely_nok: aiEstimate.likely_nok,
        }
      },
      quota,
    })
  } catch (error) {
    return aiErrorResponse(error, 'estimate-value')
  }
})
