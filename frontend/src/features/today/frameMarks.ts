import type { FrameState } from '../../design'

type FrameRecord = {
  ball1?: number | null
  ball2?: number | null
  ball3?: number | null
  cumulative?: number | null
}

export interface ParsedRibbonFrame {
  rolls: readonly string[]
  score: number | null
  state: FrameState
  label: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function roll(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function mark(value: number | null) {
  if (value === null) return ''
  if (value === 10) return 'X'
  if (value === 0) return '–'
  return String(value)
}

function toFrame(value: unknown): FrameRecord | null {
  if (!isRecord(value)) return null
  return {
    ball1: roll(value.ball1),
    ball2: roll(value.ball2),
    ball3: roll(value.ball3),
    cumulative: roll(value.cumulative),
  }
}

function frameRolls(frame: FrameRecord, index: number) {
  const ball1 = frame.ball1 ?? null
  const ball2 = frame.ball2 ?? null
  const ball3 = frame.ball3 ?? null

  if (index < 9) {
    if (ball1 === 10) return ['X']
    if (ball1 === null) return []
    if (ball2 === null) return [mark(ball1)]
    return ball1 + ball2 === 10 ? [mark(ball1), '/'] : [mark(ball1), mark(ball2)]
  }

  const second = ball2 === null
    ? ''
    : ball1 !== 10 && ball1 !== null && ball1 + ball2 === 10
      ? '/'
      : mark(ball2)
  const third = ball3 === null
    ? ''
    : ball1 === 10 && ball2 !== null && ball2 < 10 && ball2 + ball3 === 10
      ? '/'
      : mark(ball3)
  return [mark(ball1), second, third].filter(Boolean)
}

function frameState(frame: FrameRecord | null): ParsedRibbonFrame['state'] {
  if (!frame || frame.ball1 === null || frame.ball1 === undefined) return 'pending'
  if (frame.ball1 === 10) return 'strike'
  if (frame.ball2 === null || frame.ball2 === undefined) return 'partial'
  if (frame.ball1 + frame.ball2 === 10) return 'spare'
  return 'open'
}

function emptyFrames(): ParsedRibbonFrame[] {
  return Array.from({ length: 10 }, (_, index) => ({
    rolls: [],
    score: null,
    state: 'pending',
    label: String(index + 1),
  }))
}

export function parseFrameRibbonFrames(frameData: string | null | undefined): ParsedRibbonFrame[] {
  const empty = emptyFrames()
  if (!frameData) return empty

  try {
    const parsed: unknown = JSON.parse(frameData)
    if (!isRecord(parsed) || !Array.isArray(parsed.frames)) return empty
    const frames = parsed.frames
    return empty.map((_, index) => {
      const frame = toFrame(frames[index])
      return {
        rolls: frame ? frameRolls(frame, index) : [],
        score: frame?.cumulative ?? null,
        state: frameState(frame),
        label: String(index + 1),
      }
    })
  } catch {
    return empty
  }
}
