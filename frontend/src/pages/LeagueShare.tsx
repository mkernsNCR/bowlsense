import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { useCopyLink } from '../features/competition/useCopyLink'

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

function GameDot({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: 'var(--public-muted)', fontSize: 13 }}>—</span>
  const color = score === 300 ? '#9a6700' : score >= 200 ? '#6941b5' : score < 170 ? '#b42318' : 'var(--public-ink)'
  return <span style={{ color, fontWeight: 700, fontSize: 13 }}>{score}</span>
}

function ResultBadge({ won, lost, tied }: { won: number; lost: number; tied?: number }) {
  if (won === 0 && lost === 0 && (tied ?? 0) === 0) return null
  const won_ = won > lost ? 'W' : won < lost ? 'L' : 'T'
  const bg = won_ === 'W' ? '#dcfae6' : won_ === 'L' ? '#fee4e2' : '#f2f0f5'
  const color = won_ === 'W' ? '#067647' : won_ === 'L' ? '#b42318' : '#49454f'
  const record = tied != null && tied > 0 ? ` (${won}-${lost}-${tied})` : ` (${won}-${lost})`
  return (
    <span style={{ background: bg, color, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800 }}>
      {won_}{record}
    </span>
  )
}

export default function LeagueShare() {
  const { id } = useParams()
  const { copied, copyLink } = useCopyLink()
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

  const ogImageUrl = useMemo(() => {
    if (invalid || !leagueId) return ''
    return `/api/leagues/${leagueId}/share/og-image`
  }, [invalid, leagueId])

  const shareText = encodeURIComponent(
    `My ${data?.league?.name || 'league'} standings — averaging ${data?.stats?.average || 0}! 🎳`
  )
  const shareUrl = encodeURIComponent(window.location.href)
  const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`

  const pageTitle = `${data?.league?.name || 'League'} — BowlSense`
  usePublicMetadata({ title: pageTitle, description: subtitle || 'League results', imageUrl: ogImageUrl })

  if (invalid) {
    return (
      <PublicShell eyebrow="League result" title="League not found"><Link to="/">Browse leagues on BowlSense</Link></PublicShell>
    )
  }

  return (
    <PublicShell
      eyebrow="League result"
      title={data?.league?.name || 'League'}
      detail={subtitle}
      action={<button className="btn btn-primary" onClick={copyLink}>{copied ? 'Link copied' : 'Share league'}</button>}
    >
      {isLoading && <p className="muted">Loading league result…</p>}
      {isError && <p role="alert">Could not load league data.</p>}
      {data && (
        <>
          <PublicResult
            score={data.stats.average || '—'}
            label="League average"
            accessibleLabel={`League average ${data.stats.average || 'not available'}`}
            facts={[
              { label: 'Record', value: `${data.stats.gamesWon}W – ${data.stats.gamesLost}L${data.stats.gamesTied > 0 ? ` – ${data.stats.gamesTied}T` : ''}` },
              { label: 'Weeks', value: data.stats.totalWeeks },
              { label: 'High game', value: data.stats.highGame || '—' },
            ]}
          />
          <div className="public-share-actions">
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Share on X</a>
          </div>
          {!data.weeks.length ? <p className="muted">No weeks logged yet.</p> : (
            <section className="public-detail-list" aria-label="League weeks">
              {data.weeks.map((week) => (
                <article className="public-detail-row" key={week.weekNumber}>
                  <div><strong>Week {week.weekNumber} · {week.date}</strong><span>vs {week.opponent}</span></div>
                  <div><strong>{week.series || '—'} series</strong><ResultBadge won={week.gamesWon} lost={week.gamesLost} tied={week.gamesTied} /></div>
                  <div className="public-game-scores">{week.games.map((game) => <span key={game.gameNumber}>G{game.gameNumber} <GameDot score={game.score} /></span>)}</div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </PublicShell>
  )
}
