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
  /** pinSelections[i] contains the physical pins knocked down by rolls[i]. */
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
    frames: Array.from({ length: 10 }, emptyFrame),
    currentFrame: 0,
    currentBall: 0,
    pinsStanding: resetPins(),
    isComplete: false,
    totalScore: 0,
    pinSelections: [],
  }
}

/** Returns cumulative scores only for frames whose bonus rolls are known. */
export function calculateScores(rolls: number[]): number[] {
  const cumulative: number[] = []
  let rollIndex = 0
  let running = 0

  for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
    if (rollIndex >= rolls.length) break

    const first = rolls[rollIndex]
    if (frameIndex === 9) {
      if (rollIndex + 1 >= rolls.length) break
      const second = rolls[rollIndex + 1]
      const earnsFillBall = first === 10 || first + second === 10
      if (earnsFillBall && rollIndex + 2 >= rolls.length) break
      running += first + second + (earnsFillBall ? rolls[rollIndex + 2] : 0)
      cumulative.push(running)
      break
    }

    if (frameIndex < 9 && first === 10) {
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

  }

  return cumulative
}

function applyScores(frames: Frame[], rolls: number[]): Frame[] {
  const cumulative = calculateScores(rolls)
  let previous = 0

  return frames.map((frame, index) => {
    const cumulativeScore = cumulative[index]
    if (cumulativeScore == null) return { ...frame, score: null, cumulative: null }

    const score = cumulativeScore - previous
    previous = cumulativeScore
    return { ...frame, score, cumulative: cumulativeScore }
  })
}

/** Record one physical roll. Only currently-standing pins are accepted. */
export function knockPins(state: GameState, pinsKnocked: number[]): GameState {
  if (state.isComplete) return state

  const frameIndex = state.currentFrame
  const frame = state.frames[frameIndex]
  if (!frame) return state

  const standing = new Set(state.pinsStanding)
  const validKnocked = [...new Set(pinsKnocked)].filter((pin) => standing.has(pin))
  const pinsDown = validKnocked.length
  const frames = state.frames.map((item) => ({ ...item }))
  const nextFrame = frames[frameIndex]
  const rolls = [...state.rolls, pinsDown]
  let currentFrame = frameIndex
  let currentBall: number
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
      nextFrame.isSpare = nextFrame.ball1 + pinsDown === 10
      currentFrame += 1
      currentBall = 0
      pinsStanding = resetPins()
    }
  } else if (nextFrame.ball1 == null) {
    nextFrame.ball1 = pinsDown
    nextFrame.isStrike = pinsDown === 10
    currentBall = 1
    pinsStanding = nextFrame.isStrike
      ? resetPins()
      : pinsStanding.filter((pin) => !validKnocked.includes(pin))
  } else if (nextFrame.ball2 == null) {
    nextFrame.ball2 = pinsDown
    nextFrame.isSpare = !nextFrame.isStrike && nextFrame.ball1 + pinsDown === 10

    if (nextFrame.isStrike || nextFrame.isSpare) {
      currentBall = 2
      if (nextFrame.isStrike && pinsDown < 10) {
        pinsStanding = pinsStanding.filter((pin) => !validKnocked.includes(pin))
      } else {
        pinsStanding = resetPins()
      }
    } else {
      currentFrame = 10
      currentBall = 0
      pinsStanding = []
      isComplete = true
    }
  } else {
    nextFrame.ball3 = pinsDown
    currentFrame = 10
    currentBall = 0
    pinsStanding = []
    isComplete = true
  }

  const scoredFrames = applyScores(frames, rolls)
  const mostRecentScore = [...scoredFrames]
    .reverse()
    .find((item) => item.cumulative != null)?.cumulative ?? 0

  return {
    rolls,
    frames: scoredFrames,
    currentFrame,
    currentBall,
    pinsStanding,
    isComplete,
    totalScore: mostRecentScore,
    pinSelections: [...state.pinSelections, validKnocked],
  }
}

/** Replays physical pin selections, keeping undo/edit deterministic and testable. */
export function replayGame(pinSelections: number[][]): GameState {
  return pinSelections.reduce((state, pins) => knockPins(state, pins), initGame())
}

/** Rebuilds legacy count-only scores when physical leave data was not saved. */
export function replayRollCounts(rolls: number[]): GameState {
  return rolls.reduce((state, count) => {
    const boundedCount = Math.max(0, Math.min(Math.trunc(count), state.pinsStanding.length))
    return knockPins(state, state.pinsStanding.slice(0, boundedCount))
  }, initGame())
}

export function undoLastRoll(state: GameState): GameState {
  if (state.pinSelections.length === 0) return state
  return replayGame(state.pinSelections.slice(0, -1))
}

export function rollIndexForFrame(frameIndex: number, frames: Frame[]): number {
  let rollIndex = 0

  for (let index = 0; index < Math.min(frameIndex, 10); index += 1) {
    const frame = frames[index]
    if (frame.ball1 != null) rollIndex += 1
    if (frame.ball2 != null) rollIndex += 1
    if (frame.ball3 != null) rollIndex += 1
  }

  return rollIndex
}

/**
 * Starts an explicit frame edit by removing that frame and every later roll.
 * Callers should keep the original state until the user commits or restores it.
 */
export function rewindToFrame(state: GameState, frameIndex: number): GameState {
  const startRoll = rollIndexForFrame(frameIndex, state.frames)
  return replayGame(state.pinSelections.slice(0, startRoll))
}

export function gameFromFrameData(frameData?: string | null): GameState {
  if (!frameData) return initGame()

  try {
    const parsed: unknown = JSON.parse(frameData)
    if (!parsed || typeof parsed !== 'object') return initGame()
    const saved = parsed as { pinSelections?: unknown; rolls?: unknown }
    const selections = saved.pinSelections
    if (!Array.isArray(selections) || selections.length === 0) {
      if (!Array.isArray(saved.rolls)) return initGame()
      const rolls = saved.rolls.filter((roll): roll is number => typeof roll === 'number' && Number.isFinite(roll))
      return replayRollCounts(rolls)
    }

    const normalized = selections.map((pins) => {
      if (!Array.isArray(pins)) return []
      return pins.filter((pin): pin is number => Number.isInteger(pin) && pin >= 1 && pin <= 10)
    })
    return replayGame(normalized)
  } catch {
    return initGame()
  }
}

export function getDisplayMark(frame: Frame, ball: 0 | 1 | 2): string {
  const value = ball === 0 ? frame.ball1 : ball === 1 ? frame.ball2 : frame.ball3
  if (value == null) return ''

  if (ball === 0) {
    if (value === 10) return 'X'
    return value === 0 ? '–' : String(value)
  }

  if (ball === 1) {
    if (frame.isStrike && value === 10) return 'X'
    if (!frame.isStrike && frame.isSpare) return '/'
    return value === 0 ? '–' : String(value)
  }

  if (frame.isStrike && frame.ball2 != null && frame.ball2 < 10 && frame.ball2 + value === 10) return '/'
  if (value === 10) return 'X'
  return value === 0 ? '–' : String(value)
}
