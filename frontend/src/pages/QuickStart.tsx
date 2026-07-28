import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import QuickAddGame from '../components/QuickAddGame'
import ScoringIcon from '../features/scoring/ScoringIcon'
import '../features/scoring/scoring.css'

interface SessionSummary {
  id: number
  date: string
  location: string
  gameCount: number
  avgScore: number | null
  highScore?: number | null
}

interface SessionPayload {
  sessions?: SessionSummary[]
}

function readableDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function QuickStart() {
  const [lastGameId, setLastGameId] = useState<number | null>(null)
  const sessionsQuery = useQuery<SessionSummary[]>({
    queryKey: ['quick-start-sessions'],
    queryFn: async () => {
      const response = await fetch('/api/sessions?limit=5&sort=date&order=desc')
      if (!response.ok) throw new Error('Recent sessions could not be loaded.')
      const payload: SessionSummary[] | SessionPayload = await response.json()
      return Array.isArray(payload) ? payload : (payload.sessions ?? [])
    },
  })

  return (
    <main className="scoring-flow scoring-page">
      <div className="scoring-page-header">
        <div>
          <p className="scoring-eyebrow">Lane ready</p>
          <h1 className="scoring-large-title">Start bowling</h1>
          <p className="scoring-subtitle">Confirm two details, then record your first ball.</p>
        </div>
      </div>

      <QuickAddGame onDone={setLastGameId} />

      {lastGameId && (
        <p className="scoring-subtitle" role="status">
          Game saved. <Link to={`/score/${lastGameId}`}>Open score</Link>
        </p>
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
          {sessionsQuery.data.map((session) => (
            <div className="scoring-row" key={session.id}>
              <Link to={`/sessions/${session.id}`} className="scoring-row-main">
                <div className="scoring-row-copy">
                  <p className="scoring-row-title">{session.location || 'Center not named'}</p>
                  <p className="scoring-row-meta">
                    {readableDate(session.date)} · {session.gameCount} {session.gameCount === 1 ? 'game' : 'games'}
                    {session.avgScore != null ? ` · ${session.avgScore} average` : ''}
                  </p>
                </div>
                {session.highScore != null && <span className="scoring-row-value">{session.highScore}</span>}
                <ScoringIcon name="chevron" size={18} />
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="scoring-toolbar" style={{ marginTop: 20 }}>
        <Link to="/sessions" className="scoring-button secondary">All sessions</Link>
        <Link to="/stats" className="scoring-button quiet">View insights</Link>
      </div>
    </main>
  )
}
