import {
  adjustmentOptions,
  laneFeelOptions,
  leaveOptions,
  reactionOptions,
  type Adjustment,
  type LaneFeel,
  type Leave,
  type Reaction,
} from './laneNotes'

export interface ThrowNotes {
  laneFeel?: LaneFeel
  reaction?: Reaction
  adjustment?: Adjustment
  moveBoards?: number
  speed?: number
  leave?: Leave
  targetBoard?: number
  entryBoard?: number
}

function isOption<T extends string>(options: ReadonlyArray<{ value: T }>, value: unknown): value is T {
  return typeof value === 'string' && options.some((option) => option.value === value)
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

function parseOne(value: unknown): ThrowNotes {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const adjustment = isOption(adjustmentOptions, raw.adjustment) ? raw.adjustment : undefined
  const notes: ThrowNotes = {}
  const laneFeel = isOption(laneFeelOptions, raw.laneFeel) ? raw.laneFeel : undefined
  const reaction = isOption(reactionOptions, raw.reaction) ? raw.reaction : undefined
  const moveBoards = adjustment === 'moved-feet' ? optionalMoveBoards(raw.moveBoards) : undefined
  const speed = optionalSpeed(raw.speed)
  const leave = isOption(leaveOptions, raw.leave) ? raw.leave : undefined
  const targetBoard = optionalBoard(raw.targetBoard)
  const entryBoard = optionalBoard(raw.entryBoard)
  if (laneFeel) notes.laneFeel = laneFeel
  if (reaction) notes.reaction = reaction
  if (adjustment) notes.adjustment = adjustment
  if (moveBoards != null) notes.moveBoards = moveBoards
  if (speed != null) notes.speed = speed
  if (leave) notes.leave = leave
  if (targetBoard != null) notes.targetBoard = targetBoard
  if (entryBoard != null) notes.entryBoard = entryBoard
  return notes
}

export function parseThrowNotes(frameData?: string | null): ThrowNotes[] {
  if (!frameData) return []
  try {
    const parsed: unknown = JSON.parse(frameData)
    if (!parsed || typeof parsed !== 'object') return []
    const raw = (parsed as { throwNotes?: unknown }).throwNotes
    return Array.isArray(raw) ? raw.map(parseOne) : []
  } catch {
    return []
  }
}

export function hasThrowNotes(notes: ThrowNotes) {
  return Object.values(notes).some((value) => value != null)
}

export function addThrowNotes(frameData: string, notes: ReadonlyArray<ThrowNotes>) {
  try {
    const parsed: unknown = JSON.parse(frameData)
    const base = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    const next = { ...base }
    const trimmed = notes.map((note) => ({ ...note }))
    if (trimmed.some(hasThrowNotes)) next.throwNotes = trimmed
    else delete next.throwNotes
    return JSON.stringify(next)
  } catch {
    return frameData
  }
}

function labelFor<T extends string>(options: ReadonlyArray<{ value: T; label: string }>, value?: T) {
  return options.find((option) => option.value === value)?.label
}

export function throwNoteSummary(notes: ThrowNotes, throwIndex: number) {
  const parts: string[] = [`T${throwIndex + 1}`]
  if (notes.targetBoard != null) parts.push(`Target ${notes.targetBoard}`)
  if (notes.entryBoard != null) parts.push(`Arrows ${notes.entryBoard}`)
  const feel = labelFor(laneFeelOptions, notes.laneFeel)
  if (feel) parts.push(feel)
  const reaction = labelFor(reactionOptions, notes.reaction)
  if (reaction) parts.push(reaction)
  const adjustment = labelFor(adjustmentOptions, notes.adjustment)
  if (adjustment) parts.push(notes.adjustment === 'moved-feet' && notes.moveBoards != null ? `${adjustment} · ${notes.moveBoards} boards` : adjustment)
  const leave = labelFor(leaveOptions, notes.leave)
  if (leave) parts.push(leave)
  if (notes.speed != null) parts.push(`${notes.speed.toFixed(1)} mph`)
  return hasThrowNotes(notes) ? parts.join(' · ') : null
}
