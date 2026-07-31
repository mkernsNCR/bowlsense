import { useEffect, useState } from 'react'
import { ActionIcon, PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { copyText } from '../features/scoring/copyText'

interface PublicStats {
  average: number
  generatedAt?: string
  profileName?: string | null
  strikeRate: number
  spareRate: number
  totalGames: number
  totalScore?: number
}

export default function PublicProfile() {
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch('/api/stats')
      .then((response) => {
        if (!response.ok) throw new Error('Public statistics are unavailable')
        return response.json() as Promise<PublicStats>
      })
      .then((payload) => { if (mounted) setStats(payload) })
      .catch((caught: unknown) => {
        if (mounted) setError(caught instanceof Error ? caught.message : 'Public statistics are unavailable')
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const profileName = (stats?.profileName || '').trim()
  const profileTitle = profileName ? `${profileName}'s BowlSense` : 'BowlSense profile'
  const profileDescription = stats
    ? `${stats.totalGames} games · ${Math.round(stats.average)} average`
    : 'Bowling statistics'
  const profileOgImageUrl = profileName
    ? `/api/profile/og-image?name=${encodeURIComponent(profileName)}`
    : '/api/profile/og-image'
  const generatedAt = stats?.generatedAt && !Number.isNaN(Date.parse(stats.generatedAt))
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(stats.generatedAt))
    : null

  usePublicMetadata({ title: profileTitle, description: profileDescription, imageUrl: profileOgImageUrl })

  const copyShareLink = async () => {
    try {
      await copyText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  if (loading) return <PublicShell eyebrow="Public profile" title="Loading public profile"><p className="muted">Loading public profile…</p></PublicShell>
  if (error || !stats) return <PublicShell eyebrow="Public profile" title="Public profile unavailable"><p role="alert">{error || 'Public profile not found'}</p></PublicShell>

  return (
    <PublicShell
      eyebrow="Public profile"
      title={profileTitle}
      detail={`${stats.totalGames} games tracked${generatedAt ? ` · Stats current as of ${generatedAt}` : ''}`}
      action={<button onClick={copyShareLink} className="btn btn-primary"><ActionIcon name="share" /> {copied ? 'Link copied' : 'Share profile'}</button>}
    >
      <PublicResult
        score={Math.round(stats.average)}
        label="Career average"
        accessibleLabel={`Bowling average ${Math.round(stats.average)}`}
        facts={[
          { label: 'Games tracked', value: stats.totalGames },
          { label: 'Strike rate', value: `${stats.strikeRate}%` },
          { label: 'Spare rate', value: `${stats.spareRate}%` },
          ...(stats.totalScore != null ? [{ label: 'Total pins', value: stats.totalScore.toLocaleString() }] : []),
        ]}
      />
      <p className="muted" style={{ maxWidth: 620, margin: '18px 0 0', lineHeight: 1.6 }}>
        This shared profile contains aggregate performance only. Session locations, equipment details, and private notes stay private.
      </p>
    </PublicShell>
  )
}
