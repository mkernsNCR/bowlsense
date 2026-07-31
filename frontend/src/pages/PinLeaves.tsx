import { useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { InsightMetric, InsightsWorkspace, InsightState, LeadTakeaway } from '../features/insights/InsightsWorkspace'
import { fetchJson } from '../features/insights/data'

interface PinLeaveEntry {
  pins: string
  count: number
  pct: number
  conversions: number
  conversionRate: number
}

interface MonthLeaves {
  month: string
  leaves: { pins: string; count: number }[]
}

interface PinLeaveData {
  totalFirstThrows: number
  leaves: PinLeaveEntry[]
  neverLeft: string[]
  byMonth: MonthLeaves[]
}

const pinPositions: Record<number, [number, number]> = {
  7: [18, 18], 8: [39, 18], 9: [61, 18], 10: [82, 18],
  4: [28, 40], 5: [50, 40], 6: [72, 40],
  2: [39, 62], 3: [61, 62],
  1: [50, 82],
}

function parsePins(pins: string): number[] {
  return pins.split(',').map(Number).filter((pin) => Number.isInteger(pin) && pin >= 1 && pin <= 10)
}

function PinDeck({ leave }: { leave: string | null }) {
  const titleId = useId()
  const descriptionId = useId()
  const standing = new Set(leave ? parsePins(leave) : [])
  const description = leave ? `Standing pins ${leave}` : 'No leave selected'
  return (
    <svg viewBox="0 0 100 100" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>Pin deck</title>
      <desc id={descriptionId}>{description}</desc>
      <ellipse className="pin-deck-ring" cx="50" cy="50" rx="47" ry="46" />
      {Object.entries(pinPositions).map(([pinKey, [x, y]]) => {
        const pin = Number(pinKey)
        const isStanding = standing.has(pin)
        return (
          <g key={pin}>
            <circle className={`pin-deck-pin${isStanding ? ' is-standing' : ''}`} cx={x} cy={y} r="8" />
            <text className={`pin-deck-number${isStanding ? ' is-standing' : ''}`} x={x} y={y + 2.4} textAnchor="middle">{pin}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function PinLeaves() {
  const query = useQuery<PinLeaveData>({
    queryKey: ['pin-leaves'],
    queryFn: () => fetchJson<PinLeaveData>('/api/analytics/pin-leaves'),
  })
  const [selectedLeave, setSelectedLeave] = useState<string | null>(null)

  const repeatedLeaves = useMemo(
    () => query.data?.leaves.filter((leave) => leave.count >= 2) ?? [],
    [query.data],
  )
  const practiceLeave = useMemo(() => {
    return [...repeatedLeaves].sort((a, b) => {
      const missedA = a.count - a.conversions
      const missedB = b.count - b.conversions
      return missedB - missedA || b.count - a.count || a.conversionRate - b.conversionRate
    })[0] ?? null
  }, [repeatedLeaves])
  const bestConversion = useMemo(() => {
    return [...repeatedLeaves].sort((a, b) => b.conversionRate - a.conversionRate || b.count - a.count)[0] ?? null
  }, [repeatedLeaves])

  if (query.isLoading) {
    return (
      <InsightsWorkspace description="Find the leave that deserves your next practice block.">
        <section className="insights-state" aria-busy="true" aria-live="polite">
          <span className="insights-state-mark" aria-hidden="true" />
          <h2>Mapping your pin leaves</h2>
          <p>Counting repeat leaves and checking how often each one was converted.</p>
        </section>
      </InsightsWorkspace>
    )
  }

  if (query.isError) {
    return (
      <InsightsWorkspace description="Find the leave that deserves your next practice block.">
        <InsightState
          title="Pin practice could not load"
          tone="error"
          action={<button className="insights-button" type="button" onClick={() => void query.refetch()}>Try again</button>}
        >
          Check your connection, then retry. No frame data has been changed.
        </InsightState>
      </InsightsWorkspace>
    )
  }

  const data = query.data
  if (!data || data.totalFirstThrows === 0 || data.leaves.length === 0) {
    return (
      <InsightsWorkspace description="Find the leave that deserves your next practice block.">
        <InsightState
          title="Frame data unlocks pin practice"
          action={<Link className="insights-button" to="/sessions/new">Start bowling</Link>}
        >
          Record first-ball leaves and spare attempts in a game. Repeat patterns and conversion opportunities will appear here.
        </InsightState>
      </InsightsWorkspace>
    )
  }

  const topLeave = data.leaves[0]
  const activeLeave = selectedLeave ?? practiceLeave?.pins ?? topLeave.pins
  const practiceDetail = practiceLeave
    ? `You have seen it ${practiceLeave.count} times and converted ${practiceLeave.conversions}, a ${practiceLeave.conversionRate}% rate. Select any leave below to map it on the deck.`
    : `You need at least two attempts at a leave before BowlSense can rank it as a repeat practice opportunity.`

  return (
    <InsightsWorkspace description="Find the leave that deserves your next practice block.">
      <LeadTakeaway detail={practiceDetail} label="Next practice block">
        {practiceLeave ? `Set up the ${practiceLeave.pins} leave first.` : `Build a repeatable spare sample.`}
      </LeadTakeaway>

      <section className="insights-metrics" aria-label="Pin leave summary">
        <InsightMetric label="Tracked first balls" value={data.totalFirstThrows} note="With frame detail" />
        <InsightMetric label="Most common" value={topLeave.pins} note={`${topLeave.count} times · ${topLeave.pct}%`} />
        <InsightMetric label="Best conversion" value={bestConversion ? `${bestConversion.conversionRate}%` : '—'} note={bestConversion?.pins ?? 'Need repeat attempts'} />
        <InsightMetric label="Practice leave" value={practiceLeave?.pins ?? '—'} note={practiceLeave ? `${practiceLeave.conversionRate}% converted` : 'Need repeat attempts'} />
      </section>

      <div className="insights-pin-layout">
        <section className="insights-panel insights-pin-deck">
          <div className="insights-panel-header">
            <div>
              <h2>{activeLeave} leave</h2>
              <p>Standing pins are shown in purple</p>
            </div>
          </div>
          <PinDeck leave={activeLeave} />
        </section>

        <section className="insights-panel">
          <div className="insights-panel-header">
            <div>
              <h2>Leave frequency</h2>
              <p>Select a leave to map it on the deck</p>
            </div>
          </div>
          <ol className="insights-leave-list">
            {data.leaves.map((leave) => {
              const isSelected = activeLeave === leave.pins
              return (
                <li key={leave.pins}>
                  <button
                    className="insights-leave-button"
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedLeave(leave.pins)}
                  >
                    <strong>{leave.pins}</strong>
                    <span>
                      {leave.count} time{leave.count === 1 ? '' : 's'} · {leave.pct}% of tracked throws
                      <i className="insights-rate-track" aria-hidden="true"><i style={{ width: `${Math.min(100, leave.pct)}%` }} /></i>
                    </span>
                    <span>{leave.conversionRate}% converted</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      </div>

      <div className="insights-grid">
        <section className="insights-panel">
          <div className="insights-panel-header">
            <div><h2>Unseen leaves</h2><p>Pin combinations not yet present in your sample</p></div>
          </div>
          {data.neverLeft.length > 0 ? (
            <div className="insights-tags">
              {data.neverLeft.map((pins) => <span className="insights-tag" key={pins}>{pins}</span>)}
            </div>
          ) : (
            <p className="muted">No unseen-leave data is available for this sample.</p>
          )}
        </section>

        <section className="insights-panel">
          <div className="insights-panel-header">
            <div><h2>Recent months</h2><p>How repeat leaves have shifted</p></div>
          </div>
          {data.byMonth.length > 0 ? (
            <div className="insights-months">
              {data.byMonth.slice(0, 6).map((month) => (
                <div className="insights-month" key={month.month}>
                  <span>{month.month}</span>
                  <div className="insights-tags">
                    {month.leaves.map((leave) => <span className="insights-tag" key={leave.pins}>{leave.pins} ×{leave.count}</span>)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Monthly patterns appear after leaves are recorded across dated sessions.</p>
          )}
        </section>
      </div>
    </InsightsWorkspace>
  )
}
