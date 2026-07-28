import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BallImage, GearHeader, GearNavigation, GearSheet, GearState } from '../features/gear/GearWorkspace'

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

interface BallPerformance {
  ballId: number
  ballName: string
  brand: string | null
  gameCount: number
  average: number
}

type BallForm = Pick<Ball, 'name' | 'brand' | 'color' | 'notes'>
type CoverFilter = 'all' | 'solid' | 'pearl' | 'hybrid' | 'urethane' | 'other'

const EMPTY_FORM: BallForm = { name: '', brand: '', color: '', notes: '' }

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.json() as Promise<T>
}

async function request(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  const response = await fetch(input, init)
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
}

async function clipboardImage(path: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard unavailable')
  const response = await fetch(`/api/balls/image-proxy?path=${encodeURIComponent(path)}`)
  if (!response.ok) throw new Error(`Image request failed (${response.status})`)
  const source = await response.blob()
  let image = source
  if (source.type !== 'image/png') {
    image = await new Promise<Blob>((resolve, reject) => {
      const element = new Image()
      const objectUrl = URL.createObjectURL(source)
      element.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = element.naturalWidth
        canvas.height = element.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) {
          URL.revokeObjectURL(objectUrl)
          reject(new Error('Image conversion unavailable'))
          return
        }
        context.drawImage(element, 0, 0)
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl)
          if (blob) resolve(blob)
          else reject(new Error('Image conversion failed'))
        }, 'image/png')
      }
      element.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Image decode failed'))
      }
      element.src = objectUrl
    })
  }
  await navigator.clipboard.write([new ClipboardItem({ [image.type]: image })])
}

function coverGroup(ball: Ball): CoverFilter {
  const cover = `${ball.coverstockType || ''} ${ball.coverstockName || ''}`.toLowerCase()
  if (cover.includes('solid')) return 'solid'
  if (cover.includes('pearl')) return 'pearl'
  if (cover.includes('hybrid')) return 'hybrid'
  if (cover.includes('urethane')) return 'urethane'
  return 'other'
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  const field = document.createElement('textarea')
  field.value = text
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  const success = document.execCommand('copy')
  field.remove()
  return success ? Promise.resolve() : Promise.reject(new Error('Clipboard unavailable'))
}

export default function Balls() {
  const queryClient = useQueryClient()
  const [libraryQuery, setLibraryQuery] = useState('')
  const [coverFilter, setCoverFilter] = useState<CoverFilter>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogSearchTerm, setCatalogSearchTerm] = useState('')
  const [selectedCatalogBall, setSelectedCatalogBall] = useState<BowwwlBall | null>(null)
  const [manualForm, setManualForm] = useState<BallForm>(EMPTY_FORM)
  const [selectedBall, setSelectedBall] = useState<Ball | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<BallForm>(EMPTY_FORM)
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle')
  const [imageCopyState, setImageCopyState] = useState<'idle' | 'done' | 'error'>('idle')
  useEffect(() => {
    const timeout = window.setTimeout(() => setCatalogSearchTerm(catalogQuery.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [catalogQuery])

  const ballsQuery = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => requestJson<Ball[]>('/api/balls'),
  })

  const performanceQuery = useQuery<BallPerformance[]>({
    queryKey: ['ball-performance'],
    queryFn: () => requestJson<BallPerformance[]>('/stats/by-ball'),
  })

  const catalogSearch = useQuery<BowwwlBall[]>({
    queryKey: ['bowwwl-search', catalogSearchTerm],
    queryFn: ({ signal }) => requestJson<BowwwlBall[]>(`/balls/search?q=${encodeURIComponent(catalogSearchTerm)}`, { signal }),
    enabled: catalogSearchTerm.length >= 2 && !manualMode,
    retry: false,
  })

  const addBall = useMutation({
    mutationFn: (payload: object) => requestJson<Ball>('/api/balls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['balls'] })
      setManualForm(EMPTY_FORM)
      setCatalogQuery('')
      setSelectedCatalogBall(null)
      setAddOpen(false)
    },
  })

  const updateBall = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: BallForm }) => request(`/api/balls/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['balls'] })
      setSelectedBall((current) => current?.id === variables.id ? { ...current, ...variables.payload } : current)
      setEditing(false)
    },
  })

  const deleteBall = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/balls/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['balls'] })
      setSelectedBall(null)
    },
  })

  const visibleBalls = useMemo(() => {
    const normalized = libraryQuery.trim().toLowerCase()
    return [...(ballsQuery.data || [])]
      .filter((ball) => coverFilter === 'all' || coverGroup(ball) === coverFilter)
      .filter((ball) => !normalized || `${ball.name} ${ball.brand} ${ball.color} ${ball.coverstockName || ''} ${ball.coverstockType || ''}`.toLowerCase().includes(normalized))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [ballsQuery.data, coverFilter, libraryQuery])

  const performanceByBall = useMemo(
    () => new Map((performanceQuery.data || []).map((performance) => [performance.ballId, performance])),
    [performanceQuery.data],
  )

  const openBall = (ball: Ball) => {
    setSelectedBall(ball)
    setEditForm({ name: ball.name || '', brand: ball.brand || '', color: ball.color || '', notes: ball.notes || '' })
    setEditing(false)
    setImageCopyState('idle')
  }

  const addCatalogBall = () => {
    if (!selectedCatalogBall) return
    addBall.mutate({
      name: selectedCatalogBall.ball_name,
      brand: selectedCatalogBall.brand_name,
      color: '',
      notes: '',
      bowwwlId: selectedCatalogBall.ball_id,
      coreType: selectedCatalogBall.core_type,
      coreRg: selectedCatalogBall.core_rg,
      coreDiff: selectedCatalogBall.core_diff,
      coverstockName: selectedCatalogBall.coverstock_name,
      coverstockType: selectedCatalogBall.coverstock_type,
      factoryFinish: selectedCatalogBall.factory_finish,
      thumbnailImage: selectedCatalogBall.thumbnail_image,
    })
  }

  const copyLibrary = async () => {
    if (!ballsQuery.data?.length) return
    try {
      await copyText(ballsQuery.data.map((ball) => `${ball.name}${ball.brand ? ` (${ball.brand})` : ''}`).join('\n'))
      setCopyState('done')
    } catch {
      setCopyState('error')
    }
  }

  const copySelectedImage = async () => {
    if (!selectedBall?.thumbnailImage) return
    try {
      await clipboardImage(selectedBall.thumbnailImage)
      setImageCopyState('done')
    } catch {
      setImageCopyState('error')
    }
  }

  return (
    <main className="gear-workspace">
      <GearHeader
        title="Ball library"
        description="Your equipment bench—specs, surfaces, and the pieces available for every bag."
        action={<button className="btn btn-primary" type="button" onClick={() => setAddOpen(true)}>Add a ball</button>}
      />
      <GearNavigation />

      <div className="gear-toolbar">
        <label className="gear-search">
          <span className="sr-only">Search your ball library</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
          <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search name, brand, or cover" />
        </label>
        <label className="gear-filter">
          <span className="sr-only">Filter by coverstock</span>
          <select value={coverFilter} onChange={(event) => setCoverFilter(event.target.value as CoverFilter)}>
            <option value="all">All coverstocks</option>
            <option value="solid">Solid</option>
            <option value="pearl">Pearl</option>
            <option value="hybrid">Hybrid</option>
            <option value="urethane">Urethane</option>
            <option value="other">Other / unknown</option>
          </select>
        </label>
        {Boolean(ballsQuery.data?.length) && (
          <button className="btn btn-ghost" type="button" onClick={() => void copyLibrary()}>
            {copyState === 'done' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy list'}
          </button>
        )}
      </div>

      {ballsQuery.isLoading && <GearState kind="loading" title="Opening your equipment locker" detail="Loading saved balls and specifications." />}
      {ballsQuery.isError && <GearState kind="error" title="Ball library unavailable" detail="The equipment service did not respond. Check the connection and try again." action={<button className="btn btn-ghost" type="button" onClick={() => void ballsQuery.refetch()}>Try again</button>} />}
      {!ballsQuery.isLoading && !ballsQuery.isError && !ballsQuery.data?.length && (
        <GearState kind="empty" title="Your locker is empty" detail="Add a ball from the Bowwwl catalog or enter one manually to start building arsenals." action={<button className="btn btn-primary" type="button" onClick={() => setAddOpen(true)}>Add your first ball</button>} />
      )}
      {Boolean(ballsQuery.data?.length) && (
        <>
          <p className="gear-result-count">{visibleBalls.length} of {ballsQuery.data?.length} balls</p>
          {visibleBalls.length ? (
            <section className="gear-library" aria-label="Ball library results">
              {visibleBalls.map((ball) => (
                <button className="gear-ball-card" type="button" key={ball.id} onClick={() => openBall(ball)}>
                  <BallImage path={ball.thumbnailImage} name={ball.name} />
                  <span className="gear-ball-card__copy">
                    <strong>{ball.name}</strong>
                    <span>{ball.brand || 'Brand not recorded'}{ball.color ? ` · ${ball.color}` : ''}</span>
                    <span className="gear-ball-card__usage">
                      {performanceQuery.isError
                        ? 'Usage unavailable'
                        : performanceByBall.has(ball.id)
                        ? `${performanceByBall.get(ball.id)?.gameCount} games · ${performanceByBall.get(ball.id)?.average} average`
                        : 'Never used in a logged game'}
                    </span>
                    <span className="gear-ball-card__specs">
                      {ball.coverstockType && <span className="gear-chip">{ball.coverstockType}</span>}
                      {ball.coreType && <span className="gear-chip">{ball.coreType}</span>}
                      {ball.coreRg && <span className="gear-chip">RG {ball.coreRg}</span>}
                      {!ball.coverstockType && !ball.coreType && !ball.coreRg && <span className="gear-chip gear-chip--missing">Specs incomplete</span>}
                    </span>
                  </span>
                  <span className="gear-chevron" aria-hidden="true">›</span>
                </button>
              ))}
            </section>
          ) : (
            <GearState kind="empty" title="No equipment matches" detail="Clear the search or choose a different coverstock filter." action={<button className="btn btn-ghost" type="button" onClick={() => { setLibraryQuery(''); setCoverFilter('all') }}>Clear filters</button>} />
          )}
        </>
      )}

      <GearSheet open={addOpen} onClose={() => setAddOpen(false)} title="Add a ball" description="Search the Bowwwl catalog or record equipment manually.">
        <div className="gear-segments" aria-label="Add ball method">
          <button type="button" aria-pressed={!manualMode} className={!manualMode ? 'gear-segment is-active' : 'gear-segment'} onClick={() => setManualMode(false)}>Search catalog</button>
          <button type="button" aria-pressed={manualMode} className={manualMode ? 'gear-segment is-active' : 'gear-segment'} onClick={() => setManualMode(true)}>Manual entry</button>
        </div>
        {manualMode ? (
          <div className="gear-form">
            <label>Name<input value={manualForm.name} onChange={(event) => setManualForm({ ...manualForm, name: event.target.value })} required /></label>
            <div className="gear-form__row">
              <label>Brand<input value={manualForm.brand} onChange={(event) => setManualForm({ ...manualForm, brand: event.target.value })} /></label>
              <label>Color<input value={manualForm.color} onChange={(event) => setManualForm({ ...manualForm, color: event.target.value })} /></label>
            </div>
            <label>Notes<textarea value={manualForm.notes} onChange={(event) => setManualForm({ ...manualForm, notes: event.target.value })} /></label>
            {addBall.isError && <p className="gear-form__error">The ball could not be saved. Check the connection and try again.</p>}
            <div className="gear-form__actions"><button className="btn btn-primary" type="button" disabled={!manualForm.name.trim() || addBall.isPending} onClick={() => addBall.mutate(manualForm)}>{addBall.isPending ? 'Saving…' : 'Save ball'}</button></div>
          </div>
        ) : (
          <div className="gear-form">
            <label>Ball name<input value={catalogQuery} onChange={(event) => { setCatalogQuery(event.target.value); setSelectedCatalogBall(null) }} placeholder="Type at least two characters" /></label>
            {catalogSearch.isFetching && <p className="gear-result-count" aria-live="polite">Searching Bowwwl…</p>}
            {catalogSearch.isError && <GearState kind="error" title="Catalog unavailable" detail="Bowwwl search could not be reached. You can still add this ball manually." action={<button className="btn btn-ghost" type="button" onClick={() => setManualMode(true)}>Use manual entry</button>} />}
            {catalogSearch.data && !catalogSearch.data.length && catalogSearchTerm.length >= 2 && <GearState kind="empty" title="No catalog match" detail="Try a shorter name or add the equipment manually." action={<button className="btn btn-ghost" type="button" onClick={() => setManualMode(true)}>Use manual entry</button>} />}
            {Boolean(catalogSearch.data?.length) && !selectedCatalogBall && (
              <section className="gear-performance" aria-label="Bowwwl search results">
                {catalogSearch.data?.map((ball) => (
                  <button key={ball.ball_id} className="gear-ball-card" type="button" onClick={() => setSelectedCatalogBall(ball)}>
                    <BallImage path={ball.thumbnail_image} name={ball.ball_name} size="small" />
                    <span className="gear-ball-card__copy"><strong>{ball.ball_name}</strong><span>{ball.brand_name}</span></span>
                    <span className="gear-chevron" aria-hidden="true">›</span>
                  </button>
                ))}
              </section>
            )}
            {selectedCatalogBall && (
              <div>
                <div className="gear-detail-hero">
                  <BallImage path={selectedCatalogBall.thumbnail_image} name={selectedCatalogBall.ball_name} size="large" />
                  <div><h3>{selectedCatalogBall.ball_name}</h3><p>{selectedCatalogBall.brand_name}</p></div>
                </div>
                <div className="gear-spec-grid">
                  <div className="gear-spec"><span>Cover</span><strong>{selectedCatalogBall.coverstock_type || 'Not listed'}</strong></div>
                  <div className="gear-spec"><span>Core</span><strong>{selectedCatalogBall.core_type || 'Not listed'}</strong></div>
                  <div className="gear-spec"><span>RG</span><strong>{selectedCatalogBall.core_rg || '—'}</strong></div>
                  <div className="gear-spec"><span>Differential</span><strong>{selectedCatalogBall.core_diff || '—'}</strong></div>
                </div>
                {addBall.isError && <p className="gear-form__error">The ball could not be saved. Check the connection and try again.</p>}
                <div className="gear-form__actions"><button className="btn btn-ghost" type="button" onClick={() => setSelectedCatalogBall(null)}>Back</button><button className="btn btn-primary" type="button" disabled={addBall.isPending} onClick={addCatalogBall}>{addBall.isPending ? 'Saving…' : 'Add to library'}</button></div>
              </div>
            )}
          </div>
        )}
      </GearSheet>

      <GearSheet open={Boolean(selectedBall)} onClose={() => setSelectedBall(null)} title={editing ? 'Edit ball' : selectedBall?.name || 'Ball details'} description={editing ? 'Update the details you track for this equipment.' : selectedBall?.brand || 'Equipment profile'}>
        {selectedBall && (editing ? (
          <div className="gear-form">
            <label>Name<input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
            <div className="gear-form__row">
              <label>Brand<input value={editForm.brand} onChange={(event) => setEditForm({ ...editForm, brand: event.target.value })} /></label>
              <label>Color<input value={editForm.color} onChange={(event) => setEditForm({ ...editForm, color: event.target.value })} /></label>
            </div>
            <label>Notes<textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} /></label>
            {updateBall.isError && <p className="gear-form__error">Changes could not be saved. Check the connection and try again.</p>}
            <div className="gear-form__actions"><button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="btn btn-primary" type="button" disabled={!editForm.name.trim() || updateBall.isPending} onClick={() => updateBall.mutate({ id: selectedBall.id, payload: editForm })}>{updateBall.isPending ? 'Saving…' : 'Save changes'}</button></div>
          </div>
        ) : (
          <div>
            <div className="gear-detail-hero"><BallImage path={selectedBall.thumbnailImage} name={selectedBall.name} size="large" /><div><h3>{selectedBall.name}</h3><p>{selectedBall.brand || 'Brand not recorded'}{selectedBall.color ? ` · ${selectedBall.color}` : ''}</p></div></div>
            <div className="gear-spec-grid">
              <div className="gear-spec"><span>Core RG</span><strong>{selectedBall.coreRg || '—'}</strong></div>
              <div className="gear-spec"><span>Differential</span><strong>{selectedBall.coreDiff || '—'}</strong></div>
              <div className="gear-spec"><span>Coverstock</span><strong>{selectedBall.coverstockName || '—'}</strong></div>
              <div className="gear-spec"><span>Surface</span><strong>{selectedBall.factoryFinish || '—'}</strong></div>
            </div>
            {selectedBall.notes && <p className="gear-notes">{selectedBall.notes}</p>}
            {deleteBall.isError && <p className="gear-form__error">This ball could not be removed. It may still belong to an arsenal.</p>}
            <div className="gear-danger-row"><button className="btn btn-danger" type="button" disabled={deleteBall.isPending} onClick={() => { if (window.confirm(`Remove “${selectedBall.name}” from your library?`)) deleteBall.mutate(selectedBall.id) }}>{deleteBall.isPending ? 'Removing…' : 'Remove'}</button><div className="gear-form__actions">{selectedBall.thumbnailImage && <button className="btn btn-ghost" type="button" onClick={() => void copySelectedImage()}>{imageCopyState === 'done' ? 'Image copied' : imageCopyState === 'error' ? 'Copy unavailable' : 'Copy image'}</button>}<button className="btn btn-primary" type="button" onClick={() => setEditing(true)}>Edit details</button></div></div>
          </div>
        ))}
      </GearSheet>
    </main>
  )
}
