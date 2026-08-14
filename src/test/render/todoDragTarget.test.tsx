// @vitest-environment happy-dom
/**
 * Regression coverage for TodoView's per-row drag-target outline (defect 4:
 * dragging used to mark EVERY non-dragged row as a drop target instead of
 * only the row currently under the pointer). Isolated in its own file so it
 * doesn't collide with the concurrently-owned taskPlanningFlows.test.tsx.
 *
 * Harness rules follow the existing render-test files: happy-dom,
 * IS_REACT_ACT_ENVIRONMENT, fireEvent (not user-event), merge-setState
 * resets, no fake timers.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Task } from '../../db/types'
import { useAppStore } from '../../stores/app'
import { useTasksStore } from '../../stores/tasks'
import { useDayStore } from '../../stores/day'
import { DEFAULT_ACCENT } from '../../lib/accents'
import { DEFAULT_TODO_FILTERS } from '../../lib/todo'
import { TodoView } from '../../components/views/TodoView'

const DAY = '2026-08-10'

vi.mock('../../db/index', () => ({ openDatabase: async () => null }))

const makeTask = (id: number, title: string): Task => ({
  id,
  title,
  notes: '',
  important: true,
  urgent: true,
  priority: 'high',
  dueAt: null,
  estimateMin: 60,
  done: false,
  createdAt: '2026-08-10T08:00:00Z',
  archived: false,
  sort: id,
  completedAt: null,
  archivedAt: null,
})

function resetStores() {
  useAppStore.setState({ view: 'week', accent: DEFAULT_ACCENT, timerStyle: 'ring', repeatStyle: 'chip', settingsOpen: false, planTarget: null, sessionOpen: false, pendingTodoFocus: null })
  useTasksStore.setState({
    tasks: [makeTask(1, 'First'), makeTask(2, 'Second'), makeTask(3, 'Third')],
    archivedTasks: [], groupBy: 'matrix', filters: DEFAULT_TODO_FILTERS, sortByGroup: {},
    loading: false, loadingArchived: false, error: null,
    errorArchived: null, subtasksByTask: {}, subtaskLoading: {}, subtaskError: {},
  })
  useDayStore.setState({ currentDay: DAY, nowMin: 540, shutdownMin: null, shutdownIsDefault: true, error: null })
}

function rowFor(title: string): HTMLElement {
  return screen.getByRole('button', { name: `Drag ${title}` }).closest('.task-row') as HTMLElement
}

describe('TodoView drag-target outline', () => {
  beforeEach(() => {
    resetStores()
  })

  it('outlines only the row currently under the pointer, not every non-dragged row', () => {
    render(<TodoView />)

    const first = rowFor('First')
    const second = rowFor('Second')
    const third = rowFor('Third')

    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag First' }))
    // Before any dragover, nothing is marked as a target yet.
    expect(first.className).not.toContain('task-row-drag-target')
    expect(second.className).not.toContain('task-row-drag-target')
    expect(third.className).not.toContain('task-row-drag-target')

    fireEvent.dragOver(second)
    expect(second.className).toContain('task-row-drag-target')
    expect(first.className).not.toContain('task-row-drag-target')
    expect(third.className).not.toContain('task-row-drag-target')

    // Moving the pointer to a different row shifts the outline; the old
    // target is cleared, not accumulated.
    fireEvent.dragOver(third)
    expect(third.className).toContain('task-row-drag-target')
    expect(second.className).not.toContain('task-row-drag-target')
  })

  it('clears the outline once the drag ends', () => {
    render(<TodoView />)

    const second = rowFor('Second')
    fireEvent.dragStart(screen.getByRole('button', { name: 'Drag First' }))
    fireEvent.dragOver(second)
    expect(second.className).toContain('task-row-drag-target')

    fireEvent.dragEnd(screen.getByRole('button', { name: 'Drag First' }))
    expect(second.className).not.toContain('task-row-drag-target')
  })
})
