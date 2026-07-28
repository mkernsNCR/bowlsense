import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

interface LeaderboardRecord {
  wins: number
  losses: number
  ties: number
}

interface RankedOpponent {
  rank: number
  name: string
  avg: number
  games: number
  totalPins: number
  highGame: number
}

interface LeagueLeaderboard {
  leagueId: number
  leagueAverage: number | null
  record: LeaderboardRecord
  totalWeeks: number
  rankedOpponents: RankedOpponent[]
}

interface LeagueMeta {
  id: number
  name: string
  location: string | null
  season: string | null
  dayOfWeek: string | null
  stats?: {
    average: number
  }
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
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#a78bfa', lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

export default function PublicLeagueLeaderboard() {
  const { id } = useParams()
  const [copied, setCopied] = useState(false)
  const leagueId = Number(id)
  const invalidId = Number.isNaN(leagueId)

  const { data, isLoading, isError } = useQuery<LeagueLeaderboard>({
    queryKey: ['public-league-leaderboard', leagueId],
    enabled: !invalidId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/leaderboard`)
      if (!res.ok) throw new Error('Failed to load leaderboard')
      return res.json()
    },
  })

  const { data: league } = useQuery<LeagueMeta>({
    queryKey: ['public-league-meta', leagueId],
    enabled: !invalidId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/share`)
      if (!res.ok) throw new Error('Failed to load league')
      const payload = await res.json() as { league: LeagueMeta; stats: { average: number } }
      return { ...payload.league, stats: { average: payload.stats.average } }
    },
  })

  const subtitle = useMemo(() => {
    const parts = [league?.location, league?.season, league?.dayOfWeek].filter(Boolean)
    return parts.length ? parts.join(' · ') : 'Public league standings'
  }, [league?.location, league?.season, league?.dayOfWeek])

  const title = league?.name ? `${league.name} Leaderboard 🎳` : 'League Leaderboard 🎳'
  const description = subtitle
  const ogImageUrl = `/api/leagues/${leagueId}/leaderboard/og-image`

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

  const tweetText = encodeURIComponent(
    `Check out the ${league?.name || 'league'} leaderboard! 🎳`
  )
  const tweetUrl = encodeURIComponent(window.location.href)
  const twitterIntent = `https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`

  if (invalidId) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 24 }}>
        <div className="card" style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center', background: '#121228' }}>
          <h2 style={{ marginBottom: 8 }}>League not found</h2>
          <p className="muted">The league link looks invalid.</p>
          <Link to="/" className="btn btn-ghost">BowlSense home</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: '24px 16px 40px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <style>{`
          .pllb-mobile-cards {
            display: none;
          }
          @media (max-width: 700px) {
            .pllb-table-wrap {
              display: none;
            }
            .pllb-mobile-cards {
              display: flex;
              flex-direction: column;
              gap: 8px;
              padding: 10px;
            }
          }
        `}</style>
        <div style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: 999, background: 'rgba(167,139,250,0.18)', color: '#c4b5fd', fontWeight: 700, fontSize: 12, letterSpacing: 0.5, marginBottom: 14 }}>
          🏆 PUBLIC LEAGUE LEADERBOARD
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 900 }}>
              {league?.name || 'League Leaderboard'}
            </h1>
            <div style={{ color: 'rgba(255,255,255,0.75)', marginTop: 8 }}>{subtitle}</div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <button
              onClick={shareCopy}
              className="btn btn-primary"
              style={{ background: '#a78bfa', borderColor: '#a78bfa', color: '#140f2b' }}
            >
              {copied ? 'Link copied' : 'Share'}
            </button>
            <a
              href={twitterIntent}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff', textDecoration: 'none' }}
            >
              Share on X
            </a>
          </div>
        </div>

        {isLoading && <div className="card" style={{ background: '#121228' }}>Loading leaderboard...</div>}
        {isError && <div className="card" style={{ background: '#121228', color: '#fc8181' }}>Could not load leaderboard right now.</div>}

        {!isLoading && !isError && data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              <StatCard label="Your Average" value={league?.stats?.average != null ? String(league.stats.average) : '—'} />
              <StatCard label="W — L — T" value={`${data.record?.wins ?? 0} — ${data.record?.losses ?? 0} — ${data.record?.ties ?? 0}`} />
              <StatCard label="Weeks Played" value={String(data.totalWeeks ?? 0)} />
              <StatCard label="League Avg" value={data.leagueAverage != null ? String(data.leagueAverage) : '—'} />
            </div>

            <div style={{ background: '#121228', borderRadius: 16, border: '1px solid rgba(167,139,250,0.2)', overflow: 'hidden' }}>
              {!data.rankedOpponents?.length ? (
                <div style={{ padding: 28, textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>
                  No league games logged yet — check back after your next league night! 🎳
                </div>
              ) : (
                <>
                  <div className="pllb-table-wrap" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          {['Rank', 'Name', 'Avg', 'Games', 'Total Pins', 'High Game'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', padding: '12px 14px', fontSize: 12, letterSpacing: 0.4, color: 'rgba(255,255,255,0.72)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.rankedOpponents.map((op) => {
                          const isYou = /\b(matt|you|me)\b/i.test(op.name)
                          return (
                            <tr key={`${op.rank}-${op.name}`} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: isYou ? 'rgba(167,139,250,0.14)' : 'transparent' }}>
                              <td style={{ padding: '12px 14px', fontWeight: 800, color: op.rank === 1 ? '#fbbf24' : '#fff' }}>#{op.rank}</td>
                              <td style={{ padding: '12px 14px' }}>{op.name}</td>
                              <td style={{ padding: '12px 14px', fontWeight: 800 }}>{op.avg}</td>
                              <td style={{ padding: '12px 14px' }}>{op.games}</td>
                              <td style={{ padding: '12px 14px' }}>{op.totalPins}</td>
                              <td style={{ padding: '12px 14px', color: op.highGame === 300 ? '#fbbf24' : '#fff', fontWeight: op.highGame === 300 ? 800 : 500 }}>{op.highGame}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="pllb-mobile-cards">
                    {data.rankedOpponents.map((op) => {
                      const isYou = /\b(matt|you|me)\b/i.test(op.name)
                      return (
                        <div
                          key={`mobile-${op.rank}-${op.name}`}
                          style={{
                            border: `1px solid ${isYou ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.12)'}`,
                            background: isYou ? 'rgba(167,139,250,0.14)' : '#0f1020',
                            borderRadius: 12,
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                            <div style={{ fontWeight: 800, color: op.rank === 1 ? '#fbbf24' : '#fff' }}>#{op.rank} {op.name}</div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: '#a78bfa' }}>{op.avg}</div>
                          </div>
                          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                            <div>Games: <b>{op.games}</b></div>
                            <div>Pins: <b>{op.totalPins}</b></div>
                            <div>High: <b style={{ color: op.highGame === 300 ? '#fbbf24' : '#fff' }}>{op.highGame}</b></div>
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

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: 'rgba(255,255,255,0.65)' }}>
          <div>Tracked with BowlSense</div>
          <Link to="/" style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 700 }}>BowlSense home</Link>
        </div>
      </div>
    </div>
  )
}
