import { useMemo, useRef, useState } from 'react'

interface GameScore { score: number | null }

function scoreBucket(score: number): string {
  if (score >= 300) return '300'
  if (score >= 250) return '250-299'
  if (score >= 200) return '200-249'
  if (score >= 150) return '150-199'
  return 'Under 150'
}

function bucketColor(bucket: string): string {
  if (bucket === '300') return '#fbbf24'
  if (bucket === '250-299') return '#a78bfa'
  if (bucket === '200-249') return '#818cf8'
  if (bucket === '150-199') return '#60a5fa'
  return '#94a3b8'
}

export default function ScoreCalculator() {
  const [scores, setScores] = useState<GameScore[]>([
    { score: null },
    { score: null },
    { score: null },
  ])
  const [targetAvg, setTargetAvg] = useState('')
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const validScores = useMemo(() => scores.map(s => s.score).filter((s): s is number => s !== null), [scores])

  const stats = useMemo(() => {
    if (validScores.length === 0) return null
    const total = validScores.reduce((a, b) => a + b, 0)
    const avg = Math.round(total / validScores.length)
    const high = Math.max(...validScores)
    const low = Math.min(...validScores)
    const series = total
    const strikeRate = Math.round((validScores.filter(s => s === 300).length / validScores.length) * 100)
    const sparesRate = Math.round((validScores.filter(s => s >= 200 && s < 300).length / validScores.length) * 100)

    // Score distribution
    const buckets: Record<string, number> = { '300': 0, '250-299': 0, '200-249': 0, '150-199': 0, 'Under 150': 0 }
    validScores.forEach(s => { buckets[scoreBucket(s)]++ })

    return { total, avg, high, low, series, strikeRate, sparesRate, buckets }
  }, [validScores])

  const targetResult = useMemo(() => {
    if (!stats || !targetAvg) return null
    const target = parseFloat(targetAvg)
    if (isNaN(target) || target <= 0) return null
    const gamesNeeded = stats.avg > 0 ? Math.ceil((target * (validScores.length + 1) - stats.total) / (stats.avg - target)) : null
    return { target, gamesNeeded }
  }, [stats, targetAvg, validScores])

  const addGame = () => setScores(s => [...s, { score: null }])
  const removeGame = (idx: number) => setScores(s => s.filter((_, i) => i !== idx))
  const updateScore = (idx: number, val: string) => {
    const n = val === '' ? null : Math.min(300, Math.max(0, parseInt(val) || 0))
    setScores(s => s.map((sc, i) => i === idx ? { score: n } : sc))
  }

  const shareOnX = () => {
    if (!stats) return
    const text = `My bowling stats: ${stats.avg} avg over ${validScores.length} games 🎳${stats.high === 300 ? ' (including a 300!)' : ''}`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadPng = async () => {
    if (!stats) return
    setDownloading(true)
    try {
      const res = await fetch('/api/profile/og-image')
      if (!res.ok) throw new Error('Failed to fetch OG image')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bowlsense-stats-${stats.avg}avg-${validScores.length}games.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed', err)
    } finally {
      setDownloading(false)
    }
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 64 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ paddingTop: 32, marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
            🎯 Tools
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 900 }}>Score Calculator</h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Calculate averages, project scores, share results.</p>
        </div>

        {/* Score Inputs */}
        <div style={{ background: '#121228', borderRadius: 20, padding: 24, marginBottom: 20, border: '1px solid rgba(167,139,250,0.15)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 16 }}>
            Enter Game Scores
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
            {scores.map((sc, idx) => (
              <div key={idx} style={{ position: 'relative' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, fontWeight: 600 }}>
                  Game {idx + 1}
                </div>
                <input
                  type="number"
                  min={0}
                  max={300}
                  placeholder="Score"
                  value={sc.score === null ? '' : sc.score}
                  onChange={e => updateScore(idx, e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(167,139,250,0.25)',
                    borderRadius: 12, padding: '10px 36px 10px 14px',
                    color: '#fff', fontSize: 20, fontWeight: 800, outline: 'none',
                    textAlign: 'center',
                  }}
                />
                {scores.length > 1 && (
                  <button
                    onClick={() => removeGame(idx)}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
                      cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2,
                    }}
                    aria-label={`Remove game ${idx + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addGame}
            style={{
              background: 'none', border: '1px dashed rgba(167,139,250,0.4)',
              borderRadius: 12, padding: '10px 20px', color: '#a78bfa',
              fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%',
              transition: 'border-color 0.2s, color 0.2s',
            }}
          >
            + Add Game
          </button>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Average', value: stats.avg, accent: '#fff' },
              { label: 'Series', value: stats.series, accent: '#a78bfa' },
              { label: 'High Game', value: stats.high, accent: '#fbbf24' },
              { label: 'Low Game', value: stats.low, accent: '#94a3b8' },
              { label: 'Strike Rate', value: `${stats.strikeRate}%`, accent: '#fbbf24' },
              { label: 'Games', value: validScores.length, accent: '#a78bfa' },
            ].map(({ label, value, accent }) => (
              <div key={label} style={{
                background: '#121228', borderRadius: 16,
                border: '1px solid rgba(167,139,250,0.15)',
                padding: '16px 14px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>
                  {label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: accent, lineHeight: 1.1 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Score Distribution */}
        {stats && (
          <div style={{ background: '#121228', borderRadius: 20, padding: 24, marginBottom: 20, border: '1px solid rgba(167,139,250,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 16 }}>
              Score Distribution
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(stats.buckets).map(([bucket, count]) => {
                const barWidth = stats ? Math.round((count / validScores.length) * 100) : 0
                return (
                  <div key={bucket}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: bucketColor(bucket), fontWeight: 700 }}>{bucket}</span>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{count} game{count !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                      <div style={{
                        width: `${barWidth}%`, height: '100%',
                        background: bucketColor(bucket),
                        borderRadius: 6, transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Target Calculator */}
        {stats && (
          <div style={{ background: '#121228', borderRadius: 20, padding: 24, marginBottom: 20, border: '1px solid rgba(167,139,250,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 16 }}>
              🎯 Target Average Calculator
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6, fontWeight: 600 }}>Target Average</div>
                <input
                  type="number"
                  placeholder="e.g. 215"
                  value={targetAvg}
                  onChange={e => setTargetAvg(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(167,139,250,0.25)',
                    borderRadius: 12, padding: '10px 14px',
                    color: '#fff', fontSize: 18, fontWeight: 700, outline: 'none',
                  }}
                />
              </div>
              {targetResult && (
                <div style={{
                  background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)',
                  borderRadius: 14, padding: '14px 20px',
                }}>
                  {targetResult.gamesNeeded && targetResult.gamesNeeded > 0 ? (
                    <>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Need to score</div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#a78bfa', lineHeight: 1.1 }}>
                        {Math.round(targetResult.gamesNeeded * targetResult.target / 1)} pins
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                        on your next game to hit {targetResult.target} avg
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 15, color: '#34d399', fontWeight: 700 }}>
                      Already averaging {targetResult.target}+! 🎉
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Share */}
        {stats && (
          <div style={{ background: '#121228', borderRadius: 20, padding: 24, border: '1px solid rgba(167,139,250,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 16 }}>
              📤 Share Your Stats
            </div>
            <div ref={cardRef} style={{ display: 'none' }}>
              {/* Hidden card for potential future canvas capture */}
              <div style={{ width: 800, padding: 40, background: '#0d0d1a', color: '#fff' }}>
                <div style={{ fontSize: 48, fontWeight: 900 }}>{stats.avg} avg</div>
                <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.7)' }}>{validScores.length} games · High: {stats.high}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={shareOnX}
                style={{
                  background: '#7c3aed', border: 'none', borderRadius: 12,
                  padding: '12px 24px', color: '#fff', fontWeight: 800, fontSize: 14,
                  cursor: 'pointer', flex: 1, minWidth: 140,
                }}
              >
                𝕏 Share on X
              </button>
              <button
                onClick={handleDownloadPng}
                disabled={downloading}
                style={{
                  background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)',
                  borderRadius: 12, padding: '12px 24px', color: '#c4b5fd', fontWeight: 800, fontSize: 14,
                  cursor: downloading ? 'wait' : 'pointer', flex: 1, minWidth: 140,
                }}
              >
                {downloading ? '⏳ Saving...' : '⬇️ Download PNG'}
              </button>
              <button
                onClick={handleCopyLink}
                style={{
                  background: copied ? '#34d399' : 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 12, padding: '12px 24px', color: copied ? '#0d0d1a' : '#fff',
                  fontWeight: 800, fontSize: 14, cursor: 'pointer', flex: 1, minWidth: 140,
                  transition: 'background 0.2s',
                }}
              >
                {copied ? '✅ Copied!' : '📋 Copy Link'}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!stats && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            Enter at least one game score above to see your stats 🎳
          </div>
        )}
      </div>
    </div>
  )
}