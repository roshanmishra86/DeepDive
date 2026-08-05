import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { Task } from '../db/types'
import * as tasksRepo from '../db/repos/tasks'
import { sortTasks } from '../lib/week'

/**
 * Tasks store. Hydrates from the database via `task` table.
 * Changes persist to the database while updating state immediately for responsive UI.
 * In-memory fallback when driver is null allows `vite dev` to work without Tauri.
 */
interface TasksState {
  tasks: Task[]
  groupBy: 'matrix' | 'deadline'
  loading: boolean
  error: string | null
  hydrate: (driver: SqlDriver | null) => Promise<void>
  addTask: (input: {
    title: string
    notes?: string
    important?: boolean
    urgent?: boolean
    dueAt?: string | null
    estimateMin?: number | null
  }) => Promise<number | null>
  editTask: (id: number, patch: Partial<Omit<Task, 'id' | 'createdAt' | 'archived'>>) => Promise<void>
  toggleImportant: (id: number) => Promise<void>
  toggleUrgent: (id: number) => Promise<void>
  toggleDone: (id: number) => Promise<void>
  removeTask: (id: number) => Promise<void>
  setGroupBy: (g: 'matrix' | 'deadline') => void
}

// Optimistic local ids for rows not yet persisted. Negative and
// monotonically decreasing, so they can never collide with a real SQLite
// AUTOINCREMENT id (always positive).
let nextLocalId = -1
let persistenceDriver: SqlDriver | null = null

export const useTasksStore = create<TasksState>()((set, get) => ({
  tasks: [],
  groupBy: 'matrix',
  loading: false,
  error: null,

  hydrate: async (driver) => {
    persistenceDriver = driver
    set({ loading: true, error: null })

    if (!driver) {
      // In-memory mode: keep empty state for vite dev
      set({ loading: false })
      return
    }

    try {
      const tasks = await tasksRepo.listTasks(driver, { archived: false })
      set({ tasks: sortTasks(tasks), loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ error: message, loading: false })
      console.error('Failed to hydrate tasks store:', err)
    }
  },

  addTask: async (input) => {
    // Optimistically add to in-memory state
    const localId = nextLocalId--
    const now = new Date().toISOString()

    const newTask: Task = {
      id: localId,
      title: input.title.trim(),
      notes: input.notes ?? '',
      important: input.important ?? false,
      urgent: input.urgent ?? false,
      dueAt: input.dueAt ?? null,
      estimateMin: input.estimateMin ?? null,
      done: false,
      createdAt: now,
      archived: false,
    }

    const tasks = get().tasks
    const withNew = sortTasks([...tasks, newTask])
    set({ tasks: withNew })

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        const realId = await tasksRepo.createTask(driver, {
          title: newTask.title,
          notes: newTask.notes,
          important: newTask.important,
          urgent: newTask.urgent,
          dueAt: newTask.dueAt,
          estimateMin: newTask.estimateMin,
          createdAt: now,
        })
        // Update state with real id
        set((_s) => ({
          tasks: get().tasks.map((t) => (t.id === localId ? { ...t, id: realId } : t)),
        }))
        return realId
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Save failed' }))
        console.error('Failed to persist new task:', err)
        // Revert optimistic update
        set({ tasks })
        return null
      }
    }

    return localId
  },

  editTask: async (id, patch) => {
    const state = get()
    const tasks = state.tasks
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    // Apply patch
    const updated = { ...task, ...patch }
    const newTasks = sortTasks(tasks.map((t) => (t.id === id ? updated : t)))
    set({ tasks: newTasks })

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        await tasksRepo.updateTask(driver, id, patch)
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Save failed' }))
        console.error('Failed to persist task edit:', err)
        // Revert optimistic update
        set({ tasks })
      }
    }
  },

  toggleImportant: async (id) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return

    await get().editTask(id, { important: !task.important })
  },

  toggleUrgent: async (id) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return

    await get().editTask(id, { urgent: !task.urgent })
  },

  toggleDone: async (id) => {
    const state = get()
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return

    await get().editTask(id, { done: !task.done })
  },

  removeTask: async (id) => {
    const state = get()
    const tasks = state.tasks.filter((t) => t.id !== id)
    set({ tasks })

    // Persist to database if available
    if (persistenceDriver) {
      try {
        const driver = persistenceDriver
        await tasksRepo.deleteTask(driver, id)
      } catch (err) {
        set((_s) => ({ error: err instanceof Error ? err.message : 'Delete failed' }))
        console.error('Failed to persist task deletion:', err)
        // Revert optimistic update
        set({ tasks: state.tasks })
      }
    }
  },

  setGroupBy: (g) => {
    set({ groupBy: g })
  },
}))
