/**
 * Pure functions for template list and detail manipulation.
 * All functions are deterministic and testable without DOM or React.
 *
 * Weekday mask is 7 bits, Monday = bit 0 through Sunday = bit 6.
 */

import type { Template, TemplateBlock, TemplateCategory, TemplateDestination } from '../db/types'
import { sortBlocks } from './today'
import { minutesToClock } from './time'

/** Default template start time in minutes since midnight (300 = 5:00 AM). */
export const DEFAULT_TEMPLATE_START_MIN = 300

/**
 * Weekday metadata with bit position, short label (single letter), and full label.
 * Monday = bit 0, Sunday = bit 6.
 * Short labels for chip rendering: M/T/W/T/F/S/S
 * Full labels for detail pane buttons: Mon/Tue/Wed/Thu/Fri/Sat/Sun
 */
export const WEEKDAYS = [
  { bit: 0 as const, short: 'M' as const, label: 'Mon' as const },
  { bit: 1 as const, short: 'T' as const, label: 'Tue' as const },
  { bit: 2 as const, short: 'W' as const, label: 'Wed' as const },
  { bit: 3 as const, short: 'T' as const, label: 'Thu' as const },
  { bit: 4 as const, short: 'F' as const, label: 'Fri' as const },
  { bit: 5 as const, short: 'S' as const, label: 'Sat' as const },
  { bit: 6 as const, short: 'S' as const, label: 'Sun' as const },
] as const satisfies readonly { readonly bit: number; readonly short: string; readonly label: string }[]

/**
 * Checks if a given weekday bit is set in the mask.
 */
export function hasWeekday(mask: number, bit: number): boolean {
  return (mask & (1 << bit)) !== 0
}

/**
 * Toggles a weekday bit in the mask, returning the new mask.
 */
export function toggleWeekday(mask: number, bit: number): number {
  return mask ^ (1 << bit)
}

/**
 * Returns the WEEKDAYS entries whose bit is set in the mask, in Mon..Sun order.
 */
export function activeWeekdays(mask: number) {
  return WEEKDAYS.filter((d) => hasWeekday(mask, d.bit))
}

/**
 * Formats the active weekdays as a readable string.
 * Examples: "Mon, Wed, Fri", "Every day", "No repeat"
 */
export function formatWeekdays(mask: number): string {
  if (mask === 127) return 'Every day' // All 7 bits set
  if (mask === 0) return 'No repeat'

  const active = activeWeekdays(mask)
  return active.map((d) => d.label).join(', ')
}

/**
 * Template subtitle line combining weekday info and start time.
 * Matches the mockup (`mock-ups/Deep Work.dc.html` line ~465):
 * "Applies on Mon, Wed, Fri · starts 5:00 AM"
 *
 * - mask non-zero, not "every day": "Applies on <days> · starts <time>"
 * - mask 127 (every day): "Every day · starts <time>" — deliberately NOT
 *   "Applies on Every day", which reads badly.
 * - mask 0 (no repeat): "No repeat · starts <time>" — also without the
 *   "Applies on " prefix, since "Applies on No repeat" is nonsensical.
 */
export function templateSubtitle(mask: number, startMin: number): string {
  const weekdayText = formatWeekdays(mask)
  const startTime = minutesToClock(startMin)
  const prefix = mask !== 0 && mask !== 127 ? 'Applies on ' : ''
  return `${prefix}${weekdayText} · starts ${startTime}`
}

/**
 * Summary statistics for template blocks.
 * totalMin: sum of all block durations (excludes gap time)
 * blockCount: number of blocks
 * deepMin: sum of durations where kind === 'deep'
 * endMin: max(startMin + durationMin) across all blocks, 0 for empty
 */
export function templateTotals(
  blocks: TemplateBlock[]
): { totalMin: number; blockCount: number; deepMin: number; endMin: number } {
  if (blocks.length === 0) {
    return { totalMin: 0, blockCount: 0, deepMin: 0, endMin: 0 }
  }

  const totalMin = blocks.reduce((sum, b) => sum + b.durationMin, 0)
  const blockCount = blocks.length
  const deepMin = blocks.filter((b) => b.kind === 'deep').reduce((sum, b) => sum + b.durationMin, 0)

  const sorted = sortBlocks(blocks)
  let endMin = 0
  for (const block of sorted) {
    endMin = Math.max(endMin, block.startMin + block.durationMin)
  }

  return { totalMin, blockCount, deepMin, endMin }
}

/**
 * Finds the start time for a newly added template block.
 * If there are no blocks, returns template.startMin.
 * Otherwise, returns the end time of the last block in canonical order.
 */
export function nextTemplateBlockStart(blocks: TemplateBlock[], template: Template): number {
  if (blocks.length === 0) return template.startMin

  const sorted = sortBlocks(blocks)
  const last = sorted[sorted.length - 1]
  return last.startMin + last.durationMin
}

export interface TemplateStats {
  totalTemplates: number
  usedThisWeek: number
  recurringCount: number
  favouritesCount: number
}

export interface CategoryBreakdownItem {
  category: TemplateCategory
  label: string
  count: number
  percentage: number
  color: string
}

export interface StarterTemplateTask {
  title: string
  tag: string
  durationMin?: number
}

export interface StarterTemplateDefinition {
  name: string
  description: string
  category: TemplateCategory
  tags: string[]
  favourite: boolean
  weekdays: number
  startMin: number
  destination: TemplateDestination
  icon: string
  lastUsedDaysAgo: number | null
  tasks: StarterTemplateTask[]
}

/**
 * Filter templates by case-insensitive query across name, description, tags, and category,
 * as well as category / favourites tabs.
 */
export function filterTemplates<
  T extends {
    name: string
    description: string
    tags?: string[]
    category?: TemplateCategory
    favourite?: boolean
  },
>(templates: T[], query: string, categoryFilter: string): T[] {
  const q = query.trim().toLowerCase()
  const cat = categoryFilter.trim().toLowerCase()

  return templates.filter((tpl) => {
    if (cat === 'favourites') {
      if (!tpl.favourite) return false
    } else if (cat && cat !== 'all') {
      if ((tpl.category || 'work').toLowerCase() !== cat) return false
    }

    if (!q) return true
    const nameMatch = tpl.name.toLowerCase().includes(q)
    const descMatch = tpl.description.toLowerCase().includes(q)
    const tagMatch = tpl.tags ? tpl.tags.some((t) => t.toLowerCase().includes(q)) : false
    const catMatch = (tpl.category || '').toLowerCase().includes(q)
    return nameMatch || descMatch || tagMatch || catMatch
  })
}

/**
 * Compute aggregate statistics for top summary cards.
 */
export function computeTemplateStats(
  templates: { weekdays: number; favourite?: boolean; lastUsedAt?: string | null }[],
  referenceDate = new Date()
): TemplateStats {
  const oneWeekAgoMs = referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000
  let usedThisWeek = 0
  let recurringCount = 0
  let favouritesCount = 0

  for (const t of templates) {
    if (t.favourite) favouritesCount++
    if (t.weekdays > 0) recurringCount++
    if (t.lastUsedAt) {
      const usedMs = new Date(t.lastUsedAt).getTime()
      if (!Number.isNaN(usedMs) && usedMs >= oneWeekAgoMs) {
        usedThisWeek++
      }
    }
  }

  return {
    totalTemplates: templates.length,
    usedThisWeek,
    recurringCount,
    favouritesCount,
  }
}

/**
 * Compute category breakdown for the donut chart and legend.
 */
export function computeCategoryBreakdown(
  templates: { category?: TemplateCategory }[]
): CategoryBreakdownItem[] {
  const counts: Record<TemplateCategory, number> = {
    work: 0,
    personal: 0,
    ritual: 0,
    admin: 0,
  }

  for (const t of templates) {
    const cat = t.category || 'work'
    if (cat in counts) {
      counts[cat]++
    } else {
      counts.work++
    }
  }

  const total = templates.length
  const categories: { category: TemplateCategory; label: string; color: string }[] = [
    { category: 'work', label: 'Work', color: '#2d4a3e' },
    { category: 'personal', label: 'Personal', color: '#10b981' },
    { category: 'ritual', label: 'Ritual', color: '#8b5cf6' },
    { category: 'admin', label: 'Admin', color: '#3b82f6' },
  ]

  return categories.map(({ category, label, color }) => {
    const count = counts[category]
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0
    return {
      category,
      label,
      count,
      percentage,
      color,
    }
  })
}

/**
 * Format relative last used text for template badges and cards.
 */
export function formatLastUsed(
  lastUsedAt?: string | null,
  referenceDate = new Date()
): string {
  if (!lastUsedAt) return 'Never used'
  const date = new Date(lastUsedAt)
  if (Number.isNaN(date.getTime())) return 'Never used'

  const diffMs = referenceDate.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))

  if (diffDays <= 0) return 'Used today'
  if (diffDays === 1) return 'Used yesterday'
  if (diffDays < 7) return `Used ${diffDays} days ago`
  if (diffDays < 14) return 'Used 1 week ago'
  const weeks = Math.floor(diffDays / 7)
  return `Used ${weeks} weeks ago`
}

/**
 * Canonical starter templates matching the mockup in newScreen_Templates.png.
 * Exactly 12 templates: 5 Work (42%), 3 Personal (25%), 2 Ritual (17%), 2 Admin (17%).
 */
export const STARTER_TEMPLATES: StarterTemplateDefinition[] = [
  {
    name: 'Morning reset',
    description: 'Start the day with clarity and setup',
    category: 'ritual',
    tags: ['Ritual', 'Personal'],
    favourite: false,
    weekdays: 127, // Every day
    startMin: 360,
    destination: 'inbox',
    icon: 'sun',
    lastUsedDaysAgo: 2,
    tasks: [
      { title: 'Clear desk and open required documents', tag: 'Setup', durationMin: 15 },
      { title: 'Review goal for the session', tag: 'Planning', durationMin: 10 },
      { title: 'Put phone away / reduce distractions', tag: 'Environment', durationMin: 5 },
      { title: 'Capture next action before starting', tag: 'Productivity', durationMin: 10 },
    ],
  },
  {
    name: 'Deep work session prep',
    description: 'Create the right conditions before focused work',
    category: 'work',
    tags: ['Deep Work', 'Work'],
    favourite: true,
    weekdays: 31, // Mon - Fri
    startMin: 480,
    destination: 'inbox',
    icon: 'target',
    lastUsedDaysAgo: 0,
    tasks: [
      { title: 'Clear desk and open required documents', tag: 'Setup', durationMin: 15 },
      { title: 'Set focus timer for first session', tag: 'Deep Work', durationMin: 25 },
      { title: 'Review goal for the session', tag: 'Planning', durationMin: 15 },
      { title: 'Put phone away / reduce distractions', tag: 'Environment', durationMin: 5 },
      { title: 'Capture next action before starting', tag: 'Productivity', durationMin: 10 },
    ],
  },
  {
    name: 'Client follow-up pack',
    description: 'Check-ins, emails, and pending replies',
    category: 'admin',
    tags: ['Admin', 'Client'],
    favourite: false,
    weekdays: 0,
    startMin: 600,
    destination: 'todo',
    icon: 'users',
    lastUsedDaysAgo: 3,
    tasks: [
      { title: 'Check unread emails & client messages', tag: 'Communication', durationMin: 20 },
      { title: 'Draft responses to pending questions', tag: 'Client', durationMin: 30 },
      { title: 'Log follow-ups in CRM or tracker', tag: 'Admin', durationMin: 15 },
      { title: 'Send weekly status update emails', tag: 'Communication', durationMin: 25 },
      { title: 'Schedule upcoming sync meetings', tag: 'Calendar', durationMin: 15 },
      { title: 'Archive resolved inquiry threads', tag: 'Cleanup', durationMin: 10 },
    ],
  },
  {
    name: 'Weekly review',
    description: 'Close loops and reset the system',
    category: 'work',
    tags: ['Review', 'Planning'],
    favourite: true,
    weekdays: 16, // Friday
    startMin: 900,
    destination: 'inbox',
    icon: 'calendar',
    lastUsedDaysAgo: 5,
    tasks: [
      { title: 'Empty digital desktop and downloads', tag: 'Cleanup', durationMin: 15 },
      { title: 'Review past week calendar & completed blocks', tag: 'Review', durationMin: 20 },
      { title: 'Review upcoming week commitments', tag: 'Planning', durationMin: 20 },
      { title: 'Process TODO backlog and waiting list', tag: 'GTD', durationMin: 30 },
      { title: 'Update active project milestones', tag: 'Focus', durationMin: 25 },
      { title: 'Clear physical workspace', tag: 'Environment', durationMin: 15 },
      { title: 'Note down wins and weekly reflection', tag: 'Reflection', durationMin: 15 },
    ],
  },
  {
    name: 'Content writing sprint',
    description: 'Draft, edit, and publish in one pass',
    category: 'work',
    tags: ['Writing', 'Work'],
    favourite: false,
    weekdays: 0,
    startMin: 540,
    destination: 'todo',
    icon: 'file-text',
    lastUsedDaysAgo: 7,
    tasks: [
      { title: 'Outline key arguments and takeaways', tag: 'Planning', durationMin: 25 },
      { title: 'Write first draft without editing', tag: 'Deep Work', durationMin: 50 },
      { title: 'Polish structure, voice, and flow', tag: 'Editing', durationMin: 30 },
      { title: 'Add references and relevant links', tag: 'Research', durationMin: 15 },
      { title: 'Final proofread and publish', tag: 'Publishing', durationMin: 15 },
    ],
  },
  {
    name: 'Errands run',
    description: 'Quick personal tasks outside work',
    category: 'personal',
    tags: ['Personal', 'Errand'],
    favourite: false,
    weekdays: 0,
    startMin: 720,
    destination: 'todo',
    icon: 'shopping-cart',
    lastUsedDaysAgo: 7,
    tasks: [
      { title: 'Grocery store run for essentials', tag: 'Personal', durationMin: 45 },
      { title: 'Pharmacy or post office drop-off', tag: 'Errand', durationMin: 20 },
      { title: 'Fuel up and clean vehicle', tag: 'Personal', durationMin: 25 },
    ],
  },
  {
    name: 'Bug triage routine',
    description: 'Review incoming issues, reproduce, and prioritize',
    category: 'work',
    tags: ['Engineering', 'Work'],
    favourite: false,
    weekdays: 0,
    startMin: 600,
    destination: 'todo',
    icon: 'bug',
    lastUsedDaysAgo: null,
    tasks: [
      { title: 'Check error logs and crash reports', tag: 'Monitoring', durationMin: 15 },
      { title: 'Reproduce reported edge cases', tag: 'QA', durationMin: 30 },
      { title: 'Assign priority and fix estimates', tag: 'Triage', durationMin: 20 },
    ],
  },
  {
    name: 'Project kickoff checklist',
    description: 'Align scope, set milestones, and organize assets',
    category: 'work',
    tags: ['Project', 'Work'],
    favourite: false,
    weekdays: 0,
    startMin: 600,
    destination: 'inbox',
    icon: 'flag',
    lastUsedDaysAgo: null,
    tasks: [
      { title: 'Define project objective & success metrics', tag: 'Planning', durationMin: 25 },
      { title: 'Create repository & workspace folders', tag: 'Setup', durationMin: 15 },
      { title: 'Break project into phase milestones', tag: 'Structure', durationMin: 30 },
      { title: 'List initial 5 actionable tasks', tag: 'Execution', durationMin: 20 },
      { title: 'Share kickoff summary with stakeholders', tag: 'Comms', durationMin: 20 },
    ],
  },
  {
    name: 'Evening wind-down',
    description: 'Wrap up the day with clarity and restful habits',
    category: 'ritual',
    tags: ['Ritual', 'Personal'],
    favourite: false,
    weekdays: 0,
    startMin: 1260,
    destination: 'inbox',
    icon: 'moon',
    lastUsedDaysAgo: null,
    tasks: [
      { title: 'Run DeepDive shut down ritual', tag: 'Ritual', durationMin: 10 },
      { title: 'Put phone in charging drawer', tag: 'Habit', durationMin: 5 },
      { title: '15 minutes light reading or stretching', tag: 'Rest', durationMin: 15 },
      { title: 'Prep clothes and setup for tomorrow', tag: 'Setup', durationMin: 10 },
    ],
  },
  {
    name: 'Invoice & payroll review',
    description: 'Monthly bookkeeping, invoice dispatch, and verification',
    category: 'admin',
    tags: ['Finance', 'Admin'],
    favourite: false,
    weekdays: 0,
    startMin: 660,
    destination: 'todo',
    icon: 'receipt',
    lastUsedDaysAgo: null,
    tasks: [
      { title: 'Reconcile bank transactions for the period', tag: 'Accounting', durationMin: 30 },
      { title: 'Generate and send outstanding invoices', tag: 'Billing', durationMin: 25 },
      { title: 'Verify recurring subscription renewals', tag: 'Finance', durationMin: 15 },
      { title: 'File receipts in archives folder', tag: 'Admin', durationMin: 15 },
    ],
  },
  {
    name: 'Workout & health routine',
    description: 'Daily movement, stretching, and hydration check',
    category: 'personal',
    tags: ['Health', 'Personal'],
    favourite: false,
    weekdays: 0,
    startMin: 420,
    destination: 'inbox',
    icon: 'heart',
    lastUsedDaysAgo: null,
    tasks: [
      { title: '5-minute dynamic warmup & mobility', tag: 'Warmup', durationMin: 10 },
      { title: 'Core training or 30-min cardio', tag: 'Exercise', durationMin: 30 },
      { title: 'Hydration and post-workout protein', tag: 'Nutrition', durationMin: 10 },
    ],
  },
  {
    name: 'Quarterly planning audit',
    description: 'Assess OKRs, milestones, and high-level strategy',
    category: 'personal',
    tags: ['Strategy', 'Personal'],
    favourite: false,
    weekdays: 0,
    startMin: 600,
    destination: 'todo',
    icon: 'compass',
    lastUsedDaysAgo: null,
    tasks: [
      { title: 'Score goals from previous quarter', tag: 'Evaluation', durationMin: 30 },
      { title: 'Audit time allocation across focus areas', tag: 'Analytics', durationMin: 25 },
      { title: 'Set top 3 objectives for next quarter', tag: 'Strategy', durationMin: 35 },
      { title: 'Archive stale projects and outdated notes', tag: 'Cleanup', durationMin: 20 },
      { title: 'Schedule calendar milestones for next 90 days', tag: 'Planning', durationMin: 25 },
    ],
  },
]

/**
 * Returns a CSS modifier class for styling tag pills consistently across views.
 */
export function getTagClass(tag: string): string {
  const lower = tag.toLowerCase()
  if (lower.includes('work') || lower.includes('deep') || lower.includes('plan')) {
    return 'tpl-tag-mint'
  }
  if (lower.includes('client') || lower.includes('comm') || lower.includes('admin') || lower.includes('setup')) {
    return 'tpl-tag-blue'
  }
  if (lower.includes('ritual') || lower.includes('review') || lower.includes('writing') || lower.includes('prod')) {
    return 'tpl-tag-purple'
  }
  if (lower.includes('errand') || lower.includes('home') || lower.includes('env')) {
    return 'tpl-tag-orange'
  }
  return 'tpl-tag-slate'
}


