import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import BowlingScorer from '../components/BowlingScorer'
import {
  copyGameShareLink,
  downloadGameImage,
  nativeShareGame,
  shareOnX,
  getGameShareUrl,
  getGameOgImageUrl,
} from '../utils/gameShare'

interface PerfectGameSummary {
  id: number
  gameNumber: number
  score: number
  ballId: number | null
  ballName: string | null
  date: string
  location: string
  lanes: string
}

interface TonightLeague {
  id: number
  name: string
  location: string | null
  season: string | null
  gamesPerWeek: number
  startDate: string | null
  endDate: string | null
  todayName: string
  todayIso: string
  inSeason: boolean
  nextWeekNumber: number
  lastOpponent: string | null
  lastWeekDate: string | null
  stats: {
    average: number
    high: number
    totalGames: number
    totalWeeks: number
    gamesWon: number
    gamesLost: number
  }
}

interface Stats {
  average: number
  strikeRate: number
  spareRate: number
  totalGames: number
  totalScore: number
  totalStrikes: number
  totalSpares: number
}

interface Session {
  id: number
  date: string
  location: string
  lanes: string
  notes: string
  gameCount?: number
  avgScore?: number
  highScore?: number
  perfectGames?: number
}

interface Game {
  id: number
  score: number
  gameNumber: number
}

interface BallStat {
  ballId: number
  ballName: string
  brand: string
  gameCount: number
  average: number
}

interface Ball {
  id: number
  name: string
  brand?: string
  thumbnailImage?: string
}

interface SavedGame {
  gameNumber: number
  score: number
  strikes: number
  spares: number
  splits: number
  ballId: number | null
  frameData: string
}

function ScoreTrendChart({ games, average }: { games: Game[]; average: number }) {
  if (games.length < 2) return null

  const W = 800
  const H = 250
  const PAD = { top: 16, right: 14, bottom: 30, left: 36 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const minScore = Math.max(0, Math.min(...games.map(g => g.score || 0)) - 20)
  const maxScore = Math.min(300, Math.max(...games.map(g => g.score || 0)) + 20)
  const range = maxScore - minScore || 1

  const xOf = (i: number) => PAD.left + (i / (games.length - 1)) * chartW
  const yOf = (score: number) => PAD.top + chartH - ((score - minScore) / range) * chartH
  const points = games.map((g, i) => `${xOf(i)},${yOf(g.score || 0)}`).join(' ')
  const yTicks = [minScore, Math.round((minScore + maxScore) / 2), maxScore]

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>📈 Score Trend</div>
        <span className="muted" style={{ fontSize: 12 }}>last {games.length} games</span>
      </div>
      <div style={{ width: '100%', overflowX: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 250, display: 'block' }}>
          {yTicks.map(t => (
            <line key={t} x1={PAD.left} y1={yOf(t)} x2={W - PAD.right} y2={yOf(t)} stroke="var(--border)" strokeWidth="1" />
          ))}

          {yTicks.map(t => (
            <text key={`lbl-${t}`} x={PAD.left - 6} y={yOf(t) + 3} textAnchor="end" fill="var(--muted)" fontSize="11">{t}</text>
          ))}

          {average > 0 && (
            <line x1={PAD.left} y1={yOf(average)} x2={W - PAD.right} y2={yOf(average)} stroke="var(--accent)" strokeWidth="1" strokeDasharray="6,4" opacity="0.5" />
          )}

          <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {games.map((g, i) => (
            <circle key={g.id} cx={xOf(i)} cy={yOf(g.score || 0)} r="4" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
          ))}
        </svg>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'highscore'>('newest')
  const [showQuickLog, setShowQuickLog] = useState(false)
  const [quickLogDate, setQuickLogDate] = useState(new Date().toISOString().slice(0, 10))
  const [quickLogLocation, setQuickLogLocation] = useState('')
  const [quickLogLanes, setQuickLogLanes] = useState('')
  const [quickLogSessionId, setQuickLogSessionId] = useState<number | null>(null)
  const [quickLogGameNumber, setQuickLogGameNumber] = useState(1)
  const [quickLogSaved, setQuickLogSaved] = useState(false)

  const { data: stats } = useQuery<Stats>({ queryKey: ['stats'], queryFn: () => fetch('/api/stats').then(r => r.json()) })
  const { data: weekly } = useQuery<any>({ queryKey: ['stats/weekly'], queryFn: () => fetch('/api/stats/weekly').then(r => r.json()) })
  const { data: sessions } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const data = await fetch('/api/sessions?limit=100&offset=0').then(r => r.json())
      return Array.isArray(data) ? data : (data.sessions ?? [])
    },
  })
  const { data: recentGames } = useQuery<Game[]>({ queryKey: ['games-recent'], queryFn: () => fetch('/api/games-recent').then(r => r.json()) })
  const { data: ballStats } = useQuery<BallStat[]>({ queryKey: ['stats/by-ball'], queryFn: () => fetch('/api/stats/by-ball').then(r => r.json()) })
  const { data: balls = [] } = useQuery<Ball[]>({ queryKey: ['balls'], queryFn: () => fetch('/api/balls').then(r => r.json()) })
  const { data: tonightLeagues = [] } = useQuery<TonightLeague[]>({
    queryKey: ['dashboard/tonight'],
    queryFn: () => fetch('/api/dashboard/tonight').then(r => r.json()),
    staleTime: 5 * 60 * 1000, // 5 min — day-of-week doesn't change rapidly
  })

  const { data: perfectGames = [] } = useQuery<PerfectGameSummary[]>({
    queryKey: ['games-perfect'],
    queryFn: async () => {
      const res = await fetch('/api/games/perfect')
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : (data.games ?? [])
    },
    staleTime: 10 * 60 * 1000, // 10 min — 300s don't change often
  })

  // One-tap 300 share state
  const [share300PopoverOpen, setShare300PopoverOpen] = useState(false)
  const [share300Copied, setShare300Copied] = useState(false)
  const [share300Busy, setShare300Busy] = useState(false)

  async function handleCopyPerfectLink(gameId: number) {
    await copyGameShareLink(gameId)
    setShare300Copied(true)
    window.setTimeout(() => setShare300Copied(false), 1500)
  }

  async function handleNativeSharePerfect(game: PerfectGameSummary) {
    setShare300Busy(true)
    try {
      const shared = await nativeShareGame({
        gameId: game.id,
        filename: `perfect-game-${game.id}.png`,
        title: '🎳 Perfect 300 Game',
        text: `I rolled a 300 at ${game.location}!`,
      })
      if (!shared) {
        // Browser doesn't support native share — open X as fallback
        shareOnX(game.id, 300, game.location)
      }
    } finally {
      setShare300Busy(false)
    }
  }

  async function handleDownloadPerfectImage(gameId: number) {
    setShare300Busy(true)
    try {
      await downloadGameImage(gameId, `perfect-game-${gameId}.png`)
    } finally {
      setShare300Busy(false)
    }
  }

  const createSessionMutation = useMutation({
    mutationFn: async (payload: { date: string; location: string; lanes: string }) => {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to create session')
      return response.json() as Promise<{ id: number }>
    },
  })

  const createGameMutation = useMutation({
    mutationFn: async (payload: { sessionId: number; gameNumber: number; score: number; strikes: number; spares: number; splits: number; ballId: number | null; frameData: string }) => {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to create game')
      return response.json()
    },
  })

  const latestSessionLocation = sessions && sessions.length
    ? [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0]?.location ?? ''
    : ''

  const openQuickLog = () => {
    setQuickLogDate(new Date().toISOString().slice(0, 10))
    setQuickLogLocation(latestSessionLocation)
    setQuickLogLanes('')
    setQuickLogSessionId(null)
    setQuickLogGameNumber(1)
    setQuickLogSaved(false)
    setShowQuickLog(true)
  }

  // ── Public Profile share (one-tap from Dashboard) ────────────────
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false)
  const [profileCopied, setProfileCopied] = useState(false)
  const publicProfileName = (settings.name || '').trim()
  const publicProfileUrl = publicProfileName
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/bowl?name=${encodeURIComponent(publicProfileName)}`
    : `${typeof window !== 'undefined' ? window.location.origin : ''}/bowl`
  const publicProfileHasStats = (stats?.totalGames ?? 0) > 0

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(publicProfileUrl)
      setProfileCopied(true)
      setTimeout(() => setProfileCopied(false), 2000)
    } catch { /* ignore */ }
  }

  async function nativeShareProfile() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'My BowlSense Profile',
          text: publicProfileName
            ? `${publicProfileName}'s bowling stats — BowlSense 🎳`
            : 'My bowling stats — BowlSense 🎳',
          url: publicProfileUrl,
        })
        return
      } catch { /* fall through to copy */ }
    }
    await copyProfileLink()
  }

  function shareProfileOnX() {
    const text = publicProfileName
      ? `${publicProfileName}'s bowling stats — avg, high, and 300s on BowlSense 🎳`
      : `My bowling stats on BowlSense 🎳`
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(publicProfileUrl)}`
    if (typeof window !== 'undefined') window.open(tweetUrl, '_blank', 'noopener,noreferrer')
  }

  const closeQuickLog = () => {
    setShowQuickLog(false)
  }

  const handleQuickLogSave = async (game: SavedGame) => {
    const sessionId = quickLogSessionId ?? (await createSessionMutation.mutateAsync({
      date: quickLogDate,
      location: quickLogLocation,
      lanes: quickLogLanes,
    })).id

    await createGameMutation.mutateAsync({
      sessionId,
      gameNumber: game.gameNumber,
      score: game.score,
      strikes: game.strikes,
      spares: game.spares,
      splits: game.splits,
      ballId: game.ballId,
      frameData: game.frameData,
    })

    setQuickLogSessionId(sessionId)
    setQuickLogSaved(true)
    await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    await queryClient.invalidateQueries({ queryKey: ['stats'] })
  }

  const sortedSessions = sessions ? [...sessions].sort((a, b) => {
    if (sortOrder === 'oldest') return a.date.localeCompare(b.date)
    if (sortOrder === 'highscore') return (b.highScore ?? 0) - (a.highScore ?? 0)
    return b.date.localeCompare(a.date) // newest first
  }).slice(0, 5) : []

  const highScoreFromRecent = recentGames?.length ? Math.max(...recentGames.map(g => g.score)) : null

  return (
    <div>
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(139,92,246,0.08) 50%, transparent 100%)',
          border: '1px solid rgba(167,139,250,0.2)',
          borderRadius: 24,
          padding: '24px 20px',
          marginBottom: 24,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 160,
            height: 160,
            background: 'radial-gradient(circle, rgba(167,139,250,0.2) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Welcome back{settings.name ? `, ${settings.name}` : ''}
        </div>

        <h1 style={{ fontSize: 'clamp(1.6rem, 6vw, 2.4rem)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 16 }}>
          Your Bowling
          <br />
          Dashboard
        </h1>

        {(stats?.totalGames ?? 0) > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <span
              style={{
                background: 'rgba(167,139,250,0.18)',
                border: '1px solid rgba(167,139,250,0.3)',
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              🎳 {stats?.totalGames ?? 0} games bowled
            </span>
            {(stats?.average ?? 0) > 0 && (
              <span
                style={{
                  background: 'rgba(52,211,153,0.12)',
                  border: '1px solid rgba(52,211,153,0.25)',
                  borderRadius: 999,
                  padding: '4px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#34d399',
                }}
              >
                Avg {stats?.average}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/sessions/new" className="btn btn-primary" style={{ fontSize: 15, fontWeight: 800 }}>
            🎳 Start a Session
          </Link>
          <button type="button" className="btn" onClick={openQuickLog} style={{ fontSize: 15, fontWeight: 800 }}>
            ⚡ Quick Log
          </button>
          <Link
            to="/quick-score"
            className="btn"
            style={{
              fontSize: 15,
              fontWeight: 800,
              background: 'rgba(52,211,153,0.16)',
              border: '1px solid rgba(52,211,153,0.4)',
              color: '#34d399',
            }}
          >
            🎯 Quick Score
          </Link>
          {publicProfileHasStats && (
            <button
              type="button"
              className="btn"
              onClick={() => setSharePopoverOpen(v => !v)}
              aria-expanded={sharePopoverOpen}
              aria-controls="dashboard-share-popover"
              style={{
                fontSize: 15,
                fontWeight: 800,
                background: sharePopoverOpen ? 'rgba(167,139,250,0.22)' : 'rgba(167,139,250,0.12)',
                border: '1px solid rgba(167,139,250,0.4)',
                color: 'var(--accent)',
              }}
            >
              📤 Share My Profile
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted, rgba(255,255,255,0.5))', marginTop: 4 }}>
          Score-only entry for the alley — no frame-by-frame required.
        </div>

        {/* Public Profile share popover — one-tap from Dashboard */}
        {publicProfileHasStats && sharePopoverOpen && (
          <div
            id="dashboard-share-popover"
            style={{
              marginTop: 14,
              padding: 14,
              background: 'rgba(13,13,26,0.85)',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 14,
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 8, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              🔗 Your public profile link
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                background: 'rgba(167,139,250,0.08)',
                border: '1px solid rgba(167,139,250,0.25)',
                borderRadius: 10,
                padding: '8px 10px',
                wordBreak: 'break-all',
                color: 'var(--accent)',
                marginBottom: 12,
              }}
            >
              {publicProfileUrl || '/bowl'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 12, lineHeight: 1.45 }}>
              Anyone with this link sees your lifetime stats (avg, high, 300s, score distribution) — no login required.
              {!publicProfileName && (
                <span> Set a name in <Link to="/settings" style={{ color: 'var(--accent)' }}>Settings</Link> to personalize the share card.</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <button onClick={nativeShareProfile} className="btn btn-primary" style={{ minHeight: 44 }}>
                📤 Share
              </button>
              <button onClick={copyProfileLink} className="btn btn-ghost" style={{ minHeight: 44 }}>
                {profileCopied ? '✅ Copied!' : '🔗 Copy Link'}
              </button>
            </div>
            <button onClick={shareProfileOnX} className="btn btn-ghost" style={{ width: '100%', minHeight: 40, marginBottom: 8 }}>
              𝕏 Share on X
            </button>
            <Link
              to="/bowl"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none', minHeight: 38, fontSize: 13 }}
            >
              👁️ Open Profile Preview →
            </Link>
          </div>
        )}
      </div>

      {/* Tonight's League — surfaces when a league is scheduled for today's day-of-week */}
      {tonightLeagues.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          {tonightLeagues.map((lg) => (
            <div
              key={lg.id}
              style={{
                background: 'linear-gradient(135deg, rgba(251,191,36,0.16) 0%, rgba(245,158,11,0.08) 50%, transparent 100%)',
                border: '1px solid rgba(251,191,36,0.32)',
                borderRadius: 18,
                padding: '16px 16px 14px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -30,
                  right: -30,
                  width: 120,
                  height: 120,
                  background: 'radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  display: 'inline-flex',
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(251,191,36,0.22)',
                  color: '#fcd34d',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                🏆 League Night — {lg.todayName}
              </div>
              <div style={{ fontSize: 17, fontWeight: 850, marginBottom: 2, lineHeight: 1.2 }}>
                {lg.name}
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                {lg.location ?? 'Location not set'}{lg.season ? ` · ${lg.season}` : ''}
                {!lg.inSeason && (
                  <span style={{ color: '#fca5a5', marginLeft: 8, fontWeight: 700 }}>
                    · Out of season
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 999,
                    padding: '3px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Week {lg.nextWeekNumber}
                </span>
                {lg.stats.totalGames > 0 && (
                  <>
                    <span
                      style={{
                        background: 'rgba(167,139,250,0.16)',
                        border: '1px solid rgba(167,139,250,0.32)',
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#c4b5fd',
                      }}
                    >
                      Avg {lg.stats.average}
                    </span>
                    {lg.stats.high > 0 && (
                      <span
                        style={{
                          background: 'rgba(251,191,36,0.14)',
                          border: '1px solid rgba(251,191,36,0.32)',
                          borderRadius: 999,
                          padding: '3px 10px',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#fcd34d',
                        }}
                      >
                        🏆 {lg.stats.high}
                      </span>
                    )}
                    <span
                      style={{
                        background: 'rgba(52,211,153,0.12)',
                        border: '1px solid rgba(52,211,153,0.28)',
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#34d399',
                      }}
                    >
                      {lg.stats.gamesWon}W–{lg.stats.gamesLost}L
                    </span>
                  </>
                )}
              </div>

              {lg.lastOpponent && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                  Last match: <strong style={{ color: 'var(--text)' }}>{lg.lastOpponent}</strong>
                  {lg.lastWeekDate && (
                    <span> · {new Date(lg.lastWeekDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(`/leagues/${lg.id}?logWeek=1&date=${lg.todayIso}`)}
                  style={{ fontSize: 14, fontWeight: 800, background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderColor: 'transparent', color: '#1a1a0f' }}
                >
                  🎳 Log This Week
                </button>
                <Link
                  to={`/leagues/${lg.id}`}
                  className="btn btn-ghost"
                  style={{ fontSize: 14, fontWeight: 700, color: '#fcd34d', borderColor: 'rgba(251,191,36,0.4)' }}
                >
                  View League →
                </Link>
                {lg.stats.totalGames > 0 && (
                  <Link
                    to={`/leagues/${lg.id}/leaderboard`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost"
                    style={{ fontSize: 14, fontWeight: 700, color: '#34d399', borderColor: 'rgba(52,211,153,0.4)' }}
                  >
                    🏆 Public Leaderboard ↗
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 🏆 300 Club — surfaces when there's a perfect game, with one-tap share */}
      {perfectGames.length > 0 && (
        <div style={{ marginBottom: 18, position: 'relative' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(245,158,11,0.08) 50%, rgba(167,139,250,0.08) 100%)',
              border: '1px solid rgba(251,191,36,0.36)',
              borderRadius: 18,
              padding: '16px 16px 14px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -40,
                right: -40,
                width: 140,
                height: 140,
                background: 'radial-gradient(circle, rgba(251,191,36,0.22) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                display: 'inline-flex',
                padding: '3px 10px',
                borderRadius: 999,
                background: 'rgba(251,191,36,0.24)',
                color: '#fcd34d',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.6,
                marginBottom: 8,
                textTransform: 'uppercase',
              }}
            >
              🏆 300 CLUB · {perfectGames.length} PERFECT
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 36, lineHeight: 1, fontWeight: 900, color: '#fbbf24' }}>
                300
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Most recent · {perfectGames[0].location || 'Unknown Lanes'}
                {perfectGames[0].lanes ? ` · Lanes ${perfectGames[0].lanes}` : ''}
              </div>
            </div>
            {perfectGames[0].ballName && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                🎳 {perfectGames[0].ballName}
                <span style={{ marginLeft: 8 }}>
                  · {new Date(perfectGames[0].date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShare300PopoverOpen(v => !v)}
                aria-expanded={share300PopoverOpen}
                aria-controls="dashboard-perfect-share"
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                  borderColor: 'transparent',
                  color: '#1a1a0f',
                }}
              >
                📤 {share300PopoverOpen ? 'Hide Share' : 'Share This 300'}
              </button>
              <Link
                to={`/score/${perfectGames[0].id}`}
                className="btn btn-ghost"
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fcd34d',
                  borderColor: 'rgba(251,191,36,0.4)',
                }}
              >
                View Scorecard →
              </Link>
              <Link
                to="/perfect-games"
                className="btn btn-ghost"
                style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', borderColor: 'var(--border)' }}
              >
                All 300s ({perfectGames.length})
              </Link>
            </div>
          </div>

          {share300PopoverOpen && (
            <div
              id="dashboard-perfect-share"
              role="dialog"
              aria-label="Share your perfect 300 game"
              style={{
                marginTop: 10,
                background: '#0d0d1a',
                border: '1px solid rgba(251,191,36,0.32)',
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div className="muted" style={{ fontSize: 11, marginBottom: 8, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Share your perfect 300
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  background: 'rgba(167,139,250,0.08)',
                  border: '1px solid rgba(167,139,250,0.2)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  wordBreak: 'break-all',
                  marginBottom: 10,
                  color: '#c4b5fd',
                }}
              >
                {getGameShareUrl(perfectGames[0].id)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 10, lineHeight: 1.4 }}>
                Anyone with this link sees your scorecard + frame breakdown. The share card previews as a 1200×630 PNG on social feeds.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleCopyPerfectLink(perfectGames[0].id)}
                  style={{ fontSize: 13, fontWeight: 700 }}
                >
                  {share300Copied ? '✅ Copied!' : '🔗 Copy Link'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleNativeSharePerfect(perfectGames[0])}
                  disabled={share300Busy}
                  style={{ fontSize: 13, fontWeight: 700 }}
                >
                  {share300Busy ? 'Preparing…' : '📱 Share'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => shareOnX(perfectGames[0].id, 300, perfectGames[0].location)}
                  style={{ fontSize: 13, fontWeight: 700 }}
                >
                  🐦 Post to X
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleDownloadPerfectImage(perfectGames[0].id)}
                  disabled={share300Busy}
                  style={{ fontSize: 13, fontWeight: 700 }}
                >
                  ⬇️ Download PNG
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <a
                  href={getGameOgImageUrl(perfectGames[0].id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost"
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', borderColor: 'var(--border)', flex: 1, textAlign: 'center' }}
                >
                  Open Share Image ↗
                </a>
                <Link
                  to={`/perfect-games/${perfectGames[0].id}`}
                  className="btn btn-ghost"
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', borderColor: 'var(--border)', flex: 1, textAlign: 'center' }}
                >
                  Full Share Page
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
        <div className="card card-accent-top dashboard-stat" style={{ padding: 14, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Average Score</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 900, color: 'var(--accent)' }}>{stats?.average ?? '—'}</div>
            {(stats?.average ?? 0) >= 200 && <span style={{ fontSize: 16, color: '#34d399' }}>🔥</span>}
          </div>
        </div>

        <div className="card card-accent-top dashboard-stat" style={{ padding: 14, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{highScoreFromRecent !== null ? 'High Score' : 'Total Games'}</div>
          <div style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 900, color: 'var(--accent)' }}>
            {highScoreFromRecent ?? (stats?.totalGames ?? '—')}
          </div>
        </div>
      </div>

      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 24 }}>
        <div className="card card-accent-top dashboard-stat" style={{ padding: 14, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Strike Rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 700, color: 'var(--accent)' }}>
              {stats?.strikeRate ? `${stats.strikeRate}%` : '—'}
            </div>
            {(stats?.strikeRate ?? 0) >= 30 && <span style={{ fontSize: 15 }}>⚡</span>}
          </div>
        </div>

        <div className="card card-accent-top dashboard-stat" style={{ padding: 14, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Spare Rate</div>
          <div style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 700, color: 'var(--accent)' }}>
            {stats?.spareRate ? `${stats.spareRate}%` : '—'}
          </div>
        </div>
      </div>

      {weekly && (weekly.thisWeek?.games > 0 || weekly.lastWeek?.games > 0) && (
        <div className="card" style={{ marginBottom: 24, padding: '16px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>📅 Weekly Summary</div>
              <div className="muted" style={{ fontSize: 11 }}>{weekly.dayOfWeek}</div>
            </div>
            {weekly.delta?.average !== null && weekly.delta?.average !== undefined && (
              <div style={{
                fontSize: 13,
                fontWeight: 800,
                color: weekly.delta.average > 0 ? '#34d399' : weekly.delta.average < 0 ? '#ef4444' : 'var(--muted)',
                background: weekly.delta.average > 0 ? 'rgba(52,211,153,0.12)' : weekly.delta.average < 0 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${weekly.delta.average > 0 ? 'rgba(52,211,153,0.3)' : weekly.delta.average < 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                borderRadius: 999,
                padding: '3px 10px',
              }}>
                {weekly.delta.average > 0 ? '↑' : weekly.delta.average < 0 ? '↓' : '—'}
                {Math.abs(weekly.delta.average)} avg
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {/* This week */}
            <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 12, padding: '10px 10px 8px' }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>THIS WEEK</div>
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1, color: 'var(--accent)' }}>{weekly.thisWeek?.average ?? '—'}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>avg · {weekly.thisWeek?.games ?? 0}g</div>
              {weekly.thisWeek?.highGame > 0 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginTop: 4 }}>🏆 {weekly.thisWeek.highGame}</div>
              )}
            </div>

            {/* Last week */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 10px 8px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>LAST WEEK</div>
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1, color: 'var(--muted)' }}>{weekly.lastWeek?.average ?? '—'}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>avg · {weekly.lastWeek?.games ?? 0}g</div>
              {weekly.lastWeek?.highGame > 0 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginTop: 4 }}>🏆 {weekly.lastWeek.highGame}</div>
              )}
            </div>

            {/* Best recent */}
            <div style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '10px 10px 8px' }}>
              <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>BEST RECENT</div>
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1, color: '#fbbf24' }}>{Math.max(weekly.thisWeek?.highGame ?? 0, weekly.lastWeek?.highGame ?? 0) || '—'}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>high game</div>
              {weekly.delta?.games !== 0 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: weekly.delta.games > 0 ? '#34d399' : '#ef4444', marginTop: 4 }}>
                  {weekly.delta.games > 0 ? '+' : ''}{weekly.delta.games} game{weekly.delta.games !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 24 }}>
        {[
          { to: '/leagues', icon: '🏆', label: 'Leagues' },
          { to: '/tournaments', icon: '🎯', label: 'Events' },
          { to: '/arsenals', icon: '💼', label: 'Arsenal' },
        ].map(item => (
          <Link key={item.to} to={item.to} className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: '14px 8px' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</div>
          </Link>
        ))}
      </div>

      {recentGames && recentGames.length >= 2 && <ScoreTrendChart games={recentGames} average={stats?.average ?? 0} />}

      {ballStats && ballStats.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>🎳 Ball Performance</div>
          <div className="ball-performance-row" style={{ display: 'flex', gap: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', maxWidth: '100%', paddingBottom: 4 }}>
            {ballStats.map((b) => (
              <div key={b.ballId} className="ball-performance-item" style={{ minWidth: 180, background: '#121228', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{b.ballName}</div>
                <div className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>{b.brand}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{b.average}</div>
                <div className="muted" style={{ fontSize: 12 }}>{b.gameCount} games</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2>Recent Sessions</h2>
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value as 'newest' | 'oldest' | 'highscore')}
          style={{ width: 'auto', minHeight: 34, padding: '6px 10px', fontSize: 13, borderRadius: 10 }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="highscore">High score</option>
        </select>
      </div>
      {!sessions?.length && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎳</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No sessions yet</div>
          <div className="muted" style={{ fontSize: 14, marginBottom: 16 }}>Bowl your first game and start tracking your progress.</div>
          <Link to="/sessions/new" className="btn btn-primary" style={{ width: '100%' }}>Start First Session</Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sortedSessions.map(s => (
          <Link
            key={s.id}
            to={`/sessions/${s.id}`}
            className="card card-hover"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 16px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{s.location || 'Unknown Lanes'}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {s.date}
                {s.lanes ? ` · Lanes ${s.lanes}` : ''}
                {s.gameCount ? ` · ${s.gameCount} game${s.gameCount !== 1 ? 's' : ''}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {s.highScore ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.highScore === 300 ? '#34d399' : 'var(--accent)', lineHeight: 1 }}>
                    {s.highScore === 300 ? '🏆 ' : ''}
                    {s.highScore}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>high score</div>
                </>
              ) : (
                <span style={{ color: 'var(--accent)', fontSize: 20 }}>›</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {showQuickLog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ background: '#0d0d1a', border: '1px solid var(--border)', borderRadius: 20, padding: 20, maxHeight: '90vh', overflowY: 'auto', maxWidth: 560, width: '90%', position: 'relative' }}>
            <button
              type="button"
              onClick={closeQuickLog}
              style={{ position: 'absolute', top: 14, right: 14, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', width: 32, height: 32, borderRadius: 999, cursor: 'pointer' }}
            >
              ✕
            </button>

            <h3 style={{ margin: 0, marginBottom: 14 }}>⚡ Quick Log</h3>

            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Location</span>
                <input value={quickLogLocation} onChange={(e) => setQuickLogLocation(e.target.value)} placeholder="Bowling alley" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Date</span>
                <input type="date" value={quickLogDate} onChange={(e) => setQuickLogDate(e.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Lanes (optional)</span>
                <input value={quickLogLanes} onChange={(e) => setQuickLogLanes(e.target.value)} placeholder="e.g. 12" />
              </label>
            </div>

            {quickLogSaved && quickLogSessionId ? (
              <div style={{ border: '1px solid rgba(52,211,153,0.35)', background: 'rgba(52,211,153,0.1)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>
                  ✅ Logged! <Link to={`/sessions/${quickLogSessionId}`} style={{ color: 'var(--accent)' }}>View Session</Link>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setQuickLogGameNumber((n) => n + 1)
                      setQuickLogSaved(false)
                    }}
                  >
                    Log Another Game
                  </button>
                  <button type="button" className="btn btn-primary" onClick={closeQuickLog}>Done</button>
                </div>
              </div>
            ) : (
              <BowlingScorer
                gameNumber={quickLogGameNumber}
                balls={balls}
                defaultBallId={settings.defaultBallId}
                onSave={(game) => { void handleQuickLogSave(game) }}
                onCancel={closeQuickLog}
              />
            )}

            {(createSessionMutation.isPending || createGameMutation.isPending) && (
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>Saving...</div>
            )}
            {(createSessionMutation.isError || createGameMutation.isError) && (
              <div style={{ color: '#fca5a5', fontSize: 13, marginTop: 8 }}>Could not save game. Please try again.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
