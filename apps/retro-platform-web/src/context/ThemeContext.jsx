import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'op_theme'

const ThemeContext = createContext(null)

function systemPreference() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  // null means "follow the OS setting" — only becomes an explicit value once
  // the user actually toggles it.
  const [override, setOverride] = useState(() => localStorage.getItem(STORAGE_KEY))
  const [systemTheme, setSystemTheme] = useState(systemPreference)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setSystemTheme(e.matches ? 'dark' : 'light')
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (override) {
      localStorage.setItem(STORAGE_KEY, override)
      document.documentElement.setAttribute('data-theme', override)
    } else {
      localStorage.removeItem(STORAGE_KEY)
      document.documentElement.removeAttribute('data-theme')
    }
  }, [override])

  const theme = override || systemTheme

  function toggleTheme() {
    setOverride(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
