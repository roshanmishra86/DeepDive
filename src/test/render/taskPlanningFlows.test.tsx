// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createTestDb } from '../nodeDriver'
import type { DayBlock, Subtask, Task } from '../../db/types'
import * as tasksRepo from '../../db/repos/tasks'
import { useArchiveStore } from '../../stores/archive'
import { useAppStore } from '../../stores/app'
import { useLibraryStore } from '../../stores/library'
import { usePlayerStore } from '../../stores/player'
import { useTasksStore } from '../../stores/tasks'
import { useTodayStore } from '../../stores/today'
import { ArchiveView } from '../../components/views/ArchiveView'
import { MusicBar } from '../../components/chrome/MusicBar'
import { PlanPanel } from '../../components/plan/PlanPanel'
import { TodayView } from '../../components/views/TodayView'
import { TaskRow } from '../../components/week/TaskRow'
import { SubtaskList } from '../../components/week/SubtaskList'
import { DEFAULT_ACCENT } from '../../lib/accents'

const dbMock = vi.hoisted(() => ({ driver: null as ReturnType<typeof createTestDb>['driver'] | null }))

vi.mock('../../db/index', () => ({ openDatabase: async () => dbMock.driver }))

const makeTask = (id: number, patch: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  notes: '',
  important: true,
  urgent: false,
  dueAt: null,
  estimateMin: 60,
  done: false,
  createdAt: '2026-08-10T08:00:00Z',
  archived: false,
  sort: id,
  completedAt: null,
  archivedAt: null,
  ...patch,
})

const makeBlock = (id: number, title: string, startMin: number): DayBlock => ({
  id,
  day: '2026-08-10',
  taskId: null,
  subtaskId: null,
  title,
  kind: 'deep',
  startMin,
  durationMin: 60,
  pomodoros: 2,
  completed: false,
  sort: id,
  note: '',
  repeat: 'once',
  trackId: null,
  quiet: false,
})

function resetStores() {
  useArchiveStore.setState({
    year: new Date().getFullYear(), month0: new Date().getMonth(), statuses: {}, selectedDay: null,
    record: null, headline: null, trend: [], hasRecords: false, hasDayRecords: false, loading: false, error: null,
  })
  useAppStore.setState({ view: 'week', accent: DEFAULT_ACCENT, timerStyle: 'ring', repeatStyle: 'chip', settingsOpen: false, planTarget: null, sessionOpen: false })
  useTasksStore.setState({
    tasks: [], archivedTasks: [], groupBy: 'matrix', loading: false, loadingArchived: false, error: null,
    errorArchived: null, subtasksByTask: {}, subtaskLoading: {}, subtaskError: {},
  })
  useTodayStore.setState({ day: null, blocks: [], loading: false, error: null, shutdownMin: null, shutdownIsDefault: true })
  useLibraryStore.setState({ tracks: [], loading: false, error: null, fadeInSec: 8, silenceDuringRest: true })
  usePlayerStore.setState({ trackId: null, trackName: null, trackMeta: null, playing: false, volume: 70, positionSec: 0, durationSec: 0, missing: false, restPaused: false, queue: [], queueIndex: -1, repeatMode: 'off' })
}

describe('task planning release flows', () => {
  beforeEach(async () => {
    resetStores()
    dbMock.driver = null
    await useTasksStore.getState().hydrate(null)
    await useTodayStore.getState().hydrate(null, '2026-08-10')
  })

  it('renders archived tasks even when no day record exists', async () => {
    const { driver } = createTestDb()
    const id = await tasksRepo.createTask(driver, { title: 'Archived without a day', createdAt: '2026-08-10T08:00:00Z' })
    await tasksRepo.setTaskDone(driver, id, true, '2026-08-10T09:00:00Z')
    await tasksRepo.archiveTask(driver, id, '2026-08-10T10:00:00Z')
    dbMock.driver = driver

    render(<ArchiveView />)

    expect(await screen.findByRole('button', { name: 'Archived without a day' })).toBeDefined()
    expect(screen.getByText('No recorded days yet')).toBeDefined()
  })

  it('does not overwrite an in-progress plan draft after task notes change in the store', async () => {
    const task = makeTask(1, { title: 'Plan task', notes: 'saved value' })
    useTasksStore.setState({ tasks: [task] })
    useAppStore.setState({ planTarget: { kind: 'task', id: task.id } })
    render(<PlanPanel />)

    const textarea = screen.getByRole('textbox', { name: 'Plan notes for Plan task' }) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'new local keystrokes' } })
    await act(async () => {
      useTasksStore.setState({ tasks: [{ ...task, notes: 'older saved write' }] })
    })

    expect(textarea.value).toBe('new local keystrokes')
    expect((screen.getByRole('button', { name: 'Import Markdown' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Export Markdown' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('exposes week ordering buttons as the keyboard-accessible alternative to drag', () => {
    const task = makeTask(1, { title: 'Keyboard task' })
    const up = vi.fn()
    const down = vi.fn()
    render(<TaskRow task={task} now={new Date('2026-08-10T08:00:00')} onEdit={() => {}} onMoveUp={up} onMoveDown={down} canMoveUp canMoveDown />)

    fireEvent.click(screen.getByRole('button', { name: 'Move Keyboard task up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move Keyboard task down' }))
    expect(up).toHaveBeenCalledOnce()
    expect(down).toHaveBeenCalledOnce()
  })

  it('previews and cancels a Today reorder without persisting until drop', async () => {
    useTodayStore.setState({ day: '2026-08-10', blocks: [makeBlock(1, 'First', 540), makeBlock(2, 'Second', 660)] })
    render(<TodayView />)

    const firstHandle = screen.getByRole('button', { name: 'Drag First' })
    const secondHandle = screen.getByRole('button', { name: 'Drag Second' })
    fireEvent.dragStart(firstHandle)
    fireEvent.dragOver(secondHandle.closest('.timeline-block')!)

    expect(screen.getByText('Previewing reordered schedule — drop to apply')).toBeDefined()
    expect(Array.from(document.querySelectorAll('.timeline-block-title')).map((node) => node.textContent)).toEqual(['Second', 'First'])
    fireEvent.dragEnd(firstHandle)
    expect(screen.queryByText('Previewing reordered schedule — drop to apply')).toBeNull()
    expect(useTodayStore.getState().blocks.map((block) => block.id)).toEqual([1, 2])
  })

  it('confirms a subtask duration before creating a Today block with both links', async () => {
    const { driver } = createTestDb()
    await useTodayStore.getState().hydrate(driver, '2026-08-10')
    await useTasksStore.getState().hydrate(driver)
    const taskId = await useTasksStore.getState().addTask({ title: 'Parent', important: true })
    const subtaskId = await useTasksStore.getState().createSubtask({ taskId: taskId!, title: 'Research', estimateMin: 30 })
    const task = useTasksStore.getState().tasks.find((item) => item.id === taskId)!
    const subtask = useTasksStore.getState().subtasksByTask[task.id][0] as Subtask
    expect(subtask.id).toBe(subtaskId)

    render(<SubtaskList task={task} now={new Date('2026-08-10T08:00:00')} />)
    fireEvent.click(screen.getByRole('button', { name: /Subtasks/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add Research to today' }))
    expect(await screen.findByRole('dialog', { name: 'Schedule Research' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Add to today' }))

    await vi.waitFor(() => {
      expect(useTodayStore.getState().blocks).toHaveLength(1)
      expect(useAppStore.getState().view).toBe('today')
    })
    expect(useTodayStore.getState().blocks[0]).toMatchObject({ taskId, subtaskId })
  })

  it('uses accessible repeat labels for every repeat mode', () => {
    render(<MusicBar />)
    expect(screen.getByRole('button', { name: 'Repeat off' })).toBeDefined()
    act(() => usePlayerStore.setState({ repeatMode: 'queue' }))
    expect(screen.getByRole('button', { name: 'Repeat queue' })).toBeDefined()
    act(() => usePlayerStore.setState({ repeatMode: 'one' }))
    expect(screen.getByRole('button', { name: 'Repeat one' })).toBeDefined()
  })
})
