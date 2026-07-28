import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { ActionIcon } from '../features/competition/CompetitionUI'

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
        background: 'var(--surface)',
        borderRadius: 16,
        padding: '14px 16px',
        border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
      }}
    >
      <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--ink) 70%, transparent)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>{value}</div>
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

  const subtitle = [
    tournament?.tournament?.location,
    tournament?.tournament?.format,
    tournament?.tournament?.date
      ? new Date(tournament.tournament.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null,
  ].filter(Boolean).join(' · ')

  const title = tournament?.tournament?.name ? `${tournament.tournament.name} standings` : 'Tournament standings'
  const description = subtitle || 'Tournament standings'
  const ogImageUrl = `/api/tournaments/${tournamentId}/standings/og-image`

  useEffect(() => {
    document.title = title
    const setMeta = (property: string, content: string, attr: 'property' | 'name' = 'property') => {
      let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, property); document.head.appendChild(el) }
      el.content = content
    }
    setMeta('og:title', title)
    setMeta('og:description', description)
    setMeta('og:image', ogImageUrl)
    setMeta('og:type', 'website')
    setMeta('twitter:card', 'summary_large_image')
  }, [title, description, ogImageUrl])

  const shareCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
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
      <div style={{ minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 24 }}>
        <div className="card" style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center', background: 'var(--surface)' }}>
          <h2 style={{ marginBottom: 8 }}>Tournament not found</h2>
          <p className="muted">The tournament link looks invalid.</p>
          <a href="/" className="btn btn-ghost">BowlSense home</a>
        </div>
      </div>
    )
  }

  return (
    <div className="public-competition-page">
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
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

        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div style={{ color: 'var(--oil-violet)', fontWeight: 800, letterSpacing: 0.4, marginBottom: 8 }}>BowlSense</div>
            <h1 style={{ margin: 0 }}>{tournament?.tournament?.name || 'Tournament standings'}</h1>
            {subtitle && <p className="muted" style={{ marginTop: 8 }}>{subtitle}</p>}
          </div>
          <button onClick={shareCopy} className="btn btn-primary"><ActionIcon name="share" /> {copied ? 'Link copied' : 'Share standings'}</button>
        </header>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out the ${tournament?.tournament?.name || 'tournament'} standings.`)}&url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ borderColor: 'color-mix(in srgb, var(--ink) 20%, transparent)', color: 'var(--ink)', textDecoration: 'none' }}
            >
              Share on X
            </a>
            <button
              onClick={handleDownloadPng}
              disabled={downloading}
              className="btn btn-ghost"
              style={{ borderColor: 'color-mix(in srgb, var(--ink) 20%, transparent)', color: 'var(--ink)', textDecoration: 'none', minHeight: 44 }}
            >
              {downloading ? 'Saving…' : 'Download image'}
            </button>
        </div>

        {isLoading && <div className="card" style={{ background: 'var(--surface)' }}>Loading standings...</div>}
        {isError && <div className="card" style={{ background: 'var(--surface)', color: 'var(--danger)' }}>Could not load standings right now.</div>}

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

            <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)', overflow: 'hidden' }}>
              {!data.standings?.length ? (
                <div style={{ padding: 28, textAlign: 'center', color: 'color-mix(in srgb, var(--ink) 80%, transparent)' }}>
                  No games logged yet. Add a game after your next tournament.
                </div>
              ) : (
                <>
                  <div className="ts-table-wrap" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'color-mix(in srgb, var(--ink) 3%, transparent)' }}>
                          {['Rank', 'Ball / Name', 'Games', 'Total Pins', 'Average', 'High Game'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', padding: '12px 14px', fontSize: 12, letterSpacing: 0.4, color: 'color-mix(in srgb, var(--ink) 72%, transparent)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.standings.map((s) => {
                          const isYou = /\b(matt|you|me)\b/i.test(s.ballName)
                          return (
                            <tr key={`${s.rank}-${s.ballName}`} style={{ borderTop: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)', background: isYou ? 'color-mix(in srgb, var(--ink) 6%, transparent)' : 'transparent' }}>
                              <td style={{ padding: '12px 14px', fontWeight: 800, color: s.rank === 1 ? 'var(--strike-gold)' : 'var(--ink)' }}>#{s.rank}</td>
                              <td style={{ padding: '12px 14px' }}>{s.ballName}</td>
                              <td style={{ padding: '12px 14px' }}>{s.games}</td>
                              <td style={{ padding: '12px 14px' }}>{s.total}</td>
                              <td style={{ padding: '12px 14px', fontWeight: 800 }}>{s.average}</td>
                              <td style={{ padding: '12px 14px', color: s.highGame === 300 ? 'var(--strike-gold)' : 'var(--ink)', fontWeight: s.highGame === 300 ? 800 : 500 }}>{s.highGame}</td>
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
                            border: `1px solid ${isYou ? 'var(--separator)' : 'color-mix(in srgb, var(--ink) 12%, transparent)'}`,
                            background: isYou ? 'color-mix(in srgb, var(--ink) 6%, transparent)' : 'var(--surface)',
                            borderRadius: 12,
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                            <div style={{ fontWeight: 800, color: s.rank === 1 ? 'var(--strike-gold)' : 'var(--ink)' }}>#{s.rank} {s.ballName}</div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink)' }}>{s.average}</div>
                          </div>
                          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, fontSize: 12, color: 'color-mix(in srgb, var(--ink) 78%, transparent)' }}>
                            <div>Games: <b>{s.games}</b></div>
                            <div>Pins: <b>{s.total}</b></div>
                            <div>High: <b style={{ color: s.highGame === 300 ? 'var(--strike-gold)' : 'var(--ink)' }}>{s.highGame}</b></div>
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

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: 'color-mix(in srgb, var(--ink) 65%, transparent)', fontSize: 13 }}>
          <div>Tracked with BowlSense</div>
          <a href={`/tournaments/${tournamentId}/standings/share`} style={{ color: 'var(--oil-violet)', textDecoration: 'none', fontWeight: 700 }}>Share standings</a>
        </div>
      </div>
    </div>
  )
}
