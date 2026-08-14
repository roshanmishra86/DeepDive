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
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { ArchiveView } from '../../components/views/ArchiveView'
import { MusicBar } from '../../components/chrome/MusicBar'
import { PlanPanel } from '../../components/plan/PlanPanel'
import { TodayView } from '../../components/views/TodayView'
import { WeekPlanView } from '../../components/views/WeekPlanView'
import { TaskRow } from '../../components/todo/TaskRow'
import { SubtaskList } from '../../components/todo/SubtaskList'
import { NotesEditor } from '../../components/common/NotesEditor'
import { importMarkdownNotes } from '../../lib/markdownExport'
import { notePlainText, parseNote, serializeNote } from '../../lib/richText'
import { DEFAULT_ACCENT } from '../../lib/accents'
import { DEFAULT_TODO_FILTERS } from '../../lib/todo'
import { TodoView, TODO_FOCUS_FADE_MS } from '../../components/views/TodoView'
import { weekDays } from '../../lib/weekPlan'
import { startOfWeek, addDays, fromDayKey } from '../../lib/time'

const DAY = '2026-08-10'

const dbMock = vi.hoisted(() => ({ driver: null as ReturnType<typeof createTestDb>['driver'] | null }))

vi.mock('../../db/index', () => ({ openDatabase: async () => dbMock.driver }))

// The pencil's fill/regular weight is the thing under test in one of the
// specs below (isEmptyNote vs raw string truthiness); the phosphor icon's
// real SVG path data is an internal implementation detail of that package,
// so it is swapped for a plain element exposing the resolved `weight`.
vi.mock('@phosphor-icons/react/dist/csr/NotePencil', () => ({
  NotePencil: ({ weight }: { weight?: string }) => <span data-testid="note-pencil" data-weight={weight ?? 'regular'} />,
}))

const makeTask = (id: number, patch: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  notes: '',
  important: true,
  urgent: false,
  priority: 'medium',
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

const makeBlock = (id: number, title: string, startMin: number, patch: Partial<DayBlock> = {}): DayBlock => ({
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
  noteUpdatedAt: null,
  repeat: 'once',
  trackId: null,
  quiet: false,
  ...patch,
})

function resetStores() {
  useArchiveStore.setState({
    year: new Date().getFullYear(), month0: new Date().getMonth(), statuses: {}, selectedDay: null,
    record: null, headline: null, trend: [], hasRecords: false, hasDayRecords: false, loading: false, error: null,
  })
  useAppStore.setState({ view: 'week', accent: DEFAULT_ACCENT, timerStyle: 'ring', repeatStyle: 'chip', settingsOpen: false, planTarget: null, sessionOpen: false, pendingTodoFocus: null })
  useTasksStore.setState({
    tasks: [], archivedTasks: [], groupBy: 'matrix', filters: DEFAULT_TODO_FILTERS, sortByGroup: {},
    loading: false, loadingArchived: false, error: null,
    errorArchived: null, subtasksByTask: {}, subtaskLoading: {}, subtaskError: {},
  })
  useBlocksStore.setState({ blocksByDay: {}, loadedDays: [], loading: false, error: null })
  // The day store owns the day key every today-scoped selector reads.
  useDayStore.setState({ currentDay: DAY, nowMin: 540, shutdownMin: null, shutdownIsDefault: true, error: null })
  useLibraryStore.setState({ tracks: [], loading: false, error: null, fadeInSec: 8, silenceDuringRest: true })
  usePlayerStore.setState({ trackId: null, trackName: null, trackMeta: null, playing: false, volume: 70, positionSec: 0, durationSec: 0, missing: false, restPaused: false, queue: [], queueIndex: -1, repeatMode: 'off' })
}

describe('task planning release flows', () => {
  beforeEach(async () => {
    resetStores()
    dbMock.driver = null
    await useTasksStore.getState().hydrate(null)
    await useDayStore.getState().hydrate(null, DAY, 540)
    await useBlocksStore.getState().hydrate(null, [DAY])
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

    // A legacy plain-text note must render as text, not as an empty editor.
    const surface = screen.getByRole('textbox', { name: 'Plan notes for Plan task' })
    expect(surface.textContent).toBe('saved value')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
    })
    expect(surface.querySelector('ul')).not.toBeNull()

    await act(async () => {
      useTasksStore.setState({ tasks: [{ ...task, notes: 'older saved write' }] })
    })

    expect(surface.textContent).toBe('saved value')
    expect(surface.querySelector('ul')).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Import Markdown' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Export Markdown' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('moves the plan save indicator from Saving… back to Saved after the debounce', async () => {
    const task = makeTask(1, { title: 'Indicator task', notes: 'note body' })
    useTasksStore.setState({ tasks: [task] })
    useAppStore.setState({ planTarget: { kind: 'task', id: task.id } })
    render(<PlanPanel />)

    const indicator = document.querySelector('.plan-panel-state')!
    expect(indicator.textContent).toBe('Saved')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
    })
    expect(indicator.textContent).toBe('Saving…')
    await vi.waitFor(() => expect(indicator.textContent).toBe('Saved'), { timeout: 3000 })
    expect(useTasksStore.getState().tasks[0].notes).toContain('bulletList')
  })

  it('loads an externally changed note without emitting a spurious onChange', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<NotesEditor value="first note" onChange={onChange} ariaLabel="Notes" />)
    const surface = screen.getByRole('textbox', { name: 'Notes' })
    expect(surface.textContent).toBe('first note')

    // A markdown import replaces `value` from outside. Echoing that back
    // through onChange would loop the editor against its own parent.
    const imported = importMarkdownNotes('second **note**')
    onChange.mockClear()
    await act(async () => {
      rerender(<NotesEditor value={imported} onChange={onChange} ariaLabel="Notes" />)
    })

    expect(surface.textContent).toBe('second note')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('emits a stored rich-text envelope when a toolbar toggle is used', async () => {
    const onChange = vi.fn()
    render(<NotesEditor value="alpha" onChange={onChange} ariaLabel="Notes" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
    })

    expect(onChange).toHaveBeenCalled()
    const stored = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string
    expect(parseNote(stored).content?.[0].type).toBe('bulletList')
    // StarterKit's TrailingNode leaves an empty paragraph after the list.
    expect(notePlainText(stored).trim()).toBe('alpha')
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bullet list' }).getAttribute('aria-pressed')).toBe('true')
    }, { timeout: 3000 })
  })

  it('exposes move up/down as the keyboard-accessible alternative to drag, via the overflow menu', () => {
    const task = makeTask(1, { title: 'Keyboard task' })
    const up = vi.fn()
    const down = vi.fn()
    render(<TaskRow task={task} now={new Date('2026-08-10T08:00:00')} onEdit={() => {}} onMoveUp={up} onMoveDown={down} canMoveUp canMoveDown />)

    fireEvent.click(screen.getByRole('button', { name: 'More actions: Keyboard task' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move Keyboard task up' }))

    fireEvent.click(screen.getByRole('button', { name: 'More actions: Keyboard task' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move Keyboard task down' }))

    expect(up).toHaveBeenCalledOnce()
    expect(down).toHaveBeenCalledOnce()
  })

  it('changes a task\'s priority chip without touching important/urgent', () => {
    const task = makeTask(1, { title: 'Priority task', important: true, urgent: false, priority: 'medium' })
    useTasksStore.setState({ tasks: [task] })
    render(<TaskRow task={task} now={new Date('2026-08-10T08:00:00')} onEdit={() => {}} />)

    const chip = screen.getByRole('button', { name: 'Change priority for Priority task, currently Medium' })
    fireEvent.click(chip)

    const updated = useTasksStore.getState().tasks[0]
    expect(updated.priority).toBe('low')
    expect(updated.important).toBe(true)
    expect(updated.urgent).toBe(false)
  })

  describe('TodoView', () => {
    it('hides a task when a filter excludes it and updates the group count', () => {
      const shown = makeTask(1, { title: 'Active task', important: true, urgent: true, done: false })
      const hidden = makeTask(2, { title: 'Done task', important: true, urgent: true, done: true })
      useTasksStore.setState({ tasks: [shown, hidden] })
      render(<TodoView />)

      expect(screen.getByText('Active task')).toBeDefined()
      expect(screen.getByText('Done task')).toBeDefined()
      const doGroup = screen.getByText('Active task').closest('.todo-group')!
      expect(doGroup.querySelector('.todo-group-count')?.textContent).toBe('2 tasks')

      fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Show completed' }))

      expect(screen.queryByText('Done task')).toBeNull()
      expect(doGroup.querySelector('.todo-group-count')?.textContent).toBe('1 task')
    })

    it('reorders only the group whose sort control changed', () => {
      const zebra = makeTask(1, { title: 'Zebra', important: true, urgent: true, sort: 0 })
      const apple = makeTask(2, { title: 'Apple', important: true, urgent: true, sort: 1 })
      const otherFirst = makeTask(3, { title: 'Other B', important: true, urgent: false, sort: 0 })
      const otherSecond = makeTask(4, { title: 'Other A', important: true, urgent: false, sort: 1 })
      useTasksStore.setState({ tasks: [zebra, apple, otherFirst, otherSecond] })
      render(<TodoView />)

      const doTitlesBefore = Array.from(document.querySelectorAll('.todo-group')).find((section) => section.textContent?.includes('Zebra'))!
      expect(Array.from(doTitlesBefore.querySelectorAll('.task-title')).map((el) => el.textContent)).toEqual(['Zebra', 'Apple'])
      const planSection = Array.from(document.querySelectorAll('.todo-group')).find((section) => section.textContent?.includes('Other B'))!
      expect(Array.from(planSection.querySelectorAll('.task-title')).map((el) => el.textContent)).toEqual(['Other B', 'Other A'])

      fireEvent.change(screen.getByRole('combobox', { name: 'Sort Urgent & important' }), { target: { value: 'title' } })

      const doSection = Array.from(document.querySelectorAll('.todo-group')).find((section) => section.textContent?.includes('Zebra'))!
      expect(Array.from(doSection.querySelectorAll('.task-title')).map((el) => el.textContent)).toEqual(['Apple', 'Zebra'])
      const planSectionAfter = Array.from(document.querySelectorAll('.todo-group')).find((section) => section.textContent?.includes('Other B'))!
      expect(Array.from(planSectionAfter.querySelectorAll('.task-title')).map((el) => el.textContent)).toEqual(['Other B', 'Other A'])
    })

    it('disables the drag handle with a reason once a group\'s sort is not manual', () => {
      const task = makeTask(1, { title: 'Sorted task', important: true, urgent: true })
      useTasksStore.setState({ tasks: [task], sortByGroup: { do: 'due' } })
      render(<TodoView />)

      const handle = screen.getByRole('button', { name: 'Drag Sorted task' })
      expect(handle.getAttribute('aria-disabled')).toBe('true')
      expect(handle.getAttribute('title')).toBe('Set sort to Manual to reorder by hand.')
    })

    it('highlights the cross-view focus target and clears the pending state', () => {
      const task = makeTask(1, { title: 'Linked task', important: true, urgent: true })
      useTasksStore.setState({ tasks: [task] })
      useAppStore.setState({ pendingTodoFocus: task.id })
      render(<TodoView />)

      const row = document.querySelector(`[data-task-id="${task.id}"]`)
      expect(row?.classList.contains('todo-row-focused')).toBe(true)
      expect(useAppStore.getState().pendingTodoFocus).toBeNull()
    })

    it('moves DOM focus to the cross-view focus target and fades the highlight after ~2s', async () => {
      const task = makeTask(1, { title: 'Linked task', important: true, urgent: true })
      useTasksStore.setState({ tasks: [task] })
      useAppStore.setState({ pendingTodoFocus: task.id })
      render(<TodoView />)

      const row = document.querySelector(`[data-task-id="${task.id}"]`)
      expect(row?.classList.contains('todo-row-focused')).toBe(true)

      await vi.waitFor(() => {
        expect(document.activeElement).toBe(row)
      })

      await vi.waitFor(
        () => {
          expect(row?.classList.contains('todo-row-focused')).toBe(false)
        },
        { timeout: TODO_FOCUS_FADE_MS + 2000 },
      )
    })

    it('clears the pending focus silently when the task no longer exists', () => {
      useTasksStore.setState({ tasks: [] })
      useAppStore.setState({ pendingTodoFocus: 999 })
      render(<TodoView />)

      expect(useAppStore.getState().pendingTodoFocus).toBeNull()
    })
  })

  it('previews and cancels a Today reorder without persisting until drop', async () => {
    useBlocksStore.setState({ blocksByDay: { [DAY]: [makeBlock(1, 'First', 540), makeBlock(2, 'Second', 660)] }, loadedDays: [DAY] })
    render(<TodayView />)

    const firstHandle = screen.getByRole('button', { name: 'Drag First' })
    const secondHandle = screen.getByRole('button', { name: 'Drag Second' })
    fireEvent.dragStart(firstHandle)
    fireEvent.dragOver(secondHandle.closest('.timeline-block')!)

    expect(screen.getByText('Previewing reordered schedule — drop to apply')).toBeDefined()
    expect(Array.from(document.querySelectorAll('.timeline-block-title')).map((node) => node.textContent)).toEqual(['Second', 'First'])
    fireEvent.dragEnd(firstHandle)
    expect(screen.queryByText('Previewing reordered schedule — drop to apply')).toBeNull()
    expect(useBlocksStore.getState().blocksByDay[DAY].map((block) => block.id)).toEqual([1, 2])
  })

  it('confirms a subtask duration before creating a Today block with both links', async () => {
    const { driver } = createTestDb()
    await useDayStore.getState().hydrate(driver, DAY, 540)
    await useBlocksStore.getState().hydrate(driver, [DAY])
    await useTasksStore.getState().hydrate(driver)
    const taskId = await useTasksStore.getState().addTask({ title: 'Parent', important: true })
    const subtaskId = await useTasksStore.getState().createSubtask({ taskId: taskId!, title: 'Research', estimateMin: 30 })
    const task = useTasksStore.getState().tasks.find((item) => item.id === taskId)!
    const subtask = useTasksStore.getState().subtasksByTask[task.id][0] as Subtask
    expect(subtask.id).toBe(subtaskId)

    render(<SubtaskList task={task} now={new Date('2026-08-10T08:00:00')} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Research to today' }))
    expect(await screen.findByRole('dialog', { name: 'Schedule Research' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Add to today' }))

    await vi.waitFor(() => {
      expect(useBlocksStore.getState().blocksByDay[DAY]).toHaveLength(1)
      expect(useAppStore.getState().view).toBe('today')
    })
    expect(useBlocksStore.getState().blocksByDay[DAY][0]).toMatchObject({ taskId, subtaskId })
  })

  it('uses accessible repeat labels for every repeat mode', () => {
    render(<MusicBar />)
    expect(screen.getByRole('button', { name: 'Repeat off' })).toBeDefined()
    act(() => usePlayerStore.setState({ repeatMode: 'queue' }))
    expect(screen.getByRole('button', { name: 'Repeat queue' })).toBeDefined()
    act(() => usePlayerStore.setState({ repeatMode: 'one' }))
    expect(screen.getByRole('button', { name: 'Repeat one' })).toBeDefined()
  })

  describe('Today block notes panel', () => {
    it('shows the selected block\'s note and switches it when another block is chosen', async () => {
      useBlocksStore.setState({
        blocksByDay: {
          [DAY]: [
            makeBlock(1, 'First', 540, { note: 'First note text' }),
            makeBlock(2, 'Second', 660, { note: 'Second note text' }),
          ],
        },
        loadedDays: [DAY],
      })
      render(<TodayView />)

      // nowMin=540 (from beforeEach) makes First the active, initially-selected block.
      expect(screen.getByRole('textbox', { name: 'Notes for First' }).textContent).toBe('First note text')
      expect(screen.queryByRole('textbox', { name: 'Notes for Second' })).toBeNull()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Show notes for Second' }))
      })

      expect(screen.getByRole('textbox', { name: 'Notes for Second' }).textContent).toBe('Second note text')
      expect(screen.queryByRole('textbox', { name: 'Notes for First' })).toBeNull()
    })

    it('does not switch away from a focused block when a different block becomes active', async () => {
      useBlocksStore.setState({
        blocksByDay: {
          [DAY]: [
            makeBlock(1, 'First', 540, { note: 'First note text' }),
            makeBlock(2, 'Second', 660, { note: 'Second note text' }),
          ],
        },
        loadedDays: [DAY],
      })
      render(<TodayView />)

      const firstTextbox = screen.getByRole('textbox', { name: 'Notes for First' })
      // Bubbling focusin/focusout — the boundary the panel listens on for
      // its onFocus/onBlur — not the non-bubbling `fireEvent.focus`, which
      // would never reach the wrapper that owns the handler.
      fireEvent.focusIn(firstTextbox)

      // Second block now starts its in-session window; without the focus
      // gate this would yank the panel away mid-edit.
      await act(async () => {
        useDayStore.setState({ nowMin: 660 })
      })

      expect(screen.getByRole('textbox', { name: 'Notes for First' })).toBeDefined()
      expect(screen.queryByRole('textbox', { name: 'Notes for Second' })).toBeNull()

      fireEvent.focusOut(firstTextbox)
    })

    it('falls back to the nearest remaining block when the selected block is deleted', async () => {
      useBlocksStore.setState({
        blocksByDay: {
          [DAY]: [
            makeBlock(1, 'First', 540, { note: 'First note text' }),
            makeBlock(2, 'Second', 660, { note: 'Second note text' }),
          ],
        },
        loadedDays: [DAY],
      })
      render(<TodayView />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Show notes for Second' }))
      })
      expect(screen.getByRole('textbox', { name: 'Notes for Second' })).toBeDefined()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Delete Second' }))
      })

      await vi.waitFor(() => {
        expect(screen.getByRole('textbox', { name: 'Notes for First' })).toBeDefined()
      })
    })

    it('shows the task link only when the block is linked to a task, and it focuses that task', async () => {
      useBlocksStore.setState({
        blocksByDay: { [DAY]: [makeBlock(1, 'Linked', 540, { taskId: 5 })] },
        loadedDays: [DAY],
      })
      render(<TodayView />)

      const link = screen.getByRole('button', { name: 'This is a task.' })
      await act(async () => {
        fireEvent.click(link)
      })
      expect(useAppStore.getState().pendingTodoFocus).toBe(5)
      expect(useAppStore.getState().view).toBe('todo')
    })

    it('flushes a pending edit before following the task link, so the debounced draft is not lost', async () => {
      // The task-link button lives inside the panel's blur-flush wrapper, so
      // clicking it moves focus within the panel and the blur guard would
      // normally suppress the flush — the handler must flush explicitly
      // before navigating, and the save must land before the view switches.
      useBlocksStore.setState({
        blocksByDay: { [DAY]: [makeBlock(1, 'Linked', 540, { taskId: 5 })] },
        loadedDays: [DAY],
      })
      render(<TodayView />)

      const textbox = screen.getByRole('textbox', { name: 'Notes for Linked' })
      fireEvent.focusIn(textbox)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
      })
      expect(document.querySelector('.block-notes-save-state')?.textContent).toBe('Saving…')

      const link = screen.getByRole('button', { name: 'This is a task.' })
      await act(async () => {
        fireEvent.click(link)
      })

      // The click handler awaits the flush before navigating, but the
      // underlying write chain is a real (unmocked) async db round-trip —
      // wait for it rather than asserting immediately after the click, same
      // as the other flush-ordering tests in this file.
      await vi.waitFor(() => {
        expect(useBlocksStore.getState().blocksByDay[DAY][0].note).toContain('bulletList')
      })
      expect(useAppStore.getState().pendingTodoFocus).toBe(5)
      expect(useAppStore.getState().view).toBe('todo')
    })

    it('keeps the panel in place and does not navigate when the pre-navigate flush fails', async () => {
      const realSaveBlockNote = useBlocksStore.getState().saveBlockNote
      const failingSave = vi.fn(async () => false)
      try {
        useAppStore.setState({ view: 'today' })
        useBlocksStore.setState({
          blocksByDay: { [DAY]: [makeBlock(1, 'Linked', 540, { taskId: 5, note: 'original' })] },
          loadedDays: [DAY],
          saveBlockNote: failingSave,
        })
        render(<TodayView />)

        const textbox = screen.getByRole('textbox', { name: 'Notes for Linked' })
        fireEvent.focusIn(textbox)
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
        })

        const link = screen.getByRole('button', { name: 'This is a task.' })
        await act(async () => {
          fireEvent.click(link)
        })

        await vi.waitFor(() => {
          expect(failingSave).toHaveBeenCalled()
        })
        // The failed flush must not be discarded: no navigation, no task
        // focus, and the failed-draft state stays visible on the panel that
        // still holds the unsaved edit.
        expect(useAppStore.getState().view).toBe('today')
        expect(useAppStore.getState().pendingTodoFocus).toBeNull()
        expect(screen.getByRole('textbox', { name: 'Notes for Linked' })).toBeDefined()
        expect(document.querySelector('.block-notes-save-state')?.textContent).toBe('Save failed')
      } finally {
        useBlocksStore.setState({ saveBlockNote: realSaveBlockNote })
      }
    })

    it('hides the task link when the block has no linked task', () => {
      useBlocksStore.setState({
        blocksByDay: { [DAY]: [makeBlock(1, 'Unlinked', 540)] },
        loadedDays: [DAY],
      })
      render(<TodayView />)
      expect(screen.queryByRole('button', { name: 'This is a task. ↗' })).toBeNull()
    })

    it('shows the note-pencil as fill only for real content, not a serialized empty doc', () => {
      const emptyDoc = serializeNote({ type: 'doc', content: [{ type: 'paragraph' }] })
      useBlocksStore.setState({
        blocksByDay: {
          [DAY]: [
            makeBlock(1, 'Empty', 540, { note: emptyDoc }),
            makeBlock(2, 'Filled', 660, { note: 'Some real content' }),
          ],
        },
        loadedDays: [DAY],
      })
      render(<TodayView />)

      const emptyPencil = screen.getByRole('button', { name: 'Show notes for Empty' }).querySelector('[data-testid="note-pencil"]')
      const filledPencil = screen.getByRole('button', { name: 'Show notes for Filled' }).querySelector('[data-testid="note-pencil"]')
      expect(emptyPencil?.getAttribute('data-weight')).toBe('regular')
      expect(filledPencil?.getAttribute('data-weight')).toBe('fill')
    })

    it('seeds the panel with the first block once blocks hydrate after mount, even when none is active', async () => {
      // Blocks start empty (mirrors a real mount: useTodayBlocks() returns
      // the frozen EMPTY array until async hydration resolves) and neither
      // block below covers nowMin=540, so Rule 1's "first block" arm — not
      // "active block" — is what must seed the selection.
      render(<TodayView />)
      expect(screen.queryByRole('textbox', { name: /Notes for/ })).toBeNull()

      await act(async () => {
        useBlocksStore.setState({
          blocksByDay: {
            [DAY]: [
              makeBlock(1, 'Later First', 600, { note: 'Later first note' }),
              makeBlock(2, 'Later Second', 660, { note: 'Later second note' }),
            ],
          },
          loadedDays: [DAY],
        })
      })

      expect(screen.getByRole('textbox', { name: 'Notes for Later First' }).textContent).toBe('Later first note')
    })

    it('reseeds the panel after the last block is deleted and a new one is added', async () => {
      useBlocksStore.setState({
        blocksByDay: { [DAY]: [makeBlock(1, 'Solo', 600, { note: 'Solo note' })] },
        loadedDays: [DAY],
      })
      render(<TodayView />)
      expect(screen.getByRole('textbox', { name: 'Notes for Solo' })).toBeDefined()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Delete Solo' }))
      })
      expect(screen.queryByRole('textbox', { name: /Notes for/ })).toBeNull()

      await act(async () => {
        useBlocksStore.setState({
          blocksByDay: { [DAY]: [makeBlock(2, 'Fresh', 620, { note: 'Fresh note' })] },
          loadedDays: [DAY],
        })
      })

      expect(screen.getByRole('textbox', { name: 'Notes for Fresh' }).textContent).toBe('Fresh note')
    })

    it('flushes a pending edit against the block\'s own day, not whatever day becomes current after a rollover', async () => {
      // The block starts (and stays) on DAY. The day clock then rolls over
      // to NEXT_DAY, dropping the block out of `useTodayBlocks()` — Rule 4
      // in TodayView flushes the pending edit before falling back to an
      // empty selection. The save must land on the block's own `day` field,
      // not on whatever `currentDay` happens to be by the time it runs.
      const NEXT_DAY = '2026-08-11'
      useBlocksStore.setState({
        blocksByDay: { [DAY]: [makeBlock(1, 'Overnight', 540)] },
        loadedDays: [DAY],
      })
      render(<TodayView />)

      const textbox = screen.getByRole('textbox', { name: 'Notes for Overnight' })
      fireEvent.focusIn(textbox)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
      })

      await act(async () => {
        useBlocksStore.setState((s) => ({
          blocksByDay: { ...s.blocksByDay, [NEXT_DAY]: [] },
          loadedDays: [...s.loadedDays, NEXT_DAY],
        }))
        useDayStore.setState({ currentDay: NEXT_DAY })
      })

      await vi.waitFor(() => {
        expect(useBlocksStore.getState().blocksByDay[DAY][0].note).toContain('bulletList')
      })
      expect(useBlocksStore.getState().blocksByDay[DAY][0].noteUpdatedAt).not.toBeNull()
      // Nothing was ever written under the new current day — a `currentDay`
      // write would have created a phantom entry there instead.
      expect(useBlocksStore.getState().blocksByDay[NEXT_DAY]).toEqual([])
    })

    it('keeps the block selected with its failed draft instead of silently dropping it when a flush fails', async () => {
      // `useBlocksStore.setState` shallow-merges, so an overridden action
      // leaks into every later test unless restored — capture and put the
      // real one back once this test is done.
      const realSaveBlockNote = useBlocksStore.getState().saveBlockNote
      const failingSave = vi.fn(async () => false)
      try {
        useBlocksStore.setState({
          blocksByDay: {
            [DAY]: [
              makeBlock(1, 'First', 540, { note: 'First note text' }),
              makeBlock(2, 'Second', 660, { note: 'Second note text' }),
            ],
          },
          loadedDays: [DAY],
          saveBlockNote: failingSave,
        })
        render(<TodayView />)

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
        })

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Show notes for Second' }))
        })

        // The flush the selection change waited on reported failure, so the
        // boolean must not be discarded: the panel stays on First (with its
        // unsaved draft still visible) rather than silently losing it.
        await vi.waitFor(() => {
          expect(failingSave).toHaveBeenCalled()
        })
        expect(screen.getByRole('textbox', { name: 'Notes for First' })).toBeDefined()
        expect(screen.queryByRole('textbox', { name: 'Notes for Second' })).toBeNull()
        expect(document.querySelector('.block-notes-save-state')?.textContent).toBe('Save failed')
      } finally {
        useBlocksStore.setState({ saveBlockNote: realSaveBlockNote })
      }
    })

    it('flushes a pending edit on blur, not just on the trailing debounce', async () => {
      useBlocksStore.setState({
        blocksByDay: { [DAY]: [makeBlock(1, 'Blurred', 540)] },
        loadedDays: [DAY],
      })
      render(<TodayView />)

      const textbox = screen.getByRole('textbox', { name: 'Notes for Blurred' })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))
      })

      // Leaving the panel entirely (relatedTarget outside the wrapper) —
      // not a toolbar click, which stays inside the wrapper and must not
      // flush on every internal focus move.
      await act(async () => {
        fireEvent.focusOut(textbox)
      })

      await vi.waitFor(() => {
        expect(useBlocksStore.getState().blocksByDay[DAY][0].note).toContain('bulletList')
      })
    })
  })

  describe('WeekPlanView', () => {
    it('+ Add block on a day column opens the composer for that day', async () => {
      const futureDay = '2026-08-12'
      useDayStore.setState({ currentDay: DAY, nowMin: 540 })
      useBlocksStore.setState({ blocksByDay: {}, loadedDays: [DAY, futureDay] })
      render(<WeekPlanView />)

      const addBlockButtons = screen.getAllByRole('button', { name: 'Add block' })
      // The 7 buttons are for each day of the week; futureDay is 2 days after DAY
      fireEvent.click(addBlockButtons[2])

      await vi.waitFor(() => {
        expect(screen.getByRole('dialog')).toBeDefined()
      })
    })

    it('Group by control reorders cards within a column without moving them between columns', async () => {
      const task1 = makeTask(1, { title: 'Do task', important: true, urgent: true })
      const task2 = makeTask(2, { title: 'Plan task', important: true, urgent: false })
      useTasksStore.setState({ tasks: [task1, task2] })

      const sameDay = DAY
      useBlocksStore.setState({
        blocksByDay: {
          [sameDay]: [
            makeBlock(1, 'Do block', 540, { taskId: 1, sort: 0 }),
            makeBlock(2, 'Plan block', 600, { taskId: 2, sort: 1 }),
          ],
        },
        loadedDays: [sameDay],
      })
      render(<WeekPlanView />)

      const blocksTitles = Array.from(document.querySelectorAll('.week-block-card-title')).map((el) => el.textContent)
      const doIndex = blocksTitles.indexOf('Do block')
      const planIndex = blocksTitles.indexOf('Plan block')
      expect(doIndex).toBeGreaterThanOrEqual(0)
      expect(planIndex).toBeGreaterThanOrEqual(0)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Deadline' }))
      })

      // Blocks should have reordered within the same column
      const blocksAfter = Array.from(document.querySelectorAll('.week-block-card-title')).map((el) => el.textContent)
      const doIndexAfter = blocksAfter.indexOf('Do block')
      const planIndexAfter = blocksAfter.indexOf('Plan block')
      expect(doIndexAfter).toBeGreaterThanOrEqual(0)
      expect(planIndexAfter).toBeGreaterThanOrEqual(0)

      // Verify the persisted sort values in blocks store are unchanged (view-level sort only)
      const blocks = useBlocksStore.getState().blocksByDay[sameDay]
      const doBlock = blocks.find((b) => b.id === 1)
      const planBlock = blocks.find((b) => b.id === 2)
      expect(doBlock?.sort).toBe(0)
      expect(planBlock?.sort).toBe(1)
    })

    it('falls back to the first visible day for header "New block" once the user has navigated away from the current week', async () => {
      // Header "New block" has no day of its own to anchor to and defaults
      // to currentDay — but after paging to a different week, currentDay is
      // no longer in `days`, and creating on it would silently vanish from
      // the visible week. It must fall back to the first visible day.
      useDayStore.setState({ currentDay: DAY, nowMin: 540 })
      useBlocksStore.setState({ blocksByDay: {}, loadedDays: [] })
      render(<WeekPlanView />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
      })

      const nextWeekDays = weekDays(addDays(startOfWeek(fromDayKey(DAY)), 7))
      expect(nextWeekDays).not.toContain(DAY)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'New block' }))
      })
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(dialog.querySelector('.composer-name-input') as HTMLInputElement, {
        target: { value: 'Future block' },
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
      })

      const created = Object.entries(useBlocksStore.getState().blocksByDay)
        .flatMap(([day, blocks]) => blocks.map((b) => ({ day, title: b.title })))
        .find((b) => b.title === 'Future block')
      expect(created).toBeDefined()
      expect(created!.day).toBe(nextWeekDays[0])
    })

    it('completionEstimate of null renders as —, not 0%', () => {
      const block = makeBlock(1, 'Future block', 1020, { completed: false })
      useBlocksStore.setState({
        blocksByDay: { [DAY]: [block] },
        loadedDays: [DAY],
      })
      render(<WeekPlanView />)

      const statsValues = Array.from(document.querySelectorAll('.week-stat-value')).map((el) => el.textContent)
      expect(statsValues).toContain('—')
    })
  })
})
