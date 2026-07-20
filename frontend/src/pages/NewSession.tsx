import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '../hooks/useSettings'

export default function NewSession() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { settings } = useSettings()
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [form, setForm] = useState({ date: today, location: settings.homeLanes || '', lanes: '', notes: '' })

  const create = useMutation({
    mutationFn: (data: object) => fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
  })

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ marginBottom: 16 }}>New Session</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <div style={{ overflow: 'hidden' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Date</div>
          <input type="date" value={form.date} onChange={f('date')} style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }} />
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Location</div>
          <input type="text" placeholder="Bowling alley name" value={form.location} onChange={f('location')} />
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Lanes</div>
          <input type="text" placeholder="e.g. 5-6" value={form.lanes} onChange={f('lanes')} />
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Notes</div>
          <input type="text" placeholder="Oil pattern, conditions, etc." value={form.notes} onChange={f('notes')} />
        </div>

        <button onClick={() => create.mutate(form)} disabled={create.isPending} className="btn btn-primary" style={{ width: '100%', marginTop: 4, minHeight: 50 }}>
          {create.isPending ? 'Creating...' : 'Create Session'}
        </button>
      </div>
    </div>
  )
}
