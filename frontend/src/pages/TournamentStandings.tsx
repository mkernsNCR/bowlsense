import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../design'
import { PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { copyText } from '../features/scoring/copyText'

interface TournamentStanding {
  rank: number
  ballId: number | null
  ballName: string
  games: number
  total: number
  average: number
  highGame: number
}

interface StandingsResponse {
  standings: TournamentStanding[]
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#121228',
        borderRadius: 16,
        padding: '14px 16px',
        border: '1px solid rgba(167,139,250,0.2)',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#a78bfa', lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

export default function TournamentStandings() {
  const { id } = useParams()
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const tournamentId = Number(id)
  const invalidId = Number.isNaN(tournamentId)

  const { data, isLoading, isError } = useQuery<StandingsResponse>({
    queryKey: ['tournament-standings', tournamentId],
    enabled: !invalidId,
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/standings`)
      if (!res.ok) throw new Error('Failed to load standings')
      return res.json()
    },
  })

  const { data: tournament } = useQuery<{ tournament: TournamentMeta; stats: TournamentStats }>({
    queryKey: ['tournament', tournamentId],
    enabled: !invalidId,
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/share`)
      if (!res.ok) throw new Error('Failed to load tournament')
      return res.json()
    },
  })

  const tournamentMeta = tournament?.tournament
  const subtitle = [
    tournamentMeta?.location,
    tournamentMeta?.format,
    tournamentMeta?.date
      ? new Date(tournamentMeta.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null,
  ].filter(Boolean).join(' · ')

  const title = tournament?.tournament?.name ? `${tournament.tournament.name} standings` : 'Tournament standings'
  const description = subtitle || 'Tournament standings'
  const ogImageUrl = `/api/tournaments/${tournamentId}/standings/og-image`

  usePublicMetadata({ title, description, imageUrl: ogImageUrl })

  const shareCopy = async () => {
    try {
      await copyText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const handleDownloadPng = async () => {
    if (downloading || invalidId) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/standings/og-image`)
      if (!res.ok) throw new Error('Failed to fetch image')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tournament-standings-${tournamentId}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed', err)
    } finally {
      setDownloading(false)
    }
  }

  // Aggregate totals from standings
  const totalGames = data?.standings?.reduce((sum, s) => sum + s.games, 0) ?? 0
  const totalPins = data?.standings?.reduce((sum, s) => sum + s.total, 0) ?? 0
  const overallAvg = totalGames > 0 ? Math.round(totalPins / totalGames) : 0
  const highGame = data?.standings?.reduce((max, s) => Math.max(max, s.highGame), 0) ?? 0

  if (invalidId) {
    return (
      <PublicShell eyebrow="Tournament standings" title="Tournament not found" detail="The tournament link looks invalid."><Link to="/">BowlSense home</Link></PublicShell>
    )
  }

  return (
    <PublicShell
      eyebrow="Tournament standings"
      title={tournament?.tournament?.name || 'Tournament standings'}
      detail={subtitle}
      action={<button onClick={shareCopy} className="btn btn-primary"><Icon className="competition-action-icon" name="share" /> {copied ? 'Link copied' : 'Share standings'}</button>}
    >
      <div className="public-legacy-content">
        <style>{`
          .ts-mobile-cards {
            display: none;
          }
          @media (max-width: 700px) {
            .ts-table-wrap {
              display: none;
            }
            .ts-mobile-cards {
              display: flex;
              flex-direction: column;
              gap: 8px;
              padding: 10px;
            }
          }
        `}</style>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out the ${tournament?.tournament?.name || 'tournament'} standings.`)}&url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff', textDecoration: 'none' }}
            >
              Share on X
            </a>
            <button
              onClick={handleDownloadPng}
              disabled={downloading}
              className="btn btn-ghost"
              style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff', textDecoration: 'none', minHeight: 44 }}
            >
              {downloading ? 'Saving…' : 'Download image'}
            </button>
        </div>

        {isLoading && <div className="card" style={{ background: '#121228' }}>Loading standings...</div>}
        {isError && <div className="card" style={{ background: '#121228', color: '#fc8181' }}>Could not load standings right now.</div>}

        {!isLoading && !isError && data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              <StatCard label="Total Games" value={String(totalGames)} />
              <StatCard label="Total Pins" value={String(totalPins)} />
              <StatCard label="Overall Avg" value={String(overallAvg)} />
              <StatCard label="High Game" value={String(highGame)} />
              {tournament?.stats?.placement != null && (
                <StatCard
                  label="Placement"
                  value={
                    tournament.stats.placement === 1 ? '1st'
                    : tournament.stats.placement === 2 ? '2nd'
                    : tournament.stats.placement === 3 ? '3rd'
                    : `#${tournament.stats.placement}`
                  }
                />
              )}
            </div>

            <div style={{ background: '#121228', borderRadius: 16, border: '1px solid rgba(167,139,250,0.2)', overflow: 'hidden' }}>
              {!data.standings?.length ? (
                <div style={{ padding: 28, textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>
                  No games logged yet. Add a game after your next tournament.
                </div>
              ) : (
                <>
                  <div className="ts-table-wrap" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          {['Rank', 'Ball / Name', 'Games', 'Total Pins', 'Average', 'High Game'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', padding: '12px 14px', fontSize: '0.75rem', letterSpacing: '0.025rem', color: 'rgba(255,255,255,0.72)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.standings.map((s) => {
                          const isYou = /\b(matt|you|me)\b/i.test(s.ballName)
                          return (
                            <tr key={`${s.rank}-${s.ballName}`} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: isYou ? 'rgba(167,139,250,0.14)' : 'transparent' }}>
                              <td style={{ padding: '12px 14px', fontWeight: 800, color: s.rank === 1 ? '#fbbf24' : '#fff' }}>#{s.rank}</td>
                              <td style={{ padding: '12px 14px' }}>{s.ballName}</td>
                              <td style={{ padding: '12px 14px' }}>{s.games}</td>
                              <td style={{ padding: '12px 14px' }}>{s.total}</td>
                              <td style={{ padding: '12px 14px', fontWeight: 800 }}>{s.average}</td>
                              <td style={{ padding: '12px 14px', color: s.highGame === 300 ? '#fbbf24' : '#fff', fontWeight: s.highGame === 300 ? 800 : 500 }}>{s.highGame}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="ts-mobile-cards">
                    {data.standings.map((s) => {
                      const isYou = /\b(matt|you|me)\b/i.test(s.ballName)
                      return (
                        <div
                          key={`mobile-${s.rank}-${s.ballName}`}
                          style={{
                            border: `1px solid ${isYou ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.12)'}`,
                            background: isYou ? 'rgba(167,139,250,0.14)' : '#0f1020',
                            borderRadius: 12,
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                            <div style={{ fontWeight: 800, color: s.rank === 1 ? '#fbbf24' : '#fff' }}>#{s.rank} {s.ballName}</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#a78bfa' }}>{s.average}</div>
                          </div>
                          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, fontSize: '0.75rem', color: 'rgba(255,255,255,0.78)' }}>
                            <div>Games: <b>{s.games}</b></div>
                            <div>Pins: <b>{s.total}</b></div>
                            <div>High: <b style={{ color: s.highGame === 300 ? '#fbbf24' : '#fff' }}>{s.highGame}</b></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </PublicShell>
  )
}
