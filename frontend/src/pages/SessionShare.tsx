import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  copySessionShareLink,
  downloadSessionCard,
  nativeShareSession,
} from '../utils/sessionShare'

interface PublicSessionPayload {
  session: {
    id: number
    date: string
    location: string
    lanes?: string | null
    notes?: string | null
  }
  summary: {
    totalGames: number
    series: number
    average: number
    highGame: number
    perfectGames: number
  }
  games: {
    id: number
    gameNumber: number
    score: number
    strikes: number
    spares: number
    splits: number
  }[]
}

export default function SessionShare() {
  const { id } = useParams()
  const sessionId = Number(id)
  const [data, setData] = useState<PublicSessionPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<'share' | 'download' | null>(null)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!Number.isFinite(sessionId)) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setLoading(true)
      setNotFound(false)
      try {
        const res = await fetch(`/api/sessions/${sessionId}/public`)
        if (!res.ok) {
          if (res.status === 404 && mounted) setNotFound(true)
          return
        }
        const json = await res.json()
        if (mounted) setData(json)
      } catch {
        if (mounted) setNotFound(true)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    run()
    return () => {
      mounted = false
    }
  }, [sessionId])

  const title = useMemo(() => {
    if (!data) return 'BowlSense Session Share'
    return `Session ${data.summary.series} series @ ${data.session.location || 'BowlSense'}`
  }, [data])

  const description = useMemo(() => {
    if (!data) return 'BowlSense'
    return `${data.summary.totalGames} games · Avg ${data.summary.average} · High ${data.summary.highGame}`
  }, [data])

  const imageUrl = useMemo(() => (Number.isFinite(sessionId) ? `/api/sessions/${sessionId}/og-image` : ''), [sessionId])

  useEffect(() => {
    document.title = title

    const setMeta = (property: string, content: string, attr: 'property' | 'name' = 'property') => {
      let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, property)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    setMeta('og:title', title)
    setMeta('og:description', description)
    if (imageUrl) setMeta('og:image', imageUrl)
    setMeta('og:image:width', '1200')
    setMeta('og:image:height', '630')
    setMeta('twitter:card', 'summary_large_image')
  }, [title, description, imageUrl])

  const copyLink = async () => {
    if (!Number.isFinite(sessionId)) return
    await copySessionShareLink(sessionId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const shareNative = async () => {
    if (!Number.isFinite(sessionId)) return
    setBusy('share')
    const outcome = await nativeShareSession({
      sessionId,
      filename: `bowlsense-session-${sessionId}.png`,
      title: 'BowlSense Session',
      text: description,
    })
    setBusy(null)
    if (outcome === 'unsupported') await copyLink()
  }

  const download = async () => {
    if (!Number.isFinite(sessionId)) return
    setBusy('download')
    await downloadSessionCard(sessionId, `bowlsense-session-${sessionId}.png`)
    setBusy(null)
  }

  if (loading) {
    return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }} className="muted">Loading share card...</div>
  }

  if (notFound || !data) {
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>Session not found</h1>
          <Link to="/sessions" className="btn btn-primary">Back to Sessions</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', paddingBottom: 64 }}>
      <h1 style={{ marginBottom: 6, fontSize: 'clamp(1.5rem, 5vw, 2.2rem)' }}>🎳 Session Share</h1>
      <div className="muted" style={{ marginBottom: 14 }}>{description}</div>

      <div className="card" style={{ padding: 10, marginBottom: 12 }}>
        <img src={imageUrl} alt="Session share card" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={shareNative} disabled={busy !== null}>{busy === 'share' ? 'Sharing...' : '📤 Share'}</button>
        <button className="btn btn-ghost" onClick={copyLink}>{copied ? '✅ Copied' : '🔗 Copy Link'}</button>
        <button className="btn btn-ghost" onClick={download} disabled={busy !== null}>{busy === 'download' ? 'Downloading...' : '⬇️ Download PNG'}</button>
        <a className="btn btn-ghost" href={imageUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🖼️ Open Card</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <div className="card" style={{ textAlign: 'center', padding: 10 }}><div className="muted" style={{ fontSize: 11 }}>Games</div><div style={{ fontWeight: 800, fontSize: 24 }}>{data.summary.totalGames}</div></div>
        <div className="card" style={{ textAlign: 'center', padding: 10 }}><div className="muted" style={{ fontSize: 11 }}>Series</div><div style={{ fontWeight: 800, fontSize: 24 }}>{data.summary.series}</div></div>
        <div className="card" style={{ textAlign: 'center', padding: 10 }}><div className="muted" style={{ fontSize: 11 }}>Average</div><div style={{ fontWeight: 800, fontSize: 24 }}>{data.summary.average}</div></div>
        <div className="card" style={{ textAlign: 'center', padding: 10 }}><div className="muted" style={{ fontSize: 11 }}>High</div><div style={{ fontWeight: 800, fontSize: 24 }}>{data.summary.highGame}</div></div>
      </div>
    </div>
  )
}
