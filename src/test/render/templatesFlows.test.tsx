// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { TemplatesView } from '../../components/views/TemplatesView'
import { QuickApplyRailCard } from '../../components/templates/QuickApplyRailCard'
import { useTemplatesStore } from '../../stores/templates'
import { useBlocksStore } from '../../stores/blocks'
import { useTasksStore } from '../../stores/tasks'
import { useDayStore } from '../../stores/day'

const TEST_DAY = '2026-09-11'

describe('TemplatesView render flows', () => {
  beforeEach(async () => {
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

    useTemplatesStore.setState({
      templates: [],
      selectedId: null,
      detail: null,
      loading: false,
      error: null,
      activeCategoryFilter: 'all',
      searchQuery: '',
    })

    // Hydrate in-memory templates
    await useTemplatesStore.getState().hydrate(null)
  })

  it('renders Templates header, stats, template catalog, detail preview, and bottom cards', async () => {
    const { container } = render(<TemplatesView />)

    // Header elements
    expect(screen.getByText('Templates')).toBeDefined()
    expect(
      screen.getByText(
        'Build reusable task sets, routines, and starter lists you can drop into Today or TODO in one step.'
      )
    ).toBeDefined()
    expect(screen.getByRole('button', { name: /import from todo/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /create new template/i })).toBeDefined()

    // Stat cards
    expect(screen.getByText('saved in your library')).toBeDefined()
    expect(screen.getByText('recently applied')).toBeDefined()
    expect(screen.getByText('auto-suggested templates')).toBeDefined()
    expect(screen.getByText('pinned for quick access')).toBeDefined()

    // Template Catalog items within catalog pane
    const catalog = container.querySelector('.tpl-catalog-list')!
    expect(within(catalog as HTMLElement).getByText('Deep work session prep')).toBeDefined()
    expect(within(catalog as HTMLElement).getByText('Morning reset')).toBeDefined()

    // Detail view
    expect(screen.getByRole('heading', { level: 2, name: 'Deep work session prep' })).toBeDefined()
    expect(screen.getByText('Where to send tasks')).toBeDefined()
    expect(screen.getByText('Preview on apply')).toBeDefined()

    // Bottom analytics
    expect(screen.getByText('Recently used')).toBeDefined()
    expect(screen.getByText('Template categories')).toBeDefined()
    expect(screen.getByText('How templates help')).toBeDefined()
  })

  it('filters templates by category chips', async () => {
    const { container } = render(<TemplatesView />)

    const catalog = container.querySelector('.tpl-catalog-list') as HTMLElement
    expect(within(catalog).getByText('Deep work session prep')).toBeDefined()
    expect(within(catalog).getByText('Morning reset')).toBeDefined()

    // Click "Rituals" chip
    const ritualsBtn = screen.getByRole('tab', { name: 'Rituals' })
    await act(async () => {
      fireEvent.click(ritualsBtn)
    })

    // Morning reset (ritual) should remain, Deep work session prep (work) should not be in catalog
    expect(within(catalog).getByText('Morning reset')).toBeDefined()
    expect(within(catalog).queryByText('Deep work session prep')).toBeNull()
  })

  it('allows searching templates in catalog', async () => {
    const { container } = render(<TemplatesView />)

    const searchInput = screen.getByPlaceholderText(/search templates/i)
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Morning' } })
    })

    const catalog = container.querySelector('.tpl-catalog-list')!
    expect(within(catalog as HTMLElement).getByText('Morning reset')).toBeDefined()
    expect(within(catalog as HTMLElement).queryByText('Deep work session prep')).toBeNull()
  })

  it('selects a template from catalog and displays details', async () => {
    const { container } = render(<TemplatesView />)

    const catalog = container.querySelector('.tpl-catalog-list') as HTMLElement
    const morningResetCard = within(catalog).getByText('Morning reset')

    await act(async () => {
      fireEvent.click(morningResetCard)
    })

    // Detail view title updates
    expect(screen.getByRole('heading', { level: 2, name: 'Morning reset' })).toBeDefined()
    expect(screen.getAllByText('Start the day with clarity and setup').length).toBeGreaterThan(0)
  })

  it('switches destination between Today and TODO', async () => {
    render(<TemplatesView />)

    // Default destination for Deep work session prep is 'inbox' (displayed as Today)
    expect(screen.getByRole('button', { name: /apply to today/i })).toBeDefined()

    // Click the TODO radio option
    const todoRadio = screen.getByRole('radio', { name: /TODO Add tasks to your TODO/i })
    await act(async () => {
      fireEvent.click(todoRadio)
    })

    // Destination and action button should now reflect TODO
    expect(screen.getByRole('button', { name: /apply to todo/i })).toBeDefined()
  })

  it('applies template to Today and updates blocks store', async () => {
    render(<TemplatesView />)

    const applyBtn = screen.getByRole('button', { name: /apply to today/i })
    await act(async () => {
      fireEvent.click(applyBtn)
    })

    const dayBlocks = useBlocksStore.getState().blocksByDay[TEST_DAY]
    expect(dayBlocks.length).toBeGreaterThan(0)
    // Deep work session prep tasks include "Set focus timer for first session"
    expect(dayBlocks.some((b) => b.title === 'Set focus timer for first session')).toBe(true)
  })

  it('toggles template favorite status', async () => {
    const { container } = render(<TemplatesView />)

    const templateBefore = useTemplatesStore
      .getState()
      .templates.find((t) => t.name === 'Deep work session prep')
    expect(templateBefore?.favourite).toBe(true)

    // Click the favorite star button in the catalog card for Deep work session prep
    const catalog = container.querySelector('.tpl-catalog-list') as HTMLElement
    const starBtn = within(catalog).getByRole('button', { name: 'Unfavourite Deep work session prep' })
    await act(async () => {
      fireEvent.click(starBtn)
    })

    const updatedTemplate = useTemplatesStore
      .getState()
      .templates.find((t) => t.name === 'Deep work session prep')
    expect(updatedTemplate?.favourite).toBe(false)
  })

  it('renders QuickApplyRailCard and applies template to Inbox', async () => {
    render(<QuickApplyRailCard />)

    expect(screen.getByText('Quick apply')).toBeDefined()
    const select = screen.getByRole('combobox', { name: 'Select template to apply' })
    const applyBtn = screen.getByRole('button', { name: 'Apply' })

    // Select "Morning reset" (id: 1)
    await act(async () => {
      fireEvent.change(select, { target: { value: '1' } })
    })

    await act(async () => {
      fireEvent.click(applyBtn)
    })

    const dayBlocks = useBlocksStore.getState().blocksByDay[TEST_DAY]
    expect(dayBlocks.length).toBeGreaterThan(0)
    expect(dayBlocks.some((b) => b.title === 'Clear desk and open required documents')).toBe(true)
  })
})
