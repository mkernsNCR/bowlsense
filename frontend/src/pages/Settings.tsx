import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSettings } from '../hooks/useSettings'
import type { Settings } from '../hooks/useSettings'

interface Ball {
  id: number
  name: string
  brand: string
}

interface BackupFile {
  filename: string
  timestamp: string
  size: number
  mtime: string
}

interface BackupsResponse {
  backups: BackupFile[]
  latestMtime: string | null
  backupCount: number
  cloudRemote?: string | null
}

interface DataHealthResponse {
  generatedAt: string
  dbFile: {
    exists: boolean
    path: string
    sizeBytes: number
    mtime: string | null
    ageMinutes: number | null
  }
  tableCounts: { table: string; count: number }[]
  backupHealth: {
    count: number
    latest: BackupFile | null
    latestAgeHours: number | null
    hasRecentBackup: boolean
  }
  warnings: string[]
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatTimestamp(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { settings, setSettings } = useSettings()
  const [form, setForm] = useState<Settings>({ ...settings })
  const [saved, setSaved] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [profileCopied, setProfileCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const [csvMsg, setCsvMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [seedMsg, setSeedMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [seedLoading, setSeedLoading] = useState(false)
  const [confirmSeed, setConfirmSeed] = useState(false)

  function handleCSvClick() {
    csvRef.current?.click()
  }

  async function handleCSVChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setCsvMsg(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/import/csv', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      const { sessions, games, balls } = data.imported
      qc.invalidateQueries()
      setCsvMsg({ ok: true, text: `✅ Imported ${games} games across ${sessions} sessions (${balls} new balls).` })
    } catch (err: any) {
      setCsvMsg({ ok: false, text: err?.message || 'Import failed. Check CSV format.' })
    }
  }

  async function handleSeed() {
    setConfirmSeed(false)
    setSeedLoading(true)
    setSeedMsg(null)
    try {
      const res = await fetch('/api/admin/seed-demo', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || data.output || 'Seed failed')
      qc.invalidateQueries()
      setSeedMsg({ ok: true, text: `🌱 Demo data seeded.\n${data.output || ''}` })
    } catch (err: any) {
      setSeedMsg({ ok: false, text: err?.message || 'Seed failed' })
    } finally {
      setSeedLoading(false)
    }
  }

  async function handleWipeDemo() {
    setSeedLoading(true)
    setSeedMsg(null)
    try {
      const res = await fetch('/api/admin/wipe-demo', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Wipe failed')
      qc.invalidateQueries()
      setSeedMsg({ ok: true, text: '🧹 Demo rows cleared.' })
    } catch (err: any) {
      setSeedMsg({ ok: false, text: err?.message || 'Wipe failed' })
    } finally {
      setSeedLoading(false)
    }
  }

  const { data: balls } = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => fetch('/api/balls').then(r => r.json()),
  })

  const { data: backups, refetch: refetchBackups } = useQuery<BackupsResponse>({
    queryKey: ['backups'],
    queryFn: () => fetch('/api/backups').then(r => r.json()),
    refetchInterval: false,
  })

  const { data: dataHealth, refetch: refetchDataHealth, isFetching: dataHealthLoading } = useQuery<DataHealthResponse>({
    queryKey: ['data-health'],
    queryFn: () => fetch('/api/data-health').then(r => r.json()),
    refetchInterval: false,
  })

  async function handleRunBackup() {
    setBackupMsg(null)
    try {
      const res = await fetch('/api/backups', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setBackupMsg({ ok: true, text: data.output })
      refetchBackups()
    } catch (err: any) {
      setBackupMsg({ ok: false, text: err?.message || 'Backup failed' })
    }
  }

  const f = (field: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  function handleSave() {
    setSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleShareProfile() {
    await navigator.clipboard.writeText(window.location.origin + '/bowl')
    setProfileCopied(true)
    setTimeout(() => setProfileCopied(false), 2000)
  }

  // Live URL for the public profile (uses current display name from settings)
  const publicProfileUrl = (() => {
    if (typeof window === 'undefined') return ''
    const base = window.location.origin + '/bowl'
    const encoded = encodeURIComponent((settings.name || '').trim())
    return encoded ? `${base}?name=${encoded}` : base
  })()
  const publicProfileOgUrl = (() => {
    const encoded = encodeURIComponent((settings.name || '').trim())
    return encoded
      ? `/profile/og-image?name=${encoded}`
      : '/profile/og-image'
  })()

  // Tiny SVG QR-style pattern generator (visual only — not a real QR code)
  // Used as a visual cue; real QR would need a lib. This is enough to make
  // the share card feel polished and copy-able.
  function buildQrPattern(text: string): boolean[][] {
    // 21x21 grid, pseudo-random based on text hash for stable output
    let h = 0
    for (let i = 0; i < text.length; i++) {
      h = (h * 31 + text.charCodeAt(i)) >>> 0
    }
    const grid: boolean[][] = []
    for (let y = 0; y < 21; y++) {
      const row: boolean[] = []
      for (let x = 0; x < 21; x++) {
        h = (h * 1103515245 + 12345) >>> 0
        const on = (h & 0xff) > 128
        // Reserve 3 finder squares at corners
        const inFinder =
          (x < 7 && y < 7) ||
          (x >= 14 && y < 7) ||
          (x < 7 && y >= 14)
        row.push(inFinder ? false : on)
      }
      grid.push(row)
    }
    // Draw finder patterns
    const drawFinder = (ox: number, oy: number) => {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const on =
            dy === 0 || dy === 6 ||
            dx === 0 || dx === 6 ||
            (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4)
          grid[oy + dy][ox + dx] = on
        }
      }
    }
    drawFinder(0, 0)
    drawFinder(14, 0)
    drawFinder(0, 14)
    return grid
  }

  const qrCells = buildQrPattern(publicProfileUrl)

  function handleShareProfileX() {
    const name = (settings.name || '').trim()
    const text = name
      ? `${name}'s bowling stats — avg, high, and 300s on BowlSense 🎳`
      : `My bowling stats on BowlSense 🎳`
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(publicProfileUrl)}`
    window.open(tweetUrl, '_blank', 'noopener,noreferrer')
  }

  async function handleShareProfileNative() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'My BowlSense Profile',
          text: (settings.name || '').trim()
            ? `${settings.name}'s bowling stats — BowlSense 🎳`
            : 'My bowling stats — BowlSense 🎳',
          url: publicProfileUrl,
        })
        return
      } catch {
        // Fall through to copy
      }
    }
    await handleShareProfile()
  }

  async function handleExport() {
    try {
      const res = await fetch('/api/backup')
      const data = await res.json()
      const date = new Date().toISOString().split('T')[0]
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bowling-backup-${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setImportMsg({ ok: false, text: 'Export failed.' })
    }
  }

  function handleImportClick() {
    fileRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Server error')
      const result = await res.json()
      const { sessions, games, balls } = result.imported
      qc.invalidateQueries()
      setImportMsg({ ok: true, text: `Imported ${sessions} sessions, ${games} games, ${balls} balls.` })
    } catch {
      setImportMsg({ ok: false, text: 'Import failed. Check file format.' })
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ marginBottom: 20 }}>Settings</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Profile</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Your Name</div>
            <input type="text" placeholder="e.g. Alex" value={form.name} onChange={f('name')} />
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Home Lanes (default location)</div>
            <input type="text" placeholder="e.g. Sunset Lanes" value={form.homeLanes} onChange={f('homeLanes')} />
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Default Ball</div>
            <select value={form.defaultBallId} onChange={(e) => setForm(prev => ({ ...prev, defaultBallId: e.target.value }))}>
              <option value="">No default</option>
              {balls?.map((ball) => (
                <option key={ball.id} value={String(ball.id)}>
                  {ball.name}{ball.brand ? ` (${ball.brand})` : ''}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleSave} className="btn btn-primary" style={{ marginTop: 4, minHeight: 50 }}>
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(167,139,250,0.25)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>🔗 Public Profile</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Anyone with this link can see your lifetime stats (avg, high, 300s) — no login required. Set your name above to personalize the link.
        </div>

        {/* OG card preview — what social media scrapers will see */}
        <div
          style={{
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid rgba(167,139,250,0.3)',
            marginBottom: 14,
            background: '#0d0d1a',
          }}
        >
          <img
            src={publicProfileOgUrl}
            alt="Public profile preview"
            style={{ width: '100%', display: 'block', aspectRatio: '1200 / 630', objectFit: 'cover' }}
          />
        </div>

        {/* QR-style pattern + URL display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 96,
              height: 96,
              background: '#fff',
              borderRadius: 12,
              padding: 6,
              display: 'grid',
              gridTemplateColumns: 'repeat(21, 1fr)',
              gridTemplateRows: 'repeat(21, 1fr)',
            }}
          >
            {qrCells.map((row, y) =>
              row.map((on, x) => (
                <div
                  key={`${x}-${y}`}
                  style={{
                    background: on ? '#0d0d1a' : 'transparent',
                    borderRadius: x === 0 || y === 0 ? '1px' : 0,
                  }}
                />
              ))
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>YOUR PUBLIC URL</div>
            <div
              style={{
                fontSize: 13,
                fontFamily: 'monospace',
                background: 'rgba(167,139,250,0.08)',
                border: '1px solid rgba(167,139,250,0.25)',
                borderRadius: 10,
                padding: '8px 10px',
                wordBreak: 'break-all',
                color: 'var(--accent)',
              }}
            >
              {publicProfileUrl}
            </div>
          </div>
        </div>

        {/* Share actions: native + copy + X */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            onClick={handleShareProfileNative}
            className="btn btn-primary"
            style={{ minHeight: 48 }}
          >
            📤 Share
          </button>
          <button
            onClick={handleShareProfile}
            className="btn btn-ghost"
            style={{ minHeight: 48 }}
          >
            {profileCopied ? '✅ Copied!' : '🔗 Copy Link'}
          </button>
        </div>
        <button
          onClick={handleShareProfileX}
          className="btn btn-ghost"
          style={{ width: '100%', minHeight: 44, marginTop: 8 }}
        >
          𝕏 Share on X
        </button>

        <Link
          to="/bowl"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost"
          style={{
            display: 'block',
            textAlign: 'center',
            textDecoration: 'none',
            minHeight: 40,
            marginTop: 8,
            fontSize: 13,
          }}
        >
          👁️ Open Public Profile Preview →
        </Link>
      </div>

      {/* ── CSV Score Import ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(52,211,153,0.25)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>📊 CSV Score Import</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Upload a CSV with columns: <code style={{ fontSize: 12, color: 'var(--accent)' }}>date, score, [location, game_number, ball]</code>. Games are automatically grouped into sessions by date+location.
        </div>
        <button onClick={handleCSvClick} className="btn btn-primary" style={{ width: '100%', minHeight: 50, background: '#059669', borderColor: '#059669' }}>
          📥 Import Scores from CSV
        </button>
        <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCSVChange} />
        {csvMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            marginTop: 10,
            background: csvMsg.ok ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
            color: csvMsg.ok ? '#34d399' : '#fc8181',
            border: `1px solid ${csvMsg.ok ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {csvMsg.text}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          <strong>Example CSV:</strong><br />
          date,location,game_number,score,ball<br />
          2026-03-14,Maple Lanes,1,257,Radiant Pearl<br />
          2026-03-14,Maple Lanes,2,245,Radiant Pearl<br />
          2026-03-21,Maple Lanes,1,234,Dark Volt
        </div>
      </div>

      {/* ── Demo Data Seed (NEW 2026-08-20) ─────────────────────── */}
      <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(251,191,36,0.35)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>🌱 Demo Data</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Populate BowlSense with 12 weeks of Michelob Ultra League data + 3 practice sessions + 2 perfect games — enough to demo every screen (Dashboard, Tonight's League, Stats, Pin Leaves, Perfect Games, League Recap).
        </div>
        {!confirmSeed ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setConfirmSeed(true)}
              disabled={seedLoading}
              className="btn btn-primary"
              style={{ flex: 1, minHeight: 50, background: '#d97706', borderColor: '#d97706' }}
            >
              {seedLoading ? '⏳ Seeding…' : '🌱 Seed Demo Data'}
            </button>
            <button
              onClick={handleWipeDemo}
              disabled={seedLoading}
              className="btn btn-ghost"
              style={{ minHeight: 50, padding: '0 14px' }}
              title="Remove all demo rows"
            >
              🧹
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#fbbf24', padding: '8px 12px', borderRadius: 10, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }}>
              ⚠️ This will <strong>wipe and replace</strong> all existing demo rows (sessions/games/league_weeks tagged [DEMO]). Real data (non-[DEMO]) is safe.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSeed}
                disabled={seedLoading}
                className="btn btn-primary"
                style={{ flex: 1, minHeight: 50, background: '#d97706', borderColor: '#d97706' }}
              >
                {seedLoading ? '⏳ Seeding…' : '✅ Confirm Reseed'}
              </button>
              <button
                onClick={() => setConfirmSeed(false)}
                disabled={seedLoading}
                className="btn btn-ghost"
                style={{ minHeight: 50, padding: '0 14px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {seedMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 12,
            marginTop: 10,
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            background: seedMsg.ok ? 'rgba(251,191,36,0.12)' : 'rgba(239,68,68,0.12)',
            color: seedMsg.ok ? '#fbbf24' : '#fc8181',
            border: `1px solid ${seedMsg.ok ? 'rgba(251,191,36,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {seedMsg.text}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          Demo rows are tagged with <code style={{ fontSize: 11 }}>[DEMO]</code> in notes so they can be cleanly wiped without touching real data.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Data</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={handleExport} className="btn btn-ghost" style={{ width: '100%', minHeight: 50 }}>
            Export Backup (JSON)
          </button>
          <button onClick={handleImportClick} className="btn btn-ghost" style={{ width: '100%', minHeight: 50 }}>
            Import Backup (JSON)
          </button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
          {importMsg && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 12,
              fontSize: 13,
              background: importMsg.ok ? 'rgba(167,139,250,0.12)' : 'rgba(239,68,68,0.12)',
              color: importMsg.ok ? 'var(--accent)' : 'var(--danger)',
              border: `1px solid ${importMsg.ok ? 'rgba(167,139,250,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              {importMsg.text}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700 }}>🩺 Data Health</div>
          <button
            onClick={() => refetchDataHealth()}
            className="btn btn-ghost"
            style={{ minHeight: 32, padding: '4px 10px', borderRadius: 8, fontSize: 12 }}
          >
            {dataHealthLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {dataHealth && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Checked {formatTimestamp(dataHealth.generatedAt)}</div>
            <div style={{ fontSize: 13 }}>
              <div><strong>Active DB:</strong> <code style={{ fontSize: 12 }}>{dataHealth.dbFile.path}</code></div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {dataHealth.dbFile.exists ? `${formatBytes(dataHealth.dbFile.sizeBytes)} · updated ${dataHealth.dbFile.mtime ? formatTimestamp(dataHealth.dbFile.mtime) : 'unknown'}` : 'Database file not found'}
              </div>
            </div>

            <div style={{ fontSize: 13 }}>
              <div><strong>Row counts</strong></div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {dataHealth.tableCounts.map((t) => `${t.table}: ${t.count >= 0 ? t.count : 'N/A'}`).join(' · ')}
              </div>
            </div>

            <div style={{ fontSize: 13 }}>
              <div><strong>Backups:</strong> {dataHealth.backupHealth.count}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {dataHealth.backupHealth.latest
                  ? `Latest ${dataHealth.backupHealth.latest.filename} (${formatTimestamp(dataHealth.backupHealth.latest.mtime)})`
                  : 'No backup files found'}
              </div>
            </div>

            {dataHealth.warnings.length > 0 && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 13,
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}>
                {dataHealth.warnings.map((w) => `• ${w}`).join(' ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DB Backup ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700 }}>💾 Database Backup</div>
          {backups?.latestMtime && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Last backup: {formatTimestamp(backups.latestMtime)}
            </div>
          )}
        </div>

        <button
          onClick={handleRunBackup}
          className="btn btn-primary"
          style={{ width: '100%', minHeight: 50, marginBottom: backupMsg ? 12 : 0 }}
        >
          🔄 Run Backup Now
        </button>

        {backupMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            marginBottom: 12,
            background: backupMsg.ok ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
            color: backupMsg.ok ? '#34d399' : '#fc8181',
            border: `1px solid ${backupMsg.ok ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {backupMsg.text}
          </div>
        )}

        {backups && backups.backups.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              {backups.backupCount} backup{backups.backupCount !== 1 ? 's' : ''} stored on Pi
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {backups.backups.slice(0, 7).map((b) => (
                <div key={b.filename} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.filename}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {formatTimestamp(b.mtime)} · {formatBytes(b.size)}
                    </div>
                  </div>
                  <a
                    href={`/api/backups/${b.filename}`}
                    download
                    className="btn btn-ghost"
                    style={{ minHeight: 30, padding: '4px 10px', borderRadius: 8, fontSize: 12, textDecoration: 'none' }}
                  >
                    ⬇
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {backups && backups.backupCount === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
            No backups yet. Click "Run Backup Now" to create your first one.
          </div>
        )}

        {/* ── Cloud Sync Status ─────────────────────── */}
        {backups && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>☁️ Cloud Sync</div>
              {backups.cloudRemote ? (
                <div style={{ fontSize: 11, color: '#34d399', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 999, padding: '2px 8px' }}>
                  {backups.cloudRemote}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>
                  Not configured
                </div>
              )}
            </div>
            {backups.cloudRemote ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Backups sync automatically after each backup run to{' '}
                <code style={{ fontSize: 11 }}>{backups.cloudRemote}/backups</code>. Verify uploads on your cloud provider.
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                To enable cloud sync: set <code style={{ fontSize: 11, color: 'var(--accent)' }}>CLOUD_REMOTE=your-remote:path</code> in your crontab or <code style={{ fontSize: 11 }}>~/.bashrc</code>, then restart the app.
                Requires rclone installed and configured on the Pi. Example crontab:
                <br />
                <code style={{ fontSize: 11, color: 'rgba(167,139,250,0.8)' }}>0 2 * * * CLOUD_REMOTE=gds: bash /home/mkerns/bowling-tracker/backend/scripts/backup.sh</code>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', paddingBottom: 8 }}>
        <Link to="/help" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 14 }}>
          Need help? View Help &amp; FAQ ❓
        </Link>
      </div>
    </div>
  )
}
