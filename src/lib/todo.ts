/**
 * Pure functions for the TODO (backlog) view logic. All functions are deterministic and
 * testable without DOM or React, using the node environment.
 *
 * Eisenhower matrix groups tasks by importance and urgency.
 * Deadline buckets organize tasks by when they're due.
 * All functions read-only; no mutations.
 */

import type { Task, Subtask, TaskPriority } from '../db/types'
import { startOfWeek, formatDuration } from './time'

/**
 * Priority metadata for display and sorting.
 */
export interface PriorityMeta {
  priority: TaskPriority
  label: string
  dot: string
}

/**
 * Task priorities in order: high, medium, low.
 * Dots use CSS custom properties for consistent theming.
 */
export const PRIORITIES: PriorityMeta[] = [
  { priority: 'high', label: 'High', dot: 'var(--danger)' },
  { priority: 'medium', label: 'Medium', dot: 'var(--warn)' },
  { priority: 'low', label: 'Low', dot: 'var(--text-faint)' },
]

/**
 * Composes a `dueAt` ISO instant from a `YYYY-MM-DD` date (from
 * `<input type="date">`) and an `HH:MM` time (from `<input type="time">`),
 * both interpreted as local wall-clock. Returns `null` for a blank date.
 * A blank time defaults to 17:00. This is the single place `dueAt` is
 * serialized — callers must never hand-build the string.
 */
export function composeDueAt(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !dateStr.trim()) return null
  const [year, month, day] = dateStr.split('-').map(Number)
  const time = timeStr && timeStr.trim() ? timeStr : '17:00'
  const [hh, mm] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hh, mm, 0, 0).toISOString()
}

/**
 * Inverse of `composeDueAt`: decomposes a `dueAt` ISO instant back into a
 * local `YYYY-MM-DD` date and `HH:MM` time for populating form fields.
 * Returns `{ date: '', time: '17:00' }` for an invalid/unparseable input.
 */
export function decomposeDueAt(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '17:00' }
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` }
}

/**
 * The single canonical ordering for tasks: incomplete before done,
 * then by the persisted manual sort position, then by id for stability.
 * Every consumer that needs "the order tasks appear in" must use this
 * same function. Returns a new array; does not mutate the input.
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // Incomplete before done
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.sort !== b.sort ? a.sort - b.sort : a.id - b.id
  })
}

export type Quadrant = 'do' | 'plan' | 'delegate' | 'drop'

/**
 * Maps a task to its Eisenhower quadrant.
 * do: important && urgent
 * plan: important && !urgent
 * delegate: !important && urgent
 * drop: !important && !urgent
 */
export function quadrantOf(task: Task): Quadrant {
  if (task.important && task.urgent) return 'do'
  if (task.important && !task.urgent) return 'plan'
  if (!task.important && task.urgent) return 'delegate'
  return 'drop'
}

export interface QuadrantMeta {
  quadrant: Quadrant
  label: string
  dot: string
}

export const QUADRANTS: QuadrantMeta[] = [
  { quadrant: 'do', label: 'Urgent & important', dot: 'var(--danger)' },
  { quadrant: 'plan', label: 'Important, not urgent', dot: 'var(--accent)' },
  { quadrant: 'delegate', label: 'Urgent, not important (batch or delegate)', dot: 'var(--warn)' },
  { quadrant: 'drop', label: 'Neither (someday / drop if needed)', dot: 'var(--border-strong)' },
]

/**
 * Maps a task's Eisenhower quadrant to its priority level.
 * do → high
 * plan, delegate → medium
 * drop → low
 *
 * This mirrors the migration 0006 backfill logic.
 */
export function priorityFromQuadrant(quadrant: Quadrant): TaskPriority {
  if (quadrant === 'do') return 'high'
  if (quadrant === 'plan' || quadrant === 'delegate') return 'medium'
  return 'low'
}

export type DeadlineBucket = 'soon' | 'week' | 'later' | 'none'

/**
 * Maps a task to a deadline bucket.
 * soon: dueAt instant <= now + 48 hours (including overdue/past)
 * week: dueAt instant <= end of current week (Sunday 23:59:59.999 local)
 * later: dueAt beyond this week
 * none: no dueAt, or an unparseable dueAt
 *
 * Compares the full instant (date and time-of-day), never a date floored
 * to midnight. Week starts Monday, ends Sunday at local midnight.
 */
export function deadlineBucket(task: Task, now: Date): DeadlineBucket {
  if (!task.dueAt) return 'none'

  const due = new Date(task.dueAt)
  if (Number.isNaN(due.getTime())) return 'none'

  // 48 hours from now
  const inTwoDays = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  if (due.getTime() <= inTwoDays.getTime()) return 'soon'

  // End of the current week (Sunday 23:59:59.999 local)
  const monday = startOfWeek(now)
  const endOfWeek = new Date(monday)
  endOfWeek.setDate(endOfWeek.getDate() + 7) // Next Monday at 00:00
  endOfWeek.setMilliseconds(-1) // 23:59:59.999 of Sunday

  if (due.getTime() <= endOfWeek.getTime()) return 'week'

  return 'later'
}

export interface DeadlineMeta {
  bucket: DeadlineBucket
  label: string
  dot: string
}

export const DEADLINE_BUCKETS: DeadlineMeta[] = [
  { bucket: 'soon', label: 'Due in 48 hours', dot: 'var(--danger)' },
  { bucket: 'week', label: 'Later this week', dot: 'var(--warn)' },
  { bucket: 'later', label: 'Beyond this week', dot: 'var(--text-faint)' },
  { bucket: 'none', label: 'No deadline', dot: 'var(--border-strong)' },
]

/**
 * Filter options for the TODO view.
 * showCompleted: include or exclude done tasks
 * deadline: filter by deadline bucket ('any' = no filter, 'has' = must have parseable due date, 'none' = no due date or unparseable)
 * overdueOnly: filter to only overdue tasks (requires a parseable dueAt before now)
 */
export interface TodoFilters {
  showCompleted: boolean
  deadline: 'any' | 'has' | 'none'
  overdueOnly: boolean
}

/**
 * Default filter state: show all tasks, all deadlines, not just overdue.
 */
export const DEFAULT_TODO_FILTERS: TodoFilters = {
  showCompleted: true,
  deadline: 'any',
  overdueOnly: false,
}

/**
 * Apply filter rules to a task list.
 * - showCompleted: false drops tasks where done is true
 * - deadline: 'has' keeps only tasks with a non-null, parseable dueAt;
 *   'none' keeps tasks with null or unparseable dueAt
 * - overdueOnly: true keeps only tasks whose parseable dueAt instant is before now
 *
 * Returns a new filtered array without mutating the input. Preserves input order.
 */
export function applyFilters(tasks: Task[], filters: TodoFilters, now: Date): Task[] {
  return tasks.filter((task) => {
    // showCompleted filter
    if (!filters.showCompleted && task.done) return false

    // deadline filter
    if (filters.deadline !== 'any') {
      const due = task.dueAt ? new Date(task.dueAt) : null
      const hasValidDue = due && !Number.isNaN(due.getTime())

      if (filters.deadline === 'has' && !hasValidDue) return false
      if (filters.deadline === 'none' && hasValidDue) return false
    }

    // overdueOnly filter
    if (filters.overdueOnly) {
      const due = task.dueAt ? new Date(task.dueAt) : null
      if (!due || Number.isNaN(due.getTime())) return false
      if (due.getTime() >= now.getTime()) return false
    }

    return true
  })
}

/**
 * Check whether any filter differs from the default, i.e., if filters
 * could hide a task.
 */
export function filtersActive(filters: TodoFilters): boolean {
  return (
    filters.showCompleted !== DEFAULT_TODO_FILTERS.showCompleted ||
    filters.deadline !== DEFAULT_TODO_FILTERS.deadline ||
    filters.overdueOnly !== DEFAULT_TODO_FILTERS.overdueOnly
  )
}

/**
 * Sort mode for tasks within a group.
 */
export type GroupSort = 'manual' | 'due' | 'priority' | 'title'

/**
 * Sort tasks within a group by the specified mode.
 *
 * - manual: use sortTasks (canonical ordering)
 * - due: tasks with parseable dueAt ascending by instant, then tasks without, ties keep input order
 * - priority: high, medium, low (per PRIORITIES order), ties keep input order
 * - title: case-insensitive ascending by title using localeCompare, ties keep input order
 *
 * Only 'manual' may reorder done-vs-incomplete; others sort purely on their key.
 * Never mutates the input; returns a new sorted array.
 */
export function sortGroup(tasks: Task[], mode: GroupSort): Task[] {
  const copy = [...tasks]
  if (mode === 'manual') {
    return sortTasks(copy)
  }

  const priorityOrder = new Map(PRIORITIES.map((p, i) => [p.priority, i]))

  copy.sort((a, b) => {
    if (mode === 'due') {
      const aDue = a.dueAt ? new Date(a.dueAt) : null
      const bDue = b.dueAt ? new Date(b.dueAt) : null
      const aValid = aDue && !Number.isNaN(aDue.getTime())
      const bValid = bDue && !Number.isNaN(bDue.getTime())

      if (aValid && bValid) return aDue!.getTime() - bDue!.getTime()
      if (aValid) return -1
      if (bValid) return 1
      return 0
    }

    if (mode === 'priority') {
      const aOrder = priorityOrder.get(a.priority) ?? 3
      const bOrder = priorityOrder.get(b.priority) ?? 3
      return aOrder - bOrder
    }

    if (mode === 'title') {
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    }

    return 0
  })

  return copy
}

/**
 * Reason why dragging is disabled, or null if dragging is allowed.
 * User-facing message for display.
 */
export type DragDisabledReason = string | null

/**
 * Determine if dragging is disabled and why.
 * Precedence:
 * 1. sort !== 'manual' → "Set sort to Manual to reorder by hand."
 * 2. filtersActive → "Clear filters to reorder by hand."
 * 3. null (dragging allowed)
 */
export function dragDisabledReason(args: {
  sort: GroupSort
  filters: TodoFilters
}): DragDisabledReason {
  if (args.sort !== 'manual') {
    return 'Set sort to Manual to reorder by hand.'
  }
  if (filtersActive(args.filters)) {
    return 'Clear filters to reorder by hand.'
  }
  return null
}

/**
 * Groups tasks by Eisenhower quadrant.
 * Always returns all 4 groups in QUADRANTS order (callers decide whether to
 * render empty ones). Each group's tasks are sorted via sortTasks.
 */
export function groupByMatrix(tasks: Task[]): Array<{ quadrant: Quadrant; tasks: Task[] }> {
  const sorted = sortTasks(tasks)
  const groups = new Map<Quadrant, Task[]>()
  for (const q of QUADRANTS.map((m) => m.quadrant)) {
    groups.set(q, [])
  }
  for (const task of sorted) {
    const q = quadrantOf(task)
    groups.get(q)!.push(task)
  }
  return QUADRANTS.map((m) => ({ quadrant: m.quadrant, tasks: groups.get(m.quadrant)! }))
}

/**
 * Groups tasks by deadline bucket.
 * Always returns all 4 groups in DEADLINE_BUCKETS order. Each group's
 * tasks are sorted via sortTasks.
 */
export function groupByDeadline(
  tasks: Task[],
  now: Date
): Array<{ bucket: DeadlineBucket; tasks: Task[] }> {
  const sorted = sortTasks(tasks)
  const groups = new Map<DeadlineBucket, Task[]>()
  for (const m of DEADLINE_BUCKETS) {
    groups.set(m.bucket, [])
  }
  for (const task of sorted) {
    const b = deadlineBucket(task, now)
    groups.get(b)!.push(task)
  }
  return DEADLINE_BUCKETS.map((m) => ({ bucket: m.bucket, tasks: groups.get(m.bucket)! }))
}

/**
 * Formats a due date for display.
 * Invalid/unparseable dueAt: "" (empty — caller omits the due segment)
 * Overdue/past: "overdue"
 * Same local day: "today, h:mm AM/PM"
 * Next local day: "tomorrow, h:mm AM/PM"
 * Within 7 days: "Fri" (3-letter weekday abbreviation)
 * Beyond 7 days: "12 Mar" (date and month)
 *
 * Parses dueAt as a full ISO instant and reads it back with local getters,
 * never UTC.
 */
export function formatDueLabel(dueAt: string, now: Date): string {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return ''

  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const dueHours = due.getHours()
  const dueMinutes = due.getMinutes()

  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(nowDate)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Check if overdue (compare the full instant)
  if (due.getTime() < now.getTime()) {
    return 'overdue'
  }

  // Same day
  if (
    dueDate.getFullYear() === nowDate.getFullYear() &&
    dueDate.getMonth() === nowDate.getMonth() &&
    dueDate.getDate() === nowDate.getDate()
  ) {
    const hours = dueHours % 12 === 0 ? 12 : dueHours % 12
    const period = dueHours < 12 ? 'AM' : 'PM'
    const minStr = String(dueMinutes).padStart(2, '0')
    return `today, ${hours}:${minStr} ${period}`
  }

  // Next day
  if (
    dueDate.getFullYear() === tomorrow.getFullYear() &&
    dueDate.getMonth() === tomorrow.getMonth() &&
    dueDate.getDate() === tomorrow.getDate()
  ) {
    const hours = dueHours % 12 === 0 ? 12 : dueHours % 12
    const period = dueHours < 12 ? 'AM' : 'PM'
    const minStr = String(dueMinutes).padStart(2, '0')
    return `tomorrow, ${hours}:${minStr} ${period}`
  }

  // Within 7 days
  const daysDiff = Math.floor((dueDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24))
  if (daysDiff <= 7) {
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return weekdays[dueDate.getDay()]
  }

  // Beyond 7 days
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${dueDate.getDate()} ${monthNames[dueDate.getMonth()]}`
}

/**
 * Presentation form of `formatDueLabel` for the TODO row's due chip, e.g.
 * "Due today, 5:00 PM" / "Due Sat, 16 Aug" / "Due 15 Aug" / "Overdue".
 * Reuses `formatDueLabel`'s bucketing (today/tomorrow/within-7-days/beyond)
 * as the single source of truth for *which* bucket a date falls in, then
 * only reformats for the chip: adds the "Due "/"Overdue" prefix, and — since
 * `formatDueLabel`'s within-7-days bucket returns a bare weekday ("Sat") —
 * appends the ", D Mon" the chip needs but the plain label omits. Returns ""
 * for an unparseable `dueAt` (caller renders a "No deadline" chip instead).
 */
export function formatDueChipLabel(dueAt: string, now: Date): string {
  const label = formatDueLabel(dueAt, now)
  if (!label) return ''
  if (label === 'overdue') return 'Overdue'
  if (label.startsWith('today') || label.startsWith('tomorrow')) return `Due ${label}`

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (weekdays.includes(label)) {
    const due = new Date(dueAt)
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]
    return `Due ${label}, ${due.getDate()} ${monthNames[due.getMonth()]}`
  }

  return `Due ${label}`
}

/**
 * Formats task metadata as a single line joined by " · ".
 * Includes estimate as "≈{formatDuration}..." when set, and
 * "due {formatDueLabel}" when dueAt is set. Returns null when
 * both are absent.
 */
export function taskMeta(task: Task, now: Date, subtasks: Subtask[] = []): string | null {
  const parts: string[] = []
  const estimateMin = effectiveTaskEstimate(task, subtasks)

  if (estimateMin) {
    parts.push(`≈${formatDuration(estimateMin)} left`)
  }

  if (task.dueAt) {
    const label = formatDueLabel(task.dueAt, now)
    if (label) parts.push(`due ${label}`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Creates a block draft from a task for "Plan today".
 * title: task.title
 * kind: "deep" if task.important, else "shallow"
 * durationMin: task.estimateMin or 60, clamped to minimum 5
 * pomodoros: for deep, Math.max(1, Math.round(durationMin / 30)); for shallow, 0
 * taskId: task.id
 */
export function blockDraftFromTask(task: Task, subtasks: Subtask[] = []): {
  title: string
  kind: 'deep' | 'shallow'
  durationMin: number
  pomodoros: number
  taskId: number
} {
  const durationMin = Math.max(5, effectiveTaskEstimate(task, subtasks) ?? 60)
  const kind = task.important ? 'deep' : 'shallow'
  const pomodoros = kind === 'deep' ? Math.max(1, Math.round(durationMin / 30)) : 0

  return {
    title: task.title,
    kind,
    durationMin,
    pomodoros,
    taskId: task.id,
  }
}

export const MIN_ESTIMATE_HOURS = 0.25
export const MAX_ESTIMATE_HOURS = 24
export const ESTIMATE_STEP_HOURS = 0.25

export function effectiveTaskEstimate(task: Task, subtasks: Subtask[]): number | null {
  return subtasks.length > 0
    ? subtasks.reduce((total, subtask) => total + subtask.estimateMin, 0)
    : task.estimateMin
}

export function remainingSubtaskEstimate(estimateMin: number, allocatedMin: number): number {
  return Math.max(0, estimateMin - allocatedMin)
}

export function blockDraftFromSubtask(
  task: Task,
  subtask: Subtask,
  durationMin: number
): {
  title: string
  kind: 'deep' | 'shallow'
  durationMin: number
  pomodoros: number
  taskId: number
  subtaskId: number
} {
  const duration = Math.max(15, Math.round(durationMin / 15) * 15)
  return {
    title: `${task.title}: ${subtask.title}`,
    kind: task.important ? 'deep' : 'shallow',
    durationMin: duration,
    pomodoros: task.important ? Math.max(1, Math.round(duration / 30)) : 0,
    taskId: task.id,
    subtaskId: subtask.id,
  }
}

/**
 * Upcoming tasks for the right rail.
 * Incomplete tasks only, ranked by quadrant priority (do, plan, delegate, drop)
 * then by sortTasks within each quadrant, capped at limit (default 5).
 * Returns array of { task, rankColor } where rankColor is the quadrant's dot token.
 */
export function upcomingTasks(
  tasks: Task[],
  _now: Date,
  limit: number = 5
): Array<{ task: Task; rankColor: string }> {
  const incomplete = tasks.filter((t) => !t.done)
  const quadrantMeta = new Map(QUADRANTS.map((m) => [m.quadrant, m.dot]))

  // Sort by quadrant priority, then within each quadrant by sort order
  const copy = [...incomplete]
  copy.sort((a, b) => {
    const quadrantOrder = { do: 0, plan: 1, delegate: 2, drop: 3 }
    const quadA = quadrantOf(a)
    const quadB = quadrantOf(b)
    const orderA = quadrantOrder[quadA]
    const orderB = quadrantOrder[quadB]

    if (orderA !== orderB) return orderA - orderB

    // Within same quadrant, sort by manual sort order, then by id
    if (a.sort !== b.sort) return a.sort - b.sort
    return a.id - b.id
  })

  return copy.slice(0, limit).map((task) => ({
    task,
    rankColor: quadrantMeta.get(quadrantOf(task))!,
  }))
}
