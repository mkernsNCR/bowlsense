import { describe, expect, it } from 'vitest'
import type { Frame } from '../../utils/bowlingScore'
import { toFrameRibbonFrames } from './frameRibbon'

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    ball1: null,
    ball2: null,
    ball3: null,
    score: null,
    cumulative: null,
    isStrike: false,
    isSpare: false,
    ...overrides,
  }
}

describe('toFrameRibbonFrames', () => {
  it('maps frame rolls, terminal states, and accessible labels', () => {
    const frames = [
      frame(),
      frame({ ball1: 10, cumulative: 30, isStrike: true }),
      frame({ ball1: 7, ball2: 3, cumulative: 50, isSpare: true }),
      frame({ ball1: 8, ball2: 1, cumulative: 59 }),
      ...Array.from({ length: 5 }, () => frame()),
      frame({ ball1: 10, ball2: 7, ball3: 3, cumulative: 179, isStrike: true }),
    ]

    const ribbon = toFrameRibbonFrames(frames)

    expect(ribbon[0]).toEqual({
      rolls: [],
      score: null,
      state: 'pending',
      label: 'Frame 1',
    })
    expect(ribbon[1]).toEqual({
      rolls: ['X'],
      score: 30,
      state: 'strike',
      label: 'Frame 2, cumulative score 30',
    })
    expect(ribbon[2]).toEqual({
      rolls: ['7', '/'],
      score: 50,
      state: 'spare',
      label: 'Frame 3, cumulative score 50',
    })
    expect(ribbon[3]).toEqual({
      rolls: ['8', '1'],
      score: 59,
      state: 'open',
      label: 'Frame 4, cumulative score 59',
    })
    expect(ribbon[9]).toEqual({
      rolls: ['X', '7', '/'],
      score: 179,
      state: 'strike',
      label: 'Frame 10, cumulative score 179',
    })
  })

  it('marks the active frame as current before its terminal state', () => {
    const frames = [frame(), frame({ ball1: 7 })]

    expect(toFrameRibbonFrames(frames, 0).map(({ state }) => state)).toEqual(['current', 'open'])
    expect(toFrameRibbonFrames(frames, 1).map(({ state }) => state)).toEqual(['pending', 'current'])
  })
})
