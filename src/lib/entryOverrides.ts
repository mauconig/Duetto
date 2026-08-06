import type { Album } from '../types'

const OVERRIDES_KEY = 'duette-entry-overrides'

export function loadOverrides(): Record<string, Album> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Album>) : {}
  } catch {
    return {}
  }
}

export function saveOverrides(overrides: Record<string, Album>) {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides))
}
