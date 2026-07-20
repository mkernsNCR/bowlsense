import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import BowlingScorer from '../components/BowlingScorer'
import ShareCard from '../components/ShareCard'
import PerfectGameCelebration from '../components/PerfectGameCelebration'
import {
  copySessionShareLink,
  downloadSessionCard,
  nativeShareSession,
} from '../utils/sessionShare'
import { shareOnX } from '../utils/gameShare'

interface Game {
  id: number
  gameNumber: number
  score: number
  strikes: number
  spares: number
  splits: number
  ballId: number
  frameData?: string | null
}

interface SessionWithGames {
  id: number
  date: string
  location: string
  lanes: string
  notes: string
  games: Game[]
}

interface Ball { id: number; name: string; brand: string; thumbnailImage?: string }

function frameMarks(frameData?: string | null) {
  if (!frameData) return null

  try {
    const parsed = JSON.parse(frameData) as any
    const frames = Array.isArray(parsed?.frames) ? parsed.frames : []
    return frames
      .map((f: any, idx: number) => {
        const b1 = f?.ball1
        const b2 = f?.ball2
        const b3 = f?.ball3
        const strike = b1 === 10
        const spare = !strike && b1 != null && b2 != null && b1 + b2 === 10
        const mark = (v: number | null | undefined) => {
          if (v == null) return ''
          if (v === 10) return 'X'
          if (v === 0) return '-'
          return String(v)
        }

        if (idx < 9) {
          if (strike) return 'X'
          if (b1 == null) return ''
          if (b2 == null) return mark(b1)
          return `${mark(b1)}${spare ? '/' : mark(b2)}`
        }

        const first = mark(b1)
        let second = ''
        let third = ''

        if (b2 != null) {
          if (b1 !== 10 && b1 + b2 === 10) {
            second = '/'
          } else {
            second = mark(b2)
          }
        }

        if (b3 != null) {
          if (b1 === 10 && b2 != null && b2 < 10 && b2 + b3 === 10) {
            third = '/'
          } else {
            third = mark(b3)
          }
        }

        return `${first}${second}${third}`
      })
      .filter(Boolean)
      .join(' ')
  } catch {
    return null
  }
}

export default function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { settings } = useSettings()
  const [showScorer, setShowScorer] = useState(false)
  const [showEditSession, setShowEditSession] = useState(false)
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false)
  const [editingGameId, setEditingGameId] = useState<number | null>(null)
  const [shareGameId, setShareGameId] = useState<number | null>(null)
  const [showPerfectCelebration, setShowPerfectCelebration] = useState(false)
  const [celebrationGame, setCelebrationGame] = useState<{ game: Game; session: { location: string; date: string; lanes?: string } } | null>(null)
  const [copiedSessionLink, setCopiedSessionLink] = useState(false)
  const [sessionShareBusy, setSessionShareBusy] = useState(false)

  const { data: session } = useQuery<SessionWithGames>({
    queryKey: ['session', id],
    queryFn: () => fetch(`/api/sessions/${id}`).then(r => r.json()),
    staleTime: 0,
  })

  const { data: balls } = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => fetch('/api/balls').then(r => r.json()),
  })

  const [sessionForm, setSessionForm] = useState({ date: '', location: '', lanes: '', notes: '' })

  const addGame = useMutation({
    mutationFn: (data: object) => fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', id] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  const updateSession = useMutation({
    mutationFn: (data: object) => fetch(`/api/sessions/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => {
      setShowEditSession(false)
      qc.invalidateQueries({ queryKey: ['session', id] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const deleteSession = useMutation({
    mutationFn: () => fetch(`/api/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      navigate('/sessions')
    },
  })

  const editGame = useMutation({
    mutationFn: ({ gameId, data }: { gameId: number; data: object }) => fetch(`/api/games/${gameId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', id] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  const deleteGame = useMutation({
    mutationFn: (gameId: number) => fetch(`/api/games/${gameId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', id] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  const games = session?.games || []
  const avg = games.length ? Math.round(games.reduce((s, g) => s + (g.score || 0), 0) / games.length) : null
  const highGame = games.length ? Math.max(...games.map(g => g.score || 0)) : null

  return (
    <div>
      <div className="session-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h1 style={{ marginBottom: 0 }}>{session?.location || 'Session'}</h1>
        <div className="session-detail-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 32, padding: '5px 10px', borderRadius: 10 }}
            disabled={sessionShareBusy}
            onClick={async () => {
              if (!id) return
              const sessionId = Number(id)
              if (!Number.isFinite(sessionId)) return
              setSessionShareBusy(true)
              const ok = await nativeShareSession({
                sessionId,
                filename: `bowlsense-session-${sessionId}.png`,
                title: 'BowlSense Session',
                text: `${session?.location || 'Session'} · ${session?.date || ''}`,
              })
              setSessionShareBusy(false)
              if (!ok) {
                await copySessionShareLink(sessionId)
                setCopiedSessionLink(true)
                window.setTimeout(() => setCopiedSessionLink(false), 1200)
              }
            }}
          >
            {sessionShareBusy ? 'Sharing...' : '📤 Share'}
          </button>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 32, padding: '5px 10px', borderRadius: 10 }}
            onClick={() => {
              setSessionForm({
                date: session?.date || '',
                location: session?.location || '',
                lanes: session?.lanes || '',
                notes: session?.notes || '',
              })
              setShowEditSession(true)
            }}
          >
            Edit
          </button>
        </div>
      </div>
      <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
        {session?.date}{session?.lanes ? ` · Lanes ${session.lanes}` : ''}{session?.notes ? ` · ${session.notes}` : ''}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
        <button
          className="btn btn-ghost"
          style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10 }}
          onClick={async () => {
            if (!id) return
            const sessionId = Number(id)
            if (!Number.isFinite(sessionId)) return
            await copySessionShareLink(sessionId)
            setCopiedSessionLink(true)
            window.setTimeout(() => setCopiedSessionLink(false), 1200)
          }}
        >
          {copiedSessionLink ? '✅ Copied' : '🔗 Copy Session Link'}
        </button>
        <button
          className="btn btn-ghost"
          style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10 }}
          onClick={async () => {
            if (!id) return
            const sessionId = Number(id)
            if (!Number.isFinite(sessionId)) return
            await downloadSessionCard(sessionId, `bowlsense-session-${sessionId}.png`)
          }}
        >
          ⬇️ Download Card
        </button>
        <button
          className="btn btn-ghost"
          style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10 }}
          onClick={() => {
            if (!id) return
            navigate(`/sessions/${id}/share`)
          }}
        >
          🪄 Open Share Page
        </button>
      </div>

      {showEditSession && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(167,139,250,0.35)', background: '#121228' }}>
          <div style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>Editing session...</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <input type="date" value={sessionForm.date} onChange={(e) => setSessionForm((f) => ({ ...f, date: e.target.value }))} />
            <input placeholder="Location" value={sessionForm.location} onChange={(e) => setSessionForm((f) => ({ ...f, location: e.target.value }))} />
            <input placeholder="Lanes" value={sessionForm.lanes} onChange={(e) => setSessionForm((f) => ({ ...f, lanes: e.target.value }))} />
            <textarea placeholder="Notes" value={sessionForm.notes} onChange={(e) => setSessionForm((f) => ({ ...f, notes: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ minHeight: 32, padding: '5px 10px' }} onClick={() => updateSession.mutate(sessionForm)}>Save</button>
              <button className="btn btn-ghost" style={{ minHeight: 32, padding: '5px 10px' }} onClick={() => setShowEditSession(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {games.length > 0 && (
        <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
            {[['Games', games.length], ['Average', avg], ['High', highGame]].map(([l, v]) => (
              <div key={String(l)} style={{ minWidth: 110, background: '#121228', border: '1px solid var(--border)', borderRadius: 999, padding: '10px 14px', textAlign: 'center' }}>
                <div className="muted" style={{ fontSize: 11 }}>{l}</div>
                <div style={{ fontSize: 20, lineHeight: 1.1, fontWeight: 800, color: 'var(--accent)' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ marginBottom: 10 }}>Games</h2>
      {!games.length && <div className="muted" style={{ marginBottom: 18 }}>No games logged yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {games.map(g => {
          const ballName = balls?.find(b => b.id === g.ballId)?.name
          const marks = frameMarks(g.frameData)
          return (
            <div key={g.id} className="card" style={{ padding: 12 }}>
              <div className="session-game-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ color: 'var(--accent)', fontWeight: 800, minWidth: 28 }}>#{g.gameNumber}</div>
                <div style={{ fontWeight: 800, fontSize: 24, minWidth: 52 }}>{g.score}</div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.2, flex: 1, minWidth: 0 }}>
                  {marks ? (
                    <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text)', fontSize: 11 }}>{marks}</div>
                  ) : (
                    <div>⚡ {g.strikes ?? 0} · ✅ {g.spares ?? 0} · 🔀 {g.splits ?? 0}</div>
                  )}
                  {ballName && <div style={{ marginTop: 2, overflowWrap: 'anywhere' }}>🎳 {ballName}</div>}
                </div>
                <button
                  onClick={() => setEditingGameId(g.id)}
                  className="btn btn-ghost session-game-action"
                  style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10 }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setShareGameId(g.id)}
                  className="btn btn-ghost session-game-action"
                  style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10 }}
                >
                  Share
                </button>
                <button
                  onClick={() => shareOnX(g.id, g.score, session?.location)}
                  className="btn session-game-action"
                  style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10, background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24', fontWeight: 700 }}
                >
                  𝕏 Share on X
                </button>
                <button
                  className="btn btn-ghost session-game-action"
                  onClick={async () => {
                    const url = `${window.location.origin}/score/${g.id}`
                    await navigator.clipboard.writeText(url)
                  }}
                  style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10 }}
                >
                  🔗 Get Share Link
                </button>
                <button onClick={() => deleteGame.mutate(g.id)} className="btn btn-danger" style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10 }}>
                  Remove
                </button>
              </div>

              {editingGameId === g.id && (
                <div style={{ marginTop: 10 }}>
                  <BowlingScorer
                    gameNumber={g.gameNumber}
                    balls={balls || []}
                    defaultBallId={g.ballId ? String(g.ballId) : settings.defaultBallId}
                    onSave={(result) => {
                      editGame.mutate({ gameId: g.id, data: result })
                      setEditingGameId(null)
                    }}
                    onCancel={() => setEditingGameId(null)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {shareGameId !== null && (() => {
        const g = games?.find(g => g.id === shareGameId)
        if (!g) return null
        const ballName = balls?.find(b => b.id === g.ballId)?.name
        return (
          <ShareCard
            game={g}
            session={{ location: session!.location, date: session!.date, lanes: session?.lanes }}
            ballName={ballName}
            onClose={() => setShareGameId(null)}
          />
        )
      })()}

      {!showScorer ? (
        <button onClick={() => setShowScorer(true)} className="btn btn-primary" style={{ width: '100%', marginBottom: 18 }}>
          🎳 Start New Game
        </button>
      ) : (
        <BowlingScorer
          gameNumber={games.length + 1}
          balls={balls || []}
          defaultBallId={settings.defaultBallId}
          onSave={async (game) => {
            const result = await addGame.mutateAsync({ sessionId: parseInt(id!), ...game })
            setShowScorer(false)
            if (game.score === 300 && result?.id) {
              setCelebrationGame({
                game: { ...game, id: result.id, ballId: game.ballId ?? 0 },
                session: { location: session?.location || '', date: session?.date || '', lanes: session?.lanes },
              })
              setShowPerfectCelebration(true)
            }
          }}
          onCancel={() => setShowScorer(false)}
        />
      )}

      <div style={{ marginBottom: 84 }}>
        {!confirmDeleteSession ? (
          <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => setConfirmDeleteSession(true)}>
            Delete Session
          </button>
        ) : (
          <div className="card" style={{ borderColor: 'rgba(255,120,120,0.35)' }}>
            <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>Are you sure? This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger" style={{ minHeight: 32, padding: '5px 10px' }} onClick={() => deleteSession.mutate()}>Confirm Delete</button>
              <button className="btn btn-ghost" style={{ minHeight: 32, padding: '5px 10px' }} onClick={() => setConfirmDeleteSession(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {showPerfectCelebration && celebrationGame && (
        <PerfectGameCelebration
          score={celebrationGame.game.score}
          gameNumber={celebrationGame.game.gameNumber}
          frameData={celebrationGame.game.frameData ?? ''}
          session={celebrationGame.session}
          ballName={balls?.find(b => b.id === celebrationGame.game.ballId)?.name}
          onShare={() => {
            setShowPerfectCelebration(false)
            setShareGameId(celebrationGame.game.id)
          }}
          onSave={() => {
            // already saved
            setShowPerfectCelebration(false)
          }}
          onRetake={() => {
            setShowPerfectCelebration(false)
            setShowScorer(true)
          }}
        />
      )}
    </div>
  )
}
