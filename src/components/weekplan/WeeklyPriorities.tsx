import { useState, useMemo, useRef, useEffect } from 'react'
import type { Task, TaskPriority } from '../../db/types'
import { useTasksStore } from '../../stores/tasks'
import { useBlocksStore } from '../../stores/blocks'
import {
  filterWeeklyPriorities,
  sortWeeklyPriorities,
  getTaskWeeklyStatus,
  getNextWeeklyStatus,
  formatPriorityDueDate,
  type WeeklyPriorityStatus,
} from '../../lib/weekPlan'
import { composeDueAt, decomposeDueAt } from '../../lib/todo'
import { fromDayKey } from '../../lib/time'
import { Target } from '@phosphor-icons/react/dist/csr/Target'
import { PencilSimple } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { DotsSixVertical } from '@phosphor-icons/react/dist/csr/DotsSixVertical'
import { ArrowUp } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { PlayCircle } from '@phosphor-icons/react/dist/csr/PlayCircle'
import { Circle } from '@phosphor-icons/react/dist/csr/Circle'
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { DotsThree } from '@phosphor-icons/react/dist/csr/DotsThree'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'
import { Pencil } from '@phosphor-icons/react/dist/csr/Pencil'

export interface WeeklyPrioritiesProps {
  days: string[]
  currentDay: string
  now: Date
  onPlanBlock?: (day: string, taskId: number) => void
}

function formatDayOption(dayKey: string): string {
  const date = fromDayKey(dayKey)
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
  const dayNum = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  return `${weekday} ${dayNum} ${month}`
}

export function WeeklyPriorities({
  days,
  currentDay,
  onPlanBlock,
}: WeeklyPrioritiesProps) {
  const tasks = useTasksStore((s) => s.tasks)
  const addTask = useTasksStore((s) => s.addTask)
  const editTask = useTasksStore((s) => s.editTask)
  const removeTask = useTasksStore((s) => s.removeTask)
  const setPriority = useTasksStore((s) => s.setPriority)
  const blocksByDay = useBlocksStore((s) => s.blocksByDay)

  const [isEditing, setIsEditing] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newPriority, setNewPriority] = useState<TaskPriority>('high')
  const defaultDay = days.includes(currentDay) ? currentDay : days[0]
  const [newTargetDay, setNewTargetDay] = useState(defaultDay)

  // Quick edit states
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // Popover menus
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<number | null>(null)
  const [actionMenuTaskId, setActionMenuTaskId] = useState<number | null>(null)
  const [dateMenuTaskId, setDateMenuTaskId] = useState<number | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const menuContainerRef = useRef<HTMLDivElement>(null)

  // Keep target day in sync when days array changes
  useEffect(() => {
    if (!days.includes(newTargetDay)) {
      setNewTargetDay(days.includes(currentDay) ? currentDay : days[0])
    }
  }, [days, currentDay, newTargetDay])

  // Close open popovers on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setStatusMenuTaskId(null)
        setActionMenuTaskId(null)
        setDateMenuTaskId(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const priorities = useMemo(() => {
    const filtered = filterWeeklyPriorities(tasks, days, blocksByDay)
    return sortWeeklyPriorities(filtered, days)
  }, [tasks, days, blocksByDay])

  const existingImportableTasks = useMemo(() => {
    const priorityIds = new Set(priorities.map((p) => p.id))
    return tasks.filter((t) => !t.archived && !t.done && !priorityIds.has(t.id))
  }, [tasks, priorities])

  const handleCreatePriority = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    const dueAt = composeDueAt(newTargetDay, '17:00')
    await addTask({
      title: newTitle.trim(),
      notes: newNotes.trim() ? newNotes.trim() : undefined,
      priority: newPriority,
      dueAt,
      tags: ['weekly-priority'],
    })

    setNewTitle('')
    setNewNotes('')
    setIsAdding(false)
  }

  const handleStartEdit = (task: Task) => {
    setEditingTaskId(task.id)
    setEditTitle(task.title)
    setEditNotes(task.notes || '')
    setActionMenuTaskId(null)
  }

  const handleSaveEdit = async (taskId: number) => {
    if (!editTitle.trim()) return
    await editTask(taskId, {
      title: editTitle.trim(),
      notes: editNotes.trim(),
    })
    setEditingTaskId(null)
  }

  const handleCyclePriority = async (task: Task) => {
    const nextPriority: Record<TaskPriority, TaskPriority> = {
      high: 'medium',
      medium: 'low',
      low: 'high',
    }
    await setPriority(task.id, nextPriority[task.priority])
  }

  const handleSetStatus = async (task: Task, targetStatus: WeeklyPriorityStatus) => {
    setStatusMenuTaskId(null)
    const existingTags = task.tags ?? []

    if (targetStatus === 'done') {
      const cleanedTags = existingTags.filter((t) => t !== 'in-progress')
      await editTask(task.id, {
        done: true,
        completedAt: new Date().toISOString(),
        tags: cleanedTags,
      })
    } else if (targetStatus === 'in_progress') {
      const updatedTags = Array.from(new Set([...existingTags, 'in-progress']))
      await editTask(task.id, {
        done: false,
        completedAt: null,
        tags: updatedTags,
      })
    } else {
      const cleanedTags = existingTags.filter((t) => t !== 'in-progress')
      await editTask(task.id, {
        done: false,
        completedAt: null,
        tags: cleanedTags,
      })
    }
  }

  const handleSetTargetDay = async (task: Task, targetDay: string) => {
    setDateMenuTaskId(null)
    const existingTime = task.dueAt ? decomposeDueAt(task.dueAt).time : '17:00'
    const newDueAt = composeDueAt(targetDay, existingTime)
    await editTask(task.id, { dueAt: newDueAt })
  }

  const handleImportTask = async (task: Task) => {
    const dueAt = task.dueAt || composeDueAt(defaultDay, '17:00')
    const existingTags = task.tags ?? []
    const updatedTags = Array.from(new Set([...existingTags, 'weekly-priority']))
    await editTask(task.id, { dueAt, tags: updatedTags })
    setIsImporting(false)
  }

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= priorities.length) return

    const currentItem = priorities[index]
    const targetItem = priorities[targetIndex]

    // Swap sorts or set explicit sorts
    const currentSort = currentItem.sort
    const targetSort = targetItem.sort

    await editTask(currentItem.id, { sort: targetSort })
    await editTask(targetItem.id, { sort: currentSort })
  }

  return (
    <section className="week-priorities-card" ref={menuContainerRef}>
      <div className="week-priorities-header">
        <div className="week-priorities-header-left">
          <div className="week-priorities-icon-badge" aria-hidden="true">
            <Target size={20} weight="bold" />
          </div>
          <div className="week-priorities-text">
            <h3 className="week-priorities-title">Weekly Priorities</h3>
            <p className="week-priorities-subtitle">
              Focus on a few key outcomes to make this week a success.
            </p>
          </div>
        </div>

        <button
          type="button"
          className={`week-priorities-edit-btn${isEditing ? ' week-priorities-edit-btn-active' : ''}`}
          onClick={() => {
            setIsEditing(!isEditing)
            setIsImporting(false)
          }}
          aria-label={isEditing ? 'Done editing priorities' : 'Edit priorities'}
        >
          <PencilSimple size={14} weight="bold" />
          <span>{isEditing ? 'Done' : 'Edit priorities'}</span>
        </button>
      </div>

      <div className="week-priorities-list" role="list">
        {priorities.length === 0 && !isAdding && (
          <div className="week-priority-empty">
            <div className="week-priority-empty-title">No weekly priorities planned yet</div>
            <div className="week-priority-empty-sub">
              Add your target outcomes for this week to maintain focus and review your progress.
            </div>
          </div>
        )}

        {priorities.map((task, index) => {
          const status = getTaskWeeklyStatus(task)
          const targetDay = task.dueAt ? decomposeDueAt(task.dueAt).date : defaultDay
          const isInlineEditing = editingTaskId === task.id

          return (
            <div
              key={task.id}
              className={`week-priority-row${task.done ? ' week-priority-row-done' : ''}`}
              role="listitem"
            >
              <div className="week-priority-drag-handle" title="Drag to reorder">
                <DotsSixVertical size={16} weight="bold" />
              </div>

              <div className="week-priority-number">{index + 1}</div>

              <div className="week-priority-content">
                {isInlineEditing ? (
                  <div className="week-priority-inline-edit">
                    <input
                      type="text"
                      className="week-priority-inline-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Priority title"
                      autoFocus
                    />
                    <input
                      type="text"
                      className="week-priority-inline-input week-priority-input-sub"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Notes / success criteria"
                    />
                    <div className="week-priority-inline-actions">
                      <button
                        type="button"
                        className="btn-accent week-priority-submit-btn"
                        onClick={() => void handleSaveEdit(task.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="week-priority-cancel-btn"
                        onClick={() => setEditingTaskId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`week-priority-title${task.done ? ' week-priority-title-done' : ''}`}>
                      {task.title}
                    </div>
                    {task.notes ? (
                      <div className="week-priority-notes">{task.notes}</div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="week-priority-actions">
                {/* Priority Badge */}
                <button
                  type="button"
                  className={`week-priority-badge ${task.priority === 'high' ? 'week-priority-badge-high' : task.priority === 'medium' ? 'week-priority-badge-medium' : 'week-priority-badge-low'}`}
                  onClick={() => void handleCyclePriority(task)}
                  title="Click to cycle priority"
                  aria-label={`Priority: ${task.priority}`}
                >
                  <ArrowUp size={11} weight="bold" />
                  <span>{task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>
                </button>

                {/* Target Date Chip */}
                <div className="week-priority-date-container">
                  <button
                    type="button"
                    className="week-priority-date-chip"
                    onClick={() => setDateMenuTaskId(dateMenuTaskId === task.id ? null : task.id)}
                    title="Change target day"
                    aria-label={`Target date: ${formatPriorityDueDate(task.dueAt)}`}
                  >
                    <CalendarBlank size={12} weight="bold" />
                    <span>{formatPriorityDueDate(task.dueAt)}</span>
                  </button>

                  {dateMenuTaskId === task.id && (
                    <div className="week-priority-date-menu" role="menu">
                      {days.map((d) => (
                        <button
                          key={d}
                          type="button"
                          role="menuitem"
                          className={`week-priority-date-option${d === targetDay ? ' week-priority-date-option-active' : ''}`}
                          onClick={() => void handleSetTargetDay(task, d)}
                        >
                          {formatDayOption(d)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status Pill */}
                <div className="week-priority-status-container">
                  <button
                    type="button"
                    className={`week-priority-status ${status === 'in_progress' ? 'week-priority-status-in-progress' : status === 'not_started' ? 'week-priority-status-not-started' : 'week-priority-status-done'}`}
                    onClick={() => setStatusMenuTaskId(statusMenuTaskId === task.id ? null : task.id)}
                    title="Click to select status"
                    aria-label={`Status: ${status}`}
                  >
                    {status === 'in_progress' && <PlayCircle size={14} weight="fill" />}
                    {status === 'not_started' && <Circle size={14} weight="regular" />}
                    {status === 'done' && <CheckCircle size={14} weight="fill" />}
                    <span>
                      {status === 'in_progress'
                        ? 'In Progress'
                        : status === 'done'
                          ? 'Done'
                          : 'Not started'}
                    </span>
                    <CaretRight size={11} weight="bold" />
                  </button>

                  {statusMenuTaskId === task.id && (
                    <div className="week-priority-status-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={`week-priority-status-option${status === 'not_started' ? ' week-priority-status-option-active' : ''}`}
                        onClick={() => void handleSetStatus(task, 'not_started')}
                      >
                        <Circle size={13} />
                        <span>Not started</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={`week-priority-status-option${status === 'in_progress' ? ' week-priority-status-option-active' : ''}`}
                        onClick={() => void handleSetStatus(task, 'in_progress')}
                      >
                        <PlayCircle size={13} weight="fill" />
                        <span>In Progress</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={`week-priority-status-option${status === 'done' ? ' week-priority-status-option-active' : ''}`}
                        onClick={() => void handleSetStatus(task, 'done')}
                      >
                        <CheckCircle size={13} weight="fill" />
                        <span>Done</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Edit Mode Quick Reorder Buttons */}
                {isEditing && (
                  <>
                    <button
                      type="button"
                      className="btn-icon week-priority-reorder-btn"
                      disabled={index === 0}
                      onClick={() => void handleReorder(index, 'up')}
                      title="Move priority up"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-icon week-priority-reorder-btn"
                      disabled={index === priorities.length - 1}
                      onClick={() => void handleReorder(index, 'down')}
                      title="Move priority down"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-icon week-priority-delete-btn"
                      onClick={() => void removeTask(task.id)}
                      title="Delete priority"
                      aria-label="Delete priority"
                    >
                      <Trash size={14} />
                    </button>
                  </>
                )}

                {/* Action Menu (...) */}
                <div className="week-priority-menu-container">
                  <button
                    type="button"
                    className="btn-icon week-priority-menu-btn"
                    onClick={() => setActionMenuTaskId(actionMenuTaskId === task.id ? null : task.id)}
                    aria-label={`Actions for ${task.title}`}
                  >
                    <DotsThree size={18} weight="bold" />
                  </button>

                  {actionMenuTaskId === task.id && (
                    <div className="week-priority-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="week-priority-menu-item"
                        onClick={() => handleStartEdit(task)}
                      >
                        <Pencil size={13} />
                        <span>Edit outcome</span>
                      </button>
                      {onPlanBlock && (
                        <button
                          type="button"
                          role="menuitem"
                          className="week-priority-menu-item"
                          onClick={() => {
                            setActionMenuTaskId(null)
                            onPlanBlock(targetDay, task.id)
                          }}
                        >
                          <CalendarBlank size={13} />
                          <span>Plan in schedule</span>
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        className="week-priority-menu-item"
                        onClick={() => void handleSetStatus(task, getNextWeeklyStatus(status))}
                      >
                        <span>Cycle status</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="week-priority-menu-item"
                        onClick={() => void handleCyclePriority(task)}
                      >
                        <span>Cycle priority</span>
                      </button>
                      <div className="week-priority-menu-divider" />
                      <button
                        type="button"
                        role="menuitem"
                        className="week-priority-menu-item week-priority-menu-item-danger"
                        onClick={() => {
                          setActionMenuTaskId(null)
                          void removeTask(task.id)
                        }}
                      >
                        <Trash size={13} />
                        <span>Delete priority</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add Priority Form or Dashed Button */}
      {isAdding ? (
        <form className="week-priority-add-form" onSubmit={(e) => void handleCreatePriority(e)}>
          <input
            type="text"
            className="week-priority-input"
            placeholder="Priority title (e.g. Write One Essay / Week)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            className="week-priority-input week-priority-input-sub"
            placeholder="Outcome description (e.g. Complete first draft and do one round of editing)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
          />
          <div className="week-priority-form-row">
            <div className="week-priority-form-field">
              <span className="week-priority-form-label">Priority:</span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn${newPriority === 'high' ? ' segmented-btn-active' : ''}`}
                  onClick={() => setNewPriority('high')}
                >
                  High
                </button>
                <button
                  type="button"
                  className={`segmented-btn${newPriority === 'medium' ? ' segmented-btn-active' : ''}`}
                  onClick={() => setNewPriority('medium')}
                >
                  Medium
                </button>
                <button
                  type="button"
                  className={`segmented-btn${newPriority === 'low' ? ' segmented-btn-active' : ''}`}
                  onClick={() => setNewPriority('low')}
                >
                  Low
                </button>
              </div>
            </div>

            <div className="week-priority-form-field">
              <span className="week-priority-form-label">Target Day:</span>
              <select
                className="week-priority-day-select"
                value={newTargetDay}
                onChange={(e) => setNewTargetDay(e.target.value)}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDayOption(d)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="week-priority-form-buttons">
            <button
              type="submit"
              className="btn-accent week-priority-submit-btn"
              disabled={!newTitle.trim()}
            >
              Add priority
            </button>
            <button
              type="button"
              className="week-priority-cancel-btn"
              onClick={() => {
                setIsAdding(false)
                setNewTitle('')
                setNewNotes('')
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="week-priority-add-btn"
          onClick={() => setIsAdding(true)}
          aria-label="Add weekly priority"
        >
          <Plus size={14} weight="bold" />
          <span>Add priority</span>
        </button>
      )}

      {/* Edit Mode Import from existing tasks button */}
      {isEditing && (
        <div>
          <button
            type="button"
            className="week-priority-import-btn"
            onClick={() => setIsImporting(!isImporting)}
          >
            <Plus size={12} weight="bold" />
            <span>Select from existing tasks ({existingImportableTasks.length})</span>
          </button>

          {isImporting && (
            <div className="week-priority-import-modal">
              <div className="week-priority-import-header">
                Select an existing task to include as a weekly priority:
              </div>
              {existingImportableTasks.length === 0 ? (
                <div className="week-priority-empty-sub">No other pending tasks available.</div>
              ) : (
                <div className="week-priority-import-list">
                  {existingImportableTasks.slice(0, 8).map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="week-priority-import-item"
                      onClick={() => void handleImportTask(task)}
                    >
                      <span className="week-priority-import-title">{task.title}</span>
                      <Plus size={12} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
