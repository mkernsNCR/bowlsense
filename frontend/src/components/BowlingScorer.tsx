import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  calculateMaximumPossibleScore,
  gameFromFrameData,
  type GameState,
  initGame,
  knockPins,
  rewindToFrame,
  undoLastRoll,
} from '../utils/bowlingScore'
import { FrameRibbon, Icon, Sheet } from '../design'
import { toFrameRibbonFrames } from '../features/scoring/frameRibbon'
import { requiresDiscardConfirmation } from '../features/scoring/interaction'
import { countSplits } from '../features/scoring/splits'
import { addLaneNotes, parseLaneNotes, type LaneNotes } from '../features/scoring/laneNotes'
import FrameBallAssignments from '../features/scoring/FrameBallAssignments'
import { addFrameBallIds, emptyFrameBallIds, parseFrameBallIds, type FrameBallIds } from '../features/scoring/frameBalls'
import ThrowNotesPanel from '../features/scoring/ThrowNotesPanel'
import { addThrowNotes, carryForwardThrowNotes, parseThrowNotes, type ThrowNotes } from '../features/scoring/throwNotes'
import type { ScoringBall } from '../features/scoring/types'
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from '../features/autosave/localDraft'
import { requestJson } from '../api/requestJson'
import type { Arsenal } from '../features/gear/types'
import ShareCard from './ShareCard'
import '../features/scoring/scoring.css'

export interface SavedBowlingGame {
  gameNumber: number
  score: number
  strikes: number
  spares: number
  splits: number
  ballId: number | null
  frameData: string
  pinLeaves?: string
}

interface BowlingScorerProps {
  gameNumber: number
  balls: ScoringBall[]
  defaultBallId?: string
  initialFrameData?: string | null
  initialSplits?: number
  saving?: boolean
  autosaveId?: string
  shareContext?: {
    location?: string | null
    date?: string | null
    lanes?: string | null
  }
  onSave: (game: SavedBowlingGame) => void | Promise<void>
  onCancel: () => void
}

interface BowlingScorerDraft {
  game: SavedBowlingGame
  selectedKnocked: number[]
  arsenalId?: number | null
}

function isBowlingScorerDraft(value: unknown): value is BowlingScorerDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<BowlingScorerDraft>
  const game = draft.game as Partial<SavedBowlingGame> | undefined
  return Boolean(game)
    && typeof game?.gameNumber === 'number'
    && typeof game.score === 'number'
    && typeof game.strikes === 'number'
    && typeof game.spares === 'number'
    && typeof game.splits === 'number'
    && (game.ballId === null || typeof game.ballId === 'number')
    && typeof game.frameData === 'string'
    && Array.isArray(draft.selectedKnocked)
    && draft.selectedKnocked.every((pin) => Number.isInteger(pin) && pin >= 1 && pin <= 10)
    && (draft.arsenalId == null || typeof draft.arsenalId === 'number')
}

const pinRows = [
  [7, 8, 9, 10],
  [4, 5, 6],
  [2, 3],
  [1],
]

const perfectPinDeck = [
  [50, 70],
  [42, 54], [58, 54],
  [34, 38], [50, 38], [66, 38],
  [26, 22], [42, 22], [58, 22], [74, 22],
] as const

function activeFrameLabel(state: GameState) {
  if (state.isComplete) return 'Complete'
  return `Frame ${state.currentFrame + 1} · Ball ${state.currentBall + 1}`
}

function completeRackActionLabel(state: GameState) {
  const frame = state.frames[state.currentFrame]
  if (state.currentFrame < 9) return state.currentBall === 0 ? 'Strike' : 'Spare'
  if (state.currentBall === 0) return 'Strike'
  if (state.currentBall === 1) return frame?.isStrike ? 'Strike' : 'Spare'
  if (frame?.isStrike && frame.ball2 != null && frame.ball2 < 10) return 'Clear rack'
  return 'Strike'
}

function hasSavedPinSelections(frameData?: string | null) {
  if (!frameData) return true
  try {
    const parsed: unknown = JSON.parse(frameData)
    const selections = parsed && typeof parsed === 'object'
      ? (parsed as { pinSelections?: unknown }).pinSelections
      : undefined
    return Array.isArray(selections) && selections.length > 0
  } catch {
    return false
  }
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type DraftSaveStatus = 'idle' | 'saved' | 'error'

interface PinSwipeGesture {
  captureTarget: HTMLButtonElement
  pointerId: number
  startPin: number
  startX: number
  startY: number
  selecting: boolean
  swiping: boolean
  visitedPins: Set<number>
}

const swipeThreshold = 6

function pinButtonFromTarget(target: EventTarget | null, deck: HTMLDivElement) {
  if (!(target instanceof Element)) return null
  const button = target.closest<HTMLButtonElement>('[data-pin-number]')
  return button && deck.contains(button) && !button.disabled ? button : null
}

interface CompletionSheetBodyProps {
  saveStatus: SaveStatus
  isSaving: boolean
  canRestore: boolean
  confirmRetake: boolean
  perfectGameElements?: ReactNode
  shareButtonText?: string
  saveButtonText: string
  retakeHint: string
  onDone: () => void
  onRestore: () => void
  onUndo: () => void
  onRetake: () => void
  onShare?: () => void
  onSave: () => void | Promise<void>
  throwNotes: ThrowNotes[]
  throwCount: number
  selectedThrowIndex: number | null
  throwNotesOpen: boolean
  onToggleThrowNotes: () => void
  onSelectThrow: (index: number) => void
  onThrowNotesChange: (index: number, notes: ThrowNotes) => void
  balls: ScoringBall[]
  frameBallIds: FrameBallIds
  defaultBallId: string
  onFrameBallChange: (frameIndex: number, ballId: string) => void
}

function CompletionSheetBody({
  saveStatus,
  isSaving,
  canRestore,
  confirmRetake,
  perfectGameElements,
  shareButtonText,
  saveButtonText,
  retakeHint,
  onDone,
  onRestore,
  onUndo,
  onRetake,
  onShare,
  onSave,
  throwNotes,
  throwCount,
  selectedThrowIndex,
  throwNotesOpen,
  onToggleThrowNotes,
  onSelectThrow,
  onThrowNotesChange,
  balls,
  frameBallIds,
  defaultBallId,
  onFrameBallChange,
}: CompletionSheetBodyProps) {
  if (saveStatus === 'saved') {
    return (
      <div className="scoring-status" role="status">
        <span className="bs-visually-hidden">Game saved.</span>
        <div className="scoring-save-check"><Icon name="check" size={34} /></div>
        <button type="button" className="scoring-button primary" onClick={onDone}>Done</button>
      </div>
    )
  }

  return (
    <>
      {perfectGameElements}
      {balls.length > 0 && (
        <FrameBallAssignments
          balls={balls}
          frameBallIds={frameBallIds}
          defaultBallId={defaultBallId}
          onChange={onFrameBallChange}
        />
      )}
      <ThrowNotesPanel
        notes={throwNotes}
        throwCount={throwCount}
        selectedThrowIndex={selectedThrowIndex}
        open={throwNotesOpen}
        onToggle={onToggleThrowNotes}
        onSelectThrow={onSelectThrow}
        onChange={onThrowNotesChange}
      />
      {saveStatus === 'error' && <p className="scoring-error" role="alert">The game was not saved. Check your connection and try again.</p>}
      {canRestore && <button type="button" className="scoring-button secondary wide" style={{ marginTop: 16 }} disabled={isSaving} onClick={onRestore}>Restore original game</button>}
      <div className="scoring-sheet-actions">
        {onShare && (
          <button type="button" className="scoring-button secondary" disabled={isSaving} onClick={onShare}>
            <Icon name="share" size={18} /> {shareButtonText ?? 'Share score card'}
          </button>
        )}
        <button type="button" className="scoring-button secondary" disabled={isSaving} onClick={onUndo}>
          <Icon name="undo" size={18} /> Undo last roll
        </button>
        <button type="button" className="scoring-button secondary" disabled={isSaving} onClick={onRetake}>
          {confirmRetake ? 'Confirm retake' : 'Retake'}
        </button>
        <button type="button" className="scoring-button primary" autoFocus disabled={isSaving} onClick={onSave}>
          {isSaving ? 'Saving…' : saveButtonText}
        </button>
      </div>
      {confirmRetake && <p className="scoring-subtitle">{retakeHint}</p>}
    </>
  )
}

/** Provides interactive pin entry, scoring progress, frame editing, and game completion. */
export default function BowlingScorer({
  gameNumber,
  balls,
  defaultBallId,
  initialFrameData,
  initialSplits,
  saving = false,
  autosaveId,
  shareContext,
  onSave,
  onCancel,
}: BowlingScorerProps) {
  const draftBaseline = initialFrameData ?? null
  const restoredDraft = useMemo(
    () => autosaveId ? readLocalDraft(autosaveId, draftBaseline, isBowlingScorerDraft) : null,
    [autosaveId, draftBaseline],
  )
  const effectiveFrameData = restoredDraft?.value.game.frameData ?? initialFrameData
  const restoredGame = useMemo(() => gameFromFrameData(effectiveFrameData), [effectiveFrameData])
  const [state, setState] = useState<GameState>(restoredGame)
  const [reviewingSavedGame, setReviewingSavedGame] = useState(() => Boolean(!restoredDraft && initialFrameData && restoredGame.isComplete))
  const [selectedKnocked, setSelectedKnocked] = useState<number[]>(() => restoredDraft?.value.selectedKnocked ?? [])
  const [activeView, setActiveView] = useState<'pins' | 'scores'>(() => (
    effectiveFrameData && restoredGame.isComplete ? 'scores' : 'pins'
  ))
  const [selectedBallId, setSelectedBallId] = useState(() => restoredDraft
    ? (restoredDraft.value.game.ballId != null ? String(restoredDraft.value.game.ballId) : '')
    : (defaultBallId ?? ''))
  const [arsenals, setArsenals] = useState<Arsenal[]>([])
  const [selectedArsenalId, setSelectedArsenalId] = useState(() => restoredDraft?.value.arsenalId != null
    ? String(restoredDraft.value.arsenalId)
    : '')
  const keepScoreRef = useRef<HTMLButtonElement>(null)
  const keepScoringRef = useRef<HTMLButtonElement>(null)
  const pinSwipeRef = useRef<PinSwipeGesture | null>(null)
  const suppressPointerClickUntilRef = useRef(0)
  const [editCandidate, setEditCandidate] = useState<number | null>(null)
  const [editSnapshot, setEditSnapshot] = useState<GameState | null>(null)
  const [editingFromFrame, setEditingFromFrame] = useState<number | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmRetake, setConfirmRetake] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>(() => restoredDraft ? 'saved' : 'idle')
  const [showShareCard, setShowShareCard] = useState(false)
  const [canDeriveSplits, setCanDeriveSplits] = useState(() => hasSavedPinSelections(effectiveFrameData))
  const [laneNotes, setLaneNotes] = useState<LaneNotes>(() => parseLaneNotes(effectiveFrameData))
  const [frameBallIds, setFrameBallIds] = useState<FrameBallIds>(() => parseFrameBallIds(effectiveFrameData))
  const [frameBallSnapshot, setFrameBallSnapshot] = useState<FrameBallIds | null>(null)
  const [throwNotes, setThrowNotes] = useState<ThrowNotes[]>(() => parseThrowNotes(effectiveFrameData))
  const [selectedThrowIndex, setSelectedThrowIndex] = useState<number | null>(() => restoredGame.rolls.length ? restoredGame.rolls.length - 1 : null)
  const [throwNotesOpen, setThrowNotesOpen] = useState(() => parseThrowNotes(effectiveFrameData).some((notes) => Object.values(notes).some((value) => value != null)))
  const [throwNotesSnapshot, setThrowNotesSnapshot] = useState<ThrowNotes[] | null>(null)
  const isSaving = saving || saveStatus === 'saving'

  useEffect(() => {
    let active = true
    void requestJson<Arsenal[]>('/api/arsenals')
      .then((loaded) => {
        if (active) setArsenals(loaded)
      })
      .catch(() => {
        if (active) setArsenals([])
      })
    return () => {
      active = false
    }
  }, [])

  const selectedArsenal = arsenals.find((arsenal) => String(arsenal.id) === selectedArsenalId)
  const availableBalls = useMemo(() => {
    if (!selectedArsenal) return balls
    const allowedBallIds = new Set(selectedArsenal.ballIds ?? [])
    return balls.filter((ball) => allowedBallIds.has(ball.id))
  }, [balls, selectedArsenal])

  const scopedSelectedBallId = useMemo(
    () => selectedBallId && availableBalls.some((ball) => String(ball.id) === selectedBallId) ? selectedBallId : '',
    [availableBalls, selectedBallId],
  )
  const scopedFrameBallIds = useMemo(() => {
    const allowedBallIds = new Set(availableBalls.map((ball) => ball.id))
    return frameBallIds.map((ballId) => ballId != null && !allowedBallIds.has(ballId) ? null : ballId)
  }, [availableBalls, frameBallIds])

  const handleArsenalChange = (arsenalId: string) => {
    const nextArsenal = arsenals.find((arsenal) => String(arsenal.id) === arsenalId)
    const allowedBallIds = new Set(nextArsenal ? nextArsenal.ballIds ?? [] : balls.map((ball) => ball.id))
    setSelectedArsenalId(arsenalId)
    setSelectedBallId((current) => current && allowedBallIds.has(Number(current)) ? current : '')
    setFrameBallIds((current) => {
      const sanitized = current.map((ballId) => ballId != null && !allowedBallIds.has(ballId) ? null : ballId)
      return sanitized.every((ballId, index) => ballId === current[index]) ? current : sanitized
    })
  }

  useEffect(() => {
    const previousHtmlOverflowX = document.documentElement.style.overflowX
    const previousBodyOverflowX = document.body.style.overflowX
    document.documentElement.style.overflowX = 'clip'
    document.body.style.overflowX = 'clip'
    return () => {
      document.documentElement.style.overflowX = previousHtmlOverflowX
      document.body.style.overflowX = previousBodyOverflowX
    }
  }, [])

  const selectedBall = availableBalls.find((ball) => String(ball.id) === scopedSelectedBallId)
  const currentFrameBallId = scopedFrameBallIds[state.currentFrame] == null ? '' : String(scopedFrameBallIds[state.currentFrame])
  const strikes = useMemo(
    () => state.frames.reduce((count, frame, index) => {
      if (index < 9) return count + (frame.isStrike ? 1 : 0)
      return count + [frame.ball1, frame.ball2, frame.ball3].filter((roll) => roll === 10).length
    }, 0),
    [state.frames],
  )
  const spares = useMemo(() => state.frames.filter((frame) => frame.isSpare).length, [state.frames])
  const derivedSplits = useMemo(() => countSplits(state.pinSelections), [state.pinSelections])
  const splits = canDeriveSplits ? derivedSplits : (restoredDraft?.value.game.splits ?? initialSplits ?? 0)
  const baseFrameData = JSON.stringify({
    rolls: state.rolls,
    frames: state.frames,
    pinSelections: state.pinSelections,
    splits,
  })
  const frameWithLegacyNotes = addLaneNotes(baseFrameData, laneNotes)
  const frameWithThrowNotes = addThrowNotes(frameWithLegacyNotes, throwNotes.slice(0, state.rolls.length))
  const frameData = addFrameBallIds(frameWithThrowNotes, scopedFrameBallIds)
  const hasDraftProgress = !reviewingSavedGame && (
    state.rolls.length > 0
    || selectedKnocked.length > 0
    || scopedSelectedBallId !== (defaultBallId ?? '')
    || selectedArsenalId !== ''
    || scopedFrameBallIds.some((ballId) => ballId != null)
  )

  useEffect(() => {
    if (!autosaveId || reviewingSavedGame) return
    if (!hasDraftProgress) {
      clearLocalDraft(autosaveId)
      return
    }

    let active = true
    const saved = writeLocalDraft(autosaveId, draftBaseline, {
      game: {
        gameNumber,
        score: state.totalScore,
        strikes,
        spares,
        splits,
        ballId: scopedSelectedBallId ? Number(scopedSelectedBallId) : null,
        frameData,
        pinLeaves: JSON.stringify(state.pinSelections),
      },
      selectedKnocked,
      arsenalId: selectedArsenalId ? Number(selectedArsenalId) : null,
    } satisfies BowlingScorerDraft)
    queueMicrotask(() => {
      if (active) setDraftSaveStatus(saved ? 'saved' : 'error')
    })
    return () => {
      active = false
    }
  }, [
    autosaveId,
    draftBaseline,
    frameData,
    gameNumber,
    hasDraftProgress,
    reviewingSavedGame,
    selectedArsenalId,
    scopedSelectedBallId,
    selectedKnocked,
    spares,
    splits,
    state.pinSelections,
    state.totalScore,
    strikes,
  ])
  const maximumPossibleScore = useMemo(() => calculateMaximumPossibleScore(state), [state])
  const ribbonFrames = toFrameRibbonFrames(
    state.frames,
    state.isComplete ? undefined : state.currentFrame,
    state.isComplete ? undefined : maximumPossibleScore,
  )

  const savePayload = (): SavedBowlingGame => ({
    gameNumber,
    score: state.totalScore,
    strikes,
    spares,
    splits,
    ballId: scopedSelectedBallId ? Number(scopedSelectedBallId) : null,
    frameData,
    pinLeaves: JSON.stringify(state.pinSelections),
  })

  const recordRoll = (pins: number[]) => {
    const throwIndex = state.rolls.length
    setReviewingSavedGame(false)
    setState((current) => knockPins(current, pins))
    setThrowNotes((current) => {
      if (current.length > throwIndex) return current
      const previous = current[throwIndex - 1]
      return [...current, previous ? carryForwardThrowNotes(previous) : {}]
    })
    setSelectedThrowIndex(throwIndex)
    setThrowNotesOpen(true)
    setSelectedKnocked([])
    setConfirmRetake(false)
    setSaveStatus('idle')
  }

  const updateFrameBall = (frameIndex: number, ballId: string) => {
    setFrameBallIds((current) => {
      const next = current.slice()
      next[frameIndex] = ballId ? Number(ballId) : null
      return next
    })
  }

  const setPinSelected = (pin: number, selected: boolean) => {
    setSelectedKnocked((current) => {
      const alreadySelected = current.includes(pin)
      if (selected === alreadySelected) return current
      return selected ? [...current, pin] : current.filter((item) => item !== pin)
    })
  }

  const beginPinSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.isPrimary === false || event.button !== 0) return
    const pinButton = pinButtonFromTarget(event.target, event.currentTarget)
    if (!pinButton) return

    const startPin = Number(pinButton.dataset.pinNumber)
    pinSwipeRef.current = {
      captureTarget: pinButton,
      pointerId: event.pointerId,
      startPin,
      startX: event.clientX,
      startY: event.clientY,
      selecting: !selectedKnocked.includes(startPin),
      swiping: false,
      visitedPins: new Set(),
    }
    pinButton.setPointerCapture?.(event.pointerId)
  }

  const continuePinSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pinSwipeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    if (!gesture.swiping) {
      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
      if (distance < swipeThreshold) return
      gesture.swiping = true
      gesture.visitedPins.add(gesture.startPin)
      setPinSelected(gesture.startPin, gesture.selecting)
    }

    const target = document.elementFromPoint?.(event.clientX, event.clientY) ?? event.target
    const pinButton = pinButtonFromTarget(target, event.currentTarget)
    if (!pinButton) return

    const pin = Number(pinButton.dataset.pinNumber)
    if (gesture.visitedPins.has(pin)) return
    gesture.visitedPins.add(pin)
    setPinSelected(pin, gesture.selecting)
  }

  const endPinSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pinSwipeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    if (gesture.swiping && event.type === 'pointerup') {
      suppressPointerClickUntilRef.current = Date.now() + 500
    }
    pinSwipeRef.current = null
    if (gesture.captureTarget.hasPointerCapture?.(event.pointerId)) {
      gesture.captureTarget.releasePointerCapture(event.pointerId)
    }
  }

  const restoreBeforeEdit = () => {
    if (!editSnapshot) return
    setState(editSnapshot)
    if (frameBallSnapshot) setFrameBallIds(frameBallSnapshot)
    if (throwNotesSnapshot) setThrowNotes(throwNotesSnapshot)
    setSelectedThrowIndex(editSnapshot.rolls.length ? editSnapshot.rolls.length - 1 : null)
    setReviewingSavedGame(editSnapshot.isComplete)
    setEditSnapshot(null)
    setFrameBallSnapshot(null)
    setThrowNotesSnapshot(null)
    setEditingFromFrame(null)
    setSelectedKnocked([])
  }

  const beginFrameEdit = () => {
    if (editCandidate == null) return
    const rewoundState = rewindToFrame(state, editCandidate)
    setEditSnapshot((current) => current ?? state)
    setFrameBallSnapshot((current) => current ?? scopedFrameBallIds)
    setThrowNotesSnapshot((current) => current ?? throwNotes)
    setState(rewoundState)
    setFrameBallIds((current) => current.map((ballId, index) => index < editCandidate ? ballId : null))
    setThrowNotes((current) => current.slice(0, rewoundState.rolls.length))
    setSelectedThrowIndex(rewoundState.rolls.length ? rewoundState.rolls.length - 1 : null)
    setReviewingSavedGame(false)
    setEditingFromFrame(editCandidate)
    setEditCandidate(null)
    setSelectedKnocked([])
    setActiveView('pins')
  }

  const handleUndo = () => {
    if (isSaving) return
    const nextState = undoLastRoll(state)
    setReviewingSavedGame(false)
    setState(nextState)
    setThrowNotes((current) => current.slice(0, nextState.rolls.length))
    setSelectedThrowIndex(nextState.rolls.length ? nextState.rolls.length - 1 : null)
    setSelectedKnocked([])
    setConfirmRetake(false)
    setSaveStatus('idle')
  }

  const handleCancel = () => {
    if (isSaving) return
    if (reviewingSavedGame) {
      onCancel()
      return
    }
    if (requiresDiscardConfirmation({
      recordedRolls: state.rolls.length,
      savedAsideRolls: editSnapshot?.rolls.length,
    })) {
      setConfirmCancel(true)
      return
    }
    if (autosaveId) clearLocalDraft(autosaveId)
    onCancel()
  }

  const handleSave = async () => {
    if (isSaving) return
    setSaveStatus('saving')
    try {
      await onSave(savePayload())
      if (autosaveId) clearLocalDraft(autosaveId)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  const handleRetake = () => {
    if (isSaving) return
    if (!confirmRetake) {
      setConfirmRetake(true)
      return
    }
    setState(initGame())
    setReviewingSavedGame(false)
    setSelectedKnocked([])
    setEditSnapshot(null)
    setFrameBallSnapshot(null)
    setThrowNotesSnapshot(null)
    setEditingFromFrame(null)
    setCanDeriveSplits(true)
    setLaneNotes({})
    setFrameBallIds(emptyFrameBallIds())
    setThrowNotes([])
    setSelectedThrowIndex(null)
    setThrowNotesSnapshot(null)
    setThrowNotesOpen(false)
    setConfirmRetake(false)
    setSaveStatus('idle')
  }

  const completeRackLabel = completeRackActionLabel(state)
  const selectedCount = selectedKnocked.length
  const updateThrowNote = (index: number, next: ThrowNotes) => {
    setThrowNotes((current) => {
      const nextNotes = current.slice()
      while (nextNotes.length <= index) nextNotes.push({})
      nextNotes[index] = next
      return nextNotes
    })
  }

  return (
    <div className="scoring-flow live-scorer">
      <div className="live-score-sticky">
        <header className="live-score-header" aria-label="Current game status">
          <div className="live-score-context">
            <span>Game {gameNumber}</span>
            <strong>{activeFrameLabel(state)}</strong>
          </div>
          <div className="live-score-total" aria-live="polite">
            <span>Total</span>
            <strong>{state.totalScore}</strong>
          </div>
          <button type="button" className="scoring-icon-button" onClick={handleCancel} aria-label="Close scorer">
            <Icon name="back" />
          </button>
        </header>

        <FrameRibbon
          frames={ribbonFrames}
          label={`Game ${gameNumber} frame ribbon`}
          compact
          className="live-frame-ribbon"
        />

        <div className="live-ball">
          {arsenals.length > 0 && (
            <div className="live-ball__control live-ball__control--arsenal">
              <label htmlFor={`arsenal-${gameNumber}`}>Arsenal</label>
              <select
                id={`arsenal-${gameNumber}`}
                value={selectedArsenalId}
                onChange={(event) => handleArsenalChange(event.target.value)}
                aria-label="Arsenal for this game"
              >
                <option value="">All saved balls</option>
                {arsenals.map((arsenal) => <option key={arsenal.id} value={arsenal.id}>{arsenal.name} · {arsenal.ballIds?.length ?? 0} balls</option>)}
              </select>
              <span className="live-ball__hint">
                {selectedArsenal ? `${availableBalls.length} ball${availableBalls.length === 1 ? '' : 's'} available from this arsenal` : 'Choose an arsenal to limit ball choices'}
              </span>
            </div>
          )}
          <div className="live-ball__control">
            <label htmlFor={`ball-default-${gameNumber}`}>Default ball</label>
            <select
              id={`ball-default-${gameNumber}`}
              value={scopedSelectedBallId}
              onChange={(event) => setSelectedBallId(event.target.value)}
              aria-label="Ball used for this game"
            >
              <option value="">Not selected</option>
              {availableBalls.map((ball) => (
                <option key={ball.id} value={ball.id}>{ball.brand ? `${ball.name} · ${ball.brand}` : ball.name}</option>
              ))}
            </select>
          </div>
          <div className="live-ball__control">
            <label htmlFor={`ball-frame-${gameNumber}`}>Frame {state.currentFrame + 1}</label>
            <select
              id={`ball-frame-${gameNumber}`}
              value={currentFrameBallId}
              onChange={(event) => updateFrameBall(state.currentFrame, event.target.value)}
              aria-label={`Ball for frame ${state.currentFrame + 1}`}
            >
              <option value="">Use default{selectedBall ? ` · ${selectedBall.name}` : ' · no ball selected'}</option>
              {availableBalls.map((ball) => (
                <option key={ball.id} value={ball.id}>{ball.brand ? `${ball.name} · ${ball.brand}` : ball.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {editingFromFrame != null && (
        <div className="live-edit-banner" role="status">
          <span>Editing from frame {editingFromFrame + 1}. Later rolls are set aside.</span>
          <button type="button" className="scoring-button quiet" onClick={restoreBeforeEdit}>Restore</button>
        </div>
      )}

      {autosaveId && hasDraftProgress && (
        <div className={`live-autosave-status${draftSaveStatus === 'error' ? ' is-error' : ''}`} role="status">
          <Icon name={draftSaveStatus === 'error' ? 'warning' : 'check'} size={15} />
          <span>{draftSaveStatus === 'error'
            ? 'Draft could not be saved on this device. Keep this page open and check browser storage.'
            : restoredDraft
              ? 'Draft restored · changes save automatically on this device.'
              : draftSaveStatus === 'saved'
                ? 'Draft saved automatically on this device.'
                : 'Saving draft on this device…'}</span>
        </div>
      )}

      {reviewingSavedGame && (
        <div className="live-edit-banner" role="status">
          <span>Open Score details and select a completed frame to re-score from that point.</span>
          <button type="button" className="scoring-button quiet" onClick={handleCancel}>Done</button>
        </div>
      )}

      <div className="scoring-segments scoring-mode" role="group" aria-label="Scoring view">
        <button type="button" className="scoring-segment" aria-pressed={activeView === 'pins'} onClick={() => setActiveView('pins')}>Pins</button>
        <button type="button" className="scoring-segment" aria-pressed={activeView === 'scores'} onClick={() => setActiveView('scores')}>Score details</button>
      </div>

      {(!state.isComplete || reviewingSavedGame) && (
        <ThrowNotesPanel
          notes={throwNotes}
          throwCount={state.rolls.length}
          selectedThrowIndex={selectedThrowIndex}
          open={throwNotesOpen}
          onToggle={() => setThrowNotesOpen((open) => !open)}
          onSelectThrow={setSelectedThrowIndex}
          onChange={updateThrowNote}
        />
      )}

      {activeView === 'pins' && !state.isComplete && (
        <>
          <div
            className="pin-deck"
            role="group"
            aria-label="Select pins knocked down"
            onPointerDown={beginPinSwipe}
            onPointerMove={continuePinSwipe}
            onPointerUp={endPinSwipe}
            onPointerCancel={endPinSwipe}
          >
            {pinRows.map((row) => (
              <div className="pin-row" key={row.join('-')}>
                {row.map((pin) => {
                  const isStanding = state.pinsStanding.includes(pin)
                  const isSelected = selectedKnocked.includes(pin)
                  return (
                    <button
                      type="button"
                      key={pin}
                      className="pin-control"
                      disabled={!isStanding}
                      data-pin-number={pin}
                      aria-pressed={isSelected}
                      aria-label={`Pin ${pin}${isSelected ? ', selected as knocked down' : ''}`}
                      onClick={(event) => {
                        if (event.detail !== 0 && Date.now() < suppressPointerClickUntilRef.current) return
                        setPinSelected(pin, !isSelected)
                      }}
                    >
                      <span className="pin-number">{pin}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="live-actions">
            <button
              type="button"
              className="scoring-button strike"
              onClick={() => recordRoll(state.pinsStanding)}
              disabled={state.pinsStanding.length === 0}
            >
              {completeRackLabel}
            </button>
            <button type="button" className="scoring-button record" onClick={() => recordRoll(selectedKnocked)}>
              {selectedCount === 0 ? 'Record 0' : `Record ${selectedCount}`}
            </button>
            <button
              type="button"
              className="scoring-button secondary"
              onClick={handleUndo}
              disabled={state.rolls.length === 0}
            >
              <Icon name="undo" size={18} /> Undo
            </button>
          </div>
          <p className="live-help">
            Tap pins or swipe across them to mark what fell, then record. Undo is available after every roll.
          </p>
        </>
      )}

      {activeView === 'scores' && (
        <div className="live-summary">
          {state.frames.map((frame, index) => (
            <div className="live-summary-row" key={index}>
              <button
                type="button"
                className="live-summary-edit scoring-row-action"
                disabled={frame.ball1 == null}
                onClick={() => setEditCandidate(index)}
                aria-label={frame.ball1 == null ? `Frame ${index + 1}, not started` : `Edit from frame ${index + 1}`}
              >
                <span>Frame {index + 1}</span>
                <strong>{frame.cumulative ?? '—'}</strong>
                <Icon name="chevron-right" size={16} />
              </button>
              <select
                aria-label={`Ball for frame ${index + 1}`}
                value={scopedFrameBallIds[index] == null ? '' : String(scopedFrameBallIds[index])}
                disabled={frame.ball1 == null && index !== state.currentFrame}
                onChange={(event) => updateFrameBall(index, event.target.value)}
              >
                <option value="">Default{selectedBall ? ` · ${selectedBall.name}` : ''}</option>
                {availableBalls.map((ball) => <option key={ball.id} value={ball.id}>{ball.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {state.isComplete && !reviewingSavedGame && state.totalScore !== 300 && (
        <Sheet
          open
          closeDisabled={isSaving}
          onClose={() => { if (saveStatus === 'saved') onCancel(); else setConfirmCancel(true) }}
          title={saveStatus === 'saved' ? 'Game saved' : `${state.totalScore}`}
          description={saveStatus === 'saved'
            ? `Your ${state.totalScore} is in this session.`
            : `${strikes} strikes · ${spares} spares${selectedBall ? ` · ${selectedBall.name}` : ''}`}
          closeLabel={saveStatus === 'saved' ? 'Done' : 'Close completed game'}
          className="scoring-sheet-theme"
        >
          <CompletionSheetBody
            saveStatus={saveStatus}
            isSaving={isSaving}
            canRestore={Boolean(editSnapshot)}
            confirmRetake={confirmRetake}
            saveButtonText="Save game"
            retakeHint="Retaking clears every recorded roll. Tap “Confirm retake” to continue."
            onDone={onCancel}
            onRestore={restoreBeforeEdit}
            onUndo={handleUndo}
            onRetake={handleRetake}
            onSave={handleSave}
            throwNotes={throwNotes}
            throwCount={state.rolls.length}
            selectedThrowIndex={selectedThrowIndex}
            throwNotesOpen={throwNotesOpen}
            onToggleThrowNotes={() => setThrowNotesOpen((open) => !open)}
            onSelectThrow={setSelectedThrowIndex}
            onThrowNotesChange={updateThrowNote}
            balls={availableBalls}
            frameBallIds={scopedFrameBallIds}
            defaultBallId={scopedSelectedBallId}
            onFrameBallChange={updateFrameBall}
          />
        </Sheet>
      )}

      {editCandidate != null && (
        <Sheet
          open
          closeDisabled={isSaving}
          onClose={() => setEditCandidate(null)}
          role="alertdialog"
          title={`Edit from frame ${editCandidate + 1}?`}
          description={`This temporarily removes frame ${editCandidate + 1} and every later roll so bonuses stay correct. You can restore the original game at any time.`}
          closeLabel="Close edit confirmation"
          className="scoring-sheet-theme"
          initialFocusRef={keepScoreRef}
        >
          <div className="scoring-sheet-actions">
            <button ref={keepScoreRef} type="button" className="scoring-button secondary" onClick={() => setEditCandidate(null)}>Keep score</button>
            <button type="button" className="scoring-button primary" onClick={beginFrameEdit}>Edit from here</button>
          </div>
        </Sheet>
      )}

      {confirmCancel && (
        <Sheet
          open
          onClose={() => setConfirmCancel(false)}
          role="alertdialog"
          title={initialFrameData ? 'Discard changes?' : 'Discard this game?'}
          description={initialFrameData
            ? 'The saved game stays unchanged.'
            : `All ${Math.max(state.rolls.length, editSnapshot?.rolls.length ?? 0)} recorded ${Math.max(state.rolls.length, editSnapshot?.rolls.length ?? 0) === 1 ? 'roll' : 'rolls'} will be lost.`}
          closeLabel="Close discard confirmation"
          className="scoring-sheet-theme"
          initialFocusRef={keepScoringRef}
        >
          <div className="scoring-sheet-actions">
            <button ref={keepScoringRef} type="button" className="scoring-button secondary" onClick={() => setConfirmCancel(false)}>Keep scoring</button>
            <button
              type="button"
              className="scoring-button danger"
              onClick={() => {
                if (autosaveId) clearLocalDraft(autosaveId)
                onCancel()
              }}
            >
              {initialFrameData ? 'Discard changes' : 'Discard game'}
            </button>
          </div>
        </Sheet>
      )}

      {state.isComplete && !reviewingSavedGame && state.totalScore === 300 && (
        <Sheet
          open
          closeDisabled={isSaving}
          onClose={() => { if (saveStatus === 'saved') onCancel(); else setConfirmCancel(true) }}
          title={saveStatus === 'saved' ? 'Perfect game saved' : 'Perfect game'}
          description={saveStatus === 'saved' ? undefined : 'Every frame held. This one belongs in your history.'}
          closeLabel={saveStatus === 'saved' ? 'Done' : 'Close perfect game'}
          className="scoring-sheet-theme perfect-lane"
          backdropClassName="perfect-lane-backdrop"
        >
          <CompletionSheetBody
            saveStatus={saveStatus}
            isSaving={isSaving}
            canRestore={Boolean(editSnapshot)}
            confirmRetake={confirmRetake}
            perfectGameElements={(
              <>
                <div className="perfect-lane-spotlight" aria-hidden="true">
                  {perfectPinDeck.map(([left, top], index) => (
                    <span key={index} style={{ left: `${left}%`, top: `${top}%` }} />
                  ))}
                </div>
                <p className="scoring-eyebrow">Twelve strikes</p>
                <div className="perfect-lane-score" aria-label="Perfect score 300">300</div>
              </>
            )}
            shareButtonText="Share 300"
            saveButtonText="Save 300"
            retakeHint="Retaking clears the perfect game. Tap “Confirm retake” to continue."
            onDone={onCancel}
            onRestore={restoreBeforeEdit}
            onUndo={handleUndo}
            onRetake={handleRetake}
            onShare={() => setShowShareCard(true)}
            onSave={handleSave}
            throwNotes={throwNotes}
            throwCount={state.rolls.length}
            selectedThrowIndex={selectedThrowIndex}
            throwNotesOpen={throwNotesOpen}
            onToggleThrowNotes={() => setThrowNotesOpen((open) => !open)}
            onSelectThrow={setSelectedThrowIndex}
            onThrowNotesChange={updateThrowNote}
            balls={availableBalls}
            frameBallIds={scopedFrameBallIds}
            defaultBallId={scopedSelectedBallId}
            onFrameBallChange={updateFrameBall}
          />
        </Sheet>
      )}

      {showShareCard && state.isComplete && state.totalScore === 300 && (
        <ShareCard
          game={{
            gameNumber,
            score: state.totalScore,
            strikes,
            spares,
            splits,
            frameData,
          }}
          session={{
            location: shareContext?.location?.trim() || 'Unknown Alley',
            date: shareContext?.date || '',
            lanes: shareContext?.lanes || undefined,
          }}
          ballName={selectedBall?.name}
          onClose={() => setShowShareCard(false)}
        />
      )}
    </div>
  )
}
