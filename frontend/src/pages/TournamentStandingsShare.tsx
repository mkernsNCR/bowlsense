import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { copyText } from '../features/scoring/copyText'
import { downloadTournamentStandingsCard } from '../utils/tournamentShare'

interface StandingsEntry {
  rank: number
  ballId: number | null
  ballName: string
  games: number
  total: number
  average: number
  highGame: number
}

interface StandingsResponse {
  standings: StandingsEntry[]
}

interface TournamentMeta {
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

interface TournamentStats {
  totalGames: number
  series: number
  average: number
  high: number
  placement: number | null
}

interface TournamentPayload {
  tournament: TournamentMeta
  stats: TournamentStats
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: 20 }}>🥇</span>
  if (rank === 2) return <span style={{ fontSize: 20 }}>🥈</span>
  if (rank === 3) return <span style={{ fontSize: 20 }}>🥉</span>
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      borderRadius: 8,
      background: 'rgba(255,255,255,0.08)',
      color: 'rgba(255,255,255,0.6)',
      fontWeight: 800,
      fontSize: 13,
    }}>#{rank}</span>
  )
}

export default function TournamentStandingsShare() {
  const { id } = useParams()
  const tournamentId = Number(id)
  const invalid = Number.isNaN(tournamentId)
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const { data: standings, isLoading: standingsLoading, isError: standingsError } = useQuery<StandingsResponse>({
    queryKey: ['tournament-standings', tournamentId],
    enabled: !invalid,
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/standings`)
      if (!res.ok) throw new Error('Failed to load')
      return res.json()
    },
  })

  const { data: tournamentData } = useQuery<TournamentPayload>({
    queryKey: ['tournament', tournamentId],
    enabled: !invalid,
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/share`)
      if (!res.ok) throw new Error('Failed to load')
      return res.json()
    },
  })

  const tournament = tournamentData?.tournament
  const stats = tournamentData?.stats

  const subtitle = useMemo(() => {
    const parts = [
      tournament?.location,
      tournament?.format,
      tournament?.date
        ? new Date(tournament.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }, [tournament])

  const ogImageUrl = useMemo(() => {
    if (invalid) return ''
    return `/api/tournaments/${tournamentId}/standings/og-image`
  }, [invalid, tournamentId])

  const title = useMemo(() => {
    return tournament?.name ? `${tournament.name} Standings 🎯` : 'Tournament Standings 🎯'
  }, [tournament])

  usePublicMetadata({ title, description: subtitle || 'Tournament standings', imageUrl: ogImageUrl })

  const handleCopyLink = async () => {
    try {
      await copyText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  const handleDownload = async () => {
    if (!tournament || invalid) return
    const filename = `bowlsense-standings-${tournament.name.replace(/\s+/g, '-').toLowerCase()}-${tournamentId}.png`
    await downloadTournamentStandingsCard(tournamentId, filename)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 1800)
  }

  const shareText = encodeURIComponent(
    tournament
      ? `${tournament.name} standings — averaging ${stats?.average || 0}! 🎯`
      : 'Check out these tournament standings! 🎯'
  )
  const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(window.location.href)}`

  // Aggregate totals from standings data
  const totalGames = standings?.standings?.reduce((sum, s) => sum + s.games, 0) ?? 0
  const overallAvg = totalGames > 0
    ? Math.round((standings?.standings?.reduce((sum, s) => sum + s.total, 0) ?? 0) / totalGames)
    : 0
  const highGame = standings?.standings?.reduce((max, s) => Math.max(max, s.highGame), 0) ?? 0

  if (invalid) {
    return (
      <PublicShell eyebrow="Tournament standings" title="Tournament not found"><Link to="/">BowlSense home</Link></PublicShell>
    )
  }

  return (
    <PublicShell eyebrow="Tournament standings" title={tournament?.name || 'Tournament'} detail={subtitle || 'Shared result'}>
      <div className="public-legacy-content" style={{ maxWidth: 960, margin: '0 auto' }}>

        {standings && tournamentData && <PublicResult score={stats?.placement ? `#${stats.placement}` : overallAvg || '—'} label={stats?.placement ? 'Final placement' : 'Tournament average'} accessibleLabel={stats?.placement ? `Final placement ${stats.placement}` : `Tournament average ${overallAvg || 'not available'}`} facts={[
          { label: 'Average', value: stats?.average || overallAvg || '—' },
          { label: 'Games', value: stats?.totalGames || totalGames },
          { label: 'High game', value: stats?.high || highGame || '—' },
        ]} />}

        {/* Share buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <button
            onClick={handleCopyLink}
            style={{
              background: copied ? '#34d399' : '#a78bfa',
              border: 'none',
              borderRadius: 12,
              padding: '10px 20px',
              color: '#0d0d1a',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 12,
              padding: '10px 20px',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            𝕏 Share on X
          </a>
          <button
            onClick={handleDownload}
            style={{
              background: downloaded ? '#34d399' : 'rgba(167,139,250,0.2)',
              border: '1px solid rgba(167,139,250,0.4)',
              borderRadius: 12,
              padding: '10px 20px',
              color: downloaded ? '#0d0d1a' : '#c4b5fd',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {downloaded ? 'Downloaded' : 'Download card'}
          </button>
        </div>

        {/* OG image preview */}
        {ogImageUrl && (
          <div style={{
            borderRadius: 16,
            overflow: 'hidden',
            marginBottom: 20,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ position: 'relative', width: '100%', paddingTop: '52.5%' }}>
              <div style={{ position: 'absolute', inset: 0 }}>
                <img
                  src={ogImageUrl}
                  alt="Tournament standings share card"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Stats row */}
        {standingsLoading && <div style={{ color: 'rgba(255,255,255,0.6)', padding: 20 }}>Loading...</div>}
        {standingsError && <div style={{ color: '#fc8181', padding: 20 }}>Could not load standings.</div>}

        {standings && tournamentData && (
          <>
            {/* Standings table */}
            <div style={{
              background: '#121228',
              borderRadius: 16,
              border: '1px solid rgba(167,139,250,0.2)',
              overflow: 'hidden',
            }}>
              {!standings.standings?.length ? (
                <div style={{ padding: 28, textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>
                  No standings data yet — check back after your tournament! 🎯
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="tss-desktop">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          {['Rank', 'Ball / Name', 'Games', 'Total Pins', 'Average', 'High Game'].map((h) => (
                            <th key={h} style={{
                              textAlign: 'left',
                              padding: '12px 16px',
                              fontSize: 12,
                              letterSpacing: 0.4,
                              color: 'rgba(255,255,255,0.72)',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {standings.standings.map((entry) => (
                          <tr
                            key={entry.rank}
                            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                          >
                            <td style={{ padding: '14px 16px', width: 64 }}>
                              <RankBadge rank={entry.rank} />
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 18 }}>🎳</span>
                                <span style={{ fontWeight: 600 }}>{entry.ballName}</span>
                              </div>
                            </td>
                            <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.8)' }}>{entry.games}</td>
                            <td style={{ padding: '14px 16px', fontWeight: 700 }}>{entry.total}</td>
                            <td style={{ padding: '14px 16px', fontWeight: 800, color: '#a78bfa' }}>{entry.average}</td>
                            <td style={{
                              padding: '14px 16px',
                              color: entry.highGame === 300 ? '#fbbf24' : '#fff',
                              fontWeight: entry.highGame === 300 ? 800 : 500,
                            }}>
                              {entry.highGame || '—'}
                              {entry.highGame === 300 && <span style={{ marginLeft: 4 }}>✨</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="tss-mobile" style={{ padding: '8px 0' }}>
                    {standings.standings.map((entry) => (
                      <div
                        key={`mobile-${entry.rank}`}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <RankBadge rank={entry.rank} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.ballName}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                              {entry.games} game{entry.games !== 1 ? 's' : ''} · avg {entry.average}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: 18, color: '#a78bfa' }}>{entry.total}</div>
                          <div style={{ fontSize: 12, color: entry.highGame === 300 ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>
                            high {entry.highGame || '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

      </div>

      <style>{`
        .tss-mobile { display: none; }
        @media (max-width: 640px) {
          .tss-desktop { display: none; }
          .tss-mobile { display: block; }
        }
      `}</style>
    </PublicShell>
  )
}
