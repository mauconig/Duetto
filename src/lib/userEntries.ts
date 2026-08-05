import type { Album } from '../types'

const ENTRIES_KEY = 'duette-user-entries'

export function loadUserEntries(): Album[] {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY)
    return raw ? (JSON.parse(raw) as Album[]) : []
  } catch {
    return []
  }
}

export function saveUserEntries(entries: Album[]) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries))
}
