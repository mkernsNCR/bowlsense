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
      background: 'var(--surface)',
      borderRadius: 16,
      padding: '14px 16px',
      border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
    }}>
      <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--ink) 70%, transparent)', marginBottom: 8 }}>{label}</div>
      <div style={{
        fontSize: 28,
        fontWeight: 800,
        color: gold ? 'var(--strike-gold)' : 'var(--ink)',
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
      background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
      color: 'color-mix(in srgb, var(--ink) 60%, transparent)',
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
      <div style={{ minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)', fontFamily: 'system-ui', padding: 24 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', background: 'var(--surface)', borderRadius: 16, padding: 32 }}>
          <h2 style={{ marginBottom: 8 }}>Tournament not found</h2>
          <Link to="/" style={{ color: 'var(--oil-violet)' }}>BowlSense home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="public-competition-page" style={{
      minHeight: '100vh',
      background: 'var(--canvas)',
      color: 'var(--ink)',
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
            background: 'var(--surface-raised)',
            color: 'var(--ink-secondary)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
            marginBottom: 14,
            border: '1px solid var(--separator)',
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
          {subtitle && <div style={{ color: 'color-mix(in srgb, var(--ink) 72%, transparent)', fontSize: 15 }}>{subtitle}</div>}
        </div>

        {/* Share buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <button
            onClick={handleCopyLink}
            className="public-action-target"
            style={{
              background: copied ? 'var(--spare-green)' : 'var(--oil-violet)',
              border: 'none',
              borderRadius: 12,
              padding: '10px 20px',
              color: 'var(--on-tint)',
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
            className="public-action-target"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--ink) 20%, transparent)',
              borderRadius: 12,
              padding: '10px 20px',
              color: 'var(--ink)',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Share on X
          </a>
          <button
            onClick={handleDownload}
            className="public-action-target"
            style={{
              background: downloaded ? 'var(--spare-green)' : 'color-mix(in srgb, var(--ink) 6%, transparent)',
              border: '1px solid var(--separator)',
              borderRadius: 12,
              padding: '10px 20px',
              color: downloaded ? 'var(--canvas)' : 'var(--ink-secondary)',
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
        {standingsLoading && <div style={{ color: 'color-mix(in srgb, var(--ink) 60%, transparent)', padding: 20 }}>Loading...</div>}
        {standingsError && <div style={{ color: 'var(--danger)', padding: 20 }}>Could not load standings.</div>}

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
              background: 'var(--surface)',
              borderRadius: 16,
              border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
              overflow: 'hidden',
            }}>
              {!standings.standings?.length ? (
                <div style={{ padding: 28, textAlign: 'center', color: 'color-mix(in srgb, var(--ink) 70%, transparent)' }}>
                  No standings data yet — check back after your tournament! 🎯
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="tss-desktop">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'color-mix(in srgb, var(--ink) 3%, transparent)' }}>
                          {['Rank', 'Ball / Name', 'Games', 'Total Pins', 'Average', 'High Game'].map((h) => (
                            <th key={h} style={{
                              textAlign: 'left',
                              padding: '12px 16px',
                              fontSize: 12,
                              letterSpacing: 0.4,
                              color: 'color-mix(in srgb, var(--ink) 72%, transparent)',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {standings.standings.map((entry) => (
                          <tr
                            key={entry.rank}
                            style={{ borderTop: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)' }}
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
                            <td style={{ padding: '14px 16px', color: 'color-mix(in srgb, var(--ink) 80%, transparent)' }}>{entry.games}</td>
                            <td style={{ padding: '14px 16px', fontWeight: 700 }}>{entry.total}</td>
                            <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--ink)' }}>{entry.average}</td>
                            <td style={{
                              padding: '14px 16px',
                              color: entry.highGame === 300 ? 'var(--strike-gold)' : 'var(--ink)',
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
                          borderBottom: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
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
                            <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--ink) 60%, transparent)' }}>
                              {entry.games} game{entry.games !== 1 ? 's' : ''} · avg {entry.average}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>{entry.total}</div>
                          <div style={{ fontSize: 11, color: entry.highGame === 300 ? 'var(--strike-gold)' : 'color-mix(in srgb, var(--ink) 50%, transparent)' }}>
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
          borderTop: '1px solid color-mix(in srgb, var(--ink) 10%, transparent)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          color: 'color-mix(in srgb, var(--ink) 50%, transparent)',
          fontSize: 13,
        }}>
          <span>Tracked with BowlSense 🧠</span>
          <Link
            to="/"
            style={{ color: 'var(--oil-violet)', textDecoration: 'none', fontWeight: 700 }}
          >
            BowlSense home
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
