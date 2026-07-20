import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface Ball {
  id: number
  name: string
  brand: string
  color: string
  notes: string
  bowwwlId?: string
  coreType?: string
  coreRg?: string
  coreDiff?: string
  coverstockName?: string
  coverstockType?: string
  factoryFinish?: string
  thumbnailImage?: string
  createdAt?: string
}

interface BowwwlBall {
  ball_id: string
  ball_name: string
  brand_name: string
  core_type: string
  core_rg: string
  core_diff: string
  core_int_diff: string
  coverstock_name: string
  coverstock_type: string
  factory_finish: string
  thumbnail_image: string
  release_date: string
  availability: string
}

export default function Balls() {
  const qc = useQueryClient()
  const emptyForm = { name: '', brand: '', color: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [manualMode, setManualMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults] = useState<BowwwlBall[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedBall, setSelectedBall] = useState<BowwwlBall | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [editingBallId, setEditingBallId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [modalBall, setModalBall] = useState<Ball | null>(null)
  const [copied, setCopied] = useState(false)
  const [imageCopied, setImageCopied] = useState(false)
  const [imageCopyError, setImageCopyError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'brand' | 'date' | 'coverstock'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [, setIsMobile] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: ballList, isLoading } = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => fetch('/api/balls').then(r => r.json()),
  })

  const addBall = useMutation({
    mutationFn: (data: object) =>
      fetch('/api/balls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balls'] })
      setForm(emptyForm)
      setSelectedBall(null)
      setSearchQuery('')
      setDebouncedQuery('')
      setSearchResults([])
    },
  })

  const updateBall = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      fetch(`/api/balls/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setEditingBallId(null)
      qc.invalidateQueries({ queryKey: ['balls'] })
    },
  })

  const deleteBall = useMutation({
    mutationFn: (id: number) => fetch(`/api/balls/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['balls'] }),
  })

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    setSearchLoading(true)
    fetch(`/balls/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(r => r.json())
      .then((data: BowwwlBall[]) => {
        setSearchResults(data)
        setShowDropdown(true)
      })
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false))
  }, [debouncedQuery])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!modalBall) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalBall(null)
    }

    window.addEventListener('keydown', onKeyDown)

    // Lock body scroll while modal is open
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Hide bottom nav so it doesn't overlap the sheet
    const nav = document.querySelector('.bottom-nav') as HTMLElement | null
    const prevNavDisplay = nav ? nav.style.display : ''
    if (nav) nav.style.display = 'none'

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      if (nav) nav.style.display = prevNavDisplay
    }
  }, [modalBall])

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSelectBall = (ball: BowwwlBall) => {
    setSelectedBall(ball)
    setShowDropdown(false)
    setSearchQuery(ball.ball_name)
  }

  const handleAddFromDatabase = () => {
    if (!selectedBall) return
    addBall.mutate({
      name: selectedBall.ball_name,
      brand: selectedBall.brand_name,
      color: '',
      notes: '',
      bowwwlId: selectedBall.ball_id,
      coreType: selectedBall.core_type,
      coreRg: selectedBall.core_rg,
      coreDiff: selectedBall.core_diff,
      coverstockName: selectedBall.coverstock_name,
      coverstockType: selectedBall.coverstock_type,
      factoryFinish: selectedBall.factory_finish,
      thumbnailImage: selectedBall.thumbnail_image,
    })
  }

  const chip = (label: string) => (
    <span style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)', borderRadius: 999, padding: '3px 10px', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
      {label}
    </span>
  )

  const handleCopyAll = () => {
    if (!ballList?.length) return
    const text = ballList.map(b => `${b.name}${b.brand ? ` (${b.brand})` : ''}`).join('\n')
    const ok = copyTextToClipboard(text)
    setCopied(ok)
    setTimeout(() => setCopied(false), 1800)
  }

  function copyTextToClipboard(text: string): boolean {
    // Try navigator.clipboard first (works on HTTPS / localhost)
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
      return true
    }
    // Fallback: textarea selection (works on HTTP / any origin)
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const success = document.execCommand('copy')
    document.body.removeChild(ta)
    return success
  }

  const handleCopyImage = async () => {
    if (!modalBall?.thumbnailImage) return
    setImageCopied(false)
    setImageCopyError(null)
    try {
      // Fetch via backend proxy to avoid CORS (bowwwl.com doesn't return ACAO headers,
      // so a direct browser-side fetch is blocked and ClipboardItem can't get the blob).
      const proxyUrl = `/api/balls/image-proxy?path=${encodeURIComponent(modalBall.thumbnailImage)}`
      const res = await fetch(proxyUrl)
      if (!res.ok) throw new Error(`proxy returned ${res.status}`)
      const blob = await res.blob()
      // Some browsers require a PNG for image clipboard. Re-encode via canvas if needed.
      let finalBlob: Blob = blob
      if (blob.type !== 'image/png' && blob.type !== 'image/jpeg') {
        finalBlob = await new Promise<Blob>((resolve, reject) => {
          const img = new Image()
          const objectUrl = URL.createObjectURL(blob)
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext('2d')
            if (!ctx) { URL.revokeObjectURL(objectUrl); return reject(new Error('canvas failed')) }
            ctx.drawImage(img, 0, 0)
            canvas.toBlob(b => { URL.revokeObjectURL(objectUrl); b ? resolve(b) : reject(new Error('toBlob failed')) }, 'image/png')
          }
          img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image load failed')) }
          img.src = objectUrl
        })
      }
      await navigator.clipboard.write([new ClipboardItem({ [finalBlob.type]: finalBlob })])
      setImageCopied(true)
      setTimeout(() => setImageCopied(false), 2000)
    } catch (err: any) {
      setImageCopyError(err?.message || 'copy failed')
      setTimeout(() => setImageCopyError(null), 2500)
    }
  }

  const sortedBalls = React.useMemo(() => {
    if (!ballList) return []
    return [...ballList].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortBy === 'brand') cmp = (a.brand || '').localeCompare(b.brand || '')
      else if (sortBy === 'coverstock') cmp = (a.coverstockType || '').localeCompare(b.coverstockType || '')
      else cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [ballList, sortBy, sortDir])

  const sortIcon = (key: typeof sortBy) => sortBy === key ? (sortDir === 'asc' ? '↑' : '↓') : ''

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ marginBottom: 0 }}>My Balls</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Sort controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 8px' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Sort:</span>
            {(['name','brand','date','coverstock'] as const).map(key => (
              <button
                key={key}
                onClick={() => { if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(key); setSortDir('asc') } }}
                style={{
                  background: sortBy === key ? 'rgba(167,139,250,0.2)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  padding: '3px 7px',
                  fontSize: 11,
                  cursor: 'pointer',
                  color: sortBy === key ? 'var(--accent)' : 'var(--muted)',
                  fontWeight: sortBy === key ? 700 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {key === 'name' ? 'Name' : key === 'brand' ? 'Brand' : key === 'date' ? 'Added' : 'Cover'}{sortIcon(key)}
              </button>
            ))}
          </div>
          {ballList && ballList.length > 0 && (
            <button
              onClick={handleCopyAll}
              className="btn btn-ghost"
              style={{ minHeight: 34, padding: '6px 12px', borderRadius: 10, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {copied ? '✅ Copied!' : '📋 Copy All'}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ position: 'relative', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 16 }}>Add a Ball</h3>
          <button className="btn btn-ghost" style={{ minHeight: 34, padding: '6px 10px', borderRadius: 10, fontSize: 12 }} onClick={() => { setManualMode(m => !m); setSelectedBall(null); setSearchQuery(''); setSearchResults([]) }}>
            {manualMode ? 'Search Database' : 'Manual Entry'}
          </button>
        </div>

        {!manualMode ? (
          <div>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>🔍</span>
              <input
                type="text"
                placeholder="Search ball database..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSelectedBall(null) }}
                style={{ paddingLeft: 38 }}
              />
              {searchLoading && <span className="muted" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>Searching...</span>}
            </div>

            {showDropdown && (
              <div className="card" style={{ padding: 0, maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
                {searchResults.length > 0 ? searchResults.map(ball => (
                  <button
                    key={ball.ball_id}
                    onClick={() => handleSelectBall(ball)}
                    style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', minHeight: 56, padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  >
                    {ball.thumbnail_image && <img src={`https://www.bowwwl.com${ball.thumbnail_image}`} alt={ball.ball_name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />}
                    <div>
                      <div style={{ fontWeight: 600 }}>{ball.ball_name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{ball.brand_name}</div>
                    </div>
                  </button>
                )) : (
                  <div className="muted" style={{ padding: 14 }}>No results found.</div>
                )}
              </div>
            )}

            {selectedBall && (
              <div className="card" style={{ borderColor: 'rgba(167,139,250,0.35)' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  {selectedBall.thumbnail_image && <img src={`https://www.bowwwl.com${selectedBall.thumbnail_image}`} alt={selectedBall.ball_name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} />}
                  <div>
                    <div style={{ fontWeight: 750 }}>{selectedBall.ball_name}</div>
                    <div style={{ color: 'var(--accent)', fontSize: 13 }}>{selectedBall.brand_name}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {selectedBall.core_type && chip(selectedBall.core_type)}
                  {selectedBall.coverstock_type && chip(selectedBall.coverstock_type)}
                  {selectedBall.factory_finish && chip(selectedBall.factory_finish)}
                </div>
                <button disabled={addBall.isPending} onClick={handleAddFromDatabase} className="btn btn-primary" style={{ width: '100%' }}>
                  {addBall.isPending ? 'Adding...' : '+ Add to My Bag'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <input type="text" placeholder="Name *" value={form.name} onChange={f('name')} />
            <input type="text" placeholder="Brand" value={form.brand} onChange={f('brand')} />
            <input type="text" placeholder="Color" value={form.color} onChange={f('color')} />
            <input type="text" placeholder="Notes" value={form.notes} onChange={f('notes')} />
            <button disabled={!form.name.trim() || addBall.isPending} onClick={() => addBall.mutate(form)} className="btn btn-primary" style={{ width: '100%' }}>
              {addBall.isPending ? 'Adding...' : '+ Add Ball'}
            </button>
          </div>
        )}
      </div>

      {isLoading && <div className="muted">Loading...</div>}

      {!isLoading && !ballList?.length && (
        <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
          <span className="muted">No balls in your bag yet.</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {sortedBalls.map((b: Ball) => (
          <div
            key={b.id}
            className="card"
            style={{ padding: 12, cursor: 'pointer' }}
            onClick={() => setModalBall(b)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {b.thumbnailImage ? (
                <img src={`https://www.bowwwl.com${b.thumbnailImage}`} alt={b.name} style={{ width: 54, height: 54, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 54, height: 54, borderRadius: 10, border: '1px solid var(--border)', background: '#111122', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>🎱</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{b.name}</div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{b.brand}{b.color ? ` · ${b.color}` : ''}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {b.coreType && chip(b.coreType)}
                  {b.coverstockType && chip(b.coverstockType)}
                  {b.coreRg && b.coreDiff && chip(`RG ${b.coreRg} / Diff ${b.coreDiff}`)}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingBallId(b.id)
                  setEditForm({ name: b.name || '', brand: b.brand || '', color: b.color || '', notes: b.notes || '' })
                }}
                className="btn btn-ghost"
                style={{ minHeight: 36, padding: '6px 10px', borderRadius: 10 }}
              >
                ✏️
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Delete "${b.name}"?`)) deleteBall.mutate(b.id)
                }}
                className="btn btn-danger"
                style={{ minHeight: 36, padding: '6px 10px', borderRadius: 10 }}
              >
                Remove
              </button>
            </div>

            {editingBallId === b.id && (
              <div
                style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: '#131326', cursor: 'default' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>Editing...</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <input placeholder="Name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  <input placeholder="Brand" value={editForm.brand} onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))} />
                  <input placeholder="Color" value={editForm.color} onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))} />
                  <textarea placeholder="Notes" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" style={{ minHeight: 32, padding: '5px 10px' }} onClick={() => updateBall.mutate({ id: b.id, data: editForm })}>Save</button>
                    <button className="btn btn-ghost" style={{ minHeight: 32, padding: '5px 10px' }} onClick={() => setEditingBallId(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {modalBall && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => setModalBall(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 600,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderTop: '1px solid rgba(167,139,250,0.25)',
              borderRadius: '24px 24px 0 0',
              padding: '20px 20px',
              paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 8px))',
              position: 'relative',
              maxHeight: '92vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 16px' }} />

            <button
              className="btn btn-ghost"
              onClick={() => setModalBall(null)}
              style={{ position: 'absolute', top: 16, right: 16, minHeight: 34, padding: '6px 10px', borderRadius: 10 }}
            >
              ✕
            </button>

            {/* Header row: image + name side by side */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
              <button
                onClick={handleCopyImage}
                title="Copy image to clipboard"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderRadius: 12, overflow: 'hidden', display: 'inline-block', position: 'relative', flexShrink: 0, width: 72, height: 72 }}
              >
                {modalBall.thumbnailImage ? (
                  <img src={`https://www.bowwwl.com${modalBall.thumbnailImage}`} alt={modalBall.name} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)', display: 'block' }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', display: 'grid', placeItems: 'center', fontSize: 32 }}>🎱</div>
                )}
                {imageCopied && (
                  <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10, borderRadius: 999, padding: '2px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    ✅ Copied!
                  </div>
                )}
                {imageCopyError && (
                  <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(180,40,40,0.9)', color: '#fff', fontSize: 10, borderRadius: 999, padding: '2px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    ❌ {imageCopyError}
                  </div>
                )}
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{modalBall.name}</div>
                {modalBall.brand && <div style={{ color: 'var(--accent)', fontWeight: 600, marginTop: 3 }}>{modalBall.brand}</div>}
                {modalBall.color && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Color: {modalBall.color}</div>}
              </div>
            </div>

            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{modalBall.name}</div>
            {modalBall.brand && <div style={{ color: 'var(--accent)', fontWeight: 600, marginTop: 4 }}>{modalBall.brand}</div>}
            {modalBall.color && <div style={{ color: 'var(--muted)', marginTop: 4 }}>Color: {modalBall.color}</div>}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, marginBottom: 14 }}>
              {modalBall.coreType && chip(modalBall.coreType)}
              {modalBall.coverstockType && chip(modalBall.coverstockType)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Core RG</div>
                <div style={{ color: 'var(--text)', fontWeight: 600 }}>{modalBall.coreRg || '—'}</div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Core Differential</div>
                <div style={{ color: 'var(--text)', fontWeight: 600 }}>{modalBall.coreDiff || '—'}</div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Coverstock</div>
                <div style={{ color: 'var(--text)', fontWeight: 600 }}>{modalBall.coverstockName || '—'}</div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Coverstock Type</div>
                <div style={{ color: 'var(--text)', fontWeight: 600 }}>{modalBall.coverstockType || '—'}</div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, gridColumn: '1 / -1' }}>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Factory Finish</div>
                <div style={{ color: 'var(--text)', fontWeight: 600 }}>{modalBall.factoryFinish || '—'}</div>
              </div>
            </div>

            {modalBall.notes && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Notes</div>
                <div style={{ color: 'var(--text)' }}>{modalBall.notes}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
