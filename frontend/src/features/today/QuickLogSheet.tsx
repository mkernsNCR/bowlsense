import { Link } from 'react-router-dom'
import BowlingScorer from '../../components/BowlingScorer'
import { Sheet } from '../../design'
import type { Ball, SavedGame } from '../../api/bowling'

export interface QuickLogDraft {
  date: string
  location: string
  lanes: string
  sessionId: number | null
  gameNumber: number
  saved: boolean
}

interface QuickLogStatus {
  saving: boolean
  error: boolean
}

interface QuickLogSheetProps {
  open: boolean
  draft: QuickLogDraft
  status: QuickLogStatus
  balls: Ball[]
  defaultBallId?: string
  onDraftChange: (change: Partial<Pick<QuickLogDraft, 'date' | 'location' | 'lanes'>>) => void
  onSave: (game: SavedGame) => Promise<void>
  onClose: () => void
  onLogAnother: () => void
}

export function QuickLogSheet({
  open,
  draft,
  status,
  balls,
  defaultBallId,
  onDraftChange,
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
      closeDisabled={status.saving}
      className="today-sheet-theme today-sheet-panel"
    >
      <div className="today-sheet__fields">
        <label>
          <span>Center</span>
          <input
            value={draft.location}
            onChange={(event) => onDraftChange({ location: event.target.value })}
            placeholder="Bowling center"
            autoComplete="organization"
            disabled={draft.sessionId !== null || status.saving}
          />
        </label>
        <label>
          <span>Date</span>
          <input
            type="date"
            value={draft.date}
            onChange={(event) => onDraftChange({ date: event.target.value })}
            disabled={draft.sessionId !== null || status.saving}
          />
        </label>
        <label>
          <span>Lanes <small>Optional</small></span>
          <input
            value={draft.lanes}
            onChange={(event) => onDraftChange({ lanes: event.target.value })}
            placeholder="12–13"
            inputMode="numeric"
            disabled={draft.sessionId !== null || status.saving}
          />
        </label>
      </div>
      {draft.sessionId !== null && <p className="today-sheet__session-note">Additional games stay in this created session.</p>}

      {draft.saved && draft.sessionId ? (
        <div className="today-sheet__success" role="status">
          <span className="today-sheet__success-mark" aria-hidden="true">✓</span>
          <div>
            <h3>Game logged</h3>
            <Link to={`/sessions/${draft.sessionId}`}>View session</Link>
          </div>
          <div className="today-sheet__success-actions">
            <button type="button" className="today-button today-button--secondary" onClick={onLogAnother}>Log another game</button>
            <button type="button" className="today-button today-button--primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <BowlingScorer
          gameNumber={draft.gameNumber}
          balls={balls}
          defaultBallId={defaultBallId}
          saving={status.saving}
          onSave={onSave}
          onCancel={onClose}
        />
      )}

      {status.saving && <p className="today-sheet__status" role="status">Saving game…</p>}
      {status.error && <p className="today-sheet__error" role="alert">The game wasn’t saved. Check your connection and try again.</p>}
    </Sheet>
  )
}
