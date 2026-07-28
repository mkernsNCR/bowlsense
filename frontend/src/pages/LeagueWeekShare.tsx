import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

interface WeekData {
  league: { id: number; name: string; location: string | null; season: string | null }
  week: { id: number; weekNumber: number; date: string; opponent: string; gamesWon: number; gamesLost: number; gamesTied: number }
  games: number[]
  stats: { average: number; highGame: number; totalGames: number; series: number }
}

function scoreColor(score: number): { bg: string; text: string; label: string } {
  if (score === 300) return { bg: '#fbbf24', text: '#0d0d1a', label: '🏆 300' }
  if (score >= 250) return { bg: '#a78bfa', text: '#ffffff', label: String(score) }
  if (score >= 200) return { bg: '#818cf8', text: '#ffffff', label: String(score) }
  if (score < 170) return { bg: '#fc8181', text: '#ffffff', label: String(score) }
  return { bg: 'rgba(255,255,255,0.12)', text: '#ffffff', label: String(score) }
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: '#121228', borderRadius: 16, padding: '16px 20px',
      border: '1px solid rgba(167,139,250,0.2)', textAlign: 'center', flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: accent || '#fff', lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

export default function LeagueWeekShare() {
  const { id, weekId } = useParams()
  const leagueId = Number(id)
  const weekIdNum = Number(weekId)
  const invalidIds = Number.isNaN(leagueId) || Number.isNaN(weekIdNum)

  const { data, isLoading, isError } = useQuery<WeekData>({
    queryKey: ['league-week-share', leagueId, weekIdNum],
    enabled: !invalidIds,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/weeks/${weekIdNum}`)
      if (!res.ok) throw new Error('Failed to load week')
      return res.json()
    },
  })

  const [copied, setCopied] = useState(false)

  const title = data ? `${data.league.name} — Week ${data.week.weekNumber} Recap 🎳` : 'League Week Recap 🎳'
  const subtitle = data ? [data.league.location, `Week ${data.week.weekNumber}`, data.week.date].filter(Boolean).join(' · ') : ''
  const ogImageUrl = data ? `/api/leagues/${leagueId}/weeks/${weekIdNum}/og-image` : ''

  useEffect(() => {
    if (invalidIds) return
    document.title = title
    const setMeta = (prop: string, content: string) => {
      let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el) }
      el.content = content
    }
    setMeta('og:title', title)
    setMeta('og:description', subtitle)
    setMeta('og:image', ogImageUrl)
    setMeta('og:image:width', '1200')
    setMeta('og:image:height', '630')
    setMeta('og:type', 'website')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', title)
    setMeta('twitter:description', subtitle)
    if (ogImageUrl) setMeta('twitter:image', ogImageUrl)
  }, [title, subtitle, ogImageUrl, invalidIds])

  const shareText = useMemo(() => {
    if (!data) return ''
    const scores = data.games.join('-')
    return `Just wrapped Week ${data.week.weekNumber} of ${data.league.name}! 🎳 Scores: ${scores} → Avg ${data.stats.average}`
  }, [data])

  const twitterIntent = useMemo(() => {
    if (!data) return '#'
    const text = encodeURIComponent(shareText)
    const url = encodeURIComponent(window.location.href)
    return `https://twitter.com/intent/tweet?text=${text}&url=${url}`
  }, [data, shareText])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  const nativeShare = async () => {
    if (!data || !navigator.share) return
    try {
      await navigator.share({ title: `${data.league.name} Recap`, text: shareText, url: window.location.href })
    } catch { /* ignore */ }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  if (invalidIds) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <h2>League or week not found</h2>
          <Link to="/" className="btn btn-ghost" style={{ marginTop: 16 }}>BowlSense home</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d1a',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      paddingBottom: 60,
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* Back link */}
        <Link to="/" style={{ color: '#a78bfa', textDecoration: 'none', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
          BowlSense home
        </Link>

        {isLoading && (
          <div style={{ textAlign: 'center', padding: 80, color: 'rgba(255,255,255,0.6)' }}>Loading recap...</div>
        )}

        {isError && (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ color: '#fc8181', marginBottom: 16 }}>Failed to load week data.</div>
            <p style={{ color: 'rgba(255,255,255,0.6)' }}>No league weeks found. Log your first week to generate a share card! 🎳</p>
            <Link to="/" className="btn btn-primary" style={{ marginTop: 20, display: 'inline-block' }}>
              BowlSense home
            </Link>
          </div>
        )}

        {!isLoading && !isError && data && (
          <>
            {/* OG image preview */}
            <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <img src={ogImageUrl} alt="League week recap card" style={{ width: '100%', display: 'block' }} />
            </div>

            {/* Hero */}
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: 'inline-flex',
                padding: '5px 14px',
                borderRadius: 999,
                background: 'rgba(167,139,250,0.18)',
                color: '#c4b5fd',
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: 0.5,
                marginBottom: 10,
                border: '1px solid rgba(167,139,250,0.3)',
              }}>
                🏆 LEAGUE NIGHT RECAP
              </div>
              <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', fontWeight: 900 }}>
                {data.league.name}
              </h1>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>
                Week {data.week.weekNumber} · {data.week.date} · vs {data.week.opponent}
              </div>
            </div>

            {/* Game scores */}
            {data.games.length > 0 ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                {data.games.map((score, i) => {
                  const { bg, text, label } = scoreColor(score)
                  return (
                    <div key={i} style={{
                      background: bg, borderRadius: 12, padding: '12px 16px',
                      minWidth: 72, textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>G{i + 1}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: text, lineHeight: 1 }}>{label}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>No game scores available yet.</div>
            )}

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 28 }}>
              <StatPill label="Average" value={String(data.stats.average)} accent="#a78bfa" />
              <StatPill label="High Game" value={String(data.stats.highGame)} accent={data.stats.highGame === 300 ? '#fbbf24' : undefined} />
              <StatPill
                label="W-L Record"
                value={data.week.gamesTied > 0 ? `${data.week.gamesWon}W-${data.week.gamesLost}L-${data.week.gamesTied}T` : `${data.week.gamesWon}W-${data.week.gamesLost}L`}
              />
              <StatPill label="Series" value={String(data.stats.series)} />
            </div>

            {/* Share actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
              <a
                href={twitterIntent}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#7c3aed', border: '1px solid rgba(167,139,250,0.5)', color: '#fff',
                  fontWeight: 800, flex: 1, minHeight: 48, borderRadius: 12,
                  textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '0 20px',
                }}
              >
                Share on X
              </a>
              <button
                onClick={copyLink}
                style={{
                  background: 'transparent', border: '1px solid rgba(167,139,250,0.5)', color: '#fff',
                  fontWeight: 800, flex: 1, minHeight: 48, borderRadius: 12, cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                {copied ? 'Link copied' : 'Copy link'}
              </button>
              {canShare && (
                <button
                  onClick={nativeShare}
                  style={{
                    background: 'transparent', border: '1px solid rgba(167,139,250,0.5)', color: '#fff',
                    fontWeight: 800, flex: 1, minHeight: 48, borderRadius: 12, cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  More sharing options
                </button>
              )}
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 8 }}>
              Made with 🎳 BowlSense
            </div>
          </>
        )}
      </div>
    </div>
  )
}
