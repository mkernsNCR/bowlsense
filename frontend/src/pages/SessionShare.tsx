import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  downloadSessionCard,
  nativeShareSession,
} from '../utils/sessionShare'
import { Icon } from '../design'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { useCopyLink } from '../features/competition/useCopyLink'

interface PublicSessionPayload {
  session: {
    id: number
    date: string
    location: string
    lanes?: string | null
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
  const [busy, setBusy] = useState<'share' | 'download' | null>(null)
  const { copied, copyLink } = useCopyLink()

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

  usePublicMetadata({ title, description, imageUrl })

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
    return <PublicShell eyebrow="Session result" title="Loading shared session"><div className="muted">Loading share card…</div></PublicShell>
  }

  if (notFound || !data) {
    return (
      <PublicShell eyebrow="Session result" title="Session not found"><Link to="/">Browse sessions on BowlSense</Link></PublicShell>
    )
  }

  return (
    <PublicShell
      eyebrow="Session result"
      title={`${data.summary.series} series`}
      detail={[data.session.location, data.session.date, data.session.lanes ? `Lanes ${data.session.lanes}` : null].filter(Boolean).join(' · ')}
      action={<button className="btn btn-primary" onClick={shareNative} disabled={busy !== null}><Icon className="competition-action-icon" name="share" /> {busy === 'share' ? 'Sharing…' : 'Share result'}</button>}
    >
      <PublicResult
        score={data.summary.series}
        label={`${data.summary.totalGames}-game series`}
        accessibleLabel={`Series total ${data.summary.series}`}
        facts={[
          { label: 'Average', value: data.summary.average },
          { label: 'High game', value: data.summary.highGame },
          { label: 'Perfect games', value: data.summary.perfectGames },
          { label: 'Game scores', value: data.games.map((game) => game.score).join(' · ') },
        ]}
      />
      <div className="public-share-actions">
        <button className="btn btn-ghost" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
        <button className="btn btn-ghost" onClick={download} disabled={busy !== null}>{busy === 'download' ? 'Downloading…' : 'Download image'}</button>
        <a className="btn btn-ghost" href={imageUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>Open score card</a>
      </div>
    </PublicShell>
  )
}
