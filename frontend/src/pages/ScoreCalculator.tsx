import { useMemo, useState } from 'react'
import { InsightMetric, InsightsWorkspace, InsightState, LeadTakeaway } from '../features/insights/InsightsWorkspace'
import { ScoreHistogram, type HistogramBucket } from '../features/insights/charts'
import { copyText } from '../features/scoring/copyText'

interface GameScore {
  id: number
  score: number | null
}

const bucketDefinitions = [
  { key: 'under150', label: '<150', minimum: 0, maximum: 149 },
  { key: '150to199', label: '150–199', minimum: 150, maximum: 199 },
  { key: '200to249', label: '200–249', minimum: 200, maximum: 249 },
  { key: '250to299', label: '250–299', minimum: 250, maximum: 299 },
  { key: 'perfect', label: '300', minimum: 300, maximum: 300 },
] as const

type BucketKey = typeof bucketDefinitions[number]['key']

function scoreBucket(score: number): BucketKey {
  return bucketDefinitions.find((bucket) => score >= bucket.minimum && score <= bucket.maximum)?.key ?? 'under150'
}

export default function ScoreCalculator() {
  const [scores, setScores] = useState<GameScore[]>([
    { id: 1, score: null },
    { id: 2, score: null },
    { id: 3, score: null },
  ])
  const [nextId, setNextId] = useState(4)
  const [targetAverage, setTargetAverage] = useState('')
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const validScores = useMemo(
    () => scores.map((game) => game.score).filter((score): score is number => score !== null),
    [scores],
  )

  const summary = useMemo(() => {
    if (validScores.length === 0) return null
    const total = validScores.reduce((sum, score) => sum + score, 0)
    const buckets = Object.fromEntries(bucketDefinitions.map((bucket) => [bucket.key, 0])) as Record<BucketKey, number>
    validScores.forEach((score) => { buckets[scoreBucket(score)] += 1 })
    return {
      average: Math.round(total / validScores.length),
      high: Math.max(...validScores),
      low: Math.min(...validScores),
      total,
      buckets,
    }
  }, [validScores])

  const histogram = useMemo<HistogramBucket[]>(() => {
    return bucketDefinitions.map((bucket) => ({
      label: bucket.label,
      count: summary?.buckets[bucket.key] ?? 0,
    }))
  }, [summary])

  const targetResult = useMemo(() => {
    if (!summary || targetAverage.trim() === '') return null
    const target = Number(targetAverage)
    if (!Number.isFinite(target) || target < 0 || target > 300) {
      return { kind: 'invalid' as const, target }
    }
    const required = Math.ceil(target * (validScores.length + 1) - summary.total)
    if (required <= 0) return { kind: 'achieved' as const, target }
    if (required > 300) return { kind: 'unreachable' as const, target, required }
    return { kind: 'score' as const, target, required }
  }, [summary, targetAverage, validScores.length])

  const addGame = () => {
    setScores((current) => [...current, { id: nextId, score: null }])
    setNextId((current) => current + 1)
  }

  const removeGame = (id: number) => {
    setScores((current) => current.filter((game) => game.id !== id))
  }

  const updateScore = (id: number, value: string) => {
    const parsed = value === '' ? null : Number.parseInt(value, 10)
    const score = parsed === null || Number.isNaN(parsed) ? null : Math.min(300, Math.max(0, parsed))
    setScores((current) => current.map((game) => game.id === id ? { ...game, score } : game))
  }

  const shareOnX = () => {
    if (!summary) return
    const text = `My bowling scores: ${summary.average} average over ${validScores.length} games, with a ${summary.high} high game. 🎳`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  const downloadImage = async () => {
    if (!summary) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const response = await fetch('/api/profile/og-image')
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `bowlsense-stats-${summary.average}avg-${validScores.length}games.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('The image could not be prepared. Try again in a moment.')
    } finally {
      setDownloading(false)
    }
  }

  const copyLink = async () => {
    try {
      await copyText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setDownloadError('The link could not be copied. Copy it from your browser address bar instead.')
    }
  }

  return (
    <InsightsWorkspace description="Run a clean what-if without adding games to your history.">
      {summary ? (
        <LeadTakeaway
          label="What-if result"
          detail={`This ${summary.average} average uses only the ${validScores.length} score${validScores.length === 1 ? '' : 's'} entered below. Nothing here changes your BowlSense history.`}
        >
          {summary.high === 300 ? 'A perfect game leads this set.' : `Your entered set averages ${summary.average}.`}
        </LeadTakeaway>
      ) : (
        <InsightState title="Start with a score">
          Enter one or more games below. This scratchpad calculates a series, average, range, and one-game target without saving anything.
        </InsightState>
      )}

      <section className="insights-panel">
        <div className="insights-panel-header">
          <div>
            <h2>Scratchpad</h2>
            <p>Scores are limited to the bowling range of 0–300</p>
          </div>
        </div>
        <div className="insights-score-grid">
          {scores.map((game, index) => (
            <div className="insights-score-field" key={game.id}>
              <label htmlFor={`score-${game.id}`}>Game {index + 1}</label>
              <input
                className="insights-input"
                id={`score-${game.id}`}
                inputMode="numeric"
                max={300}
                min={0}
                type="number"
                value={game.score ?? ''}
                onChange={(event) => updateScore(game.id, event.target.value)}
              />
              {scores.length > 1 && (
                <button className="insights-remove" type="button" aria-label={`Remove game ${index + 1}`} onClick={() => removeGame(game.id)}>×</button>
              )}
            </div>
          ))}
        </div>
        <button className="insights-button is-secondary insights-add-score" type="button" onClick={addGame}>Add another game</button>
      </section>

      {summary && (
        <>
          <section className="insights-metrics" aria-label="Calculated score summary">
            <InsightMetric label="Average" value={summary.average} note={`${validScores.length} games`} />
            <InsightMetric label="Series" value={summary.total} note="Total pins" />
            <InsightMetric label="High game" value={summary.high} note="Best entered score" />
            <InsightMetric label="Low game" value={summary.low} note="Lowest entered score" />
          </section>

          <div className="insights-grid">
            <ScoreHistogram buckets={histogram} caption={`Where your ${validScores.length} entered game${validScores.length === 1 ? '' : 's'} landed`} />
            <section className="insights-panel">
              <div className="insights-panel-header">
                <div><h2>Next-game target</h2><p>Required next score to reach a new average</p></div>
              </div>
              <div className="insights-target">
                <div>
                  <label className="insights-field-label" htmlFor="target-average">Target average</label>
                  <input
                    className="insights-input"
                    id="target-average"
                    inputMode="numeric"
                    max={300}
                    min={0}
                    placeholder="e.g. 215"
                    type="number"
                    value={targetAverage}
                    onChange={(event) => setTargetAverage(event.target.value)}
                  />
                </div>
                <div className="insights-target-result" aria-live="polite">
                  {!targetResult && <span>Enter a target from 0 to 300.</span>}
                  {targetResult?.kind === 'invalid' && <span>Use a target from 0 to 300.</span>}
                  {targetResult?.kind === 'achieved' && <span>Your next score can be <strong>0</strong> and the rounded set will still meet {targetResult.target}.</span>}
                  {targetResult?.kind === 'unreachable' && <span>One game cannot reach {targetResult.target}; it would require <strong>{targetResult.required}</strong>.</span>}
                  {targetResult?.kind === 'score' && <span>Score at least <strong>{targetResult.required}</strong> next to average {targetResult.target}.</span>}
                </div>
              </div>
            </section>
          </div>

          <section className="insights-panel">
            <div className="insights-panel-header">
              <div><h2>Share this result</h2><p>Share the calculated set or save your existing profile image</p></div>
            </div>
            <div className="insights-actions">
              <button className="insights-button" type="button" onClick={shareOnX}>Share on X</button>
              <button className="insights-button is-secondary" type="button" disabled={downloading} onClick={() => void downloadImage()}>
                {downloading ? 'Preparing image…' : 'Download image'}
              </button>
              <button className="insights-button is-secondary" type="button" onClick={() => void copyLink()}>{copied ? 'Link copied' : 'Copy link'}</button>
            </div>
            {downloadError && <p className="insights-inline-error" role="alert">{downloadError}</p>}
          </section>
        </>
      )}
    </InsightsWorkspace>
  )
}
