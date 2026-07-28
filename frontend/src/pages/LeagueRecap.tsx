import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

interface RecapLeague { id: number; name: string; location: string | null; season: string | null }
interface RecapWeek { weekNumber: number; date: string; opponent: string; won: number; lost: number; tied: number }
interface RecapStats { average: number; highGame: number; totalGames: number; series: number }
interface RecapData { league: RecapLeague; week: RecapWeek; games: number[]; stats: RecapStats }

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

function recapNarrative(data: RecapData): string {
  const opponent = data.week.opponent ? ` against ${data.week.opponent}` : ''
  const record = data.week.tied > 0
    ? `${data.week.won} wins, ${data.week.lost} losses, and ${data.week.tied} tie${data.week.tied === 1 ? '' : 's'}`
    : `${data.week.won} wins and ${data.week.lost} losses`
  const highNote = data.stats.highGame === 300 ? ' A perfect game capped the set.' : ` The high game was ${data.stats.highGame}.`
  return `Week ${data.week.weekNumber}${opponent} finished with ${record}. The set averaged ${data.stats.average} across ${data.stats.totalGames} games.${highNote}`
}

export default function LeagueRecap() {
  const { id } = useParams()
  const leagueId = Number(id)
  const invalidId = Number.isNaN(leagueId)

  const [data, setData] = useState<RecapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const downloadPng = async () => {
    if (!data) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/recap/og-image`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(data.league.name || 'league').replace(/\s+/g, '-').toLowerCase()}-week-${data.week.weekNumber}-recap.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
    setTimeout(() => setDownloading(false), 1200)
  }

  useEffect(() => {
    if (invalidId) return
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/recap`)
      .then(r => { if (!r.ok) throw new Error('Recap not found'); return r.json() })
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [leagueId, invalidId])

  const ogImageUrl = useMemo(() => data ? `/api/leagues/${leagueId}/recap/og-image` : '', [data, leagueId])

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
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (invalidId) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <h2>League not found</h2>
          <Link to="/leagues" className="btn btn-ghost" style={{ marginTop: 16 }}>Back to leagues</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 16px 60px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Link to="/leagues" style={{ color: '#a78bfa', textDecoration: 'none', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
          Back to leagues
        </Link>

        {loading && (
          <div style={{ textAlign: 'center', padding: 80, color: 'rgba(255,255,255,0.6)' }}>
            Loading recap...
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ color: '#fc8181', marginBottom: 16 }}>{error}</div>
            <p style={{ color: 'rgba(255,255,255,0.6)' }}>No league weeks have been logged yet. Log your first week to generate a recap! 🎳</p>
            <Link to="/leagues" className="btn btn-primary" style={{ marginTop: 20, display: 'inline-block' }}>
              Go to Leagues
            </Link>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* OG image preview */}
            <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <img src={ogImageUrl} alt="League recap card" style={{ width: '100%', display: 'block' }} />
            </div>

            {/* Hero */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'inline-flex', padding: '5px 12px', borderRadius: 999, background: 'rgba(167,139,250,0.18)', color: '#c4b5fd', fontWeight: 700, fontSize: 12, letterSpacing: 0.5, marginBottom: 10 }}>
                🏆 LEAGUE NIGHT RECAP
              </div>
              <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(1.8rem, 5vw, 2.8rem)', fontWeight: 900 }}>
                {data.league.name}
              </h1>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>
                Week {data.week.weekNumber} · {data.week.date} · vs {data.week.opponent}
              </div>
              <p style={{ maxWidth: 680, margin: '16px 0 0', color: 'rgba(255,255,255,.84)', fontSize: 18, lineHeight: 1.6 }}>
                {recapNarrative(data)}
              </p>
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
              <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>No game scores available</div>
            )}

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 28 }}>
              <StatPill label="Average" value={String(data.stats.average)} accent="#a78bfa" />
              <StatPill label="High Game" value={String(data.stats.highGame)} accent={data.stats.highGame === 300 ? '#fbbf24' : undefined} />
              <StatPill label="W-L Record" value={data.week.tied > 0 ? `${data.week.won}W-${data.week.lost}L-${data.week.tied}T` : `${data.week.won}W-${data.week.lost}L`} />
              <StatPill label="Series" value={String(data.stats.series)} />
            </div>

            {/* Share actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
              <a
                href={twitterIntent}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ background: '#7c3aed', borderColor: 'rgba(167,139,250,0.5)', color: '#fff', fontWeight: 800, flex: 1, minHeight: 48, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12, textDecoration: 'none' }}
              >
                Share on X
              </a>
              <button
                onClick={copyLink}
                className="btn btn-ghost"
                style={{ borderColor: 'rgba(167,139,250,0.5)', color: '#fff', fontWeight: 800, flex: 1, minHeight: 48, borderRadius: 12 }}
              >
                {copied ? 'Link copied' : 'Copy link'}
              </button>
              <button
                onClick={downloadPng}
                className="btn btn-ghost"
                style={{ borderColor: 'rgba(167,139,250,0.5)', color: downloading ? '#34d399' : '#fff', fontWeight: 800, flex: 1, minHeight: 48, borderRadius: 12 }}
              >
                {downloading ? 'Downloaded' : 'Download image'}
              </button>
              <Link
                to={`/leagues/${leagueId}/recap/share`}
                className="btn btn-ghost"
                style={{ borderColor: 'rgba(167,139,250,0.5)', color: '#fff', fontWeight: 800, flex: 1, minHeight: 48, borderRadius: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                Share page
              </Link>
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
