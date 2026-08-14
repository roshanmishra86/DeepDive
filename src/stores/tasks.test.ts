import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import * as tasksRepo from '../db/repos/tasks'
import * as subtasksRepo from '../db/repos/subtasks'
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
      subtasksByTask: {},
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

  it('bulk-loads subtasks for ACTIVE tasks during hydrate, without loadSubtasks', async () => {
    const taskId = await tasksRepo.createTask(driver, {
      title: 'Task with subtasks',
      createdAt: new Date().toISOString(),
    })
    await subtasksRepo.createSubtask(driver, { taskId, title: 'First', estimateMin: 30, createdAt: new Date().toISOString() })
    await subtasksRepo.createSubtask(driver, { taskId, title: 'Second', estimateMin: 45, createdAt: new Date().toISOString() })

    await useTasksStore.getState().hydrate(driver)

    // Regression guard: active tasks used to hydrate with no subtasks until a
    // per-task loadSubtasks fired. Nothing calls loadSubtasks here.
    expect(useTasksStore.getState().subtasksByTask[taskId]).toHaveLength(2)
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

  it('addTask returns the real id when persisted, and a negative optimistic id under a null driver', async () => {
    await useTasksStore.getState().hydrate(driver)

    const id = await useTasksStore.getState().addTask({ title: 'Persisted task' })
    expect(id).not.toBeNull()
    expect(id!).toBeGreaterThan(0)

    useTasksStore.setState({ tasks: [], groupBy: 'matrix', loading: false, error: null })
    await useTasksStore.getState().hydrate(null)
    const localId = await useTasksStore.getState().addTask({ title: 'Local only task' })
    expect(localId).not.toBeNull()
    expect(localId!).toBeLessThan(0)
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

  it('moveTask buckets deadline groups off the caller-supplied now, not the wall clock', async () => {
    await useTasksStore.getState().hydrate(driver)
    useTasksStore.getState().setGroupBy('deadline')

    // Due far in the future so any accidental use of the real wall clock
    // (today, per this environment) would bucket it as 'later' instead of
    // 'soon' — making a bug that reads `new Date()` internally observable.
    const id = await tasksRepo.createTask(driver, {
      title: 'Future task',
      dueAt: '2030-06-05T10:00:00.000Z',
      createdAt: new Date().toISOString(),
    })
    await useTasksStore.getState().hydrate(driver)

    // 34 hours before the due date: within the 48h "soon" window relative to
    // this `now`, but nowhere near "soon" relative to the real wall clock.
    const now = new Date('2030-06-04T00:00:00.000Z')

    const ok = await useTasksStore.getState().moveTask(id, { group: 'soon', beforeId: null }, now)
    expect(ok).toBe(true)
  })

  it('moveTask leaves order untouched when a row is dropped on itself', async () => {
    const now = new Date()
    // One quadrant ('do'), three rows, so a self-drop that fell through to
    // the top-insert would be visible as a reordering.
    for (const title of ['First', 'Second', 'Third']) {
      await tasksRepo.createTask(driver, {
        title,
        important: true,
        urgent: true,
        createdAt: now.toISOString(),
      })
    }
    await useTasksStore.getState().hydrate(driver)
    const before = useTasksStore.getState().tasks.map((task) => task.title)
    const third = useTasksStore.getState().tasks.find((task) => task.title === 'Third')!

    // Exactly what TodoView's drop handler passes when a drag ends on the
    // row it started from: the row's own id as beforeId.
    const ok = await useTasksStore.getState().moveTask(third.id, { group: 'do', beforeId: third.id }, now)

    expect(ok).toBe(true)
    expect(useTasksStore.getState().tasks.map((task) => task.title)).toEqual(before)
    await useTasksStore.getState().hydrate(driver)
    expect(useTasksStore.getState().tasks.map((task) => task.title)).toEqual(before)
  })

  it('moveTask appends, not prepends, when beforeId is no longer in the group', async () => {
    const now = new Date()
    for (const title of ['First', 'Second']) {
      await tasksRepo.createTask(driver, { title, important: true, urgent: true, createdAt: now.toISOString() })
    }
    await useTasksStore.getState().hydrate(driver)
    const first = useTasksStore.getState().tasks.find((task) => task.title === 'First')!

    // 9999 is not in the group: a stale drop target.
    const ok = await useTasksStore.getState().moveTask(first.id, { group: 'do', beforeId: 9999 }, now)

    expect(ok).toBe(true)
    expect(useTasksStore.getState().tasks.map((task) => task.title)).toEqual(['Second', 'First'])
  })

  it('addTask seeds priority from the Eisenhower flags when none is given', async () => {
    await useTasksStore.getState().hydrate(driver)

    const urgentImportant = await useTasksStore.getState().addTask({ title: 'Do now', important: true, urgent: true })
    const importantOnly = await useTasksStore.getState().addTask({ title: 'Plan it', important: true, urgent: false })
    const neither = await useTasksStore.getState().addTask({ title: 'Someday', important: false, urgent: false })
    const explicit = await useTasksStore.getState().addTask({ title: 'Explicit', important: true, urgent: true, priority: 'low' })

    // Persisted, not just in memory — createTask defaults priority itself,
    // so the derived value has to reach the repo call.
    await useTasksStore.getState().hydrate(driver)
    const priorityOf = (id: number | null) =>
      useTasksStore.getState().tasks.find((task) => task.id === id)?.priority

    expect(priorityOf(urgentImportant)).toBe('high')
    expect(priorityOf(importantOnly)).toBe('medium')
    expect(priorityOf(neither)).toBe('low')
    // An explicit priority always wins over the derived one.
    expect(priorityOf(explicit)).toBe('low')
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
    // New tasks use dense manual order, so insertion order is stable until a
    // reorder action explicitly changes it.
    expect(state.tasks[0].id).toBe(id1)
    expect(state.tasks[1].id).toBe(id2)
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
