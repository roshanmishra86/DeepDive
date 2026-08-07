import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test/nodeDriver'
import type { SqlDriver } from '../db/driver'
import * as templatesRepo from '../db/repos/templates'
import * as blocksRepo from '../db/repos/blocks'
import { useTemplatesStore } from './templates'

describe('templates store', () => {
  let driver: SqlDriver

  beforeEach(() => {
    const db = createTestDb()
    driver = db.driver
    // Reset the store singleton
    useTemplatesStore.setState({
      templates: [],
      selectedId: null,
      detail: null,
      loading: false,
      error: null,
    }, false) // merge, not replace
  })

  it('hydrates templates from the database', async () => {
    await useTemplatesStore.getState().hydrate(driver)

    const state = useTemplatesStore.getState()
    expect(state.templates.length).toBeGreaterThan(0)
    // Maker Day is seeded
    const makerDay = state.templates.find((t) => t.name === 'Maker Day')
    expect(makerDay).not.toBeUndefined()
  })

  it('selects the first template on hydrate if none is selected', async () => {
    await useTemplatesStore.getState().hydrate(driver)

    const state = useTemplatesStore.getState()
    expect(state.selectedId).not.toBeNull()
    expect(state.selectedId).toBe(1) // Maker Day is id 1 in the seeded db
  })

  it('loads template detail when selected', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id

    await useTemplatesStore.getState().select(templateId)

    const state = useTemplatesStore.getState()
    expect(state.detail?.id).toBe(templateId)
    expect(state.detail?.blocks.length).toBeGreaterThan(0)
  })

  it('creates a template and persists it', async () => {
    await useTemplatesStore.getState().hydrate(driver)

    const templateId = await useTemplatesStore.getState().createTemplate({
      name: 'New template',
      description: 'Test template',
      startMin: 480,
      weekdays: 31, // Mon-Fri
    })

    expect(templateId).not.toBeNull()
    expect(templateId).toBeGreaterThan(0) // Real id, not local

    // Verify it persisted
    const fromDb = await templatesRepo.getTemplate(driver, templateId!)
    expect(fromDb?.name).toBe('New template')
    expect(fromDb?.description).toBe('Test template')
    expect(fromDb?.startMin).toBe(480)
    expect(fromDb?.weekdays).toBe(31)
  })

  it('updates a template and persists the change', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id

    await useTemplatesStore.getState().updateTemplate(templateId, {
      name: 'Updated name',
    })

    // Verify in memory
    let state = useTemplatesStore.getState()
    const updated = state.templates.find((t) => t.id === templateId)
    expect(updated?.name).toBe('Updated name')

    // Verify in database
    const fromDb = await templatesRepo.getTemplate(driver, templateId)
    expect(fromDb?.name).toBe('Updated name')
  })

  it('toggles a weekday and persists', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id

    // Get initial weekdays value
    const initial = useTemplatesStore.getState().templates[0].weekdays

    // Toggle bit 0 (Monday)
    await useTemplatesStore.getState().setWeekday(templateId, 0)

    // Verify in memory
    let state = useTemplatesStore.getState()
    const template = state.templates.find((t) => t.id === templateId)
    expect(template?.weekdays).toBe(initial ^ 1)

    // Verify in database
    const fromDb = await templatesRepo.getTemplate(driver, templateId)
    expect(fromDb?.weekdays).toBe(initial ^ 1)
  })

  it('adds a template block and persists it', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    const blockId = await useTemplatesStore.getState().addBlock({
      title: 'New block',
      kind: 'deep',
      durationMin: 90,
    })

    expect(blockId).not.toBeNull()

    // Verify in memory
    let state = useTemplatesStore.getState()
    const block = state.detail?.blocks.find((b) => b.id === blockId)
    expect(block?.title).toBe('New block')
    expect(block?.kind).toBe('deep')

    // Verify in database
    const fromDb = await templatesRepo.getTemplate(driver, templateId)
    const dbBlock = fromDb?.blocks.find((b) => b.id === blockId)
    expect(dbBlock?.title).toBe('New block')
  })

  it('edits a template block and persists the change', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    const blockId = useTemplatesStore.getState().detail?.blocks[0].id
    if (!blockId) throw new Error('No block to edit')

    await useTemplatesStore.getState().editBlock(blockId, {
      title: 'Edited title',
      durationMin: 60,
    })

    // Verify in database
    const fromDb = await templatesRepo.getTemplate(driver, templateId)
    const dbBlock = fromDb?.blocks.find((b) => b.id === blockId)
    expect(dbBlock?.title).toBe('Edited title')
    expect(dbBlock?.durationMin).toBe(60)
  })

  it('removes a template block and persists the deletion', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    const blockCount = useTemplatesStore.getState().detail?.blocks.length ?? 0
    const blockId = useTemplatesStore.getState().detail?.blocks[0].id
    if (!blockId) throw new Error('No block to remove')

    await useTemplatesStore.getState().removeBlock(blockId)

    // Verify in memory
    let state = useTemplatesStore.getState()
    expect(state.detail?.blocks.length).toBe(blockCount - 1)

    // Verify in database
    const fromDb = await templatesRepo.getTemplate(driver, templateId)
    const dbBlock = fromDb?.blocks.find((b) => b.id === blockId)
    expect(dbBlock).toBeUndefined()
  })

  it('moves a block and persists startMin and sort changes', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    const blocks = useTemplatesStore.getState().detail?.blocks ?? []
    if (blocks.length < 2) throw new Error('Need at least 2 blocks to test move')

    const firstBlockId = blocks[0].id
    const secondBlockId = blocks[1].id
    const secondBlockDuration = blocks[1].durationMin

    // Move first block down
    await useTemplatesStore.getState().moveBlock(firstBlockId, 1)

    // Verify in memory
    let state = useTemplatesStore.getState()
    const afterMove = state.detail?.blocks
    // The second block becomes first and keeps originalDayStart = 300
    expect(afterMove?.[0].id).toBe(secondBlockId)
    expect(afterMove?.[0].startMin).toBe(300)
    // The second block now ends at 300 + 90 = 390
    // The first block moved from position 0 to 1, preserving its gap-to-predecessor (0)
    // so it starts at 390
    const movedBlock = afterMove?.find((b) => b.id === firstBlockId)
    expect(movedBlock?.startMin).toBe(300 + secondBlockDuration)

    // Verify in database
    const fromDb = await templatesRepo.getTemplate(driver, templateId)
    expect(fromDb?.blocks[0].id).toBe(secondBlockId)
  })

  it('deletes a template and updates the selection', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id

    await useTemplatesStore.getState().deleteTemplate(templateId)

    // Verify in memory
    let state = useTemplatesStore.getState()
    expect(state.templates.find((t) => t.id === templateId)).toBeUndefined()

    // Verify in database
    const fromDb = await templatesRepo.getTemplate(driver, templateId)
    expect(fromDb).toBeNull()
  })

  it('hydrate round-trip: mutate, re-hydrate from same driver, verify survival', async () => {
    // First hydration
    await useTemplatesStore.getState().hydrate(driver)
    const initialCount = useTemplatesStore.getState().templates.length

    // Create a new template
    const newId = await useTemplatesStore.getState().createTemplate({
      name: 'Hydrate test',
      description: 'Testing hydration',
      startMin: 600,
      weekdays: 15,
    })

    // Add a block to it
    await useTemplatesStore.getState().select(newId!)
    const blockId = await useTemplatesStore.getState().addBlock({
      title: 'Test block',
      kind: 'shallow',
      startMin: 600,
      durationMin: 45,
      pomodoros: 1,
    })

    // Edit the block
    await useTemplatesStore.getState().editBlock(blockId!, { title: 'Modified block' })

    // Now re-hydrate from scratch
    useTemplatesStore.setState({
      templates: [],
      selectedId: null,
      detail: null,
      loading: false,
      error: null,
    }, false)

    await useTemplatesStore.getState().hydrate(driver)

    // Verify all changes survived
    const state = useTemplatesStore.getState()
    expect(state.templates.length).toBe(initialCount + 1)

    const found = state.templates.find((t) => t.name === 'Hydrate test')
    expect(found?.description).toBe('Testing hydration')
    expect(found?.startMin).toBe(600)
    expect(found?.weekdays).toBe(15)

    // Load the detail and verify the block
    await useTemplatesStore.getState().select(newId!)
    const detail = useTemplatesStore.getState().detail
    const foundBlock = detail?.blocks.find((b) => b.title === 'Modified block')
    expect(foundBlock?.durationMin).toBe(45)
    expect(foundBlock?.pomodoros).toBe(1)
  })

  it('saves a day as a template and refreshes the list', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const initialCount = useTemplatesStore.getState().templates.length

    // Create a day with blocks
    const day = '2026-08-07'
    await templatesRepo.listTemplates(driver).then(async (templates) => {
      const makerDay = templates.find((t) => t.name === 'Maker Day')
      if (makerDay) {
        await blocksRepo.applyTemplateToDay(driver, makerDay.id, day)
      }
    })

    // Save day as template
    const newTemplateId = await useTemplatesStore.getState().saveDayAsTemplate(day, 'From day')

    expect(newTemplateId).not.toBeNull()

    // Verify list was refreshed
    const state = useTemplatesStore.getState()
    expect(state.templates.length).toBe(initialCount + 1)
    const created = state.templates.find((t) => t.id === newTemplateId)
    expect(created?.name).toBe('From day')

    // Verify it's the selected template
    expect(state.selectedId).toBe(newTemplateId)
    expect(state.detail?.name).toBe('From day')
  })

  it('handles null driver gracefully (vite dev mode)', async () => {
    await useTemplatesStore.getState().hydrate(null)

    const state = useTemplatesStore.getState()
    expect(state.templates).toEqual([])
    expect(state.loading).toBe(false)
  })

  // --- D2: list stats must never disagree with detail -----------------

  it('keeps the list row totalMin/blockCount in sync with detail after add, edit, and remove (D2)', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    const listRow = () => useTemplatesStore.getState().templates.find((t) => t.id === templateId)!
    const detailBlocks = () => useTemplatesStore.getState().detail!.blocks

    const expectRowMatchesDetail = () => {
      const row = listRow()
      const blocks = detailBlocks()
      const expectedTotal = blocks.reduce((sum, b) => sum + b.durationMin, 0)
      expect(row.totalMin).toBe(expectedTotal)
      expect(row.blockCount).toBe(blocks.length)
    }

    // After add
    const blockId = await useTemplatesStore.getState().addBlock({
      title: 'Sync check block',
      kind: 'deep',
      durationMin: 90,
    })
    expect(blockId).not.toBeNull()
    expectRowMatchesDetail()

    // After edit (duration change must move totalMin)
    await useTemplatesStore.getState().editBlock(blockId!, { durationMin: 45 })
    expectRowMatchesDetail()

    // After remove
    await useTemplatesStore.getState().removeBlock(blockId!)
    expectRowMatchesDetail()
  })

  it('createTemplate seeds the list row with zero stats matching its (empty) detail', async () => {
    await useTemplatesStore.getState().hydrate(driver)

    const id = await useTemplatesStore.getState().createTemplate({
      name: 'Fresh template',
      startMin: 480,
    })

    const row = useTemplatesStore.getState().templates.find((t) => t.id === id)
    expect(row?.totalMin).toBe(0)
    expect(row?.blockCount).toBe(0)
  })

  // --- D3: addBlock/setWeekday call the shared helpers -----------------

  it('addBlock with no explicit startMin uses nextTemplateBlockStart semantics', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    // Clear existing blocks so we control the scenario precisely
    const existing = [...useTemplatesStore.getState().detail!.blocks]
    for (const b of existing) {
      await useTemplatesStore.getState().removeBlock(b.id)
    }
    expect(useTemplatesStore.getState().detail?.blocks.length).toBe(0)

    const template = useTemplatesStore.getState().templates.find((t) => t.id === templateId)!

    // First block: no startMin -> template.startMin
    const firstId = await useTemplatesStore.getState().addBlock({
      title: 'First',
      kind: 'deep',
      durationMin: 60,
    })
    const first = useTemplatesStore.getState().detail?.blocks.find((b) => b.id === firstId)
    expect(first?.startMin).toBe(template.startMin)

    // Second block: no startMin -> end of last block
    const secondId = await useTemplatesStore.getState().addBlock({
      title: 'Second',
      kind: 'shallow',
      durationMin: 30,
    })
    const second = useTemplatesStore.getState().detail?.blocks.find((b) => b.id === secondId)
    expect(second?.startMin).toBe(template.startMin + 60)
  })

  // --- D4: templateSubtitle prefix (covered fully in lib/templates.test.ts; --------
  // this just checks the store doesn't reintroduce a second definition)

  // --- D5: setWeekday falls back to detail and errors instead of no-op --

  it('setWeekday updates via detail fallback when the id is missing from the list (D5)', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    const initialWeekdays = useTemplatesStore.getState().detail!.weekdays

    // Simulate the list row being momentarily missing, while detail is present
    useTemplatesStore.setState({
      templates: useTemplatesStore.getState().templates.filter((t) => t.id !== templateId),
    })

    await useTemplatesStore.getState().setWeekday(templateId, 0)

    const state = useTemplatesStore.getState()
    expect(state.error).toBeNull()
    expect(state.detail?.weekdays).toBe(initialWeekdays ^ 1)

    const fromDb = await templatesRepo.getTemplate(driver, templateId)
    expect(fromDb?.weekdays).toBe(initialWeekdays ^ 1)
  })

  it('setWeekday sets an error instead of silently no-opping when the id resolves to nothing', async () => {
    await useTemplatesStore.getState().hydrate(driver)

    await useTemplatesStore.getState().setWeekday(999999, 0)

    expect(useTemplatesStore.getState().error).not.toBeNull()
  })

  // --- D6: deleteTemplate never briefly shows the deleted template's detail --

  it('deleteTemplate clears detail immediately rather than reusing the deleted template detail (D6)', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templates = useTemplatesStore.getState().templates
    // Need at least 2 templates so a next selection is made
    const secondId = await useTemplatesStore.getState().createTemplate({
      name: 'Second template',
      startMin: 500,
    })
    expect(secondId).not.toBeNull()

    const firstId = templates[0].id
    await useTemplatesStore.getState().select(firstId)
    expect(useTemplatesStore.getState().detail?.id).toBe(firstId)

    // deleteTemplate is async but runs synchronously up to its first
    // `await` (the awaited `select()` call, which itself awaits a DB
    // round-trip). JS's run-to-completion semantics guarantee that by the
    // time this synchronous call returns control to us (without awaiting
    // the returned promise yet), the synchronous `set({ selectedId, detail:
    // null })` inside deleteTemplate has already run. So `detail` must be
    // null right here — never the deleted template's stale detail.
    const deletePromise = useTemplatesStore.getState().deleteTemplate(firstId)
    const midState = useTemplatesStore.getState()
    expect(midState.detail).toBeNull()

    await deletePromise

    const finalState = useTemplatesStore.getState()
    expect(finalState.templates.find((t) => t.id === firstId)).toBeUndefined()
    if (finalState.selectedId !== null) {
      expect(finalState.detail?.id).toBe(finalState.selectedId)
    }
  })

  // --- D7: removeBlock renumbers sort densely, in memory and persisted --

  it('removeBlock renumbers remaining blocks sort densely to 0..n-1, in memory and in the database (D7)', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    // Ensure at least 3 blocks to exercise a mid-sequence removal
    while ((useTemplatesStore.getState().detail?.blocks.length ?? 0) < 3) {
      await useTemplatesStore.getState().addBlock({
        title: `Filler ${useTemplatesStore.getState().detail?.blocks.length}`,
        kind: 'shallow',
        durationMin: 30,
      })
    }

    const blocksBefore = useTemplatesStore.getState().detail!.blocks
    // Remove the first block (in canonical order) to leave a gap at sort=0
    const removedId = blocksBefore[0].id
    await useTemplatesStore.getState().removeBlock(removedId)

    const blocksAfter = useTemplatesStore.getState().detail!.blocks
    const sortsInMemory = blocksAfter.map((b) => b.sort).sort((a, b) => a - b)
    expect(sortsInMemory).toEqual(blocksAfter.map((_, i) => i))

    // Verify in the database too
    const fromDb = await templatesRepo.getTemplate(driver, templateId)
    const sortsInDb = (fromDb?.blocks ?? []).map((b) => b.sort).sort((a, b) => a - b)
    expect(sortsInDb).toEqual((fromDb?.blocks ?? []).map((_, i) => i))
  })

  // --- D8: hydrate refreshes an already-selected detail ------------------

  it('hydrate re-selects and refreshes an already-selected detail rather than leaving it stale (D8)', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    // Mutate directly via the repo (bypassing the store) to simulate a
    // change that happened elsewhere, then re-hydrate with selectedId
    // still pointing at this template.
    await templatesRepo.addTemplateBlock(driver, {
      templateId,
      title: 'Added out-of-band',
      kind: 'ritual',
      startMin: 900,
      durationMin: 10,
      pomodoros: 0,
      sort: 999,
    })

    expect(useTemplatesStore.getState().selectedId).toBe(templateId)
    const beforeRehydrateBlockCount = useTemplatesStore.getState().detail?.blocks.length ?? 0

    await useTemplatesStore.getState().hydrate(driver)

    const state = useTemplatesStore.getState()
    expect(state.selectedId).toBe(templateId)
    expect(state.detail?.id).toBe(templateId)
    expect(state.detail?.blocks.length).toBe(beforeRehydrateBlockCount + 1)
    expect(state.detail?.blocks.some((b) => b.title === 'Added out-of-band')).toBe(true)
  })

  // --- P1-A (PR review): editBlock must re-stamp AND persist `sort` -----

  it('editBlock re-stamps and persists sort so a reload reflects canonical order, not the old insertion order (P1-A)', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = (await useTemplatesStore.getState().createTemplate({
      name: 'P1-A probe',
      startMin: 300,
    }))!
    await useTemplatesStore.getState().select(templateId)

    // Reproduce the reviewer's probe: blocks at 300/330/420/450/780.
    const starts = [300, 330, 420, 450, 780]
    const ids: number[] = []
    for (const startMin of starts) {
      const blockId = (await useTemplatesStore.getState().addBlock({
        title: `B${startMin}`,
        kind: 'shallow',
        startMin,
        durationMin: 20,
      }))!
      ids.push(blockId)
    }
    const firstId = ids[0] // the block currently at startMin 300

    await useTemplatesStore.getState().editBlock(firstId, { startMin: 450 })

    // Force a real DB round trip via getTemplate() (ORDER BY sort), not the
    // in-memory `detail` the mutator itself just set — a bug here would
    // only show up after a reload/re-select, exactly like the F1 defect.
    useTemplatesStore.setState({ detail: null, selectedId: null })
    await useTemplatesStore.getState().select(templateId)

    const reloaded = useTemplatesStore.getState().detail!.blocks
    // Canonical (startMin-ascending) order after the edit: 330, 420, then
    // both 450s (edited block first, tie-broken by its original position),
    // then 780. The defect rendered [450, 330, 420, 450, 780] — the OLD
    // insertion order with only the edited field's value changed in place.
    expect(reloaded.map((b) => b.startMin)).toEqual([330, 420, 450, 450, 780])
    expect(reloaded[2].id).toBe(firstId)
    // sort must be dense 0..n-1 and match this order, in the DB too.
    expect(reloaded.map((b) => b.sort)).toEqual([0, 1, 2, 3, 4])
  })

  // --- P2-B: select() must discard a stale response --------------------

  it('select() discards a stale response when selectedId moved on before it resolved (P2-B)', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const idA = useTemplatesStore.getState().templates[0].id
    const idB = (await useTemplatesStore.getState().createTemplate({
      name: 'P2-B second template',
      startMin: 400,
    }))!

    // Wrap the driver so template A's own-row query resolves slower than
    // B's — simulating two rapid selections resolving out of order (the
    // Tauri SQL pool gives no ordering guarantee across in-flight queries).
    const slowDriver: SqlDriver = {
      execute: (sql, params) => driver.execute(sql, params),
      select: async <T>(sql: string, params?: unknown[]) => {
        if (sql.startsWith('SELECT * FROM template WHERE id') && params?.[0] === idA) {
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        return driver.select<T>(sql, params)
      },
      transaction: (statements) => driver.transaction(statements),
    }
    await useTemplatesStore.getState().hydrate(slowDriver)

    // Fire both without awaiting the first — A is still in flight when B is
    // requested, and (per slowDriver above) A resolves AFTER B.
    const p1 = useTemplatesStore.getState().select(idA)
    const p2 = useTemplatesStore.getState().select(idB)
    await Promise.all([p1, p2])

    const state = useTemplatesStore.getState()
    expect(state.selectedId).toBe(idB)
    // The defect: A's stale response overwrites `detail` after landing,
    // leaving `detail` on template A's blocks while `selectedId` says B.
    expect(state.detail?.id).toBe(idB)
  })

  // --- P2-A: mutators report success/failure via return value ----------

  it('createTemplate/updateTemplate/deleteTemplate never throw; they report failure via return value and `error` (P2-A)', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id

    const failingDriver: SqlDriver = {
      execute: async () => {
        throw new Error('boom')
      },
      select: (sql, params) => driver.select(sql, params),
      transaction: async () => {
        throw new Error('boom')
      },
    }
    await useTemplatesStore.getState().hydrate(failingDriver)

    const createId = await useTemplatesStore.getState().createTemplate({
      name: 'Will fail',
      startMin: 300,
    })
    expect(createId).toBeNull()
    expect(useTemplatesStore.getState().error).toBe('boom')

    const updateOk = await useTemplatesStore.getState().updateTemplate(templateId, {
      name: 'Will fail too',
    })
    expect(updateOk).toBe(false)
    expect(useTemplatesStore.getState().error).toBe('boom')

    const deleteOk = await useTemplatesStore.getState().deleteTemplate(templateId)
    expect(deleteOk).toBe(false)
    expect(useTemplatesStore.getState().error).toBe('boom')
  })

  // --- P3: deleteTemplate restores selectedId/detail on rollback, like --
  // every other mutator, instead of only restoring `templates`. ---------

  it('deleteTemplate restores selectedId and detail (not just templates) on persistence failure (P3)', async () => {
    await useTemplatesStore.getState().hydrate(driver)
    const templateId = useTemplatesStore.getState().templates[0].id
    await useTemplatesStore.getState().select(templateId)

    // Need a second template so the optimistic delete moves selectedId.
    await useTemplatesStore.getState().createTemplate({ name: 'Second', startMin: 500 })
    await useTemplatesStore.getState().select(templateId)
    const priorDetail = useTemplatesStore.getState().detail

    const failingDriver: SqlDriver = {
      execute: async () => {
        throw new Error('delete failed')
      },
      select: (sql, params) => driver.select(sql, params),
      transaction: (statements) => driver.transaction(statements),
    }
    await useTemplatesStore.getState().hydrate(failingDriver)
    // hydrate() re-selects the current id through the (working) select()
    // path since only `execute` fails on this driver; restore selection.
    await useTemplatesStore.getState().select(templateId)

    const ok = await useTemplatesStore.getState().deleteTemplate(templateId)
    expect(ok).toBe(false)

    const state = useTemplatesStore.getState()
    // The defect: templates.find(...) is restored, but selectedId/detail
    // are left on whatever the optimistic delete moved them to.
    expect(state.selectedId).toBe(templateId)
    expect(state.detail?.id).toBe(templateId)
    expect(state.detail?.blocks.length).toBe(priorDetail?.blocks.length)
    expect(state.templates.some((t) => t.id === templateId)).toBe(true)
  })

})
