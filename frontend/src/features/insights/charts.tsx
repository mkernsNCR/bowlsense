import { useId } from 'react'

interface TrendGame {
  id: number
  score: number
  date: string
  location: string
  gameNumber: number
}

export interface TrendData {
  games: TrendGame[]
  rolling5: number[]
  rolling10: number[]
  rolling20: number[]
}

export type TrendWindow = 5 | 10 | 20

function polylinePoints(values: number[], xOf: (index: number) => number, yOf: (value: number) => number) {
  return values.map((value, index) => `${xOf(index)},${yOf(value)}`).join(' ')
}

export function ScoreTrendChart({ data, windowSize }: { data: TrendData; windowSize: TrendWindow }) {
  const titleId = useId()
  const descriptionId = useId()
  const width = 760
  const height = 260
  const padding = { top: 18, right: 18, bottom: 36, left: 44 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const rollingAverage = windowSize === 5 ? data.rolling5 : windowSize === 10 ? data.rolling10 : data.rolling20
  const values = [...data.games.map((game) => game.score), ...rollingAverage]
    .filter((value) => Number.isFinite(value) && value >= 0)
  const rawMin = values.length > 0 ? Math.min(...values) : 0
  const rawMax = values.length > 0 ? Math.max(...values) : 300
  const min = Math.max(0, Math.floor((rawMin - 10) / 10) * 10)
  const max = Math.min(300, Math.max(min + 20, Math.ceil((rawMax + 10) / 10) * 10))
  const range = max - min
  const denominator = Math.max(1, data.games.length - 1)
  const xOf = (index: number) => padding.left + (index / denominator) * plotWidth
  const yOf = (value: number) => padding.top + plotHeight - ((value - min) / range) * plotHeight
  const ticks = [min, Math.round((min + max) / 2), max]
  const dateRange = data.games.length > 1
    ? `${data.games[0].date} through ${data.games[data.games.length - 1].date}`
    : data.games[0]?.date ?? 'the selected period'

  return (
    <figure className="insights-chart">
      <figcaption>
        <div>
          <h2>Scoring trend</h2>
          <p>{data.games.length} games · {dateRange}</p>
        </div>
        <div className="insights-chart-legend" aria-hidden="true">
          <span><i className={`is-${windowSize === 5 ? 'five' : windowSize === 10 ? 'ten' : 'twenty'}`} />{windowSize} game average</span>
          <span><i className="is-score" />Score</span>
        </div>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Bowling score and rolling average trend</title>
        <desc id={descriptionId}>
          Scores range from {rawMin} to {rawMax}. The chart compares each game with the selected {windowSize}-game rolling average.
        </desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={yOf(tick)} y2={yOf(tick)} />
            <text className="chart-axis-label" x={padding.left - 8} y={yOf(tick) + 4} textAnchor="end">{tick}</text>
          </g>
        ))}
        {rollingAverage.length > 1 && (
          <polyline
            className={`chart-line is-${windowSize === 5 ? 'five' : windowSize === 10 ? 'ten' : 'twenty'}`}
            points={polylinePoints(rollingAverage, xOf, yOf)}
          />
        )}
        {data.games.map((game, index) => (
          <circle key={`${game.id}-${index}`} className="chart-score-dot" cx={xOf(index)} cy={yOf(game.score)} r="4">
            <title>{game.date}, game {game.gameNumber}: {game.score} at {game.location || 'unknown location'}</title>
          </circle>
        ))}
      </svg>
    </figure>
  )
}

export interface HistogramBucket {
  count: number
  label: string
}

interface ScoreHistogramProps {
  buckets: HistogramBucket[]
  caption?: string
}

export function ScoreHistogram({ buckets, caption }: ScoreHistogramProps) {
  const titleId = useId()
  const descriptionId = useId()
  const width = 640
  const height = 210
  const padding = { top: 12, right: 12, bottom: 52, left: 32 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const gap = 10
  const barWidth = (plotWidth - gap * (buckets.length - 1)) / buckets.length
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.count))
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

  return (
    <figure className="insights-chart insights-histogram">
      <figcaption>
        <div>
          <h2>Score range</h2>
          <p>{caption ?? `Where your ${total} logged game${total === 1 ? '' : 's'} landed`}</p>
        </div>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
        <title id={titleId}>Distribution of bowling scores</title>
        <desc id={descriptionId}>
          {buckets.map((bucket) => `${bucket.label}: ${bucket.count} games`).join('. ')}.
        </desc>
        <line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight} y2={padding.top + plotHeight} />
        {buckets.map((bucket, index) => {
          const barHeight = (bucket.count / maximum) * plotHeight
          const x = padding.left + index * (barWidth + gap)
          const y = padding.top + plotHeight - barHeight
          return (
            <g key={bucket.label}>
              <rect className="histogram-bar" x={x} y={y} width={barWidth} height={barHeight} rx="4">
                <title>{bucket.label}: {bucket.count} game{bucket.count === 1 ? '' : 's'}</title>
              </rect>
              <text className="histogram-count" x={x + barWidth / 2} y={Math.max(padding.top + 13, y - 7)} textAnchor="middle">{bucket.count}</text>
              <text className="chart-axis-label" x={x + barWidth / 2} y={height - 22} textAnchor="middle">{bucket.label}</text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
