import { describe, expect, it } from 'vitest'
import type { DayBlock } from '../db/types'
import { previewTodaySchedule } from './scheduling'

const block = (id: number, startMin: number, durationMin: number): DayBlock => ({
  id,
  day: '2026-08-10',
  taskId: null,
  subtaskId: null,
  title: `Block ${id}`,
  kind: 'deep',
  startMin,
  durationMin,
  pomodoros: 0,
  completed: false,
  sort: id,
  note: '',
  noteUpdatedAt: null,
  repeat: 'once',
  trackId: null,
  quiet: false,
})

describe('previewTodaySchedule', () => {
  it('uses the first free slot and reports its exact start/end', () => {
    expect(previewTodaySchedule([block(1, 540, 60)], 540, 30, 1200)).toMatchObject({
      valid: true,
      fits: true,
      startMin: 600,
      endMin: 630,
    })
  })

  it('rejects invalid quarter-hour subtask durations and shows a shutdown conflict', () => {
    expect(previewTodaySchedule([], 540, 20, 1200, { minDurationMin: 15, stepMin: 15 }).valid).toBe(false)
    expect(previewTodaySchedule([], 1140, 90, 1200, { minDurationMin: 15, stepMin: 15 })).toMatchObject({
      valid: true,
      fits: false,
      startMin: 1140,
      endMin: 1230,
      reason: 'Doesn\'t fit before shutdown (8:00 PM).',
    })
  })
})
