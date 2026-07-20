import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
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

function StatCard({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div style={{
      background: '#121228',
      borderRadius: 16,
      padding: '14px 16px',
      border: '1px solid rgba(167,139,250,0.2)',
    }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{label}</div>
      <div style={{
        fontSize: 28,
        fontWeight: 800,
        color: gold ? '#fbbf24' : '#a78bfa',
        lineHeight: 1.1,
      }}>{value}</div>
    </div>
  )
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
      const res = await fetch(`/api/tournaments/${tournamentId}`)
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
  }, [tournament?.name])

  useEffect(() => {
    if (!tournament) return
    document.title = title

    const setMeta = (property: string, content: string, attr: 'property' | 'name' = 'property') => {
      let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, property)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    setMeta('og:title', title)
    setMeta('og:description', subtitle || 'Tournament standings')
    if (ogImageUrl) {
      setMeta('og:image', ogImageUrl)
      setMeta('og:image:width', '1200')
      setMeta('og:image:height', '630')
    }
    setMeta('og:type', 'website')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', title)
    setMeta('twitter:description', subtitle || 'Tournament standings')
    if (ogImageUrl) setMeta('twitter:image', ogImageUrl)
  }, [title, subtitle, ogImageUrl, tournament])

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
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
  const totalPins = standings?.standings?.reduce((sum, s) => sum + s.total, 0) ?? 0
  const overallAvg = totalGames > 0 ? Math.round(totalPins / totalGames) : 0
  const highGame = standings?.standings?.reduce((max, s) => Math.max(max, s.highGame), 0) ?? 0

  if (invalid) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', fontFamily: 'system-ui', padding: 24 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', background: '#121228', borderRadius: 16, padding: 32 }}>
          <h2 style={{ marginBottom: 8 }}>Tournament not found</h2>
          <Link to="/tournaments" style={{ color: '#a78bfa' }}>← Back to Tournaments</Link>
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
      paddingBottom: 48,
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex',
            padding: '5px 14px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(167,139,250,0.3), rgba(139,92,246,0.3))',
            color: '#c4b5fd',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
            marginBottom: 14,
            border: '1px solid rgba(167,139,250,0.4)',
          }}>
            🎯 Tournament Standings
          </div>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: 'clamp(1.8rem, 5vw, 2.8rem)',
            fontWeight: 900,
            lineHeight: 1.1,
          }}>
            {tournament?.name || 'Tournament Standings'}
          </h1>
          {subtitle && <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 15 }}>{subtitle}</div>}
        </div>

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
            {copied ? '✅ Copied!' : '📤 Copy Link'}
          </button>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
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
            {downloaded ? '✅ Downloaded!' : '💾 Download Card'}
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
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}>
              <StatCard label="Total Games" value={String(totalGames)} />
              <StatCard label="Total Pins" value={String(totalPins)} />
              <StatCard label="Avg Score" value={String(overallAvg)} />
              <StatCard
                label="High Game"
                value={highGame ? String(highGame) : '—'}
                gold={highGame > 0}
              />
              {stats?.placement != null && (
                <StatCard
                  label="Placement"
                  value={
                    stats.placement === 1 ? '🥇 1st'
                    : stats.placement === 2 ? '🥈 2nd'
                    : stats.placement === 3 ? '🥉 3rd'
                    : `#${stats.placement}`
                  }
                  gold={stats.placement <= 3}
                />
              )}
            </div>

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
                          <div style={{ fontSize: 11, color: entry.highGame === 300 ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>
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

        {/* Footer */}
        <div style={{
          marginTop: 28,
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 13,
        }}>
          <span>Tracked with BowlSense 🧠</span>
          <Link
            to={`/tournaments/${tournamentId}`}
            style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 700 }}
          >
            ← View Tournament
          </Link>
        </div>
      </div>

      <style>{`
        .tss-mobile { display: none; }
        @media (max-width: 640px) {
          .tss-desktop { display: none; }
          .tss-mobile { display: block; }
        }
      `}</style>
    </div>
  )
}