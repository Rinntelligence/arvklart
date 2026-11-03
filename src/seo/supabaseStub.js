// Erstatter @supabase/supabase-js under forhåndsrendering (src/seo/vitePlugin.js): ingen nettverk og ingen
// miljøvariabler. Bruker noe Supabase under selve renderingen, feiler bygget med en tydelig melding (Supabase
// skal bare brukes i effekter og hendelser, som ikke kjører på serveren).
const fail = (key) => { throw new Error(`Supabase brukes under forhåndsrendering (${String(key)}). Flytt kallet til en effekt.`) }
export const createClient = () => new Proxy({}, { get: (_, key) => fail(key) })
