import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import ShareCard from '../components/ShareCard'
import { copyGameShareLink, downloadGameImage, nativeShareGame, shareOnX } from '../utils/gameShare'
import QuickAddGame from '../components/QuickAddGame'

interface PerfectGame {
  id: number
  gameNumber: number
  score: number
  strikes: number
  spares: number
  splits: number
  ballId: number | null
  ballName: string | null
  frameData: string | null
  gameDate: string
  sessionId: number
  date: string
  location: string
  lanes: string
}

function parseFrames(frameData?: string | null): string[] {
  if (!frameData) return []
  try {
    const parsed = JSON.parse(frameData)
    const frames = Array.isArray(parsed?.frames) ? parsed.frames : []
    const mark = (v: number | null | undefined) => {
      if (v == null) return ''
      if (v === 10) return 'X'
      if (v === 0) return '-'
      return String(v)
    }
    return frames.map((f: any, idx: number) => {
      const b1 = f?.ball1
      const b2 = f?.ball2
      const b3 = f?.ball3
      if (idx < 9) {
        void idx
        if (b1 === 10) return 'X'
        if (b1 == null) return ''
        if (b2 == null) return mark(b1)
        return b1 + b2 === 10 ? `${mark(b1)}/` : `${mark(b1)}${mark(b2)}`
      }
      const first = mark(b1)
      const second = b2 != null ? (b1 !== 10 && b1 + b2 === 10 ? '/' : mark(b2)) : ''
      const third = b3 != null ? (b1 === 10 && b2 != null && b2 < 10 && b2 + b3 === 10 ? '/' : mark(b3)) : ''
      return `${first}${second}${third}`
    })
  } catch {
    return []
  }
}

function PerfectGameCard({ game }: { game: PerfectGame }) {
  const [showShare, setShowShare] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [sharing, setSharing] = useState(false)
  const marks = parseFrames(game.frameData)
  const year = game.date ? new Date(game.date + 'T00:00:00').getFullYear() : '—'
  const imageFileName = `bowlsense-300-${game.date || 'game'}-${game.id}.png`

  const handleCopyLink = async () => {
    await copyGameShareLink(game.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const handleDownload = async () => {
    await downloadGameImage(game.id, imageFileName)
    setDownloaded(true)
    window.setTimeout(() => setDownloaded(false), 1400)
  }

  const handleNativeShare = async () => {
    if (sharing) return
    setSharing(true)
    await nativeShareGame({
      gameId: game.id,
      filename: imageFileName,
      title: `Perfect 300 at ${game.location || 'the alley'}!`,
      text: `I rolled a perfect 300 in BowlSense 🎳`,
    })
    setSharing(false)
  }

  return (
    <div
      className="card"
      style={{
        border: '1px solid rgba(251,191,36,0.25)',
        background: 'linear-gradient(160deg, #12122a 0%, #0d0d1a 100%)',
        borderRadius: 20,
        padding: '20px 18px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow accent */}
      <div style={{
        position: 'absolute',
        top: -30,
        right: -30,
        width: 120,
        height: 120,
        background: 'radial-gradient(circle, rgba(251,191,36,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: 'inline-block',
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.4)',
            color: '#fbbf24',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.08em',
            padding: '3px 10px',
            marginBottom: 6,
          }}>
            PERFECT GAME
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {game.location || 'Unknown Alley'} · {game.date}
          </div>
          {game.ballName && (
            <div style={{ fontSize: 12, color: 'rgba(167,139,250,0.8)', marginTop: 2 }}>
              🎳 {game.ballName}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 48,
            fontWeight: 900,
            lineHeight: 1,
            color: '#fbbf24',
            textShadow: '0 0 30px rgba(251,191,36,0.4)',
          }}>
            {game.score}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>#{game.gameNumber} · {year}</div>
        </div>
      </div>

      {/* Frame scoreboard */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(10, 1fr)',
        gap: 3,
        background: '#09091a',
        borderRadius: 12,
        padding: '10px 8px',
        marginBottom: 14,
      }}>
        {marks.map((mark, i) => {
          const isLast = i === 9
          return (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: isLast ? '8px' : '6px',
                padding: isLast ? '6px 4px' : '6px 2px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: isLast ? 13 : 14,
                  fontWeight: 700,
                  color: mark === 'X' ? '#a78bfa' : mark.includes('/') ? '#c4b5fd' : '#ffffff',
                  letterSpacing: -0.5,
                  lineHeight: 1.2,
                  minHeight: 18,
                }}>
                  {mark || '·'}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Link
          to={`/sessions/${game.sessionId}`}
          className="btn btn-ghost"
          style={{ flex: 1, minHeight: 36, fontSize: 13, justifyContent: 'center' }}
        >
          📋 View Session
        </Link>
        <Link
          to={`/perfect-games/${game.id}`}
          className="btn"
          style={{
            flex: 1,
            minHeight: 36,
            fontSize: 13,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.35)',
            color: '#fbbf24',
            fontWeight: 700,
            justifyContent: 'center',
            textDecoration: 'none',
          }}
        >
          🔗 Share 300
        </Link>
        <button
          type="button"
          className="btn"
          onClick={() => setShowShare(true)}
          style={{
            flex: 1,
            minHeight: 36,
            fontSize: 13,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.35)',
            color: '#fbbf24',
            fontWeight: 700,
            justifyContent: 'center',
          }}
        >
          🎨 Customize Share
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() => shareOnX(game.id, game.score, game.location)}
          style={{
            flex: 1,
            minHeight: 36,
            fontSize: 13,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.35)',
            color: '#fbbf24',
            fontWeight: 700,
            justifyContent: 'center',
          }}
        >
          𝕏 Share on X
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleDownload}
          style={{
            flex: 1,
            minHeight: 36,
            fontSize: 13,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.35)',
            color: '#fbbf24',
            fontWeight: 700,
            justifyContent: 'center',
          }}
        >
          {downloaded ? '✅ Downloaded' : '⬇️ Download PNG'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleNativeShare}
          style={{ flex: 1, minHeight: 36, fontSize: 13, justifyContent: 'center' }}
        >
          {sharing ? 'Sharing…' : '📤 Share'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleCopyLink}
          style={{ flex: 1, minHeight: 36, fontSize: 13, justifyContent: 'center' }}
        >
          {copied ? '✅ Copied' : '🔗 Copy Link'}
        </button>
      </div>

      {showShare && (
        <ShareCard
          game={{
            gameNumber: game.gameNumber,
            score: game.score,
            strikes: game.strikes,
            spares: game.spares,
            splits: game.splits,
            frameData: game.frameData,
          }}
          session={{ location: game.location, date: game.date, lanes: game.lanes }}
          ballName={game.ballName ?? undefined}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  )
}

function TrophyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="16" fill="rgba(251,191,36,0.12)" />
      <path d="M24 32C24 32 10 26 10 18V12H16V17C16 22 19.5 26 24 26C28.5 26 32 22 32 17V12H38V18C38 26 24 32 24 32Z" fill="#fbbf24" opacity="0.3" />
      <path d="M24 30C24 30 12 24.5 12 17.5V12H17V17C17 21.4 20 25 24 25C28 25 31 21.4 31 17V12H36V17.5C36 24.5 24 30 24 30Z" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M17 12H31V14C31 15.1 30.1 16 29 16H19C17.9 16 17 15.1 17 14V12Z" stroke="#fbbf24" strokeWidth="2" strokeLinejoin="round" fill="none" />
      <path d="M24 32V35" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 35H28V37H20V35Z" stroke="#fbbf24" strokeWidth="2" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export default function PerfectGames() {
  const { data: perfectGames, isLoading } = useQuery<PerfectGame[]>({
    queryKey: ['games-perfect'],
    queryFn: () => fetch('/api/games/perfect').then(r => r.json()),
  })
  const [quickAddPerfect, setQuickAddPerfect] = useState(false)

  const total = perfectGames?.length ?? 0

  const byYear = (perfectGames ?? []).reduce<Record<number, number>>((acc, g) => {
    const year = g.date ? new Date(g.date + 'T00:00:00').getFullYear() : 0
    if (year) { acc[year] = (acc[year] ?? 0) + 1 }
    return acc
  }, {})

  const byLocation = (perfectGames ?? []).reduce<Record<string, number>>((acc, g) => {
    const loc = g.location || 'Unknown'
    acc[loc] = (acc[loc] ?? 0) + 1
    return acc
  }, {})

  const topLocation = Object.entries(byLocation).sort((a, b) => b[1] - a[1])[0]

  const mostRecent = perfectGames && perfectGames.length > 0 ? perfectGames[0] : null

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <div className="muted">Loading perfect games...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(167,139,250,0.05) 50%, transparent 100%)',
        border: '1px solid rgba(251,191,36,0.2)',
        borderRadius: 24,
        padding: '24px 20px',
        marginBottom: 24,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: -20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 200,
          height: 200,
          background: 'radial-gradient(circle, rgba(251,191,36,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
          <TrophyIcon />
        </div>

        <h1 style={{
          fontSize: 'clamp(1.8rem, 6vw, 2.8rem)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          color: '#fbbf24',
          marginBottom: 6,
          lineHeight: 1.1,
        }}>
          300 Club
        </h1>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: 500 }}>
          {total === 0 ? 'No perfect games yet — get in the club!' : `${total} perfect game${total !== 1 ? 's' : ''} on record`}
        </div>
      </div>

      {total === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 14 }}>🎳</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No Perfect Games Yet</div>
          <div className="muted" style={{ marginBottom: 20 }}>
            Keep bowling — that 300 is out there waiting.
          </div>
          <Link to="/sessions/new" className="btn btn-primary">
            🎳 Start a Session
          </Link>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 10,
            marginBottom: 24,
          }}>
            <div className="card card-accent-top" style={{ padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fbbf24', lineHeight: 1 }}>{total}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Total 300s</div>
            </div>

            <div className="card card-accent-top" style={{ padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fbbf24', lineHeight: 1 }}>
                {Object.keys(byYear).length}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Years</div>
            </div>

            <div className="card card-accent-top" style={{ padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24', lineHeight: 1.2, wordBreak: 'break-word' }}>
                {topLocation?.[0] ?? '—'}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Top Alley</div>
            </div>
          </div>

          {/* Year breakdown */}
          {Object.keys(byYear).length > 1 && (
            <div className="card" style={{ marginBottom: 20, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--muted)' }}>By Year</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(byYear).sort(([a], [b]) => Number(b) - Number(a)).map(([year, count]) => (
                  <div key={year} style={{
                    background: 'rgba(251,191,36,0.12)',
                    border: '1px solid rgba(251,191,36,0.3)',
                    borderRadius: 999,
                    padding: '4px 12px',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 800, color: '#fbbf24', fontSize: 15 }}>{count}x</span>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{year}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Most recent banner */}
          {mostRecent && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(167,139,250,0.05) 100%)',
              border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: 16,
              padding: '14px 16px',
              marginBottom: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>Most Recent</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {mostRecent.location || 'Unknown Alley'} · {mostRecent.date}
                </div>
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#fbbf24', flexShrink: 0 }}>
                {mostRecent.score}
              </div>
            </div>
          )}

          {/* Quick Add Perfect 300 */}
          {quickAddPerfect ? (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700 }}>🎳 Log Your Perfect 300</span>
                <button
                  className="btn btn-ghost"
                  style={{ minHeight: 28, padding: '3px 8px', fontSize: 12 }}
                  onClick={() => setQuickAddPerfect(false)}
                >
                  ✕ Cancel
                </button>
              </div>
              <QuickAddGame
                onDone={() => {
                  setQuickAddPerfect(false)
                }}
              />
            </div>
          ) : (
            <button
              className="btn"
              onClick={() => setQuickAddPerfect(true)}
              style={{
                width: '100%',
                minHeight: 48,
                background: 'rgba(251,191,36,0.12)',
                border: '1px solid rgba(251,191,36,0.3)',
                color: '#fbbf24',
                fontWeight: 800,
                fontSize: 15,
                borderRadius: 12,
                cursor: 'pointer',
                marginBottom: 16,
              }}
            >
              ➕ Log a Perfect 300
            </button>
          )}

          {/* Gallery */}
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--muted)' }}>
            All Perfect Games
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(perfectGames ?? []).map((game) => (
              <PerfectGameCard key={game.id} game={game} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
