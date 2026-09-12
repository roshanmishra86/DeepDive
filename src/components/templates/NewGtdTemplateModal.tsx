import { useState } from 'react'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { useTemplatesStore } from '../../stores/templates'
import type { TemplateCategory, TemplateDestination } from '../../db/types'

interface NewGtdTemplateModalProps {
  onClose: () => void
}

const CATEGORY_OPTIONS: { value: TemplateCategory; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal' },
  { value: 'ritual', label: 'Ritual' },
  { value: 'admin', label: 'Admin' },
]

const ICON_OPTIONS = [
  { value: 'target', label: 'Target' },
  { value: 'sun', label: 'Sun' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'file-text', label: 'Document' },
  { value: 'shopping-cart', label: 'Cart' },
  { value: 'users', label: 'Users' },
  { value: 'heart', label: 'Health' },
  { value: 'bug', label: 'Bug' },
]

export function NewGtdTemplateModal({ onClose }: NewGtdTemplateModalProps) {
  const createTemplate = useTemplatesStore((s) => s.createTemplate)
  const addBlock = useTemplatesStore((s) => s.addBlock)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('work')
  const [destination, setDestination] = useState<TemplateDestination>('inbox')
  const [icon, setIcon] = useState('target')
  const [tasks, setTasks] = useState<{ title: string; tag: string }[]>([
    { title: '', tag: 'Setup' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleAddTaskField = () => {
    setTasks((prev) => [...prev, { title: '', tag: 'Setup' }])
  }

  const handleUpdateTask = (index: number, title: string, tag: string) => {
    setTasks((prev) => {
      const updated = [...prev]
      updated[index] = { title, tag }
      return updated
    })
  }

  const handleRemoveTaskField = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('Please enter a template name.')
      return
    }

    setSubmitting(true)
    setFormError(null)

    try {
      const newId = await createTemplate({
        name: trimmedName,
        description: description.trim(),
        category,
        destination,
        icon,
        startMin: 480,
      })

      if (newId) {
        // Add valid tasks
        for (const t of tasks) {
          const tTitle = t.title.trim()
          if (tTitle) {
            await addBlock({
              title: tTitle,
              kind: 'deep',
              durationMin: 25,
              tag: t.tag.trim() || 'Setup',
            })
          }
        }
      }

      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create template')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: 520, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="new-template-title"
      >
        <div className="modal-header">
          <h2 id="new-template-title" className="modal-title">
            New Template
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {formError && <div className="modal-error">{formError}</div>}

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="modal-form-group">
            <label className="modal-label" htmlFor="tpl-name-input">
              Template name
            </label>
            <input
              id="tpl-name-input"
              type="text"
              className="modal-input"
              placeholder="e.g. Deep work session prep"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="modal-form-group">
            <label className="modal-label" htmlFor="tpl-desc-input">
              Description (optional)
            </label>
            <input
              id="tpl-desc-input"
              type="text"
              className="modal-input"
              placeholder="A reusable checklist for starting focused work..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="modal-form-group">
              <label className="modal-label" htmlFor="tpl-category-select">
                Category
              </label>
              <select
                id="tpl-category-select"
                className="modal-input"
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-form-group">
              <label className="modal-label" htmlFor="tpl-dest-select">
                Default Destination
              </label>
              <select
                id="tpl-dest-select"
                className="modal-input"
                value={destination}
                onChange={(e) => setDestination(e.target.value as TemplateDestination)}
              >
                <option value="inbox">Today</option>
                <option value="todo">TODO</option>
              </select>
            </div>
          </div>

          <div className="modal-form-group">
            <label className="modal-label" htmlFor="tpl-icon-select">
              Icon
            </label>
            <select
              id="tpl-icon-select"
              className="modal-input"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            >
              {ICON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Initial Tasks List */}
          <div className="modal-form-group">
            <label className="modal-label">Initial Tasks</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map((task, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    className="modal-input"
                    style={{ flex: 1 }}
                    placeholder={`Task ${idx + 1} title...`}
                    value={task.title}
                    onChange={(e) => handleUpdateTask(idx, e.target.value, task.tag)}
                  />
                  <input
                    type="text"
                    className="modal-input"
                    style={{ width: 110 }}
                    placeholder="Tag"
                    value={task.tag}
                    onChange={(e) => handleUpdateTask(idx, task.title, e.target.value)}
                  />
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => handleRemoveTaskField(idx)}
                      aria-label="Remove task"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="tpl-btn-secondary"
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
                onClick={handleAddTaskField}
              >
                <Plus size={14} />
                <span>Add another task</span>
              </button>
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="tpl-btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tpl-btn-primary"
              disabled={submitting || !name.trim()}
            >
              {submitting ? 'Creating…' : 'Create template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
