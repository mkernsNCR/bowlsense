import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BowlingScorer, { type SavedBowlingGame } from '../../components/BowlingScorer'
import { resetPins } from '../../utils/bowlingScore'

afterEach(cleanup)

function renderScorer(
  initialFrameData?: string,
  callbacks: {
    onSave?: (game: SavedBowlingGame) => void | Promise<void>
    onCancel?: () => void
    initialSplits?: number
  } = {},
) {
  const onSave = callbacks.onSave ?? vi.fn()
  const onCancel = callbacks.onCancel ?? vi.fn()
  return render(
    <BowlingScorer
      gameNumber={1}
      balls={[]}
      initialFrameData={initialFrameData}
      initialSplits={callbacks.initialSplits}
      onSave={onSave}
      onCancel={onCancel}
    />,
  )
}

describe('BowlingScorer completion behavior', () => {
  it('labels a full rack after a gutter as a spare opportunity', () => {
    renderScorer(JSON.stringify({ pinSelections: [[]] }))

    expect(screen.getByRole('button', { name: 'Spare' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Strike' })).toBeNull()
  })

  it('labels a partial tenth-frame strike fill as clearing the rack, not a spare', () => {
    const gutterFrames = Array.from({ length: 18 }, () => [] as number[])
    const initialFrameData = JSON.stringify({
      pinSelections: [...gutterFrames, resetPins(), [1, 2, 3, 4, 5, 6, 7]],
    })

    renderScorer(initialFrameData)

    expect(screen.getByRole('button', { name: 'Clear rack' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Spare' })).toBeNull()
  })

  it('labels a full rack after a tenth-frame strike gutter as clearing the rack', () => {
    const gutterFrames = Array.from({ length: 18 }, () => [] as number[])
    const initialFrameData = JSON.stringify({
      pinSelections: [...gutterFrames, resetPins(), []],
    })

    renderScorer(initialFrameData)

    expect(screen.getByRole('button', { name: 'Clear rack' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Strike' })).toBeNull()
  })

  it('starts retake confirmation over after undoing and completing the game again', () => {
    const initialFrameData = JSON.stringify({
      pinSelections: Array.from({ length: 19 }, () => [] as number[]),
    })

    renderScorer(initialFrameData)
    fireEvent.click(screen.getByRole('button', { name: 'Record 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retake' }))
    expect(screen.getByRole('button', { name: 'Confirm retake' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Undo last roll/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Record 0' }))

    expect(screen.getByRole('button', { name: 'Retake' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm retake' })).toBeNull()
  })

  it('recalculates the saved split count after editing a completed game', async () => {
    const onSave = vi.fn()
    const initialFrameData = JSON.stringify({
      pinSelections: Array.from({ length: 19 }, () => [] as number[]),
    })

    renderScorer(initialFrameData, { onSave })
    fireEvent.click(screen.getByRole('button', { name: 'Score details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit from frame 10' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit from here' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ splits: 0 })
  })

  it('preserves split totals when legacy frame data has no physical pin selections', async () => {
    const onSave = vi.fn()
    const initialFrameData = JSON.stringify({ rolls: Array.from({ length: 20 }, () => 0) })

    renderScorer(initialFrameData, { onSave, initialSplits: 3 })
    fireEvent.click(screen.getByRole('button', { name: 'Score details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit from frame 10' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit from here' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ splits: 3 })
  })

  it('shows a retryable error when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('offline'))
    const initialFrameData = JSON.stringify({
      pinSelections: Array.from({ length: 19 }, () => [] as number[]),
    })

    renderScorer(initialFrameData, { onSave })
    fireEvent.click(screen.getByRole('button', { name: 'Record 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))

    expect((await screen.findByRole('alert')).textContent).toBe('The game was not saved. Check your connection and try again.')
    expect(screen.getByRole('button', { name: 'Save game' })).toBeTruthy()
  })

  it('confirms before discarding a game with recorded rolls', () => {
    const onCancel = vi.fn()

    renderScorer(undefined, { onCancel })
    fireEvent.click(screen.getByRole('button', { name: 'Record 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close scorer' }))

    expect(screen.getByText('Discard this game?')).toBeTruthy()
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Keep scoring', { selector: 'button.scoring-button' }))
    expect(screen.queryByText('Discard this game?')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close scorer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard game' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
