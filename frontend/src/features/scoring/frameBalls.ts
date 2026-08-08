const frameCount = 10

export type FrameBallIds = Array<number | null>

function normalizeBallId(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function emptyFrameBallIds(): FrameBallIds {
  return Array.from({ length: frameCount }, () => null)
}

export function parseFrameBallIds(frameData?: string | null): FrameBallIds {
  if (!frameData) return emptyFrameBallIds()
  try {
    const parsed: unknown = JSON.parse(frameData)
    const raw = parsed && typeof parsed === 'object' ? (parsed as { frameBallIds?: unknown }).frameBallIds : undefined
    if (!Array.isArray(raw)) return emptyFrameBallIds()
    return Array.from({ length: frameCount }, (_, index) => normalizeBallId(raw[index]))
  } catch {
    return emptyFrameBallIds()
  }
}

export function addFrameBallIds(frameData: string, frameBallIds: ReadonlyArray<number | null>) {
  try {
    const parsed: unknown = JSON.parse(frameData)
    const base = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    const next = { ...base }
    const normalized = Array.from({ length: frameCount }, (_, index) => normalizeBallId(frameBallIds[index]))
    if (normalized.some((id) => id != null)) next.frameBallIds = normalized
    else delete next.frameBallIds
    return JSON.stringify(next)
  } catch {
    return frameData
  }
}

export function frameBallEntries(frameBallIds: ReadonlyArray<number | null>) {
  return frameBallIds
    .map((ballId, index) => ({ frame: index + 1, ballId }))
    .filter((entry): entry is { frame: number; ballId: number } => entry.ballId != null)
}
