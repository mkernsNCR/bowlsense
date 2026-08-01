import { initGame, knockPins, type GameState } from '../../utils/bowlingScore'

const pinCoordinates: Record<number, readonly [x: number, y: number]> = {
  1: [0, 0],
  2: [-1, 1],
  3: [1, 1],
  4: [-2, 2],
  5: [0, 2],
  6: [2, 2],
  7: [-3, 3],
  8: [-1, 3],
  9: [1, 3],
  10: [3, 3],
}

const pinsImmediatelyBehind: Record<number, readonly [number, number]> = {
  1: [2, 3],
  2: [4, 5],
  3: [5, 6],
  4: [7, 8],
  5: [8, 9],
  6: [9, 10],
}

function liesBetween(pin: number, first: number, second: number) {
  const [x, y] = pinCoordinates[pin]!
  const [firstX, firstY] = pinCoordinates[first]!
  const [secondX, secondY] = pinCoordinates[second]!
  const isCollinear = (x - firstX) * (secondY - firstY) === (y - firstY) * (secondX - firstX)
  if (!isCollinear) return false

  return x >= Math.min(firstX, secondX)
    && x <= Math.max(firstX, secondX)
    && y >= Math.min(firstY, secondY)
    && y <= Math.max(firstY, secondY)
}

export function isSplitLeave(standingPins: readonly number[]) {
  const standing = new Set(standingPins)
  if (standing.has(1) || standing.size < 2) return false

  const standingList = [...standing]
  const downPins = Object.keys(pinCoordinates).map(Number).filter((pin) => !standing.has(pin))

  for (let firstIndex = 0; firstIndex < standingList.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < standingList.length; secondIndex += 1) {
      const first = standingList[firstIndex]!
      const second = standingList[secondIndex]!
      if (downPins.some((pin) => liesBetween(pin, first, second))) return true
    }
  }

  return downPins.some((pin) => {
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
