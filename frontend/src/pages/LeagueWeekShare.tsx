import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { copyText } from '../features/scoring/copyText'

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

  usePublicMetadata({ title, description: subtitle || 'Shared league week recap', imageUrl: invalidIds ? '' : ogImageUrl })

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
      await copyText(window.location.href)
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
      <PublicShell eyebrow="League recap" title="League or week not found"><Link to="/">BowlSense home</Link></PublicShell>
    )
  }

  return (
    <PublicShell eyebrow="League recap" title={data?.league.name || 'League week'} detail={subtitle || 'Shared result'}>
      <div className="public-legacy-content" style={{ maxWidth: 960, margin: '0 auto' }}>

        {isLoading && (
          <div style={{ textAlign: 'center', padding: 80, color: 'rgba(255,255,255,0.6)' }}>Loading recap...</div>
        )}

        {isError && (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ color: '#fc8181', marginBottom: 16 }}>Failed to load week data.</div>
            <p style={{ color: 'rgba(255,255,255,0.6)' }}>This shared league week is unavailable right now.</p>
            <Link to="/" className="btn btn-primary" style={{ marginTop: 20, display: 'inline-block' }}>
              BowlSense home
            </Link>
          </div>
        )}

        {!isLoading && !isError && data && (
          <>
            <PublicResult score={data.stats.average} label="Week average" accessibleLabel={`Week average ${data.stats.average}`} facts={[
              { label: 'Series', value: data.stats.series },
              { label: 'High game', value: data.stats.highGame },
              { label: 'Record', value: `${data.week.gamesWon}W – ${data.week.gamesLost}L${data.week.gamesTied ? ` – ${data.week.gamesTied}T` : ''}` },
            ]} />
            {/* OG image preview */}
            <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <img src={ogImageUrl} alt="League week recap card" style={{ width: '100%', display: 'block' }} />
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
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>G{i + 1}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: text, lineHeight: 1 }}>{label}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>No game scores available yet.</div>
            )}

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

          </>
        )}
      </div>
    </PublicShell>
  )
}
