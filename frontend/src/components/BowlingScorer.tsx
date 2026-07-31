import { useEffect, useMemo, useState } from 'react'
import {
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
import type { ScoringBall } from '../features/scoring/types'
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
  saving?: boolean
  onSave: (game: SavedBowlingGame) => void | Promise<void>
  onCancel: () => void
}

const pinRows = [
  [7, 8, 9, 10],
  [4, 5, 6],
  [2, 3],
  [1],
]

function activeFrameLabel(state: GameState) {
  if (state.isComplete) return 'Complete'
  return `Frame ${state.currentFrame + 1} · Ball ${state.currentBall + 1}`
}

export default function BowlingScorer({
  gameNumber,
  balls,
  defaultBallId,
  initialFrameData,
  saving = false,
  onSave,
  onCancel,
}: BowlingScorerProps) {
  const [state, setState] = useState<GameState>(() => gameFromFrameData(initialFrameData))
  const [reviewingSavedGame, setReviewingSavedGame] = useState(() => Boolean(initialFrameData && gameFromFrameData(initialFrameData).isComplete))
  const [selectedKnocked, setSelectedKnocked] = useState<number[]>([])
  const [activeView, setActiveView] = useState<'pins' | 'scores'>('pins')
  const [selectedBallId, setSelectedBallId] = useState(defaultBallId ?? '')
  const [editCandidate, setEditCandidate] = useState<number | null>(null)
  const [editSnapshot, setEditSnapshot] = useState<GameState | null>(null)
  const [editingFromFrame, setEditingFromFrame] = useState<number | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmRetake, setConfirmRetake] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const isSaving = saving || saveStatus === 'saving'

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

  const selectedBall = balls.find((ball) => String(ball.id) === selectedBallId)
  const strikes = useMemo(
    () => state.frames.reduce((count, frame, index) => {
      if (index < 9) return count + (frame.isStrike ? 1 : 0)
      return count + [frame.ball1, frame.ball2, frame.ball3].filter((roll) => roll === 10).length
    }, 0),
    [state.frames],
  )
  const spares = useMemo(() => state.frames.filter((frame) => frame.isSpare).length, [state.frames])
  const frameData = JSON.stringify({
    rolls: state.rolls,
    frames: state.frames,
    pinSelections: state.pinSelections,
  })
  const ribbonFrames = toFrameRibbonFrames(
    state.frames,
    state.isComplete ? undefined : state.currentFrame,
  )

  const savePayload = (): SavedBowlingGame => ({
    gameNumber,
    score: state.totalScore,
    strikes,
    spares,
    splits: 0,
    ballId: selectedBallId ? Number(selectedBallId) : null,
    frameData,
    pinLeaves: JSON.stringify(state.pinSelections),
  })

  const recordRoll = (pins: number[]) => {
    setReviewingSavedGame(false)
    setState((current) => knockPins(current, pins))
    setSelectedKnocked([])
    setSaveStatus('idle')
  }

  const restoreBeforeEdit = () => {
    if (!editSnapshot) return
    setState(editSnapshot)
    setReviewingSavedGame(editSnapshot.isComplete)
    setEditSnapshot(null)
    setEditingFromFrame(null)
    setSelectedKnocked([])
  }

  const beginFrameEdit = () => {
    if (editCandidate == null) return
    setEditSnapshot((current) => current ?? state)
    setState(rewindToFrame(state, editCandidate))
    setReviewingSavedGame(false)
    setEditingFromFrame(editCandidate)
    setEditCandidate(null)
    setSelectedKnocked([])
    setActiveView('pins')
  }

  const handleUndo = () => {
    if (isSaving) return
    setReviewingSavedGame(false)
    setState((current) => undoLastRoll(current))
    setSelectedKnocked([])
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
    onCancel()
  }

  const handleSave = async () => {
    if (isSaving) return
    setSaveStatus('saving')
    try {
      await onSave(savePayload())
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
    setEditingFromFrame(null)
    setConfirmRetake(false)
    setSaveStatus('idle')
  }

  const allStanding = state.pinsStanding.length === 10
  const completeRackLabel = allStanding ? 'Strike' : 'Spare'
  const selectedCount = selectedKnocked.length

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
          <label htmlFor={`ball-${gameNumber}`}>Ball</label>
          <select
            id={`ball-${gameNumber}`}
            value={selectedBallId}
            onChange={(event) => setSelectedBallId(event.target.value)}
            aria-label="Ball used for this game"
          >
            <option value="">Not selected</option>
            {balls.map((ball) => (
              <option key={ball.id} value={ball.id}>{ball.brand ? `${ball.name} · ${ball.brand}` : ball.name}</option>
            ))}
          </select>
        </div>
      </div>

      {editingFromFrame != null && (
        <div className="live-edit-banner" role="status">
          <span>Editing from frame {editingFromFrame + 1}. Later rolls are set aside.</span>
          <button type="button" className="scoring-button quiet" onClick={restoreBeforeEdit}>Restore</button>
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

      {activeView === 'pins' && !state.isComplete && (
        <>
          <div className="pin-deck" role="group" aria-label="Select pins knocked down">
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
                      aria-pressed={isSelected}
                      aria-label={`Pin ${pin}${isSelected ? ', selected as knocked down' : ''}`}
                      onClick={() => setSelectedKnocked((current) => (
                        current.includes(pin) ? current.filter((item) => item !== pin) : [...current, pin]
                      ))}
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
            Tap every pin that fell, then record. Undo is available after every roll.
          </p>
        </>
      )}

      {activeView === 'scores' && (
        <div className="live-summary">
          {state.frames.map((frame, index) => (
            <button
              type="button"
              className="live-summary-row scoring-row-action"
              key={index}
              disabled={frame.ball1 == null}
              onClick={() => setEditCandidate(index)}
              aria-label={frame.ball1 == null ? `Frame ${index + 1}, not started` : `Edit from frame ${index + 1}`}
            >
              <span>Frame {index + 1}</span>
              <strong>{frame.cumulative ?? '—'}</strong>
              <Icon name="chevron-right" size={16} />
            </button>
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
          {saveStatus === 'saved' ? (
            <div className="scoring-status" role="status">
              <div className="scoring-save-check"><Icon name="check" size={34} /></div>
              <button type="button" className="scoring-button primary" onClick={onCancel}>Done</button>
            </div>
          ) : (
            <>
              {saveStatus === 'error' && <p className="scoring-error" role="alert">The game was not saved. Check your connection and try again.</p>}
              {editSnapshot && <button type="button" className="scoring-button secondary wide" style={{ marginTop: 16 }} disabled={isSaving} onClick={restoreBeforeEdit}>Restore original game</button>}
              <div className="scoring-sheet-actions">
                <button type="button" className="scoring-button secondary" disabled={isSaving} onClick={handleUndo}>
                  <Icon name="undo" size={18} /> Undo last roll
                </button>
                <button type="button" className="scoring-button secondary" disabled={isSaving} onClick={handleRetake}>
                  {confirmRetake ? 'Confirm retake' : 'Retake'}
                </button>
                <button type="button" className="scoring-button primary" autoFocus disabled={isSaving} onClick={handleSave}>
                  {isSaving ? 'Saving…' : 'Save game'}
                </button>
              </div>
              {confirmRetake && <p className="scoring-subtitle">Retaking clears every recorded roll. Tap “Confirm retake” to continue.</p>}
            </>
          )}
        </Sheet>
      )}

      {editCandidate != null && (
        <Sheet
          open
          closeDisabled={isSaving}
          onClose={() => setEditCandidate(null)}
          title={`Edit from frame ${editCandidate + 1}?`}
          description={`This temporarily removes frame ${editCandidate + 1} and every later roll so bonuses stay correct. You can restore the original game at any time.`}
          closeLabel="Keep score"
          className="scoring-sheet-theme"
        >
          <div className="scoring-sheet-actions">
            <button type="button" className="scoring-button secondary" autoFocus onClick={() => setEditCandidate(null)}>Keep score</button>
            <button type="button" className="scoring-button primary" onClick={beginFrameEdit}>Edit from here</button>
          </div>
        </Sheet>
      )}

      {confirmCancel && (
        <Sheet
          open
          onClose={() => setConfirmCancel(false)}
          title={initialFrameData ? 'Discard changes?' : 'Discard this game?'}
          description={initialFrameData
            ? 'The saved game stays unchanged.'
            : `All ${Math.max(state.rolls.length, editSnapshot?.rolls.length ?? 0)} recorded ${Math.max(state.rolls.length, editSnapshot?.rolls.length ?? 0) === 1 ? 'roll' : 'rolls'} will be lost.`}
          closeLabel="Keep scoring"
          className="scoring-sheet-theme"
        >
          <div className="scoring-sheet-actions">
            <button type="button" className="scoring-button secondary" autoFocus onClick={() => setConfirmCancel(false)}>Keep scoring</button>
            <button type="button" className="scoring-button danger" onClick={onCancel}>{initialFrameData ? 'Discard changes' : 'Discard game'}</button>
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
        >
          {saveStatus === 'saved' ? (
            <div className="scoring-status" role="status">
              <div className="scoring-save-check"><Icon name="check" size={34} /></div>
              <button type="button" className="scoring-button primary" onClick={onCancel}>Done</button>
            </div>
          ) : (
            <>
              <p className="scoring-eyebrow">Twelve strikes</p>
              <div className="perfect-lane-score" aria-label="Perfect score 300">300</div>
              {saveStatus === 'error' && <p className="scoring-error" role="alert">The game was not saved. Check your connection and try again.</p>}
              {editSnapshot && <button type="button" className="scoring-button secondary wide" style={{ marginTop: 16 }} disabled={isSaving} onClick={restoreBeforeEdit}>Restore original game</button>}
              <div className="scoring-sheet-actions">
                <button type="button" className="scoring-button secondary" disabled={isSaving} onClick={handleUndo}><Icon name="undo" size={18} /> Undo last roll</button>
                <button type="button" className="scoring-button secondary" disabled={isSaving} onClick={handleRetake}>{confirmRetake ? 'Confirm retake' : 'Retake'}</button>
                <button type="button" className="scoring-button primary" autoFocus disabled={isSaving} onClick={handleSave}>{isSaving ? 'Saving…' : 'Save 300'}</button>
              </div>
              {confirmRetake && <p className="scoring-subtitle">Retaking clears the perfect game. Tap “Confirm retake” to continue.</p>}
            </>
          )}
        </Sheet>
      )}
    </div>
  )
}
