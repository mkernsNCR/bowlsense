import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { copyText } from '../features/scoring/copyText'

interface RecapLeague { id: number; name: string; location: string | null; season: string | null }
interface RecapWeek { weekNumber: number; date: string; opponent: string; won: number; lost: number; tied: number }
interface RecapStats { average: number; highGame: number; totalGames: number; series: number }
interface RecapData { league: RecapLeague; week: RecapWeek; games: number[]; stats: RecapStats }

export default function LeagueRecapShare() {
  const { id } = useParams()
  const leagueId = Number(id)
  const invalidId = Number.isNaN(leagueId)

  const [data, setData] = useState<RecapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

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
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(window.location.href)}`
  }, [data, shareText])

  usePublicMetadata({
    title: data ? `Week ${data.week.weekNumber} Recap — ${data.league.name} 🎳` : 'League recap — BowlSense',
    description: data ? `Week ${data.week.weekNumber} · vs ${data.week.opponent} · Avg ${data.stats.average}` : 'Shared league recap',
    imageUrl: ogImageUrl,
  })

  const copyLink = async () => {
    try {
      await copyText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

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

  if (invalidId) {
    return (
      <PublicShell eyebrow="League recap" title="League not found"><Link to="/">BowlSense home</Link></PublicShell>
    )
  }

  return (
    <PublicShell
      eyebrow="League recap"
      title={data?.league.name || 'League night'}
      detail={data ? `Week ${data.week.weekNumber} · ${data.week.date} · vs ${data.week.opponent}` : 'Shared result'}
    >
      <div className="public-legacy-content" style={{ maxWidth: 640, margin: '0 auto' }}>
        {data && <PublicResult score={data.stats.average} label="Week average" accessibleLabel={`Week average ${data.stats.average}`} facts={[
          { label: 'Series', value: data.stats.series },
          { label: 'High game', value: data.stats.highGame },
          { label: 'Record', value: `${data.week.won}W – ${data.week.lost}L${data.week.tied ? ` – ${data.week.tied}T` : ''}` },
        ]} />}

        {/* Card preview */}
        <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 24, boxShadow: '0 12px 48px rgba(0,0,0,0.6)' }}>
          {loading ? (
            <div style={{ height: 315, background: '#121228', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading card...</div>
          ) : error ? (
            <div style={{ height: 315, background: '#121228', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fc8181' }}>{error}</div>
          ) : (
            <img src={ogImageUrl} alt="League recap card" style={{ width: '100%', display: 'block' }} />
          )}
        </div>

        {/* Share actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={downloadPng}
            disabled={loading || !!error}
            style={{
              background: downloading ? '#34d399' : '#a78bfa',
              border: 'none', borderRadius: 14, padding: '16px 24px',
              color: '#0d0d1a', fontWeight: 800, fontSize: 16, cursor: downloading ? 'default' : 'pointer',
              transition: 'background 0.2s', width: '100%', minHeight: 56,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {downloading ? 'Downloaded' : 'Download image'}
          </button>

          <a
            href={twitterIntent}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 14, padding: '16px 24px', color: '#fff',
              fontWeight: 800, fontSize: 16, textDecoration: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            𝕏 Share on X
          </a>

          <button
            onClick={copyLink}
            style={{
              background: copied ? '#34d399' : 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 14, padding: '16px 24px',
              color: copied ? '#0d0d1a' : '#fff',
              fontWeight: 800, fontSize: 16, cursor: 'pointer',
              transition: 'background 0.2s', width: '100%', minHeight: 56,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>

      </div>
    </PublicShell>
  )
}
