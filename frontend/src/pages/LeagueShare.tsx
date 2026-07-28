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
      background: 'var(--surface)', borderRadius: 16,
      padding: '14px 16px', border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
    }}>
      <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--ink) 70%, transparent)', marginBottom: 8 }}>{label}</div>
      <div style={{
        fontSize: 28, fontWeight: 800,
        color: gold ? 'var(--strike-gold)' : 'var(--ink)', lineHeight: 1.1,
      }}>{value}</div>
    </div>
  )
}

function GameDot({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: 'color-mix(in srgb, var(--ink) 30%, transparent)', fontSize: 13 }}>—</span>
  const color = score === 300 ? 'var(--strike-gold)' : score >= 200 ? 'var(--ink)' : score < 170 ? 'var(--danger)' : 'var(--ink)'
  return <span style={{ color, fontWeight: 700, fontSize: 13 }}>{score}</span>
}

function ResultBadge({ won, lost, tied }: { won: number; lost: number; tied?: number }) {
  if (won === 0 && lost === 0 && (tied ?? 0) === 0) return null
  const won_ = won > lost ? 'W' : won < lost ? 'L' : 'T'
  const bg = won_ === 'W' ? 'color-mix(in srgb, var(--spare-green) 15%, transparent)' : won_ === 'L' ? 'color-mix(in srgb, var(--danger) 15%, transparent)' : 'color-mix(in srgb, var(--ink) 10%, transparent)'
  const color = won_ === 'W' ? 'var(--spare-green)' : won_ === 'L' ? 'var(--danger)' : 'color-mix(in srgb, var(--ink) 70%, transparent)'
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
      <div style={{ minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)', fontFamily: 'system-ui', padding: 24 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', background: 'var(--surface)', borderRadius: 16, padding: 32 }}>
          <h2>League not found</h2>
          <Link to="/" style={{ color: 'var(--oil-violet)' }}>BowlSense home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="public-competition-page" style={{
      minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      paddingBottom: 40,
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 999,
            background: 'var(--surface-raised)',
            color: 'var(--ink-secondary)', fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
            marginBottom: 14, border: '1px solid var(--separator)',
          }}>
            🏆 League Share
          </div>
          <h1 style={{
            margin: '0 0 8px', fontSize: 'clamp(1.8rem, 5vw, 2.8rem)',
            fontWeight: 900, lineHeight: 1.1,
          }}>
            {data?.league?.name || 'League'}
          </h1>
          {subtitle && <div style={{ color: 'color-mix(in srgb, var(--ink) 72%, transparent)', fontSize: 15 }}>{subtitle}</div>}
        </div>

        {/* Share buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          <button
            onClick={handleCopy}
            className="public-action-target"
            style={{
              background: copied ? 'var(--spare-green)' : 'var(--oil-violet)',
              border: 'none', borderRadius: 12, padding: '10px 20px',
              color: 'var(--on-tint)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <a
            href={twitterUrl}
            className="public-action-target"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'color-mix(in srgb, var(--ink) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--ink) 20%, transparent)',
              borderRadius: 12, padding: '10px 20px', color: 'var(--ink)',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}
          >
            Share on X
          </a>
        </div>

        {/* Stats */}
        {isLoading && <div style={{ color: 'color-mix(in srgb, var(--ink) 60%, transparent)', padding: 20 }}>Loading...</div>}
        {isError && <div style={{ color: 'var(--danger)', padding: 20 }}>Could not load league data.</div>}

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
                background: 'var(--surface)', borderRadius: 16,
                border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
                padding: 32, textAlign: 'center', color: 'color-mix(in srgb, var(--ink) 70%, transparent)',
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
                        background: 'var(--surface)', borderRadius: 16,
                        border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
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
                            background: 'color-mix(in srgb, var(--ink) 6%, transparent)', color: 'var(--ink-secondary)',
                            borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700,
                            marginRight: 8,
                          }}>
                            Week {week.weekNumber}
                          </span>
                          <span style={{ color: 'color-mix(in srgb, var(--ink) 60%, transparent)', fontSize: 13 }}>
                            {week.date}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {week.series && (
                            <span style={{ fontSize: 13, color: 'color-mix(in srgb, var(--ink) 70%, transparent)' }}>
                              Series: <strong style={{ color: 'var(--ink)' }}>{week.series}</strong>
                            </span>
                          )}
                          <ResultBadge won={week.gamesWon} lost={week.gamesLost} tied={week.gamesTied} />
                        </div>
                      </div>

                      {/* Opponent */}
                      <div style={{ fontSize: 14, color: 'color-mix(in srgb, var(--ink) 85%, transparent)', marginBottom: 10 }}>
                        vs <strong>{week.opponent}</strong>
                      </div>

                      {/* Game scores */}
                      {scores.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {week.games.map((g) => (
                            <div
                              key={g.gameNumber}
                              style={{
                                background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--ink) 10%, transparent)',
                                borderRadius: 10, padding: '8px 14px', textAlign: 'center', minWidth: 64,
                              }}
                            >
                              <div style={{ fontSize: 11, color: 'color-mix(in srgb, var(--ink) 50%, transparent)', marginBottom: 4 }}>
                                G{g.gameNumber}
                              </div>
                              <GameDot score={g.score} />
                              {g.score != null && (
                                <div style={{ fontSize: 10, color: 'color-mix(in srgb, var(--ink) 40%, transparent)', marginTop: 2 }}>
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
          borderTop: '1px solid color-mix(in srgb, var(--ink) 10%, transparent)',
          display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          color: 'color-mix(in srgb, var(--ink) 50%, transparent)', fontSize: 13,
        }}>
          <span>Tracked with BowlSense 🧠</span>
          <Link to="/" style={{ color: 'var(--oil-violet)', textDecoration: 'none', fontWeight: 700 }}>
            BowlSense home
          </Link>
        </div>
      </div>
    </div>
  )
}
