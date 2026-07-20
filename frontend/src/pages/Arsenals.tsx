import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

type UseCase = 'League' | 'Tournament' | 'Practice' | 'Sport Shot' | 'Custom'

interface Ball {
  id: number
  name: string
  brand: string | null
  thumbnailImage: string | null
}

interface Arsenal {
  id: number
  name: string
  description: string | null
  useCase: UseCase | null
  maxSize: number
  notes: string | null
  ballCount?: number
}

interface ArsenalBall {
  id: number
  ballId: number
  role: string | null
  slotOrder: number
  notes: string | null
  ball: Ball
}

interface ArsenalStats {
  gamesPlayed: number
  averageScore: number
  highGame: number
  byBall: Array<{ ballId: number; ballName: string; role: string | null; gamesPlayed: number; averageScore: number; highGame: number }>
  byUseCase: {
    open: { games: number; average: number }
    league: { games: number; average: number }
    tournament: { games: number; average: number }
  }
}

interface ArsenalDetail extends Arsenal {
  balls: ArsenalBall[]
  stats?: ArsenalStats
}

const USE_CASES: UseCase[] = ['League', 'Tournament', 'Practice', 'Sport Shot', 'Custom']
const ROLES = ['Strike', 'Spare', 'Heavy Oil', 'Dry Lane', 'Benchmark', 'Wet-Dry', 'Backup Ball', 'Custom']

const roleColors: Record<string, string> = {
  Strike: 'rgba(245,158,11,0.18)',
  Spare: 'rgba(59,130,246,0.18)',
  'Heavy Oil': 'rgba(88,28,135,0.28)',
  'Dry Lane': 'rgba(234,179,8,0.18)',
  Benchmark: 'rgba(34,197,94,0.18)',
  'Wet-Dry': 'rgba(20,184,166,0.18)',
  Custom: 'rgba(107,114,128,0.2)',
  'Backup Ball': 'rgba(107,114,128,0.2)',
}

function chip(text: string | null, bg = 'rgba(167,139,250,0.18)') {
  if (!text) return null
  return <span style={{ background: bg, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px', fontSize: 11 }}>{text}</span>
}

function ListView({ createMode }: { createMode: boolean }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const [showCreate, setShowCreate] = useState(createMode)
  const [form, setForm] = useState({ name: '', description: '', useCase: 'League', maxSize: '6', notes: '' })

  useEffect(() => setShowCreate(createMode), [createMode])

  const { data } = useQuery<Arsenal[]>({ queryKey: ['arsenals'], queryFn: () => fetch('/api/arsenals').then(r => r.json()) })

  const create = useMutation({
    mutationFn: (payload: object) => fetch('/api/arsenals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json()),
    onSuccess: (created: Arsenal) => {
      qc.invalidateQueries({ queryKey: ['arsenals'] })
      nav(`/arsenals/${created.id}`)
    },
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1>Arsenals</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(s => !s)}>+ New Arsenal</button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
          <input placeholder="Name*" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <select value={form.useCase} onChange={e => setForm({ ...form, useCase: e.target.value })}>{USE_CASES.map(u => <option key={u} value={u}>{u}</option>)}</select>
          <input type="number" value={form.maxSize} onChange={e => setForm({ ...form, maxSize: e.target.value })} />
          <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <button className="btn btn-primary" disabled={!form.name.trim()} onClick={() => create.mutate({ name: form.name, description: form.description || null, useCase: form.useCase, maxSize: Number(form.maxSize || 6), notes: form.notes || null })}>Create</button>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {(data || []).map(a => (
          <Link key={a.id} to={`/arsenals/${a.id}`} className="card" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <strong>{a.name}</strong>
              {chip(a.useCase)}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{a.ballCount ?? 0} / {a.maxSize} balls</div>
            {a.description && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{a.description}</div>}
          </Link>
        ))}
      </div>
    </div>
  )
}

function DetailView({ id }: { id: number }) {
  const qc = useQueryClient()
  const { data: arsenal } = useQuery<ArsenalDetail>({ queryKey: ['arsenal', id], queryFn: () => fetch(`/api/arsenals/${id}`).then(r => r.json()) })
  const { data: balls } = useQuery<Ball[]>({ queryKey: ['balls'], queryFn: () => fetch('/api/balls').then(r => r.json()) })
  const [add, setAdd] = useState({ ballId: '', role: 'Strike', slotOrder: '', notes: '' })
  const [notes, setNotes] = useState('')
  const [sort, setSort] = useState<'avg' | 'games' | 'high'>('avg')

  useEffect(() => { setNotes(arsenal?.notes || '') }, [arsenal?.notes])

  const update = useMutation({
    mutationFn: (payload: object) => fetch(`/api/arsenals/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['arsenal', id] }),
  })

  const addBall = useMutation({
    mutationFn: (payload: object) => fetch(`/api/arsenals/${id}/balls`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['arsenal', id] }); setAdd({ ballId: '', role: 'Strike', slotOrder: '', notes: '' }) },
  })

  const removeBall = useMutation({
    mutationFn: (entryId: number) => fetch(`/api/arsenals/balls/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['arsenal', id] }),
  })

  const updateEntry = useMutation({
    mutationFn: ({ entryId, payload }: { entryId: number; payload: object }) => fetch(`/api/arsenals/balls/${entryId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['arsenal', id] }),
  })

  const availableBalls = useMemo(() => {
    const used = new Set((arsenal?.balls || []).map(b => b.ballId))
    return (balls || []).filter(b => !used.has(b.id))
  }, [balls, arsenal?.balls])

  if (!arsenal) return <div className="muted">Loading...</div>

  const byBall = [...(arsenal?.stats?.byBall || [])].sort((a, b) => sort === 'avg' ? b.averageScore - a.averageScore : sort === 'games' ? b.gamesPlayed - a.gamesPlayed : b.highGame - a.highGame)

  return (
    <div>
      <Link to="/arsenals" className="muted" style={{ textDecoration: 'none', fontSize: 12 }}>← Arsenals</Link>
      <h1 style={{ marginTop: 6 }}>{arsenal.name}</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>{chip(arsenal.useCase)}<span className="muted" style={{ fontSize: 12 }}>{arsenal.description}</span></div>

      <h2>Ball Slots</h2>
      <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        {Array.from({ length: arsenal.maxSize }).map((_, i) => {
          const slot = arsenal.balls.find(b => b.slotOrder === i + 1) || arsenal.balls[i]
          if (!slot) {
            return <div key={i} className="card" style={{ borderStyle: 'dashed', color: 'var(--muted)', textAlign: 'center', fontSize: 24 }}>+</div>
          }
          return (
            <div key={slot.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img alt={slot.ball.name} src={slot.ball.thumbnailImage ? `https://www.bowwwl.com${slot.ball.thumbnailImage}` : ''} style={{ width: 40, height: 40, borderRadius: 8, background: '#121226', objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div>{slot.ball.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{slot.ball.brand}</div>
              </div>
              {chip(slot.role, roleColors[slot.role || 'Custom'])}
              <button className="btn btn-ghost" style={{ minHeight: 30, padding: '4px 8px' }} onClick={() => {
                const nextRole = ROLES[(Math.max(0, ROLES.indexOf(slot.role || 'Strike')) + 1) % ROLES.length]
                updateEntry.mutate({ entryId: slot.id, payload: { role: nextRole, notes: slot.notes } })
              }}>Edit role</button>
              <button className="btn btn-danger" style={{ minHeight: 30, padding: '4px 8px' }} onClick={() => removeBall.mutate(slot.id)}>Remove</button>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        <h3>Add ball to arsenal</h3>
        <select value={add.ballId} onChange={e => setAdd({ ...add, ballId: e.target.value })}>
          <option value="">Choose ball</option>
          {availableBalls.map(b => <option key={b.id} value={b.id}>{b.name} {b.brand ? `(${b.brand})` : ''}</option>)}
        </select>
        <select value={add.role} onChange={e => setAdd({ ...add, role: e.target.value })}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
        <input type="number" placeholder="Slot order (optional)" value={add.slotOrder} onChange={e => setAdd({ ...add, slotOrder: e.target.value })} />
        <input placeholder="Notes" value={add.notes} onChange={e => setAdd({ ...add, notes: e.target.value })} />
        <button className="btn btn-primary" disabled={!add.ballId} onClick={() => addBall.mutate({ ballId: Number(add.ballId), role: add.role, slotOrder: add.slotOrder ? Number(add.slotOrder) : undefined, notes: add.notes || null })}>Add ball</button>
      </div>

      <h2>Performance Stats</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
        <div className="card" style={{ textAlign: 'center' }}><strong>{arsenal?.stats?.gamesPlayed ?? 0}</strong><div className="muted" style={{ fontSize: 11 }}>Games</div></div>
        <div className="card" style={{ textAlign: 'center' }}><strong>{arsenal?.stats?.averageScore ?? 0}</strong><div className="muted" style={{ fontSize: 11 }}>Average</div></div>
        <div className="card" style={{ textAlign: 'center' }}><strong>{arsenal?.stats?.highGame ?? 0}</strong><div className="muted" style={{ fontSize: 11 }}>High</div></div>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong>Per-ball</strong>
          <select style={{ width: 140 }} value={sort} onChange={e => setSort(e.target.value as 'avg' | 'games' | 'high')}>
            <option value="avg">Sort: Avg</option>
            <option value="games">Sort: Games</option>
            <option value="high">Sort: High</option>
          </select>
        </div>
        {byBall.map(b => <div key={`${b.ballId}-${b.role}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}><span>{b.ballName} {chip(b.role, roleColors[b.role || 'Custom'])}</span><span>G {b.gamesPlayed}</span><span>Avg {b.averageScore}</span><span>Hi {b.highGame}</span></div>)}
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <strong>By use case</strong>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Open: {arsenal?.stats?.byUseCase?.open?.games ?? 0} games · avg {arsenal?.stats?.byUseCase?.open?.average ?? 0}</div>
        <div className="muted" style={{ fontSize: 12 }}>League: {arsenal?.stats?.byUseCase?.league?.games ?? 0} games · avg {arsenal?.stats?.byUseCase?.league?.average ?? 0}</div>
        <div className="muted" style={{ fontSize: 12 }}>Tournament: {arsenal?.stats?.byUseCase?.tournament?.games ?? 0} games · avg {arsenal?.stats?.byUseCase?.tournament?.average ?? 0}</div>
      </div>

      <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => update.mutate({ name: arsenal.name, description: arsenal.description, useCase: arsenal.useCase, maxSize: arsenal.maxSize, notes: notes || null })} placeholder="Notes/context (saves on blur)" />
    </div>
  )
}

export default function ArsenalsPage() {
  const { id } = useParams()
  const loc = useLocation()
  if (id) return <DetailView id={Number(id)} />
  return <ListView createMode={loc.pathname === '/arsenals/new'} />
}
