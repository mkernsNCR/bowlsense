import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BallImage, GearBackLink, GearHeader, GearNavigation, GearSheet, GearState } from '../features/gear/GearWorkspace'
import { arsenalJson, arsenalRequest, requestJson } from '../features/gear/api'
import type { Arsenal, ArsenalBall, ArsenalDetail, ArsenalUseCase, GearBall } from '../features/gear/types'

interface EntryForm {
  ballId: string
  role: string
  slotOrder: string
  notes: string
}

const USE_CASES: ArsenalUseCase[] = ['League', 'Tournament', 'Practice', 'Sport Shot', 'Custom']
const ROLES = ['Strike', 'Spare', 'Heavy Oil', 'Dry Lane', 'Benchmark', 'Wet-Dry', 'Backup Ball', 'Custom']
const EMPTY_ENTRY: EntryForm = { ballId: '', role: 'Benchmark', slotOrder: '', notes: '' }
const MIN_CAPACITY = 1
const MAX_CAPACITY = 12

function requestedCapacity(value: string): number | null {
  const capacity = Number(value)
  return Number.isInteger(capacity) && capacity >= MIN_CAPACITY && capacity <= MAX_CAPACITY
    ? capacity
    : null
}

function normalizeCapacity(value: unknown): number {
  const capacity = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(capacity)) return MIN_CAPACITY
  return Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, Math.trunc(capacity)))
}

function ArsenalList({ createMode }: { createMode: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(createMode)
  const [form, setForm] = useState({ name: '', description: '', useCase: 'League' as ArsenalUseCase, maxSize: '6', notes: '' })
  const createCapacity = requestedCapacity(form.maxSize)
  const arsenalsQuery = useQuery<Arsenal[]>({ queryKey: ['arsenals'], queryFn: () => arsenalJson<Arsenal[]>() })
  const createArsenal = useMutation({
    mutationFn: (payload: object) => arsenalJson<Arsenal>('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['arsenals'] })
      navigate(`/arsenals/${created.id}`)
    },
  })

  return (
    <div className="gear-workspace">
      <GearHeader title="Arsenals" description="Build purpose-made bags and see the role every ball plays before you get to the lanes." action={<button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>Build an arsenal</button>} />
      <GearNavigation />

      {arsenalsQuery.isLoading && <GearState kind="loading" title="Checking your bags" detail="Loading saved arsenal plans." />}
      {arsenalsQuery.isError && <GearState kind="error" title="Arsenals unavailable" detail="The gear service did not respond. Check the connection and try again." action={<button className="btn btn-ghost" type="button" onClick={() => void arsenalsQuery.refetch()}>Try again</button>} />}
      {!arsenalsQuery.isLoading && !arsenalsQuery.isError && !arsenalsQuery.data?.length && <GearState kind="empty" title="No bags built yet" detail="Start with the lane condition or event you bowl most often, then give each ball a job." action={<button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>Build your first arsenal</button>} />}
      {Boolean(arsenalsQuery.data?.length) && (
        <section className="gear-arsenal-list" aria-label="Saved arsenals">
          {arsenalsQuery.data?.map((arsenal) => {
            const count = arsenal.ballCount ?? 0
            const capacity = normalizeCapacity(arsenal.maxSize)
            const percent = Math.min(100, Math.round((count / capacity) * 100))
            return (
              <Link className="gear-arsenal-card" to={`/arsenals/${arsenal.id}`} key={arsenal.id}>
                <div className="gear-arsenal-card__head">
                  <div><h2>{arsenal.name}</h2><p>{arsenal.description || 'No bag description'}</p></div>
                  {arsenal.useCase && <span className="gear-chip">{arsenal.useCase}</span>}
                </div>
                <div className="gear-capacity">
                  <div className="gear-capacity__rail" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
                  <span>{count} / {capacity}</span>
                </div>
              </Link>
            )
          })}
        </section>
      )}

      <GearSheet open={createOpen} onClose={() => { setCreateOpen(false); if (createMode) navigate('/arsenals', { replace: true }) }} title="Build an arsenal" description="Name the job this bag needs to do. You can fill its slots next.">
        <div className="gear-form">
          <label>Arsenal name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="League night" /></label>
          <div className="gear-form__row">
            <label>Use case<select value={form.useCase} onChange={(event) => setForm({ ...form, useCase: event.target.value as ArsenalUseCase })}>{USE_CASES.map((useCase) => <option value={useCase} key={useCase}>{useCase}</option>)}</select></label>
            <label>Bag size<input type="number" min="1" max="12" step="1" value={form.maxSize} onChange={(event) => setForm({ ...form, maxSize: event.target.value })} /></label>
          </div>
          <label>Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Fresh house shot with a late transition" /></label>
          <label>Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          {createArsenal.isError && <p className="gear-form__error">The arsenal could not be created. Check the connection and try again.</p>}
          <div className="gear-form__actions"><button className="btn btn-primary" type="button" disabled={!form.name.trim() || createCapacity === null || createArsenal.isPending} onClick={() => { if (createCapacity !== null) createArsenal.mutate({ name: form.name.trim(), description: form.description || null, useCase: form.useCase, maxSize: createCapacity, notes: form.notes || null }) }}>{createArsenal.isPending ? 'Building…' : 'Build arsenal'}</button></div>
        </div>
      </GearSheet>
    </div>
  )
}

function ArsenalDetailContent({ arsenal }: { arsenal: ArsenalDetail }) {
  const queryClient = useQueryClient()
  const [addSlot, setAddSlot] = useState<number | null>(null)
  const [addForm, setAddForm] = useState<EntryForm>(EMPTY_ENTRY)
  const [selectedEntry, setSelectedEntry] = useState<ArsenalBall | null>(null)
  const [editEntry, setEditEntry] = useState<EntryForm>(EMPTY_ENTRY)
  const [notes, setNotes] = useState(arsenal.notes || '')
  const [performanceSort, setPerformanceSort] = useState<'average' | 'games' | 'high'>('average')
  const capacity = normalizeCapacity(arsenal.maxSize)

  const ballsQuery = useQuery<GearBall[]>({ queryKey: ['balls'], queryFn: () => requestJson<GearBall[]>('/api/balls') })
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['arsenal', arsenal.id] })
    void queryClient.invalidateQueries({ queryKey: ['arsenals'] })
  }

  const addBall = useMutation({
    mutationFn: (payload: object) => arsenalRequest(`/${arsenal.id}/balls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      invalidate()
      setAddSlot(null)
      setAddForm(EMPTY_ENTRY)
    },
  })

  const updateEntry = useMutation({
    mutationFn: ({ entryId, payload }: { entryId: number; payload: object }) => arsenalRequest(`/balls/${entryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      invalidate()
      setSelectedEntry(null)
    },
  })

  const removeEntry = useMutation({
    mutationFn: (entryId: number) => arsenalRequest(`/balls/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      setSelectedEntry(null)
    },
  })

  const updateArsenal = useMutation({
    mutationFn: () => arsenalRequest(`/${arsenal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: arsenal.name, description: arsenal.description, useCase: arsenal.useCase, maxSize: capacity, notes: notes || null }),
    }),
    onSuccess: invalidate,
  })

  const allocation = useMemo(() => {
    const placed = new Array<ArsenalBall | null>(capacity).fill(null)
    const unplaced: ArsenalBall[] = []
    const ordered = [...arsenal.balls].sort((left, right) => left.slotOrder - right.slotOrder || left.id - right.id)
    ordered.forEach((entry) => {
      const index = entry.slotOrder - 1
      if (index >= 0 && index < placed.length && !placed[index]) placed[index] = entry
      else unplaced.push(entry)
    })
    placed.forEach((entry, index) => {
      if (!entry && unplaced.length) placed[index] = unplaced.shift() || null
    })
    return { slots: placed, overflow: unplaced }
  }, [arsenal.balls, capacity])
  const { slots, overflow } = allocation

  const availableBalls = useMemo(() => {
    const used = new Set(arsenal.balls.map((entry) => entry.ballId))
    return (ballsQuery.data || []).filter((ball) => !used.has(ball.id))
  }, [arsenal.balls, ballsQuery.data])

  const performance = useMemo(() => [...(arsenal.stats?.byBall || [])].sort((a, b) => {
    if (performanceSort === 'games') return b.gamesPlayed - a.gamesPlayed
    if (performanceSort === 'high') return b.highGame - a.highGame
    return b.averageScore - a.averageScore
  }), [arsenal.stats?.byBall, performanceSort])

  const coverage = useMemo(() => {
    const roles = new Set(arsenal.balls.map((entry) => entry.role))
    return [
      { label: 'Heavy oil', covered: roles.has('Heavy Oil') },
      { label: 'Benchmark', covered: roles.has('Benchmark') },
      { label: 'Dry lane', covered: roles.has('Dry Lane') },
      { label: 'Spare', covered: roles.has('Spare') },
    ]
  }, [arsenal.balls])

  const openAdd = (slot: number) => {
    setAddForm({ ...EMPTY_ENTRY, slotOrder: String(slot) })
    setAddSlot(slot)
  }

  const openEntry = (entry: ArsenalBall, visibleSlot: number) => {
    setSelectedEntry(entry)
    setEditEntry({ ballId: String(entry.ballId), role: entry.role || 'Custom', slotOrder: String(visibleSlot), notes: entry.notes || '' })
  }

  return (
    <div className="gear-workspace">
      <GearBackLink to="/arsenals">All arsenals</GearBackLink>
      <GearHeader title={arsenal.name} description={arsenal.description || 'A purpose-built equipment plan.'} />
      <GearNavigation />

      <div className="gear-section__head"><div><h2>Bag composition</h2><p>{arsenal.balls.length} of {capacity} slots filled</p></div>{arsenal.useCase && <span className="gear-chip">{arsenal.useCase}</span>}</div>
      <section className="gear-bag" aria-label={`${arsenal.name} ball slots`}>
        {slots.map((entry, index) => entry ? (
          <button className="gear-slot" type="button" key={entry.id} onClick={() => openEntry(entry, index + 1)} aria-label={`Edit slot ${index + 1}, ${entry.ball.name}`}>
            <span className="gear-slot__number">{index + 1}</span>
            <BallImage path={entry.ball.thumbnailImage} name={entry.ball.name} size="small" />
            <span className="gear-slot__copy"><strong>{entry.ball.name}</strong><span>{entry.ball.brand || 'Brand not recorded'}</span><span className="gear-chip gear-chip--role">{entry.role || 'No role'}</span></span>
          </button>
        ) : (
          <button className="gear-slot gear-slot--empty" type="button" key={`empty-${index}`} onClick={() => openAdd(index + 1)}><span className="gear-slot__number">{index + 1}</span><span>Add ball</span></button>
        ))}
      </section>

      {overflow.length > 0 && (
        <section className="gear-overflow" aria-labelledby="arsenal-overflow-heading">
          <div className="gear-section__head">
            <div><h2 id="arsenal-overflow-heading">Over capacity</h2><p>Remove balls until this bag fits its {capacity}-slot capacity.</p></div>
            <span className="gear-chip">{overflow.length} extra</span>
          </div>
          <ol className="gear-overflow__list" aria-label="Over-capacity balls">
            {overflow.map((entry, index) => (
              <li key={entry.id}>
                <span className="gear-overflow__order">Overflow {index + 1}</span>
                <BallImage path={entry.ball.thumbnailImage} name={entry.ball.name} size="small" />
                <span className="gear-overflow__copy"><strong>{entry.ball.name}</strong><span>{entry.ball.brand || 'Brand not recorded'} · {entry.role || 'No role'}</span></span>
                <button className="btn btn-danger" type="button" disabled={removeEntry.isPending} onClick={() => removeEntry.mutate(entry.id)} aria-label={`Remove ${entry.ball.name} from bag`}>
                  {removeEntry.isPending && removeEntry.variables === entry.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ol>
          {removeEntry.isError && <p className="gear-form__error">The extra ball could not be removed. Check the connection and try again.</p>}
        </section>
      )}

      <section className="gear-section" aria-labelledby="coverage-heading">
        <div className="gear-section__head"><h2 id="coverage-heading">Coverage check</h2><p>Roles represented in this bag</p></div>
        <div className="gear-coverage">
          {coverage.map((item) => (
            <div className={`gear-coverage__item${item.covered ? '' : ' is-gap'}`} key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.covered ? 'Covered' : 'Gap'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="gear-section">
        <div className="gear-section__head"><h2>Performance</h2><label><span className="sr-only">Sort ball performance</span><select value={performanceSort} onChange={(event) => setPerformanceSort(event.target.value as typeof performanceSort)}><option value="average">Average</option><option value="games">Games</option><option value="high">High game</option></select></label></div>
        <div className="gear-metrics">
          <div className="gear-metric"><span>Games</span><strong>{arsenal.stats?.gamesPlayed ?? 0}</strong></div>
          <div className="gear-metric"><span>Average</span><strong>{arsenal.stats?.averageScore ?? 0}</strong></div>
          <div className="gear-metric"><span>High game</span><strong>{arsenal.stats?.highGame ?? 0}</strong></div>
        </div>
        {performance.length ? (
          <div className="gear-performance" style={{ marginTop: 10 }}>
            {performance.map((ball) => <div className="gear-performance__row" key={`${ball.ballId}-${ball.role || 'none'}`}><span><strong>{ball.ballName}</strong>{ball.role && <span className="gear-chip">{ball.role}</span>}</span>{ball.gamesPlayed > 0 ? <><span title="Games"><span className="sr-only">Games: </span>{ball.gamesPlayed}g</span><span title="Average"><span className="sr-only">Average: </span>{ball.averageScore}</span><span title="High game"><span className="sr-only">High game: </span>{ball.highGame}</span></> : <span className="gear-performance__unused">Never used</span>}</div>)}
          </div>
        ) : <p className="gear-result-count" style={{ marginTop: 12 }}>Performance appears after games are logged with these balls.</p>}
      </section>

      <section className="gear-section">
        <div className="gear-section__head"><h2>Bag notes</h2><p>{notes === (arsenal.notes || '') ? 'Saved' : 'Unsaved changes'}</p></div>
        <div className="gear-form">
          <label><span className="sr-only">Arsenal notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Starting line, transition plan, or surface changes" /></label>
          {updateArsenal.isError && <p className="gear-form__error">Notes could not be saved. Check the connection and try again.</p>}
          <div className="gear-form__actions"><button className="btn btn-ghost" type="button" disabled={updateArsenal.isPending || notes === (arsenal.notes || '')} onClick={() => updateArsenal.mutate()}>{updateArsenal.isPending ? 'Saving…' : 'Save notes'}</button></div>
        </div>
      </section>

      <GearSheet open={addSlot !== null} onClose={() => setAddSlot(null)} title={`Fill slot ${addSlot ?? ''}`} description="Choose an available ball and assign its first job.">
        {ballsQuery.isLoading ? <GearState kind="loading" title="Checking your library" detail="Loading equipment that is not already in this bag." /> : ballsQuery.isError ? <GearState kind="error" title="Ball library unavailable" detail="Your equipment could not be loaded. Check the connection and try again." action={<button className="btn btn-ghost" type="button" onClick={() => void ballsQuery.refetch()}>Try again</button>} /> : !availableBalls.length ? <GearState kind="empty" title="No balls available" detail="Every saved ball is already in this arsenal. Add equipment to the library first." action={<Link className="btn btn-primary" to="/balls">Open ball library</Link>} /> : (
          <div className="gear-form">
            <label>Ball<select value={addForm.ballId} onChange={(event) => setAddForm({ ...addForm, ballId: event.target.value })}><option value="">Choose a ball</option>{availableBalls.map((ball) => <option value={ball.id} key={ball.id}>{ball.name}{ball.brand ? ` · ${ball.brand}` : ''}</option>)}</select></label>
            <label>Role<select value={addForm.role} onChange={(event) => setAddForm({ ...addForm, role: event.target.value })}>{ROLES.map((role) => <option value={role} key={role}>{role}</option>)}</select></label>
            <label>Notes<input value={addForm.notes} onChange={(event) => setAddForm({ ...addForm, notes: event.target.value })} placeholder="When this ball comes out" /></label>
            {addBall.isError && <p className="gear-form__error">The ball could not be added. Check the connection and try again.</p>}
            <div className="gear-form__actions"><button className="btn btn-primary" type="button" disabled={!addForm.ballId || addBall.isPending} onClick={() => addBall.mutate({ ballId: Number(addForm.ballId), role: addForm.role, slotOrder: Number(addForm.slotOrder), notes: addForm.notes || null })}>{addBall.isPending ? 'Adding…' : 'Add to bag'}</button></div>
          </div>
        )}
      </GearSheet>

      <GearSheet open={Boolean(selectedEntry)} onClose={() => setSelectedEntry(null)} title={selectedEntry ? `Edit ${selectedEntry.ball.name}` : 'Edit ball'} description="Change this ball’s job or position in the bag.">
        {selectedEntry && <div className="gear-form">
          <div className="gear-detail-hero"><BallImage path={selectedEntry.ball.thumbnailImage} name={selectedEntry.ball.name} size="large" /><div><h3>{selectedEntry.ball.name}</h3><p>{selectedEntry.ball.brand || 'Brand not recorded'}</p></div></div>
          <div className="gear-form__row">
            <label>Role<select value={editEntry.role} onChange={(event) => setEditEntry({ ...editEntry, role: event.target.value })}>{ROLES.map((role) => <option value={role} key={role}>{role}</option>)}</select></label>
            <label>Slot<select value={editEntry.slotOrder} onChange={(event) => setEditEntry({ ...editEntry, slotOrder: event.target.value })}>{slots.map((entry, index) => (!entry || entry.id === selectedEntry.id) && <option value={index + 1} key={index + 1}>Slot {index + 1}</option>)}</select></label>
          </div>
          <label>Notes<input value={editEntry.notes} onChange={(event) => setEditEntry({ ...editEntry, notes: event.target.value })} /></label>
          {(updateEntry.isError || removeEntry.isError) && <p className="gear-form__error">The bag could not be changed. Check the connection and try again.</p>}
          <div className="gear-danger-row"><button className="btn btn-danger" type="button" disabled={removeEntry.isPending} onClick={() => removeEntry.mutate(selectedEntry.id)}>{removeEntry.isPending ? 'Removing…' : 'Remove from bag'}</button><button className="btn btn-primary" type="button" disabled={updateEntry.isPending} onClick={() => updateEntry.mutate({ entryId: selectedEntry.id, payload: { role: editEntry.role, slotOrder: Number(editEntry.slotOrder), notes: editEntry.notes || null } })}>{updateEntry.isPending ? 'Saving…' : 'Save changes'}</button></div>
        </div>}
      </GearSheet>
    </div>
  )
}

function ArsenalDetailView({ id }: { id: number }) {
  const arsenalQuery = useQuery<ArsenalDetail>({ queryKey: ['arsenal', id], queryFn: () => arsenalJson<ArsenalDetail>(`/${id}`) })
  if (arsenalQuery.isLoading) return <div className="gear-workspace"><GearNavigation /><GearState kind="loading" title="Opening this bag" detail="Loading ball roles and performance." /></div>
  if (arsenalQuery.isError || !arsenalQuery.data) return <div className="gear-workspace"><GearNavigation /><GearState kind="error" title="Arsenal unavailable" detail="This bag could not be loaded. It may have been removed, or the connection failed." action={<button className="btn btn-ghost" type="button" onClick={() => void arsenalQuery.refetch()}>Try again</button>} /></div>
  return <ArsenalDetailContent arsenal={arsenalQuery.data} />
}

export default function ArsenalsPage() {
  const { id } = useParams()
  const location = useLocation()
  if (id) return <ArsenalDetailView id={Number(id)} />
  return <ArsenalList createMode={location.pathname === '/arsenals/new'} />
}
