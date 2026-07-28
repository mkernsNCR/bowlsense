import { Link } from 'react-router-dom'
import BowlingScorer from '../../components/BowlingScorer'
import { Sheet } from '../../design'
import type { Ball, SavedGame } from './data'

interface QuickLogSheetProps {
  open: boolean
  date: string
  location: string
  lanes: string
  sessionId: number | null
  gameNumber: number
  saved: boolean
  saving: boolean
  error: boolean
  balls: Ball[]
  defaultBallId?: string
  onDateChange: (date: string) => void
  onLocationChange: (location: string) => void
  onLanesChange: (lanes: string) => void
  onSave: (game: SavedGame) => Promise<void>
  onClose: () => void
  onLogAnother: () => void
}

export function QuickLogSheet({
  open,
  date,
  location,
  lanes,
  sessionId,
  gameNumber,
  saved,
  saving,
  error,
  balls,
  defaultBallId,
  onDateChange,
  onLocationChange,
  onLanesChange,
  onSave,
  onClose,
  onLogAnother,
}: QuickLogSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log a past game"
      description="Add a completed game without starting a live session."
      closeLabel="Close past-game log"
      className="today-sheet-theme today-sheet-panel"
    >
      <div className="today-sheet__fields">
        <label>
          <span>Center</span>
          <input value={location} onChange={(event) => onLocationChange(event.target.value)} placeholder="Bowling center" autoComplete="organization" />
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} />
        </label>
        <label>
          <span>Lanes <small>Optional</small></span>
          <input value={lanes} onChange={(event) => onLanesChange(event.target.value)} placeholder="12–13" inputMode="numeric" />
        </label>
      </div>

      {saved && sessionId ? (
        <div className="today-sheet__success" role="status">
          <span className="today-sheet__success-mark" aria-hidden="true">✓</span>
          <div>
            <h3>Game logged</h3>
            <Link to={`/sessions/${sessionId}`}>View session</Link>
          </div>
          <div className="today-sheet__success-actions">
            <button type="button" className="today-button today-button--secondary" onClick={onLogAnother}>Log another game</button>
            <button type="button" className="today-button today-button--primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <BowlingScorer
          gameNumber={gameNumber}
          balls={balls}
          defaultBallId={defaultBallId}
          onSave={onSave}
          onCancel={onClose}
        />
      )}

      {saving && <p className="today-sheet__status" role="status">Saving game…</p>}
      {error && <p className="today-sheet__error" role="alert">The game wasn’t saved. Check your connection and try again.</p>}
    </Sheet>
  )
}
