import { useState } from 'react'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { ListBullets } from '@phosphor-icons/react/dist/csr/ListBullets'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { DotsSixVertical } from '@phosphor-icons/react/dist/csr/DotsSixVertical'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Tray } from '@phosphor-icons/react/dist/csr/Tray'
import { CheckSquare } from '@phosphor-icons/react/dist/csr/CheckSquare'
import { Tag } from '@phosphor-icons/react/dist/csr/Tag'
import { PencilSimple } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { formatWeekdays, formatLastUsed, getTagClass } from '../../lib/templates'
import type { TemplateDetail } from '../../stores/templates'
import type { TemplateDestination } from '../../db/types'

interface TemplateDetailViewProps {
  template: TemplateDetail
  onApply: (destination: TemplateDestination) => void
  onDuplicate: () => void
  onEdit: () => void
  onDestinationChange: (destination: TemplateDestination) => void
  onAddTask: (title: string, tag: string) => void
  onDeleteBlock: (id: number) => void
}

export function TemplateDetailView({
  template,
  onApply,
  onDuplicate,
  onEdit,
  onDestinationChange,
  onAddTask,
  onDeleteBlock,
}: TemplateDetailViewProps) {
  const [addingTask, setAddingTask] = useState(false)
  const [taskDraft, setTaskDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('Deep Work')

  const destination: TemplateDestination = template.destination ?? 'inbox'
  const isInbox = destination === 'inbox'
  const weekdayText = formatWeekdays(template.weekdays)
  const recurrenceLabel =
    template.weekdays === 31
      ? 'Workdays Mon – Fri'
      : template.weekdays === 127
      ? 'Every day'
      : template.weekdays === 0
      ? 'No repeat'
      : weekdayText

  const lastUsedLabel = formatLastUsed(template.lastUsedAt)
  const taskCount = template.blocks.length

  const handleCreateTask = () => {
    const trimmed = taskDraft.trim()
    if (!trimmed) return
    onAddTask(trimmed, tagDraft.trim() || 'Setup')
    setTaskDraft('')
    setAddingTask(false)
  }

  const primaryApplyText = isInbox ? 'Apply to Today' : 'Apply to TODO'

  return (
    <div className="tpl-detail-card">
      {/* Header Area */}
      <div className="tpl-detail-header-row">
        <div className="tpl-detail-title-group">
          <h2 className="tpl-detail-title">{template.name}</h2>
          {template.description && (
            <p className="tpl-detail-desc">{template.description}</p>
          )}
        </div>

        <div className="tpl-detail-actions">
          <button
            type="button"
            className="tpl-btn-primary"
            onClick={() => onApply(destination)}
            aria-label={primaryApplyText}
          >
            <span>{primaryApplyText}</span>
          </button>

          <button
            type="button"
            className="tpl-btn-secondary"
            onClick={onDuplicate}
            aria-label="Duplicate template"
          >
            <span>Duplicate</span>
          </button>

          <button
            type="button"
            className="tpl-btn-secondary"
            onClick={onEdit}
            aria-label="Edit template"
          >
            <span>Edit template</span>
          </button>
        </div>
      </div>

      {/* Metadata Badges Row */}
      <div className="tpl-badges-row">
        {template.weekdays > 0 && (
          <span className="tpl-meta-badge">
            <CalendarBlank size={14} />
            <span>{recurrenceLabel}</span>
          </span>
        )}

        <span className="tpl-meta-badge">
          <ListBullets size={14} />
          <span>{taskCount} tasks</span>
        </span>

        <span className="tpl-meta-badge">
          <Clock size={14} />
          <span>{lastUsedLabel}</span>
        </span>

        {template.favourite && (
          <span className="tpl-meta-badge favourite">
            <Star size={14} weight="fill" />
            <span>Favourite</span>
          </span>
        )}
      </div>

      {/* Tasks in this Template */}
      <div className="tpl-tasks-section">
        <div className="tpl-section-heading">TASKS IN THIS TEMPLATE</div>

        {template.blocks.map((block) => (
          <div key={block.id} className="tpl-task-item-row">
            <div className="tpl-task-left">
              <span className="tpl-task-drag" aria-hidden="true">
                <DotsSixVertical size={16} />
              </span>
              <div className="tpl-task-checkbox" role="checkbox" aria-checked="false" />
              <span className="tpl-task-title">{block.title}</span>
            </div>

            <div className="tpl-task-right">
              {block.tag ? (
                <span className={`tpl-task-tag ${getTagClass(block.tag)}`}>{block.tag}</span>
              ) : null}

              <button
                type="button"
                className="tpl-task-delete-btn"
                onClick={() => onDeleteBlock(block.id)}
                aria-label={`Delete task ${block.title}`}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}

        {addingTask ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              background: '#faf9f6',
              borderRadius: 8,
              border: '1px solid var(--border-light, #e7e5e4)',
            }}
          >
            <input
              type="text"
              className="tpl-search-input"
              style={{ flex: 1, padding: '6px 10px' }}
              placeholder="Task title..."
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTask()
                if (e.key === 'Escape') setAddingTask(false)
              }}
              autoFocus
            />
            <input
              type="text"
              className="tpl-search-input"
              style={{ width: 120, padding: '6px 10px' }}
              placeholder="Tag..."
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTask()
              }}
            />
            <button
              type="button"
              className="tpl-btn-primary"
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={handleCreateTask}
            >
              Add
            </button>
            <button
              type="button"
              className="tpl-btn-secondary"
              style={{ padding: '6px 10px', fontSize: 12 }}
              onClick={() => setAddingTask(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="tpl-add-task-row"
            onClick={() => setAddingTask(true)}
            aria-label="Add task to template"
          >
            <Plus size={14} />
            <span>Add task</span>
          </button>
        )}
      </div>

      {/* Split Destination & Preview Cards */}
      <div className="tpl-dest-preview-grid">
        {/* Where to send tasks */}
        <div className="tpl-subcard">
          <div>
            <h3 className="tpl-subcard-title">Where to send tasks</h3>
            <p className="tpl-subcard-desc">Choose the default destination when applying this template.</p>
          </div>

          <div className="tpl-dest-options-row">
            <div
              className={`tpl-dest-option-box ${isInbox ? 'selected' : ''}`}
              onClick={() => onDestinationChange('inbox')}
              role="radio"
              aria-checked={isInbox}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onDestinationChange('inbox')
              }}
            >
              <div className="tpl-dest-box-header">
                <Tray size={18} className="tpl-dest-icon" />
                <div className={`tpl-radio-circle ${isInbox ? 'checked' : ''}`}>
                  {isInbox && <div className="tpl-radio-inner-dot" />}
                </div>
              </div>
              <div className="tpl-dest-text">
                <span className="tpl-dest-name">Today</span>
                <span className="tpl-dest-sub">Add tasks to your Today view</span>
              </div>
            </div>

            <div
              className={`tpl-dest-option-box ${!isInbox ? 'selected' : ''}`}
              onClick={() => onDestinationChange('todo')}
              role="radio"
              aria-checked={!isInbox}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onDestinationChange('todo')
              }}
            >
              <div className="tpl-dest-box-header">
                <CheckSquare size={18} className="tpl-dest-icon" />
                <div className={`tpl-radio-circle ${!isInbox ? 'checked' : ''}`}>
                  {!isInbox && <div className="tpl-radio-inner-dot" />}
                </div>
              </div>
              <div className="tpl-dest-text">
                <span className="tpl-dest-name">TODO</span>
                <span className="tpl-dest-sub">Add tasks to your TODO</span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview on apply */}
        <div className="tpl-subcard">
          <div>
            <h3 className="tpl-subcard-title">Preview on apply</h3>
            <p className="tpl-subcard-desc">Here's what will happen when you apply this template.</p>
          </div>

          <div className="tpl-preview-list">
            <div className="tpl-preview-item">
              <span className="tpl-preview-badge">
                {isInbox ? (
                  <Tray size={14} className="tpl-preview-icon" />
                ) : (
                  <CheckSquare size={14} className="tpl-preview-icon" />
                )}
              </span>
              <span>{taskCount} tasks will be added to {isInbox ? 'Today' : 'TODO'}</span>
            </div>

            <div className="tpl-preview-item">
              <span className="tpl-preview-badge">
                <Tag size={14} className="tpl-preview-icon" />
              </span>
              <span>Tags will be preserved</span>
            </div>

            <div className="tpl-preview-item">
              <span className="tpl-preview-badge">
                <PencilSimple size={14} className="tpl-preview-icon" />
              </span>
              <span>You can edit tasks after applying</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
