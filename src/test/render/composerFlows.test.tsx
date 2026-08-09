// @vitest-environment happy-dom
/**
 * Render-level user-flow regression tests for the block composer (create /
 * edit / delete / duration validation) and the template-apply confirmation
 * modal — surfaces that previously had zero component-level coverage.
 *
 * Environment: happy-dom (measured ~13-21s startup per FILE on this mount,
 * versus ~113s/file for jsdom in Phase 2 — the reason the whole render
 * suite is consolidated into two files). `globalThis.IS_REACT_ACT_ENVIRONMENT`
 * is required by React 19 + @testing-library/react 16.
 *
 * Harness rules honoured here:
 * - fireEvent only (user-event's async timing is flaky under happy-dom on
 *   this mount).
 * - No vi.useFakeTimers (breaks RTL async utils).
 * - Store-mutating interactions are wrapped in `await act(async ...)` and
 *   async appearances are awaited with `findBy*`.
 * - Every touched store singleton is reset in beforeEach with that store's
 *   own test-file merge-setState pattern (never `replace: true`), then
 *   re-hydrated against a fresh createTestDb() driver.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createTestDb } from '../nodeDriver'
import type { SqlDriver } from '../../db/driver'
import { useTodayStore } from '../../stores/today'
import { useTasksStore } from '../../stores/tasks'
import { BlockComposer } from '../../components/today/BlockComposer'
import { ApplyTemplateConfirmModal } from '../../components/templates/ApplyTemplateConfirmModal'

const DAY = '2026-08-04'
/** 9:00 AM in minutes-of-day — the composer's startMin prop everywhere. */
const START_MIN = 540
/** 8:00 PM shutdown, so the one-time shutdown gate never fires and a
 *  9:00 AM block of any tested duration always fits. */
const SHUTDOWN_MIN = 1200

interface BlockRow {
  id: number
  day: string
  title: string
  kind: string
  start_min: number
  duration_min: number
  pomodoros: number
}

async function readBlocks(driver: SqlDriver, day: string): Promise<BlockRow[]> {
  return driver.select<BlockRow>('SELECT * FROM day_block WHERE day = ? ORDER BY start_min', [day])
}

/**
 * Fresh driver + both stores reset and hydrated, with the shutdown time set
 * so the composer's one-time shutdown gate does not fire. Matches the
 * today/tasks store test-file reset patterns (merge setState).
 */
async function seedComposerStores(): Promise<SqlDriver> {
  const { driver } = createTestDb()

  useTodayStore.setState({
    day: null,
    blocks: [],
    loading: false,
    error: null,
    shutdownMin: null,
    shutdownIsDefault: true,
  })
  useTasksStore.setState({
    tasks: [],
    groupBy: 'matrix',
    loading: false,
    error: null,
  })

  await useTodayStore.getState().hydrate(driver, DAY)
  await useTasksStore.getState().hydrate(driver)
  // setShutdown persists the 'shutdownMin' setting and flips shutdownMin in
  // state, so `shutdownNeeded` is false from the first render.
  await useTodayStore.getState().setShutdown(SHUTDOWN_MIN, 'default')
  return driver
}

/** The composer's free-text duration field (placeholder "90"). */
function durationField(): HTMLElement {
  return screen.getByPlaceholderText('90')
}

function titleField(): HTMLElement {
  return screen.getByPlaceholderText('What is this block for?')
}

describe('BlockComposer flows', () => {
  let driver: SqlDriver

  beforeEach(async () => {
    driver = await seedComposerStores()
  })

  it('create flow: type a title, keep defaults, click Create — block lands in the store and SQLite, onDone fires', async () => {
    const onDone = vi.fn()
    render(<BlockComposer blockId={null} startMin={START_MIN} onDone={onDone} />)

    fireEvent.change(titleField(), { target: { value: 'Write the spec' } })

    const createBtn = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(createBtn.disabled).toBe(false)

    await act(async () => {
      fireEvent.click(createBtn)
    })

    expect(onDone).toHaveBeenCalledTimes(1)

    // In-memory store
    const blocks = useTodayStore.getState().blocks
    expect(blocks).toHaveLength(1)
    expect(blocks[0].title).toBe('Write the spec')
    expect(blocks[0].kind).toBe('deep')
    expect(blocks[0].startMin).toBe(START_MIN)
    expect(blocks[0].durationMin).toBe(30)

    // SQLite read-back through the real driver
    const rows = await readBlocks(driver, DAY)
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Write the spec')
    expect(rows[0].duration_min).toBe(30)
    expect(rows[0].start_min).toBe(START_MIN)
  })

  it('edit flow: the title field shows the block title; saving a change persists it', async () => {
    const blockId = await useTodayStore.getState().addBlock({
      title: 'Original title',
      kind: 'deep',
      durationMin: 60,
      startMin: START_MIN,
    })
    expect(blockId).not.toBeNull()

    const onDone = vi.fn()
    render(<BlockComposer blockId={blockId} startMin={START_MIN} onDone={onDone} />)

    const title = titleField() as HTMLInputElement
    expect(title.value).toBe('Original title')

    fireEvent.change(title, { target: { value: 'Renamed block' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(useTodayStore.getState().blocks[0].title).toBe('Renamed block')

    const rows = await readBlocks(driver, DAY)
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Renamed block')
  })

  it('delete flow: clicking Delete removes the block from the store and SQLite; onDone fires', async () => {
    const blockId = await useTodayStore.getState().addBlock({
      title: 'Doomed block',
      kind: 'deep',
      durationMin: 60,
      startMin: START_MIN,
    })
    expect(blockId).not.toBeNull()

    const onDone = vi.fn()
    render(<BlockComposer blockId={blockId} startMin={START_MIN} onDone={onDone} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(useTodayStore.getState().blocks).toHaveLength(0)

    // removeBlock persists asynchronously after onDone; wait for the row to go.
    await vi.waitFor(async () => {
      expect(await readBlocks(driver, DAY)).toHaveLength(0)
    })
  })

  it('accessible names: Create, Cancel, and the kind chips (aria-pressed) are found by role+name', () => {
    render(<BlockComposer blockId={null} startMin={START_MIN} onDone={() => {}} />)

    expect(screen.getByRole('button', { name: 'Create' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()

    const deep = screen.getByRole('button', { name: 'Deep' })
    const shallow = screen.getByRole('button', { name: 'Shallow' })
    const breakChip = screen.getByRole('button', { name: 'Break' })
    const ritual = screen.getByRole('button', { name: 'Ritual' })

    // New composer drafts default to deep.
    expect(deep.getAttribute('aria-pressed')).toBe('true')
    expect(shallow.getAttribute('aria-pressed')).toBe('false')
    expect(breakChip.getAttribute('aria-pressed')).toBe('false')
    expect(ritual.getAttribute('aria-pressed')).toBe('false')
  })

  it('accessible names in edit mode: Save, Cancel, Delete and the Close button', async () => {
    const blockId = await useTodayStore.getState().addBlock({
      title: 'Existing',
      kind: 'deep',
      durationMin: 60,
      startMin: START_MIN,
    })
    render(<BlockComposer blockId={blockId} startMin={START_MIN} onDone={() => {}} />)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined()
  })

  describe('duration validation (Phase 11 P2 field/draft/save agreement)', () => {
    it('typing "5" on a deep block: below-min hint, disabled Create, footer summary agrees ("5 min"), Ctrl+Enter saves nothing', async () => {
      const onDone = vi.fn()
      render(<BlockComposer blockId={null} startMin={START_MIN} onDone={onDone} />)

      fireEvent.change(titleField(), { target: { value: 'Too short' } })
      fireEvent.change(durationField(), { target: { value: '5' } })

      expect(
        screen.getByText('Minimum duration for deep blocks is 30 min')
      ).toBeDefined()

      const createBtn = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
      expect(createBtn.disabled).toBe(true)

      // Footer summary must agree with the field — the draft holds the raw
      // unclamped 5, so the summary reads "9:00 AM – 9:05 AM · 5 min". The
      // pomodoro segment stays visible with the preserved target (default
      // 1): the cap is no longer derived from the unsaveable transient
      // (PR #13 review), and the summary must not disagree with the draft.
      expect(screen.getByText('9:00 AM – 9:05 AM · 5 min · 1 pomodoro')).toBeDefined()

      // The keyboard path calls doSave unconditionally; the hard guard in
      // doSave must block the save just like the disabled button does.
      const dialog = screen.getByRole('dialog')
      await act(async () => {
        fireEvent.keyDown(dialog, { key: 'Enter', ctrlKey: true })
      })

      expect(onDone).not.toHaveBeenCalled()
      expect(useTodayStore.getState().blocks).toHaveLength(0)
      expect(await readBlocks(driver, DAY)).toHaveLength(0)
    })

    it('typing "1h30": no duration hint, summary shows the 90-minute form, Create enabled, save persists 90', async () => {
      const onDone = vi.fn()
      render(<BlockComposer blockId={null} startMin={START_MIN} onDone={onDone} />)

      fireEvent.change(titleField(), { target: { value: 'Long haul' } })
      fireEvent.change(durationField(), { target: { value: '1h30' } })

      expect(screen.queryByText(/Minimum duration/)).toBeNull()
      expect(screen.queryByText(/Try 90, 1\.5h, or 1h30/)).toBeNull()

      // 90 minutes formatted the long way; pomodoros carry over from the
      // default draft (1), so the summary includes the pomodoro segment.
      expect(screen.getByText('9:00 AM – 10:30 AM · 1 h 30 m · 1 pomodoro')).toBeDefined()

      const createBtn = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
      expect(createBtn.disabled).toBe(false)

      await act(async () => {
        fireEvent.click(createBtn)
      })

      expect(onDone).toHaveBeenCalledTimes(1)
      const rows = await readBlocks(driver, DAY)
      expect(rows).toHaveLength(1)
      expect(rows[0].duration_min).toBe(90)
    })

    it('typing "5" then switching to the Ritual kind: hint gone, Create enabled (5 >= ritual min), save persists 5', async () => {
      const onDone = vi.fn()
      render(<BlockComposer blockId={null} startMin={START_MIN} onDone={onDone} />)

      fireEvent.change(titleField(), { target: { value: 'Quick ritual' } })
      fireEvent.change(durationField(), { target: { value: '5' } })
      expect(screen.getByText('Minimum duration for deep blocks is 30 min')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Ritual' }))

      expect(screen.queryByText(/Minimum duration/)).toBeNull()
      // The kind switch keeps the duration (5 >= ritual's 5-min floor), so
      // the field is not rewritten.
      expect((durationField() as HTMLInputElement).value).toBe('5')

      const createBtn = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
      expect(createBtn.disabled).toBe(false)

      await act(async () => {
        fireEvent.click(createBtn)
      })

      expect(onDone).toHaveBeenCalledTimes(1)
      const rows = await readBlocks(driver, DAY)
      expect(rows).toHaveLength(1)
      expect(rows[0].kind).toBe('ritual')
      expect(rows[0].duration_min).toBe(5)
    })

    it('typing "5" on deep then switching to Shallow: the field is normalized to "30"', () => {
      render(<BlockComposer blockId={null} startMin={START_MIN} onDone={() => {}} />)

      fireEvent.change(durationField(), { target: { value: '5' } })
      expect((durationField() as HTMLInputElement).value).toBe('5')

      fireEvent.click(screen.getByRole('button', { name: 'Shallow' }))

      // Kind-switch normalization: max(minDurationFor('shallow'), 5) = 30,
      // and because the value changed the text field is rewritten.
      expect((durationField() as HTMLInputElement).value).toBe('30')
      expect(screen.queryByText(/Minimum duration/)).toBeNull()
    })

    it('blur with "5" on deep: field still shows "5", hint still present, save still blocked', () => {
      render(<BlockComposer blockId={null} startMin={START_MIN} onDone={() => {}} />)

      fireEvent.change(titleField(), { target: { value: 'Blur check' } })
      const field = durationField() as HTMLInputElement
      fireEvent.change(field, { target: { value: '5' } })
      fireEvent.blur(field)

      // Deliberately no onBlur rewrite: the invalid value stays visible
      // with its hint and save stays blocked.
      expect(field.value).toBe('5')
      expect(screen.getByText('Minimum duration for deep blocks is 30 min')).toBeDefined()
      expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('unparseable "abc": "Try 90, 1.5h, or 1h30" hint and Create disabled', () => {
      render(<BlockComposer blockId={null} startMin={START_MIN} onDone={() => {}} />)

      fireEvent.change(titleField(), { target: { value: 'Bad duration' } })
      fireEvent.change(durationField(), { target: { value: 'abc' } })

      expect(screen.getByText('Try 90, 1.5h, or 1h30')).toBeDefined()
      expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('edit mode: retyping the duration through a below-min transient preserves the pomodoro target (PR #13 review)', async () => {
      const blockId = await useTodayStore.getState().addBlock({
        title: 'Pomodoro keeper',
        kind: 'deep',
        durationMin: 60,
        pomodoros: 2,
        startMin: START_MIN,
      })
      expect(blockId).not.toBeNull()

      const onDone = vi.fn()
      render(<BlockComposer blockId={blockId} startMin={START_MIN} onDone={onDone} />)

      // Select-all retype, the way a user replaces a field value: the text
      // passes through the below-minimum transient "9" on the way to "90".
      fireEvent.change(durationField(), { target: { value: '9' } })

      // The transient is below-minimum (hint, blocked save) — but the block's
      // pomodoro target must survive it. The footer summary is the agreement
      // surface: it still shows the preserved target.
      expect(screen.getByText('Minimum duration for deep blocks is 30 min')).toBeDefined()
      expect(screen.getByText(/2 pomodoros/)).toBeDefined()

      fireEvent.change(durationField(), { target: { value: '90' } })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      })

      expect(onDone).toHaveBeenCalledTimes(1)
      const rows = await readBlocks(driver, DAY)
      expect(rows).toHaveLength(1)
      expect(rows[0].duration_min).toBe(90)
      // The regression this guards: deriving the pomodoro cap from the
      // transient "9" clamped the target to maxPomodoros(9) === 0, and
      // Math.min could never restore it — the save persisted 0.
      expect(rows[0].pomodoros).toBe(2)
    })

    it('edit mode: typing "5" on an existing deep block shows the hint, disables Save, and Ctrl+Enter persists nothing', async () => {
      const blockId = await useTodayStore.getState().addBlock({
        title: 'Existing deep block',
        kind: 'deep',
        durationMin: 60,
        startMin: START_MIN,
      })
      expect(blockId).not.toBeNull()

      const onDone = vi.fn()
      render(<BlockComposer blockId={blockId} startMin={START_MIN} onDone={onDone} />)

      // The field starts from the block's saved duration.
      expect((durationField() as HTMLInputElement).value).toBe('60')

      fireEvent.change(durationField(), { target: { value: '5' } })

      expect(
        screen.getByText('Minimum duration for deep blocks is 30 min')
      ).toBeDefined()
      const saveBtn = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
      expect(saveBtn.disabled).toBe(true)

      // The keyboard path must be blocked by the same hard guard in edit
      // mode: nothing persists and the composer stays open.
      const dialog = screen.getByRole('dialog')
      await act(async () => {
        fireEvent.keyDown(dialog, { key: 'Enter', ctrlKey: true })
      })

      expect(onDone).not.toHaveBeenCalled()
      const rows = await readBlocks(driver, DAY)
      expect(rows).toHaveLength(1)
      expect(rows[0].duration_min).toBe(60)
    })
  })
})

describe('ApplyTemplateConfirmModal', () => {
  it('renders the template name and the exact-count delete warning; confirm/cancel/Escape/overlay wiring', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { rerender } = render(
      <ApplyTemplateConfirmModal
        templateName="Maker Day"
        existingBlockCount={3}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    // Template name in the title, exact block count in the warning.
    expect(screen.getByText('Apply "Maker Day"?')).toBeDefined()
    expect(
      screen.getByText(/This will delete all 3 blocks already scheduled for today\./)
    ).toBeDefined()

    // Clicking inside the panel must NOT cancel.
    fireEvent.click(screen.getByText('Apply this template to today\'s schedule?'))
    expect(onCancel).not.toHaveBeenCalled()

    // "Yes, apply" fires onConfirm.
    fireEvent.click(screen.getByRole('button', { name: 'Yes, apply' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    // Singular form for exactly one existing block.
    rerender(
      <ApplyTemplateConfirmModal
        templateName="Maker Day"
        existingBlockCount={1}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    expect(
      screen.getByText(/This will delete all 1 block already scheduled for today\./)
    ).toBeDefined()

    // Cancel button fires onCancel.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    // Escape on the dialog fires onCancel.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)

    // Clicking the overlay (outside the panel) fires onCancel. The overlay
    // is the dialog's parent div with the onClick={onCancel} handler.
    const dialog = screen.getByRole('dialog')
    const overlay = dialog.parentElement!
    fireEvent.click(overlay)
    expect(onCancel).toHaveBeenCalledTimes(3)
  })
})
