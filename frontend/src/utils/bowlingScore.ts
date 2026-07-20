export interface Frame {
  ball1: number | null
  ball2: number | null
  ball3: number | null
  score: number | null
  cumulative: number | null
  isStrike: boolean
  isSpare: boolean
}

export interface GameState {
  rolls: number[]
  frames: Frame[]
  currentFrame: number
  currentBall: number
  pinsStanding: number[]
  isComplete: boolean
  totalScore: number
  /** pinSelections[i] = which pins fell on state.rolls[i] */
  pinSelections: number[][]
}

export function resetPins(): number[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
}

function emptyFrame(): Frame {
  return {
    ball1: null,
    ball2: null,
    ball3: null,
    score: null,
    cumulative: null,
    isStrike: false,
    isSpare: false,
  }
}

export function initGame(): GameState {
  return {
    rolls: [],
    frames: Array.from({ length: 10 }, () => emptyFrame()),
    currentFrame: 0,
    currentBall: 0,
    pinsStanding: resetPins(),
    isComplete: false,
    totalScore: 0,
    pinSelections: [],
  }
}

export function calculateScores(rolls: number[]): number[] {
  const cumulative: number[] = []
  let rollIndex = 0
  let running = 0

  for (let frame = 0; frame < 10; frame += 1) {
    if (rollIndex >= rolls.length) break

    if (frame < 9) {
      const first = rolls[rollIndex]

      if (first === 10) {
        if (rollIndex + 2 >= rolls.length) break
        running += 10 + rolls[rollIndex + 1] + rolls[rollIndex + 2]
        cumulative.push(running)
        rollIndex += 1
        continue
      }

      if (rollIndex + 1 >= rolls.length) break
      const second = rolls[rollIndex + 1]

      if (first + second === 10) {
        if (rollIndex + 2 >= rolls.length) break
        running += 10 + rolls[rollIndex + 2]
      } else {
        running += first + second
      }

      cumulative.push(running)
      rollIndex += 2
      continue
    }

    const first = rolls[rollIndex]
    if (first === 10) {
      if (rollIndex + 2 >= rolls.length) break
      running += 10 + rolls[rollIndex + 1] + rolls[rollIndex + 2]
      cumulative.push(running)
      break
    }

    if (rollIndex + 1 >= rolls.length) break
    const second = rolls[rollIndex + 1]

    if (first + second === 10) {
      if (rollIndex + 2 >= rolls.length) break
      running += 10 + rolls[rollIndex + 2]
    } else {
      running += first + second
    }

    cumulative.push(running)
    break
  }

  return cumulative
}

function applyScores(frames: Frame[], rolls: number[]) {
  const cumulative = calculateScores(rolls)
  let previous = 0
  return frames.map((frame, index) => {
    const cumulativeScore = cumulative[index]
    if (cumulativeScore == null) {
      return { ...frame, score: null, cumulative: null }
    }

    const frameScore = cumulativeScore - previous
    previous = cumulativeScore
    return { ...frame, score: frameScore, cumulative: cumulativeScore }
  })
}

export function knockPins(state: GameState, pinsKnocked: number[]): GameState {
  if (state.isComplete) return state

  const frameIndex = state.currentFrame
  const frame = state.frames[frameIndex]
  if (!frame) return state

  const standingSet = new Set(state.pinsStanding)
  const validKnocked = Array.from(new Set(pinsKnocked)).filter((pin) => standingSet.has(pin))
  const pinsDown = validKnocked.length

  const nextFrames = state.frames.map((f) => ({ ...f }))
  const nextFrame = { ...nextFrames[frameIndex] }
  nextFrames[frameIndex] = nextFrame
  const nextRolls = [...state.rolls, pinsDown]

  let currentFrame = state.currentFrame
  let currentBall = state.currentBall
  let pinsStanding = [...state.pinsStanding]
  let isComplete = false

  if (frameIndex < 9) {
    if (nextFrame.ball1 == null) {
      nextFrame.ball1 = pinsDown
      nextFrame.isStrike = pinsDown === 10

      if (nextFrame.isStrike) {
        currentFrame += 1
        currentBall = 0
        pinsStanding = resetPins()
      } else {
        currentBall = 1
        pinsStanding = pinsStanding.filter((pin) => !validKnocked.includes(pin))
      }
    } else {
      nextFrame.ball2 = pinsDown
      nextFrame.isSpare = (nextFrame.ball1 || 0) + pinsDown === 10
      currentFrame += 1
      currentBall = 0
      pinsStanding = resetPins()
    }
  } else {
    if (nextFrame.ball1 == null) {
      nextFrame.ball1 = pinsDown
      nextFrame.isStrike = pinsDown === 10
      currentBall = 1
      pinsStanding = nextFrame.isStrike ? resetPins() : pinsStanding.filter((pin) => !validKnocked.includes(pin))
    } else if (nextFrame.ball2 == null) {
      nextFrame.ball2 = pinsDown
      if (!nextFrame.isStrike) {
        nextFrame.isSpare = (nextFrame.ball1 || 0) + pinsDown === 10
      }

      const allowThird = nextFrame.isStrike || nextFrame.isSpare
      if (allowThird) {
        currentBall = 2

        if (nextFrame.isStrike) {
          if (pinsDown === 10 || nextFrame.ball2 === 10) {
            pinsStanding = resetPins()
          } else {
            pinsStanding = resetPins().filter((pin) => !validKnocked.includes(pin))
          }
        } else {
          pinsStanding = resetPins()
        }
      } else {
        isComplete = true
        currentBall = 0
        currentFrame = 10
        pinsStanding = []
      }
    } else {
      nextFrame.ball3 = pinsDown
      isComplete = true
      currentBall = 0
      currentFrame = 10
      pinsStanding = []
    }
  }

  const scoredFrames = applyScores(nextFrames, nextRolls)
  const totalScore = scoredFrames[9]?.cumulative ?? scoredFrames.filter((f) => f.cumulative != null).at(-1)?.cumulative ?? 0

  return {
    rolls: nextRolls,
    frames: scoredFrames,
    currentFrame,
    currentBall,
    pinsStanding,
    isComplete,
    totalScore,
    pinSelections: [...state.pinSelections, pinsKnocked],
  }
}

export function getDisplayMark(frame: Frame, ball: 0 | 1 | 2): string {
  const value = ball === 0 ? frame.ball1 : ball === 1 ? frame.ball2 : frame.ball3
  if (value == null) return ''

  if (ball === 0) {
    if (value === 10) return 'X'
    if (value === 0) return '-'
    return String(value)
  }

  if (ball === 1) {
    if (frame.isStrike && value === 10) return 'X'
    if (!frame.isStrike && frame.isSpare) return '/'
    if (value === 0) return '-'
    return String(value)
  }

  if (frame.isStrike && frame.ball2 != null && frame.ball2 < 10 && (frame.ball2 + value === 10)) return '/'
  if (value === 10) return 'X'
  if (value === 0) return '-'
  return String(value)
}
