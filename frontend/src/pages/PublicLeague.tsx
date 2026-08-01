import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { requestJson } from '../api/requestJson'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { useCopyLink } from '../features/competition/useCopyLink'

interface LeagueStats {
  average: number
  high: number
  low: number
  totalPins: number
  totalGames: number
  gamesWon: number
  gamesLost: number
  totalWeeks: number
  weekByWeekAverages: { weekId: number; weekNumber: number; date: string; average: number; games: number }[]
}

interface LeagueStandingsWeek {
  weekId: number
  weekNumber: number
  date: string
  yourAvg: number
  opponentAvg: number
  result: 'W' | 'L' | 'T'
  margin: number
  bestGame: number
  games: number
  weekPins: number
  cumulative: {
    pins: number
    games: number
    average: number
    wins: number
    losses: number
    ties: number
  }
}

interface LeagueStandings {
  leagueId: number
  seasonRecord: {
    wins: number
    losses: number
    ties: number
    totalPins: number
    totalGames: number
    average: number
  }
  totals: {
    wins: number
    losses: number
    ties: number
  }
  weeks: LeagueStandingsWeek[]
}

interface LeagueLeaderboard {
  leagueId: number
  leagueAverage: number
  record: { wins: number; losses: number; ties: number }
  totalWeeks: number
  rankedOpponents: {
    rank: number
    name: string
    avg: number
    games: number
    totalPins: number
    highGame: number
  }[]
}

interface LeagueGame {
  id: number
  weekId: number
  gameNumber: number
  score: number | null
  strikes: number | null
  spares: number | null
  splits: number | null
  ballId: number | null
  frameData?: string | null
}

interface ShareLeaguePayload {
  league: Pick<League, 'id' | 'name' | 'location' | 'season' | 'dayOfWeek'>
  weeks: Array<{
    weekNumber: number
    date: string
    opponent: string | null
    gamesWon: number
    gamesLost: number
    games: Array<Omit<LeagueGame, 'id' | 'weekId' | 'frameData'>>
  }>
}

interface LeagueWeek {
  id: number
  leagueId: number
  weekNumber: number
  date: string
  opponent: string | null
  gamesWon: number
  gamesLost: number
  notes: string | null
  games?: LeagueGame[]
}

interface League {
  id: number
  name: string
  location: string | null
  season: string | null
  dayOfWeek: string | null
  gamesPerWeek: number
  startDate: string | null
  endDate: string | null
  notes: string | null
  weeks?: LeagueWeek[]
  stats?: LeagueStats
}

function WeeklyTrendChart({ data }: { data: { weekNumber: number; average: number }[] }) {
  if (data.filter(d => d.average > 0).length < 2) return null

  const W = 800, H = 200, PAD = { top: 16, right: 14, bottom: 30, left: 36 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const validData = data.filter(d => d.average > 0)
  if (validData.length < 2) return null

  const scores = validData.map(d => d.average)
  const minScore = Math.max(0, Math.min(...scores) - 20)
  const maxScore = Math.min(300, Math.max(...scores) + 20)
  const range = maxScore - minScore || 1

  const xOf = (i: number) => PAD.left + (i / (validData.length - 1)) * chartW
  const yOf = (score: number) => PAD.top + chartH - ((score - minScore) / range) * chartH
  const points = validData.map((d, i) => `${xOf(i)},${yOf(d.average)}`).join(' ')
  const yTicks = [minScore, Math.round((minScore + maxScore) / 2), maxScore]

  return (
    <div style={{ width: '100%', overflowX: 'hidden' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📈 Weekly Average Trend</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200, display: 'block' }}>
        {yTicks.map(t => (
          <line key={t} x1={PAD.left} y1={yOf(t)} x2={W - PAD.right} y2={yOf(t)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        ))}
        {yTicks.map(t => (
          <text key={`lbl-${t}`} x={PAD.left - 6} y={yOf(t) + 3} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize="11">{t}</text>
        ))}
        <polyline points={points} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {validData.map((d, i) => (
          <circle key={d.weekNumber} cx={xOf(i)} cy={yOf(d.average)} r="4" fill="#a78bfa" stroke="#0d0d1a" strokeWidth="2" />
        ))}
        {validData.map((d, i) => (
          <text key={`wl-${d.weekNumber}`} x={xOf(i)} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10">W{d.weekNumber}</text>
        ))}
      </svg>
    </div>
  )
}

export default function PublicLeague() {
  const { id } = useParams()
  const leagueId = parseInt(id || '')
  const { copied, copyLink } = useCopyLink()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab = tabParam === 'standings' || tabParam === 'leaderboard' ? tabParam : 'overview'

  const { data: league, isLoading: leagueLoading, isError: leagueError, refetch: refetchLeague } = useQuery<League>({
    queryKey: ['public-league', leagueId],
    queryFn: async () => {
      const response = await fetch(`/api/leagues/${leagueId}/share`)
      if (!response.ok) throw new Error('League not found')
      const payload = await response.json() as ShareLeaguePayload
      return {
        ...payload.league,
        gamesPerWeek: 0,
        startDate: null,
        endDate: null,
        notes: null,
        weeks: payload.weeks.map((week) => ({
          ...week,
          id: week.weekNumber,
          leagueId,
          notes: null,
          games: week.games.map((game, index) => ({ ...game, id: week.weekNumber * 100 + index, weekId: week.weekNumber, frameData: null })),
        })),
      }
    },
    enabled: !isNaN(leagueId),
  })

  const { data: stats, isError: statsError, refetch: refetchStats } = useQuery<LeagueStats>({
    queryKey: ['public-league-stats', leagueId],
    queryFn: () => requestJson(`/api/leagues/${leagueId}/stats`),
    enabled: !isNaN(leagueId),
  })

  const { data: standings, isError: standingsError, refetch: refetchStandings } = useQuery<LeagueStandings>({
    queryKey: ['public-league-standings', leagueId],
    queryFn: () => requestJson(`/api/leagues/${leagueId}/standings`),
    enabled: !isNaN(leagueId),
  })

  const { data: leaderboard, isLoading: leaderboardLoading, isError: leaderboardError, refetch: refetchLeaderboard } = useQuery<LeagueLeaderboard>({
    queryKey: ['public-league-leaderboard', leagueId],
    queryFn: () => requestJson(`/api/leagues/${leagueId}/leaderboard`),
    enabled: !isNaN(leagueId),
  })

  const publicDetail = [league?.location, league?.season, league?.dayOfWeek].filter(Boolean).join(' · ')
  usePublicMetadata({
    title: league ? `${league.name} — BowlSense` : 'Public league — BowlSense',
    description: publicDetail || 'Shared league results',
    imageUrl: Number.isNaN(leagueId) ? '' : `/api/leagues/${leagueId}/leaderboard/og-image`,
  })

  const shareStandings = async () => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'standings')
    await copyLink(url.toString())
  }

  if (isNaN(leagueId)) {
    return (
      <PublicShell eyebrow="League result" title="League not found"><Link to="/">Browse leagues on BowlSense</Link></PublicShell>
    )
  }

  if (leagueLoading) {
    return (
      <PublicShell eyebrow="League result" title="Loading shared league"><div className="muted">Loading league...</div></PublicShell>
    )
  }

  if (leagueError) {
    return (
      <PublicShell eyebrow="League result" title="League unavailable"><div role="alert"><p>The shared league could not be loaded.</p><button className="btn btn-primary" type="button" onClick={() => void refetchLeague()}>Try again</button></div></PublicShell>
    )
  }

  if (!league) {
    return (
      <PublicShell eyebrow="League result" title="League not found"><Link to="/">Browse leagues on BowlSense</Link></PublicShell>
    )
  }

  const weeks = league.weeks || []
  const sortedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber)
  const trendData = stats?.weekByWeekAverages?.map(w => ({
    weekNumber: w.weekNumber,
    average: w.average,
  })) ?? []

  const setTab = (tab: 'overview' | 'standings' | 'leaderboard') => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'overview') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next)
  }

  return (
    <PublicShell eyebrow="League result" title={league.name} detail={publicDetail || 'Shared result'} action={<button className="btn btn-primary" onClick={copyLink}>{copied ? 'Link copied' : 'Share league'}</button>}>
      <div className="public-legacy-content">
      <PublicResult score={stats?.average ?? '—'} label="League average" accessibleLabel={`League average ${stats?.average ?? 'not available'}`} facts={[
        { label: 'Record', value: `${stats?.gamesWon ?? 0}W – ${stats?.gamesLost ?? 0}L` },
        { label: 'Weeks', value: stats?.totalWeeks ?? sortedWeeks.length },
        { label: 'High game', value: stats?.high ?? '—' },
      ]} />

      <div className="public-tabs" role="tablist" aria-label="League result views" style={{
        display: 'inline-flex',
        background: '#111126',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 18,
      }}>
        {(['overview', 'standings', 'leaderboard'] as const).map((tab) => {
          const selected = activeTab === tab
          return (
            <button
              key={tab}
              id={`league-${tab}-tab`}
              role="tab"
              aria-selected={selected}
              aria-controls={`league-${tab}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(tab)}
              onKeyDown={(event) => {
                const tabs = ['overview', 'standings', 'leaderboard'] as const
                const current = tabs.indexOf(tab)
                const next = event.key === 'Home' ? 0
                  : event.key === 'End' ? tabs.length - 1
                    : event.key === 'ArrowRight' ? (current + 1) % tabs.length
                      : event.key === 'ArrowLeft' ? (current - 1 + tabs.length) % tabs.length
                        : -1
                if (next < 0) return
                event.preventDefault()
                setTab(tabs[next])
                document.getElementById(`league-${tabs[next]}-tab`)?.focus()
              }}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                background: selected ? 'rgba(167,139,250,0.2)' : 'transparent',
                color: selected ? '#c4b5fd' : 'var(--muted)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {tab === 'overview' ? 'Overview' : tab === 'standings' ? 'Standings' : 'Leaderboard'}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && (
        <div role="tabpanel" id="league-overview-panel" aria-labelledby="league-overview-tab">
          {statsError && <div className="card" role="alert"><p>League statistics could not be loaded.</p><button className="btn btn-primary" type="button" onClick={() => void refetchStats()}>Try again</button></div>}
          {/* Weekly trend */}
          {trendData.filter(d => d.average > 0).length >= 2 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <WeeklyTrendChart data={trendData} />
            </div>
          )}

          {/* Weeks */}
          <h2 style={{ marginBottom: 12 }}>📅 Week by Week</h2>

          {!weeks.length && (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎳</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No weeks logged yet</div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>Check back after the next league night!</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedWeeks.map((week) => {
              const weekGames = week.games || []
              const series = weekGames.reduce((sum, g) => sum + (g.score || 0), 0)
              const avg = weekGames.length ? Math.round(series / weekGames.length) : 0

              return (
                <div key={week.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 17 }}>
                        Week {week.weekNumber}
                        <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>
                          {new Date(week.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      {week.opponent && (
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>vs {week.opponent}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {weekGames.length > 0 && avg > 0 && (
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#a78bfa' }}>{avg}</div>
                      )}
                      <div style={{
                        background: week.gamesWon > week.gamesLost
                          ? 'rgba(52,211,153,0.15)' : week.gamesLost > week.gamesWon
                            ? 'rgba(252,129,129,0.15)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${week.gamesWon > week.gamesLost
                          ? 'rgba(52,211,153,0.35)' : week.gamesLost > week.gamesWon
                            ? 'rgba(252,129,129,0.35)' : 'rgba(255,255,255,0.12)'}`,
                        borderRadius: 999, padding: '4px 12px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>W-L</div>
                        <div style={{
                          fontWeight: 800, fontSize: 16,
                          color: week.gamesWon > week.gamesLost ? '#34d399' : week.gamesLost > week.gamesWon ? '#fc8181' : 'var(--text)',
                        }}>
                          {week.gamesWon}—{week.gamesLost}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Game scores row */}
                  {weekGames.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
                      {weekGames.map((g) => {
                        const isHigh = g.score === stats?.high
                        return (
                          <div key={g.id} style={{
                            minWidth: 72, background: isHigh ? 'rgba(251,191,36,0.12)' : '#0f0f1e',
                            border: `1px solid ${isHigh ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 12, padding: '10px 8px', textAlign: 'center', flexShrink: 0,
                          }}>
                            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>G{g.gameNumber}</div>
                            <div style={{ fontSize: 26, fontWeight: 900, color: isHigh ? '#fbbf24' : '#ffffff', lineHeight: 1 }}>
                              {g.score ?? '-'}
                            </div>
                            {isHigh && <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700, marginTop: 2 }}>BEST</div>}
                          </div>
                        )
                      })}
                      {/* Series total */}
                      <div style={{
                        minWidth: 72, background: 'rgba(167,139,250,0.12)',
                        border: '1px solid rgba(167,139,250,0.3)', borderRadius: 12, padding: '10px 8px', textAlign: 'center', flexShrink: 0,
                      }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Series</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#a78bfa', lineHeight: 1 }}>{series}</div>
                      </div>
                    </div>
                  )}

                  {weekGames.length === 0 && (
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>No games logged this week.</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'standings' && (
        <div role="tabpanel" id="league-standings-panel" aria-labelledby="league-standings-tab">
          {standingsError && <div className="card" role="alert"><p>League standings could not be loaded.</p><button className="btn btn-primary" type="button" onClick={() => void refetchStandings()}>Try again</button></div>}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>🏁 Season Record</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: '#34d399', fontWeight: 800 }}>W {standings?.seasonRecord.wins ?? 0}</span>
                  <span style={{ color: '#fc8181', fontWeight: 800 }}>L {standings?.seasonRecord.losses ?? 0}</span>
                  <span style={{ color: '#fbbf24', fontWeight: 800 }}>T {standings?.seasonRecord.ties ?? 0}</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
                  Total Pins: <b style={{ color: 'var(--text)' }}>{standings?.seasonRecord.totalPins ?? 0}</b> · Games: <b style={{ color: 'var(--text)' }}>{standings?.seasonRecord.totalGames ?? 0}</b>
                </div>
              </div>
              <button
                onClick={shareStandings}
                style={{
                  border: '1px solid rgba(167,139,250,0.45)',
                  borderRadius: 12,
                  background: 'rgba(167,139,250,0.16)',
                  color: '#c4b5fd',
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '9px 14px',
                  cursor: 'pointer',
                }}
              >
                Share standings
              </button>
            </div>
          </div>

          <div className="card" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                  {['Week #', 'Your Avg', 'Opponent Avg', 'Result', 'Margin', 'Best Game', 'Cumulative'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 8px', fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(standings?.weeks || []).map((week) => {
                  const resultColor = week.result === 'W' ? '#34d399' : week.result === 'L' ? '#fc8181' : '#fbbf24'
                  const rowBg = week.result === 'W' ? 'rgba(52,211,153,0.06)' : week.result === 'L' ? 'rgba(252,129,129,0.06)' : 'rgba(251,191,36,0.06)'
                  return (
                    <tr key={week.weekId} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: rowBg }}>
                      <td style={{ padding: '11px 8px', fontWeight: 700 }}>Week {week.weekNumber}</td>
                      <td style={{ padding: '11px 8px' }}>{week.yourAvg || '—'}</td>
                      <td style={{ padding: '11px 8px' }}>{week.opponentAvg || '—'}</td>
                      <td style={{ padding: '11px 8px', fontWeight: 800, color: resultColor }}>{week.result}</td>
                      <td style={{ padding: '11px 8px', color: week.margin > 0 ? '#34d399' : week.margin < 0 ? '#fc8181' : '#fbbf24', fontWeight: 700 }}>
                        {week.margin > 0 ? '+' : ''}{week.margin.toFixed(1)}
                      </td>
                      <td style={{ padding: '11px 8px', color: '#fbbf24', fontWeight: 700 }}>{week.bestGame || '—'}</td>
                      <td style={{ padding: '11px 8px', fontSize: 12, color: 'var(--muted)' }}>
                        {week.cumulative.wins}-{week.cumulative.losses}-{week.cumulative.ties} ({week.cumulative.average})
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {!standings?.weeks?.length && (
              <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>No standings data yet.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div role="tabpanel" id="league-leaderboard-panel" aria-labelledby="league-leaderboard-tab">
          {leaderboardLoading && <div className="card muted">Loading leaderboard…</div>}
          {leaderboardError && <div className="card" role="alert"><p>The leaderboard could not be loaded.</p><button className="btn btn-primary" type="button" onClick={() => void refetchLeaderboard()}>Try again</button></div>}
          {leaderboard && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>🏆 League Leaderboard</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: '#34d399', fontWeight: 800 }}>W {leaderboard.record.wins}</span>
                  <span style={{ color: '#fc8181', fontWeight: 800 }}>L {leaderboard.record.losses}</span>
                  <span style={{ color: '#fbbf24', fontWeight: 800 }}>T {leaderboard.record.ties}</span>
                  <span className="muted" style={{ fontSize: 13 }}>vs league avg {leaderboard.leagueAverage}</span>
                </div>
              </div>
            </div>

            {leaderboard.rankedOpponents.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>No data yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {leaderboard.rankedOpponents.map((opp) => {
                  const isMatt = opp.name === 'Matt' || opp.name === 'Me' || opp.name === 'You'
                  return (
                    <div key={opp.rank} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: isMatt ? 'rgba(167,139,250,0.12)' : undefined, borderRadius: 10, border: isMatt ? '1px solid rgba(167,139,250,0.4)' : '1px solid var(--border)' }}>
                      <div style={{ minWidth: 28, fontWeight: 800, fontSize: 14, color: opp.rank === 1 ? '#fbbf24' : 'var(--muted)' }}>#{opp.rank}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{opp.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{opp.games} games · High {opp.highGame}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: 18, color: isMatt ? 'var(--accent)' : 'var(--text)' }}>{opp.avg}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>avg</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      </div>
    </PublicShell>
  )
}
