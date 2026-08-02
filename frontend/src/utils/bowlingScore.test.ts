import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateMaximumPossibleScore,
  calculateScores,
  getDisplayMark,
  initGame,
  knockPins,
  type Frame,
  type GameState,
} from './bowlingScore.ts'

function roll(state: GameState, pins: number): GameState {
  return knockPins(state, state.pinsStanding.slice(0, pins))
}

test('scores a perfect game as 300', () => {
  assert.deepEqual(calculateScores(Array.from({ length: 12 }, () => 10)), [
    30, 60, 90, 120, 150, 180, 210, 240, 270, 300,
  ])
})

test('scores a gutter game as zero', () => {
  assert.deepEqual(calculateScores(Array.from({ length: 20 }, () => 0)), [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ])
})

test('scores an all-spares game with five-pin bonuses as 150', () => {
  assert.deepEqual(calculateScores(Array.from({ length: 21 }, () => 5)), [
    15, 30, 45, 60, 75, 90, 105, 120, 135, 150,
  ])
})

test('keeps unresolved strike bonuses out of cumulative scores', () => {
  assert.deepEqual(calculateScores([10]), [])
  assert.deepEqual(calculateScores([10, 7]), [])
  assert.deepEqual(calculateScores([10, 7, 2]), [19, 28])
})

test('calculates the maximum possible finish for an incomplete game', () => {
  const game = [10, 8, 0, 7, 3, 10, 10, 10, 10, 8, 2, 10, 10]
    .reduce((state, pins) => roll(state, pins), initGame())

  assert.equal(game.totalScore, 174)
  assert.equal(game.currentFrame, 9)
  assert.equal(game.currentBall, 1)
  assert.equal(calculateMaximumPossibleScore(game), 234)
})

test('keeps the exact final score once a game is complete', () => {
  const game = Array.from({ length: 20 }, () => 0)
    .reduce((state, pins) => roll(state, pins), initGame())

  assert.equal(game.isComplete, true)
  assert.equal(calculateMaximumPossibleScore(game), 0)
})

test('completes a perfect game through the pin-selection state machine', () => {
  let game = initGame()

  for (let index = 0; index < 12; index += 1) {
    game = roll(game, 10)
  }

  assert.equal(game.isComplete, true)
  assert.equal(game.totalScore, 300)
  assert.equal(game.currentFrame, 10)
  assert.equal(game.rolls.length, 12)
  assert.equal(game.frames[9].cumulative, 300)
})

test('ignores duplicate and already-fallen pin identifiers', () => {
  let game = initGame()
  game = knockPins(game, [1, 1, 2])
  game = knockPins(game, [1, 3])

  assert.deepEqual(game.rolls, [2, 1])
  assert.equal(game.frames[0].ball1, 2)
  assert.equal(game.frames[0].ball2, 1)
})

test('formats strikes, spares, misses, and open rolls', () => {
  const strike: Frame = {
    ball1: 10,
    ball2: null,
    ball3: null,
    score: null,
    cumulative: null,
    isStrike: true,
    isSpare: false,
  }
  const spare: Frame = {
    ...strike,
    ball1: 7,
    ball2: 3,
    isStrike: false,
    isSpare: true,
  }

  assert.equal(getDisplayMark(strike, 0), 'X')
  assert.equal(getDisplayMark(spare, 1), '/')
  assert.equal(getDisplayMark({ ...spare, ball1: 0, ball2: 4, isSpare: false }, 0), '–')
  assert.equal(getDisplayMark({ ...spare, ball1: 6, ball2: 2, isSpare: false }, 1), '2')
})
