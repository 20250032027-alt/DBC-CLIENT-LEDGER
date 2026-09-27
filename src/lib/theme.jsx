import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { deriveAccentShades } from './colorUtils'

const THEME_KEY = 'dbc-ledger-theme' // 'light' | 'dark'
const DARK_VARIANT_KEY = 'dbc-ledger-dark-variant' // 'standard' | 'true-black'
const CONTRAST_KEY = 'dbc-ledger-contrast' // 'normal' | 'high'
const ACCENT_PRESET_KEY = 'dbc-ledger-accent-preset' // 'blue' | 'green' | 'amber' | 'purple' | 'custom'
const CUSTOM_ACCENT_KEY = 'dbc-ledger-custom-accent' // hex string
const SIDEBAR_KEY = 'dbc-ledger-sidebar' // 'expanded' | 'collapsed'
const DENSITY_KEY = 'dbc-ledger-density' // 'compact' | 'standard' | 'comfortable'

// Every preset is just one base hex — deriveAccentShades() computes the
// full coordinated set (dim/hover/glow/subtle/text) from it, the exact
// same path a custom color goes through. A preset isn't a shortcut that
// skips the safety math; it's just a pre-picked base color.
export const ACCENT_PRESETS = {
  blue: { label: 'Slate Blue', hex: '#4f72f5' },
}

function readStored(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v || fallback
  } catch { return fallback }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

const PreferencesContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStored(THEME_KEY, 'light') === 'dark' ? 'dark' : 'light')
  const [darkVariant, setDarkVariantState] = useState(() => readStored(DARK_VARIANT_KEY, 'standard') === 'true-black' ? 'true-black' : 'standard')
  const [contrast, setContrastState] = useState(() => readStored(CONTRAST_KEY, 'high') === 'normal' ? 'normal' : 'high')
  const [accentPreset, setAccentPresetState] = useState(() => {
    const v = readStored(ACCENT_PRESET_KEY, 'blue')
    return (v === 'custom' || ACCENT_PRESETS[v]) ? v : 'blue'
  })
  const [customAccent, setCustomAccentState] = useState(() => readStored(CUSTOM_ACCENT_KEY, '#4f72f5'))
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() => readStored(SIDEBAR_KEY, 'expanded') === 'collapsed')
  const [density, setDensityState] = useState(() => {
    const v = readStored(DENSITY_KEY, 'standard')
    return (v === 'compact' || v === 'comfortable') ? v : 'standard'
  })

  // Apply theme/variant/contrast as data-attributes — same mechanism the
  // existing light/dark switch already used, just with two more
  // dimensions added alongside it.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-dark-variant', theme === 'dark' ? darkVariant : 'standard')
    document.documentElement.setAttribute('data-contrast', contrast)
    document.documentElement.setAttribute('data-density', density)
  }, [theme, darkVariant, contrast, density])

  // Apply the accent color by setting CSS custom properties directly —
  // inline-set custom properties on :root override both the base :root
  // block AND the [data-theme="dark"] block in the stylesheet, so this
  // correctly layers on top of whichever base theme is active.
  const accentHex = accentPreset === 'custom' ? customAccent : (ACCENT_PRESETS[accentPreset]?.hex || ACCENT_PRESETS.blue.hex)
  useEffect(() => {
    const shades = deriveAccentShades(accentHex, theme)
    const root = document.documentElement.style
    root.setProperty('--accent', shades.accent)
    root.setProperty('--accent-dim', shades.accentDim)
    root.setProperty('--accent-hover', shades.accentHover)
    root.setProperty('--accent-glow', shades.accentGlow)
    root.setProperty('--accent-subtle', shades.accentSubtle)
    root.setProperty('--accent-text', shades.accentText)
  }, [accentHex, theme])

  function setTheme(t) { setThemeState(t); writeStored(THEME_KEY, t) }
  function toggle() { setTheme(theme === 'dark' ? 'light' : 'dark') }
  function setDarkVariant(v) { setDarkVariantState(v); writeStored(DARK_VARIANT_KEY, v) }
  function setContrast(c) { setContrastState(c); writeStored(CONTRAST_KEY, c) }
  function setAccentPreset(p) { setAccentPresetState(p); writeStored(ACCENT_PRESET_KEY, p) }
  function setCustomAccent(hex) { setCustomAccentState(hex); writeStored(CUSTOM_ACCENT_KEY, hex) }
  function setSidebarCollapsed(v) { setSidebarCollapsedState(v); writeStored(SIDEBAR_KEY, v ? 'collapsed' : 'expanded') }
  function toggleSidebarCollapsed() { setSidebarCollapsed(!sidebarCollapsed) }
  function setDensity(d) { setDensityState(d); writeStored(DENSITY_KEY, d) }

  const value = useMemo(() => ({
    theme, toggle, setTheme,
    darkVariant, setDarkVariant,
    contrast, setContrast,
    accentPreset, setAccentPreset,
    customAccent, setCustomAccent,
    accentHex,
    sidebarCollapsed, setSidebarCollapsed, toggleSidebarCollapsed,
    density, setDensity,
  }), [theme, darkVariant, contrast, accentPreset, customAccent, accentHex, sidebarCollapsed, density])

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function useTheme() {
  return useContext(PreferencesContext)
}
