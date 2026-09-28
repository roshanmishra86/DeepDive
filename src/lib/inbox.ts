/**
 * Pure utility functions for the GTD Inbox screen.
 * Handles grouping into the 4 GTD sections (working, next, capture, waiting),
 * sorting, filtering, time formatting, and daily metric rollups.
 */

import type { DayBlock, InboxGroup, EnergyLevel } from '../db/types'

export type InboxSortMode = 'added' | 'priority' | 'estimate' | 'title'

export interface InboxFilterOptions {
  energy?: EnergyLevel | 'all'
  tag?: string | 'all'
  completed?: 'all' | 'active' | 'done'
  group?: InboxGroup | 'all'
}

export interface GroupedInbox {
  working: DayBlock[]
  next: DayBlock[]
  capture: DayBlock[]
  waiting: DayBlock[]
}

export interface InboxMetrics {
  capturedToday: number
  completedToday: number
  focusHoursLogged: string
  focusSecLogged: number
  importedFromTodoCount: number
}

/**
 * Categorize day blocks into their four GTD inbox groups.
 * Ensures every block is placed in exactly one group in sort order.
 */
export function groupInboxBlocks(blocks: DayBlock[]): GroupedInbox {
  const result: GroupedInbox = {
    working: [],
    next: [],
    capture: [],
    waiting: [],
  }

  for (const block of blocks) {
    const group: InboxGroup = block.inboxGroup ?? 'capture'
    if (group === 'working') {
      result.working.push(block)
    } else if (group === 'next') {
      result.next.push(block)
    } else if (group === 'waiting') {
      result.waiting.push(block)
    } else {
      result.capture.push(block)
    }
  }

  return result
}

/**
 * Sort a list of blocks within an inbox group.
 */
export function sortInboxGroup(blocks: DayBlock[], mode: InboxSortMode): DayBlock[] {
  const list = [...blocks]
  switch (mode) {
    case 'added':
      return list.sort((a, b) => a.id - b.id)
    case 'priority': {
      const energyWeight: Record<EnergyLevel, number> = {
        high: 3,
        medium: 2,
        low: 1,
      }
      return list.sort((a, b) => {
        const aW = a.energy ? energyWeight[a.energy] : 0
        const bW = b.energy ? energyWeight[b.energy] : 0
        if (aW !== bW) return bW - aW
        return a.sort - b.sort
      })
    }
    case 'estimate':
      return list.sort((a, b) => b.durationMin - a.durationMin)
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title))
    default:
      return list
  }
}

/**
 * Sort blocks in the unified list. When sorted by 'added', groups are ordered
 * in workflow sequence (working -> next -> capture -> waiting) matching the design spec.
 */
export function sortUnifiedInboxBlocks(blocks: DayBlock[], mode: InboxSortMode): DayBlock[] {
  const list = [...blocks]
  if (mode === 'added') {
    const groupPriority: Record<InboxGroup, number> = {
      working: 1,
      next: 2,
      capture: 3,
      waiting: 4,
    }
    return list.sort((a, b) => {
      const gA = groupPriority[a.inboxGroup ?? 'capture'] ?? 3
      const gB = groupPriority[b.inboxGroup ?? 'capture'] ?? 3
      if (gA !== gB) return gA - gB
      return a.id - b.id
    })
  }
  return sortInboxGroup(list, mode)
}

/**
 * Filter blocks according to energy level, tag, completion status, and group.
 */
export function filterInboxBlocks(blocks: DayBlock[], options: InboxFilterOptions): DayBlock[] {
  return blocks.filter((block) => {
    if (options.group && options.group !== 'all') {
      const blockGroup = block.inboxGroup ?? 'capture'
      if (blockGroup !== options.group) return false
    }
    if (options.energy && options.energy !== 'all' && block.energy !== options.energy) {
      return false
    }
    if (options.tag && options.tag !== 'all') {
      const tags = block.tags ?? []
      if (!tags.includes(options.tag)) return false
    }
    if (options.completed === 'active' && block.completed) {
      return false
    }
    if (options.completed === 'done' && !block.completed) {
      return false
    }
    return true
  })
}

/**
 * Computes headline summary metrics for the Inbox screen.
 */
export function computeInboxMetrics(blocks: DayBlock[]): InboxMetrics {
  const capturedToday = blocks.length
  const completedToday = blocks.filter((b) => b.completed).length
  const focusSecLogged = blocks.reduce((acc, b) => acc + (b.loggedSec ?? 0), 0)
  const importedFromTodoCount = blocks.filter((b) => b.importedFromTodo).length

  const hours = focusSecLogged / 3600
  const focusHoursLogged = `${hours.toFixed(1)} h`

  return {
    capturedToday,
    completedToday,
    focusHoursLogged,
    focusSecLogged,
    importedFromTodoCount,
  }
}

/**
 * Format elapsed logged seconds into a human-readable display string (e.g. "18 min" or "1.5 h").
 */
export function formatLoggedTime(loggedSec: number): string {
  if (loggedSec <= 0) return '0 min'
  const minutes = Math.floor(loggedSec / 60)
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = (loggedSec / 3600).toFixed(1)
  return `${hours} h`
}

/**
 * Format focus logged seconds into design reference display string (e.g. "2h 15m", "45m", "1h", "0 min").
 */
export function formatFocusTime(loggedSec: number): string {
  if (loggedSec <= 0) return '0 min'
  const totalMin = Math.floor(loggedSec / 60)
  if (totalMin === 0) return '0 min'
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hours === 0) {
    return `${mins}m`
  }
  if (mins === 0) {
    return `${hours}h`
  }
  return `${hours}h ${mins}m`
}

/**
 * Format energy level to capitalized label.
 */
export function formatEnergyLabel(level: EnergyLevel | null | undefined): string {
  if (!level) return ''
  switch (level) {
    case 'high':
      return 'High'
    case 'medium':
      return 'Medium'
    case 'low':
      return 'Low'
    default:
      return ''
  }
}

/**
 * Format due date into design reference string ("Today", "Tomorrow", "Apr 25", or "Later").
 */
export function formatDueDate(dueAt: string | null | undefined, group?: InboxGroup): string | null {
  if (dueAt) {
    const due = new Date(dueAt)
    if (!isNaN(due.getTime())) {
      const now = new Date()
      const isToday =
        due.getFullYear() === now.getFullYear() &&
        due.getMonth() === now.getMonth() &&
        due.getDate() === now.getDate()
      if (isToday) return 'Today'

      const tomorrow = new Date(now)
      tomorrow.setDate(now.getDate() + 1)
      const isTomorrow =
        due.getFullYear() === tomorrow.getFullYear() &&
        due.getMonth() === tomorrow.getMonth() &&
        due.getDate() === tomorrow.getDate()
      if (isTomorrow) return 'Tomorrow'

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${months[due.getMonth()]} ${due.getDate()}`
    }
  }
  if (group === 'waiting') {
    return 'Later'
  }
  return null
}

/**
 * Format estimate duration into a display string (e.g. "15 min", "90 min", "2 h").
 */
export function formatEstimateTime(durationMin: number): string {
  if (durationMin <= 0) return '0 min'
  if (durationMin >= 60 && durationMin % 60 === 0) {
    return `${durationMin / 60} h`
  }
  return `${durationMin} min`
}

/**
 * Map known tags or categories to their corresponding CSS pill class.
 */
export function getTagPillClass(tag: string): string {
  const normalized = tag.trim().toLowerCase()
  switch (normalized) {
    case 'deep work':
      return 'tag-deep-work'
    case 'admin':
      return 'tag-admin'
    case 'research':
      return 'tag-research'
    case 'reading':
      return 'tag-reading'
    case 'communication':
      return 'tag-communication'
    case 'planning':
      return 'tag-planning'
    case 'errand':
      return 'tag-errand'
    case 'waiting':
      return 'tag-waiting'
    default:
      return 'tag-neutral'
  }
}
