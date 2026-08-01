import { describe, expect, it } from 'vitest'
import { resetPins } from '../../utils/bowlingScore'
import { countSplits, isSplitLeave } from './splits'

describe('split detection', () => {
  it('recognizes separated and baby splits under the USBC definition', () => {
    expect(isSplitLeave([7, 10])).toBe(true)
    expect(isSplitLeave([3, 10])).toBe(true)
    expect(isSplitLeave([4, 5])).toBe(true)
    expect(isSplitLeave([5, 6])).toBe(true)
  })

  it('rejects connected leaves and any leave with the head pin standing', () => {
    expect(isSplitLeave([2, 4])).toBe(false)
    expect(isSplitLeave([1, 7, 10])).toBe(false)
    expect(isSplitLeave([10])).toBe(false)
  })

  it('counts a split on a fresh tenth-frame rack after a strike', () => {
    const firstNineFrames = Array.from({ length: 18 }, () => [] as number[])
    const leaveSevenTen = [1, 2, 3, 4, 5, 6, 8, 9]

    expect(countSplits([...firstNineFrames, resetPins(), leaveSevenTen, [7, 10]])).toBe(1)
  })
})
