import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { downloadTournamentCard } from '../utils/tournamentShare'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { useCopyLink } from '../features/competition/useCopyLink'

interface ShareGame {
  id: number
  gameNumber: number
  score: number | null
  strikes: number | null
  spares: number | null
  splits: number | null
  ballId: number | null
  ballName: string | null
  squad: string | null
  frameData?: string | null
}
interface ShareStats {
  totalGames: number
  series: number
  average: number
  highGame: number
  placement: number | null
  net: number | null
}
interface ShareTournament {
  id: number
  name: string
  location: string | null
  date: string
  endDate: string | null
  format: string | null
  entryFee: number | null
  prizeFund: number | null
  placement: number | null
  notes: string | null
}
interface ShareResponse {
  tournament: ShareTournament
  stats: ShareStats
  games: ShareGame[]
}

function GameCard({ game }: { game: ShareGame }) {
  const scoreColor = game.score === 300
    ? '#8a5a00'
    : game.score != null && game.score >= 200
      ? 'var(--public-accent)'
      : game.score != null && game.score < 170
        ? '#9f1239'
        : 'var(--public-ink)'

  return (
    <article className="public-detail-row">
      <div>
        <strong>Game {game.gameNumber}</strong>
        <strong style={{ color: scoreColor, fontSize: 28 }}>{game.score != null ? game.score : '—'}</strong>
      </div>
      {game.squad && <span>Squad · {game.squad}</span>}
      <span>
        {game.strikes ?? 0} strike{game.strikes === 1 ? '' : 's'} · {game.spares ?? 0} spare{game.spares === 1 ? '' : 's'} · {game.splits ?? 0} split{game.splits === 1 ? '' : 's'}
      </span>
      {game.ballName && <span>Ball · {game.ballName}</span>}
    </article>
  )
}

export default function TournamentShare() {
  const { id } = useParams()
  const { copied, copyLink: handleCopy } = useCopyLink()
  const tournamentId = Number(id)
  const invalid = Number.isNaN(tournamentId)

  const { data, isLoading, isError } = useQuery<ShareResponse>({
    queryKey: ['tournament-share', tournamentId],
    enabled: !invalid,
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/share`)
      if (!res.ok) throw new Error('Failed to load')
      return res.json()
    },
  })

  const subtitle = useMemo(() => {
    const parts = [
      data?.tournament?.location,
      data?.tournament?.format,
      data?.tournament?.date
        ? new Date(data.tournament.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }, [data])

  const [downloaded, setDownloaded] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  const handleDownload = async () => {
    if (downloading || invalid) return
    setDownloading(true)
    setDownloaded(false)
    setDownloadError(false)
    try {
      await downloadTournamentCard(tournamentId, `bowlsense-tournament-${tournamentId}.png`)
      setDownloaded(true)
      setTimeout(() => setDownloaded(false), 1800)
    } catch {
      setDownloadError(true)
      setTimeout(() => setDownloadError(false), 1800)
    } finally {
      setDownloading(false)
    }
  }

  const ogImageUrl = useMemo(() => {
    if (invalid || !tournamentId) return ''
    return `/api/tournaments/${tournamentId}/og-image`
  }, [invalid, tournamentId])

  const shareText = encodeURIComponent(
    `Just finished ${data?.tournament?.name || 'tournament'} — averaging ${data?.stats?.average || 0}! 🎳`
  )
  const shareUrl = encodeURIComponent(window.location.href)
  const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`

  const pageTitle = `${data?.tournament?.name || 'Tournament'} — BowlSense`
  usePublicMetadata({ title: pageTitle, description: subtitle || 'Tournament results', imageUrl: ogImageUrl })

  if (invalid) {
    return (
      <PublicShell eyebrow="Tournament result" title="Tournament not found"><Link to="/">Browse tournaments on BowlSense</Link></PublicShell>
    )
  }

  return (
    <PublicShell
      eyebrow="Tournament result"
      title={data?.tournament?.name || 'Tournament'}
      detail={subtitle}
      action={<button className="btn btn-primary" onClick={handleCopy}>{copied ? 'Link copied' : 'Share tournament'}</button>}
    >
      {isLoading && <p className="muted">Loading tournament result…</p>}
      {isError && <p role="alert">Could not load tournament data.</p>}
      {data && (
        <>
          <PublicResult
            score={data.stats.series || '—'}
            label={`${data.stats.totalGames}-game series`}
            accessibleLabel={`Tournament series ${data.stats.series || 'not available'}`}
            facts={[
              { label: 'Average', value: data.stats.average || '—' },
              { label: 'High game', value: data.stats.highGame || '—' },
              ...(data.stats.placement != null ? [{ label: 'Placement', value: `#${data.stats.placement}` }] : []),
              ...(data.stats.net != null ? [{
                label: 'Net',
                value: `${data.stats.net >= 0 ? '+' : '-'}${new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency: 'USD',
                }).format(Math.abs(data.stats.net))}`,
              }] : []),
            ]}
          />
          <div className="public-share-actions">
            <button className="btn btn-ghost" onClick={handleDownload} disabled={downloading} aria-live="polite">
              {downloading ? 'Downloading…' : downloadError ? 'Download failed' : downloaded ? 'Downloaded' : 'Download card'}
            </button>
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Share on X</a>
          </div>
          {!data.games.length ? <p className="muted">No games logged yet.</p> : (
            <section className="public-detail-list" aria-label="Tournament games">
              {data.games.map((game) => <GameCard key={game.id} game={game} />)}
            </section>
          )}
        </>
      )}
    </PublicShell>
  )
}
