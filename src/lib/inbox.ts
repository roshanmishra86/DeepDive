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
 * Filter blocks according to energy level, tag, and completion status.
 */
export function filterInboxBlocks(blocks: DayBlock[], options: InboxFilterOptions): DayBlock[] {
  return blocks.filter((block) => {
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
