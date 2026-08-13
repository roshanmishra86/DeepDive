import { create } from 'zustand'
import type { SqlDriver } from '../db/driver'
import type { Subtask, Task, TaskPriority } from '../db/types'
import * as tasksRepo from '../db/repos/tasks'
import * as subtasksRepo from '../db/repos/subtasks'
import {
  groupByDeadline,
  groupByMatrix,
  type DeadlineBucket,
  type Quadrant,
  type TodoFilters,
  type GroupSort,
  sortTasks,
  DEFAULT_TODO_FILTERS,
} from '../lib/todo'

type TaskEdit = Partial<Omit<Task, 'id' | 'createdAt' | 'archived'>>
type TaskDestination = { group: Quadrant | DeadlineBucket; beforeId: number | null }

interface TasksState {
  tasks: Task[]
  archivedTasks: Task[]
  groupBy: 'matrix' | 'deadline'
  filters: TodoFilters
  sortByGroup: Record<string, GroupSort>
  loading: boolean
  loadingArchived: boolean
  error: string | null
  errorArchived: string | null
  subtasksByTask: Record<number, Subtask[]>
  subtaskLoading: Record<number, boolean>
  subtaskError: Record<number, string | null>
  hydrate: (driver: SqlDriver | null) => Promise<void>
  hydrateActive: () => Promise<void>
  hydrateArchived: (driver?: SqlDriver | null) => Promise<void>
  addTask: (input: {
    title: string
    notes?: string
    important?: boolean
    urgent?: boolean
    priority?: TaskPriority
    dueAt?: string | null
    estimateMin?: number | null
  }) => Promise<number | null>
  editTask: (id: number, patch: TaskEdit) => Promise<void>
  toggleImportant: (id: number) => Promise<void>
  toggleUrgent: (id: number) => Promise<void>
  toggleDone: (id: number, nowIso?: string) => Promise<void>
  removeTask: (id: number) => Promise<void>
  archiveTask: (id: number, archivedAt: string) => Promise<boolean>
  unarchiveTask: (id: number) => Promise<boolean>
  moveTask: (id: number, destination: TaskDestination, now: Date) => Promise<boolean>
  saveTaskNotes: (id: number, notes: string) => Promise<boolean>
  loadSubtasks: (taskId: number) => Promise<void>
  createSubtask: (input: { taskId: number; title: string; estimateMin: number; createdAt?: string; dueAt?: string | null }) => Promise<number | null>
  updateSubtask: (id: number, taskId: number, patch: { title?: string; estimateMin?: number; dueAt?: string | null }) => Promise<boolean>
  setSubtaskDone: (id: number, taskId: number, done: boolean) => Promise<boolean>
  deleteSubtask: (id: number, taskId: number) => Promise<boolean>
  reorderSubtasks: (taskId: number, orderedIds: number[]) => Promise<boolean>
  getSubtaskAllocation: (subtaskId: number) => Promise<{ allocatedMin: number; blockCount: number }>
  setGroupBy: (g: 'matrix' | 'deadline') => void
  setFilters: (patch: Partial<TodoFilters>) => void
  resetFilters: () => void
  setGroupSort: (group: string, sort: GroupSort) => void
  setPriority: (id: number, priority: TaskPriority) => Promise<void>
}

let nextLocalId = -1
let nextLocalSubtaskId = -1
let persistenceDriver: SqlDriver | null = null
const subtaskRequests = new Map<number, Promise<void>>()

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function replaceTask(tasks: Task[], updated: Task): Task[] {
  return sortTasks(tasks.map((task) => (task.id === updated.id ? updated : task)))
}

export const useTasksStore = create<TasksState>()((set, get) => {
  const hydrateList = async (archived: boolean, driverOverride?: SqlDriver | null) => {
    if (driverOverride !== undefined) persistenceDriver = driverOverride
    const loadingKey = archived ? 'loadingArchived' : 'loading'
    const errorKey = archived ? 'errorArchived' : 'error'
    set({ [loadingKey]: true, [errorKey]: null } as Partial<TasksState>)
    if (!persistenceDriver) {
      set({ [loadingKey]: false } as Partial<TasksState>)
      return
    }
    try {
      const rows = await tasksRepo.listTasks(persistenceDriver, { archived })
      // Bulk-load subtasks for BOTH branches. Active tasks used to arrive with
      // no subtasks at all, leaving inline subtask rows and the right rail's
      // "≈Xh left" rollup silently incomplete until the per-task lazy
      // loadSubtasks fired. That lazy path stays as the archive/edge fallback.
      const subtasks = await subtasksRepo.listSubtasksForTasks(persistenceDriver, rows.map((task) => task.id))
      const byTask = new Map<number, Subtask[]>()
      for (const task of rows) byTask.set(task.id, [])
      for (const subtask of subtasks) byTask.get(subtask.taskId)?.push(subtask)
      if (archived) {
        set((state) => ({
          archivedTasks: rows,
          loadingArchived: false,
          subtasksByTask: {
            ...state.subtasksByTask,
            ...Object.fromEntries(byTask),
          },
        }))
      } else {
        set((state) => ({
          tasks: sortTasks(rows),
          loading: false,
          subtasksByTask: {
            ...state.subtasksByTask,
            ...Object.fromEntries(byTask),
          },
        }))
      }
    } catch (err) {
      set({ [loadingKey]: false, [errorKey]: messageFor(err, 'Could not load tasks') } as Partial<TasksState>)
    }
  }

  return {
    tasks: [],
    archivedTasks: [],
    groupBy: 'matrix',
    filters: DEFAULT_TODO_FILTERS,
    sortByGroup: {},
    loading: false,
    loadingArchived: false,
    error: null,
    errorArchived: null,
    subtasksByTask: {},
    subtaskLoading: {},
    subtaskError: {},

    hydrate: async (driver) => {
      persistenceDriver = driver
      await hydrateList(false)
    },
    hydrateActive: async () => hydrateList(false),
    hydrateArchived: async (driver) => hydrateList(true, driver),

    addTask: async (input) => {
      const localId = nextLocalId--
      const now = new Date().toISOString()
      const newTask: Task = {
        id: localId,
        title: input.title.trim(),
        notes: input.notes ?? '',
        important: input.important ?? false,
        urgent: input.urgent ?? false,
        priority: input.priority ?? 'medium',
        dueAt: input.dueAt ?? null,
        estimateMin: input.estimateMin ?? null,
        done: false,
        createdAt: now,
        archived: false,
        sort: get().tasks.length,
        completedAt: null,
        archivedAt: null,
      }
      const previous = get().tasks
      set({ tasks: sortTasks([...previous, newTask]) })
      if (!persistenceDriver) return localId
      try {
        const id = await tasksRepo.createTask(persistenceDriver, { ...input, title: newTask.title, createdAt: now })
        set((state) => ({ tasks: state.tasks.map((task) => task.id === localId ? { ...task, id } : task) }))
        return id
      } catch (err) {
        set({ tasks: previous, error: messageFor(err, 'Save failed') })
        return null
      }
    },

    editTask: async (id, patch) => {
      const previous = get().tasks
      const task = previous.find((item) => item.id === id)
      if (!task) return
      set({ tasks: replaceTask(previous, { ...task, ...patch }) })
      if (!persistenceDriver) return
      try {
        await tasksRepo.updateTask(persistenceDriver, id, patch)
      } catch (err) {
        set({ tasks: previous, error: messageFor(err, 'Save failed') })
      }
    },

    toggleImportant: async (id) => {
      const task = get().tasks.find((item) => item.id === id)
      if (task) await get().editTask(id, { important: !task.important })
    },
    toggleUrgent: async (id) => {
      const task = get().tasks.find((item) => item.id === id)
      if (task) await get().editTask(id, { urgent: !task.urgent })
    },
    toggleDone: async (id, nowIso = new Date().toISOString()) => {
      const previous = get().tasks
      const task = previous.find((item) => item.id === id)
      if (!task) return
      const done = !task.done
      const updated = { ...task, done, completedAt: done ? nowIso : null }
      set({ tasks: replaceTask(previous, updated) })
      if (!persistenceDriver) return
      try {
        await tasksRepo.setTaskDone(persistenceDriver, id, done, nowIso)
      } catch (err) {
        set({ tasks: previous, error: messageFor(err, 'Could not update completion') })
      }
    },

    removeTask: async (id) => {
      const previous = get().tasks
      set({ tasks: previous.filter((task) => task.id !== id) })
      if (!persistenceDriver) return
      try {
        await tasksRepo.deleteTask(persistenceDriver, id)
      } catch (err) {
        set({ tasks: previous, error: messageFor(err, 'Delete failed') })
      }
    },

    archiveTask: async (id, archivedAt) => {
      const task = get().tasks.find((item) => item.id === id)
      if (!task || !task.done) return false
      if (!persistenceDriver) {
        const archived = { ...task, archived: true, archivedAt }
        set((state) => ({ tasks: state.tasks.filter((item) => item.id !== id), archivedTasks: [...state.archivedTasks, archived] }))
        return true
      }
      try {
        const changed = await tasksRepo.archiveTask(persistenceDriver, id, archivedAt)
        if (!changed) return false
        set((state) => ({
          tasks: state.tasks.filter((item) => item.id !== id),
          archivedTasks: [...state.archivedTasks, { ...task, archived: true, archivedAt }],
        }))
        return true
      } catch (err) {
        set({ error: messageFor(err, 'Could not archive task') })
        return false
      }
    },

    unarchiveTask: async (id) => {
      const task = get().archivedTasks.find((item) => item.id === id)
      if (!task) return false
      if (persistenceDriver) {
        try {
          if (!await tasksRepo.unarchiveTask(persistenceDriver, id)) return false
        } catch (err) {
          set({ errorArchived: messageFor(err, 'Could not restore task') })
          return false
        }
      }
      const restored = { ...task, archived: false, archivedAt: null, sort: get().tasks.length }
      set((state) => ({ archivedTasks: state.archivedTasks.filter((item) => item.id !== id), tasks: sortTasks([...state.tasks, restored]) }))
      return true
    },

    moveTask: async (id, destination, now) => {
      const state = get()
      const task = state.tasks.find((item) => item.id === id)
      if (!task) return false
      if (state.groupBy === 'deadline') {
        const currentGroup = groupByDeadline(state.tasks, now).find((group) => group.tasks.some((item) => item.id === id))?.bucket
        if (currentGroup && currentGroup !== destination.group) return false
      }
      const groups = state.groupBy === 'matrix'
        ? groupByMatrix(state.tasks).map((group) => ({ key: group.quadrant, ids: group.tasks.map((item) => item.id) }))
        : groupByDeadline(state.tasks, now).map((group) => ({ key: group.bucket, ids: group.tasks.map((item) => item.id) }))
      const destinationGroup = groups.find((group) => group.key === destination.group)
      if (!destinationGroup) return false
      const without = groups.map((group) => ({ ...group, ids: group.ids.filter((itemId) => itemId !== id) }))
      const target = without.find((group) => group.key === destination.group)!
      const insertAt = destination.beforeId === null ? target.ids.length : Math.max(0, target.ids.indexOf(destination.beforeId))
      target.ids.splice(insertAt, 0, id)
      const orderedIds = without.flatMap((group) => group.ids)
      const flagPatch = state.groupBy === 'matrix' && destination.group !== (groups.find((group) => group.ids.includes(id))?.key)
        ? { id, important: destination.group === 'do' || destination.group === 'plan', urgent: destination.group === 'do' || destination.group === 'delegate' }
        : undefined
      const previous = state.tasks
      const updated = previous.map((item) => {
        const index = orderedIds.indexOf(item.id)
        if (item.id !== id || !flagPatch) return { ...item, sort: index }
        return { ...item, sort: index, important: flagPatch.important, urgent: flagPatch.urgent }
      })
      set({ tasks: sortTasks(updated) })
      if (!persistenceDriver) return true
      try {
        await tasksRepo.reorderTasksAtomic(persistenceDriver, orderedIds, flagPatch)
        return true
      } catch (err) {
        set({ tasks: previous, error: messageFor(err, 'Could not reorder tasks') })
        return false
      }
    },

    saveTaskNotes: async (id, notes) => {
      const state = get()
      const active = state.tasks.find((task) => task.id === id)
      const archived = state.archivedTasks.find((task) => task.id === id)
      const task = active ?? archived
      if (!task) return false
      const collection = active ? 'tasks' : 'archivedTasks'
      set({ [collection]: (active ? state.tasks : state.archivedTasks).map((item) => item.id === id ? { ...item, notes } : item) } as Partial<TasksState>)
      if (!persistenceDriver) return true
      try {
        await tasksRepo.updateTask(persistenceDriver, id, { notes })
        return true
      } catch (err) {
        set({ [collection]: active ? state.tasks : state.archivedTasks, error: messageFor(err, 'Could not save notes') } as Partial<TasksState>)
        return false
      }
    },

    loadSubtasks: async (taskId) => {
      const existing = subtaskRequests.get(taskId)
      if (existing) return existing
      const request = (async () => {
        set((state) => ({ subtaskLoading: { ...state.subtaskLoading, [taskId]: true }, subtaskError: { ...state.subtaskError, [taskId]: null } }))
        if (!persistenceDriver) {
          set((state) => ({ subtaskLoading: { ...state.subtaskLoading, [taskId]: false } }))
          return
        }
        try {
          const rows = await subtasksRepo.listSubtasks(persistenceDriver, taskId)
          set((state) => ({ subtasksByTask: { ...state.subtasksByTask, [taskId]: rows }, subtaskLoading: { ...state.subtaskLoading, [taskId]: false } }))
        } catch (err) {
          set((state) => ({ subtaskLoading: { ...state.subtaskLoading, [taskId]: false }, subtaskError: { ...state.subtaskError, [taskId]: messageFor(err, 'Could not load subtasks') } }))
        }
      })()
      subtaskRequests.set(taskId, request)
      try { await request } finally { subtaskRequests.delete(taskId) }
    },

    createSubtask: async (input) => {
      const task = get().tasks.find((item) => item.id === input.taskId) ?? get().archivedTasks.find((item) => item.id === input.taskId)
      if (!task) return null
      try {
        const id = persistenceDriver
          ? await subtasksRepo.createSubtask(persistenceDriver, { ...input, createdAt: input.createdAt ?? new Date().toISOString() })
          : nextLocalSubtaskId--
        const created: Subtask = { id, taskId: input.taskId, title: input.title.trim(), estimateMin: input.estimateMin, done: false, sort: (get().subtasksByTask[input.taskId] ?? []).length, createdAt: input.createdAt ?? new Date().toISOString(), dueAt: input.dueAt ?? null }
        set((state) => ({ subtasksByTask: { ...state.subtasksByTask, [input.taskId]: [...(state.subtasksByTask[input.taskId] ?? []), created] } }))
        return id
      } catch (err) {
        set((state) => ({ subtaskError: { ...state.subtaskError, [input.taskId]: messageFor(err, 'Could not create subtask') } }))
        return null
      }
    },

    updateSubtask: async (id, taskId, patch) => {
      const previous = get().subtasksByTask[taskId] ?? []
      set({ subtasksByTask: { ...get().subtasksByTask, [taskId]: previous.map((item) => item.id === id ? { ...item, ...patch } : item) } })
      if (!persistenceDriver) return true
      try { await subtasksRepo.updateSubtask(persistenceDriver, id, patch); return true }
      catch (err) { set((state) => ({ subtasksByTask: { ...state.subtasksByTask, [taskId]: previous }, subtaskError: { ...state.subtaskError, [taskId]: messageFor(err, 'Could not update subtask') } })); return false }
    },
    setSubtaskDone: async (id, taskId, done) => {
      const previous = get().subtasksByTask[taskId] ?? []
      set((state) => ({ subtasksByTask: { ...state.subtasksByTask, [taskId]: previous.map((item) => item.id === id ? { ...item, done } : item) } }))
      if (!persistenceDriver) return true
      try { await subtasksRepo.setSubtaskDone(persistenceDriver, id, done); return true }
      catch (err) { set((state) => ({ subtasksByTask: { ...state.subtasksByTask, [taskId]: previous }, subtaskError: { ...state.subtaskError, [taskId]: messageFor(err, 'Could not update subtask') } })); return false }
    },
    deleteSubtask: async (id, taskId) => {
      const previous = get().subtasksByTask[taskId] ?? []
      set((state) => ({ subtasksByTask: { ...state.subtasksByTask, [taskId]: previous.filter((item) => item.id !== id) } }))
      if (!persistenceDriver) return true
      try { await subtasksRepo.deleteSubtask(persistenceDriver, id); return true }
      catch (err) { set((state) => ({ subtasksByTask: { ...state.subtasksByTask, [taskId]: previous }, subtaskError: { ...state.subtaskError, [taskId]: messageFor(err, 'Could not delete subtask') } })); return false }
    },
    reorderSubtasks: async (taskId, orderedIds) => {
      const previous = get().subtasksByTask[taskId] ?? []
      const byId = new Map(previous.map((item) => [item.id, item]))
      const reordered = orderedIds.map((id) => byId.get(id)).filter((item): item is Subtask => item !== undefined).map((item, index) => ({ ...item, sort: index }))
      set((state) => ({ subtasksByTask: { ...state.subtasksByTask, [taskId]: reordered } }))
      if (!persistenceDriver) return true
      try { await subtasksRepo.reorderSubtasks(persistenceDriver, taskId, orderedIds); return true }
      catch (err) { set((state) => ({ subtasksByTask: { ...state.subtasksByTask, [taskId]: previous }, subtaskError: { ...state.subtaskError, [taskId]: messageFor(err, 'Could not reorder subtasks') } })); return false }
    },
    getSubtaskAllocation: async (subtaskId) => {
      if (!persistenceDriver) return { allocatedMin: 0, blockCount: 0 }
      try { return await subtasksRepo.getSubtaskAllocation(persistenceDriver, subtaskId) }
      catch (err) { set({ error: messageFor(err, 'Could not load allocation') }); return { allocatedMin: 0, blockCount: 0 } }
    },
    setGroupBy: (groupBy) => set({ groupBy }),
    setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
    resetFilters: () => set({ filters: DEFAULT_TODO_FILTERS }),
    setGroupSort: (group, sort) => set((state) => ({ sortByGroup: { ...state.sortByGroup, [group]: sort } })),
    setPriority: async (id, priority) => {
      await get().editTask(id, { priority })
    },
  }
})
