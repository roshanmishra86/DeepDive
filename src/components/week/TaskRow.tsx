import { useState } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { useTodayStore } from '../../stores/today'
import { useAppStore } from '../../stores/app'
import type { Task } from '../../db/types'
import { taskMeta, blockDraftFromTask } from '../../lib/week'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'
import { Pencil } from '@phosphor-icons/react/dist/csr/Pencil'

interface TaskRowProps {
  task: Task
  isDrop?: boolean
  onEdit: (taskId: number) => void
  now: Date
}

export function TaskRow({ task, isDrop = false, onEdit, now }: TaskRowProps) {
  const toggleImportant = useTasksStore((s) => s.toggleImportant)
  const toggleUrgent = useTasksStore((s) => s.toggleUrgent)
  const toggleDone = useTasksStore((s) => s.toggleDone)
  const removeTask = useTasksStore((s) => s.removeTask)
  const addBlock = useTodayStore((s) => s.addBlock)
  const blocks = useTodayStore((s) => s.blocks)
  const setView = useAppStore((s) => s.setView)

  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const meta = taskMeta(task, now)
  const isPlanned = blocks.some((b) => b.taskId === task.id)

  const handlePlanToday = async () => {
    const draft = blockDraftFromTask(task)
    await addBlock(draft)
    setView('today')
  }

  const handleDelete = async () => {
    await removeTask(task.id)
    setDeleteConfirm(false)
  }

  return (
    <div className={`task-row${isDrop ? ' task-row-drop' : ''}`}>
      <div className="task-row-left">
        <input
          type="checkbox"
          className="task-check"
          checked={task.done}
          onChange={() => toggleDone(task.id)}
          aria-label={`Complete: ${task.title}`}
        />
        <div className="task-content">
          <div className={`task-title${task.done ? ' task-done' : ''}`}>{task.title}</div>
          {meta && <div className="task-meta">{meta}</div>}
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
    </div>
  )
}
