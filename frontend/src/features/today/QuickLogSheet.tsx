import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import BowlingScorer from '../../components/BowlingScorer'
import type { Ball, SavedGame } from './data'
import { TodayIcon } from './TodayIcon'

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
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return

      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="today-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section ref={sheetRef} className="today-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-log-title" aria-describedby="quick-log-description">
        <div className="today-sheet__grabber" aria-hidden="true" />
        <header className="today-sheet__header">
          <div>
            <h2 id="quick-log-title">Log a past game</h2>
            <p id="quick-log-description">Add a completed game without starting a live session.</p>
          </div>
          <button ref={closeButtonRef} type="button" className="today-sheet__close" onClick={onClose} aria-label="Close past-game log">
            <TodayIcon name="close" />
          </button>
        </header>

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
      </section>
    </div>
  )
}
