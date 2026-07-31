import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useSettings } from '../hooks/useSettings'
import { Icon } from '../design'
import { localDateValue } from '../features/scoring/date'
import '../features/scoring/scoring.css'

interface SessionDraft {
  date: string
  location: string
  lanes: string
  notes: string
}

interface CreatedSession {
  id: number
}

export default function NewSession() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { settings } = useSettings()
  const [showDetails, setShowDetails] = useState(false)
  const [form, setForm] = useState<SessionDraft>({
    date: localDateValue(),
    location: settings.homeLanes || 'Home Lanes',
    lanes: '',
    notes: '',
  })

  const createSession = useMutation({
    mutationFn: async (draft: SessionDraft) => {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!response.ok) throw new Error('The session could not be created.')
      return response.json() as Promise<CreatedSession>
    },
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}?start=1`)
    },
  })

  const updateField = (field: keyof SessionDraft, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="scoring-flow scoring-page">
      <div className="scoring-page-header">
        <div>
          <p className="scoring-eyebrow">Start</p>
          <h1 className="scoring-large-title">New session</h1>
          <p className="scoring-subtitle">Confirm where you are. The scorer opens next.</p>
        </div>
        <Link to="/sessions" className="scoring-button quiet">
          <Icon name="back" size={18} /> Sessions
        </Link>
      </div>

      <section className="scoring-group" aria-label="Session setup">
        <div className="scoring-field">
          <label htmlFor="session-date">Date</label>
          <input id="session-date" type="date" value={form.date} onChange={(event) => updateField('date', event.target.value)} />
        </div>
        <div className="scoring-field">
          <label htmlFor="session-location">Center</label>
          <input
            id="session-location"
            type="text"
            autoComplete="organization"
            placeholder="Home Lanes"
            value={form.location}
            onChange={(event) => updateField('location', event.target.value)}
          />
        </div>
        <div className="scoring-field">
          <label htmlFor="session-lanes">Lanes <span aria-hidden="true">·</span> optional</label>
          <input id="session-lanes" type="text" inputMode="numeric" placeholder="5–6" value={form.lanes} onChange={(event) => updateField('lanes', event.target.value)} />
        </div>
      </section>

      <div className="scoring-disclosure">
        <button type="button" className="scoring-button quiet" aria-expanded={showDetails} onClick={() => setShowDetails((visible) => !visible)}>
          {showDetails ? 'Hide details' : 'Add details'}
          <Icon name="chevron-right" size={16} />
        </button>
      </div>

      {showDetails && (
        <section className="scoring-group" aria-label="Optional session details">
          <div className="scoring-field">
            <label htmlFor="session-notes">Notes or conditions</label>
            <textarea
              id="session-notes"
              placeholder="Oil pattern, transition, or what you are working on"
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
            />
          </div>
        </section>
      )}

      {createSession.isError && (
        <p className="scoring-error" role="alert">The session was not created. Check your connection and try again.</p>
      )}

      <button
        type="button"
        className="scoring-button primary wide"
        disabled={!form.date || !form.location.trim() || createSession.isPending}
        onClick={() => createSession.mutate({ ...form, location: form.location.trim() })}
      >
        {createSession.isPending ? 'Starting…' : 'Start bowling'}
      </button>
    </div>
  )
}
