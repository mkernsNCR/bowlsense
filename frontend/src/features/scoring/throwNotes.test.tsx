import { describe, expect, it } from 'vitest'
import { addThrowNotes, parseThrowNotes, throwNoteSummary } from './throwNotes'

describe('per-throw notes', () => {
  it('round-trips notes while preserving the rest of frame data', () => {
    const frameData = addThrowNotes(JSON.stringify({ rolls: [10, 8], laneNotes: { laneFeel: 'fresh' } }), [
      { startingBoard: 18, targetBoard: 15, entryBoard: 12, reaction: 'high' },
      { leave: 'flat-10', speed: 17.5 },
    ])

    expect(JSON.parse(frameData)).toMatchObject({ rolls: [10, 8], laneNotes: { laneFeel: 'fresh' } })
    expect(parseThrowNotes(frameData)).toEqual([
      { reaction: 'high', startingBoard: 18, targetBoard: 15, entryBoard: 12 },
      { speed: 17.5, leave: 'flat-10' },
    ])
    expect(throwNoteSummary(parseThrowNotes(frameData)[0]!, 0)).toBe('T1 · Start 18 · Target 15 · Arrows 12 · Going high')
  })

  it('normalizes unsupported values and dependent adjustment details', () => {
    const frameData = JSON.stringify({ throwNotes: [
      { startingBoard: 41, targetBoard: 41, entryBoard: 0, speed: 31, reaction: 'wild', adjustment: 'stayed', moveBoards: 4 },
      { adjustment: 'moved-feet', moveBoards: 3 },
    ] })

    expect(parseThrowNotes(frameData)).toEqual([
      { adjustment: 'stayed' },
      { adjustment: 'moved-feet', moveBoards: 3 },
    ])
  })

  it('normalizes the approach starting board as a per-throw cue', () => {
    expect(parseThrowNotes(JSON.stringify({ throwNotes: [{ startingBoard: 22 }, { startingBoard: 0 }] }))).toEqual([
      { startingBoard: 22 },
      {},
    ])
  })

  it('removes the property when every throw note is empty', () => {
    const frameData = addThrowNotes(JSON.stringify({ rolls: [0] }), [{}])
    expect(JSON.parse(frameData)).toEqual({ rolls: [0] })
  })
})
