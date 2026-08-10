import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../../test/nodeDriver'
import type { SqlDriver } from '../driver'
import * as tasks from './tasks'

describe('tasks repository', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
  })

  it('creates and retrieves a task', async () => {
    const createdAt = new Date().toISOString()
    const id = await tasks.createTask(driver, {
      title: 'Test task',
      notes: 'Test notes',
      important: true,
      urgent: false,
      dueAt: '2026-08-10',
      estimateMin: 60,
      createdAt,
    })

    expect(id).toBeGreaterThan(0)

    const task = await tasks.getTask(driver, id)
    expect(task).not.toBeNull()
    expect(task?.title).toBe('Test task')
    expect(task?.important).toBe(true)
    expect(task?.urgent).toBe(false)
    expect(task?.done).toBe(false)
    expect(task?.archived).toBe(false)
  })

  it('converts 0/1 to boolean correctly, both directions', async () => {
    const id = await tasks.createTask(driver, {
      title: 'Bool test',
      createdAt: new Date().toISOString(),
      important: true,
      urgent: true,
    })

    // Defaults (done, archived) come back as real `false`, not 0.
    let task = await tasks.getTask(driver, id)
    expect(task?.important).toBe(true)
    expect(task?.urgent).toBe(true)
    expect(task?.done).toBe(false)
    expect(task?.archived).toBe(false)

    // Writing `false` round-trips back to `false`, not just falsy/0.
    await tasks.updateTask(driver, id, { important: false, done: true })
    task = await tasks.getTask(driver, id)
    expect(task?.important).toBe(false)
    expect(task?.done).toBe(true)
  })

  it('updates a task', async () => {
    const id = await tasks.createTask(driver, {
      title: 'Original',
      createdAt: new Date().toISOString(),
    })

    await tasks.updateTask(driver, id, { title: 'Updated', important: true })

    const task = await tasks.getTask(driver, id)
    expect(task?.title).toBe('Updated')
    expect(task?.important).toBe(true)
  })

  it('sets task flags', async () => {
    const id = await tasks.createTask(driver, {
      title: 'Flag test',
      createdAt: new Date().toISOString(),
    })

    await tasks.setTaskFlags(driver, id, { important: true, urgent: false })

    const task = await tasks.getTask(driver, id)
    expect(task?.important).toBe(true)
    expect(task?.urgent).toBe(false)
  })

  it('marks task as done', async () => {
    const id = await tasks.createTask(driver, {
      title: 'Done test',
      createdAt: new Date().toISOString(),
    })

    await tasks.setTaskDone(driver, id, true)

    const task = await tasks.getTask(driver, id)
    expect(task?.done).toBe(true)
  })

  it('archives a task', async () => {
    const id = await tasks.createTask(driver, {
      title: 'Archive test',
      createdAt: new Date().toISOString(),
    })

    await tasks.setTaskDone(driver, id, true, '2026-08-10T10:00:00.000Z')
    expect(await tasks.archiveTask(driver, id, '2026-08-10T11:00:00.000Z')).toBe(true)

    const archived = await tasks.listTasks(driver, { archived: true })
    expect(archived.some((t) => t.id === id)).toBe(true)
    expect(archived.find((t) => t.id === id)?.completedAt).toBe('2026-08-10T10:00:00.000Z')
    expect(archived.find((t) => t.id === id)?.archivedAt).toBe('2026-08-10T11:00:00.000Z')
  })

  it('lists non-archived tasks', async () => {
    const id = await tasks.createTask(driver, {
      title: 'Active task',
      createdAt: new Date().toISOString(),
    })

    const active = await tasks.listTasks(driver, { archived: false })
    expect(active.some((t) => t.id === id)).toBe(true)
  })

  it('deletes a task', async () => {
    const id = await tasks.createTask(driver, {
      title: 'Delete me',
      createdAt: new Date().toISOString(),
    })

    await tasks.deleteTask(driver, id)

    const task = await tasks.getTask(driver, id)
    expect(task).toBeNull()
  })
})
