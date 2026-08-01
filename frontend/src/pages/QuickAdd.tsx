import { useState } from 'react'
import { Link } from 'react-router-dom'
import QuickAddGame from '../components/QuickAddGame'
import { Icon } from '../design'
import SavedGameConfirmation, { type SavedQuickGame } from '../features/scoring/SavedGameConfirmation'
import '../features/scoring/scoring.css'

export default function QuickAdd() {
  const [savedGame, setSavedGame] = useState<SavedQuickGame | null>(null)

  return (
    <div className="scoring-flow scoring-page">
      <div hidden={savedGame !== null}>
        <div className="scoring-page-header">
          <div>
            <p className="scoring-eyebrow">Quick add</p>
            <h1 className="scoring-large-title">Record a game</h1>
            <p className="scoring-subtitle">Use the defaults or change the center before you start.</p>
          </div>
          <Link to="/" className="scoring-button quiet"><Icon name="back" size={18} /> Today</Link>
        </div>
        <QuickAddGame onDone={(id, startAnother) => setSavedGame({ id, startAnother })} />
      </div>

      {savedGame && (
        <SavedGameConfirmation
          gameId={savedGame.id}
          headingLevel="h1"
          onStartAnother={() => {
            savedGame.startAnother()
            setSavedGame(null)
          }}
        />
      )}
    </div>
  )
}
