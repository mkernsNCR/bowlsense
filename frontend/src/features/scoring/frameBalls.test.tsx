import { describe, expect, it } from 'vitest'
import { addFrameBallIds, emptyFrameBallIds, frameBallEntries, parseFrameBallIds } from './frameBalls'

describe('frame ball assignments', () => {
  it('round-trips frame-specific balls while preserving frame data', () => {
    const ids = emptyFrameBallIds()
    ids[0] = 12
    ids[4] = 18
    const frameData = addFrameBallIds(JSON.stringify({ rolls: [10], throwNotes: [{}] }), ids)

    expect(parseFrameBallIds(frameData)[0]).toBe(12)
    expect(parseFrameBallIds(frameData)[4]).toBe(18)
    expect(JSON.parse(frameData)).toMatchObject({ rolls: [10], throwNotes: [{}] })
    expect(frameBallEntries(parseFrameBallIds(frameData))).toEqual([
      { frame: 1, ballId: 12 },
      { frame: 5, ballId: 18 },
    ])
  })

  it('normalizes malformed ids and removes an empty assignment array', () => {
    expect(parseFrameBallIds(JSON.stringify({ frameBallIds: [0, '12', 4.5, -2] }))).toEqual(emptyFrameBallIds())
    expect(JSON.parse(addFrameBallIds(JSON.stringify({ rolls: [0] }), emptyFrameBallIds()))).toEqual({ rolls: [0] })
  })
})
