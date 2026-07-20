import { useState } from 'react'
import { Link } from 'react-router-dom'
import QuickAddGame from '../components/QuickAddGame'

export default function QuickAdd() {
  const [done, setDone] = useState(false)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 64px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link to="/" style={{ color: 'var(--accent)', fontSize: 14 }}>← Home</Link>
      </div>
      <h1 style={{ marginBottom: 6 }}>🎳 Quick Add Game</h1>
      <p className="muted" style={{ marginBottom: 20, fontSize: 14 }}>
        Log a game in seconds — no session setup required.
      </p>

      {done ? (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Game logged!</div>
          <div className="muted" style={{ marginBottom: 24 }}>Head to a session to add more games.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" className="btn btn-primary">Dashboard</Link>
            <Link to="/sessions" className="btn btn-ghost">All Sessions</Link>
          </div>
        </div>
      ) : (
        <QuickAddGame
          onDone={(_gameId: number) => {
            setDone(true)
          }}
        />
      )}
    </div>
  )
}
