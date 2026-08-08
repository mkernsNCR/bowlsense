export const laneFeelOptions = [
  { value: 'fresh', label: 'Fresh' },
  { value: 'transitioning', label: 'Transitioning' },
  { value: 'drying', label: 'Drying' },
] as const

export const reactionOptions = [
  { value: 'flush', label: 'Still flush' },
  { value: 'high', label: 'Going high' },
  { value: 'light', label: 'Going light' },
  { value: 'flat-10', label: 'Flat 10s' },
] as const

export const adjustmentOptions = [
  { value: 'stayed', label: 'Stayed put' },
  { value: 'moved-feet', label: 'Moved feet' },
  { value: 'ball-down', label: 'Ball down' },
  { value: 'ball-up', label: 'Ball up' },
] as const

export const leaveOptions = [
  { value: '10-pin', label: '10-pin' },
  { value: 'flat-10', label: 'Flat 10' },
  { value: '4-pin', label: '4-pin' },
  { value: '9-pin', label: '9-pin' },
  { value: 'bucket', label: 'Bucket' },
  { value: '2-pin', label: '2-pin' },
  { value: 'split', label: 'Split' },
] as const

export type LaneFeel = typeof laneFeelOptions[number]['value']
export type Reaction = typeof reactionOptions[number]['value']
export type Adjustment = typeof adjustmentOptions[number]['value']
export type Leave = typeof leaveOptions[number]['value']

export interface LaneNotes {
  laneFeel?: LaneFeel
  reaction?: Reaction
  reactionFrame?: number
  adjustment?: Adjustment
  moveBoards?: number
  ballChangeFrame?: number
  speed?: number
  leave?: Leave
  startBoard?: number
  endBoard?: number
}

function isOption<T extends string>(options: ReadonlyArray<{ value: T }>, value: unknown): value is T {
  return typeof value === 'string' && options.some((option) => option.value === value)
}

function optionalFrame(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10 ? value : undefined
}

function optionalBoard(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 40 ? value : undefined
}

function optionalMoveBoards(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10 ? value : undefined
}

function optionalSpeed(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 10 && value <= 30 ? value : undefined
}

export function parseLaneNotes(frameData?: string | null): LaneNotes {
  if (!frameData) return {}
  try {
    const parsed: unknown = JSON.parse(frameData)
    if (!parsed || typeof parsed !== 'object') return {}
    const raw = (parsed as { laneNotes?: unknown }).laneNotes
    if (!raw || typeof raw !== 'object') return {}
    const notes = raw as Record<string, unknown>
    const reaction = isOption(reactionOptions, notes.reaction) ? notes.reaction : undefined
    const adjustment = isOption(adjustmentOptions, notes.adjustment) ? notes.adjustment : undefined
    return {
      laneFeel: isOption(laneFeelOptions, notes.laneFeel) ? notes.laneFeel : undefined,
      reaction,
      reactionFrame: reaction && reaction !== 'flush' ? optionalFrame(notes.reactionFrame) : undefined,
      adjustment,
      moveBoards: adjustment === 'moved-feet' ? optionalMoveBoards(notes.moveBoards) : undefined,
      ballChangeFrame: adjustment === 'ball-down' || adjustment === 'ball-up'
        ? optionalFrame(notes.ballChangeFrame)
        : undefined,
      speed: optionalSpeed(notes.speed),
      leave: isOption(leaveOptions, notes.leave) ? notes.leave : undefined,
      startBoard: optionalBoard(notes.startBoard),
      endBoard: optionalBoard(notes.endBoard),
    }
  } catch {
    return {}
  }
}

export function hasLaneNotes(notes: LaneNotes) {
  return Object.values(notes).some((value) => value != null)
}

export function addLaneNotes(frameData: string, notes: LaneNotes) {
  try {
    const parsed: unknown = JSON.parse(frameData)
    const base = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    const next = { ...base }
    if (hasLaneNotes(notes)) next.laneNotes = notes
    else delete next.laneNotes
    return JSON.stringify(next)
  } catch {
    return frameData
  }
}

function labelFor<T extends string>(options: ReadonlyArray<{ value: T; label: string }>, value?: T) {
  return options.find((option) => option.value === value)?.label
}

export function laneNoteBadges(notes: LaneNotes) {
  const badges: string[] = []
  const feel = labelFor(laneFeelOptions, notes.laneFeel)
  const reaction = labelFor(reactionOptions, notes.reaction)
  const adjustment = labelFor(adjustmentOptions, notes.adjustment)
  const leave = labelFor(leaveOptions, notes.leave)
  if (feel) badges.push(feel)
  if (reaction) badges.push(`${reaction}${notes.reactionFrame ? ` · F${notes.reactionFrame}` : ''}`)
  if (adjustment) {
    const move = notes.adjustment === 'moved-feet' && notes.moveBoards ? ` · ${notes.moveBoards} boards` : ''
    const frame = (notes.adjustment === 'ball-down' || notes.adjustment === 'ball-up') && notes.ballChangeFrame ? ` · F${notes.ballChangeFrame}` : ''
    badges.push(`${adjustment}${move}${frame}`)
  }
  if (leave) badges.push(leave)
  if (notes.speed != null) badges.push(`${notes.speed.toFixed(1)} mph`)
  if (notes.startBoard != null || notes.endBoard != null) {
    badges.push(`Line ${notes.startBoard ?? '—'}→${notes.endBoard ?? '—'}`)
  }
  return badges
}
