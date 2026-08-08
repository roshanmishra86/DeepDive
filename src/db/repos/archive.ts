/**
 * Archive repository — computed aggregates for history view.
 * All results are computed in SQL with no stored duplicates: day statuses, records,
 * headline stats, weekly deep-minute rollups, and 12-week trend data.
 */

import type { SqlDriver } from '../driver'
import type { DayStatus, DayBlock } from '../types'
import { toDayKey, fromDayKey, addDays } from '../../lib/time'
import { sortBlocks } from '../../lib/today'
import type { BlockRow } from './blocks'
import { rowToBlock } from './blocks'

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


export async function dayStatuses(
  driver: SqlDriver,
  fromDay: string,
  toDay: string
): Promise<Record<string, DayStatus>> {
  // Two sources feed one status per day: block outcomes (full/part/miss) and
  // notes on days with zero blocks ('note' — a shut-down note with nothing
  // planned is not the same thing as a miss). Avoid FULL OUTER JOIN (not
  // reliably available across the SQLite builds this app runs on — bundled
  // sqlx in prod, node:sqlite in tests); UNION ALL + GROUP BY MAX is
  // portable and equivalent here since a note-only placeholder row is always
  // (0, 0), so MAX just lets real block counts win when a day has both.
  // The note branch filters `note != ''` because a day_note row is not
  // evidence of a note: setDayShutdown upserts rows with the schema-default
  // empty note (per-day shutdown override on a note-less day), and dayRecord
  // treats '' as no note and returns null. The filter keeps the two in
  // agreement — without it such a day got a clickable 'note' dot whose
  // record was null.
  const rows = await driver.select<{ day: string; status: DayStatus }>(
    `SELECT day,
            CASE
              WHEN blockCount = 0 THEN 'note'
              WHEN blockCount = completedCount THEN 'full'
              WHEN completedCount = 0 THEN 'miss'
              ELSE 'part'
            END as status
     FROM (
       SELECT day, MAX(blockCount) as blockCount, MAX(completedCount) as completedCount
       FROM (
         SELECT day, COUNT(*) as blockCount,
                SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completedCount
         FROM day_block
         WHERE day BETWEEN ? AND ?
         GROUP BY day
         UNION ALL
         SELECT day, 0 as blockCount, 0 as completedCount
         FROM day_note
         WHERE day BETWEEN ? AND ? AND note != ''
       )
       GROUP BY day
     )`,
    [fromDay, toDay, fromDay, toDay]
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
    completedCount: number | null
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

  const stats = rows[0]
  const blockCount = stats.blockCount
  const completedCount = stats.completedCount ?? 0

  // Fetch the shut-down note — it may exist even if there are no blocks
  const noteRows = await driver.select<{ note: string }>(
    'SELECT note FROM day_note WHERE day = ?',
    [day]
  )
  const note = noteRows.length > 0 ? noteRows[0].note : ''

  // If there are no blocks and no note, return null (no record on this day)
  if (blockCount === 0 && !note) {
    return null
  }

  // Determine status. Must agree with the SQL CASE in `dayStatuses` above —
  // a zero-block day is 'note' (nothing was planned), never 'miss' ('miss'
  // asserts blocks were planned and none landed).
  const status: DayStatus =
    blockCount === 0
      ? 'note'
      : blockCount === completedCount
        ? 'full'
        : completedCount === 0
          ? 'miss'
          : 'part'

  // Fetch blocks and apply the canonical ordering
  const blockRows = await driver.select<BlockRow>(
    'SELECT * FROM day_block WHERE day = ?',
    [day]
  )
  const blocks = sortBlocks(blockRows.map(rowToBlock))

  return {
    day,
    status,
    blockCount: stats.blockCount,
    completedCount,
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
