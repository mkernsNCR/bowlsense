import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import QuickAddGame from '../components/QuickAddGame'

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function isToday(dateStr: string): boolean {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    const t = new Date()
    return d.getFullYear() === t.getFullYear() &&
      d.getMonth() === t.getMonth() &&
      d.getDate() === t.getDate()
  } catch {
    return false
  }
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: '#121228',
      borderRadius: 14,
      padding: '12px 16px',
      border: '1px solid rgba(167,139,250,0.18)',
      flex: '1 1 120px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: accent || '#a78bfa', lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

interface SessionSummary {
  id: number
  date: string
  location: string
  gameCount: number
  avgScore: number | null
}

export default function QuickStart() {
  const navigate = useNavigate()
  const [showScorer, setShowScorer] = React.useState(false)
  const [done, setDone] = React.useState(false)

  const { data: rawSessions, isLoading } = useQuery({
    queryKey: ['quick-start-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/sessions?limit=20&sort=date&order=desc')
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      // Handle both {sessions: [...], total: N} and raw [...]
      return Array.isArray(json) ? json : (json.sessions ?? [])
    },
  })

  const sessions: SessionSummary[] = useMemo(() => {
    if (!Array.isArray(rawSessions)) return []
    return rawSessions.map((s: any) => {
      const games = Array.isArray(s.games) ? s.games : []
      const scores = games.map((g: any) => Number(g.score)).filter((n: number) => n > 0)
      const avg = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null
      return {
        id: s.id,
        date: s.date || '',
        location: s.location || 'Unknown',
        gameCount: games.length,
        avgScore: avg,
      }
    })
  }, [rawSessions])

  const todaySessions = sessions.filter((s) => isToday(s.date))
  const todayGames = todaySessions.reduce((n, s) => n + s.gameCount, 0)
  const todayAvg = (() => {
    const allScores = todaySessions.flatMap((s) => {
      const raw = Array.isArray(rawSessions) ? rawSessions : []
      const sess = raw.find((r: any) => r.id === s.id)
      if (!Array.isArray(sess?.games)) return []
      return (sess.games as any[]).map((g) => Number(g.score)).filter((n: number) => n > 0)
    })
    if (!allScores.length) return null
    return Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
  })()

  const lastSession = sessions[0] ?? null

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 440, margin: '0 auto' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h1 style={{ marginBottom: 8, fontSize: '2rem', fontWeight: 900 }}>Game saved!</h1>
          <p className="muted" style={{ marginBottom: 28 }}>Nice throw. Want to add another?</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => { setDone(false); setShowScorer(true) }}
              className="btn btn-primary"
              style={{ minHeight: 48, fontWeight: 800, fontSize: 16, borderRadius: 12 }}
            >
              🎳 Add Another
            </button>
            <Link
              to="/"
              className="btn btn-ghost"
              style={{ minHeight: 48, borderRadius: 12 }}
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (showScorer) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 64px' }}>
        <div style={{ marginBottom: 16 }}>
          <Link
            to="/quick"
            onClick={() => setShowScorer(false)}
            style={{ color: '#a78bfa', fontSize: 14, textDecoration: 'none' }}
          >
            ← Back to Quick Start
          </Link>
        </div>
        <h1 style={{ marginBottom: 16 }}>🎳 New Game</h1>
        <QuickAddGame
          onDone={() => {
            setDone(true)
            setShowScorer(false)
          }}
        />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d1a',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      paddingBottom: 48,
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px 0' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex',
            padding: '4px 12px',
            borderRadius: 999,
            background: 'rgba(167,139,250,0.18)',
            color: '#c4b5fd',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            marginBottom: 10,
            textTransform: 'uppercase',
          }}>
            ⚡ Quick Start
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.8rem, 5vw, 2.4rem)', fontWeight: 900, lineHeight: 1.1 }}>
            Ready to roll?
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6, fontSize: 15 }}>
            Jump straight into logging a game — no setup needed.
          </p>
        </div>

        {/* Today / this week stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
          <StatPill label="Today" value={todayGames > 0 ? String(todayGames) : '—'} />
          <StatPill label="Today's Avg" value={todayAvg != null ? String(todayAvg) : '—'} />
          {lastSession && (
            <StatPill
              label="Last Session"
              value={lastSession.avgScore != null ? String(lastSession.avgScore) : '—'}
              accent={lastSession.avgScore != null && lastSession.avgScore >= 200 ? '#34d399' : undefined}
            />
          )}
        </div>

        {/* Hero button + Quick Score secondary */}
        <button
          onClick={() => setShowScorer(true)}
          style={{
            width: '100%',
            minHeight: 80,
            background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
            border: 'none',
            borderRadius: 18,
            color: '#fff',
            fontSize: 22,
            fontWeight: 900,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            marginBottom: 12,
            boxShadow: '0 8px 32px rgba(124,58,237,0.4)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(124,58,237,0.5)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = ''
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(124,58,237,0.4)'
          }}
        >
          <span style={{ fontSize: 32 }}>🎳</span>
          New Game
        </button>

        <div
          onClick={() => navigate('/quick-score')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/quick-score') }}
          style={{
            background: '#1a1a35',
            border: '1px solid rgba(167,139,250,0.4)',
            borderRadius: 14,
            padding: '14px 18px',
            marginBottom: 32,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            transition: 'background 0.15s, transform 0.15s',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLDivElement
            el.style.background = '#22224a'
            el.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLDivElement
            el.style.background = '#1a1a35'
            el.style.transform = ''
          }}
        >
          <div style={{ fontSize: 28 }}>🎯</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#c4b5fd', marginBottom: 2 }}>
              Quick Score
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              Just the final score — no frame-by-frame at the alley
            </div>
          </div>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.4)' }}>›</div>
        </div>

        {/* Recent sessions */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
              Recent Sessions
            </h2>
            <Link to="/sessions" style={{ color: '#a78bfa', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
              View all →
            </Link>
          </div>

          {isLoading && (
            <div style={{ color: 'rgba(255,255,255,0.5)', padding: '16px 0', fontSize: 14 }}>
              Loading sessions...
            </div>
          )}

          {!isLoading && sessions.length === 0 && (
            <div style={{
              background: '#121228',
              border: '1px solid rgba(167,139,250,0.15)',
              borderRadius: 14,
              padding: '24px 16px',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.6)',
            }}>
              No sessions yet. Hit "New Game" above to get started! 🎳
            </div>
          )}

          {!isLoading && sessions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.slice(0, 8).map((session) => (
                <div
                  key={session.id}
                  style={{
                    background: '#121228',
                    border: '1px solid rgba(167,139,250,0.15)',
                    borderRadius: 14,
                    padding: '14px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, color: isToday(session.date) ? '#a78bfa' : '#fff' }}>
                      {session.location}
                      {isToday(session.date) && (
                        <span style={{ marginLeft: 6, fontSize: 11, background: 'rgba(167,139,250,0.2)', color: '#c4b5fd', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>
                          TODAY
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                      {formatDate(session.date)} · {session.gameCount} game{session.gameCount !== 1 ? 's' : ''}
                      {session.avgScore != null && (
                        <span style={{ marginLeft: 6, color: '#a78bfa', fontWeight: 700 }}>
                          avg {session.avgScore}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => navigate(`/sessions/${session.id}`)}
                      style={{
                        background: 'rgba(167,139,250,0.12)',
                        border: '1px solid rgba(167,139,250,0.3)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        color: '#c4b5fd',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      View
                    </button>
                    <button
                      onClick={() => {
                        // Navigate to new session with session context
                        navigate(`/sessions/new?sessionId=${session.id}`)
                      }}
                      style={{
                        background: 'rgba(167,139,250,0.25)',
                        border: '1px solid rgba(167,139,250,0.5)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      + Game
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: 20,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}>
          {[
            { label: '📋 All Sessions', to: '/sessions' },
            { label: '🏆 Leagues', to: '/leagues' },
            { label: '🎯 Tournaments', to: '/tournaments' },
            { label: '📊 Stats', to: '/stats' },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '8px 14px',
                color: 'rgba(255,255,255,0.8)',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// Need React for useState in this file
import React from 'react'