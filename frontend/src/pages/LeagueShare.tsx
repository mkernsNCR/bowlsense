import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

interface ShareGame { gameNumber: number; score: number | null; strikes: number | null; spares: number | null }
interface ShareWeek {
  weekNumber: number
  date: string
  opponent: string
  games: ShareGame[]
  series: number | null
  gamesWon: number
  gamesLost: number
  gamesTied: number
}
interface ShareStats { average: number; totalWeeks: number; gamesWon: number; gamesLost: number; gamesTied: number; highGame: number }
interface ShareLeague { id: number; name: string; location: string | null; season: string | null; dayOfWeek: string | null }

interface ShareResponse {
  league: ShareLeague
  stats: ShareStats
  weeks: ShareWeek[]
}

function StatCard({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div style={{
      background: '#121228', borderRadius: 16,
      padding: '14px 16px', border: '1px solid rgba(167,139,250,0.2)',
    }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{label}</div>
      <div style={{
        fontSize: 28, fontWeight: 800,
        color: gold ? '#fbbf24' : '#a78bfa', lineHeight: 1.1,
      }}>{value}</div>
    </div>
  )
}

function GameDot({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>—</span>
  const color = score === 300 ? '#fbbf24' : score >= 200 ? '#a78bfa' : score < 170 ? '#fc8181' : '#fff'
  return <span style={{ color, fontWeight: 700, fontSize: 13 }}>{score}</span>
}

function ResultBadge({ won, lost, tied }: { won: number; lost: number; tied?: number }) {
  if (won === 0 && lost === 0 && (tied ?? 0) === 0) return null
  const won_ = won > lost ? 'W' : won < lost ? 'L' : 'T'
  const bg = won_ === 'W' ? 'rgba(52,211,153,0.15)' : won_ === 'L' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.1)'
  const color = won_ === 'W' ? '#34d399' : won_ === 'L' ? '#fc8181' : 'rgba(255,255,255,0.7)'
  const record = tied != null && tied > 0 ? ` (${won}-${lost}-${tied})` : ` (${won}-${lost})`
  return (
    <span style={{ background: bg, color, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800 }}>
      {won_}{record}
    </span>
  )
}

export default function LeagueShare() {
  const { id } = useParams()
  const [copied, setCopied] = useState(false)
  const leagueId = Number(id)
  const invalid = Number.isNaN(leagueId)

  const { data, isLoading, isError } = useQuery<ShareResponse>({
    queryKey: ['league-share', leagueId],
    enabled: !invalid,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/share`)
      if (!res.ok) throw new Error('Failed to load')
      return res.json()
    },
  })

  const subtitle = useMemo(() => {
    const parts = [data?.league?.location, data?.league?.season, data?.league?.dayOfWeek].filter(Boolean)
    return parts.length ? parts.join(' · ') : ''
  }, [data])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const ogImageUrl = useMemo(() => {
    if (invalid || !leagueId) return ''
    return `/api/leagues/${leagueId}/share/og-image`
  }, [invalid, leagueId])

  const shareText = encodeURIComponent(
    `My ${data?.league?.name || 'league'} standings — averaging ${data?.stats?.average || 0}! 🎳`
  )
  const shareUrl = encodeURIComponent(window.location.href)
  const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`

  // Set OG meta tags for social sharing
  useEffect(() => {
    if (!data) return
    const pageTitle = `${data.league?.name || 'League'} — BowlSense`
    document.title = pageTitle

    const setMeta = (property: string, content: string, attr: 'property' | 'name' = 'property') => {
      let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, property)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    setMeta('og:title', pageTitle)
    setMeta('og:description', subtitle || 'League results')
    if (ogImageUrl) setMeta('og:image', ogImageUrl)
    setMeta('og:image:width', '1200')
    setMeta('og:image:height', '630')
    setMeta('og:type', 'website')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', pageTitle)
    setMeta('twitter:description', subtitle || 'League results')
    if (ogImageUrl) setMeta('twitter:image', ogImageUrl)
  }, [data, subtitle, ogImageUrl])

  if (invalid) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', fontFamily: 'system-ui', padding: 24 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', background: '#121228', borderRadius: 16, padding: 32 }}>
          <h2>League not found</h2>
          <Link to="/leagues" style={{ color: '#a78bfa' }}>← Back to Leagues</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0d0d1a', color: '#fff',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      paddingBottom: 40,
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(167,139,250,0.3), rgba(139,92,246,0.3))',
            color: '#c4b5fd', fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
            marginBottom: 14, border: '1px solid rgba(167,139,250,0.4)',
          }}>
            🏆 League Share
          </div>
          <h1 style={{
            margin: '0 0 8px', fontSize: 'clamp(1.8rem, 5vw, 2.8rem)',
            fontWeight: 900, lineHeight: 1.1,
          }}>
            {data?.league?.name || 'League'}
          </h1>
          {subtitle && <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 15 }}>{subtitle}</div>}
        </div>

        {/* Share buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#34d399' : '#a78bfa',
              border: 'none', borderRadius: 12, padding: '10px 20px',
              color: '#0d0d1a', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied ? '✅ Copied!' : '📤 Copy Link'}
          </button>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 12, padding: '10px 20px', color: '#fff',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}
          >
            𝕏 Share on X
          </a>
        </div>

        {/* Stats */}
        {isLoading && <div style={{ color: 'rgba(255,255,255,0.6)', padding: 20 }}>Loading...</div>}
        {isError && <div style={{ color: '#fc8181', padding: 20 }}>Could not load league data.</div>}

        {data && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12, marginBottom: 28,
            }}>
              <StatCard label="Avg Score" value={data.stats.average ? String(data.stats.average) : '—'} />
              <StatCard
                label="Record"
                value={`${data.stats.gamesWon}W – ${data.stats.gamesLost}L${data.stats.gamesTied > 0 ? ` – ${data.stats.gamesTied}T` : ''}`}
              />
              <StatCard label="Weeks" value={String(data.stats.totalWeeks)} />
              <StatCard
                label="High Game"
                value={data.stats.highGame ? String(data.stats.highGame) : '—'}
                gold={!!data.stats.highGame}
              />
            </div>

            {/* Weeks list */}
            {!data.weeks.length ? (
              <div style={{
                background: '#121228', borderRadius: 16,
                border: '1px solid rgba(167,139,250,0.2)',
                padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.7)',
              }}>
                No weeks logged yet — check back after your next league night! 🎳
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.weeks.map((week) => {
                  const scores = week.games.map((g) => g.score).filter((s) => s != null)
                  return (
                    <div
                      key={week.weekNumber}
                      style={{
                        background: '#121228', borderRadius: 16,
                        border: '1px solid rgba(167,139,250,0.2)',
                        padding: '16px 18px',
                      }}
                    >
                      {/* Week header */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        gap: 10, flexWrap: 'wrap', marginBottom: scores.length ? 12 : 0,
                      }}>
                        <div>
                          <span style={{
                            background: 'rgba(167,139,250,0.2)', color: '#c4b5fd',
                            borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700,
                            marginRight: 8,
                          }}>
                            Week {week.weekNumber}
                          </span>
                          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                            {week.date}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {week.series && (
                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                              Series: <strong style={{ color: '#a78bfa' }}>{week.series}</strong>
                            </span>
                          )}
                          <ResultBadge won={week.gamesWon} lost={week.gamesLost} tied={week.gamesTied} />
                        </div>
                      </div>

                      {/* Opponent */}
                      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 10 }}>
                        vs <strong>{week.opponent}</strong>
                      </div>

                      {/* Game scores */}
                      {scores.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {week.games.map((g) => (
                            <div
                              key={g.gameNumber}
                              style={{
                                background: '#0f1020', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 10, padding: '8px 14px', textAlign: 'center', minWidth: 64,
                              }}
                            >
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                                G{g.gameNumber}
                              </div>
                              <GameDot score={g.score} />
                              {g.score != null && (
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                                  {g.strikes ?? 0} strike{g.strikes !== 1 ? 's' : ''} · {g.spares ?? 0} spare{g.spares !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 36, paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          color: 'rgba(255,255,255,0.5)', fontSize: 13,
        }}>
          <span>Tracked with BowlSense 🧠</span>
          <Link to={`/leagues/${leagueId}`} style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 700 }}>
            ← View Full League
          </Link>
        </div>
      </div>
    </div>
  )
}
