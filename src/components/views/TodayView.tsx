import { useEffect, useRef, useState } from 'react'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { useTodayBlocks } from '../../stores/useTodayBlocks'
import { openDatabase } from '../../db/index'
import { layout, daySummary, blockState, conflicts, moveBlockTo, nextFreeStart } from '../../lib/today'
import { formatDuration, minutesToClock, parseClock, fromDayKey } from '../../lib/time'
import { TimelineBlock } from '../today/TimelineBlock'
import { BlockNotesPanel } from '../today/BlockNotesPanel'
import { useDragList } from '../common/useDragList'
import { BlockComposer } from '../today/BlockComposer'
import { ApplyTemplateMenu } from '../today/ApplyTemplateMenu'
import { SaveTemplateModal } from '../templates/SaveTemplateModal'
import type { DayBlock } from '../../db/types'

type ComposerState =
  | { mode: 'closed' }
  | { mode: 'new'; startMin: number }
  | { mode: 'edit'; blockId: number }

export function TodayView() {
  const blocks = useTodayBlocks()
  const day = useDayStore((s) => s.currentDay)
  const loading = useBlocksStore((s) => s.loading)
  const error = useBlocksStore((s) => s.error)
  const hydrate = useBlocksStore((s) => s.hydrate)
  const shutdownMin = useDayStore((s) => s.shutdownMin)
  const setShutdown = useDayStore((s) => s.setShutdown)

  // Single app-wide clock, owned by the day store (App.tsx starts it).
  const nowMin = useDayStore((s) => s.nowMin)
  const { drag, start, over, clear } = useDragList<number>()
  const moveWithinDay = useBlocksStore((s) => s.moveWithinDay)

  const [composerState, setComposerState] = useState<ComposerState>({ mode: 'closed' })
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [shutdownEditing, setShutdownEditing] = useState(false)
  const [shutdownText, setShutdownText] = useState('')
  const isEmptyAndClosed = blocks.length === 0 && composerState.mode === 'closed'

  // --- Notes panel selection lifecycle -------------------------------------
  // See BlockNotesPanel's flush prop and the rules below; mirrors the plan's
  // five selection rules for the inline notes panel.
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const flushNotesRef = useRef<(() => Promise<boolean>) | null>(null)
  const notesFocusedRef = useRef(false)
  const prevBlocksRef = useRef<DayBlock[]>(blocks)
  const prevActiveIdRef = useRef<number | null>(null)

  useEffect(() => {
    const prevBlocks = prevBlocksRef.current
    prevBlocksRef.current = blocks
    const activeId = blocks.find((b) => blockState(b, nowMin) === 'active')?.id ?? null

    // Rule 1: seed the selection (active block, else first) whenever the
    // panel has no selection and there is something to select. Deliberately
    // NOT a one-shot "first render" guard: `useTodayBlocks()` returns the
    // frozen EMPTY array until async hydration resolves, so the very first
    // effect pass can see `blocks.length === 0` on a real app mount — a
    // guard burned on that pass would leave the panel stuck on its empty
    // state forever. Re-checking whenever `selectedBlockId` is null also
    // covers deleting the last block and later adding a new one. Not gated
    // on focus: an empty/unseeded panel has nothing pending to protect.
    if (selectedBlockId === null && blocks.length > 0) {
      prevActiveIdRef.current = activeId
      setSelectedBlockId(activeId ?? blocks[0].id)
      return
    }

    let next: number | null | undefined // undefined = no change this pass
    if (selectedBlockId !== null && !blocks.some((b) => b.id === selectedBlockId)) {
      // Rule 4: the selected block was deleted, or hydration/rollover
      // dropped it — fall back to the nearest remaining block by start
      // time (not gated by focus: the block backing the editor is gone).
      if (blocks.length === 0) {
        next = null
      } else {
        const removed = prevBlocks.find((b) => b.id === selectedBlockId)
        if (!removed) {
          next = blocks[0].id
        } else {
          let best = blocks[0]
          let bestDiff = Math.abs(best.startMin - removed.startMin)
          for (const b of blocks) {
            const diff = Math.abs(b.startMin - removed.startMin)
            if (diff < bestDiff || (diff === bestDiff && b.startMin < best.startMin)) {
              best = b
              bestDiff = diff
            }
          }
          next = best.id
        }
      }
    } else if (
      activeId !== prevActiveIdRef.current &&
      activeId !== null &&
      activeId !== selectedBlockId &&
      !notesFocusedRef.current
    ) {
      // Rule 3: follow a newly active block, but never while the notes
      // editor holds focus — a block entering session must not yank the
      // panel away from someone mid-sentence.
      next = activeId
    }

    prevActiveIdRef.current = activeId

    if (next !== undefined) {
      // Rule 5: flush any pending edit before the selection changes. Only
      // move the selection once the flush actually succeeded — a failed
      // save must not also lose the draft by yanking the editor away from
      // it, so on failure the selection (and the failed draft) stays put.
      const target = next
      void (flushNotesRef.current?.() ?? Promise.resolve(true)).then((ok) => {
        if (ok) setSelectedBlockId(target)
      })
    }
  }, [blocks, nowMin, selectedBlockId])

  const selectBlockNotes = (blockId: number) => {
    if (blockId === selectedBlockId) return
    void (flushNotesRef.current?.() ?? Promise.resolve(true)).then((ok) => {
      if (ok) setSelectedBlockId(blockId)
    })
  }

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) ?? null
  const notesNow = new Date(fromDayKey(day).getTime() + nowMin * 60000)

  // Hydrate on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        // The day key comes from the clock owner, never from a local
        // `new Date()` — that split is what produced the UTC-day-key defect.
        const { currentDay: hydrationDay, nowMin: hydrationNowMin } = useDayStore.getState()
        await useDayStore.getState().hydrate(driver, hydrationDay, hydrationNowMin)
        await hydrate(driver, [hydrationDay])
      } catch (err) {
        console.error('Failed to hydrate today view:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [hydrate])

  const sourceIndex = drag.sourceId === null ? -1 : blocks.findIndex((block) => block.id === drag.sourceId)
  const previewBlocks = sourceIndex !== -1 && drag.targetIndex !== null
    ? moveBlockTo(blocks, sourceIndex, drag.targetIndex)
    : blocks
  const previewing = previewBlocks !== blocks
  const summary = daySummary(previewBlocks)
  const conflictList = conflicts(previewBlocks)
  const overlapByBlockId = new Map(conflictList.map((c) => [c.blockId, c.overlapMin]))

  const openNewComposer = () => {
    setComposerState({ mode: 'new', startMin: nextFreeStart(blocks, nowMin, 30) })
  }

  const openEditComposer = (blockId: number) => {
    setComposerState({ mode: 'edit', blockId })
  }

  const closeComposer = () => {
    setComposerState({ mode: 'closed' })
  }

  const handleShutdownSave = async () => {
    const parsed = parseClock(shutdownText, 0)
    if (parsed !== null) {
      await setShutdown(parsed, 'day')
      setShutdownEditing(false)
    }
  }

  if (loading) {
    return (
      <div className="today-view">
        <div className="view-state" role="status">
          <div className="view-state-eyebrow">Today</div>
          <div className="view-state-title">Loading your day…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="today-view">
        <div className="view-state view-state-error" role="alert">
          <div className="view-state-eyebrow">Today</div>
          <div className="view-state-title">Could not load today’s blocks</div>
          <div className="view-state-description">{error}</div>
        </div>
      </div>
    )
  }

  const rows = layout(previewBlocks)

  return (
    <div className="today-view">
      {/* Header */}
      <div className="today-header">
        <div>
          <div className="today-title">Today's blocks</div>
          <div className="today-summary">
            {formatDuration(summary.plannedMin)} planned ·{' '}
            {formatDuration(summary.deepMin)} deep · ends{' '}
            {minutesToClock(summary.endMin)}
          </div>
          {conflictList.length > 0 && (
            <div className="today-conflict-notice" role="alert">
              {conflictList.length === 1
                ? '1 block overlaps its predecessor'
                : `${conflictList.length} blocks overlap their predecessors`}
            </div>
          )}
          {previewing && <div className="today-drag-preview" role="status">Previewing reordered schedule — drop to apply</div>}
          {previewing && shutdownMin !== null && summary.endMin > shutdownMin && (
            <div className="today-conflict-notice" role="alert">Preview ends after shutdown ({minutesToClock(shutdownMin)})</div>
          )}
          {shutdownMin !== null && (
            <div className="shutdown-control">
              {shutdownEditing ? (
                <input
                  type="text"
                  className="shutdown-input"
                  autoFocus
                  value={shutdownText}
                  onChange={(e) => setShutdownText(e.target.value)}
                  onBlur={() => void handleShutdownSave()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleShutdownSave()
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setShutdownEditing(false)
                    }
                  }}
                  aria-label="Edit today's shutdown time"
                  placeholder="8pm"
                />
              ) : (
                <button
                  type="button"
                  className="shutdown-btn"
                  onClick={() => {
                    setShutdownText(minutesToClock(shutdownMin))
                    setShutdownEditing(true)
                  }}
                  aria-label={`Shutdown time ${minutesToClock(shutdownMin)}, click to change for today`}
                >
                  shutdown {minutesToClock(shutdownMin)}
                </button>
              )}
            </div>
          )}
        </div>
        {!isEmptyAndClosed && (
          <div className="today-actions">
            <button
              className="btn-secondary"
              onClick={() => setSaveTemplateOpen(true)}
              disabled={blocks.length === 0}
              aria-label="Save today as template"
            >
              Save as template
            </button>
            <button
              className="btn-secondary"
              onClick={() => setTemplateMenuOpen(true)}
              aria-label="Apply template to today"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M4.6 3.5A3.4 3.4 0 1 1 3.5 6" />
                <path d="M3.5 2.2V6h3.4" />
              </svg>
              Apply template
            </button>
            <button
              className="btn-primary"
              onClick={openNewComposer}
              aria-label="Create new block"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M7 2.5v9M2.5 7h9" />
              </svg>
              New block
            </button>
          </div>
        )}
      </div>

      {/* Timeline + notes panel */}
      <div className="today-body">
      <div className="today-timeline-col">
      {isEmptyAndClosed ? (
        <div className="today-timeline">
          <section className="today-empty-workbench" aria-labelledby="today-empty-title">
            <div className="today-empty-index" aria-hidden="true">01</div>
            <div className="today-empty-intro">
              <div className="today-empty-eyebrow">Start here</div>
              <h2 id="today-empty-title" className="today-empty-title">Build a workable day.</h2>
              <p className="today-empty-copy">
                Set one focused block first. You can add the rest around it once the day has a centre.
              </p>
              <div className="today-empty-actions">
                <button type="button" className="btn-primary" onClick={openNewComposer}>
                  Plan a block
                </button>
                <button type="button" className="btn-secondary" onClick={() => setTemplateMenuOpen(true)}>
                  Use a template
                </button>
              </div>
              <div className="today-empty-timing">The first available start is {minutesToClock(nowMin)}.</div>
            </div>
            <ol className="today-empty-steps">
              <li><span>1</span><div><strong>Choose the work</strong><small>Name the one thing that deserves uninterrupted time.</small></div></li>
              <li><span>2</span><div><strong>Set the boundary</strong><small>Give it a start and finish so the plan can hold.</small></div></li>
              <li><span>3</span><div><strong>Begin when ready</strong><small>The focus timer will surface when your session starts.</small></div></li>
            </ol>
          </section>
        </div>
      ) : (
        <div className="today-timeline">
          {/* Time gutter */}
          <div className="timeline-gutter">
            <div className="gutter-rail" />
            <div className="gutter-times">
              {rows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    height: `${row.height}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: '14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11.5px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {row.type === 'block'
                    ? minutesToClock(row.block.startMin)
                    : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Blocks column */}
          <div className="timeline-blocks">
            {rows.map((row, i) => {
              if (row.type !== 'block') {
                return (
                  <div
                    key={`gap-${i}`}
                    style={{
                      height: `${row.height}px`,
                      background: 'transparent',
                    }}
                  />
                )
              }

              return (
                <TimelineBlock
                  key={row.block.id}
                  block={row.block}
                  height={row.height}
                  state={blockState(row.block, nowMin)}
                  nowMin={nowMin}
                  onEdit={() => openEditComposer(row.block.id)}
                  overlapMin={overlapByBlockId.get(row.block.id)}
                  onDragStart={() => start(row.block.id)}
                  onDragOver={() => over(blocks.findIndex((block) => block.id === row.block.id))}
                  onDrop={() => {
                    const targetIndex = blocks.findIndex((block) => block.id === row.block.id)
                    if (drag.sourceId !== null && targetIndex !== -1 && targetIndex !== sourceIndex) void moveWithinDay(day, drag.sourceId, targetIndex)
                    clear()
                  }}
                  onDragEnd={clear}
                  dragTarget={drag.targetIndex === blocks.findIndex((block) => block.id === row.block.id) && drag.sourceId !== row.block.id}
                  onSelectNotes={selectBlockNotes}
                  selected={row.block.id === selectedBlockId}
                />
              )
            })}
          </div>
        </div>
      )}
      </div>

      {rows.length > 0 && (
        <div className="today-notes-panel">
          <BlockNotesPanel
            block={selectedBlock}
            now={notesNow}
            flushRef={flushNotesRef}
            onFocusChange={(focused) => {
              notesFocusedRef.current = focused
            }}
          />
        </div>
      )}
      </div>

      {/* Template menu */}
      {templateMenuOpen && (
        <ApplyTemplateMenu
          onClose={() => setTemplateMenuOpen(false)}
        />
      )}

      {/* Block composer */}
      {composerState.mode !== 'closed' && (
        <BlockComposer
          key={composerState.mode === 'edit' ? composerState.blockId : 'new'}
          blockId={composerState.mode === 'edit' ? composerState.blockId : null}
          startMin={composerState.mode === 'new' ? composerState.startMin : 0}
          onDone={closeComposer}
        />
      )}

      {/* Save as template modal */}
      {saveTemplateOpen && (
        <SaveTemplateModal
          onClose={() => setSaveTemplateOpen(false)}
        />
      )}
    </div>
  )
}
