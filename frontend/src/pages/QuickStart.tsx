import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import QuickAddGame from '../components/QuickAddGame'
import { fetchRecentSessions, type Session } from '../api/bowling'
import { Icon } from '../design'
import SavedGameConfirmation, { type SavedQuickGame } from '../features/scoring/SavedGameConfirmation'
import { readableDate } from '../features/scoring/date'
import '../features/scoring/scoring.css'

export default function QuickStart() {
  const [savedGame, setSavedGame] = useState<SavedQuickGame | null>(null)
  const sessionsQuery = useQuery<Session[]>({
    queryKey: ['sessions', 'quick-start', 5],
    queryFn: () => fetchRecentSessions(5),
  })

  return (
    <div className="scoring-flow scoring-page">
      <div className="scoring-page-header">
        <div>
          <p className="scoring-eyebrow">Lane ready</p>
          <h1 className="scoring-large-title">Start bowling</h1>
          <p className="scoring-subtitle">Confirm two details, then record your first ball.</p>
        </div>
      </div>

      <div hidden={savedGame !== null}>
        <QuickAddGame onDone={(id, startAnother) => setSavedGame({ id, startAnother })} />
      </div>

      {savedGame && (
        <SavedGameConfirmation
          game={savedGame}
          headingLevel="h2"
          onStartAnother={() => {
            savedGame.startAnother()
            setSavedGame(null)
          }}
        />
      )}

      <h2 className="scoring-section-title">Recent sessions</h2>
      {sessionsQuery.isLoading && <div className="scoring-status">Loading recent sessions…</div>}
      {sessionsQuery.isError && <div className="scoring-status scoring-error">Recent sessions could not be loaded. Scoring is still available.</div>}
      {!sessionsQuery.isLoading && !sessionsQuery.isError && sessionsQuery.data?.length === 0 && (
        <div className="scoring-group scoring-empty">
          <strong>Your first session starts above</strong>
          <p>Scores and adjustments will collect here as you bowl.</p>
        </div>
      )}
      {sessionsQuery.data && sessionsQuery.data.length > 0 && (
        <div className="scoring-group">
          {sessionsQuery.data.map((session) => {
            const gameCount = session.gameCount ?? 0
            return (
              <div className="scoring-row" key={session.id}>
                <Link to={`/sessions/${session.id}`} className="scoring-row-main">
                  <div className="scoring-row-copy">
                    <p className="scoring-row-title">{session.location || 'Center not named'}</p>
                    <p className="scoring-row-meta">
                      {readableDate(session.date)} · {gameCount} {gameCount === 1 ? 'game' : 'games'}
                      {session.avgScore != null ? ` · ${session.avgScore} average` : ''}
                    </p>
                  </div>
                  {session.highScore != null && <span className="scoring-row-value">{session.highScore}</span>}
                  <Icon name="chevron-right" size={18} />
                </Link>
              </div>
            )
          })}
        </div>
      )}

      <div className="scoring-toolbar" style={{ marginTop: 20 }}>
        <Link to="/sessions" className="scoring-button secondary">All sessions</Link>
        <Link to="/stats" className="scoring-button quiet">View insights</Link>
      </div>
    </div>
  )
}
