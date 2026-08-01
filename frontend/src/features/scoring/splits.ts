import { initGame, knockPins, type GameState } from '../../utils/bowlingScore'

const pinsImmediatelyBehind: Record<number, readonly [number, number]> = {
  1: [2, 3],
  2: [4, 5],
  3: [5, 6],
  4: [7, 8],
  5: [8, 9],
  6: [9, 10],
}

const connectedPins = Object.entries(pinsImmediatelyBehind).reduce<Record<number, number[]>>((connections, [frontPin, backPins]) => {
  const front = Number(frontPin)
  connections[front] ??= []
  for (const back of backPins) {
    connections[front].push(back)
    connections[back] ??= []
    connections[back].push(front)
  }
  return connections
}, {})

function hasSeparatedStandingGroups(standing: ReadonlySet<number>) {
  const unvisited = new Set(standing)
  const first = unvisited.values().next().value
  if (first == null) return false

  const pending = [first]
  unvisited.delete(first)
  while (pending.length > 0) {
    const pin = pending.pop()
    if (pin == null) continue
    for (const neighbor of connectedPins[pin] ?? []) {
      if (!unvisited.has(neighbor)) continue
      unvisited.delete(neighbor)
      pending.push(neighbor)
    }
  }

  return unvisited.size > 0
}

export function isSplitLeave(standingPins: readonly number[]) {
  const standing = new Set(standingPins)
  if (standing.has(1) || standing.size < 2) return false

  if (hasSeparatedStandingGroups(standing)) return true

  return Object.keys(connectedPins).map(Number).filter((pin) => !standing.has(pin)).some((pin) => {
    const behind = pinsImmediatelyBehind[pin]
    return behind ? behind.every((candidate) => standing.has(candidate)) : false
  })
}

function isFreshRackRoll(state: GameState) {
  if (state.currentFrame < 9) return state.currentBall === 0
  if (state.currentFrame !== 9) return false
  if (state.currentBall === 0) return true

  const tenth = state.frames[9]
  if (state.currentBall === 1) return tenth?.ball1 === 10
  return state.currentBall === 2 && (tenth?.isSpare || (tenth?.ball1 === 10 && tenth?.ball2 === 10))
}

export function countSplits(pinSelections: readonly number[][]) {
  let state = initGame()
  let splits = 0

  for (const selection of pinSelections) {
    const knocked = new Set(selection)
    const standingAfterRoll = state.pinsStanding.filter((pin) => !knocked.has(pin))
    if (isFreshRackRoll(state) && isSplitLeave(standingAfterRoll)) splits += 1
    state = knockPins(state, selection)
  }

  return splits
}
