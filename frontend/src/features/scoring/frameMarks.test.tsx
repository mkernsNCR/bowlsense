import { describe, expect, it } from 'vitest'
import { formatFrameMarks, parseFrameMarks } from './frameMarks'

describe('stored frame marks', () => {
  it('formats strikes, spares, and tenth-frame fill balls from saved frame data', () => {
    const frameData = JSON.stringify({
      frames: [
        { ball1: 10 },
        { ball1: 7, ball2: 3 },
        ...Array.from({ length: 7 }, () => ({ ball1: 0, ball2: 0 })),
        { ball1: 10, ball2: 7, ball3: 3 },
      ],
    })

    expect(parseFrameMarks(frameData)).toEqual(['X', '7/', '--', '--', '--', '--', '--', '--', '--', 'X7/'])
    expect(formatFrameMarks(frameData)).toBe('X 7/ -- -- -- -- -- -- -- X7/')
  })

  it('returns neutral values for missing or malformed frame data', () => {
    expect(parseFrameMarks()).toEqual([])
    expect(parseFrameMarks('{bad json')).toEqual([])
    expect(formatFrameMarks()).toBeNull()
    expect(formatFrameMarks('{bad json')).toBeNull()
  })
})
