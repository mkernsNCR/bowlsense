import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import SessionQuickShare from '../components/SessionQuickShare'

interface Session {
  id: number
  date: string
  location: string
  lanes: string
  notes: string
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

export default function Sessions() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [shareSessionId, setShareSessionId] = useState<number | null>(null)
  const [sort, setSort] = useState<'date' | 'score'>('date')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [locationQuery, setLocationQuery] = useState('')
  const [debouncedLocationQuery, setDebouncedLocationQuery] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedLocationQuery(locationQuery)
    }, 200)

    return () => clearTimeout(timeout)
  }, [locationQuery])

  useEffect(() => {
    setPage(1)
  }, [debouncedLocationQuery])

  const limit = 20

  const { data: sessionsData, isLoading } = useQuery<SessionsResponse>({
    queryKey: ['sessions', sort, order, page, debouncedLocationQuery],
    queryFn: () => fetch(`/api/sessions?sort=${sort}&order=${order}&page=${page}&limit=${limit}&location=${encodeURIComponent(debouncedLocationQuery)}`).then(r => r.json()),
  })

  const sessions = sessionsData?.sessions ?? []
  const total = sessionsData?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / limit))
  const showControls = total > limit

  const deleteSession = useMutation({
    mutationFn: (id: number) => fetch(`/api/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      navigate('/sessions')
    },
  })

  function handleExportCSV() {
    // Trigger a download by clicking a temp anchor. Browser handles Content-Disposition.
    const a = document.createElement('a')
    a.href = '/api/sessions/export.csv'
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ minWidth: 0 }}>All Sessions</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {total > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="btn btn-ghost"
              title="Download all sessions + games as CSV"
              style={{ minHeight: 38 }}
            >
              📥 Export CSV
            </button>
          )}
          <Link to="/sessions/new" className="btn btn-primary desktop-only">+ New Session</Link>
        </div>
      </div>

      {isLoading && <div className="muted">Loading...</div>}

      {!isLoading && !sessions.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <span className="muted">No sessions yet. </span>
          <Link to="/sessions/new" style={{ color: 'var(--accent)' }}>Log your first one →</Link>
        </div>
      )}
      {!isLoading && showControls && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 13 }}>Sort by</span>
          <button
            className="btn"
            style={{ minHeight: 32, padding: '5px 10px', opacity: sort === 'date' ? 1 : 0.8 }}
            onClick={() => { setSort('date'); setPage(1) }}
          >
            📅 Date
          </button>
          <button
            className="btn"
            style={{ minHeight: 32, padding: '5px 10px', opacity: sort === 'score' ? 1 : 0.8 }}
            onClick={() => { setSort('score'); setPage(1) }}
          >
            📊 Score
          </button>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 32, padding: '5px 10px' }}
            onClick={() => { setOrder(order === 'asc' ? 'desc' : 'asc'); setPage(1) }}
          >
            ↑↓ {order.toUpperCase()}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 10, padding: '0 8px', minHeight: 32, background: '#131326', flex: '1 1 220px', minWidth: 0 }}>
            <span className="muted" style={{ fontSize: 13 }}>🔍</span>
            <input
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder="Filter by location..."
              style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, width: '100%', minWidth: 0 }}
            />
            {!!locationQuery && (
              <button
                className="btn btn-ghost"
                style={{ minHeight: 24, minWidth: 24, padding: 0, borderRadius: 999 }}
                onClick={() => setLocationQuery('')}
                aria-label="Clear location filter"
              >
                ✕
              </button>
            )}
          </div>

          {!!debouncedLocationQuery && (
            <span className="muted" style={{ fontSize: 13 }}>
              Showing {sessions.length} of {total} sessions
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sessions.map(s => (
          <div key={s.id} className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 64 }}>
              <Link
                to={`/sessions/${s.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
              >
                <div style={{ background: 'rgba(167,139,250,0.16)', border: '1px solid rgba(167,139,250,0.32)', color: 'var(--accent)', borderRadius: 12, minWidth: 64, textAlign: 'center', padding: '8px 6px', fontWeight: 700, fontSize: 12, lineHeight: 1.15 }}>
                  {new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{s.location || 'Unknown Lanes'}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {s.lanes ? `Lanes ${s.lanes}` : 'Lane not set'}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>
                      {s.gameCount} {s.gameCount === 1 ? 'game' : 'games'}
                    </span>

                    {s.gameCount > 0 ? (
                      <>
                        <span style={{ fontSize: 12, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>
                          Avg {s.avgScore}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>
                          High {s.highScore}
                        </span>
                        {s.perfectGames > 0 && (
                          <span style={{ fontSize: 12, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 999, padding: '2px 8px' }}>
                            🎳 {s.perfectGames}x 300
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>
                        No games logged
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ color: 'var(--accent)', fontSize: 18 }}>›</span>
              </Link>

              <button
                className="btn btn-ghost"
                style={{
                  minHeight: 34,
                  padding: '6px 10px',
                  borderRadius: 10,
                  borderColor: 'rgba(167, 139, 250, 0.45)',
                  flexShrink: 0,
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShareSessionId(s.id)
                }}
                aria-label={`Share session at ${s.location || 'unknown lanes'}`}
                title="Share session"
              >
                📤
              </button>
              <button className="btn btn-danger" style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10 }} onClick={() => setConfirmDeleteId(s.id)}>
                🗑️
              </button>
            </div>

            {confirmDeleteId === s.id && (
              <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: '#131326' }}>
                <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>Delete session and all its games?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-danger" style={{ minHeight: 32, padding: '5px 10px' }} onClick={() => deleteSession.mutate(s.id)}>Confirm</button>
                  <button className="btn btn-ghost" style={{ minHeight: 32, padding: '5px 10px' }} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!isLoading && showControls && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 }}>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 32, padding: '5px 10px' }}
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span className="muted" style={{ fontSize: 13 }}>Page {page} of {pageCount}</span>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 32, padding: '5px 10px' }}
            disabled={page >= pageCount}
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
          >
            Next →
          </button>
        </div>
      )}

      <Link
        to="/sessions/new"
        className="mobile-only"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 84,
          width: 58,
          height: 58,
          borderRadius: 999,
          background: 'var(--accent)',
          color: '#11111a',
          textDecoration: 'none',
          fontSize: 28,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 12px 30px rgba(167,139,250,0.35)',
        }}
        aria-label="New Session"
      >
        +
      </Link>

      {shareSessionId !== null && (() => {
        const target = sessions.find(s => s.id === shareSessionId)
        if (!target) return null
        return (
          <SessionQuickShare
            sessionId={target.id}
            location={target.location}
            highScore={target.highScore}
            date={target.date}
            onClose={() => setShareSessionId(null)}
          />
        )
      })()}
    </div>
  )
}
