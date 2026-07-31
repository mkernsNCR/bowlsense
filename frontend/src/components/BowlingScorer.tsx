import { useMemo, useState } from 'react'
import { type Frame, type GameState, getDisplayMark, initGame, knockPins } from '../utils/bowlingScore'
import PerfectGameCelebration from './PerfectGameCelebration'

interface Ball {
  id: number
  name: string
  brand?: string
  thumbnailImage?: string
}

interface BowlingScorerProps {
  gameNumber: number
  balls: Ball[]
  defaultBallId?: string
  saving?: boolean
  onSave: (game: {
    gameNumber: number
    score: number
    strikes: number
    spares: number
    splits: number
    ballId: number | null
    frameData: string
    pinLeaves?: string
  }) => void
  onCancel: () => void
}

const pinRows = [
  [7, 8, 9, 10],
  [4, 5, 6],
  [2, 3],
  [1],
]

function frameSummary(frame: Frame): string {
  if (frame.ball1 == null) return ''
  if (frame.isStrike) {
    if (frame.ball2 != null || frame.ball3 != null) return `${getDisplayMark(frame, 0)}${getDisplayMark(frame, 1)}${getDisplayMark(frame, 2)}`
    return 'X'
  }
  if (frame.ball2 == null) return getDisplayMark(frame, 0)
  return `${getDisplayMark(frame, 0)}${getDisplayMark(frame, 1)}`
}

export default function BowlingScorer({ gameNumber, balls, defaultBallId, saving = false, onSave, onCancel }: BowlingScorerProps) {
  const [state, setState] = useState<GameState>(initGame());
  const [selectedKnocked, setSelectedKnocked] = useState<number[]>([]);
  const [activeView, setActiveView] = useState<'pins' | 'scores'>('pins');
  const [showDetails, setShowDetails] = useState(false);
  const [selectedBallId, setSelectedBallId] = useState<string>(defaultBallId || '');
  const [editingFrameIndex, setEditingFrameIndex] = useState<number | null>(null);

  const selectedBall = balls.find((b) => String(b.id) === selectedBallId);

  const strikes = useMemo(() => state.frames.filter((f, idx) => idx < 9 ? f.isStrike : f.ball1 === 10 || f.ball2 === 10 || f.ball3 === 10).length, [state.frames]);
  const spares = useMemo(() => state.frames.filter((f) => f.isSpare).length, [state.frames]);
  const splits = 0;

  const savePayload = () => ({
    gameNumber,
    score: state.totalScore,
    strikes,
    spares,
    splits,
    ballId: selectedBallId ? parseInt(selectedBallId) : null,
    frameData,
    pinLeaves: JSON.stringify(state.pinSelections),
  });

  const nextLabel = useMemo(() => {
    const frame = state.frames[state.currentFrame]
    if (!frame || state.currentFrame > 9) return 'Next'

    if (state.currentFrame < 9 && frame.ball1 != null && frame.ball2 == null) {
      const first = frame.ball1
      if (first < 10 && first + selectedKnocked.length === 10) return 'Spare'
    }

    if (state.currentFrame === 9 && frame.ball1 != null && frame.ball2 == null && !frame.isStrike) {
      const first = frame.ball1
      if (first < 10 && first + selectedKnocked.length === 10) return 'Spare'
    }

    return 'Next'
  }, [selectedKnocked.length, state.currentFrame, state.frames])

  const onStrike = () => {
    const allStanding = [...state.pinsStanding]
    if (!allStanding.length) return
    const next = knockPins(state, allStanding)
    setState(next)
    setSelectedKnocked([])
  }

  const onNext = () => {
    const next = knockPins(state, selectedKnocked)
    setState(next)
    setSelectedKnocked([])
  }

  // Find the roll index for a given frame (which roll in the rolls array starts this frame)
  const rollIndexForFrame = (frameIdx: number, frames: Frame[]): number => {
    let idx = 0
    for (let i = 0; i < frameIdx; i++) {
      const f = frames[i]
      if (!f) break
      if (i < 9 && f.isStrike) { idx++ }
      else {
        if (f.ball1 != null) idx++
        if (f.ball2 != null) idx++
      }
    }
    return idx
  }

  const onEditFrame = (frameIdx: number) => {
    // Restore the exact pins from pinSelections for this frame
    const rollIdx = rollIndexForFrame(frameIdx, state.frames)
    const pinsKnockedThisFrame = state.pinSelections[rollIdx] ?? []
    // Standing = all 10 minus the ones knocked in ball1
    const standing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(p => !pinsKnockedThisFrame.includes(p))
    setState(prev => ({ ...prev, pinsStanding: standing }))
    setSelectedKnocked(pinsKnockedThisFrame)
    setEditingFrameIndex(frameIdx)
    setActiveView('pins')
  }

  // Rebuild pinSelections from a rolls array — recomputes which pins fell based on standing pins
  const rebuildPinSelections = (rolls: number[]): number[][] => {
    const result: number[][] = []
    let standing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    for (let i = 0; i < rolls.length; i++) {
      const knocked = rolls[i]
      const pinsFell = standing.slice(0, knocked) // which pins fell — top-N of standing
      result.push(pinsFell)
      if (knocked === 10) {
        standing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] // full reset after strike
      } else {
        standing = standing.filter(p => !pinsFell.includes(p))
      }
    }
    return result
  }

  const onFinishEdit = () => {
    if (editingFrameIndex === null) return
    const knocked = selectedKnocked.length
    if (knocked === 0) { setEditingFrameIndex(null); return }

    // Build replacement rolls from the current frames, updating the target frame
    const rolls: number[] = []
    for (let i = 0; i < 10; i++) {
      const f = state.frames[i]
      if (!f) break
      if (i < 9) {
        if (i === editingFrameIndex) {
          // Replace this frame's rolls with the new knocked count
          if (knocked === 10) {
            rolls.push(10) // strike — no second ball in frame
          } else {
            rolls.push(knocked)
            // Second ball: if original had a second ball, keep it (adjusted standing pins)
            if (f.ball2 != null) rolls.push(f.ball2)
          }
        } else {
          if (f.isStrike) rolls.push(10)
          else {
            if (f.ball1 != null) rolls.push(f.ball1)
            if (f.ball2 != null) rolls.push(f.ball2)
          }
        }
      } else {
        // 10th frame
        if (i === editingFrameIndex) {
          if (f.ball1 != null && editingFrameIndex !== 0) rolls.push(f.ball1) // keep ball1 unless editing it
          if (knocked === 10) rolls.push(10)
          else rolls.push(knocked)
          if (f.ball3 != null) rolls.push(f.ball3)
        } else {
          if (f.ball1 != null) rolls.push(f.ball1)
          if (f.ball2 != null) rolls.push(f.ball2)
          if (f.ball3 != null) rolls.push(f.ball3)
        }
      }
    }

    // Rebuild full game state from new rolls
    const rebuiltPinSelections = rebuildPinSelections(rolls)
    const rebuilt = buildGameFromRolls(rolls, rebuiltPinSelections)
    setState(rebuilt)
    setSelectedKnocked([])
    setEditingFrameIndex(null)
  }

  const buildGameFromRolls = (rolls: number[], pinSelections: number[][]): GameState => {
    const frames: Frame[] = []
    for (let i = 0; i < 10; i++) {
      const isStrike = i < 9 && rolls[frames.length] === 10
      const b1 = rolls[frames.length]
      const b2 = isStrike ? undefined : rolls[frames.length + 1]
      const b3 = i === 9 ? rolls[frames.length + 2] : undefined
      const isSpare = !isStrike && b1 !== undefined && b2 !== undefined && b1 + b2 === 10
      frames.push({
        ball1: b1 ?? null,
        ball2: b2 ?? null,
        ball3: b3 ?? null,
        score: null,
        isStrike,
        isSpare,
        cumulative: 0,
      })
    }
    // Calculate cumulative scores
    let cumulative = 0
    for (let i = 0; i < 10; i++) {
      const f = frames[i]
      const bonus = (i < 9 && f.isStrike)
        ? (rolls[i + 1] ?? 0) + (rolls[i + 2] ?? 0)
        : (i < 9 && f.isSpare)
        ? (rolls[i + 2] ?? 0)
        : 0
      cumulative += (f.ball1 ?? 0) + (f.ball2 ?? 0) + (f.ball3 ?? 0) + bonus
      f.cumulative = cumulative
    }
    // Find first incomplete frame
    const firstIncomplete = frames.findIndex(f => f.ball1 == null)
    return {
      frames,
      rolls,
      currentFrame: firstIncomplete === -1 ? 9 : Math.min(firstIncomplete, 9),
      currentBall: 0,
      isComplete: firstIncomplete === -1,
      totalScore: cumulative,
      pinsStanding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      pinSelections,
    }
  }

  const onRetake = () => {
    setState(initGame())
    setSelectedKnocked([])
    setActiveView('pins')
    setShowDetails(false)
    setEditingFrameIndex(null)
  }

  const frameData = JSON.stringify({
    rolls: state.rolls,
    frames: state.frames,
    pinSelections: state.pinSelections,
  })

  return (
    <div className="card" style={{ marginBottom: 84, padding: 12, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Game #{gameNumber}</h3>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' }}>
          <button className="btn" onClick={() => setActiveView('pins')} style={{ borderRadius: 0, border: 'none', background: activeView === 'pins' ? 'var(--accent)' : 'transparent', color: activeView === 'pins' ? '#000' : 'var(--text)', padding: '6px 10px', minHeight: 30 }}>Pins</button>
          <button className="btn" onClick={() => setActiveView('scores')} style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--border)', background: activeView === 'scores' ? 'var(--accent)' : 'transparent', color: activeView === 'scores' ? '#000' : 'var(--text)', padding: '6px 10px', minHeight: 30 }}>Scores</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 12, WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
        <div className="bowling-scorer-frames" style={{ display: 'grid', gridTemplateColumns: 'repeat(9, minmax(36px, 1fr)) minmax(52px, 1.3fr)', gap: 3, minWidth: 380 }}>
          {state.frames.map((frame, idx) => {
            const active = idx === state.currentFrame && !state.isComplete
            const editable = frame.ball1 != null && !editingFrameIndex
            return (
              <div
                key={idx}
                onClick={editable ? () => onEditFrame(idx) : undefined}
                className="frame-cell"
                style={{
                  border: `1px solid ${active ? 'var(--accent)' : editable ? 'rgba(167,139,250,0.35)' : 'var(--border)'}`,
                  borderRadius: 8, padding: 6,
                  background: active ? 'rgba(255,255,255,0.03)' : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  cursor: editable ? 'pointer' : 'default',
                }}
              >
                <div className="frame-label" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>F{idx + 1}</div>
                <div className="frame-marks" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', display: 'grid', gridTemplateColumns: idx === 9 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 4, fontSize: 13, marginBottom: 4 }}>
                  <div style={{ textAlign: 'center' }}>{getDisplayMark(frame, 0)}</div>
                  <div style={{ textAlign: 'center' }}>{getDisplayMark(frame, 1)}</div>
                  {idx === 9 && <div style={{ textAlign: 'center' }}>{getDisplayMark(frame, 2)}</div>}
                </div>
                <div style={{ minHeight: 18, textAlign: 'center', fontWeight: 700, color: frame.cumulative != null ? 'var(--text)' : 'var(--muted)' }}>{frame.cumulative ?? ''}</div>
              </div>
            )
          })}
        </div>
      </div>

      {activeView === 'pins' && !state.isComplete && (
        <>
          <div className="bowling-scorer-pins" style={{ background: '#000', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 12px', marginBottom: 12, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {pinRows.map((row, rowIndex) => (
              <div key={rowIndex} className="bowling-scorer-pins-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: rowIndex === pinRows.length - 1 ? 0 : 10 }}>
                {row.map((pin) => {
                  const isStanding = state.pinsStanding.includes(pin)
                  const isKnocked = selectedKnocked.includes(pin)
                  return (
                    <button
                      key={pin}
                      onClick={() => {
                        if (!isStanding) return
                        setSelectedKnocked((prev) => prev.includes(pin) ? prev.filter((p) => p !== pin) : [...prev, pin])
                      }}
                      className="pin-btn"
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        border: '1px solid var(--border)',
                        background: isStanding && !isKnocked ? '#fff' : 'var(--surface)',
                        color: isStanding && !isKnocked ? '#000' : 'var(--muted)',
                        fontWeight: 800,
                        fontSize: 14,
                        opacity: isStanding ? 1 : 0.5,
                        boxShadow: isStanding && !isKnocked ? '0 3px 12px rgba(255,255,255,0.15)' : 'none',
                        flexShrink: 0,
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      {pin}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {(() => {
            const frame = state.frames[state.currentFrame]
            const isSecondBall = frame && frame.ball1 != null && !frame.isStrike
            const strikeLabel = isSecondBall ? 'Spare' : 'Strike'
            const isEditing = editingFrameIndex !== null
            return (
              <div className="bowling-scorer-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10, width: '100%', boxSizing: 'border-box' }}>
                {isEditing ? (
                  <>
                    <button className="btn action-btn" onClick={() => setEditingFrameIndex(null)} style={{ background: '#1e1e35', color: 'var(--muted)', border: '2px solid var(--border)', width: '100%', minWidth: 0, fontWeight: 700, fontSize: 13 }}>Cancel</button>
                    <button className="btn action-btn" onClick={onFinishEdit} style={{ background: 'var(--accent)', color: '#000', border: 'none', width: '100%', minWidth: 0, fontWeight: 700 }}>Update Frame</button>
                  </>
                ) : (
                  <>
                    <button className="btn action-btn" onClick={onStrike} style={{ background: 'var(--accent)', color: '#000', border: 'none', width: '100%', minWidth: 0, fontWeight: 700 }}>{strikeLabel}</button>
                    <button className="btn action-btn" onClick={onNext} style={{ background: '#1e1e35', color: 'var(--accent)', border: '2px solid var(--accent)', width: '100%', minWidth: 0, fontWeight: 700 }}>{nextLabel}</button>
                  </>
                )}
              </div>
            )
          })()}
        </>
      )}

      {activeView === 'scores' && (
        <div className="bowling-scorer-summary" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, marginBottom: 10 }}>
          {state.frames.map((f, idx) => (
            <div
              key={`sum-${idx}`}
              className="summary-row"
              onClick={f.ball1 != null ? () => onEditFrame(idx) : undefined}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: idx === 9 ? 'none' : '1px solid var(--border)', cursor: f.ball1 != null ? 'pointer' : 'default' }}
            >
              <span className="muted summary-label" style={{ fontSize: 12 }}>Frame {idx + 1}</span>
              <span className="summary-value" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>{frameSummary(f) || '—'} {f.cumulative != null ? `(${f.cumulative})` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {/* Custom ball picker with thumbnails */}
        <div style={{ position: 'relative' }}>
          {selectedBall ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0d0d16', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 14px', cursor: 'pointer' }}
              onClick={() => setSelectedBallId('')}>
              {selectedBall.thumbnailImage && (
                <img src={`https://www.bowwwl.com${selectedBall.thumbnailImage}`} alt={selectedBall.name}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              )}
              <span style={{ flex: 1 }}>{selectedBall.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>change</span>
            </div>
          ) : (
            <div className="bowling-scorer-ball-list" style={{ background: '#0d0d16', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {balls.length === 0 ? (
                <div style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 13 }}>No balls in bag</div>
              ) : (
                balls.map((ball) => (
                  <div key={ball.id} className="ball-item" onClick={() => setSelectedBallId(String(ball.id))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {ball.thumbnailImage ? (
                      <img src={`https://www.bowwwl.com${ball.thumbnailImage}`} alt={ball.name}
                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🎳</div>
                    )}
                    <div>
                      <div className="ball-name" style={{ fontSize: 14, fontWeight: 600 }}>{ball.name}</div>
                      {ball.brand && <div className="ball-brand" style={{ fontSize: 12, color: 'var(--muted)' }}>{ball.brand}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <button className="btn" onClick={() => setShowDetails((v) => !v)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', textDecoration: 'underline', minHeight: 20, justifyContent: 'flex-start', padding: 0 }}>
          Game Details
        </button>

        {showDetails && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 13 }}>
            <div>Total: <strong>{state.totalScore}</strong></div>
            <div>Strikes: {strikes}</div>
            <div>Spares: {spares}</div>
            <div>Splits: {splits}</div>
            {selectedBall && <div>Ball: {selectedBall.name}</div>}
          </div>
        )}

        {!state.isComplete && (
          <button className="btn" onClick={onCancel} style={{ background: 'transparent', border: '1px solid var(--border)' }}>
            Cancel
          </button>
        )}
      </div>

      {state.isComplete && state.totalScore !== 300 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Game Complete!</h3>
            <div style={{ marginBottom: 12 }}>Score: <strong>{state.totalScore}</strong></div>
            <div className="muted" style={{ marginBottom: 12 }}>⚡ {strikes} · ✅ {spares} · 🔀 {splits}</div>
            <div style={{ marginBottom: 10, background: '#0d0d16', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              {selectedBall ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                  onClick={() => setSelectedBallId('')}>
                  {selectedBall.thumbnailImage && (
                    <img src={`https://www.bowwwl.com${selectedBall.thumbnailImage}`} alt={selectedBall.name}
                      style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  <span style={{ flex: 1 }}>{selectedBall.name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>change</span>
                </div>
              ) : balls.map((ball) => (
                <div key={ball.id} onClick={() => setSelectedBallId(String(ball.id))}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {ball.thumbnailImage ? (
                    <img src={`https://www.bowwwl.com${ball.thumbnailImage}`} alt={ball.name}
                      style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🎳</div>
                  )}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{ball.name}</div>
                    {ball.brand && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ball.brand}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="btn" disabled={saving} onClick={onRetake} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>Retake</button>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => onSave(savePayload())}
              >
                Save Game
              </button>
            </div>
          </div>
        </div>
      )}

      {state.isComplete && state.totalScore === 300 && (
        <PerfectGameCelebration
          score={state.totalScore}
          gameNumber={gameNumber}
          frameData={frameData}
          session={{ location: '', date: '', lanes: '' }}
          ballName={selectedBall?.name}
          saving={saving}
          onShare={() => {
            onSave(savePayload())
          }}
          onSave={() => {
            onSave(savePayload())
          }}
          onRetake={onRetake}
        />
      )}

      <style>{`@media (min-width: 768px) {
        .bowling-scorer-board { min-width: 100%; }
      }`}</style>
    </div>
  )
}
