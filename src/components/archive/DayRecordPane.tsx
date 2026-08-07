import { useState } from 'react'
import { useArchiveStore } from '../../stores/archive'
import { SaveTemplateModal } from '../templates/SaveTemplateModal'
import { dayRecordTitle, dayRecordMeta } from '../../lib/archive'
import { minutesToClock, splitDeepHours } from '../../lib/time'

export function DayRecordPane() {
  const selectedDay = useArchiveStore((s) => s.selectedDay)
  const record = useArchiveStore((s) => s.record)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)

  if (!selectedDay || !record) {
    return (
      <div className="arc-record-pane">
        <div className="view-empty">
          <div className="view-empty-title">No day selected</div>
        </div>
      </div>
    )
  }

  return (
    <div className="arc-record-pane">
      <div className="arc-record-header">
        <div>
          <div className="arc-record-title">{dayRecordTitle(selectedDay)}</div>
          <div className="arc-record-meta">{dayRecordMeta(record)}</div>
        </div>
        <button
          className="arc-save-template-btn"
          onClick={() => setShowSaveTemplate(true)}
          type="button"
          aria-label="Save this day as template"
        >
          Save as template
        </button>
      </div>

      <div className="arc-record-stats">
        <div className="arc-record-stat">
          <div className="arc-record-stat-value">{record.completedCount}</div>
          <div className="arc-record-stat-label">Completed</div>
        </div>
        <div className="arc-record-stat">
          <div className="arc-record-stat-value">
            {(() => {
              const { whole, frac } = splitDeepHours(record.deepMin)
              return `${whole}${frac}`
            })()}
          </div>
          <div className="arc-record-stat-label">Deep hours</div>
        </div>
        <div className="arc-record-stat">
          <div className="arc-record-stat-value">{record.pomodoros}</div>
          <div className="arc-record-stat-label">Pomodoros</div>
        </div>
      </div>

      <div className="arc-record-section">
        <div className="arc-record-section-label">Blocks on this day</div>
        <div className="arc-blocks-list">
          {record.blocks.length === 0 ? (
            <div className="arc-empty-blocks">No blocks on this day</div>
          ) : (
            record.blocks.map((block) => {
              const statusClass = block.completed ? 'arc-block-status-done' : 'arc-block-status-pending'
              return (
                <div key={block.id} className="arc-block-row">
                  <span className={`arc-block-status ${statusClass}`}>
                    {block.completed ? '✓' : ''}
                  </span>
                  <span className="arc-block-time">{minutesToClock(block.startMin)}</span>
                  <span className="arc-block-title">{block.title}</span>
                  <span className="arc-block-kind">{block.kind}</span>
                  <span className="arc-block-duration">{block.durationMin} min</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="arc-record-section">
        <div className="arc-record-section-label">Shut down note</div>
        <div className="arc-record-note">
          {record.note || <em className="arc-no-note">No note recorded</em>}
        </div>
      </div>

      {showSaveTemplate && (
        <SaveTemplateModal
          day={selectedDay}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}
    </div>
  )
}
