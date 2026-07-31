import { Link } from 'react-router-dom'
import { Icon } from '../../design'
import type { Session } from '../../api/bowling'
import { parseCalendarDate } from './data'

function sessionDate(date: string) {
  return parseCalendarDate(date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function signalPosition(score: number) {
  return `${Math.max(4, Math.min(100, (score / 300) * 100))}%`
}

export function RecentSessions({ sessions }: { sessions: Session[] }) {
  const recentSessions = [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)

  if (recentSessions.length === 0) {
    return (
      <div className="today-list-empty">
        <p>Your completed sessions will collect here.</p>
        <Link to="/sessions/new">Start your first session</Link>
      </div>
    )
  }

  return (
    <ul className="today-grouped-list">
      {recentSessions.map((session) => {
        const average = session.avgScore ?? 0
        const high = session.highScore ?? 0
        return (
          <li key={session.id}>
            <Link className="today-session-row" to={`/sessions/${session.id}`}>
              <span className="today-session-row__date">{sessionDate(session.date)}</span>
              <span className="today-session-row__body">
                <strong>{session.location || 'Center not recorded'}</strong>
                <span>
                  {session.gameCount ?? 0} game{session.gameCount === 1 ? '' : 's'}
                  {session.lanes ? ` · Lanes ${session.lanes}` : ''}
                </span>
                {(average > 0 || high > 0) && (
                  <span className="today-score-signal" aria-label={`Average ${average || 'not available'}, high game ${high || 'not available'}`}>
                    <i style={{ width: signalPosition(average) }} />
                    <i className="today-score-signal__high" style={{ left: signalPosition(high) }} />
                  </span>
                )}
              </span>
              <span className="today-session-row__scores">
                <span><small>AVG</small><strong>{average || '—'}</strong></span>
                <span><small>HIGH</small><strong>{high || '—'}</strong></span>
              </span>
              <Icon className="today-icon" name="chevron-right" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
