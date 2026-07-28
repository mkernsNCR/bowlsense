import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'

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
          <line key={t} x1={PAD.left} y1={yOf(t)} x2={W - PAD.right} y2={yOf(t)} stroke="color-mix(in srgb, var(--ink) 8%, transparent)" strokeWidth="1" />
        ))}
        {yTicks.map(t => (
          <text key={`lbl-${t}`} x={PAD.left - 6} y={yOf(t) + 3} textAnchor="end" fill="color-mix(in srgb, var(--ink) 40%, transparent)" fontSize="11">{t}</text>
        ))}
        <polyline points={points} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {validData.map((d, i) => (
          <circle key={d.weekNumber} cx={xOf(i)} cy={yOf(d.average)} r="4" fill="var(--ink)" stroke="var(--canvas)" strokeWidth="2" />
        ))}
        {validData.map((d, i) => (
          <text key={`wl-${d.weekNumber}`} x={xOf(i)} y={H - 8} textAnchor="middle" fill="color-mix(in srgb, var(--ink) 35%, transparent)" fontSize="10">W{d.weekNumber}</text>
        ))}
      </svg>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--ink) 10%, transparent)',
      borderRadius: 16, padding: '14px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: 'color-mix(in srgb, var(--ink) 45%, transparent)', fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: accent, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

export default function PublicLeague() {
  const { id } = useParams()
  const leagueId = parseInt(id || '')
  const [copied, setCopied] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab = tabParam === 'standings' || tabParam === 'leaderboard' ? tabParam : 'overview'

  const { data: league, isLoading: leagueLoading } = useQuery<League>({
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

  const { data: stats } = useQuery<LeagueStats>({
    queryKey: ['public-league-stats', leagueId],
    queryFn: () => fetch(`/api/leagues/${leagueId}/stats`).then(r => r.json()),
    enabled: !isNaN(leagueId),
  })

  const { data: standings } = useQuery<LeagueStandings>({
    queryKey: ['public-league-standings', leagueId],
    queryFn: () => fetch(`/api/leagues/${leagueId}/standings`).then(r => r.json()),
    enabled: !isNaN(leagueId),
  })

  const { data: leaderboard } = useQuery<LeagueLeaderboard>({
    queryKey: ['public-league-leaderboard', leagueId],
    queryFn: () => fetch(`/api/leagues/${leagueId}/leaderboard`).then(r => r.json()),
    enabled: !isNaN(leagueId),
  })

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', window.location.href)
    }
  }

  const shareStandings = async () => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'standings')
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this standings link:', url.toString())
    }
  }

  if (isNaN(leagueId)) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>League not found</div>
        <Link className="public-link-target" to="/" style={{ color: 'var(--oil-violet)' }}>BowlSense home</Link>
      </div>
    )
  }

  if (leagueLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ color: 'var(--muted)' }}>Loading league...</div>
      </div>
    )
  }

  if (!league) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>League not found</div>
        <Link className="public-link-target" to="/" style={{ color: 'var(--oil-violet)' }}>BowlSense home</Link>
      </div>
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
    <div className="public-competition-page">
      {/* Public banner */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--separator)',
        borderRadius: 20, padding: '20px', marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                background: 'color-mix(in srgb, var(--ink) 6%, transparent)', border: '1px solid var(--separator)',
                borderRadius: 999, padding: '3px 10px',
                fontSize: 11, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.05em',
              }}>
                🏆 PUBLIC STANDINGS
              </span>
            </div>
            <h1 style={{ fontSize: 'clamp(1.4rem, 5vw, 2.2rem)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 6 }}>
              {league.name}
            </h1>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              {[league.location, league.season, league.dayOfWeek].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button
            onClick={copyLink}
            className="public-action-target"
            style={{
              background: copied ? 'color-mix(in srgb, var(--spare-green) 20%, transparent)' : 'color-mix(in srgb, var(--ink) 6%, transparent)',
              border: `1px solid ${copied ? 'color-mix(in srgb, var(--spare-green) 50%, transparent)' : 'var(--separator)'}`,
              borderRadius: 12, padding: '8px 14px',
              color: copied ? 'var(--spare-green)' : 'var(--ink)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
              whiteSpace: 'nowrap', transition: 'all 0.2s',
            }}
          >
            {copied ? 'Link copied' : 'Share link'}
          </button>
        </div>
      </div>

      <div className="public-tabs" style={{
        background: 'var(--surface)',
        border: '1px solid color-mix(in srgb, var(--ink) 12%, transparent)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 18,
      }}>
        {(['overview', 'standings', 'leaderboard'] as const).map((tab) => {
          const selected = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                background: selected ? 'color-mix(in srgb, var(--oil-violet) 14%, transparent)' : 'transparent',
                color: selected ? 'var(--oil-violet)' : 'var(--muted)',
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
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 20 }}>
            <StatCard label="Avg Score" value={league.stats?.average ?? '—'} accent="var(--ink)" />
            <StatCard label="W — L" value={`${league.stats?.gamesWon ?? 0} — ${league.stats?.gamesLost ?? 0}`} accent="var(--spare-green)" />
            <StatCard label="Weeks Played" value={league.stats?.totalWeeks ?? 0} accent="var(--strike-gold)" />
            <StatCard label="High Game" value={league.stats?.high ?? '—'} accent="var(--strike-gold)" />
          </div>

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
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{avg}</div>
                      )}
                      <div style={{
                        background: week.gamesWon > week.gamesLost
                          ? 'color-mix(in srgb, var(--spare-green) 15%, transparent)' : week.gamesLost > week.gamesWon
                            ? 'color-mix(in srgb, var(--danger) 15%, transparent)' : 'color-mix(in srgb, var(--ink) 6%, transparent)',
                        border: `1px solid ${week.gamesWon > week.gamesLost
                          ? 'color-mix(in srgb, var(--spare-green) 35%, transparent)' : week.gamesLost > week.gamesWon
                            ? 'color-mix(in srgb, var(--danger) 35%, transparent)' : 'color-mix(in srgb, var(--ink) 12%, transparent)'}`,
                        borderRadius: 999, padding: '4px 12px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>W-L</div>
                        <div style={{
                          fontWeight: 800, fontSize: 16,
                          color: week.gamesWon > week.gamesLost ? 'var(--spare-green)' : week.gamesLost > week.gamesWon ? 'var(--danger)' : 'var(--text)',
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
                            minWidth: 72, background: isHigh ? 'color-mix(in srgb, var(--strike-gold) 12%, transparent)' : 'var(--surface)',
                            border: `1px solid ${isHigh ? 'color-mix(in srgb, var(--strike-gold) 40%, transparent)' : 'color-mix(in srgb, var(--ink) 10%, transparent)'}`,
                            borderRadius: 12, padding: '10px 8px', textAlign: 'center', flexShrink: 0,
                          }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>G{g.gameNumber}</div>
                            <div style={{ fontSize: 26, fontWeight: 900, color: isHigh ? 'var(--strike-gold)' : 'var(--ink)', lineHeight: 1 }}>
                              {g.score ?? '-'}
                            </div>
                            {isHigh && <div style={{ fontSize: 10, color: 'var(--strike-gold)', fontWeight: 700, marginTop: 2 }}>BEST</div>}
                          </div>
                        )
                      })}
                      {/* Series total */}
                      <div style={{
                        minWidth: 72, background: 'color-mix(in srgb, var(--ink) 6%, transparent)',
                        border: '1px solid var(--separator)', borderRadius: 12, padding: '10px 8px', textAlign: 'center', flexShrink: 0,
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Series</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ink)', lineHeight: 1 }}>{series}</div>
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
        </>
      )}

      {activeTab === 'standings' && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>🏁 Season Record</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--spare-green)', fontWeight: 800 }}>W {standings?.seasonRecord.wins ?? 0}</span>
                  <span style={{ color: 'var(--danger)', fontWeight: 800 }}>L {standings?.seasonRecord.losses ?? 0}</span>
                  <span style={{ color: 'var(--strike-gold)', fontWeight: 800 }}>T {standings?.seasonRecord.ties ?? 0}</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
                  Total Pins: <b style={{ color: 'var(--text)' }}>{standings?.seasonRecord.totalPins ?? 0}</b> · Games: <b style={{ color: 'var(--text)' }}>{standings?.seasonRecord.totalGames ?? 0}</b>
                </div>
              </div>
              <button
                onClick={shareStandings}
                className="public-action-target"
                style={{
                  border: '1px solid var(--separator)',
                  borderRadius: 12,
                  background: 'color-mix(in srgb, var(--ink) 6%, transparent)',
                  color: 'var(--ink-secondary)',
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
                <tr style={{ borderBottom: '1px solid color-mix(in srgb, var(--ink) 12%, transparent)' }}>
                  {['Week #', 'Your Avg', 'Opponent Avg', 'Result', 'Margin', 'Best Game', 'Cumulative'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 8px', fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(standings?.weeks || []).map((week) => {
                  const resultColor = week.result === 'W' ? 'var(--spare-green)' : week.result === 'L' ? 'var(--danger)' : 'var(--strike-gold)'
                  const rowBg = week.result === 'W' ? 'color-mix(in srgb, var(--spare-green) 6%, transparent)' : week.result === 'L' ? 'color-mix(in srgb, var(--danger) 6%, transparent)' : 'color-mix(in srgb, var(--strike-gold) 6%, transparent)'
                  return (
                    <tr key={week.weekId} style={{ borderBottom: '1px solid color-mix(in srgb, var(--ink) 8%, transparent)', background: rowBg }}>
                      <td style={{ padding: '11px 8px', fontWeight: 700 }}>Week {week.weekNumber}</td>
                      <td style={{ padding: '11px 8px' }}>{week.yourAvg || '—'}</td>
                      <td style={{ padding: '11px 8px' }}>{week.opponentAvg || '—'}</td>
                      <td style={{ padding: '11px 8px', fontWeight: 800, color: resultColor }}>{week.result}</td>
                      <td style={{ padding: '11px 8px', color: week.margin > 0 ? 'var(--spare-green)' : week.margin < 0 ? 'var(--danger)' : 'var(--strike-gold)', fontWeight: 700 }}>
                        {week.margin > 0 ? '+' : ''}{week.margin.toFixed(1)}
                      </td>
                      <td style={{ padding: '11px 8px', color: 'var(--strike-gold)', fontWeight: 700 }}>{week.bestGame || '—'}</td>
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
        </>
      )}

      {activeTab === 'leaderboard' && leaderboard && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>🏆 League Leaderboard</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--spare-green)', fontWeight: 800 }}>W {leaderboard.record.wins}</span>
                  <span style={{ color: 'var(--danger)', fontWeight: 800 }}>L {leaderboard.record.losses}</span>
                  <span style={{ color: 'var(--strike-gold)', fontWeight: 800 }}>T {leaderboard.record.ties}</span>
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
                    <div key={opp.rank} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: isMatt ? 'color-mix(in srgb, var(--ink) 6%, transparent)' : undefined, borderRadius: 10, border: isMatt ? '1px solid var(--separator)' : '1px solid var(--border)' }}>
                      <div style={{ minWidth: 28, fontWeight: 800, fontSize: 14, color: opp.rank === 1 ? 'var(--strike-gold)' : 'var(--muted)' }}>#{opp.rank}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{opp.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{opp.games} games · High {opp.highGame}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: 18, color: isMatt ? 'var(--accent)' : 'var(--text)' }}>{opp.avg}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>avg</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 48 }}>
        <Link to="/" style={{ color: 'var(--ink-secondary)', fontSize: 13, textDecoration: 'none' }}>
          BowlSense home
        </Link>
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'color-mix(in srgb, var(--ink) 25%, transparent)' }}>Tracked with </span>
          <span style={{ fontSize: 12, color: 'var(--separator)', fontWeight: 700 }}>BowlSense</span>
        </div>
      </div>
    </div>
  )
}
