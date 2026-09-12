// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TodoView } from '../../components/views/TodoView'
import { useTasksStore } from '../../stores/tasks'
import { useDayStore } from '../../stores/day'
import { useAppStore } from '../../stores/app'
import type { Task, Subtask } from '../../db/types'

const TEST_DAY = '2026-09-11'

const mockTasks: Task[] = [
  {
    id: 1,
    title: 'Launch v1.0 of marketing site',
    notes: '',
    important: true,
    urgent: true,
    priority: 'high',
    dueAt: '2026-09-11T17:00:00.000Z',
    estimateMin: 120,
    done: false,
    createdAt: '2026-09-10T10:00:00.000Z',
    archived: false,
    sort: 0,
    completedAt: null,
    archivedAt: null,
    tags: ['Website'],
  },
  {
    id: 2,
    title: 'Prepare workshop: Agentic AI',
    notes: '',
    important: true,
    urgent: true,
    priority: 'high',
    dueAt: '2026-09-12T17:00:00.000Z',
    estimateMin: 180,
    done: false,
    createdAt: '2026-09-10T10:00:00.000Z',
    archived: false,
    sort: 1,
    completedAt: null,
    archivedAt: null,
    tags: ['Kinesis Labs'],
  },
  {
    id: 3,
    title: 'Build PDF annotation sync',
    notes: '',
    important: true,
    urgent: false,
    priority: 'medium',
    dueAt: '2026-09-16T17:00:00.000Z',
    estimateMin: 120,
    done: false,
    createdAt: '2026-09-10T10:00:00.000Z',
    archived: false,
    sort: 2,
    completedAt: null,
    archivedAt: null,
    tags: ['Vokal'],
  },
  {
    id: 4,
    title: 'Learn basic Kannada',
    notes: '',
    important: false,
    urgent: false,
    priority: 'low',
    dueAt: null,
    estimateMin: 30,
    done: false,
    createdAt: '2026-09-10T10:00:00.000Z',
    archived: false,
    sort: 3,
    completedAt: null,
    archivedAt: null,
    tags: ['Learning'],
  },
  {
    id: 5,
    title: 'Build Recallify MVP',
    notes: '',
    important: false,
    urgent: false,
    priority: 'low',
    dueAt: null,
    estimateMin: null,
    done: false,
    createdAt: '2026-09-10T10:00:00.000Z',
    archived: false,
    sort: 4,
    completedAt: null,
    archivedAt: null,
    tags: ['Side Project', 'someday'],
  },
]

const mockSubtasks: Subtask[] = [
  {
    id: 101,
    taskId: 1,
    title: 'Finalize copy',
    estimateMin: 30,
    done: false,
    sort: 0,
    createdAt: '2026-09-10T10:00:00.000Z',
    dueAt: '2026-09-11T17:00:00.000Z',
  },
  {
    id: 102,
    taskId: 1,
    title: 'Create hero image',
    estimateMin: 45,
    done: false,
    sort: 1,
    createdAt: '2026-09-10T10:00:00.000Z',
    dueAt: '2026-09-11T17:00:00.000Z',
  },
]

describe('TodoView render flows', () => {
  beforeEach(() => {
    useDayStore.setState({
      currentDay: TEST_DAY,
      nowMin: 9 * 60,
      shutdownMin: null,
      shutdownIsDefault: true,
      error: null,
    })

    useTasksStore.setState({
      tasks: mockTasks,
      archivedTasks: [],
      loading: false,
      error: null,
      activeGtdFilter: 'all',
      selectedTaskId: null,
      expandedTaskIds: { 1: true },
      subtasksByTask: { 1: mockSubtasks },
    })

    useAppStore.setState({
      view: 'todo',
      pendingTodoFocus: null,
    })
  })

  it('renders header, search bar, and view tabs', () => {
    render(<TodoView />)

    expect(screen.getByText('TODO')).toBeDefined()
    expect(
      screen.getByText(
        'Everything you want to get done. Capture, organize, and turn them into action.'
      )
    ).toBeDefined()
    expect(screen.getByPlaceholderText('Search tasks, projects, tags...')).toBeDefined()
    expect(screen.getByText('All tasks')).toBeDefined()
    expect(screen.getByText('By priority')).toBeDefined()
    expect(screen.getByText('By project')).toBeDefined()
    expect(screen.getByText('Deadline')).toBeDefined()
    expect(screen.getByText('Board')).toBeDefined()
  })

  it('renders priority accordion sections and task rows matching design', () => {
    render(<TodoView />)

    expect(screen.getByText('High Priority')).toBeDefined()
    expect(screen.getByText('Medium Priority')).toBeDefined()
    expect(screen.getByText('Low Priority')).toBeDefined()
    expect(screen.getByText('Someday')).toBeDefined()

    expect(screen.getByText('Launch v1.0 of marketing site')).toBeDefined()
    expect(screen.getByText('Prepare workshop: Agentic AI')).toBeDefined()
    expect(screen.getByText('Build PDF annotation sync')).toBeDefined()
    expect(screen.getByText('Learn basic Kannada')).toBeDefined()
    expect(screen.getByText('Build Recallify MVP')).toBeDefined()

    // Subtasks under expanded task 1
    expect(screen.getByText('Finalize copy')).toBeDefined()
    expect(screen.getByText('Create hero image')).toBeDefined()
  })

  it('filters tasks by search input', () => {
    render(<TodoView />)

    const searchInput = screen.getByPlaceholderText('Search tasks, projects, tags...')
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'Agentic' } })
    })

    expect(screen.getByText('Prepare workshop: Agentic AI')).toBeDefined()
    expect(screen.queryByText('Launch v1.0 of marketing site')).toBeNull()
  })

  it('switches to Kanban board view when Board tab is clicked', () => {
    render(<TodoView />)

    const boardTab = screen.getByText('Board')
    act(() => {
      fireEvent.click(boardTab)
    })

    expect(screen.getByText('Completed', { selector: '.todo-board-col-head span' })).toBeDefined()
  })

  it('opens task options menu when 3-dots button is clicked and displays all actions', () => {
    render(<TodoView />)

    const menuButtons = screen.getAllByRole('button', { name: 'Task options' })
    expect(menuButtons.length).toBeGreaterThan(0)

    // Click first task's 3-dots button
    act(() => {
      fireEvent.click(menuButtons[0])
    })

    // Menu options are displayed
    expect(screen.getByText('Edit details')).toBeDefined()
    expect(screen.getByText('Plan today')).toBeDefined()
    expect(screen.getByText('Hide subtasks')).toBeDefined()
    expect(screen.getByText('Archive')).toBeDefined()
    expect(screen.getByText('Delete')).toBeDefined()

    // Active item and section receive elevation classes
    const activeWrap = menuButtons[0].closest('.todo-task-item-wrap')
    expect(activeWrap?.classList.contains('todo-menu-open')).toBe(true)

    const activeSection = menuButtons[0].closest('.todo-accordion-section')
    expect(activeSection?.classList.contains('todo-section-menu-active')).toBe(true)
  })

  it('closes task options menu when clicking outside', () => {
    render(<TodoView />)

    const menuButtons = screen.getAllByRole('button', { name: 'Task options' })
    act(() => {
      fireEvent.click(menuButtons[0])
    })
    expect(screen.getByText('Edit details')).toBeDefined()

    // Click outside on body
    act(() => {
      fireEvent.mouseDown(document.body)
    })

    expect(screen.queryByText('Edit details')).toBeNull()
  })
})
