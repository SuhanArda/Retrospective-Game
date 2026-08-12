import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { buildContentSecurityPolicy } from './src/security/contentSecurityPolicy'

/**
 * The CSP has to know the room API's address, which is configuration rather
 * than a constant, so it is stamped into index.html at build time instead of
 * being hard-coded there.
 */
function contentSecurityPolicy(apiUrl) {
  return {
    name: 'inject-content-security-policy',
    transformIndexHtml(html) {
      return html.replace('%CONTENT_SECURITY_POLICY%', buildContentSecurityPolicy(apiUrl))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // import.meta.dirname keeps this independent of where the command was run
  // from, and avoids reaching for Node globals in a config ESLint lints as
  // browser code.
  const env = loadEnv(mode, import.meta.dirname, '')
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_API_URL || 'http://localhost:5281')],
  }
})
