// Inngang for forhåndsrendering (src/seo/vitePlugin.js): rendrer appens første visning for en sti, slik
// nettleseren rendrer den før økten er sjekket (session === undefined, prerendered) – uten innlogging, på norsk.
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from '../App.jsx'
import { PageDataContext } from './pageData.js'

// data: innholdet siden trenger (guidene), det samme som legges i HTML-en for nettleseren (src/seo/pageData.js)
export function render(path, data = null) {
  return renderToString(<PageDataContext.Provider value={data}><StaticRouter location={path}><App prerendered /></StaticRouter></PageDataContext.Provider>)
}
