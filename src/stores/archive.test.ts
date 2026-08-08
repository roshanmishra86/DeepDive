import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import * as blocks from '../db/repos/blocks'
import { useArchiveStore } from './archive'

describe('archive store', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
    // Reset the store singleton: merge setState, never replace: true
    useArchiveStore.setState({
      year: new Date().getFullYear(),
      month0: new Date().getMonth(),
      statuses: {},
      selectedDay: null,
      record: null,
      headline: null,
      trend: [],
      loading: false,
      error: null,
    })
  })

  it('hydrates with real database data', async () => {
    const today = '2026-08-10'

    // Create a block on today
    const id = await blocks.createBlock(driver, {
      day: today,
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, id, true)

    await useArchiveStore.getState().hydrate(driver, today)

    const state = useArchiveStore.getState()
    expect(state.year).toBe(2026)
    expect(state.month0).toBe(7) // August (0-based)
    expect(state.statuses).toBeDefined()
    expect(state.headline).toBeDefined()
    expect(state.trend).toBeDefined()
    expect(state.trend.length).toBe(12)

    // Should select today by default
    expect(state.selectedDay).toBe(today)
    expect(state.record).not.toBeNull()
  })

  it('defaults to most recent day with a record when today has none', async () => {
    const today = '2026-08-10'
    const yesterday = '2026-08-09'

    // Create a block on yesterday, not today
    const id = await blocks.createBlock(driver, {
      day: yesterday,
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, id, true)

    await useArchiveStore.getState().hydrate(driver, today)

    const state = useArchiveStore.getState()
    expect(state.selectedDay).toBe(yesterday)
    expect(state.record).not.toBeNull()
  })

  it('selects null when no days in month have records', async () => {
    const today = '2026-08-10'

    // No blocks created at all
    await useArchiveStore.getState().hydrate(driver, today)

    const state = useArchiveStore.getState()
    expect(state.selectedDay).toBeNull()
    expect(state.record).toBeNull()
  })

  it('can select a day and load its record', async () => {
    const day = '2026-08-15'

    const id = await blocks.createBlock(driver, {
      day,
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, id, true)

    // Hydrate with a different day initially
    const today = '2026-08-10'
    await useArchiveStore.getState().hydrate(driver, today)

    // Now select the other day
    await useArchiveStore.getState().selectDay(day)

    const state = useArchiveStore.getState()
    expect(state.selectedDay).toBe(day)
    expect(state.record).not.toBeNull()
    expect(state.record?.blockCount).toBe(1)
  })

  it('can clear selection with selectDay(null)', async () => {
    const today = '2026-08-10'

    const id = await blocks.createBlock(driver, {
      day: today,
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 90,
    })
    await blocks.setBlockCompleted(driver, id, true)

    await useArchiveStore.getState().hydrate(driver, today)
    expect(useArchiveStore.getState().selectedDay).toBe(today)

    await useArchiveStore.getState().selectDay(null)

    const state = useArchiveStore.getState()
    expect(state.selectedDay).toBeNull()
    expect(state.record).toBeNull()
  })

  it('setMonth loads statuses for the new month', async () => {
    const today = '2026-08-10'

    // Create blocks in August and September
    const augBlock = await blocks.createBlock(driver, {
      day: '2026-08-15',
      title: 'August block',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
    })
    await blocks.setBlockCompleted(driver, augBlock, true)

    const sepBlock = await blocks.createBlock(driver, {
      day: '2026-09-10',
      title: 'September block',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
    })
    await blocks.setBlockCompleted(driver, sepBlock, true)

    await useArchiveStore.getState().hydrate(driver, today)
    expect(useArchiveStore.getState().month0).toBe(7) // August

    // Move to September
    await useArchiveStore.getState().setMonth(2026, 8)

    const state = useArchiveStore.getState()
    expect(state.month0).toBe(8) // September
    expect(state.statuses['2026-09-10']).toBeDefined()
  })

  it('clears selection when moving to a month without the selected day', async () => {
    const today = '2026-08-10'

    // Create a block in August
    const id = await blocks.createBlock(driver, {
      day: '2026-08-15',
      title: 'August block',
      kind: 'deep',
      startMin: 300,
      durationMin: 60,
    })
    await blocks.setBlockCompleted(driver, id, true)

    await useArchiveStore.getState().hydrate(driver, today)
    expect(useArchiveStore.getState().selectedDay).toBe('2026-08-15')

    // Move to September (selection was August, so it should clear)
    await useArchiveStore.getState().setMonth(2026, 8)

    const state = useArchiveStore.getState()
    expect(state.selectedDay).toBeNull()
    expect(state.record).toBeNull()
  })

  it('prevMonth and nextMonth navigate correctly', async () => {
    const today = '2026-08-10'
    await useArchiveStore.getState().hydrate(driver, today)

    expect(useArchiveStore.getState().month0).toBe(7) // August

    await useArchiveStore.getState().prevMonth()
    expect(useArchiveStore.getState().month0).toBe(6) // July

    await useArchiveStore.getState().nextMonth()
    expect(useArchiveStore.getState().month0).toBe(7) // August

    await useArchiveStore.getState().nextMonth()
    expect(useArchiveStore.getState().month0).toBe(8) // September
  })

  it('handles year boundaries on prevMonth and nextMonth', async () => {
    const today = '2026-01-10'
    await useArchiveStore.getState().hydrate(driver, today)

    expect(useArchiveStore.getState().year).toBe(2026)
    expect(useArchiveStore.getState().month0).toBe(0)

    // Go back a month → December 2025
    await useArchiveStore.getState().prevMonth()

    const state = useArchiveStore.getState()
    expect(state.year).toBe(2025)
    expect(state.month0).toBe(11)
  })

  it('includes headline stats and 12-week trend in hydrate', async () => {
    const today = '2026-08-10'

    // Create various blocks
    for (let i = 0; i < 3; i++) {
      const id = await blocks.createBlock(driver, {
        day: today,
        title: `Block ${i}`,
        kind: 'deep',
        startMin: 300 + i * 60,
        durationMin: 60,
      })
      if (i < 2) await blocks.setBlockCompleted(driver, id, true)
    }

    await useArchiveStore.getState().hydrate(driver, today)

    const state = useArchiveStore.getState()
    expect(state.headline).not.toBeNull()
    expect(state.headline?.blocksDone).toBe(2)
    expect(state.headline?.completionPct).toBe(67) // 2/3, rounded
    expect(state.trend.length).toBe(12)
    // The last entry should be for this week (the week containing today)
    expect(state.trend[11].hours).toBeGreaterThan(0)
    // Earlier entries should all be non-negative
    expect(state.trend[0].hours).toBeGreaterThanOrEqual(0)
  })

  it('anchors the 12-week trend to the week Monday when today is not a Monday', async () => {
    // 2026-08-12 is a Wednesday; its week's Monday is 2026-08-10. The repo
    // buckets Mon–Sun from the anchor it is given, so hydrating with a raw
    // non-Monday `today` would weekday-anchor every bar: the final "this
    // week" bar would sum today..today+6 (up to 6 future days) while this
    // week's Monday–Tuesday hours shift into the previous bar.
    const monday = '2026-08-10'
    const wednesday = '2026-08-12'

    const id = await blocks.createBlock(driver, {
      day: monday,
      title: 'Deep work',
      kind: 'deep',
      startMin: 300,
      durationMin: 120,
    })
    await blocks.setBlockCompleted(driver, id, true)

    await useArchiveStore.getState().hydrate(driver, wednesday)

    const state = useArchiveStore.getState()
    expect(state.trend.length).toBe(12)
    // The final bar is the current week, starting Monday — not Wednesday.
    expect(state.trend[11].weekStart).toBe(monday)
    // ...and Monday's 120 completed deep minutes land in it, not in the prior bar.
    expect(state.trend[11].hours).toBe(2.0)
    expect(state.trend[10].hours).toBe(0)
  })

  it('handles null driver gracefully (dev mode fallback)', async () => {
    const today = '2026-08-10'

    await useArchiveStore.getState().hydrate(null, today)

    const state = useArchiveStore.getState()
    expect(state.loading).toBe(false)
    // With no driver, should be mostly empty but not crashed
    expect(state.statuses).toEqual({})
  })

  it('records an error if hydrate fails', async () => {
    const today = '2026-08-10'
    const badDriver = {
      select: () => Promise.reject(new Error('DB error')),
      execute: () => Promise.reject(new Error('DB error')),
      close: () => Promise.resolve(),
      transaction: () => Promise.reject(new Error('DB error')),
    } as SqlDriver

    await useArchiveStore.getState().hydrate(badDriver, today)

    const state = useArchiveStore.getState()
    expect(state.error).toBeDefined()
    expect(state.error).toContain('DB error')
  })

  it('stale-response guard: an earlier call whose DB response arrives LATE must not clobber a later call that already resolved', async () => {
    const day1 = '2026-08-10'
    const day2 = '2026-08-15'

    for (const day of [day1, day2]) {
      const id = await blocks.createBlock(driver, {
        day,
        title: `Block on ${day}`,
        kind: 'deep',
        startMin: 300,
        durationMin: 60,
      })
      await blocks.setBlockCompleted(driver, id, true)
    }

    await useArchiveStore.getState().hydrate(driver, day1)

    // Wrap the driver so that a select() for day1's block rows is delayed —
    // this simulates the FIRST call's response arriving SECOND, which is the
    // only ordering that actually exercises the guard (awaiting promises in
    // call order, as the old version of this test did, proves nothing: with
    // no guard at all the last-issued call still finishes last).
    const gate = { released: false, release: null as (() => void) | null }
    const delayingDriver: SqlDriver = {
      ...driver,
      select: async <T>(sql: string, params?: unknown[]) => {
        if (!gate.released && sql.includes('FROM day_block') && params?.includes(day1)) {
          await new Promise<void>((resolve) => {
            gate.release = resolve
          })
        }
        return driver.select<T>(sql, params)
      },
    }
    useArchiveStore.setState({ selectedDay: null, record: null })
    // Re-point the store's persistence driver at the delaying wrapper by
    // hydrating through it (hydrate stores the driver reference internally).
    // Use a `today` with no record of its own so hydrate's own auto-select
    // logic doesn't itself call dayRecord(day1) and deadlock on the delay.
    await useArchiveStore.getState().hydrate(delayingDriver, '2026-08-01')
    useArchiveStore.setState({ selectedDay: null, record: null })

    const select = useArchiveStore.getState().selectDay
    const p1 = select(day1) // issued first -> its query is delayed
    const p2 = select(day2) // issued second -> resolves immediately

    await p2
    // At this point, only the second (later) call has resolved.
    expect(useArchiveStore.getState().selectedDay).toBe(day2)

    // Now let the first call's delayed query finish. If the guard is broken,
    // this stale response overwrites the correct day2 selection with day1.
    gate.released = true
    gate.release?.()
    await p1

    const state = useArchiveStore.getState()
    expect(state.selectedDay).toBe(day2)
    expect(state.record?.day).toBe(day2)
  })
})
