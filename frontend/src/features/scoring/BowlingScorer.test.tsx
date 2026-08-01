import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import BowlingScorer from '../../components/BowlingScorer'
import { resetPins } from '../../utils/bowlingScore'

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

function renderScorer(initialFrameData: string) {
  return render(
    <BowlingScorer
      gameNumber={1}
      balls={[]}
      initialFrameData={initialFrameData}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe('BowlingScorer completion behavior', () => {
  it('labels a partial tenth-frame strike fill as clearing the rack, not a spare', () => {
    const gutterFrames = Array.from({ length: 18 }, () => [] as number[])
    const initialFrameData = JSON.stringify({
      pinSelections: [...gutterFrames, resetPins(), [1, 2, 3, 4, 5, 6, 7]],
    })

    renderScorer(initialFrameData)

    expect(screen.getByRole('button', { name: 'Clear rack' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Spare' })).toBeNull()
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
})
