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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
  return response.json() as Promise<T>
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
    } catch (error: unknown) {
      setCsvMsg({ ok: false, text: errorMessage(error, 'Import failed. Check CSV format.') })
    }
  }

  const { data: balls } = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => fetchJson<Ball[]>('/api/balls'),
  })

  const { data: backups, refetch: refetchBackups } = useQuery<BackupsResponse>({
    queryKey: ['backups'],
    queryFn: () => fetchJson<BackupsResponse>('/api/backups'),
    refetchInterval: false,
  })

  const { data: dataHealth, refetch: refetchDataHealth, isFetching: dataHealthLoading } = useQuery<DataHealthResponse>({
    queryKey: ['data-health'],
    queryFn: () => fetchJson<DataHealthResponse>('/api/data-health'),
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
    } catch (error: unknown) {
      setBackupMsg({ ok: false, text: errorMessage(error, 'Backup failed') })
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

  async function handleExport() {
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error('Export failed')
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
      const res = await fetch('/api/import', {
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
            <label htmlFor="settings-name" className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Your Name</label>
            <input id="settings-name" type="text" placeholder="e.g. Alex" value={form.name} onChange={f('name')} />
          </div>
          <div>
            <label htmlFor="settings-home-lanes" className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Home Lanes (default location)</label>
            <input id="settings-home-lanes" type="text" placeholder="e.g. Sunset Lanes" value={form.homeLanes} onChange={f('homeLanes')} />
          </div>
          <div>
            <label htmlFor="settings-default-ball" className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Default Ball</label>
            <select id="settings-default-ball" value={form.defaultBallId} onChange={(e) => setForm(prev => ({ ...prev, defaultBallId: e.target.value }))}>
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

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Public profile</div>
        <button onClick={handleShareProfile} className="btn btn-ghost" style={{ width: '100%', minHeight: 50 }}>
          {profileCopied ? 'Link copied' : 'Share public profile'}
        </button>
      </div>

      {/* ── CSV Score Import ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16, border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>CSV score import</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Upload a CSV with columns: <code style={{ fontSize: 12, color: 'var(--accent)' }}>date, score, [location, game_number, ball]</code>. Games are automatically grouped into sessions by date+location.
        </div>
        <button onClick={handleCSvClick} className="btn btn-primary" style={{ width: '100%', minHeight: 50, background: 'var(--success)', borderColor: 'var(--success)', color: 'var(--on-tint)' }}>
          Import scores from CSV
        </button>
        <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCSVChange} />
        {csvMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            marginTop: 10,
            background: csvMsg.ok ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'color-mix(in srgb, var(--danger) 12%, transparent)',
            color: csvMsg.ok ? 'var(--success)' : 'var(--danger)',
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
          <div style={{ fontWeight: 700 }}>Data health</div>
          <button
            onClick={() => refetchDataHealth()}
            className="btn btn-ghost"
            style={{ minHeight: 44, padding: '4px 10px', borderRadius: 8, fontSize: 12 }}
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
                background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                color: 'var(--warning)',
                border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
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
          <div style={{ fontWeight: 700 }}>Database backup</div>
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
          Run backup now
        </button>

        {backupMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            marginBottom: 12,
            background: backupMsg.ok ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'color-mix(in srgb, var(--danger) 10%, transparent)',
            color: backupMsg.ok ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${backupMsg.ok ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`,
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
                    style={{ minWidth: 44, minHeight: 44, padding: '4px 10px', borderRadius: 8, fontSize: 12, textDecoration: 'none' }}
                    aria-label={`Download backup ${b.filename}`}
                  >
                    Download
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
              <div style={{ fontWeight: 700, fontSize: 14 }}>Cloud sync</div>
              {backups.cloudRemote ? (
                <div style={{ fontSize: 11, color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)', borderRadius: 999, padding: '2px 8px' }}>
                  {backups.cloudRemote}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--muted)', background: 'color-mix(in srgb, var(--ink) 5%, transparent)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px' }}>
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
                <code style={{ fontSize: 11, color: 'color-mix(in srgb, var(--accent) 80%, transparent)' }}>0 2 * * * CLOUD_REMOTE=gds: bash /home/mkerns/bowling-tracker/backend/scripts/backup.sh</code>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', paddingBottom: 8 }}>
        <Link className="public-link-target" to="/help" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 14 }}>
          Need help? View Help &amp; FAQ
        </Link>
      </div>
    </div>
  )
}
