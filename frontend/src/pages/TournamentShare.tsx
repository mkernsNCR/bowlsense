import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { downloadTournamentCard } from '../utils/tournamentShare'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { copyText } from '../features/scoring/copyText'

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
    ? '#fbbf24'
    : game.score != null && game.score >= 200
      ? '#a78bfa'
      : game.score != null && game.score < 170
        ? '#fc8181'
        : '#fff'

  return (
    <div style={{
      background: '#121228', borderRadius: 16,
      border: '1px solid rgba(167,139,250,0.2)',
      padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div>
          <span style={{
            background: 'rgba(167,139,250,0.2)', color: '#c4b5fd',
            borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700,
            marginRight: 8,
          }}>
            Game {game.gameNumber}
          </span>
          {game.squad && (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginLeft: 6 }}>
              {game.squad}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 32, fontWeight: 900,
          color: scoreColor, lineHeight: 1,
        }}>
          {game.score != null ? game.score : '—'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: game.ballName ? 8 : 0 }}>
        {game.strikes != null && game.strikes > 0 && (
          <span style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
            {game.strikes} Strike{game.strikes !== 1 ? 's' : ''}
          </span>
        )}
        {game.spares != null && game.spares > 0 && (
          <span style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 8, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
            {game.spares} Spare{game.spares !== 1 ? 's' : ''}
          </span>
        )}
        {game.splits != null && game.splits > 0 && (
          <span style={{ background: 'rgba(239,68,68,0.12)', color: '#fc8181', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
            {game.splits} Split{game.splits !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {game.ballName && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          🎳 {game.ballName}
        </div>
      )}
    </div>
  )
}

export default function TournamentShare() {
  const { id } = useParams()
  const [copied, setCopied] = useState(false)
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

  const handleCopy = async () => {
    try {
      await copyText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const [downloaded, setDownloaded] = useState(false)

  const handleDownload = async () => {
    await downloadTournamentCard(tournamentId, `bowlsense-tournament-${tournamentId}.png`)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 1800)
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
      <PublicShell eyebrow="Tournament result" title="Tournament not found"><Link to="/">BowlSense home</Link></PublicShell>
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
              ...(data.stats.net != null ? [{ label: 'Net', value: data.stats.net >= 0 ? `+$${data.stats.net}` : `-$${Math.abs(data.stats.net)}` }] : []),
            ]}
          />
          <div className="public-share-actions">
            <button className="btn btn-ghost" onClick={handleDownload}>{downloaded ? 'Downloaded' : 'Download card'}</button>
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
