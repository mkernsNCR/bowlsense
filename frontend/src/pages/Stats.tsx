import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { InsightMetric, InsightsWorkspace, InsightState, LeadTakeaway } from '../features/insights/InsightsWorkspace'
import { ScoreHistogram, ScoreTrendChart, type HistogramBucket } from '../features/insights/charts'
import { fetchJson } from '../features/insights/data'
import { TREND_WINDOWS, type TrendData, type TrendWindow } from '../features/insights/trend'

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

function formatAverage(value: number) {
  return Math.round(value)
}

function getTakeaway(stats: FullStats) {
  const recent = formatAverage(stats.trend?.last5Avg ?? 0)
  const baseline = formatAverage(stats.trend?.last20Avg ?? 0)
  const difference = Math.round(recent - baseline)

  if (stats.overall.totalGames >= 20 && recent > 0 && baseline > 0 && Math.abs(difference) >= 2) {
    return difference > 0
      ? {
          headline: `Your last five are ${difference} pins ahead of your 20-game pace.`,
          detail: `A ${recent} recent average is a real move above your ${baseline} baseline. Keep the same start and watch whether it holds over the next five.`,
        }
      : {
          headline: `Your last five are ${Math.abs(difference)} pins off your 20-game pace.`,
          detail: `Your recent ${recent} average trails the ${baseline} baseline. Use pin practice to find the repeat leave costing the most makeable spares.`,
        }
  }

  if (stats.overall.strikeRate >= stats.overall.spareRate && stats.overall.strikeRate > 0) {
    return {
      headline: `Strikes are setting the pace at ${stats.overall.strikeRate}%.`,
      detail: `Your spare conversion is ${stats.overall.spareRate}%. The fastest scoring opportunity is protecting count and turning more makeable leaves into closes.`,
    }
  }

  return {
    headline: `Your scoring baseline is ${Math.round(stats.overall.average)}.`,
    detail: `This view is based on ${stats.overall.totalGames} logged games. Add consistent frame data to make the trend and pin-practice recommendations more useful.`,
  }
}

function histogramBuckets(stats: FullStats): HistogramBucket[] {
  const distribution = stats.breakdown?.scoreDistribution
  return [
    { label: '<150', count: distribution?.sub150 ?? 0 },
    { label: '150–179', count: distribution?.['150to179'] ?? 0 },
    { label: '180–199', count: distribution?.['180to199'] ?? 0 },
    { label: '200–224', count: distribution?.['200to224'] ?? 0 },
    { label: '225–249', count: distribution?.['225to249'] ?? 0 },
    { label: '250+', count: distribution?.['250plus'] ?? 0 },
  ]
}

export default function Stats() {
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(10)
  const [statsRetrying, setStatsRetrying] = useState(false)
  const [trendRetrying, setTrendRetrying] = useState(false)
  const statsQuery = useQuery<FullStats>({
    queryKey: ['stats/full'],
    queryFn: () => fetchJson<FullStats>('/api/stats/full'),
  })
  const trendQuery = useQuery<TrendData>({
    queryKey: ['stats-trend'],
    queryFn: () => fetchJson<TrendData>('/api/stats/trend'),
  })

  const retryStats = async () => {
    setStatsRetrying(true)
    try {
      await statsQuery.refetch()
    } finally {
      setStatsRetrying(false)
    }
  }

  const retryTrend = async () => {
    setTrendRetrying(true)
    try {
      await trendQuery.refetch()
    } finally {
      setTrendRetrying(false)
    }
  }

  if (statsQuery.isError || statsRetrying) {
    return (
      <InsightsWorkspace description="Turn scores and leaves into one useful next move.">
        <InsightState
          busy={statsQuery.isFetching}
          title="Insights could not load"
          tone="error"
          action={<button className="insights-button" type="button" disabled={statsQuery.isFetching} onClick={() => void retryStats()}>Try again</button>}
        >
          Check your connection, then retry. Your logged games have not been changed.
        </InsightState>
      </InsightsWorkspace>
    )
  }

  if (statsQuery.isLoading) {
    return (
      <InsightsWorkspace description="Turn scores and leaves into one useful next move.">
        <InsightState title="Reading your scorebook" status="loading">
          Pulling together your scoring pace, ranges, and recent trend.
        </InsightState>
      </InsightsWorkspace>
    )
  }

  const stats = statsQuery.data
  if (!stats?.overall || stats.overall.totalGames === 0) {
    return (
      <InsightsWorkspace description="Turn scores and leaves into one useful next move.">
        <InsightState
          title="Your first insight starts with a game"
          action={<Link className="insights-button" to="/sessions/new">Start bowling</Link>}
        >
          Add a score to establish your average. Frame-level entry will also reveal repeat pin leaves and conversion opportunities.
        </InsightState>
      </InsightsWorkspace>
    )
  }

  const takeaway = getTakeaway(stats)
  const trend = stats.trend ?? { last5Avg: 0, last10Avg: 0, last20Avg: 0 }
  const locations = stats.breakdown?.byLocation ?? []
  const months = stats.breakdown?.byMonth ?? []
  const trendGameCount = trendQuery.data?.games.length ?? 0
  const availableTrendWindows = TREND_WINDOWS.filter(({ size }) => size <= trendGameCount)
  const activeTrendWindow = availableTrendWindows.some(({ size }) => size === trendWindow)
    ? trendWindow
    : (availableTrendWindows[availableTrendWindows.length - 1]?.size ?? 5)

  return (
    <InsightsWorkspace description="Turn scores and leaves into one useful next move.">
      <LeadTakeaway detail={takeaway.detail}>{takeaway.headline}</LeadTakeaway>

      <section className="insights-metrics" aria-label="Scoring summary">
        <InsightMetric label="Average" value={Math.round(stats.overall.average)} note={`${stats.overall.totalGames} games`} />
        <InsightMetric label="High game" value={stats.overall.high} note={stats.overall.perfectGames > 0 ? `${stats.overall.perfectGames} perfect` : 'Personal best'} />
        <InsightMetric label="Strike rate" value={`${stats.overall.strikeRate}%`} note={`${stats.overall.totalStrikes} strikes`} />
        <InsightMetric label="Spare rate" value={`${stats.overall.spareRate}%`} note={`${stats.overall.totalSpares} spares`} />
      </section>

      {trendQuery.isError || trendRetrying ? (
        <section className="insights-panel" aria-busy={trendQuery.isFetching} aria-live="polite">
          <div className="insights-panel-header">
            <div>
              <h2>Scoring trend unavailable</h2>
              <p>Your summary is still current. Retry just the game-by-game trend.</p>
            </div>
            <button className="insights-button is-secondary" type="button" disabled={trendQuery.isFetching} onClick={() => void retryTrend()}>Retry</button>
          </div>
        </section>
      ) : trendQuery.isLoading ? (
        <section className="insights-panel" aria-busy="true" aria-live="polite">
          <div className="insights-panel-header">
            <div>
              <h2>Loading scoring trend</h2>
              <p>Plotting your game-by-game scores and rolling averages.</p>
            </div>
          </div>
        </section>
      ) : trendQuery.data && trendQuery.data.games.length >= 5 ? (
        <section className="insights-trend-block" aria-label="Scoring trend">
          <div className="insights-window-switch" role="group" aria-label="Rolling average window">
            {availableTrendWindows.map(({ size: windowSize }) => (
              <button
                key={windowSize}
                type="button"
                aria-pressed={activeTrendWindow === windowSize}
                onClick={() => setTrendWindow(windowSize)}
              >
                {windowSize} games
              </button>
            ))}
          </div>
          <ScoreTrendChart data={trendQuery.data} windowSize={activeTrendWindow} />
        </section>
      ) : (
        <section className="insights-panel">
          <div className="insights-panel-header">
            <div>
              <h2>Trend starts after five games</h2>
              <p>Log {Math.max(0, 5 - (trendQuery.data?.games.length ?? 0))} more to plot a complete five-game average.</p>
            </div>
          </div>
        </section>
      )}

      <div className="insights-grid">
        <ScoreHistogram buckets={histogramBuckets(stats)} />
        <section className="insights-panel">
          <div className="insights-panel-header">
            <div>
              <h2>Rolling windows</h2>
              <p>Short-term pace against your longer baseline</p>
            </div>
          </div>
          <ol className="insights-ranked-list">
            <li>
              <div><strong>Last 5</strong><span>{stats.overall.totalGames >= 5 ? 'Most responsive to a recent change' : `Needs ${5 - stats.overall.totalGames} more games`}</span></div>
              <b>{stats.overall.totalGames >= 5 ? formatAverage(trend.last5Avg) : '—'}</b>
            </li>
            <li>
              <div><strong>Last 10</strong><span>{stats.overall.totalGames >= 10 ? 'Smooths a short hot or cold streak' : `Needs ${10 - stats.overall.totalGames} more games`}</span></div>
              <b>{stats.overall.totalGames >= 10 ? formatAverage(trend.last10Avg) : '—'}</b>
            </li>
            <li>
              <div><strong>Last 20</strong><span>{stats.overall.totalGames >= 20 ? 'Your established scoring pace' : `Needs ${20 - stats.overall.totalGames} more games`}</span></div>
              <b>{stats.overall.totalGames >= 20 ? formatAverage(trend.last20Avg) : '—'}</b>
            </li>
          </ol>
        </section>
      </div>

      {(locations.length > 0 || months.length > 0) && (
        <div className="insights-grid">
          {locations.length > 0 && (
            <section className="insights-panel">
              <div className="insights-panel-header">
                <div><h2>By center</h2><p>How the lane context changes your scoring</p></div>
              </div>
              <ol className="insights-ranked-list">
                {locations.map((location) => (
                  <li key={location.location}>
                    <div><strong>{location.location || 'Unknown center'}</strong><span>{location.games} game{location.games === 1 ? '' : 's'}</span></div>
                    <b>{formatAverage(location.average)}</b>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {months.length > 0 && (
            <section className="insights-panel">
              <div className="insights-panel-header">
                <div><h2>By month</h2><p>Your latest recorded scoring blocks</p></div>
              </div>
              <ol className="insights-ranked-list">
                {months.slice().reverse().slice(0, 6).map((month) => (
                  <li key={month.month}>
                    <div><strong>{month.month}</strong><span>{month.games} game{month.games === 1 ? '' : 's'}</span></div>
                    <b>{formatAverage(month.average)}</b>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </InsightsWorkspace>
  )
}
