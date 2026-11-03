// Inngangene til nettstedet (se docs/seo-migrering-forside-til-rot.md):
//  - «/» er den offentlige forsiden (forhåndsrendret og indekserbar).
//  - APP_HOME («/app») er inngangen til appen for innloggede (bo-listen). Bo-sidene ligger fortsatt på /estate/…
// En innlogget som åpner «/» direkte (bokmerke, lenke i e-post), sendes videre til APP_HOME. Vil appen vise forsiden
// for en innlogget («Tilbake til hjemmesiden»), navigerer den til «/» med LANDING_STATE.
export const APP_HOME = '/app'
export const HOME = '/'
export const LANDING_STATE = { landing: true }
