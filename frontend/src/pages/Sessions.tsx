import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { copyText } from '../features/scoring/copyText'
import { formatSessionDate } from '../features/scoring/date'
import { Icon, Sheet } from '../design'
import { getSessionShareUrl } from '../utils/sessionShare'
import '../features/scoring/scoring.css'

interface Session {
  id: number
  date: string
  location: string | null
  lanes: string | null
  notes: string | null
  gameCount: number
  avgScore: number
  highScore: number
  perfectGames: number
}

interface SessionsResponse {
  sessions: Session[]
  total: number
  limit: number
  offset: number
}

type SessionSort = 'date' | 'score'

const PAGE_SIZE = 20

function monthLabel(value: string) {
  return formatSessionDate(value, { month: 'long', year: 'numeric' })
}

function getSessionCenterName(session: { location: string | null }) {
  return session.location?.trim() || 'Center not named'
}

function getSessionGroups<T extends { date: string }>(sessions: readonly T[], sort: SessionSort): Array<[string, T[]]> {
  if (sort === 'score') return sessions.length > 0 ? [['Highest scores', [...sessions]]] : []

  const grouped = new Map<string, T[]>()
  sessions.forEach((session) => {
    const label = monthLabel(session.date)
    grouped.set(label, [...(grouped.get(label) ?? []), session])
  })
  return [...grouped.entries()]
}

function clampSessionPage(page: number, total: number, limit = PAGE_SIZE) {
  return Math.min(page, Math.max(1, Math.ceil(total / limit)))
}

export default function Sessions() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [actionSession, setActionSession] = useState<Session | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sort, setSort] = useState<SessionSort>('date')
  const [page, setPage] = useState(1)
  const [locationQuery, setLocationQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [shareError, setShareError] = useState(false)
  const limit = PAGE_SIZE

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (locationQuery !== debouncedQuery) {
        setDebouncedQuery(locationQuery)
        setPage(1)
      }
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [debouncedQuery, locationQuery])

  const sessionsQuery = useQuery<SessionsResponse>({
    queryKey: ['sessions', sort, page, debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        sort,
        order: 'desc',
        page: String(page),
        limit: String(limit),
        location: debouncedQuery,
      })
      const response = await fetch(`/api/sessions?${params}`)
      if (!response.ok) throw new Error('Sessions could not be loaded.')
      return response.json() as Promise<SessionsResponse>
    },
  })

  const sessions = useMemo(() => sessionsQuery.data?.sessions ?? [], [sessionsQuery.data])
  const total = sessionsQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / limit))
  const groups = useMemo(() => getSessionGroups(sessions, sort), [sessions, sort])

  const deleteSession = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Session could not be deleted.')
    },
    onSuccess: async () => {
      setActionSession(null)
      setConfirmDelete(false)
      setPage((current) => clampSessionPage(current, Math.max(0, total - 1), limit))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
      ])
    },
  })

  const handleExport = () => {
    const anchor = document.createElement('a')
    anchor.href = '/api/sessions/export.csv'
    anchor.download = ''
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const handleShare = async (session: Session) => {
    const url = getSessionShareUrl(session.id)
    const centerName = getSessionCenterName(session)
    setShareError(false)
    if (navigator.share) {
      try {
        await navigator.share({ title: `${centerName} bowling session`, url })
        setActionSession(null)
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await copyText(url)
      setActionSession(null)
    } catch {
      setShareError(true)
    }
  }

  return (
    <div className="scoring-flow scoring-page">
      <div className="scoring-page-header">
        <div>
          <p className="scoring-eyebrow">History</p>
          <h1 className="scoring-large-title">Sessions</h1>
          <p className="scoring-subtitle">{total === 0 ? 'Every practice session starts here.' : `${total} ${total === 1 ? 'session' : 'sessions'} recorded`}</p>
        </div>
        <Link to="/sessions/new" className="scoring-button primary"><Icon name="plus" /> New</Link>
      </div>

      <div className="scoring-toolbar">
        <label className="scoring-search">
          <Icon name="search" size={18} />
          <span className="bs-visually-hidden">Filter sessions by center</span>
          <input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Search centers" />
        </label>
        <div className="scoring-segments" role="group" aria-label="Sort sessions">
          <button type="button" className="scoring-segment" aria-pressed={sort === 'date'} onClick={() => { setSort('date'); setPage(1) }}>Recent</button>
          <button type="button" className="scoring-segment" aria-pressed={sort === 'score'} onClick={() => { setSort('score'); setPage(1) }}>Score</button>
        </div>
        {total > 0 && <button type="button" className="scoring-icon-button" onClick={handleExport} aria-label="Export sessions as CSV"><Icon name="download" /></button>}
      </div>

      {sessionsQuery.isLoading && <div className="scoring-status" role="status">Loading sessions…</div>}
      {sessionsQuery.isError && (
        <div className="scoring-status scoring-error" role="alert">
          Sessions could not be loaded. Check your connection.
          <button type="button" className="scoring-button quiet" onClick={() => sessionsQuery.refetch()}>Try again</button>
        </div>
      )}

      {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 && (
        <div className="scoring-group scoring-empty">
          <strong>{debouncedQuery ? 'No matching centers' : 'No sessions yet'}</strong>
          <p>{debouncedQuery ? 'Clear the search and try another center.' : 'Start bowling to record your first frame.'}</p>
          {!debouncedQuery && <Link to="/sessions/new" className="scoring-button primary">Start bowling</Link>}
        </div>
      )}

      {groups.map(([month, monthSessions]) => (
        <section key={month} aria-labelledby={`month-${month.replace(/\W+/g, '-').toLowerCase()}`}>
          <h2 className="scoring-section-title" id={`month-${month.replace(/\W+/g, '-').toLowerCase()}`}>{month}</h2>
          <div className="scoring-group">
            {monthSessions.map((session) => {
              const centerName = getSessionCenterName(session)
              return (
                <div className="scoring-row" key={session.id}>
                  <Link to={`/sessions/${session.id}`} className="scoring-row-main">
                    <time className="scoring-date" dateTime={session.date}>
                      <span className="scoring-date-month">{formatSessionDate(session.date, { month: 'short' })}</span>
                      <span className="scoring-date-day">{formatSessionDate(session.date, { day: 'numeric' })}</span>
                    </time>
                    <div className="scoring-row-copy">
                      <p className="scoring-row-title">{centerName}</p>
                      <p className="scoring-row-meta">
                        {session.gameCount} {session.gameCount === 1 ? 'game' : 'games'}
                        {session.gameCount > 0 ? ` · ${session.avgScore} average · ${session.highScore} high` : ' · No games yet'}
                      </p>
                      {(session.lanes || session.notes) && <p className="scoring-row-meta">{session.lanes ? `Lanes ${session.lanes}` : session.notes}</p>}
                    </div>
                  </Link>
                  {session.perfectGames > 0 && <span className="scoring-row-value" aria-label={`${session.perfectGames} perfect ${session.perfectGames === 1 ? 'game' : 'games'}`}>300</span>}
                  <button type="button" className="scoring-row-action" onClick={() => { setActionSession(session); setConfirmDelete(false); setShareError(false) }} aria-label={`Actions for ${centerName}`}>
                    <Icon name="more" />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {pageCount > 1 && (
        <nav className="scoring-toolbar" aria-label="Session pages" style={{ justifyContent: 'center', marginTop: 20 }}>
          <button type="button" className="scoring-button secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
          <span className="scoring-subtitle">Page {page} of {pageCount}</span>
          <button type="button" className="scoring-button secondary" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
        </nav>
      )}

      {actionSession && (
        <Sheet
          open
          onClose={() => setActionSession(null)}
          title={getSessionCenterName(actionSession)}
          description="Session actions"
          closeLabel="Close session actions"
          className="scoring-sheet-theme"
        >
          <div className="scoring-fields">
            <button type="button" className="scoring-row scoring-row-action" autoFocus onClick={() => navigate(`/sessions/${actionSession.id}?edit=1`)}>
              <span className="scoring-row-copy">Edit session</span><Icon name="chevron-right" />
            </button>
            <button type="button" className="scoring-row scoring-row-action" onClick={() => handleShare(actionSession)}>
              <Icon name="share" /><span className="scoring-row-copy">Share session</span><Icon name="chevron-right" />
            </button>
            <button type="button" className="scoring-row scoring-row-action" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" /><span className="scoring-row-copy">Delete session</span><Icon name="chevron-right" />
            </button>
          </div>
          {shareError && <p className="scoring-error" role="alert">The share link could not be copied. Open the session and copy its share-page address instead.</p>}
          {confirmDelete && (
            <div role="alert">
              <p className="scoring-subtitle">Delete this session and every game in it? This cannot be undone.</p>
              {deleteSession.isError && <p className="scoring-error">The session was not deleted. Try again.</p>}
              <div className="scoring-sheet-actions">
                <button type="button" className="scoring-button secondary" onClick={() => setConfirmDelete(false)}>Keep session</button>
                <button type="button" className="scoring-button danger" disabled={deleteSession.isPending} onClick={() => deleteSession.mutate(actionSession.id)}>
                  {deleteSession.isPending ? 'Deleting…' : 'Delete session'}
                </button>
              </div>
            </div>
          )}
          {!confirmDelete && <button type="button" className="scoring-button secondary wide" style={{ marginTop: 16 }} onClick={() => setActionSession(null)}>Done</button>}
        </Sheet>
      )}
    </div>
  )
}
