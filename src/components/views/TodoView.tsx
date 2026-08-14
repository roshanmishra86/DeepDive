import { useEffect, useMemo, useRef, useState } from 'react'
import { useTasksStore } from '../../stores/tasks'
import { useAppStore } from '../../stores/app'
import { useDayStore } from '../../stores/day'
import { openDatabase } from '../../db/index'
import {
  groupByMatrix,
  groupByDeadline,
  QUADRANTS,
  DEADLINE_BUCKETS,
  applyFilters,
  filtersActive,
  sortGroup,
  dragDisabledReason,
  priorityFromQuadrant,
  DEFAULT_TODO_FILTERS,
  type TodoFilters,
  type GroupSort,
  type Quadrant,
  type DeadlineBucket,
} from '../../lib/todo'
import { fromDayKey } from '../../lib/time'
import type { Task } from '../../db/types'
import { TaskRow } from '../todo/TaskRow'
import { TaskEditor } from '../todo/TaskEditor'
import { AddTaskRow } from '../todo/AddTaskRow'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'
import { Funnel } from '@phosphor-icons/react/dist/csr/Funnel'
import { ArrowsDownUp } from '@phosphor-icons/react/dist/csr/ArrowsDownUp'

type GroupKey = Quadrant | DeadlineBucket

// Cross-view focus highlight fade duration (see effect below).
export const TODO_FOCUS_FADE_MS = 2000

const MATRIX_HINTS: Record<Quadrant, string> = {
  do: 'Do these first.',
  plan: 'Schedule these.',
  delegate: 'Batch or delegate.',
  drop: 'Keep for someday.',
}

const DEADLINE_HINTS: Record<DeadlineBucket, string> = {
  soon: 'Handle these within 48 hours.',
  week: 'Fit these into the week.',
  later: 'Keep an eye on these.',
  none: 'Give these a deadline when ready.',
}

const SORT_OPTIONS: Array<{ value: GroupSort; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'due', label: 'Due' },
  { value: 'priority', label: 'Priority' },
  { value: 'title', label: 'Title' },
]

function activeFilterCount(filters: TodoFilters): number {
  let count = 0
  if (filters.showCompleted !== DEFAULT_TODO_FILTERS.showCompleted) count++
  if (filters.deadline !== DEFAULT_TODO_FILTERS.deadline) count++
  if (filters.overdueOnly !== DEFAULT_TODO_FILTERS.overdueOnly) count++
  return count
}

export function TodoView() {
  const tasks = useTasksStore((s) => s.tasks)
  const groupBy = useTasksStore((s) => s.groupBy)
  const loading = useTasksStore((s) => s.loading)
  const error = useTasksStore((s) => s.error)
  const hydrate = useTasksStore((s) => s.hydrate)
  const setGroupBy = useTasksStore((s) => s.setGroupBy)
  const moveTask = useTasksStore((s) => s.moveTask)
  const addTask = useTasksStore((s) => s.addTask)
  const filters = useTasksStore((s) => s.filters)
  const setFilters = useTasksStore((s) => s.setFilters)
  const resetFilters = useTasksStore((s) => s.resetFilters)
  const sortByGroup = useTasksStore((s) => s.sortByGroup)
  const setGroupSort = useTasksStore((s) => s.setGroupSort)

  const pendingTodoFocus = useAppStore((s) => s.pendingTodoFocus)
  const clearTodoFocus = useAppStore((s) => s.clearTodoFocus)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTaskId, setEditorTaskId] = useState<number | null>(null)
  const nowMin = useDayStore((s) => s.nowMin)
  const currentDay = useDayStore((s) => s.currentDay)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)
  const [dropHint, setDropHint] = useState<string | null>(null)
  const dropCompleted = useRef(false)

  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)

  const [focusedTaskId, setFocusedTaskId] = useState<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Deadline buckets and due labels need a full Date, but the app has one
  // clock (the day store) and one interval. Rebuild it from the day store's
  // published tick rather than reading `new Date()` here, so nothing gets
  // stuck across the 48h boundary or midnight while the view stays open and
  // every surface agrees on what "now" is.
  const now = useMemo(() => {
    const date = fromDayKey(currentDay)
    date.setMinutes(nowMin)
    return date
  }, [currentDay, nowMin])

  // Hydrate on mount (idempotent; already hydrated at App level but safety for if this view opens first)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        await hydrate(driver)
      } catch (err) {
        console.error('Failed to hydrate week view:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [hydrate])

  // Close the Filters popover on outside click / Escape.
  useEffect(() => {
    if (!filtersOpen) return
    const handleClick = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setFiltersOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [filtersOpen])

  // Cross-view focus target: Today's "This is a task. ↗" link sets
  // pendingTodoFocus. This is split into two effects because the decision
  // step below calls clearTodoFocus(), which is itself one of this effect's
  // dependencies — if the scroll/focus/timer work lived in the same effect,
  // React would tear it down (cancel the timer, never focus) the instant
  // pendingTodoFocus flips back to null. Effect A only decides *whether* to
  // focus a row (clearing filters or the pending target as needed); effect B,
  // keyed only on the resulting focusedTaskId, does the actual scroll/focus/
  // fade and is left alone by effect A's own state changes.
  useEffect(() => {
    if (pendingTodoFocus === null) return
    const task = tasks.find((t) => t.id === pendingTodoFocus)
    if (!task) {
      clearTodoFocus()
      return
    }
    const visible = applyFilters([task], filters, now).length > 0
    if (!visible) {
      resetFilters()
      return
    }
    setFocusedTaskId(task.id)
    clearTodoFocus()
  }, [pendingTodoFocus, tasks, filters, now, clearTodoFocus, resetFilters])

  // Presentation half of the cross-view focus target: once effect A has
  // settled on a task to focus, scroll it into view, move DOM focus to it,
  // and fade the highlight after TODO_FOCUS_FADE_MS. Runs after commit, so
  // the row is already in the DOM — no requestAnimationFrame needed.
  useEffect(() => {
    if (focusedTaskId === null) return
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-task-id="${focusedTaskId}"]`)
    el?.scrollIntoView?.({ block: 'center' })
    el?.focus()
    const timer = setTimeout(() => setFocusedTaskId(null), TODO_FOCUS_FADE_MS)
    return () => clearTimeout(timer)
  }, [focusedTaskId])

  const openEditor = (taskId: number | null = null) => {
    setEditorTaskId(taskId)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditorTaskId(null)
  }

  const hasAnyTasks = tasks.length > 0
  const filteredTasks = useMemo(() => applyFilters(tasks, filters, now), [tasks, filters, now])
  const filtersOn = filtersActive(filters)
  const filterBadgeCount = activeFilterCount(filters)

  const matrixGroups = useMemo(
    () => groupByMatrix(filteredTasks).map((group) => ({
      key: group.quadrant as GroupKey,
      quadrant: group.quadrant,
      tasks: sortGroup(group.tasks, sortByGroup[group.quadrant] ?? 'manual'),
    })),
    [filteredTasks, sortByGroup]
  )
  const deadlineGroups = useMemo(
    () => groupByDeadline(filteredTasks, now).map((group) => ({
      key: group.bucket as GroupKey,
      bucket: group.bucket,
      tasks: sortGroup(group.tasks, sortByGroup[group.bucket] ?? 'manual'),
    })),
    [filteredTasks, sortByGroup, now]
  )

  const beginDrag = (id: number) => { dropCompleted.current = false; setDraggingId(id); setDropTargetId(null); setDropHint(null) }
  const finishDrag = () => {
    setDraggingId(null)
    setDropTargetId(null)
    if (!dropCompleted.current) setDropHint(null)
  }
  const dropOn = async (group: GroupKey, beforeId: number | null) => {
    if (draggingId === null) return
    // Every row passes its own id as beforeId, so a drag that ends on the
    // row it started from lands here as a self-drop: nothing to move.
    if (beforeId === draggingId) {
      dropCompleted.current = true
      setDropHint(null)
      setDraggingId(null)
      setDropTargetId(null)
      return
    }
    const ok = await moveTask(draggingId, { group, beforeId }, now)
    dropCompleted.current = true
    if (!ok && groupBy === 'deadline') setDropHint('Move by editing the due date')
    else setDropHint(null)
    setDraggingId(null)
    setDropTargetId(null)
  }
  const moveWithin = async (group: GroupKey, groupTasks: Task[], index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= groupTasks.length) return
    const beforeId = direction === -1
      ? groupTasks[targetIndex].id
      : groupTasks[targetIndex + 1]?.id ?? null
    await moveTask(groupTasks[index].id, { group, beforeId }, now)
  }
  const hoverDeadline = (bucket: DeadlineBucket) => {
    if (draggingId === null) return
    const source = groupByDeadline(tasks, now).find((group) => group.tasks.some((task) => task.id === draggingId))?.bucket
    setDropHint(source && source !== bucket ? 'Move by editing the due date' : null)
  }
  // Row-level hover: the only row that should show the drop-target outline
  // is the one the pointer is actually over, not every non-dragged row.
  const hoverRow = (taskId: number) => {
    if (draggingId === null || draggingId === taskId) return
    setDropTargetId(taskId)
  }
  // Dragging over the empty area of a group (no rows to hover) means the
  // pointer has left whatever row was previously targeted.
  const clearRowTarget = () => setDropTargetId(null)

  if (loading) {
    return (
      <div className="todo-view">
        <div className="todo-body">
          <div className="view-empty">
            <div className="view-empty-title">Loading tasks…</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="todo-view">
        <div className="todo-body">
          <div className="view-empty">
            <div className="view-empty-title" style={{ color: 'var(--danger)' }}>
              Error: {error}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="todo-view">
      <div className="todo-header">
        <div>
          <h1 className="todo-title">TODO</h1>
          <p className="todo-subtitle">
            Capture everything. Organize by importance, add a tentative deadline, and break it down.
          </p>
        </div>
        <div className="todo-controls">
          <div className="todo-group-by">
            <span className="todo-group-by-label">Group by</span>
            <select
              className="todo-group-by-select"
              aria-label="Group by"
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}
            >
              <option value="matrix">Importance</option>
              <option value="deadline">Deadline</option>
            </select>
          </div>

          <div className="todo-filters" ref={filtersRef}>
            <button
              type="button"
              className={`btn-secondary todo-filters-trigger${filtersOn ? ' todo-filters-trigger-active' : ''}`}
              aria-haspopup="true"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <Funnel size={14} />
              Filters
              {filtersOn && <span className="todo-filters-badge">{filterBadgeCount}</span>}
            </button>
            {filtersOpen && (
              <div className="todo-filters-popover" role="group" aria-label="Filters">
                <button
                  type="button"
                  className={`todo-filter-toggle${filters.showCompleted ? ' todo-filter-toggle-active' : ''}`}
                  aria-pressed={filters.showCompleted}
                  onClick={() => setFilters({ showCompleted: !filters.showCompleted })}
                >
                  Show completed
                </button>

                <div className="todo-filter-group">
                  <span className="todo-filter-label">Deadline</span>
                  <div className="todo-filter-options">
                    {(['any', 'has', 'none'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`todo-filter-toggle${filters.deadline === option ? ' todo-filter-toggle-active' : ''}`}
                        aria-pressed={filters.deadline === option}
                        onClick={() => setFilters({ deadline: option })}
                      >
                        {option === 'any' ? 'Any' : option === 'has' ? 'Has deadline' : 'No deadline'}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className={`todo-filter-toggle${filters.overdueOnly ? ' todo-filter-toggle-active' : ''}`}
                  aria-pressed={filters.overdueOnly}
                  onClick={() => setFilters({ overdueOnly: !filters.overdueOnly })}
                >
                  Overdue only
                </button>

                <button
                  type="button"
                  className="todo-filter-clear"
                  onClick={resetFilters}
                  disabled={!filtersOn}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-accent btn-new-task"
            onClick={() => openEditor(null)}
          >
            <Plus size={16} />
            Add task
          </button>
        </div>
      </div>

      <div className="todo-body" ref={bodyRef}>
        {!hasAnyTasks ? (
          <div className="todo-empty">
            <div className="todo-empty-text">No tasks yet</div>
            <button
              type="button"
              className="btn-accent"
              onClick={() => openEditor(null)}
            >
              Create your first task
            </button>
          </div>
        ) : (
          <div className="todo-groups">
            {groupBy === 'matrix'
              ? matrixGroups.map((group) => {
                  const meta = QUADRANTS.find((q) => q.quadrant === group.quadrant)
                  if (!meta) return null
                  const isDrop = group.quadrant === 'drop'
                  const sort = sortByGroup[group.quadrant] ?? 'manual'
                  const reason = dragDisabledReason({ sort, filters })

                  return (
                    <section key={group.quadrant} className="todo-group">
                      <div className="todo-group-head">
                        <div className="todo-group-heading">
                          <span className="todo-group-dot" style={{ backgroundColor: meta.dot }} />
                          <h2 className="todo-group-label">{meta.label}</h2>
                          <span className="todo-group-count">{group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}</span>
                          <label className="todo-group-sort">
                            <span className="todo-group-sort-label"><ArrowsDownUp size={11} /> Sort</span>
                            <select
                              className="todo-group-sort-select"
                              aria-label={`Sort ${meta.label}`}
                              value={sort}
                              onChange={(event) => setGroupSort(group.quadrant, event.target.value as GroupSort)}
                            >
                              {SORT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <p className="todo-group-hint">{MATRIX_HINTS[group.quadrant]}</p>
                      </div>
                      <div
                        className="todo-group-rows"
                        onDragOver={(event) => { if (group.tasks.length === 0 && !reason) { event.preventDefault(); clearRowTarget() } }}
                        onDrop={(event) => { if (group.tasks.length === 0 && !reason) { event.preventDefault(); void dropOn(group.quadrant, null) } }}
                      >
                        {group.tasks.length === 0 && draggingId !== null && <div className="todo-empty-drop-zone">Drop here</div>}
                        {group.tasks.map((task: Task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            isDrop={isDrop}
                            onEdit={openEditor}
                            now={now}
                            onDragStart={() => beginDrag(task.id)}
                            onDragOver={() => { setDropHint(null); hoverRow(task.id) }}
                            onDrop={() => void dropOn(group.quadrant, task.id)}
                            onDragEnd={finishDrag}
                            dragTarget={dropTargetId === task.id}
                            onMoveUp={() => moveWithin(group.quadrant, group.tasks, group.tasks.findIndex((item) => item.id === task.id), -1)}
                            onMoveDown={() => moveWithin(group.quadrant, group.tasks, group.tasks.findIndex((item) => item.id === task.id), 1)}
                            canMoveUp={!reason && group.tasks[0]?.id !== task.id}
                            canMoveDown={!reason && group.tasks[group.tasks.length - 1]?.id !== task.id}
                            dragDisabledReason={reason}
                            onDragDisabledAttempt={setDropHint}
                            focused={focusedTaskId === task.id}
                          />
                        ))}
                        <AddTaskRow
                          label={`Add task to ${meta.label}`}
                          onAdd={(title) => void addTask({
                            title,
                            important: group.quadrant === 'do' || group.quadrant === 'plan',
                            urgent: group.quadrant === 'do' || group.quadrant === 'delegate',
                            priority: priorityFromQuadrant(group.quadrant),
                          })}
                        />
                      </div>
                    </section>
                  )
                })
              : deadlineGroups.map((group) => {
                  const meta = DEADLINE_BUCKETS.find((b) => b.bucket === group.bucket)
                  if (!meta) return null
                  const sort = sortByGroup[group.bucket] ?? 'manual'
                  const reason = dragDisabledReason({ sort, filters })

                  return (
                    <section key={group.bucket} className="todo-group">
                      <div className="todo-group-head">
                        <div className="todo-group-heading">
                          <span className="todo-group-dot" style={{ backgroundColor: meta.dot }} />
                          <h2 className="todo-group-label">{meta.label}</h2>
                          <span className="todo-group-count">{group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}</span>
                          <label className="todo-group-sort">
                            <span className="todo-group-sort-label"><ArrowsDownUp size={11} /> Sort</span>
                            <select
                              className="todo-group-sort-select"
                              aria-label={`Sort ${meta.label}`}
                              value={sort}
                              onChange={(event) => setGroupSort(group.bucket, event.target.value as GroupSort)}
                            >
                              {SORT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <p className="todo-group-hint">{DEADLINE_HINTS[group.bucket]}</p>
                      </div>
                      <div
                        className="todo-group-rows"
                        onDragOver={(event) => { if (group.tasks.length === 0 && !reason) { event.preventDefault(); hoverDeadline(group.bucket); clearRowTarget() } }}
                        onDrop={(event) => { if (group.tasks.length === 0 && !reason) { event.preventDefault(); void dropOn(group.bucket, null) } }}
                      >
                        {group.tasks.length === 0 && draggingId !== null && <div className="todo-empty-drop-zone">Drop here</div>}
                        {group.tasks.map((task: Task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onEdit={openEditor}
                            now={now}
                            onDragStart={() => beginDrag(task.id)}
                            onDragOver={() => { hoverDeadline(group.bucket); hoverRow(task.id) }}
                            onDrop={() => void dropOn(group.bucket, task.id)}
                            onDragEnd={finishDrag}
                            dragTarget={dropTargetId === task.id}
                            onMoveUp={() => moveWithin(group.bucket, group.tasks, group.tasks.findIndex((item) => item.id === task.id), -1)}
                            onMoveDown={() => moveWithin(group.bucket, group.tasks, group.tasks.findIndex((item) => item.id === task.id), 1)}
                            canMoveUp={!reason && group.tasks[0]?.id !== task.id}
                            canMoveDown={!reason && group.tasks[group.tasks.length - 1]?.id !== task.id}
                            dragDisabledReason={reason}
                            onDragDisabledAttempt={setDropHint}
                            focused={focusedTaskId === task.id}
                          />
                        ))}
                        <AddTaskRow
                          label={`Add task to ${meta.label}`}
                          onAdd={(title) => void addTask({ title })}
                        />
                      </div>
                    </section>
                  )
                })}
          </div>
        )}

        {dropHint && <div className="todo-drag-hint" role="status">{dropHint}</div>}
      </div>

      {editorOpen && <TaskEditor taskId={editorTaskId} onClose={closeEditor} />}
    </div>
  )
}
