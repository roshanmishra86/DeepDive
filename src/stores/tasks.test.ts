import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import * as tasksRepo from '../db/repos/tasks'
import { useTasksStore } from './tasks'

describe('tasks store', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
    // Reset the store singleton
    useTasksStore.setState({
      tasks: [],
      groupBy: 'matrix',
      loading: false,
      error: null,
    })
  })

  it('hydrates tasks from the database', async () => {
    // Create some tasks in the database
    const id1 = await tasksRepo.createTask(driver, {
      title: 'Task 1',
      createdAt: new Date().toISOString(),
    })
    const id2 = await tasksRepo.createTask(driver, {
      title: 'Task 2',
      createdAt: new Date().toISOString(),
    })

    // Hydrate
    await useTasksStore.getState().hydrate(driver)

    const state = useTasksStore.getState()
    expect(state.tasks).toHaveLength(2)
    expect(state.tasks[0].id).toBe(id1)
    expect(state.tasks[1].id).toBe(id2)
  })

  it('adds a task and persists it', async () => {
    await useTasksStore.getState().hydrate(driver)

    // Add a task
    await useTasksStore.getState().addTask({
      title: 'New task',
      notes: 'Some notes',
      important: true,
      urgent: false,
    })

    // Check in-memory state
    let state = useTasksStore.getState()
    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0].title).toBe('New task')
    expect(state.tasks[0].important).toBe(true)
    expect(state.tasks[0].urgent).toBe(false)

    // Verify it persisted to the database
    const fromDb = await tasksRepo.listTasks(driver, { archived: false })
    expect(fromDb).toHaveLength(1)
    expect(fromDb[0].title).toBe('New task')
    expect(fromDb[0].important).toBe(true)
  })

  it('trims task title on add', async () => {
    await useTasksStore.getState().hydrate(driver)

    await useTasksStore.getState().addTask({
      title: '  Trimmed task  ',
    })

    const state = useTasksStore.getState()
    expect(state.tasks[0].title).toBe('Trimmed task')
  })

  it('edits a task and persists it', async () => {
    await useTasksStore.getState().hydrate(driver)

    const id = await tasksRepo.createTask(driver, {
      title: 'Original',
      important: false,
      createdAt: new Date().toISOString(),
    })

    // Hydrate again to get the created task
    await useTasksStore.getState().hydrate(driver)

    // Edit it
    await useTasksStore.getState().editTask(id, {
      title: 'Updated',
      important: true,
    })

    // Check in-memory state
    let state = useTasksStore.getState()
    const task = state.tasks.find((t) => t.id === id)
    expect(task?.title).toBe('Updated')
    expect(task?.important).toBe(true)

    // Verify it persisted to the database
    const fromDb = await tasksRepo.getTask(driver, id)
    expect(fromDb?.title).toBe('Updated')
    expect(fromDb?.important).toBe(true)
  })

  it('toggles important flag', async () => {
    await useTasksStore.getState().hydrate(driver)

    const id = await tasksRepo.createTask(driver, {
      title: 'Task',
      important: false,
      createdAt: new Date().toISOString(),
    })

    await useTasksStore.getState().hydrate(driver)

    await useTasksStore.getState().toggleImportant(id)

    const state = useTasksStore.getState()
    const task = state.tasks.find((t) => t.id === id)
    expect(task?.important).toBe(true)

    // Verify in database
    const fromDb = await tasksRepo.getTask(driver, id)
    expect(fromDb?.important).toBe(true)
  })

  it('toggles urgent flag', async () => {
    await useTasksStore.getState().hydrate(driver)

    const id = await tasksRepo.createTask(driver, {
      title: 'Task',
      urgent: false,
      createdAt: new Date().toISOString(),
    })

    await useTasksStore.getState().hydrate(driver)

    await useTasksStore.getState().toggleUrgent(id)

    const state = useTasksStore.getState()
    const task = state.tasks.find((t) => t.id === id)
    expect(task?.urgent).toBe(true)

    // Verify in database
    const fromDb = await tasksRepo.getTask(driver, id)
    expect(fromDb?.urgent).toBe(true)
  })

  it('toggles done flag', async () => {
    await useTasksStore.getState().hydrate(driver)

    const id = await tasksRepo.createTask(driver, {
      title: 'Task',
      createdAt: new Date().toISOString(),
    })

    await useTasksStore.getState().hydrate(driver)

    await useTasksStore.getState().toggleDone(id)

    const state = useTasksStore.getState()
    const task = state.tasks.find((t) => t.id === id)
    expect(task?.done).toBe(true)

    // Verify in database
    const fromDb = await tasksRepo.getTask(driver, id)
    expect(fromDb?.done).toBe(true)
  })

  it('removes a task and persists the deletion', async () => {
    await useTasksStore.getState().hydrate(driver)

    const id = await tasksRepo.createTask(driver, {
      title: 'To be deleted',
      createdAt: new Date().toISOString(),
    })

    await useTasksStore.getState().hydrate(driver)

    expect(useTasksStore.getState().tasks).toHaveLength(1)

    // Remove it
    await useTasksStore.getState().removeTask(id)

    // Check in-memory state
    let state = useTasksStore.getState()
    expect(state.tasks).toHaveLength(0)

    // Verify it was deleted from the database
    const fromDb = await tasksRepo.getTask(driver, id)
    expect(fromDb).toBeNull()
  })

  it('sets groupBy without persisting', async () => {
    await useTasksStore.getState().hydrate(driver)

    expect(useTasksStore.getState().groupBy).toBe('matrix')

    useTasksStore.getState().setGroupBy('deadline')

    expect(useTasksStore.getState().groupBy).toBe('deadline')
  })

  it('sorts tasks on add', async () => {
    await useTasksStore.getState().hydrate(driver)

    const id1 = await tasksRepo.createTask(driver, {
      title: 'Due tomorrow',
      dueAt: '2026-08-05',
      createdAt: new Date().toISOString(),
    })

    const id2 = await tasksRepo.createTask(driver, {
      title: 'Due today',
      dueAt: '2026-08-04',
      createdAt: new Date().toISOString(),
    })

    await useTasksStore.getState().hydrate(driver)

    const state = useTasksStore.getState()
    // Should be sorted by dueAt
    expect(state.tasks[0].id).toBe(id2)
    expect(state.tasks[1].id).toBe(id1)
  })

  it('re-sorts tasks after edit', async () => {
    await useTasksStore.getState().hydrate(driver)

    const id1 = await tasksRepo.createTask(driver, {
      title: 'Task 1',
      createdAt: new Date().toISOString(),
    })

    const id2 = await tasksRepo.createTask(driver, {
      title: 'Task 2',
      createdAt: new Date().toISOString(),
    })

    await useTasksStore.getState().hydrate(driver)

    // Mark task 2 as done
    await useTasksStore.getState().editTask(id2, { done: true })

    // Now mark it back as incomplete
    await useTasksStore.getState().editTask(id2, { done: false })

    const state = useTasksStore.getState()
    // After re-sorting, both should be incomplete, ordered by id
    expect(state.tasks.map((t) => t.id)).toEqual([id1, id2])
  })

  it('performs a hydrate round-trip test', async () => {
    // Create tasks via the store
    await useTasksStore.getState().hydrate(driver)

    await useTasksStore.getState().addTask({
      title: 'Task A',
      important: true,
      urgent: false,
      dueAt: '2026-08-10',
      estimateMin: 120,
    })

    await useTasksStore.getState().addTask({
      title: 'Task B',
      important: false,
      urgent: true,
      dueAt: '2026-08-05',
      estimateMin: 60,
    })

    const beforeRehydrate = useTasksStore.getState().tasks

    // Clear the store
    useTasksStore.setState({ tasks: [] })

    // Re-hydrate from the database
    await useTasksStore.getState().hydrate(driver)

    const afterRehydrate = useTasksStore.getState().tasks

    // Verify the order and contents match
    expect(afterRehydrate).toHaveLength(beforeRehydrate.length)
    for (let i = 0; i < beforeRehydrate.length; i++) {
      const before = beforeRehydrate[i]
      const after = afterRehydrate[i]
      expect(after.title).toBe(before.title)
      expect(after.important).toBe(before.important)
      expect(after.urgent).toBe(before.urgent)
      expect(after.dueAt).toBe(before.dueAt)
      expect(after.estimateMin).toBe(before.estimateMin)
    }
  })
})
