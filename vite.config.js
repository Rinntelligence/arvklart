import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import seo from './src/seo/vitePlugin.js'

// seo: metadata i index.html og forhåndsrendering av offentlige sider (se src/seo/pages.js)
export default defineConfig({ plugins: [react(), seo()] })
