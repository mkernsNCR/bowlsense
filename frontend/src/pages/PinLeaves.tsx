import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

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

function parsePins(pinsStr: string): number[] {
  if (!pinsStr) return []
  return pinsStr.split(',').map(Number).filter(n => !Number.isNaN(n))
}

// SVG pin deck — dots for standing pins with pin numbers
function PinDeckDiagram({ highlighted = [], size = 180 }: { highlighted?: string[]; size?: number }) {
  // Pin positions in viewBox "0 0 100 85" — back row (7,8,9,10) at top
  const pinPositions: Record<number, [number, number]> = {
    7: [15, 15], 8: [35, 15], 9: [55, 15], 10: [75, 15],
    4: [25, 38], 5: [50, 38], 6: [75, 38],
    2: [38, 60], 3: [63, 60],
    1: [50, 78],
  }
  const cx = size / 2
  const cy = size / 2
  const scale = size / 100

  const highlightedPins = new Set<number>()
  for (const leave of highlighted) {
    for (const p of parsePins(leave)) highlightedPins.add(p)
  }

  return (
    <svg viewBox="0 0 100 95" width={size} height={size * 0.95} style={{ display: 'block' }}>
      <ellipse cx="50" cy="47" rx="46" ry="43" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
      {[10, 7, 8, 9, 4, 5, 6, 2, 3, 1].map(num => {
        const [px, py] = pinPositions[num]
        const isLeft = highlightedPins.has(num)
        const isHighlighted = highlighted.length > 0 && isLeft
        return (
          <g key={num}>
            <circle
              cx={cx + (px - 50) * scale}
              cy={cy + (py - 47) * scale}
              r={num === 1 ? 7 * scale : 6 * scale}
              fill={isHighlighted ? '#fbbf24' : isLeft ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.12)'}
              stroke={isHighlighted ? '#fbbf24' : isLeft ? '#a78bfa' : 'rgba(255,255,255,0.28)'}
              strokeWidth={isHighlighted ? 2.5 : 1}
            />
            <text
              x={cx + (px - 50) * scale}
              y={cy + (py - 47) * scale + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={num === 1 ? 7 * scale : 6 * scale}
              fontWeight="700"
              fill={isHighlighted ? '#0d0d1a' : isLeft ? '#fff' : 'rgba(255,255,255,0.45)'}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {num}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function LeaveBar({ pct, color = '#a78bfa' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', marginTop: 5 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.35s' }} />
    </div>
  )
}

export default function PinLeaves() {
  const { data, isLoading } = useQuery<PinLeaveData>({
    queryKey: ['pin-leaves'],
    queryFn: () => fetch('/api/analytics/pin-leaves').then(r => r.json()),
  })

  const [selectedLeave, setSelectedLeave] = useState<string | null>(null)

  useEffect(() => { document.title = 'Pin Leave Analysis 🎯' }, [])

  const total = data?.totalFirstThrows ?? 0
  const topLeave = data?.leaves[0]
  const bestConversion = useMemo(() => {
    if (!data?.leaves.length) return null
    return [...data.leaves].filter(l => l.count >= 2).sort((a, b) => b.conversionRate - a.conversionRate)[0]
  }, [data])
  const worstConversion = useMemo(() => {
    if (!data?.leaves.length) return null
    return [...data.leaves].filter(l => l.count >= 2).sort((a, b) => a.conversionRate - b.conversionRate)[0]
  }, [data])

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <span className="muted">Loading pin analysis…</span>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Pin Leave Analysis</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {total > 0
              ? `Tracking ${total} first-throw pin leaves`
              : 'No pin data yet — log games to see your patterns'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <a
            href="/api/analytics/pin-leaves/export.csv"
            download
            className="btn btn-ghost"
            title="Download all pin leaves as CSV (one row per first-throw leave)"
            style={{ textDecoration: 'none' }}
          >
            📥 Export CSV
          </a>
          <Link to="/stats" className="btn btn-ghost">← Back to Stats</Link>
        </div>
      </div>

      {total === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🎳</div>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 18 }}>No Pin Data Yet</div>
          <div className="muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>
            Pin leaves are recorded automatically when you log games.<br />
            Play a few sessions and check back here.
          </div>
          <Link to="/sessions/new" className="btn btn-primary">Log a Game →</Link>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 10, marginBottom: 18 }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 10, letterSpacing: 0.6, marginBottom: 4 }}>TRACKED THROWS</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#a78bfa' }}>{total}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 10, letterSpacing: 0.6, marginBottom: 4 }}>MOST LEFT</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#fbbf24' }}>{topLeave?.pins ?? '—'}</div>
              <div className="muted" style={{ fontSize: 10 }}>{topLeave?.count ?? 0}x · {topLeave?.pct ?? 0}%</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 10, letterSpacing: 0.6, marginBottom: 4 }}>BEST CONVERSION</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#34d399' }}>{bestConversion?.pins ?? '—'}</div>
              <div className="muted" style={{ fontSize: 10 }}>{bestConversion?.conversionRate ?? 0}%</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 10, letterSpacing: 0.6, marginBottom: 4 }}>NEEDS WORK</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#fc8181' }}>{worstConversion?.pins ?? '—'}</div>
              <div className="muted" style={{ fontSize: 10 }}>{worstConversion?.conversionRate ?? 0}%</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Pin deck */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 700 }}>Pin Deck</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                {selectedLeave
                  ? <>Leave: <b style={{ color: '#fbbf24' }}>{selectedLeave}</b></>
                  : 'Tap a row below to highlight'}
              </div>
              <PinDeckDiagram
                highlighted={selectedLeave ? [selectedLeave] : data?.leaves.slice(0, 3).map(l => l.pins) ?? []}
                size={200}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Back row = 7-8-9-10</div>
            </div>

            {/* Never left */}
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>🎯 Pins Never Left</div>
              {data?.neverLeft.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {data.neverLeft.map(p => (
                    <span key={p} style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.28)', borderRadius: 999, padding: '3px 10px', fontSize: 12, color: '#34d399' }}>
                      {p}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>You've left just about everything!</div>
              )}
            </div>
          </div>

          {/* Monthly trend */}
          {data?.byMonth.length ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>📅 Monthly Trend</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.byMonth.slice(0, 6).map(m => (
                  <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', minWidth: 56, fontFamily: 'monospace' }}>{m.month}</div>
                    <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {m.leaves.map(l => (
                        <span key={l.pins} style={{ background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.28)', borderRadius: 999, padding: '2px 8px', fontSize: 11, color: '#c4b5fd' }}>
                          {l.pins} <span style={{ opacity: 0.65 }}>×{l.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Leaves table */}
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 14 }}>All Pin Leaves</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Pins Left', 'Count', '% of Throws', 'Conversions', 'Conv Rate'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.leaves.map(leave => {
                    const isSelected = selectedLeave === leave.pins
                    return (
                      <tr
                        key={leave.pins}
                        onClick={() => setSelectedLeave(isSelected ? null : leave.pins)}
                        style={{ cursor: 'pointer', background: isSelected ? 'rgba(251,191,36,0.07)' : undefined, transition: 'background 0.15s' }}
                      >
                        <td style={{ padding: '9px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <PinDeckDiagram highlighted={[leave.pins]} size={38} />
                            <span style={{ fontWeight: 600, fontSize: 14, color: isSelected ? '#fbbf24' : 'var(--text)' }}>{leave.pins}</span>
                          </div>
                        </td>
                        <td style={{ padding: '9px 10px', color: 'var(--text)' }}>{leave.count}x</td>
                        <td style={{ padding: '9px 10px', minWidth: 100 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 32 }}>{leave.pct}%</span>
                            <LeaveBar pct={leave.pct} />
                          </div>
                        </td>
                        <td style={{ padding: '9px 10px', color: 'var(--text)' }}>{leave.conversions}</td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ fontSize: 12, color: leave.conversionRate >= 70 ? '#34d399' : leave.conversionRate >= 40 ? '#fbbf24' : '#fc8181' }}>
                            {leave.conversionRate}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}