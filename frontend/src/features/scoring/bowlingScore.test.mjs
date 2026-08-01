// Run with: node --experimental-strip-types src/features/scoring/bowlingScore.test.mjs
import assert from 'node:assert/strict'
import {
  calculateScores,
  initGame,
  knockPins,
  replayGame,
  gameFromFrameData,
  resetPins,
  rewindToFrame,
  undoLastRoll,
} from '../../utils/bowlingScore.ts'

const allPins = resetPins()
const pinSet = (count) => allPins.slice(0, count)

function run(name, test) {
  try {
    test()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

run('scores a perfect game as 300 and completes after 12 rolls', () => {
  const game = replayGame(Array.from({ length: 12 }, () => allPins))
  assert.equal(game.isComplete, true)
  assert.equal(game.totalScore, 300)
  assert.equal(game.frames[9].cumulative, 300)
})

run('scores a tenth-frame spare and fill ball without bonus leakage', () => {
  const firstNine = Array.from({ length: 18 }, () => [])
  const game = replayGame([...firstNine, pinSet(9), [10], allPins])
  assert.equal(game.isComplete, true)
  assert.equal(game.totalScore, 20)
  assert.deepEqual(calculateScores(game.rolls), [0, 0, 0, 0, 0, 0, 0, 0, 0, 20])
})

run('undo restores the exact physical pin deck immediately after a roll', () => {
  const firstRoll = [1, 3, 6, 10]
  const secondRoll = [2, 4]
  const afterTwo = knockPins(knockPins(initGame(), firstRoll), secondRoll)
  const undone = undoLastRoll(afterTwo)
  assert.deepEqual(undone.pinSelections, [firstRoll])
  assert.deepEqual(undone.pinsStanding, [2, 4, 5, 7, 8, 9])
  assert.equal(undone.currentFrame, 0)
  assert.equal(undone.currentBall, 1)
})

run('rewinding a prior frame removes every dependent later roll without mutating the snapshot', () => {
  const original = replayGame([allPins, pinSet(7), [8, 9, 10], pinSet(8), [9, 10]])
  const snapshot = structuredClone(original)
  const rewound = rewindToFrame(original, 1)
  assert.deepEqual(original, snapshot)
  assert.deepEqual(rewound.rolls, [10])
  assert.equal(rewound.currentFrame, 1)
  assert.equal(rewound.totalScore, 0)
})

run('a tenth-frame strike resets once, then preserves standing pins for the fill ball', () => {
  const firstNine = Array.from({ length: 18 }, () => [])
  const afterEleventh = replayGame([...firstNine, allPins, [1, 2, 3]])
  assert.equal(afterEleventh.currentFrame, 9)
  assert.equal(afterEleventh.currentBall, 2)
  assert.deepEqual(afterEleventh.pinsStanding, [4, 5, 6, 7, 8, 9, 10])
})

run('legacy count-only frame data remains editable', () => {
  const restored = gameFromFrameData(JSON.stringify({ rolls: [10, 7, 3, 9, 0] }))
  assert.deepEqual(restored.rolls, [10, 7, 3, 9, 0])
  assert.equal(restored.currentFrame, 3)
  assert.equal(restored.frames[1].isSpare, true)
})

run('legacy rolls restore when pin selections are present but empty', () => {
  const restored = gameFromFrameData(JSON.stringify({ pinSelections: [], rolls: [10, 7, 3] }))
  assert.deepEqual(restored.rolls, [10, 7, 3])
  assert.equal(restored.currentFrame, 2)
  assert.equal(restored.frames[1].isSpare, true)
})

console.log('All scoring cases passed.')
