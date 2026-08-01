import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Frame } from '../../utils/bowlingScore'
import { FrameRibbon } from '../../design'
import { toFrameRibbonFrames } from './frameRibbon'

const originalScrollIntoView = Element.prototype.scrollIntoView

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  if (originalScrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    })
  } else {
    delete (Element.prototype as { scrollIntoView?: Element['scrollIntoView'] }).scrollIntoView
  }
})

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
      label: 'Frame 1, pending, Not bowled',
    })
    expect(ribbon[1]).toEqual({
      rolls: ['X'],
      score: 30,
      state: 'strike',
      label: 'Frame 2, strike, Rolls X, cumulative score 30',
    })
    expect(ribbon[2]).toEqual({
      rolls: ['7', '/'],
      score: 50,
      state: 'spare',
      label: 'Frame 3, spare, Rolls 7, /, cumulative score 50',
    })
    expect(ribbon[3]).toEqual({
      rolls: ['8', '1'],
      score: 59,
      state: 'open',
      label: 'Frame 4, open, Rolls 8, 1, cumulative score 59',
    })
    expect(ribbon[9]).toEqual({
      rolls: ['X', '7', '/'],
      score: 179,
      state: 'strike',
      label: 'Frame 10, strike, Rolls X, 7, /, cumulative score 179',
    })
  })

  it('marks the active frame as current before its terminal state', () => {
    const frames = [frame(), frame({ ball1: 7 })]

    expect(toFrameRibbonFrames(frames, 0).map(({ state }) => state)).toEqual(['current', 'open'])
    expect(toFrameRibbonFrames(frames, 1).map(({ state }) => state)).toEqual(['pending', 'current'])
  })

  it('exposes mapped state and roll marks in the rendered accessible label', () => {
    const frames = toFrameRibbonFrames([frame({ ball1: 7 })], 0)

    render(<FrameRibbon frames={frames} />)

    expect(screen.getByLabelText('Frame 1, current, Rolls 7')).toBeTruthy()
  })
})
