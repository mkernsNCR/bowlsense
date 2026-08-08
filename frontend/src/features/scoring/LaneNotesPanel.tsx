import { useState } from 'react'
import { Icon } from '../../design'
import {
  adjustmentOptions,
  laneFeelOptions,
  leaveOptions,
  reactionOptions,
  type Adjustment,
  type LaneNotes,
  type Leave,
  type Reaction,
} from './laneNotes'

interface LaneNotesPanelProps {
  notes: LaneNotes
  open: boolean
  currentFrame: number
  onToggle: () => void
  onChange: (notes: LaneNotes) => void
}

function optionLabel<T extends string>(options: ReadonlyArray<{ value: T; label: string }>, value?: T) {
  return options.find((option) => option.value === value)?.label
}

function selectedClass(selected: boolean) {
  return `lane-notes-chip${selected ? ' is-selected' : ''}`
}

export default function LaneNotesPanel({ notes, open, currentFrame, onToggle, onChange }: LaneNotesPanelProps) {
  const [showLineDetail, setShowLineDetail] = useState(() => notes.startBoard != null || notes.endBoard != null)
  const suggestedFrame = Math.min(10, Math.max(1, currentFrame + 1))
  const summary = notes.reaction
    ? optionLabel(reactionOptions, notes.reaction)
    : notes.laneFeel
      ? optionLabel(laneFeelOptions, notes.laneFeel)
      : 'Tap a cue after the game'

  const update = (next: Partial<LaneNotes>) => onChange({ ...notes, ...next })
  const chooseReaction = (value: Reaction) => update({
    reaction: notes.reaction === value ? undefined : value,
    reactionFrame: value === 'flush' || notes.reaction === value ? undefined : notes.reactionFrame ?? suggestedFrame,
  })
  const chooseAdjustment = (value: Adjustment) => update({
    adjustment: notes.adjustment === value ? undefined : value,
    moveBoards: value === 'moved-feet' && notes.adjustment !== value ? notes.moveBoards ?? 2 : value === 'moved-feet' ? notes.moveBoards : undefined,
    ballChangeFrame: (value === 'ball-down' || value === 'ball-up') && notes.adjustment !== value
      ? notes.ballChangeFrame ?? suggestedFrame
      : (value === 'ball-down' || value === 'ball-up') ? notes.ballChangeFrame : undefined,
  })

  return (
    <section className={`lane-notes${open ? ' is-open' : ''}`} aria-label="Lane notes">
      <button type="button" className="lane-notes-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="lane-notes-toggle-icon"><Icon name="lane" size={18} /></span>
        <span className="lane-notes-toggle-copy">
          <strong>Lane notes</strong>
          <small>{summary}</small>
        </span>
        <Icon name={open ? 'chevron-right' : 'plus'} size={17} className={open ? 'lane-notes-chevron is-open' : ''} />
      </button>

      {open && (
        <div className="lane-notes-body">
          <div className="lane-notes-group">
            <p className="lane-notes-label">Lane feel</p>
            <div className="lane-notes-chips" role="group" aria-label="Lane feel">
              {laneFeelOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={selectedClass(notes.laneFeel === option.value)}
                  aria-pressed={notes.laneFeel === option.value}
                  onClick={() => update({ laneFeel: notes.laneFeel === option.value ? undefined : option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="lane-notes-group">
            <p className="lane-notes-label">Ball reaction</p>
            <div className="lane-notes-chips" role="group" aria-label="Ball reaction">
              {reactionOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={selectedClass(notes.reaction === option.value)}
                  aria-pressed={notes.reaction === option.value}
                  onClick={() => chooseReaction(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {notes.reaction && notes.reaction !== 'flush' && (
              <label className="lane-notes-range">
                <span>Noticed around frame <output>{notes.reactionFrame ?? suggestedFrame}</output></span>
                <input
                  aria-label="Frame reaction changed"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={notes.reactionFrame ?? suggestedFrame}
                  onChange={(event) => update({ reactionFrame: Number(event.target.value) })}
                />
                <span className="lane-notes-range-scale"><span>1</span><span>10</span></span>
              </label>
            )}
          </div>

          <div className="lane-notes-group">
            <p className="lane-notes-label">Adjustment</p>
            <div className="lane-notes-chips" role="group" aria-label="Adjustment">
              {adjustmentOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={selectedClass(notes.adjustment === option.value)}
                  aria-pressed={notes.adjustment === option.value}
                  onClick={() => chooseAdjustment(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {notes.adjustment === 'moved-feet' && (
              <label className="lane-notes-range">
                <span>Feet moved <output>{notes.moveBoards ?? 2} boards</output></span>
                <input
                  aria-label="Boards moved with feet"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={notes.moveBoards ?? 2}
                  onChange={(event) => update({ moveBoards: Number(event.target.value) })}
                />
                <span className="lane-notes-range-scale"><span>1</span><span>10</span></span>
              </label>
            )}
            {(notes.adjustment === 'ball-down' || notes.adjustment === 'ball-up') && (
              <label className="lane-notes-range">
                <span>Ball change around frame <output>{notes.ballChangeFrame ?? suggestedFrame}</output></span>
                <input
                  aria-label="Frame ball changed"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={notes.ballChangeFrame ?? suggestedFrame}
                  onChange={(event) => update({ ballChangeFrame: Number(event.target.value) })}
                />
                <span className="lane-notes-range-scale"><span>1</span><span>10</span></span>
              </label>
            )}
          </div>

          <div className="lane-notes-split">
            <div className="lane-notes-group">
              <p className="lane-notes-label">Leave to remember</p>
              <div className="lane-notes-chips" role="group" aria-label="Leave to remember">
                {leaveOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={selectedClass(notes.leave === option.value)}
                    aria-pressed={notes.leave === option.value}
                    onClick={() => update({ leave: notes.leave === option.value ? undefined : option.value as Leave })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="lane-notes-speed">
              <span>Speed <output>{notes.speed == null ? '—' : `${notes.speed.toFixed(1)} mph`}</output></span>
              <input
                aria-label="Ball speed"
                type="range"
                min="14"
                max="20"
                step="0.5"
                value={notes.speed ?? 17}
                onChange={(event) => update({ speed: Number(event.target.value) })}
              />
            </label>
          </div>

          {!showLineDetail ? (
            <button type="button" className="lane-notes-line-toggle" onClick={() => setShowLineDetail(true)}>
              <Icon name="lane" size={16} /> Track starting and finishing boards
            </button>
          ) : (
            <div className="lane-notes-line">
              <div className="lane-notes-line-heading">
                <p className="lane-notes-label">Line detail <span>optional</span></p>
                <button type="button" className="lane-notes-line-toggle" onClick={() => setShowLineDetail(false)}>Hide</button>
              </div>
              <label className="lane-notes-range">
                <span>Start board <output>{notes.startBoard ?? 20}</output></span>
                <input
                  aria-label="Starting board"
                  type="range"
                  min="1"
                  max="40"
                  step="1"
                  value={notes.startBoard ?? 20}
                  onChange={(event) => update({ startBoard: Number(event.target.value) })}
                />
                <span className="lane-notes-range-scale"><span>1</span><span>40</span></span>
              </label>
              <label className="lane-notes-range">
                <span>End board <output>{notes.endBoard ?? 20}</output></span>
                <input
                  aria-label="Ending board"
                  type="range"
                  min="1"
                  max="40"
                  step="1"
                  value={notes.endBoard ?? 20}
                  onChange={(event) => update({ endBoard: Number(event.target.value) })}
                />
                <span className="lane-notes-range-scale"><span>1</span><span>40</span></span>
              </label>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
