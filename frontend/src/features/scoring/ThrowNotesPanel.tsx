import { Icon } from '../../design'
import {
  adjustmentOptions,
  laneBoardCount,
  laneFeelOptions,
  leaveOptions,
  reactionOptions,
  type Adjustment,
  type LaneFeel,
  type Leave,
  type Reaction,
} from './laneNotes'
import { hasThrowNotes, type ThrowNotes, throwNoteSummary } from './throwNotes'

const entryArrowBoards = [5, 10, 15, 20, 25, 30, 35]

interface ThrowNotesPanelProps {
  notes: ThrowNotes[]
  throwCount: number
  selectedThrowIndex: number | null
  open: boolean
  onToggle: () => void
  onSelectThrow: (index: number) => void
  onChange: (index: number, notes: ThrowNotes) => void
}

function selectedClass(selected: boolean) {
  return `lane-notes-chip${selected ? ' is-selected' : ''}`
}

export default function ThrowNotesPanel({
  notes,
  throwCount,
  selectedThrowIndex,
  open,
  onToggle,
  onSelectThrow,
  onChange,
}: ThrowNotesPanelProps) {
  const hasThrows = throwCount > 0
  const selectedIndex = hasThrows
    ? Math.min(throwCount - 1, Math.max(0, selectedThrowIndex ?? throwCount - 1))
    : null
  const selectedNotes = selectedIndex == null ? {} : notes[selectedIndex] ?? {}
  const entryBoard = selectedNotes.entryBoard ?? 20
  const summary = selectedIndex == null
    ? 'Record a throw to start tracking'
    : throwNoteSummary(selectedNotes, selectedIndex) ?? 'Add a cue for this throw'

  const update = (next: Partial<ThrowNotes>) => {
    if (selectedIndex == null) return
    onChange(selectedIndex, { ...selectedNotes, ...next })
  }

  const chooseReaction = (value: Reaction) => update({ reaction: selectedNotes.reaction === value ? undefined : value })
  const chooseLaneFeel = (value: LaneFeel) => update({ laneFeel: selectedNotes.laneFeel === value ? undefined : value })
  const chooseLeave = (value: Leave) => update({ leave: selectedNotes.leave === value ? undefined : value })
  const chooseAdjustment = (value: Adjustment) => update({
    adjustment: selectedNotes.adjustment === value ? undefined : value,
    moveBoards: value === 'moved-feet' && selectedNotes.adjustment !== value
      ? selectedNotes.moveBoards ?? 2
      : undefined,
  })

  const moveSelection = (delta: number) => {
    if (selectedIndex == null) return
    onSelectThrow(Math.min(throwCount - 1, Math.max(0, selectedIndex + delta)))
  }

  return (
    <section className={`lane-notes throw-notes${open ? ' is-open' : ''}`} aria-label="Throw notes">
      <button type="button" className="lane-notes-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="lane-notes-toggle-icon"><Icon name="lane" size={18} /></span>
        <span className="lane-notes-toggle-copy">
          <strong>Throw notes</strong>
          <small>{summary}</small>
        </span>
        <Icon name={open ? 'chevron-right' : 'plus'} size={17} className={open ? 'lane-notes-chevron is-open' : ''} />
      </button>

      {open && (
        <div className="lane-notes-body">
          <div className="throw-notes-selector">
            <div className="throw-notes-selector__heading">
              <p className="lane-notes-label">Throw to annotate</p>
              <strong>{selectedIndex == null ? 'No throws yet' : `Throw ${selectedIndex + 1} of ${throwCount}`}</strong>
            </div>
            <div className="throw-notes-selector__controls">
              <button type="button" className="scoring-button secondary" disabled={selectedIndex == null || selectedIndex === 0} onClick={() => moveSelection(-1)}>Previous throw</button>
              <input
                className="throw-notes-range"
                aria-label="Throw to annotate"
                type="range"
                min="1"
                max={Math.max(1, throwCount)}
                step="1"
                value={(selectedIndex ?? 0) + 1}
                disabled={!hasThrows}
                onChange={(event) => onSelectThrow(Number(event.target.value) - 1)}
              />
              <button type="button" className="scoring-button secondary" disabled={selectedIndex == null || selectedIndex === throwCount - 1} onClick={() => moveSelection(1)}>Next throw</button>
            </div>
            <p className="throw-notes-hint">New throws start with the previous throw’s cues. Update only what changed; leaves stay unique to each throw.</p>
          </div>

          {selectedIndex != null && (
            <>
              <div className="lane-notes-group">
                <p className="lane-notes-label">Lane feel</p>
                <div className="lane-notes-chips" role="group" aria-label="Lane feel">
                  {laneFeelOptions.map((option) => (
                    <button type="button" key={option.value} className={selectedClass(selectedNotes.laneFeel === option.value)} aria-pressed={selectedNotes.laneFeel === option.value} onClick={() => chooseLaneFeel(option.value)}>{option.label}</button>
                  ))}
                </div>
              </div>

              <div className="lane-notes-group">
                <p className="lane-notes-label">Ball reaction</p>
                <div className="lane-notes-chips" role="group" aria-label="Ball reaction">
                  {reactionOptions.map((option) => (
                    <button type="button" key={option.value} className={selectedClass(selectedNotes.reaction === option.value)} aria-pressed={selectedNotes.reaction === option.value} onClick={() => chooseReaction(option.value)}>{option.label}</button>
                  ))}
                </div>
              </div>

              <div className="lane-notes-group">
                <p className="lane-notes-label">Adjustment</p>
                <div className="lane-notes-chips" role="group" aria-label="Adjustment">
                  {adjustmentOptions.map((option) => (
                    <button type="button" key={option.value} className={selectedClass(selectedNotes.adjustment === option.value)} aria-pressed={selectedNotes.adjustment === option.value} onClick={() => chooseAdjustment(option.value)}>{option.label}</button>
                  ))}
                </div>
                {selectedNotes.adjustment === 'moved-feet' && (
                  <label className="lane-notes-range">
                    <span>Feet moved <output>{selectedNotes.moveBoards ?? 2} boards</output></span>
                    <input aria-label="Boards moved with feet" type="range" min="1" max="10" step="1" value={selectedNotes.moveBoards ?? 2} onChange={(event) => update({ moveBoards: Number(event.target.value) })} />
                    <span className="lane-notes-range-scale"><span>1</span><span>10</span></span>
                  </label>
                )}
              </div>

              <div className="lane-notes-group">
                <p className="lane-notes-label">Line and release</p>
                <label className="lane-notes-range">
                  <span>Starting board <output>{selectedNotes.startingBoard ?? 20}</output></span>
                  <input className="lane-notes-board-input" aria-label="Starting board" type="range" min="1" max={laneBoardCount} step="1" value={selectedNotes.startingBoard ?? 20} onChange={(event) => update({ startingBoard: Number(event.target.value) })} />
                  <span className="lane-notes-range-scale lane-notes-board-scale"><span>{laneBoardCount}</span><span>1</span></span>
                </label>
                <label className="lane-notes-range">
                  <span>Target board <output>{selectedNotes.targetBoard ?? 20}</output></span>
                  <input className="lane-notes-board-input" aria-label="Target board" type="range" min="1" max={laneBoardCount} step="1" value={selectedNotes.targetBoard ?? 20} onChange={(event) => update({ targetBoard: Number(event.target.value) })} />
                  <span className="lane-notes-range-scale lane-notes-board-scale"><span>{laneBoardCount}</span><span>1</span></span>
                </label>
                <div className="lane-notes-arrow-control">
                  <div className="lane-notes-range-heading">
                    <span>Entry at arrows</span>
                    <output>{entryBoard}</output>
                  </div>
                  <div className="lane-notes-arrow-picker">
                    <div className="lane-notes-arrow-lane" aria-hidden="true">
                      {entryArrowBoards.map((board) => (
                        <span
                          key={board}
                          className={`lane-notes-arrow-marker${entryBoard === board ? ' is-selected' : ''}`}
                          data-board={board}
                          style={{ left: `${((laneBoardCount - board) / (laneBoardCount - 1)) * 100}%` }}
                        />
                      ))}
                    </div>
                    <input
                      className="lane-notes-arrow-input"
                      aria-label="Entry at arrows"
                      aria-valuetext={`${entryBoard} board`}
                      type="range"
                      min="1"
                      max={laneBoardCount}
                      step="1"
                      value={entryBoard}
                      onChange={(event) => update({ entryBoard: Number(event.target.value) })}
                    />
                  </div>
                  <div className="lane-notes-arrow-scale" aria-hidden="true"><span>{laneBoardCount}</span><span>20</span><span>1</span></div>
                  <p className="lane-notes-arrow-hint">Drag across the lane to mark the board your ball crosses.</p>
                </div>
                <label className="lane-notes-speed">
                  <span>Ball speed <output>{selectedNotes.speed == null ? '—' : `${selectedNotes.speed.toFixed(1)} mph`}</output></span>
                  <input aria-label="Ball speed" type="range" min="14" max="20" step="0.5" value={selectedNotes.speed ?? 17} onChange={(event) => update({ speed: Number(event.target.value) })} />
                </label>
              </div>

              <div className="lane-notes-group">
                <p className="lane-notes-label">Leave to remember</p>
                <div className="lane-notes-chips" role="group" aria-label="Leave to remember">
                  {leaveOptions.map((option) => (
                    <button type="button" key={option.value} className={selectedClass(selectedNotes.leave === option.value)} aria-pressed={selectedNotes.leave === option.value} onClick={() => chooseLeave(option.value)}>{option.label}</button>
                  ))}
                </div>
              </div>

              {hasThrowNotes(selectedNotes) && (
                <button type="button" className="lane-notes-clear" onClick={() => onChange(selectedIndex, {})}>Clear notes for throw {selectedIndex + 1}</button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
