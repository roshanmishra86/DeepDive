import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { DayStatus } from '../db/types'
import * as archiveRepo from '../db/repos/archive'
import type { DayRecord, HeadlineStats } from '../db/repos/archive'
import { toDayKey, fromDayKey, startOfWeek } from '../lib/time'
import { monthGridRange, addMonths } from '../lib/archive'

/**
 * Archive store. Displays a calendar month with day statuses and deep-hour
 * trends. Hydrates statuses and headline stats from the database.
 *
 * Error contract (P2-A): every mutator catches its own persistence errors,
 * sets `error`, and RETURNS — it never throws. Actions that gate a UI
 * transition return `boolean` or `id | null`.
 */
interface ArchiveState {
  year: number
  month0: number // 0-based month
  statuses: Record<string, DayStatus>
  selectedDay: string | null
  record: DayRecord | null
  headline: HeadlineStats | null
  trend: { weekStart: string; hours: number }[]
  // Global "does the archive have anything at all" flag (any day_block or
  // day_note row). Drives the fresh-install empty state. Populated once in
  // hydrate — setMonth does not recompute it (it is not per-month).
  hasRecords: boolean
  loading: boolean
  error: string | null

  // Hydrate the store with data for the given month and today's date.
  // Sets initial selection to today if it has a record, else the most recent
  // day in the month with a record, else null.
  hydrate: (driver: SqlDriver | null, today: string) => Promise<void>

  // Move to a different month. Async because it loads statuses from the DB.
  // Includes a stale-response guard. If the currently selected day is not in
  // the new month, clears the selection.
  setMonth: (year: number, month0: number) => Promise<void>

  // Navigate to the previous month.
  prevMonth: () => Promise<void>

  // Navigate to the next month.
  nextMonth: () => Promise<void>

  // Select a day to view its record. Async because it loads the record from the DB.
  // Includes a stale-response guard. Pass null to clear the selection.
  selectDay: (day: string | null) => Promise<void>
}

let persistenceDriver: SqlDriver | null = null
let requestCounter = 0 // For stale-response detection

export const useArchiveStore = create<ArchiveState>()((set, get) => ({
  year: new Date().getFullYear(),
  month0: new Date().getMonth(),
  statuses: {},
  selectedDay: null,
  record: null,
  headline: null,
  trend: [],
  hasRecords: false,
  loading: false,
  error: null,

  hydrate: async (driver, today) => {
    persistenceDriver = driver
    set({ loading: true, error: null })

    try {
      if (!driver) {
        set({ loading: false })
        return
      }

      // Fetch headline stats and the global has-records flag in the same pass
      const headline = await archiveRepo.headlineStats(driver, today)
      const hasRecords = await archiveRepo.hasAnyRecords(driver)

      // Fetch 12-week trend. The repo buckets Mon–Sun from the anchor it is
      // given, so the anchor must be the Monday of today's week — the same
      // convention as Sidebar.tsx's toDayKey(startOfWeek(new Date())).
      // Passing `today` raw would weekday-anchor every bar and push this
      // week's Monday-through-yesterday hours into the previous bar.
      const trend = await archiveRepo.deepHoursLast12Weeks(
        driver,
        toDayKey(startOfWeek(fromDayKey(today)))
      )

      // Default to current month
      const [todayYear, todayMonth, todayDay] = today.split('-').map(Number)
      const now = new Date(todayYear, todayMonth - 1, todayDay)
      const year = now.getFullYear()
      const month0 = now.getMonth()

      // Fetch statuses for the month (grid range shared with `monthGrid` — see lib/archive.ts)
      const lastOfMonth = new Date(year, month0 + 1, 0)
      const { fromDay, toDay } = monthGridRange(year, month0)

      const statuses = await archiveRepo.dayStatuses(driver, fromDay, toDay)

      // Default selection: today if it has a record, else most recent with record, else null
      let selectedDay: string | null = null
      if (statuses[today]) {
        selectedDay = today
      } else {
        // Find the most recent day in the month with a record
        let cursor = new Date(lastOfMonth)
        while (cursor.getMonth() === month0 && cursor.getFullYear() === year) {
          const dayStr = toDayKey(cursor)
          if (statuses[dayStr]) {
            selectedDay = dayStr
            break
          }
          cursor.setDate(cursor.getDate() - 1)
        }
      }

      // Load the selected day's record in the same pass and commit it in the
      // same set — a separate post-hydrate set({ record }) could clobber a
      // selectDay result landing in between (hydrate has no requestCounter
      // slot), and left `record` stale when the new selection was null.
      const record = selectedDay ? await archiveRepo.dayRecord(driver, selectedDay) : null

      set({
        year,
        month0,
        statuses,
        headline,
        trend,
        hasRecords,
        selectedDay,
        record,
        loading: false,
      })
    } catch (err) {
      console.error('Failed to hydrate archive store:', err)
      set({ error: String(err), loading: false })
    }
  },

  setMonth: async (year, month0) => {
    const state = get()
    if (state.year === year && state.month0 === month0) return

    const currentRequestId = ++requestCounter
    set({ loading: true, error: null })

    try {
      if (!persistenceDriver) {
        set({ loading: false })
        return
      }

      // Fetch statuses for the month (grid range shared with `monthGrid` — see lib/archive.ts)
      const { fromDay, toDay } = monthGridRange(year, month0)

      const statuses = await archiveRepo.dayStatuses(persistenceDriver, fromDay, toDay)

      // Stale-response guard
      if (currentRequestId !== requestCounter) return

      // If the currently selected day is no longer in this month, clear selection
      const state = get()
      let selectedDay = state.selectedDay
      if (selectedDay) {
        const [selYear, selMonth, selDay] = selectedDay.split('-').map(Number)
        const selectedDate = new Date(selYear, selMonth - 1, selDay)
        if (selectedDate.getFullYear() !== year || selectedDate.getMonth() !== month0) {
          selectedDay = null
        }
      }

      set({
        year,
        month0,
        statuses,
        selectedDay,
        record: selectedDay ? state.record : null,
        loading: false,
      })
    } catch (err) {
      console.error('Failed to set archive month:', err)
      set({ error: String(err), loading: false })
    }
  },

  prevMonth: async () => {
    const state = get()
    // Uses lib/archive.ts's addMonths rather than reimplementing month
    // arithmetic inline — was previously duplicated (and addMonths itself
    // was unreachable dead code as a result).
    const prev = addMonths(new Date(state.year, state.month0, 1), -1)
    await get().setMonth(prev.getFullYear(), prev.getMonth())
  },

  nextMonth: async () => {
    const state = get()
    const next = addMonths(new Date(state.year, state.month0, 1), 1)
    await get().setMonth(next.getFullYear(), next.getMonth())
  },

  selectDay: async (day) => {
    const currentRequestId = ++requestCounter

    if (!day) {
      set({ selectedDay: null, record: null })
      return
    }

    try {
      if (!persistenceDriver) {
        set({ selectedDay: day, record: null })
        return
      }

      const record = await archiveRepo.dayRecord(persistenceDriver, day)

      // Stale-response guard
      if (currentRequestId !== requestCounter) return

      set({ selectedDay: day, record })
    } catch (err) {
      console.error('Failed to select archive day:', err)
      set({ error: String(err) })
    }
  },
}))
