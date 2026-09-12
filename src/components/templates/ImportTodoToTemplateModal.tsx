import { useState } from 'react'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { CheckSquare } from '@phosphor-icons/react/dist/csr/CheckSquare'
import { useTasksStore } from '../../stores/tasks'
import { useTemplatesStore } from '../../stores/templates'
import type { TemplateCategory } from '../../db/types'

interface ImportTodoToTemplateModalProps {
  onClose: () => void
}

export function ImportTodoToTemplateModal({ onClose }: ImportTodoToTemplateModalProps) {
  const tasks = useTasksStore((s) => s.tasks)
  const createTemplate = useTemplatesStore((s) => s.createTemplate)
  const addBlock = useTemplatesStore((s) => s.addBlock)

  const [templateName, setTemplateName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('work')
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const incompleteTasks = tasks.filter((t) => !t.done && !t.archived)

  const toggleSelect = (id: number) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedTaskIds.size === incompleteTasks.length) {
      setSelectedTaskIds(new Set())
    } else {
      setSelectedTaskIds(new Set(incompleteTasks.map((t) => t.id)))
    }
  }

  const handleCreate = async () => {
    const trimmed = templateName.trim()
    if (!trimmed) {
      setError('Please provide a name for the new template.')
      return
    }
    if (selectedTaskIds.size === 0) {
      setError('Please select at least one task to import.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const newId = await createTemplate({
        name: trimmed,
        description: description.trim(),
        category,
        destination: 'inbox',
        icon: 'target',
        startMin: 480,
      })

      if (newId) {
        const chosenTasks = incompleteTasks.filter((t) => selectedTaskIds.has(t.id))
        for (const task of chosenTasks) {
          const firstTag = (task.tags && task.tags.length > 0) ? task.tags[0] : 'Execution'
          await addBlock({
            title: task.title,
            kind: 'deep',
            durationMin: task.estimateMin ?? 25,
            tag: firstTag,
          })
        }
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="import-todo-tpl-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="import-todo-tpl-title" className="modal-title">
              Import from TODO to Template
            </h2>
            <p className="modal-subtitle" style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Select tasks from your TODO backlog to create a reusable template.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div style={{ padding: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="modal-form-group">
            <label className="modal-label" htmlFor="import-tpl-name">
              Template name
            </label>
            <input
              id="import-tpl-name"
              type="text"
              className="modal-input"
              placeholder="e.g. Sprint Backlog Starter"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div className="modal-form-group">
              <label className="modal-label" htmlFor="import-tpl-desc">
                Description (optional)
              </label>
              <input
                id="import-tpl-desc"
                type="text"
                className="modal-input"
                placeholder="Template description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-label" htmlFor="import-tpl-cat">
                Category
              </label>
              <select
                id="import-tpl-cat"
                className="modal-input"
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
              >
                <option value="work">Work</option>
                <option value="personal">Personal</option>
                <option value="ritual">Ritual</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        </div>

        {/* Task Selection List */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Select tasks ({selectedTaskIds.size} of {incompleteTasks.length})
          </span>
          <button
            type="button"
            className="tpl-btn-secondary"
            style={{ padding: '4px 8px', fontSize: 11.5 }}
            onClick={handleSelectAll}
          >
            {selectedTaskIds.size === incompleteTasks.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 280, display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border-light, #e7e5e4)', borderRadius: 8, padding: 8 }}>
          {incompleteTasks.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>
              No incomplete tasks in TODO backlog.
            </div>
          ) : (
            incompleteTasks.map((t) => {
              const isSelected = selectedTaskIds.has(t.id)
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: isSelected ? '#f4f8f5' : '#ffffff',
                    border: '1px solid',
                    borderColor: isSelected ? '#2d4a3e' : 'var(--border-light, #e7e5e4)',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleSelect(t.id)}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: '1.5px solid',
                      borderColor: isSelected ? '#2d4a3e' : '#a8a29e',
                      background: isSelected ? '#2d4a3e' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && <CheckSquare size={12} weight="bold" color="#ffffff" />}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{t.title}</span>
                  {t.estimateMin && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t.estimateMin}m</span>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="tpl-btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tpl-btn-primary"
            onClick={() => void handleCreate()}
            disabled={submitting || !templateName.trim() || selectedTaskIds.size === 0}
          >
            {submitting ? 'Creating…' : `Create template with ${selectedTaskIds.size} tasks`}
          </button>
        </div>
      </div>
    </div>
  )
}
