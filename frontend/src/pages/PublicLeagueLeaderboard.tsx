import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { useCopyLink } from '../features/competition/useCopyLink'

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

export default function PublicLeagueLeaderboard() {
  const { id } = useParams()
  const { copied, copyLink: shareCopy } = useCopyLink()
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

  usePublicMetadata({ title, description, imageUrl: invalidId ? '' : ogImageUrl })

  const tweetText = encodeURIComponent(
    `Check out the ${league?.name || 'league'} leaderboard! 🎳`
  )
  const tweetUrl = encodeURIComponent(window.location.href)
  const twitterIntent = `https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`

  if (invalidId) {
    return (
      <PublicShell eyebrow="League leaderboard" title="League not found" detail="The league link looks invalid."><Link to="/">Browse leagues on BowlSense</Link></PublicShell>
    )
  }

  return (
    <PublicShell eyebrow="League leaderboard" title={league?.name || 'League leaderboard'} detail={subtitle} action={<button onClick={shareCopy} className="btn btn-primary">{copied ? 'Link copied' : 'Share'}</button>}>
      <div className="public-legacy-content" style={{ maxWidth: 1040, margin: '0 auto' }}>
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
        <div className="public-share-actions"><a href={twitterIntent} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Share on X</a></div>

        {isLoading && <div className="card" style={{ background: '#121228', color: '#fff' }}>Loading leaderboard...</div>}
        {isError && <div className="card" style={{ background: '#121228', color: '#fc8181' }}>Could not load leaderboard right now.</div>}

        {!isLoading && !isError && data && (
          <>
            <PublicResult score={league?.stats?.average ?? '—'} label="Bowler average" accessibleLabel={`Bowler average ${league?.stats?.average ?? 'not available'}`} facts={[
              { label: 'Record', value: `${data.record?.wins ?? 0}W – ${data.record?.losses ?? 0}L – ${data.record?.ties ?? 0}T` },
              { label: 'Weeks', value: data.totalWeeks ?? 0 },
              { label: 'League average', value: data.leagueAverage ?? '—' },
            ]} />

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

      </div>
    </PublicShell>
  )
}
