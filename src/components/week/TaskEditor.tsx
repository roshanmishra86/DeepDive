import { useState, useEffect, useRef } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { composeDueAt, decomposeDueAt } from '../../lib/week'

/**
 * The estimate is captured in hours (quarter-hour steps) but stored in
 * minutes — `Task.estimateMin` is what the scheduler and every other view
 * read, so the conversion lives here at the edge.
 */
const MIN_ESTIMATE_HOURS = 0.25
const MAX_ESTIMATE_HOURS = 24

function minutesToHoursField(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return ''
  // Two decimals covers quarter-hours exactly; trailing zeros are trimmed so
  // a 1-hour estimate reads "1", not "1.00".
  return String(Number((minutes / 60).toFixed(2)))
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

interface TaskEditorProps {
  taskId: number | null
  onClose: () => void
}

export function TaskEditor({ taskId, onClose }: TaskEditorProps) {
  const tasks = useTasksStore((s) => s.tasks)
  const addTask = useTasksStore((s) => s.addTask)
  const editTask = useTasksStore((s) => s.editTask)

  const task = taskId ? tasks.find((t) => t.id === taskId) : null

  const [title, setTitle] = useState(task?.title || '')
  const [notes, setNotes] = useState(task?.notes || '')
  const [important, setImportant] = useState(task?.important || false)
  const [urgent, setUrgent] = useState(task?.urgent || false)
  const initialDue = task?.dueAt ? decomposeDueAt(task.dueAt) : { date: '', time: '17:00' }
  const [dueDate, setDueDate] = useState(initialDue.date)
  const [dueTime, setDueTime] = useState(initialDue.time)
  const [estimateHours, setEstimateHours] = useState<string>(minutesToHoursField(task?.estimateMin))
  const [error, setError] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNotes(task.notes)
      setImportant(task.important)
      setUrgent(task.urgent)
      const due = task.dueAt ? decomposeDueAt(task.dueAt) : { date: '', time: '17:00' }
      setDueDate(due.date)
      setDueTime(due.time)
      setEstimateHours(minutesToHoursField(task.estimateMin))
    } else {
      setTitle('')
      setNotes('')
      setImportant(false)
      setUrgent(false)
      setDueDate('')
      setDueTime('17:00')
      setEstimateHours('')
    }
  }, [task])

  useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  const validate = () => {
    if (!title.trim()) {
      setError('Title is required')
      return false
    }
    if (estimateHours) {
      const hours = Number.parseFloat(estimateHours)
      if (!Number.isFinite(hours) || hours < MIN_ESTIMATE_HOURS || hours > MAX_ESTIMATE_HOURS) {
        setError(`Estimate must be between ${MIN_ESTIMATE_HOURS} and ${MAX_ESTIMATE_HOURS} hours`)
        return false
      }
    }
    if (dueDate && !dueTime) {
      setError('Due time is required when a due date is set')
      return false
    }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return

    try {
      const dueAt = composeDueAt(dueDate, dueTime)
      const estimateMinNum = estimateHours
        ? Math.round(Number.parseFloat(estimateHours) * 60)
        : null

      if (task) {
        // Edit existing task
        await editTask(task.id, {
          title: title.trim(),
          notes,
          important,
          urgent,
          dueAt,
          estimateMin: estimateMinNum,
        })
      } else {
        // Create new task
        await addTask({
          title: title.trim(),
          notes,
          important,
          urgent,
          dueAt,
          estimateMin: estimateMinNum,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  // Handles Escape (close), Cmd/Ctrl+Enter (save), and the Tab focus trap.
  // Bound once on the dialog container so it fires regardless of which
  // focusable element (input, checkbox, or button) currently has focus.
  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSave()
      return
    }
    if (e.key !== 'Tab') return

    const focusable = Array.from(
      modalRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) ?? []
    ) as HTMLElement[]

    if (focusable.length === 0) return

    const activeElement = document.activeElement as HTMLElement
    const activeIndex = focusable.indexOf(activeElement)

    if (e.shiftKey) {
      // Shift+Tab: move backward
      const targetIndex = activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1
      e.preventDefault()
      focusable[targetIndex]?.focus()
    } else {
      // Tab: move forward
      const targetIndex = activeIndex >= focusable.length - 1 ? 0 : activeIndex + 1
      e.preventDefault()
      focusable[targetIndex]?.focus()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleContainerKeyDown}
        ref={modalRef}
      >
        <div className="modal-header">
          <h2 id="task-editor-title" className="modal-title">
            {task ? 'Edit task' : 'New task'}
          </h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close task editor"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="task-editor-error">{error}</div>}

          <div className="task-editor-field">
            <label htmlFor="task-title" className="task-editor-label">
              Title
            </label>
            <input
              id="task-title"
              ref={titleInputRef}
              type="text"
              className="task-editor-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
            />
          </div>

          <div className="task-editor-field">
            <label htmlFor="task-notes" className="task-editor-label">
              Notes
            </label>
            <textarea
              id="task-notes"
              className="task-editor-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context…"
              rows={3}
            />
          </div>

          <div className="task-editor-toggles">
            <label className="task-editor-toggle">
              <input
                type="checkbox"
                checked={important}
                onChange={(e) => setImportant(e.target.checked)}
              />
              <span>Important</span>
            </label>
            <label className="task-editor-toggle">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
              />
              <span>Urgent</span>
            </label>
          </div>

          <div className="task-editor-row">
            <div className="task-editor-field">
              <label htmlFor="task-due-date" className="task-editor-label">
                Due date
              </label>
              <input
                id="task-due-date"
                type="date"
                className="task-editor-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            {dueDate && (
              <div className="task-editor-field">
                <label htmlFor="task-due-time" className="task-editor-label">
                  Time
                </label>
                <input
                  id="task-due-time"
                  type="time"
                  className="task-editor-input"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="task-editor-field">
            <label htmlFor="task-estimate" className="task-editor-label">
              Estimate (hours)
            </label>
            <input
              id="task-estimate"
              type="number"
              className="task-editor-input"
              value={estimateHours}
              onChange={(e) => setEstimateHours(e.target.value)}
              placeholder="How many hours will this take?"
              min={MIN_ESTIMATE_HOURS}
              max={MAX_ESTIMATE_HOURS}
              step="0.25"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-accent"
            onClick={handleSave}
            disabled={!title.trim()}
          >
            {task ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
