import { useState, useEffect } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import type { Task } from '../../db/types'

interface ImportFromTodoModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ImportFromTodoModal({ isOpen, onClose }: ImportFromTodoModalProps) {
  const tasks = useTasksStore((s) => s.tasks)
  const hydrateActive = useTasksStore((s) => s.hydrateActive)
  const currentDay = useDayStore((s) => s.currentDay)
  const importTasksFromTodo = useBlocksStore((s) => s.importTasksFromTodo)

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isOpen) {
      void hydrateActive()
      setSelectedIds(new Set())
      setSearch('')
    }
  }, [isOpen, hydrateActive])

  if (!isOpen) return null

  // Filter incomplete tasks that match search
  const availableTasks = tasks.filter((t) => !t.archived && !t.completedAt)
  const filteredTasks = availableTasks.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  )

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const handleImport = async () => {
    const toImport = availableTasks
      .filter((t) => selectedIds.has(t.id))
      .map((t: Task) => ({
        id: t.id,
        title: t.title,
        estimateMin: t.estimateMin,
        tags: t.tags,
        energy: t.energy,
      }))

    if (toImport.length > 0) {
      await importTasksFromTodo(currentDay, toImport)
    }
    onClose()
  }

  return (
    <div className="inbox-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="inbox-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="inbox-modal-header">
          <h2 className="inbox-modal-title">Import from TODO</h2>
          <button
            type="button"
            className="inbox-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="inbox-modal-body">
          <input
            type="text"
            className="quick-capture-input"
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
            }}
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {filteredTasks.length === 0 ? (
            <div className="inbox-modal-empty">
              {availableTasks.length === 0
                ? 'No incomplete tasks in TODO.'
                : 'No matching tasks found.'}
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isSelected = selectedIds.has(task.id)
              return (
                <div
                  key={task.id}
                  className={`inbox-modal-item ${isSelected ? 'inbox-modal-item-selected' : ''}`}
                  onClick={() => toggleSelect(task.id)}
                >
                  <div
                    className={`inbox-task-checkbox ${isSelected ? 'inbox-task-checkbox-checked' : ''}`}
                  >
                    {isSelected && <Check size={11} />}
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--text)', flex: 1 }}>
                    {task.title}
                  </span>
                  {task.estimateMin && (
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {task.estimateMin}m
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="inbox-modal-footer">
          <button type="button" className="inbox-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="inbox-btn-submit"
            onClick={() => void handleImport()}
            disabled={selectedIds.size === 0}
          >
            Import {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
