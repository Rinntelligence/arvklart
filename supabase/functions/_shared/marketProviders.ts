// M2-A: leverandøruavhengig adapter for automatiske markedskilder. Ren modul, testes i Node med en
// simulert leverandør (test/functions/marketProviders.test.js).
//
// Ingen kilder er koblet på: configuredProviders() er tom til en kilde har gitt skriftlig tilgang (FINN,
// Tradera, Auctionet eller Blomqvist). Da legges én leverandør til her, uten andre endringer i
// estimate-value. Ingen hurtigbuffer før vilkårene for den aktuelle kilden er kjent.
import type { Reference } from './market.ts'

export type MarketProvider = {
  id: string // f.eks. 'tradera'; settes på hver referanse
  label: string
  attribution: string // kildehenvisningen vilkårene krever
  canStore: boolean // om treff kan lagres i ai_analysis.valuation (ellers bare vises)
  soldPricesVerified: boolean // om kilden selv bekrefter at salgspriser er faktiske salg
  search(query: string, opts: { signal: AbortSignal }): Promise<Reference[]>
}

export type FetchResult = { references: Reference[]; errors: { provider: string; message: string }[]; calls: number }

// Ingen automatiske kilder før tilgang er avklart skriftlig
export const configuredProviders = (): MarketProvider[] => []

const isRef = (r: unknown): r is Reference => {
  const x = r as Record<string, unknown>
  return !!x && typeof x.title === 'string' && x.title.trim().length > 0 && typeof x.price === 'number' && Number.isFinite(x.price) && x.price > 0
    && (x.price_type === 'sold_price' || x.price_type === 'asking_price' || x.price_type === 'new_price')
}

// Henter referanser fra leverandørene for søkene (høyst maxCalls kall totalt, hvert med tidsgrense).
// En leverandør som feiler eller er treg, stopper ikke de andre; feilen rapporteres. Hver referanse
// merkes med leverandøren, og «verified» settes bare når leverandøren bekrefter salgspriser.
export async function fetchReferences(providers: MarketProvider[], queries: string[], { timeoutMs = 4000, maxCalls = 2 } = {}): Promise<FetchResult> {
  const references: Reference[] = []
  const errors: FetchResult['errors'] = []
  let calls = 0
  for (const p of providers) {
    for (const q of queries) {
      if (calls >= maxCalls) break
      calls++
      const ctrl = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { ctrl.abort(); reject(new Error('tidsavbrudd')) }, timeoutMs) })
        const found = await Promise.race([p.search(q, { signal: ctrl.signal }), timeout])
        for (const r of Array.isArray(found) ? found : []) {
          if (!isRef(r)) continue
          references.push({
            provider: p.id, url: typeof r.url === 'string' ? r.url : null, title: r.title.trim().slice(0, 200), price: Math.round(r.price),
            currency: typeof r.currency === 'string' ? r.currency : 'NOK', price_type: r.price_type,
            date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date.slice(0, 10) : null,
            verified: p.soldPricesVerified && r.price_type === 'sold_price',
          })
        }
      } catch (e) {
        errors.push({ provider: p.id, message: e instanceof Error ? e.message : String(e) })
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
  }
  return { references, errors, calls }
}
