import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '../hooks/useSettings'

interface StatsFull {
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
    byMonth: any[]
    byLocation: any[]
    scoreDistribution: Record<string, number>
  }
}

interface PerfectGame {
  id: number
  score: number
  date: string
  location: string
  ballUsed?: string
  frameData?: string | null
}

interface SessionGame {
  id: number
  score: number
  date?: string
  createdAt?: string
  location?: string
  sessionLocation?: string
}

function parseFrames(frameData?: string | null): string[] {
  if (!frameData) return []
  try {
    const parsed = JSON.parse(frameData)
    const frames = Array.isArray(parsed?.frames) ? parsed.frames : []
    const mark = (v: number | null | undefined) => {
      if (v == null) return ''
      if (v === 10) return 'X'
      if (v === 0) return '-'
      return String(v)
    }

    return frames.map((f: any, idx: number) => {
      const b1 = f?.ball1
      const b2 = f?.ball2
      const b3 = f?.ball3
      if (idx < 9) {
        if (b1 === 10) return 'X'
        if (b1 == null) return ''
        if (b2 == null) return mark(b1)
        return b1 + b2 === 10 ? `${mark(b1)}/` : `${mark(b1)}${mark(b2)}`
      }
      const first = mark(b1)
      const second = b2 != null ? (b1 !== 10 && b1 + b2 === 10 ? '/' : mark(b2)) : ''
      const third = b3 != null ? (b1 === 10 && b2 != null && b2 < 10 && b2 + b3 === 10 ? '/' : mark(b3)) : ''
      return `${first}${second}${third}`
    })
  } catch {
    return []
  }
}

export default function PublicProfile() {
  const { settings } = useSettings()
  const [stats, setStats] = useState<StatsFull | null>(null)
  const [perfectGames, setPerfectGames] = useState<PerfectGame[]>([])
  const [recentGames, setRecentGames] = useState<SessionGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const [statsRes, perfectRes, sessionsRes] = await Promise.all([
          fetch('/api/stats/full'),
          fetch('/api/games/perfect'),
          fetch('/api/sessions?sort=date&order=desc'),
        ])

        if (!statsRes.ok || !perfectRes.ok || !sessionsRes.ok) {
          throw new Error('Failed to load public profile data')
        }

        const statsJson = await statsRes.json()
        const perfectJson = await perfectRes.json()
        const sessionsJson = await sessionsRes.json()

        if (!mounted) return

        // /api/sessions returns {sessions: [], total, limit, offset} (paginated
        // response). The PublicProfile expects an array of session objects.
        const sessionsList: any[] = Array.isArray(sessionsJson)
          ? sessionsJson
          : (sessionsJson?.sessions ?? [])

        const flatGames: SessionGame[] = (sessionsList || [])
          .flatMap((s: any) => (s.games || []).map((g: any) => ({
            ...g,
            date: s.date,
            location: s.location,
          })))
          .sort((a: SessionGame, b: SessionGame) => {
            const ad = new Date(a.date || a.createdAt || 0).getTime()
            const bd = new Date(b.date || b.createdAt || 0).getTime()
            return bd - ad
          })
          .slice(0, 10)

        setStats(statsJson)
        setPerfectGames(Array.isArray(perfectJson) ? perfectJson : [])
        setRecentGames(flatGames)
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Something went wrong')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [])

  // ── OG / social meta tags ──────────────────────────────────────
  // Personalize the card with the user's name from localStorage settings
  // (falls back to plain "BowlSense" if not set). The ?name= param
  // tells the server to render "X's BowlSense" on the PNG.
  const profileName = (settings?.name || '').trim()
  const profileOgImageUrl = profileName
    ? `/api/profile/og-image?name=${encodeURIComponent(profileName)}`
    : '/api/profile/og-image'
  const profileTitle = profileName ? `${profileName}'s BowlSense` : 'BowlSense'
  const profileDescription = stats
    ? `${stats.overall.totalGames} games · Avg ${Math.round(stats.overall.average)} · High ${stats.overall.high}`
    : 'Bowling stats & perfect games'

  useEffect(() => {
    document.title = profileTitle
    const setMeta = (property: string, content: string, attr: 'property' | 'name' = 'property') => {
      let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, property); document.head.appendChild(el) }
      el.setAttribute('content', content)
    }
    setMeta('og:title', profileTitle)
    setMeta('og:description', profileDescription)
    setMeta('og:image', profileOgImageUrl)
    setMeta('og:image:width', '1200')
    setMeta('og:image:height', '630')
    setMeta('twitter:card', 'summary_large_image')
  }, [profileTitle, profileDescription, profileOgImageUrl])

  const distribution = useMemo(() => {
    const raw = stats?.breakdown?.scoreDistribution || {}
    const total = Object.values(raw).reduce((sum, n) => sum + Number(n || 0), 0)
    // Keys must match what /api/stats/full returns (camel/no-dash form)
    const map = [
      { key: 'sub150', label: 'Sub 150' },
      { key: '150to179', label: '150–179' },
      { key: '180to199', label: '180–199' },
      { key: '200to224', label: '200–224' },
      { key: '225to249', label: '225–249' },
      { key: '250plus', label: '250+' },
    ]

    return map.map((item) => {
      const count = Number(raw[item.key] || 0)
      const pct = total > 0 ? (count / total) * 100 : 0
      return { ...item, count, pct }
    })
  }, [stats])

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div style={{ color: '#fff', padding: 24 }}>Loading public profile...</div>
  if (error || !stats) return <div style={{ color: '#fff', padding: 24 }}>Could not load profile: {error}</div>

  const trendValues = [
    { label: 'Last 5', value: Math.round(stats.trend.last5Avg || 0) },
    { label: 'Last 10', value: Math.round(stats.trend.last10Avg || 0) },
    { label: 'Last 20', value: Math.round(stats.trend.last20Avg || 0) },
  ]
  const trendMax = Math.max(...trendValues.map((t) => t.value), 1)

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, #1c1538 0%, #2a1d56 60%, #15122e 100%)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 18, padding: 20, boxShadow: '0 8px 26px rgba(0,0,0,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'inline-block', background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.4)', color: '#c4b5fd', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                🏆 PUBLIC PROFILE
              </div>
              <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.15 }}>{profileTitle}</h1>
              <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.75)' }}>{stats.overall.totalGames} total games tracked</div>
            </div>
            <button onClick={copyShareLink} className="btn btn-primary" style={{ minHeight: 46, padding: '10px 16px', borderRadius: 12, whiteSpace: 'nowrap' }}>
              {copied ? '✅ Copied!' : '📤 Share Profile'}
            </button>
            <a
              href={profileOgImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ minHeight: 46, padding: '10px 16px', borderRadius: 12, whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              🖼️ Preview Card
            </a>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            { label: 'Average', value: Math.round(stats.overall.average || 0), color: '#a78bfa' },
            { label: 'High Score', value: stats.overall.high || 0, color: '#fbbf24' },
            { label: 'Perfect Games (300s)', value: stats.overall.perfectGames || 0, color: '#fbbf24' },
            { label: 'Total Games', value: stats.overall.totalGames || 0, color: 'rgba(255,255,255,0.85)' },
          ].map((card) => (
            <div key={card.label} style={{ background: '#121228', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }}>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>{card.label}</div>
              <div style={{ marginTop: 8, fontWeight: 800, fontSize: 34, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#121228', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Trend</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {trendValues.map((t) => (
              <div key={t.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 10 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{t.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#a78bfa', marginTop: 4 }}>{t.value}</div>
                <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${(t.value / trendMax) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #7c3aed, #a78bfa)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#121228', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Score Distribution</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {distribution.map((d) => (
              <div key={d.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.78)' }}>{d.label}</span>
                  <span style={{ color: 'rgba(255,255,255,0.65)' }}>{d.pct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${d.pct}%`, height: '100%', background: d.key === '250+' ? '#fbbf24' : '#a78bfa' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {stats.overall.perfectGames > 0 && perfectGames.length > 0 && (
          <div style={{ background: '#121228', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12, color: '#fbbf24' }}>🏆 Perfect Games</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
              {perfectGames.map((g) => {
                const marks = parseFrames(g.frameData)
                return (
                  <div key={g.id} style={{ border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.04)', borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div style={{ fontWeight: 700 }}>{g.location || 'Unknown Alley'}</div>
                      <div style={{ color: '#fbbf24', fontWeight: 800 }}>300</div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                      {new Date(g.date).toLocaleDateString()} {g.ballUsed ? `· 🎳 ${g.ballUsed}` : ''}
                    </div>
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 4 }}>
                      {(marks.length ? marks : Array.from({ length: 10 }, () => 'X')).map((m, i) => (
                        <div key={i} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '6px 0', fontSize: 12 }}>
                          {m || '·'}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ background: '#121228', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Recent Games</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentGames.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{g.location || g.sessionLocation || 'Unknown Alley'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{new Date(g.date || g.createdAt || '').toLocaleDateString()}</div>
                </div>
                <div style={{ fontWeight: 800, color: g.score >= 250 ? '#fbbf24' : '#a78bfa', fontSize: 22 }}>{g.score}</div>
              </div>
            ))}
            {recentGames.length === 0 && <div style={{ color: 'rgba(255,255,255,0.65)' }}>No recent games yet.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
