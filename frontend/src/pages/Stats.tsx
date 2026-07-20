import { useQuery } from '@tanstack/react-query'

interface FullStats {
  overall: {
    average: number
    high: number
    low: number
    totalGames: number
    totalStrikes: number
    totalSpares: number
    strikeRate: number
    spareRate: number
    perfectGames: number
  }
  trend: {
    last5Avg: number
    last10Avg: number
    last20Avg: number
  }
  breakdown: {
    byMonth: { month: string; games: number; average: number }[]
    byLocation: { location: string; games: number; average: number }[]
    scoreDistribution: {
      sub150: number
      '150to179': number
      '180to199': number
      '200to224': number
      '225to249': number
      '250plus': number
    }
  }
}

function DistBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span style={{ fontWeight: 700 }}>{count} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ background: 'var(--border)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

interface TrendData {
  games: { id: number; score: number; date: string; location: string; gameNumber: number }[]
  rolling5: number[]
  rolling10: number[]
  rolling20: number[]
}

function TrendChart({ data }: { data: TrendData }) {
  const { games, rolling5, rolling10, rolling20 } = data
  if (games.length < 3) return null

  const W = 800
  const H = 280
  const PAD = { top: 20, right: 16, bottom: 36, left: 42 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const allValues = [...games.map(g => g.score), ...rolling5, ...rolling10, ...rolling20].filter(v => v > 0)
  const minScore = allValues.length ? Math.max(0, Math.min(...allValues) - 15) : 0
  const maxScore = allValues.length ? Math.min(300, Math.max(...allValues) + 15) : 300
  const range = maxScore - minScore || 1

  const xOf = (i: number) => PAD.left + (i / (games.length - 1)) * chartW
  const yOf = (v: number) => PAD.top + chartH - ((v - minScore) / range) * chartH
  const yTicks = [minScore, Math.round((minScore + maxScore) / 2), maxScore]

  const makeLine = (values: number[], color: string, dashed = false) => {
    const pts = values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')
    const dash = dashed ? 'strokeDasharray="5,4" ' : ''
    return `<polyline points="${pts}" fill="none" stroke="${color}" strokeWidth="2.5" ${dash}strokeLinejoin="round" strokeLinecap="round"/>`
  }

  const makeDots = (values: number[], color: string) =>
    values.map((v, i) => `<circle cx="${xOf(i)}" cy="${yOf(v)}" r="3.5" fill="${color}" stroke="var(--bg)" stroke-width="2"/>`).join('')

  const svgContent = `
    ${yTicks.map(t => `<line x1="${PAD.left}" y1="${yOf(t)}" x2="${W - PAD.right}" y2="${yOf(t)}" stroke="var(--border)" strokeWidth="1"/>`).join('')}
    ${yTicks.map(t => `<text x="${PAD.left - 6}" y="${yOf(t) + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${t}</text>`).join('')}
    ${makeLine(rolling20, 'rgba(167,139,250,0.25)', true)}
    ${makeLine(rolling10, 'rgba(167,139,250,0.6)', true)}
    ${makeLine(rolling5, '#a78bfa', false)}
    ${makeDots(games.map(g => g.score), '#f2f2ff')}
  `

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>📈 Score Trend</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 3, background: '#a78bfa', borderRadius: 999 }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Avg 5</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 2, background: 'rgba(167,139,250,0.55)', borderRadius: 999, borderTop: '2px dashed rgba(167,139,250,0.55)' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Avg 10</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 2, background: 'rgba(167,139,250,0.25)', borderRadius: 999, borderTop: '2px dashed rgba(167,139,250,0.25)' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Avg 20</span>
          </div>
        </div>
      </div>
      <div style={{ width: '100%', overflowX: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 280, display: 'block' }}
          dangerouslySetInnerHTML={{ __html: svgContent }} />
      </div>
    </div>
  )
}

export default function Stats() {
  const { data, isLoading } = useQuery<FullStats>({
    queryKey: ['stats/full'],
    queryFn: () => fetch('/api/stats/full').then(r => r.json()),
  })

  const { data: trendData } = useQuery<TrendData>({
    queryKey: ['stats-trend'],
    queryFn: () => fetch('/api/stats/trend').then(r => r.json()),
  })

  if (isLoading) return <div className="muted" style={{ padding: 32, textAlign: 'center' }}>Loading stats...</div>
  if (!data?.overall || data.overall.totalGames === 0) {
    return (
      <div>
        <h1 style={{ marginBottom: 16 }}>Stats</h1>
        <div className="card" style={{ textAlign: 'center' }}>
          <span className="muted">No games logged yet.</span>
        </div>
      </div>
    )
  }

  const overall = data.overall
  const trend = data.trend ?? { last5Avg: 0, last10Avg: 0, last20Avg: 0 }
  const breakdown = data.breakdown ?? { byMonth: [], byLocation: [], scoreDistribution: { sub150: 0, '150to179': 0, '180to199': 0, '200to224': 0, '225to249': 0, '250plus': 0 } }
  const distTotal = overall.totalGames

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Stats</h1>

      {/* Overall */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginBottom: 22 }}>
        {([
          ['Average', overall.average],
          ['High Game', overall.high],
          ['Low Game', overall.low],
          ['Total Games', overall.totalGames],
          ['Total Strikes', overall.totalStrikes],
          ['Total Spares', overall.totalSpares],
          ['Strike Rate', `${overall.strikeRate}%`],
          ['Spare Rate', `${overall.spareRate}%`],
          ['Perfect Games', overall.perfectGames],
        ] as [string, string | number][]).map(([label, value]) => (
          <div key={label} className="card card-accent-top" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 800, color: 'var(--accent)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      {trendData && trendData.games.length >= 3 && <TrendChart data={trendData} />}

      {/* Trend */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Averages by Window</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {([['Last 5', trend.last5Avg], ['Last 10', trend.last10Avg], ['Last 20', trend.last20Avg]] as [string, number][]).map(([label, val]) => (
            <div key={label} style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 14, padding: '10px 12px', textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{val || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Score Distribution */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Score Distribution</div>
        <DistBar label="250+" count={breakdown.scoreDistribution['250plus']} total={distTotal} />
        <DistBar label="225–249" count={breakdown.scoreDistribution['225to249']} total={distTotal} />
        <DistBar label="200–224" count={breakdown.scoreDistribution['200to224']} total={distTotal} />
        <DistBar label="180–199" count={breakdown.scoreDistribution['180to199']} total={distTotal} />
        <DistBar label="150–179" count={breakdown.scoreDistribution['150to179']} total={distTotal} />
        <DistBar label="Below 150" count={breakdown.scoreDistribution.sub150} total={distTotal} />
      </div>

      {/* By Location */}
      {breakdown.byLocation.length > 0 && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>By Location</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {breakdown.byLocation.map(row => (
              <div key={row.location} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{row.location}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{row.games} game{row.games !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{row.average}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Month */}
      {breakdown.byMonth.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>By Month</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {breakdown.byMonth.slice().reverse().map(row => (
              <div key={row.month} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{row.month}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{row.games} game{row.games !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{row.average}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
