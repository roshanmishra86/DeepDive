import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as tasks from './tasks'
import * as blocks from './blocks'
import * as subtasks from './subtasks'

describe('subtasks repository', () => {
  let driver: SqlDriver
  let taskId: number

  beforeEach(async () => {
    driver = createTestDb().driver
    taskId = await tasks.createTask(driver, { title: 'Parent', createdAt: '2026-08-10T08:00:00Z' })
  })

  it('creates, orders, validates, and updates subtasks', async () => {
    const first = await subtasks.createSubtask(driver, { taskId, title: ' First ', estimateMin: 30, createdAt: '2026-08-10T08:01:00Z' })
    const second = await subtasks.createSubtask(driver, { taskId, title: 'Second', estimateMin: 45, createdAt: '2026-08-10T08:02:00Z' })
    expect((await subtasks.listSubtasks(driver, taskId)).map((item) => item.id)).toEqual([first, second])
    await subtasks.reorderSubtasks(driver, taskId, [second, first])
    expect((await subtasks.listSubtasks(driver, taskId)).map((item) => item.id)).toEqual([second, first])
    await subtasks.updateSubtask(driver, first, { title: 'Renamed', estimateMin: 60 })
    expect((await subtasks.listSubtasks(driver, taskId)).find((item) => item.id === first)?.title).toBe('Renamed')
    await expect(subtasks.createSubtask(driver, { taskId, title: 'Bad', estimateMin: 20, createdAt: 'now' })).rejects.toThrow()
  })

  it('computes allocation across days', async () => {
    const id = await subtasks.createSubtask(driver, { taskId, title: 'Research', estimateMin: 120, createdAt: 'now' })
    await blocks.createBlock(driver, { day: '2026-08-10', taskId, subtaskId: id, title: 'Research', kind: 'deep', startMin: 300, durationMin: 45 })
    await blocks.createBlock(driver, { day: '2026-08-11', taskId, subtaskId: id, title: 'Research', kind: 'deep', startMin: 300, durationMin: 60 })
    await expect(subtasks.getSubtaskAllocation(driver, id)).resolves.toEqual({ allocatedMin: 105, blockCount: 2 })
  })

  it('cascades subtasks and preserves historical blocks with null links', async () => {
    const id = await subtasks.createSubtask(driver, { taskId, title: 'Delete me', estimateMin: 15, createdAt: 'now' })
    const blockId = await blocks.createBlock(driver, { day: '2026-08-10', taskId, subtaskId: id, title: 'Historical', kind: 'deep', startMin: 300, durationMin: 15 })
    await driver.execute('DELETE FROM task WHERE id = ?', [taskId])
    expect(await subtasks.listSubtasks(driver, taskId)).toEqual([])
    const row = await driver.select<{ task_id: number | null; subtask_id: number | null }>('SELECT task_id, subtask_id FROM day_block WHERE id = ?', [blockId])
    expect(row[0]).toEqual({ task_id: null, subtask_id: null })
  })
})
