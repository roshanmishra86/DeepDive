/**
 * Archive repository — computed aggregates for history view.
 * All results are computed in SQL with no stored duplicates: day statuses, records,
 * headline stats, weekly deep-minute rollups, and 12-week trend data.
 */

import type { SqlDriver } from '../driver'
import type { DayStatus, DayBlock, BlockKind, BlockRepeat } from '../types'
import { toDayKey, fromDayKey, addDays } from '../../lib/time'

export interface DayRecord {
  day: string
  status: DayStatus
  blockCount: number
  completedCount: number
  deepMin: number
  pomodoros: number
  note: string
  blocks: DayBlock[]
}

export interface HeadlineStats {
  blocksDone: number
  completionPct: number
  dayStreak: number
}

// Row shape returned by `SELECT * FROM day_block`, used by dayRecord below.
interface DayBlockRow {
  id: number
  day: string
  task_id: number | null
  title: string
  kind: BlockKind
  start_min: number
  duration_min: number
  pomodoros: number
  completed: number
  sort: number
  note: string
  repeat: BlockRepeat
  track_id: number | null
  quiet: number
}

export async function dayStatuses(
  driver: SqlDriver,
  fromDay: string,
  toDay: string
): Promise<Record<string, DayStatus>> {
  const rows = await driver.select<{ day: string; status: DayStatus }>(
    `SELECT day,
            CASE
              WHEN COUNT(*) > 0 AND COUNT(*) = SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) THEN 'full'
              WHEN COUNT(*) > 0 AND SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) = 0 THEN 'miss'
              ELSE 'part'
            END as status
     FROM day_block
     WHERE day BETWEEN ? AND ?
     GROUP BY day`,
    [fromDay, toDay]
  )
  const result: Record<string, DayStatus> = {}
  for (const row of rows) {
    result[row.day] = row.status
  }
  return result
}

export async function dayRecord(driver: SqlDriver, day: string): Promise<DayRecord | null> {
  const rows = await driver.select<{
    blockCount: number
    completedCount: number
    deepMin: number
    pomodoros: number
  }>(
    `SELECT
       COUNT(db.id) as blockCount,
       SUM(CASE WHEN db.completed = 1 THEN 1 ELSE 0 END) as completedCount,
       COALESCE(SUM(CASE WHEN db.kind = 'deep' AND db.completed = 1 THEN db.duration_min ELSE 0 END), 0) as deepMin,
       COALESCE(SUM(db.pomodoros), 0) as pomodoros
     FROM day_block db
     WHERE db.day = ?`,
    [day]
  )

  if (rows.length === 0 || rows[0].blockCount === 0) {
    return null
  }

  const stats = rows[0]
  const status: DayStatus =
    stats.blockCount > 0 && stats.blockCount === stats.completedCount
      ? 'full'
      : stats.blockCount > 0 && stats.completedCount === 0
        ? 'miss'
        : 'part'

  const noteRows = await driver.select<{ note: string }>(
    'SELECT note FROM day_note WHERE day = ?',
    [day]
  )
  const note = noteRows.length > 0 ? noteRows[0].note : ''

  const blockRows = await driver.select<DayBlockRow>(
    'SELECT * FROM day_block WHERE day = ? ORDER BY sort, start_min',
    [day]
  )
  const blocks = blockRows.map((row) => ({
    id: row.id,
    day: row.day,
    taskId: row.task_id,
    title: row.title,
    kind: row.kind,
    startMin: row.start_min,
    durationMin: row.duration_min,
    pomodoros: row.pomodoros,
    completed: row.completed === 1,
    sort: row.sort,
    note: row.note,
    repeat: row.repeat,
    trackId: row.track_id,
    quiet: row.quiet === 1,
  }))

  return {
    day,
    status,
    blockCount: stats.blockCount,
    completedCount: stats.completedCount,
    deepMin: stats.deepMin,
    pomodoros: stats.pomodoros,
    note,
    blocks,
  }
}

// `today` is the local-time day key (see src/lib/time.ts#toDayKey), passed in explicitly
// rather than computed here so the caller controls timezone and the function stays testable.
export async function headlineStats(driver: SqlDriver, today: string): Promise<HeadlineStats> {
  const statsRows = await driver.select<{
    blocksDone: number
    totalBlocks: number
  }>(
    `SELECT
       SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as blocksDone,
       COUNT(*) as totalBlocks
     FROM day_block`
  )

  const stats = statsRows[0]
  const blocksDone = stats.blocksDone ?? 0
  const totalBlocks = stats.totalBlocks ?? 0
  const completionPct = totalBlocks > 0 ? Math.round((100 * blocksDone) / totalBlocks) : 0

  // Day streak: the set of days with >= 1 completed block, then walk backwards in TS
  // from `today` (or `today - 1` if today itself has no completed block yet) counting
  // consecutive hits. O(streak length), trivially reviewable, no recursive-CTE fan-out.
  const completedDayRows = await driver.select<{ day: string }>(
    'SELECT DISTINCT day FROM day_block WHERE completed = 1'
  )
  const completedDays = new Set(completedDayRows.map((row) => row.day))

  let cursor = fromDayKey(today)
  if (!completedDays.has(today)) {
    cursor = addDays(cursor, -1)
  }
  let dayStreak = 0
  while (completedDays.has(toDayKey(cursor))) {
    dayStreak += 1
    cursor = addDays(cursor, -1)
  }

  return {
    blocksDone,
    completionPct,
    dayStreak,
  }
}

export async function deepMinutesByWeekday(
  driver: SqlDriver,
  mondayDay: string
): Promise<number[]> {
  // Get the date for each day of the week starting from Monday
  const days: string[] = []
  const monday = fromDayKey(mondayDay)
  for (let i = 0; i < 7; i++) {
    days.push(toDayKey(addDays(monday, i)))
  }

  const rows = await driver.select<{ day: string; deepMin: number }>(
    `SELECT day, COALESCE(SUM(CASE WHEN kind = 'deep' AND completed = 1 THEN duration_min ELSE 0 END), 0) as deepMin
     FROM day_block
     WHERE day IN (?, ?, ?, ?, ?, ?, ?)
     GROUP BY day`,
    days
  )

  const byDay: Record<string, number> = {}
  for (const row of rows) {
    byDay[row.day] = row.deepMin
  }

  return days.map((day) => byDay[day] ?? 0)
}

export async function deepHoursLast12Weeks(
  driver: SqlDriver,
  mondayOfCurrentWeek: string
): Promise<{ weekStart: string; hours: number }[]> {
  const result: { weekStart: string; hours: number }[] = []

  // Generate 12 weeks going backward from current week
  const currentMonday = fromDayKey(mondayOfCurrentWeek)
  for (let week = 11; week >= 0; week--) {
    const weekStart = addDays(currentMonday, -week * 7)
    const weekStartStr = toDayKey(weekStart)

    const weekEnd = addDays(weekStart, 6)
    const weekEndStr = toDayKey(weekEnd)

    const rows = await driver.select<{ totalMin: number }>(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'deep' AND completed = 1 THEN duration_min ELSE 0 END), 0) as totalMin
       FROM day_block
       WHERE day BETWEEN ? AND ?`,
      [weekStartStr, weekEndStr]
    )

    const totalMin = rows[0]?.totalMin ?? 0
    const hours = Math.round((totalMin / 60) * 10) / 10 // Round to 0.1 hours

    result.push({
      weekStart: weekStartStr,
      hours,
    })
  }

  return result
}
