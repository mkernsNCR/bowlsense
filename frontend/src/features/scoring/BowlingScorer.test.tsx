import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BowlingScorer, { type SavedBowlingGame } from '../../components/BowlingScorer'
import { resetPins } from '../../utils/bowlingScore'

const originalScrollIntoView = Element.prototype.scrollIntoView
const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
const originalPointerEvent = Object.getOwnPropertyDescriptor(window, 'PointerEvent')

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly isPrimary: boolean

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 0
    this.isPrimary = init.isPrimary ?? true
  }
}

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    value: TestPointerEvent,
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
  if (originalElementFromPoint) {
    Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint)
  } else {
    delete (document as { elementFromPoint?: Document['elementFromPoint'] }).elementFromPoint
  }
  if (originalPointerEvent) {
    Object.defineProperty(window, 'PointerEvent', originalPointerEvent)
  } else {
    delete (window as { PointerEvent?: typeof PointerEvent }).PointerEvent
  }
  vi.restoreAllMocks()
})

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

function finishPerfectGame() {
  for (let roll = 0; roll < 12; roll += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'Strike' }))
  }
}

describe('BowlingScorer completion behavior', () => {
  it('keeps click selection and deselection for individual pins', () => {
    renderScorer()
    const pin = screen.getByRole('button', { name: 'Pin 1' })

    fireEvent.click(pin)
    expect(pin.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(pin)
    expect(pin.getAttribute('aria-pressed')).toBe('false')
  })

  it('swipes across pins to select and deselect them without flipping revisited pins', () => {
    renderScorer()
    const pin1 = screen.getByRole('button', { name: 'Pin 1' })
    const pin2 = screen.getByRole('button', { name: 'Pin 2' })
    const pin3 = screen.getByRole('button', { name: 'Pin 3' })
    const deck = screen.getByRole('group', { name: 'Select pins knocked down' })
    let hoveredPin: Element = pin2
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => hoveredPin),
    })

    fireEvent.pointerDown(pin1, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 30, clientY: 10 })
    hoveredPin = pin3
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 50, clientY: 10 })
    hoveredPin = pin2
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 70, clientY: 10 })
    fireEvent.pointerUp(deck, { pointerId: 1, button: 0, clientX: 70, clientY: 10 })
    fireEvent.click(pin1, { detail: 1 })

    expect(pin1.getAttribute('aria-pressed')).toBe('true')
    expect(pin2.getAttribute('aria-pressed')).toBe('true')
    expect(pin3.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Record 3' })).toBeTruthy()

    hoveredPin = pin2
    fireEvent.pointerDown(pin1, { pointerId: 2, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(deck, { pointerId: 2, clientX: 30, clientY: 10 })
    hoveredPin = pin3
    fireEvent.pointerMove(deck, { pointerId: 2, clientX: 50, clientY: 10 })
    fireEvent.pointerUp(deck, { pointerId: 2, button: 0, clientX: 50, clientY: 10 })

    expect(pin1.getAttribute('aria-pressed')).toBe('false')
    expect(pin2.getAttribute('aria-pressed')).toBe('false')
    expect(pin3.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Record 0' })).toBeTruthy()
  })

  it('stops applying swipe changes after the pointer is cancelled', () => {
    renderScorer()
    const pin1 = screen.getByRole('button', { name: 'Pin 1' })
    const pin2 = screen.getByRole('button', { name: 'Pin 2' })
    const pin3 = screen.getByRole('button', { name: 'Pin 3' })
    const deck = screen.getByRole('group', { name: 'Select pins knocked down' })
    let hoveredPin: Element = pin2
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => hoveredPin),
    })

    fireEvent.pointerDown(pin1, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 30, clientY: 10 })
    fireEvent.pointerCancel(deck, { pointerId: 1 })
    hoveredPin = pin3
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 50, clientY: 10 })
    fireEvent.click(pin3, { detail: 1 })

    expect(pin1.getAttribute('aria-pressed')).toBe('true')
    expect(pin2.getAttribute('aria-pressed')).toBe('true')
    expect(pin3.getAttribute('aria-pressed')).toBe('true')
  })

  it('offers a managed score-card share flow after twelve strikes', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    renderScorer()

    finishPerfectGame()

    expect(screen.getByRole('dialog', { name: 'Perfect game' })).toBeTruthy()
    expect(screen.getByLabelText('Perfect score 300')).toBeTruthy()
    expect(screen.getByText('Twelve strikes')).toBeTruthy()
    expect(document.querySelectorAll('.perfect-lane-spotlight span')).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Share 300' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save 300' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retake' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Share 300' }))

    expect(screen.getByRole('dialog', { name: 'Share game 300' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Perfect game' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close score card' }))
    expect(screen.getByRole('dialog', { name: 'Perfect game' })).toBeTruthy()
  })

  it('saves and can retake a perfect game from the real scorer flow', async () => {
    const onSave = vi.fn()
    renderScorer(undefined, { onSave })

    finishPerfectGame()
    fireEvent.click(screen.getByRole('button', { name: 'Save 300' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ score: 300, strikes: 12, spares: 0 })

    cleanup()
    renderScorer()
    finishPerfectGame()
    fireEvent.click(screen.getByRole('button', { name: 'Retake' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm retake' }))

    expect(screen.queryByRole('dialog', { name: 'Perfect game' })).toBeNull()
    expect(screen.getByText('Frame 1 · Ball 1')).toBeTruthy()
    expect(screen.getByText('0', { selector: '.live-score-total strong' })).toBeTruthy()
  })

  it('captures independent cues for individual throws with starting, target, and arrow sliders', async () => {
    const onSave = vi.fn()
    renderScorer(undefined, { onSave })

    finishPerfectGame()

    const throwSelector = screen.getByRole('slider', { name: 'Throw to annotate' })
    fireEvent.change(throwSelector, { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Going high' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Starting board' }), { target: { value: '18' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Target board' }), { target: { value: '15' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Entry at arrows' }), { target: { value: '12' } })

    fireEvent.change(throwSelector, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ball down' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flat 10' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Ball speed' }), { target: { value: '17.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save 300' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const savedThrowNotes = JSON.parse(String(onSave.mock.calls[0]?.[0].frameData)).throwNotes
    expect(savedThrowNotes[0]).toMatchObject({
      reaction: 'high',
      startingBoard: 18,
      targetBoard: 15,
      entryBoard: 12,
    })
    expect(savedThrowNotes[11]).toMatchObject({
      adjustment: 'ball-down',
      leave: 'flat-10',
      speed: 17.5,
    })
  })

  it('starts the next throw with the prior throw cues while keeping the leave per throw', () => {
    renderScorer()

    fireEvent.click(screen.getByRole('button', { name: 'Strike' }))
    fireEvent.click(screen.getByRole('button', { name: 'Messenger' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Starting board' }), { target: { value: '18' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Target board' }), { target: { value: '15' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Entry at arrows' }), { target: { value: '12' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Ball speed' }), { target: { value: '17.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Flat 10' }))

    fireEvent.click(screen.getByRole('button', { name: 'Strike' }))

    expect((screen.getByRole('slider', { name: 'Starting board' }) as HTMLInputElement).value).toBe('18')
    expect((screen.getByRole('slider', { name: 'Target board' }) as HTMLInputElement).value).toBe('15')
    expect((screen.getByRole('slider', { name: 'Entry at arrows' }) as HTMLInputElement).value).toBe('12')
    expect((screen.getByRole('slider', { name: 'Ball speed' }) as HTMLInputElement).value).toBe('17.5')
    expect(screen.getByRole('button', { name: 'Messenger' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Flat 10' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('renders entry at arrows as a lane with the seven standard arrow marks', () => {
    renderScorer()
    fireEvent.click(screen.getByRole('button', { name: 'Strike' }))

    expect(document.querySelectorAll('.lane-notes-arrow-marker')).toHaveLength(7)
    expect([...document.querySelectorAll<HTMLElement>('.lane-notes-arrow-marker')].map((marker) => marker.dataset.board)).toEqual([
      '5', '10', '15', '20', '25', '30', '35',
    ])
    const arrowMarkers = [...document.querySelectorAll<HTMLElement>('.lane-notes-arrow-marker')]
    const rightmostArrow = arrowMarkers.find((marker) => marker.dataset.board === '5')!
    const leftmostArrow = arrowMarkers.find((marker) => marker.dataset.board === '35')!
    expect(Number.parseFloat(rightmostArrow.style.left)).toBeGreaterThan(Number.parseFloat(leftmostArrow.style.left))
    expect([...document.querySelectorAll<HTMLElement>('.lane-notes-arrow-scale span')].map((label) => label.textContent)).toEqual(['39', '20', '1'])
    expect(screen.getByRole('slider', { name: 'Starting board' }).getAttribute('max')).toBe('39')
    expect(screen.getByRole('slider', { name: 'Target board' }).getAttribute('max')).toBe('39')
    expect(screen.getByRole('slider', { name: 'Entry at arrows' }).getAttribute('max')).toBe('39')
    expect(screen.getByRole('slider', { name: 'Entry at arrows' }).getAttribute('aria-valuetext')).toBe('20 board')
  })

  it('clears moved-feet detail when that adjustment is deselected', async () => {
    const onSave = vi.fn()
    renderScorer(undefined, { onSave })

    fireEvent.click(screen.getByRole('button', { name: 'Strike' }))
    fireEvent.click(screen.getByRole('button', { name: 'Moved feet' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Boards moved with feet' }), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Moved feet' }))

    expect(screen.queryByRole('slider', { name: 'Boards moved with feet' })).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves a different ball assignment for a specific frame', async () => {
    const onSave = vi.fn()
    render(
      <BowlingScorer
        gameNumber={1}
        balls={[{ id: 11, name: 'Benchmark' }, { id: 12, name: 'Transition' }]}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Ball used for this game' }), { target: { value: '11' } })
    finishPerfectGame()
    fireEvent.change(screen.getByRole('combobox', { name: 'Completion ball for frame 4' }), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save 300' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const saved = JSON.parse(String(onSave.mock.calls[0]?.[0].frameData))
    expect(saved.frameBallIds).toHaveLength(10)
    expect(saved.frameBallIds[3]).toBe(12)
  })

  it('shows the default option after clearing a frame override', () => {
    render(
      <BowlingScorer
        gameNumber={1}
        balls={[{ id: 11, name: 'Benchmark' }, { id: 12, name: 'Transition' }]}
        defaultBallId="11"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const frameBall = screen.getByRole('combobox', { name: 'Ball for frame 1' }) as HTMLSelectElement
    expect(frameBall.value).toBe('')
    fireEvent.change(frameBall, { target: { value: '12' } })
    expect(frameBall.value).toBe('12')
    fireEvent.change(frameBall, { target: { value: '' } })
    expect(frameBall.value).toBe('')
  })

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

  it('opens a completed saved game on score details', () => {
    const initialFrameData = JSON.stringify({
      pinSelections: Array.from({ length: 20 }, () => [] as number[]),
    })

    renderScorer(initialFrameData)

    expect(screen.getByRole('button', { name: 'Score details' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Edit from frame 1' }))
    const closeControl = screen.getByRole('button', { name: 'Close edit confirmation' })
    const keepControl = screen.getByRole('button', { name: 'Keep score' })
    expect(closeControl).not.toBe(keepControl)
  })

  it('announces successful saves with text in the status region', async () => {
    const initialFrameData = JSON.stringify({
      pinSelections: Array.from({ length: 19 }, () => [] as number[]),
    })

    renderScorer(initialFrameData)
    fireEvent.click(screen.getByRole('button', { name: 'Record 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Game saved.'))
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
    expect(screen.getByRole('button', { name: 'Close discard confirmation' })).toBeTruthy()
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep scoring' }))
    expect(screen.queryByText('Discard this game?')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close scorer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard game' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
