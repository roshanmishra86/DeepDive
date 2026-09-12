import { useState, useRef, useEffect } from 'react'
import type { Task, Subtask } from '../../db/types'
import { useTasksStore } from '../../stores/tasks'
import {
  formatTaskEstimate,
  formatTaskDueDate,
  extractTaskProject,
  blockDraftFromTask,
} from '../../lib/todo'
import { useScheduleTodayBlock } from './useScheduleTodayBlock'
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { DotsThreeVertical } from '@phosphor-icons/react/dist/csr/DotsThreeVertical'
import { PencilSimple } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { CalendarPlus } from '@phosphor-icons/react/dist/csr/CalendarPlus'
import { ListBullets } from '@phosphor-icons/react/dist/csr/ListBullets'
import { Archive } from '@phosphor-icons/react/dist/csr/Archive'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'

interface TodoTaskRowProps {
  task: Task
  now: Date
  isSelected: boolean
  isExpanded: boolean
  isFocused?: boolean
  isDragTarget?: boolean
  dragDisabledReason?: string | null
  subtasks: Subtask[]
  menuOpen?: boolean
  onMenuToggle?: (open: boolean) => void
  onSelect: () => void
  onToggleExpand: () => void
  onEdit: () => void
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
}

function getProjectClass(projectName: string | null): string {
  if (!projectName) return ''
  const norm = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const known = [
    'website',
    'personal',
    'work',
    'business',
    'learning',
    'side-project',
    'kinesis-labs',
    'vokal',
  ]
  if (known.includes(norm)) return `todo-project-${norm}`
  return ''
}

export function TodoTaskRow({
  task,
  now,
  isSelected,
  isExpanded,
  isFocused = false,
  isDragTarget = false,
  dragDisabledReason = null,
  subtasks,
  menuOpen,
  onMenuToggle,
  onSelect,
  onToggleExpand,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TodoTaskRowProps) {
  const toggleDone = useTasksStore((s) => s.toggleDone)
  const setPriority = useTasksStore((s) => s.setPriority)
  const removeTask = useTasksStore((s) => s.removeTask)
  const archiveTask = useTasksStore((s) => s.archiveTask)
  const createSubtask = useTasksStore((s) => s.createSubtask)
  const setSubtaskDone = useTasksStore((s) => s.setSubtaskDone)

  const { schedule } = useScheduleTodayBlock(now)

  const [internalMenuOpen, setInternalMenuOpen] = useState(false)
  const isMenuOpen = menuOpen !== undefined ? menuOpen : internalMenuOpen
  const setIsMenuOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof next === 'function' ? next(isMenuOpen) : next
    if (onMenuToggle) {
      onMenuToggle(nextVal)
    } else {
      setInternalMenuOpen(nextVal)
    }
  }

  const [openUpward, setOpenUpward] = useState(false)
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isMenuOpen) return
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < 190 && rect.top > spaceBelow) {
        setOpenUpward(true)
      } else {
        setOpenUpward(false)
      }
    }
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isMenuOpen])

  const dueInfo = formatTaskDueDate(task.dueAt, now)
  const estimateStr = formatTaskEstimate(task.estimateMin)
  const projectName = extractTaskProject(task)
  const projectClass = getProjectClass(projectName)

  const cyclePriority = (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextPriority =
      task.priority === 'high' ? 'medium' : task.priority === 'medium' ? 'low' : 'high'
    void setPriority(task.id, nextPriority)
  }

  const handlePlanToday = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const draft = blockDraftFromTask(task, subtasks)
    await schedule(draft)
    setIsMenuOpen(false)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await removeTask(task.id)
    setIsMenuOpen(false)
  }

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await archiveTask(task.id, new Date().toISOString())
    setIsMenuOpen(false)
  }

  const handleAddSubtask = async () => {
    const title = subtaskDraft.trim()
    if (!title) return
    await createSubtask({
      taskId: task.id,
      title,
      estimateMin: 30,
    })
    setSubtaskDraft('')
  }

  const priorityLabel =
    task.priority === 'high' ? 'High' : task.priority === 'medium' ? 'Medium' : 'Low'
  const priorityClass =
    task.priority === 'high'
      ? 'todo-priority-high'
      : task.priority === 'medium'
      ? 'todo-priority-medium'
      : 'todo-priority-low'

  const rowModifiers = [
    isSelected ? 'selected' : '',
    isFocused ? 'todo-row-focused' : '',
    isDragTarget ? 'task-row-drag-target' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={`todo-task-item-wrap${isMenuOpen ? ' todo-menu-open' : ''}`}
      style={isMenuOpen ? { position: 'relative', zIndex: 50 } : undefined}
    >
      <div
        className={`todo-task-row task-row ${rowModifiers}`}
        onClick={onSelect}
        data-task-id={task.id}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          onDragOver?.()
        }}
        onDrop={(e) => {
          e.preventDefault()
          onDrop?.()
        }}
      >
        <div className="todo-task-left">
          <button
            type="button"
            className={`task-drag-handle${dragDisabledReason ? ' task-drag-handle-disabled' : ''}`}
            draggable={!dragDisabledReason}
            aria-disabled={dragDisabledReason ? 'true' : undefined}
            onDragStart={(e) => {
              if (dragDisabledReason) {
                e.preventDefault()
                return
              }
              onDragStart?.()
            }}
            onDragEnd={onDragEnd}
            aria-label={`Drag ${task.title}`}
            title={dragDisabledReason ?? 'Drag to reorder'}
          >
            ⠿
          </button>

          <button
            type="button"
            className={`todo-expand-btn${isExpanded ? ' expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
            aria-label={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
          >
            <CaretRight size={13} weight="bold" />
          </button>

          <input
            type="checkbox"
            className="todo-task-checkbox"
            checked={task.done}
            onChange={(e) => {
              e.stopPropagation()
              void toggleDone(task.id, new Date().toISOString())
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={task.done ? `Mark incomplete: ${task.title}` : `Complete: ${task.title}`}
          />

          <span className={`todo-task-title task-title${task.done ? ' done' : ''}`}>
            {task.title}
          </span>
        </div>

        <div className="todo-task-right">
          {!task.tags?.includes('someday') && (
            <button
              type="button"
              className={`todo-priority-pill ${priorityClass}`}
              onClick={cyclePriority}
              title="Click to cycle priority"
            >
              {priorityLabel}
            </button>
          )}

          <span className={`todo-due-pill${dueInfo.isUrgent ? ' urgent' : ''}`}>
            <CalendarBlank size={12} />
            {dueInfo.text}
          </span>

          {estimateStr && (
            <span className="todo-estimate-pill">
              <Flag size={12} />
              {estimateStr}
            </span>
          )}

          {projectName && (
            <span className={`todo-project-pill ${projectClass}`}>
              {projectName}
            </span>
          )}

          <div
            className={`todo-row-menu-wrap${isMenuOpen ? ' todo-row-menu-open' : ''}`}
            style={isMenuOpen ? { position: 'relative', zIndex: 60 } : undefined}
            ref={menuRef}
          >
            <button
              type="button"
              className="todo-row-menu-btn"
              onClick={(e) => {
                e.stopPropagation()
                setIsMenuOpen((prev) => !prev)
              }}
              aria-label="Task options"
              aria-expanded={isMenuOpen}
            >
              <DotsThreeVertical size={16} />
            </button>

            {isMenuOpen && (
              <div
                className={`todo-row-menu-dropdown${openUpward ? ' todo-row-menu-upward' : ''}`}
                role="menu"
                style={{ zIndex: 100 }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="todo-row-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsMenuOpen(false)
                    onEdit()
                  }}
                >
                  <PencilSimple size={14} />
                  <span>Edit details</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="todo-row-menu-item"
                  onClick={handlePlanToday}
                >
                  <CalendarPlus size={14} />
                  <span>Plan today</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="todo-row-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleExpand()
                    setIsMenuOpen(false)
                  }}
                >
                  <ListBullets size={14} />
                  <span>{isExpanded ? 'Hide subtasks' : 'Show subtasks'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="todo-row-menu-item"
                  onClick={handleArchive}
                >
                  <Archive size={14} />
                  <span>Archive</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="todo-row-menu-item todo-row-menu-item-danger"
                  onClick={handleDelete}
                >
                  <Trash size={14} />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="todo-subtasks-tree">
          {subtasks.map((subtask) => {
            const subDue = formatTaskDueDate(subtask.dueAt, now)
            const subEst = formatTaskEstimate(subtask.estimateMin)

            return (
              <div key={subtask.id} className="todo-subtask-row">
                <div className="todo-subtask-left">
                  <input
                    type="checkbox"
                    className="todo-subtask-checkbox"
                    checked={subtask.done}
                    onChange={() => void setSubtaskDone(subtask.id, task.id, !subtask.done)}
                    aria-label={`Mark subtask ${subtask.done ? 'incomplete' : 'complete'}`}
                  />
                  <span className={`todo-subtask-title${subtask.done ? ' done' : ''}`}>
                    {subtask.title}
                  </span>
                </div>

                <div className="todo-subtask-right">
                  {subtask.dueAt && (
                    <span className={`todo-due-pill${subDue.isUrgent ? ' urgent' : ''}`}>
                      <CalendarBlank size={11} />
                      {subDue.text}
                    </span>
                  )}
                  {subEst && (
                    <span className="todo-estimate-pill">
                      <Clock size={11} />
                      {subEst}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          <div className="todo-subtask-add-inline">
            <input
              type="text"
              className="todo-subtask-add-input"
              placeholder="+ Add subtask..."
              value={subtaskDraft}
              onChange={(e) => setSubtaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddSubtask()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
