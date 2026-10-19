import { useCallback, useEffect, useState } from 'react'

import { isDaylight } from './sun'

/**
 * Light during daylight, dark after sunset — decided on this device, with no
 * network call and no flicker between pages. The glyph button cycles
 * auto → light → dark and the manual choice is remembered; "auto" resumes
 * following the sun.
 */
export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'x211-theme-mode'
const MODES: readonly ThemeMode[] = ['auto', 'light', 'dark']

/** How often auto mode re-checks the clock, so sunset flips without a reload. */
const RECHECK_MS = 30_000

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
}

export function readThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isThemeMode(stored) ? stored : 'auto'
  } catch {
    // Storage can be blocked; auto is a safe default.
    return 'auto'
  }
}

export function resolveTheme(mode: ThemeMode, now = new Date()): ResolvedTheme {
  if (mode !== 'auto') return mode
  return isDaylight(now) ? 'light' : 'dark'
}

export function applyTheme(mode: ThemeMode, now = new Date()): ResolvedTheme {
  const resolved = resolveTheme(mode, now)
  document.documentElement.dataset.theme = resolved
  return resolved
}

/**
 * Called from `main.tsx` before React mounts, so the first paint is already in
 * the right palette instead of flashing the wrong one.
 */
export function applyStoredTheme(): void {
  applyTheme(readThemeMode())
}

export interface ThemeState {
  mode: ThemeMode
  resolved: ResolvedTheme
  cycle: () => void
}

export function useTheme(): ThemeState {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode)
  const [now, setNow] = useState(() => new Date())

  // Only auto mode needs a ticking clock; the interval stops when it is pinned.
  useEffect(() => {
    if (mode !== 'auto') return
    const timer = window.setInterval(() => setNow(new Date()), RECHECK_MS)
    return () => window.clearInterval(timer)
  }, [mode])

  const resolved = resolveTheme(mode, now)

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  const cycle = useCallback(() => {
    setMode((current) => {
      const next = MODES[(MODES.indexOf(current) + 1) % MODES.length]
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Not persisted, but the visit still behaves correctly.
      }
      applyTheme(next)
      return next
    })
  }, [])

  return { mode, resolved, cycle }
}
