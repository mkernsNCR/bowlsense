import { Link } from 'react-router-dom'
import { Icon } from '../../design'

export interface SavedQuickGame {
  id: number
  startAnother: () => void
}

interface SavedGameConfirmationProps {
  gameId: number
  headingLevel: 'h1' | 'h2'
  onStartAnother: () => void
}

export default function SavedGameConfirmation({ gameId, headingLevel, onStartAnother }: SavedGameConfirmationProps) {
  const Heading = headingLevel

  return (
    <div className="scoring-status" role="status">
      <div className="scoring-save-check"><Icon name="check" size={34} /></div>
      <Heading className={headingLevel === 'h1' ? 'scoring-large-title' : undefined}>Game saved</Heading>
      <p className="scoring-subtitle">The score is ready in your session history.</p>
      <div className="scoring-toolbar" style={{ justifyContent: 'center', marginTop: 20 }}>
        <button type="button" className="scoring-button primary" onClick={onStartAnother}>
          <Icon name="plus" /> Add another
        </button>
        <Link to={`/score/${gameId}`} className="scoring-button secondary">Open score</Link>
        <Link to="/sessions" className="scoring-button secondary">View sessions</Link>
      </div>
    </div>
  )
}
