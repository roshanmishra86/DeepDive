import { useEffect, useRef, useState } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { useTodayBlocks } from '../../stores/useTodayBlocks'
import { useAppStore } from '../../stores/app'
import type { Subtask, Task } from '../../db/types'
import { taskMeta, blockDraftFromTask, formatDueLabel, PRIORITIES } from '../../lib/todo'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'
import { Pencil } from '@phosphor-icons/react/dist/csr/Pencil'
import { NotePencil } from '@phosphor-icons/react/dist/csr/NotePencil'
import { Archive } from '@phosphor-icons/react/dist/csr/Archive'
import { DotsThreeVertical } from '@phosphor-icons/react/dist/csr/DotsThreeVertical'
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
  /** Non-null when dragging this row is unsafe right now; carries the reason shown on interaction. */
  dragDisabledReason?: string | null
  onDragDisabledAttempt?: (reason: string) => void
  /** True while this row is the target of a cross-view focus request. */
  focused?: boolean
}

const NO_SUBTASKS: Subtask[] = []

export function TaskRow({
  task,
  isDrop = false,
  onEdit,
  now,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragTarget = false,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  dragDisabledReason = null,
  onDragDisabledAttempt,
  focused = false,
}: TaskRowProps) {
  const toggleImportant = useTasksStore((s) => s.toggleImportant)
  const toggleUrgent = useTasksStore((s) => s.toggleUrgent)
  const toggleDone = useTasksStore((s) => s.toggleDone)
  const removeTask = useTasksStore((s) => s.removeTask)
  const setPriority = useTasksStore((s) => s.setPriority)
  const blocks = useTodayBlocks()
  const openPlan = useAppStore((s) => s.openPlan)
  const archiveTask = useTasksStore((s) => s.archiveTask)
  const { schedule } = useScheduleTodayBlock(now)

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [shutdownWarning, setShutdownWarning] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const wasMenuOpen = useRef(false)

  const loadedSubtasks = useTasksStore((s) => s.subtasksByTask[task.id] ?? NO_SUBTASKS)
  const meta = taskMeta(task, now, loadedSubtasks)
  const isPlanned = blocks.some((b) => b.taskId === task.id)

  const priorityMeta = PRIORITIES.find((p) => p.priority === task.priority) ?? PRIORITIES[1]
  const dueLabel = task.dueAt ? formatDueLabel(task.dueAt, now) : ''
  const dueIsUrgent = dueLabel === 'overdue' || dueLabel.startsWith('today')

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (wasMenuOpen.current && !menuOpen) {
      menuTriggerRef.current?.focus()
    }
    wasMenuOpen.current = menuOpen
  }, [menuOpen])

  const closeMenu = () => {
    setMenuOpen(false)
    setDeleteConfirm(false)
  }

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
    closeMenu()
  }

  const cyclePriority = () => {
    const index = PRIORITIES.findIndex((p) => p.priority === task.priority)
    const next = PRIORITIES[(index + 1) % PRIORITIES.length]
    void setPriority(task.id, next.priority)
  }

  const handleDragStart = (event: React.DragEvent) => {
    if (dragDisabledReason) {
      event.preventDefault()
      return
    }
    event.stopPropagation()
    onDragStart?.()
  }

  const handleHandleClick = () => {
    if (dragDisabledReason) onDragDisabledAttempt?.(dragDisabledReason)
  }

  return (
    <div
      className={['task-row', isDrop && 'task-row-drop', dragTarget && 'task-row-drag-target', focused && 'todo-row-focused'].filter(Boolean).join(' ')}
      data-task-id={task.id}
      tabIndex={-1}
      onDragOver={(event) => { event.preventDefault(); onDragOver?.() }}
      onDrop={(event) => { event.preventDefault(); onDrop?.() }}
    >
      <div className="task-row-left">
        <button
          type="button"
          className={`task-drag-handle${dragDisabledReason ? ' task-drag-handle-disabled' : ''}`}
          draggable={!dragDisabledReason}
          aria-disabled={dragDisabledReason ? 'true' : undefined}
          onDragStart={handleDragStart}
          onDragEnd={onDragEnd}
          onClick={handleHandleClick}
          aria-label={`Drag ${task.title}`}
          title={dragDisabledReason ?? 'Drag to reorder'}
        >
          ⠿
        </button>
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
        {dueLabel && (
          <span className={`task-due-chip${dueIsUrgent ? ' task-due-chip-danger' : ''}`}>{dueLabel}</span>
        )}

        <button
          type="button"
          className="task-priority-chip"
          onClick={cyclePriority}
          aria-label={`Change priority for ${task.title}, currently ${priorityMeta.label}`}
        >
          <span className="task-priority-dot" style={{ backgroundColor: priorityMeta.dot }} />
          {priorityMeta.label}
        </button>

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

        <div className="task-overflow" ref={menuRef}>
          <button
            type="button"
            ref={menuTriggerRef}
            className="btn-icon task-overflow-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`More actions: ${task.title}`}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <DotsThreeVertical size={16} weight="bold" />
          </button>
          {menuOpen && (
            <div className="task-overflow-menu" role="menu">
              <button type="button" role="menuitem" className="task-overflow-item" onClick={() => { closeMenu(); onEdit(task.id) }}>
                <Pencil size={14} /> Edit
              </button>
              <button type="button" role="menuitem" className="task-overflow-item" onClick={() => { closeMenu(); openPlan({ kind: 'task', id: task.id }) }}>
                <NotePencil size={14} weight={task.notes ? 'fill' : 'regular'} /> Plan / notes
              </button>
              {task.done && (
                <button type="button" role="menuitem" className="task-overflow-item" onClick={() => { closeMenu(); void archiveTask(task.id, new Date().toISOString()) }}>
                  <Archive size={14} /> Archive
                </button>
              )}
              {!deleteConfirm ? (
                <button type="button" role="menuitem" className="task-overflow-item task-overflow-item-danger" onClick={() => setDeleteConfirm(true)}>
                  <Trash size={14} /> Delete
                </button>
              ) : (
                <div className="task-overflow-confirm">
                  <span>Delete this task?</span>
                  <button type="button" className="btn-icon btn-danger task-confirm" onClick={() => void handleDelete()} title="Confirm delete">✓</button>
                  <button type="button" className="btn-icon task-confirm" onClick={() => setDeleteConfirm(false)} title="Cancel delete">✕</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <SubtaskList task={task} now={now} />
    </div>
  )
}
