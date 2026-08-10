import { useState } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { useTodayStore } from '../../stores/today'
import { useAppStore } from '../../stores/app'
import type { Task } from '../../db/types'
import { taskMeta, blockDraftFromTask } from '../../lib/week'
import { nextFreeStart, checkShutdown } from '../../lib/today'
import { minutesToClock } from '../../lib/time'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'
import { Pencil } from '@phosphor-icons/react/dist/csr/Pencil'
import { NotePencil } from '@phosphor-icons/react/dist/csr/NotePencil'
import { Archive } from '@phosphor-icons/react/dist/csr/Archive'
import { SubtaskList } from './SubtaskList'

interface TaskRowProps {
  task: Task
  isDrop?: boolean
  onEdit: (taskId: number) => void
  now: Date
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
  dragTarget?: boolean
}

export function TaskRow({ task, isDrop = false, onEdit, now, onDragStart, onDragOver, onDrop, onDragEnd, dragTarget = false }: TaskRowProps) {
  const toggleImportant = useTasksStore((s) => s.toggleImportant)
  const toggleUrgent = useTasksStore((s) => s.toggleUrgent)
  const toggleDone = useTasksStore((s) => s.toggleDone)
  const removeTask = useTasksStore((s) => s.removeTask)
  const addBlock = useTodayStore((s) => s.addBlock)
  const blocks = useTodayStore((s) => s.blocks)
  const shutdownMin = useTodayStore((s) => s.shutdownMin)
  const setView = useAppStore((s) => s.setView)
  const openPlan = useAppStore((s) => s.openPlan)
  const archiveTask = useTasksStore((s) => s.archiveTask)

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [shutdownWarning, setShutdownWarning] = useState<string | null>(null)

  const loadedSubtasks = useTasksStore((s) => s.subtasksByTask[task.id] ?? [])
  const meta = taskMeta(task, now, loadedSubtasks)
  const isPlanned = blocks.some((b) => b.taskId === task.id)

  const handlePlanToday = async () => {
    const draft = blockDraftFromTask(task, loadedSubtasks)
    // `blockDraftFromTask` never sets a startMin, so addBlock places the block
    // at nextFreeStart(blocks, fromMin, durationMin). Anchor that on the
    // current minute rather than letting it default to 0 — otherwise planning
    // a task on an empty day would schedule it at 12:00 AM. `now` is already
    // passed in and refreshed by WeekView, so this component never reads the
    // clock itself.
    const fromMin = now.getHours() * 60 + now.getMinutes()
    const prospectiveStart = nextFreeStart(blocks, fromMin, draft.durationMin)
    const check = checkShutdown(prospectiveStart, draft.durationMin, shutdownMin)
    if (!check.fits) {
      setShutdownWarning(
        shutdownMin !== null
          ? `Doesn't fit before shutdown (${minutesToClock(shutdownMin)})`
          : "Doesn't fit before shutdown"
      )
      return
    }
    setShutdownWarning(null)
    await addBlock({ ...draft, fromMin })
    setView('today')
  }

  const handleDelete = async () => {
    await removeTask(task.id)
    setDeleteConfirm(false)
  }

  return (
    <div className={['task-row', isDrop && 'task-row-drop', dragTarget && 'task-row-drag-target'].filter(Boolean).join(' ')} onDragOver={(event) => { event.preventDefault(); onDragOver?.() }} onDrop={(event) => { event.preventDefault(); onDrop?.() }}>
      <div className="task-row-left">
        <button type="button" className="task-drag-handle" draggable onDragStart={(event) => { event.stopPropagation(); onDragStart?.() }} onDragEnd={onDragEnd} aria-label={`Drag ${task.title}`} title="Drag to reorder">⠿</button>
        <input
          type="checkbox"
          className="task-check"
          checked={task.done}
          onChange={() => void toggleDone(task.id, new Date().toISOString())}
          aria-label={`Complete: ${task.title}`}
        />
        <div className="task-content">
          <div className={`task-title${task.done ? ' task-done' : ''}`}>{task.title}</div>
          {meta && <div className="task-meta">{meta}</div>}
          {shutdownWarning && (
            <div className="task-shutdown-warning" role="alert">
              {shutdownWarning}
            </div>
          )}
        </div>
      </div>

      <div className="task-row-right">
        <div className="task-tags">
          <button
            type="button"
            className={`task-tag${task.important ? ' task-tag-active' : ''}`}
            onClick={() => toggleImportant(task.id)}
            aria-label={`${task.important ? 'Remove' : 'Mark'} important: ${task.title}`}
          >
            Important
          </button>
          <button
            type="button"
            className={`task-tag${task.urgent ? ' task-tag-active' : ''}`}
            onClick={() => toggleUrgent(task.id)}
            aria-label={`${task.urgent ? 'Remove' : 'Mark'} urgent: ${task.title}`}
          >
            Urgent
          </button>
        </div>

        <button
          type="button"
          className={`task-plan-btn${isPlanned ? ' task-plan-btn-disabled' : ''}`}
          onClick={handlePlanToday}
          disabled={isPlanned}
          aria-label={isPlanned ? `Planned: ${task.title}` : `Plan today: ${task.title}`}
        >
          {isPlanned ? 'Planned' : 'Plan today'}
        </button>

        <button type="button" className="btn-icon" onClick={() => openPlan({ kind: 'task', id: task.id })} aria-label={`Open plan: ${task.title}`}>
          <NotePencil size={16} weight={task.notes ? 'fill' : 'regular'} />
        </button>

        {task.done && (
          <button type="button" className="btn-icon" onClick={() => void archiveTask(task.id, new Date().toISOString())} aria-label={`Archive: ${task.title}`}>
            <Archive size={16} />
          </button>
        )}

        <div className="task-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={() => onEdit(task.id)}
            aria-label={`Edit: ${task.title}`}
          >
            <Pencil size={16} />
          </button>

          {!deleteConfirm ? (
            <button
              type="button"
              className="btn-icon btn-danger"
              onClick={() => setDeleteConfirm(true)}
              aria-label={`Delete: ${task.title}`}
            >
              <Trash size={16} />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-icon btn-danger task-confirm"
                onClick={handleDelete}
                title="Confirm delete"
              >
                ✓
              </button>
              <button
                type="button"
                className="btn-icon task-confirm"
                onClick={() => setDeleteConfirm(false)}
                title="Cancel delete"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
      <SubtaskList task={task} />
    </div>
  )
}
