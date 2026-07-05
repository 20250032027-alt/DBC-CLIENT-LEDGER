import { createContext, useContext, useState, useEffect } from 'react'

const KEY = 'dbc-ledger-theme'
const ThemeContext = createContext({ theme: 'light', toggle: () => {} })

function getStored() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getStored)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])

  function toggle() { setTheme(t => (t === 'dark' ? 'light' : 'dark')) }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
