import { useState } from 'react'
import { Link } from 'react-router-dom'
import QuickAddGame from '../components/QuickAddGame'
import { Icon } from '../design'
import '../features/scoring/scoring.css'

export default function QuickAdd() {
  const [savedGameId, setSavedGameId] = useState<number | null>(null)

  if (savedGameId) {
    return (
      <div className="scoring-flow scoring-page">
        <div className="scoring-status" role="status">
          <div className="scoring-save-check"><Icon name="check" size={34} /></div>
          <h1 className="scoring-large-title">Game saved</h1>
          <p className="scoring-subtitle">The score is ready in your session history.</p>
          <div className="scoring-toolbar" style={{ justifyContent: 'center', marginTop: 20 }}>
            <button type="button" className="scoring-button primary" onClick={() => setSavedGameId(null)}><Icon name="plus" /> Add another</button>
            <Link to="/sessions" className="scoring-button secondary">View sessions</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="scoring-flow scoring-page">
      <div className="scoring-page-header">
        <div>
          <p className="scoring-eyebrow">Quick add</p>
          <h1 className="scoring-large-title">Record a game</h1>
          <p className="scoring-subtitle">Use the defaults or change the center before you start.</p>
        </div>
        <Link to="/" className="scoring-button quiet"><Icon name="back" size={18} /> Today</Link>
      </div>
      <QuickAddGame onDone={setSavedGameId} />
    </div>
  )
}
