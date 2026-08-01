export interface StoredFrame {
  ball1?: number | null
  ball2?: number | null
  ball3?: number | null
}

function isRoll(value: unknown): value is number | null | undefined {
  return value == null || typeof value === 'number'
}

function toStoredFrame(value: unknown): StoredFrame {
  if (typeof value !== 'object' || value === null) return {}
  const candidate = value as Record<string, unknown>
  return {
    ball1: isRoll(candidate.ball1) ? candidate.ball1 : undefined,
    ball2: isRoll(candidate.ball2) ? candidate.ball2 : undefined,
    ball3: isRoll(candidate.ball3) ? candidate.ball3 : undefined,
  }
}

function readStoredFrames(frameData?: string | null): StoredFrame[] | null {
  if (!frameData) return null
  try {
    const parsed: unknown = JSON.parse(frameData)
    const frames = typeof parsed === 'object' && parsed !== null && 'frames' in parsed
      ? (parsed as { frames?: unknown }).frames
      : undefined
    return Array.isArray(frames) ? frames.map(toStoredFrame) : []
  } catch {
    return null
  }
}

function rollMark(roll: number | null | undefined) {
  if (roll == null) return ''
  if (roll === 10) return 'X'
  if (roll === 0) return '-'
  return String(roll)
}

function frameMark(frame: StoredFrame, index: number) {
  const { ball1, ball2, ball3 } = frame
  if (index < 9) {
    if (ball1 === 10) return 'X'
    if (ball1 == null) return ''
    if (ball2 == null) return rollMark(ball1)
    return ball1 + ball2 === 10 ? `${rollMark(ball1)}/` : `${rollMark(ball1)}${rollMark(ball2)}`
  }

  const second = ball2 != null
    ? (ball1 !== 10 && ball1 != null && ball1 + ball2 === 10 ? '/' : rollMark(ball2))
    : ''
  const third = ball3 != null
    ? (ball1 === 10 && ball2 != null && ball2 < 10 && ball2 + ball3 === 10 ? '/' : rollMark(ball3))
    : ''
  return `${rollMark(ball1)}${second}${third}`
}

export function parseFrameMarks(frameData?: string | null): string[] {
  return readStoredFrames(frameData)?.map(frameMark) ?? []
}

export function formatFrameMarks(frameData?: string | null): string | null {
  const frames = readStoredFrames(frameData)
  return frames ? frames.map(frameMark).filter(Boolean).join(' ') : null
}
