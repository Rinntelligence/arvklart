// Inngang for forhåndsrendering (src/seo/vitePlugin.js): rendrer appens første visning for en sti, slik
// nettleseren rendrer den før økten er sjekket (session === undefined, prerendered) – uten innlogging, på norsk.
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from '../App.jsx'

export function render(path) {
  return renderToString(<StaticRouter location={path}><App prerendered /></StaticRouter>)
}
