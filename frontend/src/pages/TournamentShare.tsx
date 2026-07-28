import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { downloadTournamentCard } from '../utils/tournamentShare'

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

function StatCard({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16,
      padding: '14px 16px', border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
    }}>
      <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--ink) 70%, transparent)', marginBottom: 8 }}>{label}</div>
      <div style={{
        fontSize: 28, fontWeight: 800,
        color: gold ? 'var(--strike-gold)' : 'var(--ink)', lineHeight: 1.1,
      }}>{value}</div>
    </div>
  )
}

function GameCard({ game }: { game: ShareGame }) {
  const scoreColor = game.score === 300
    ? 'var(--strike-gold)'
    : game.score != null && game.score >= 200
      ? 'var(--ink)'
      : game.score != null && game.score < 170
        ? 'var(--danger)'
        : 'var(--ink)'

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16,
      border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
      padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div>
          <span style={{
            background: 'color-mix(in srgb, var(--ink) 6%, transparent)', color: 'var(--ink-secondary)',
            borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700,
            marginRight: 8,
          }}>
            Game {game.gameNumber}
          </span>
          {game.squad && (
            <span style={{ color: 'color-mix(in srgb, var(--ink) 50%, transparent)', fontSize: 13, marginLeft: 6 }}>
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
          <span style={{ background: 'color-mix(in srgb, var(--strike-gold) 12%, transparent)', color: 'var(--strike-gold)', border: '1px solid color-mix(in srgb, var(--strike-gold) 25%, transparent)', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
            {game.strikes} Strike{game.strikes !== 1 ? 's' : ''}
          </span>
        )}
        {game.spares != null && game.spares > 0 && (
          <span style={{ background: 'color-mix(in srgb, var(--spare-green) 12%, transparent)', color: 'var(--spare-green)', border: '1px solid color-mix(in srgb, var(--spare-green) 25%, transparent)', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
            {game.spares} Spare{game.spares !== 1 ? 's' : ''}
          </span>
        )}
        {game.splits != null && game.splits > 0 && (
          <span style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
            {game.splits} Split{game.splits !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {game.ballName && (
        <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--ink) 45%, transparent)' }}>
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
      await navigator.clipboard.writeText(window.location.href)
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

  // Set OG meta tags for social sharing
  useEffect(() => {
    if (!data) return
    const pageTitle = `${data.tournament?.name || 'Tournament'} — BowlSense`
    document.title = pageTitle

    const setMeta = (property: string, content: string, attr: 'property' | 'name' = 'property') => {
      let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, property)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    setMeta('og:title', pageTitle)
    setMeta('og:description', subtitle || 'Tournament results')
    if (ogImageUrl) setMeta('og:image', ogImageUrl)
    setMeta('og:image:width', '1200')
    setMeta('og:image:height', '630')
    setMeta('og:type', 'website')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', pageTitle)
    setMeta('twitter:description', subtitle || 'Tournament results')
    if (ogImageUrl) setMeta('twitter:image', ogImageUrl)
  }, [data, subtitle, ogImageUrl])

  if (invalid) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)', fontFamily: 'system-ui', padding: 24 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', background: 'var(--surface)', borderRadius: 16, padding: 32 }}>
          <h2>Tournament not found</h2>
          <Link to="/" style={{ color: 'var(--oil-violet)' }}>BowlSense home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="public-competition-page" style={{
      minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      paddingBottom: 40,
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 999,
            background: 'var(--surface-raised)',
            color: 'var(--ink-secondary)', fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
            marginBottom: 14, border: '1px solid var(--separator)',
          }}>
            🎯 Tournament Share
          </div>
          <h1 style={{
            margin: '0 0 8px', fontSize: 'clamp(1.8rem, 5vw, 2.8rem)',
            fontWeight: 900, lineHeight: 1.1,
          }}>
            {data?.tournament?.name || 'Tournament'}
          </h1>
          {subtitle && <div style={{ color: 'color-mix(in srgb, var(--ink) 72%, transparent)', fontSize: 15 }}>{subtitle}</div>}
        </div>

        {/* Share buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          <button
            onClick={handleCopy}
            className="public-action-target"
            style={{
              background: copied ? 'var(--spare-green)' : 'var(--oil-violet)',
              border: 'none', borderRadius: 12, padding: '10px 20px',
              color: 'var(--on-tint)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <button
            onClick={handleDownload}
            className="public-action-target"
            style={{
              background: downloaded ? 'var(--spare-green)' : 'color-mix(in srgb, var(--ink) 6%, transparent)',
              border: '1px solid var(--separator)',
              borderRadius: 12, padding: '10px 20px',
              color: downloaded ? 'var(--canvas)' : 'var(--ink-secondary)',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {downloaded ? 'Downloaded' : 'Download card'}
          </button>
          <a
            href={twitterUrl}
            className="public-action-target"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'color-mix(in srgb, var(--ink) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--ink) 20%, transparent)',
              borderRadius: 12, padding: '10px 20px', color: 'var(--ink)',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
            }}
          >
            Share on X
          </a>
        </div>

        {/* Stats */}
        {isLoading && <div style={{ color: 'color-mix(in srgb, var(--ink) 60%, transparent)', padding: 20 }}>Loading...</div>}
        {isError && <div style={{ color: 'var(--danger)', padding: 20 }}>Could not load tournament data.</div>}

        {data && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12, marginBottom: 28,
            }}>
              <StatCard label="Games" value={String(data.stats.totalGames)} />
              <StatCard label="Series" value={data.stats.series ? String(data.stats.series) : '—'} />
              <StatCard label="Avg" value={data.stats.average ? String(data.stats.average) : '—'} />
              <StatCard
                label="High Game"
                value={data.stats.highGame ? String(data.stats.highGame) : '—'}
                gold={!!data.stats.highGame}
              />
              {data.stats.placement != null && (
                <StatCard
                  label="Placement"
                  value={data.stats.placement === 1 ? '🥇 1st' : data.stats.placement === 2 ? '🥈 2nd' : data.stats.placement === 3 ? '🥉 3rd' : `#${data.stats.placement}`}
                  gold={data.stats.placement <= 3}
                />
              )}
              {data.stats.net != null && (
                <StatCard
                  label="Net"
                  value={data.stats.net >= 0 ? `+$${data.stats.net}` : `-$${Math.abs(data.stats.net)}`}
                  gold={data.stats.net > 0}
                />
              )}
            </div>

            {/* Placement / prize info */}
            {(data.tournament.entryFee != null || data.tournament.prizeFund != null) && (
              <div style={{
                display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20,
              }}>
                {data.tournament.entryFee != null && (
                  <span style={{ background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)', borderRadius: 12, padding: '8px 14px', fontSize: 13 }}>
                    <span className="muted">Entry Fee: </span>
                    <strong style={{ color: 'var(--ink)' }}>${data.tournament.entryFee}</strong>
                  </span>
                )}
                {data.tournament.prizeFund != null && (
                  <span style={{ background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)', borderRadius: 12, padding: '8px 14px', fontSize: 13 }}>
                    <span className="muted">Prize Fund: </span>
                    <strong style={{ color: 'var(--ink)' }}>${data.tournament.prizeFund}</strong>
                  </span>
                )}
              </div>
            )}

            {/* Games */}
            {!data.games.length ? (
              <div style={{
                background: 'var(--surface)', borderRadius: 16,
                border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)',
                padding: 32, textAlign: 'center', color: 'color-mix(in srgb, var(--ink) 70%, transparent)',
              }}>
                No games logged yet — check back after your next tournament! 🎳
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.games.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 36, paddingTop: 20,
          borderTop: '1px solid color-mix(in srgb, var(--ink) 10%, transparent)',
          display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          color: 'color-mix(in srgb, var(--ink) 50%, transparent)', fontSize: 13,
        }}>
          <span>Tracked with BowlSense 🧠</span>
          <Link to="/" style={{ color: 'var(--oil-violet)', textDecoration: 'none', fontWeight: 700 }}>
            BowlSense home
          </Link>
        </div>
      </div>
    </div>
  )
}
