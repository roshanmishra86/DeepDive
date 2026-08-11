import { useState } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { useTodayStore } from '../../stores/today'
import { useAppStore } from '../../stores/app'
import type { Subtask, Task } from '../../db/types'
import { taskMeta, blockDraftFromTask } from '../../lib/week'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'
import { Pencil } from '@phosphor-icons/react/dist/csr/Pencil'
import { NotePencil } from '@phosphor-icons/react/dist/csr/NotePencil'
import { Archive } from '@phosphor-icons/react/dist/csr/Archive'
import { SubtaskList } from './SubtaskList'
import { useScheduleTodayBlock } from './useScheduleTodayBlock'

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
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

const NO_SUBTASKS: Subtask[] = []

export function TaskRow({ task, isDrop = false, onEdit, now, onDragStart, onDragOver, onDrop, onDragEnd, dragTarget = false, onMoveUp, onMoveDown, canMoveUp = false, canMoveDown = false }: TaskRowProps) {
  const toggleImportant = useTasksStore((s) => s.toggleImportant)
  const toggleUrgent = useTasksStore((s) => s.toggleUrgent)
  const toggleDone = useTasksStore((s) => s.toggleDone)
  const removeTask = useTasksStore((s) => s.removeTask)
  const blocks = useTodayStore((s) => s.blocks)
  const openPlan = useAppStore((s) => s.openPlan)
  const archiveTask = useTasksStore((s) => s.archiveTask)
  const { schedule } = useScheduleTodayBlock(now)

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [shutdownWarning, setShutdownWarning] = useState<string | null>(null)

  const loadedSubtasks = useTasksStore((s) => s.subtasksByTask[task.id] ?? NO_SUBTASKS)
  const meta = taskMeta(task, now, loadedSubtasks)
  const isPlanned = blocks.some((b) => b.taskId === task.id)

  const handlePlanToday = async () => {
    const draft = blockDraftFromTask(task, loadedSubtasks)
    const result = await schedule(draft)
    if (!result.ok) {
      setShutdownWarning(result.preview.reason ?? 'Could not schedule this task.')
      return
    }
    setShutdownWarning(null)
  }

  const handleDelete = async () => {
    await removeTask(task.id)
    setDeleteConfirm(false)
  }

  return (
    <div className={['task-row', isDrop && 'task-row-drop', dragTarget && 'task-row-drag-target'].filter(Boolean).join(' ')} onDragOver={(event) => { event.preventDefault(); onDragOver?.() }} onDrop={(event) => { event.preventDefault(); onDrop?.() }}>
      <div className="task-row-left">
        <button type="button" className="task-drag-handle" draggable onDragStart={(event) => { event.stopPropagation(); onDragStart?.() }} onDragEnd={onDragEnd} aria-label={`Drag ${task.title}`} title="Drag to reorder">⠿</button>
        <button type="button" className="btn-icon task-order-btn" onClick={() => void onMoveUp?.()} disabled={!onMoveUp || !canMoveUp} aria-label={`Move ${task.title} up`} title="Move up">↑</button>
        <button type="button" className="btn-icon task-order-btn" onClick={() => void onMoveDown?.()} disabled={!onMoveDown || !canMoveDown} aria-label={`Move ${task.title} down`} title="Move down">↓</button>
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
      <SubtaskList task={task} now={now} />
    </div>
  )
}
