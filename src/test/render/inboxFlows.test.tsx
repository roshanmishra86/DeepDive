// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { InboxView } from '../../components/views/InboxView'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { useTasksStore } from '../../stores/tasks'
import { useTimerStore } from '../../stores/timer'

const TEST_DAY = '2026-09-11'

describe('InboxView render flows', () => {
  beforeEach(() => {
    useDayStore.setState({
      currentDay: TEST_DAY,
      nowMin: 9 * 60,
      shutdownMin: null,
      shutdownIsDefault: true,
      error: null,
    })

    useBlocksStore.setState({
      blocksByDay: {
        [TEST_DAY]: [],
      },
      loadedDays: [TEST_DAY],
      loading: false,
      error: null,
    })

    useTasksStore.setState({
      tasks: [],
      archivedTasks: [],
      loading: false,
      error: null,
    })

    useTimerStore.setState({
      phase: 'focus',
      running: false,
      blockTitle: null,
      blockId: null,
      pomodorosDone: 0,
      pomodorosPerBlock: 3,
    })
  })

  it('renders Today header, quick-capture card, and stat cards', () => {
    render(<InboxView />)

    expect(screen.getByText('Today')).toBeDefined()
    expect(
      screen.getByText(
        'Capture tasks quickly, work through them today, and send unfinished items back to TODO.'
      )
    ).toBeDefined()
    expect(screen.getByPlaceholderText('What needs to get done?')).toBeDefined()
    expect(screen.getByText('tasks captured today')).toBeDefined()
    expect(screen.getByText('completed today')).toBeDefined()
    expect(screen.getByText('focus time logged')).toBeDefined()
    expect(screen.getByText('imported from TODO')).toBeDefined()
  })

  it('allows quick capturing a new task and adds it to Do Next', async () => {
    render(<InboxView />)

    const input = screen.getByPlaceholderText('What needs to get done?')
    fireEvent.change(input, { target: { value: 'Write weekly newsletter' } })

    const addBtn = screen.getByRole('button', { name: 'Add' })
    await act(async () => {
      fireEvent.click(addBtn)
    })

    expect(screen.getByText('Write weekly newsletter')).toBeDefined()
    const blocks = useBlocksStore.getState().blocksByDay[TEST_DAY]
    expect(blocks).toHaveLength(1)
    expect(blocks[0].title).toBe('Write weekly newsletter')
    expect(blocks[0].inboxGroup).toBe('next')
  })

  it('toggles task completion when checkbox is clicked', async () => {
    await act(async () => {
      await useBlocksStore.getState().addInboxTask(TEST_DAY, {
        title: 'Draft release notes',
        group: 'next',
      })
    })

    render(<InboxView />)
    expect(screen.getByText('Draft release notes')).toBeDefined()

    const checkbox = screen.getByRole('button', { name: 'Mark complete' })
    await act(async () => {
      fireEvent.click(checkbox)
    })

    const blocks = useBlocksStore.getState().blocksByDay[TEST_DAY]
    expect(blocks[0].completed).toBe(true)
  })

  it('starts focus on task and updates timer state', async () => {
    await act(async () => {
      await useBlocksStore.getState().addInboxTask(TEST_DAY, {
        title: 'Core architecture refactor',
        group: 'next',
      })
    })

    render(<InboxView />)

    const startFocusBtn = screen.getByRole('button', { name: /Start focus/i })
    await act(async () => {
      fireEvent.click(startFocusBtn)
    })

    // Block moved to working group
    const blocks = useBlocksStore.getState().blocksByDay[TEST_DAY]
    expect(blocks[0].inboxGroup).toBe('working')

    // Timer is active and running for this block
    const timerState = useTimerStore.getState()
    expect(timerState.running).toBe(true)
    expect(timerState.blockTitle).toBe('Core architecture refactor')
  })

  it('filters unified list when workflow state tab is clicked', async () => {
    await act(async () => {
      await useBlocksStore.getState().addInboxTask(TEST_DAY, {
        title: 'Task in Working',
        group: 'working',
      })
      await useBlocksStore.getState().addInboxTask(TEST_DAY, {
        title: 'Task in Do Next',
        group: 'next',
      })
    })

    render(<InboxView />)

    // Both tasks are in unified list initially
    expect(screen.getByText('Task in Working')).toBeDefined()
    expect(screen.getByText('Task in Do Next')).toBeDefined()

    // Click Working Now tab
    const workingTab = screen.getByRole('tab', { name: /Working Now/i })
    await act(async () => {
      fireEvent.click(workingTab)
    })

    // Now only Task in Working is displayed
    expect(screen.getByText('Task in Working')).toBeDefined()
    expect(screen.queryByText('Task in Do Next')).toBeNull()

    // Clicking Working Now tab again clears the filter
    await act(async () => {
      fireEvent.click(workingTab)
    })
    expect(screen.getByText('Task in Working')).toBeDefined()
    expect(screen.getByText('Task in Do Next')).toBeDefined()
  })

  it('renders workflow state badges and metadata in unified list', async () => {
    await act(async () => {
      await useBlocksStore.getState().addInboxTask(TEST_DAY, {
        title: 'Finish design mockups',
        group: 'working',
        energy: 'high',
        estimateMin: 25,
        tags: ['Product'],
      })
    })

    render(<InboxView />)

    expect(screen.getByText('Finish design mockups')).toBeDefined()
    expect(screen.getByText('High')).toBeDefined()
    expect(screen.getByText('25 min')).toBeDefined()
    expect(screen.getByText('Product')).toBeDefined()
    expect(screen.getByLabelText(/Workflow state: Working Now/i)).toBeDefined()
  })

  it('opens and closes dropdown menu when 3 dots button is clicked', async () => {
    await act(async () => {
      await useBlocksStore.getState().addInboxTask(TEST_DAY, {
        title: 'Review pull request',
        group: 'next',
      })
    })

    render(<InboxView />)

    expect(screen.getByText('Review pull request')).toBeDefined()

    // The menu is not open initially
    expect(screen.queryByRole('menu')).toBeNull()

    const moreBtn = screen.getByRole('button', { name: 'Task options' })
    expect(moreBtn.getAttribute('aria-expanded')).toBe('false')

    // Click 3 dots button to open dropdown menu
    await act(async () => {
      fireEvent.click(moreBtn)
    })

    expect(moreBtn.getAttribute('aria-expanded')).toBe('true')
    const menu = screen.getByRole('menu')
    expect(menu).toBeDefined()
    expect(screen.getByText('Move to Working Now')).toBeDefined()
    expect(screen.getByText('Move to Capture')).toBeDefined()
    expect(screen.getByText('Move to Waiting / Later')).toBeDefined()
    expect(screen.getByText('Delete')).toBeDefined()

    // Click "Move to Working Now"
    const moveToWorking = screen.getByText('Move to Working Now')
    await act(async () => {
      fireEvent.click(moveToWorking)
    })

    // Menu should now be closed
    expect(screen.queryByRole('menu')).toBeNull()
    const blocks = useBlocksStore.getState().blocksByDay[TEST_DAY]
    expect(blocks[0].inboxGroup).toBe('working')
  })
})
