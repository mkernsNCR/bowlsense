import { describe, expect, it } from 'vitest'
import { addLaneNotes, laneNoteBadges, parseLaneNotes } from './laneNotes'

describe('lane notes', () => {
  it('round-trips structured notes inside existing frame data', () => {
    const frameData = addLaneNotes(JSON.stringify({ rolls: [10], pinSelections: [[1, 2]] }), {
      laneFeel: 'transitioning',
      reaction: 'high',
      reactionFrame: 6,
      adjustment: 'moved-feet',
      moveBoards: 3,
      speed: 17.5,
      leave: 'flat-10',
      startBoard: 18,
      endBoard: 21,
    })

    expect(parseLaneNotes(frameData)).toEqual({
      laneFeel: 'transitioning',
      reaction: 'high',
      reactionFrame: 6,
      adjustment: 'moved-feet',
      moveBoards: 3,
      speed: 17.5,
      leave: 'flat-10',
      startBoard: 18,
      endBoard: 21,
    })
    expect(laneNoteBadges(parseLaneNotes(frameData))).toEqual([
      'Transitioning',
      'Going high · F6',
      'Moved feet · 3 boards',
      'Flat 10',
      '17.5 mph',
      'Line 18→21',
    ])
  })

  it('ignores malformed or unsupported note values', () => {
    expect(parseLaneNotes(JSON.stringify({ laneNotes: { reaction: 'wild', speed: 80, reactionFrame: 99 } }))).toEqual({})
    expect(addLaneNotes('{not-json', {})).toBe('{not-json')
  })
})
