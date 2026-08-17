const draftPrefix = 'bowlsense:draft:v1:'

interface StoredDraft {
  version: 1
  baseline: string | null
  savedAt: number
  value: unknown
}

export interface LocalDraft<T> {
  savedAt: number
  value: T
}

function storageKey(scope: string) {
  return `${draftPrefix}${scope}`
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredDraft>
  return candidate.version === 1
    && (candidate.baseline === null || typeof candidate.baseline === 'string')
    && typeof candidate.savedAt === 'number'
    && Number.isFinite(candidate.savedAt)
    && 'value' in candidate
}

export function readLocalDraft<T>(
  scope: string,
  baseline: string | null,
  isValue: (value: unknown) => value is T,
): LocalDraft<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(scope))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredDraft(parsed) || parsed.baseline !== baseline || !isValue(parsed.value)) return null
    return { savedAt: parsed.savedAt, value: parsed.value }
  } catch {
    return null
  }
}

export function writeLocalDraft(scope: string, baseline: string | null, value: unknown) {
  if (typeof window === 'undefined') return false
  try {
    const draft: StoredDraft = {
      version: 1,
      baseline,
      savedAt: Date.now(),
      value,
    }
    window.localStorage.setItem(storageKey(scope), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function hasLocalDraft(scope: string, baseline: string | null) {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(storageKey(scope))
    if (!raw) return false
    const parsed: unknown = JSON.parse(raw)
    return isStoredDraft(parsed) && parsed.baseline === baseline
  } catch {
    return false
  }
}

export function clearLocalDraft(scope: string) {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.removeItem(storageKey(scope))
    return true
  } catch {
    return false
  }
}
