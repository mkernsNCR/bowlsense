import { useMemo, useState } from 'react'
import {
  gameFromFrameData,
  type GameState,
  initGame,
  knockPins,
  rewindToFrame,
  undoLastRoll,
} from '../utils/bowlingScore'
import FrameRibbon from '../features/scoring/FrameRibbon'
import ScoringIcon from '../features/scoring/ScoringIcon'
import ScoringSheet from '../features/scoring/ScoringSheet'
import '../features/scoring/scoring.css'

interface Ball {
  id: number
  name: string
  brand?: string
  thumbnailImage?: string
}

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
  balls: Ball[]
  defaultBallId?: string
  initialFrameData?: string | null
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
    setReviewingSavedGame(false)
    setState((current) => undoLastRoll(current))
    setSelectedKnocked([])
    setSaveStatus('idle')
  }

  const handleCancel = () => {
    if (reviewingSavedGame) {
      onCancel()
      return
    }
    if (state.rolls.length > 0) {
      setConfirmCancel(true)
      return
    }
    onCancel()
  }

  const handleSave = async () => {
    setSaveStatus('saving')
    try {
      await onSave(savePayload())
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  const handleRetake = () => {
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
          <ScoringIcon name="arrow-left" />
        </button>
      </header>

      <FrameRibbon
        frames={state.frames}
        currentFrame={state.isComplete ? undefined : state.currentFrame}
        onSelectFrame={(index) => setEditCandidate(index)}
        label={`Game ${gameNumber} frame ribbon. Select a completed frame to edit from that point.`}
      />

      {editingFromFrame != null && (
        <div className="live-edit-banner" role="status">
          <span>Editing from frame {editingFromFrame + 1}. Later rolls are set aside.</span>
          <button type="button" className="scoring-button quiet" onClick={restoreBeforeEdit}>Restore</button>
        </div>
      )}

      {reviewingSavedGame && (
        <div className="live-edit-banner" role="status">
          <span>Select a completed frame in the ribbon to re-score from that point.</span>
          <button type="button" className="scoring-button quiet" onClick={handleCancel}>Done</button>
        </div>
      )}

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
              <ScoringIcon name="undo" size={18} /> Undo
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
              <ScoringIcon name="chevron" size={16} />
            </button>
          ))}
        </div>
      )}

      {state.isComplete && !reviewingSavedGame && state.totalScore !== 300 && (
        <ScoringSheet open title={saveStatus === 'saved' ? 'Game saved' : 'Game complete'} dismissible={false}>
          {saveStatus === 'saved' ? (
            <div className="scoring-status" role="status">
              <div className="scoring-save-check"><ScoringIcon name="check" size={34} /></div>
              <p>Your {state.totalScore} is in this session.</p>
              <button type="button" className="scoring-button primary wide" onClick={onCancel}>Done</button>
            </div>
          ) : (
            <>
              <div className="scoring-complete-score">{state.totalScore}</div>
              <p className="scoring-subtitle">{strikes} strikes · {spares} spares{selectedBall ? ` · ${selectedBall.name}` : ''}</p>
              {saveStatus === 'error' && <p className="scoring-error" role="alert">The game was not saved. Check your connection and try again.</p>}
              {editSnapshot && <button type="button" className="scoring-button secondary wide" style={{ marginTop: 16 }} onClick={restoreBeforeEdit}>Restore original game</button>}
              <div className="scoring-sheet-actions">
                <button type="button" className="scoring-button secondary" onClick={handleUndo}>
                  <ScoringIcon name="undo" size={18} /> Undo last roll
                </button>
                <button type="button" className="scoring-button secondary" onClick={handleRetake}>
                  {confirmRetake ? 'Confirm retake' : 'Retake'}
                </button>
                <button type="button" className="scoring-button primary" disabled={saveStatus === 'saving'} onClick={handleSave}>
                  {saveStatus === 'saving' ? 'Saving…' : 'Save game'}
                </button>
              </div>
              {confirmRetake && <p className="scoring-subtitle">Retaking clears every recorded roll. Tap “Confirm retake” to continue.</p>}
            </>
          )}
        </ScoringSheet>
      )}

      {editCandidate != null && (
        <ScoringSheet
          open
          role="alertdialog"
          title={`Edit from frame ${editCandidate + 1}?`}
          description={`This temporarily removes frame ${editCandidate + 1} and every later roll so bonuses stay correct. You can restore the original game at any time.`}
          onClose={() => setEditCandidate(null)}
        >
          <div className="scoring-sheet-actions">
            <button type="button" className="scoring-button secondary" onClick={() => setEditCandidate(null)}>Keep score</button>
            <button type="button" className="scoring-button primary" onClick={beginFrameEdit}>Edit from here</button>
          </div>
        </ScoringSheet>
      )}

      {confirmCancel && (
        <ScoringSheet
          open
          role="alertdialog"
          title={initialFrameData ? 'Discard changes?' : 'Discard this game?'}
          description={initialFrameData
            ? 'The saved game stays unchanged.'
            : `All ${state.rolls.length} recorded ${state.rolls.length === 1 ? 'roll' : 'rolls'} will be lost.`}
          onClose={() => setConfirmCancel(false)}
        >
          <div className="scoring-sheet-actions">
            <button type="button" className="scoring-button secondary" onClick={() => setConfirmCancel(false)}>Keep scoring</button>
            <button type="button" className="scoring-button danger" onClick={onCancel}>{initialFrameData ? 'Discard changes' : 'Discard game'}</button>
          </div>
        </ScoringSheet>
      )}

      {state.isComplete && !reviewingSavedGame && state.totalScore === 300 && (
        <ScoringSheet
          open
          title={saveStatus === 'saved' ? 'Perfect game saved' : 'Perfect game'}
          dismissible={false}
          className="perfect-lane"
          backdropClassName="perfect-lane-backdrop"
        >
          {saveStatus === 'saved' ? (
            <div className="scoring-status" role="status">
              <div className="scoring-save-check"><ScoringIcon name="check" size={34} /></div>
            </div>
          ) : (
            <>
              <p className="scoring-eyebrow">Twelve strikes</p>
              <div className="perfect-lane-score" aria-label="Perfect score 300">300</div>
              <p className="scoring-subtitle">Every frame held. This one belongs in your history.</p>
              {saveStatus === 'error' && <p className="scoring-error" role="alert">The game was not saved. Check your connection and try again.</p>}
              {editSnapshot && <button type="button" className="scoring-button secondary wide" style={{ marginTop: 16 }} onClick={restoreBeforeEdit}>Restore original game</button>}
              <div className="scoring-sheet-actions">
                <button type="button" className="scoring-button secondary" onClick={handleUndo}><ScoringIcon name="undo" size={18} /> Undo last roll</button>
                <button type="button" className="scoring-button secondary" onClick={handleRetake}>{confirmRetake ? 'Confirm retake' : 'Retake'}</button>
                <button type="button" className="scoring-button primary" disabled={saveStatus === 'saving'} onClick={handleSave}>{saveStatus === 'saving' ? 'Saving…' : 'Save 300'}</button>
              </div>
              {confirmRetake && <p className="scoring-subtitle">Retaking clears the perfect game. Tap “Confirm retake” to continue.</p>}
            </>
          )}
        </ScoringSheet>
      )}
    </div>
  )
}
