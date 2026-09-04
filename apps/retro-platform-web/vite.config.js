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
      return html.replace(
        '%CONTENT_SECURITY_POLICY%',
        buildContentSecurityPolicy(apiUrl),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // import.meta.dirname keeps this independent of where the command was run
  // from, and avoids reaching for Node globals in a config ESLint lints as
  // browser code.
  const env = loadEnv(mode, import.meta.dirname, '')
  const isProductionBuild = command === 'build' && mode === 'production'
  const publicValue = (name, developmentValue) => {
    const value = env[name] || (mode !== 'production' ? developmentValue : '')
    if (isProductionBuild && !value) {
      throw new Error(`Missing required build-time environment variable: ${name}`)
    }
    if (isProductionBuild && value) {
      try {
        if (new URL(value).protocol !== 'https:') throw new Error()
      } catch {
        throw new Error(`${name} must be an absolute HTTPS URL for a production build`)
      }
    }
    return JSON.stringify(value)
  }
  return {
    plugins: [
      react(),
      contentSecurityPolicy(
        env.VITE_API_URL || (mode !== 'production' ? 'http://localhost:5281' : undefined),
      ),
    ],
    define: {
      'import.meta.env.VITE_API_URL': publicValue('VITE_API_URL', 'http://localhost:5281'),
      'import.meta.env.VITE_RETRO_RUSH_URL': publicValue('VITE_RETRO_RUSH_URL', 'http://localhost:5174'),
      'import.meta.env.VITE_SPIN_THE_BOTTLE_URL': publicValue('VITE_SPIN_THE_BOTTLE_URL', 'http://localhost:5175'),
      'import.meta.env.VITE_RUS_RULETI_URL': publicValue('VITE_RUS_RULETI_URL', 'http://localhost:5176'),
      'import.meta.env.VITE_DRAW_AND_GUESS_URL': publicValue('VITE_DRAW_AND_GUESS_URL', 'http://localhost:5177'),
      'import.meta.env.VITE_IMPOSTER_URL': publicValue('VITE_IMPOSTER_URL', 'http://localhost:5178'),
      'import.meta.env.VITE_TANK_BATTLE_URL': publicValue('VITE_TANK_BATTLE_URL', 'http://localhost:5179'),
      'import.meta.env.VITE_HIDE_AND_SEEK_URL': publicValue('VITE_HIDE_AND_SEEK_URL', 'http://localhost:5180'),
      'import.meta.env.VITE_WHEEL_OF_FORTUNE_URL': publicValue('VITE_WHEEL_OF_FORTUNE_URL', 'http://localhost:5181'),
    },
  }
})
