import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  copySessionShareLink,
  downloadSessionCard,
  nativeShareSession,
} from '../utils/sessionShare'
import { ActionIcon, PublicShell } from '../features/competition/CompetitionUI'

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
    const ok = await nativeShareSession({
      sessionId,
      filename: `bowlsense-session-${sessionId}.png`,
      title: 'BowlSense Session',
      text: description,
    })
    setBusy(null)
    if (!ok) copyLink()
  }

  const download = async () => {
    if (!Number.isFinite(sessionId)) return
    setBusy('download')
    await downloadSessionCard(sessionId, `bowlsense-session-${sessionId}.png`)
    setBusy(null)
  }

  if (loading) {
    return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }} className="muted">Loading share card…</div>
  }

  if (notFound || !data) {
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>Session not found</h1>
          <Link to="/" className="btn btn-primary">BowlSense home</Link>
        </div>
      </div>
    )
  }

  return (
    <PublicShell
      eyebrow="Session result"
      title={`${data.summary.series} series`}
      detail={[data.session.location, data.session.date, data.session.lanes ? `Lanes ${data.session.lanes}` : null].filter(Boolean).join(' · ')}
      action={<button className="btn btn-primary" onClick={shareNative} disabled={busy !== null}><ActionIcon name="share" /> {busy === 'share' ? 'Sharing…' : 'Share result'}</button>}
    >
      <div className="share-result">
        <section className="share-result__primary" aria-label={`Series total ${data.summary.series}`}>
          <div><div className="share-result__score">{data.summary.series}</div><div className="share-result__label">{data.summary.totalGames}-game series</div></div>
        </section>
        <dl className="share-result__facts">
          <div className="share-result__fact"><dt>Average</dt><dd>{data.summary.average}</dd></div>
          <div className="share-result__fact"><dt>High game</dt><dd>{data.summary.highGame}</dd></div>
          <div className="share-result__fact"><dt>Perfect games</dt><dd>{data.summary.perfectGames}</dd></div>
          <div className="share-result__fact"><dt>Game scores</dt><dd>{data.games.map((game) => game.score).join(' · ')}</dd></div>
        </dl>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
        <button className="btn btn-ghost" onClick={download} disabled={busy !== null}>{busy === 'download' ? 'Downloading…' : 'Download image'}</button>
        <a className="btn btn-ghost" href={imageUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>Open score card</a>
      </div>
    </PublicShell>
  )
}
