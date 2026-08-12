import { useEffect, useState } from 'react'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { useTodayBlocks } from '../../stores/useTodayBlocks'
import { openDatabase } from '../../db/index'
import { layout, daySummary, blockState, conflicts, moveBlockTo, nextFreeStart } from '../../lib/today'
import { formatDuration, minutesToClock, parseClock } from '../../lib/time'
import { TimelineBlock } from '../today/TimelineBlock'
import { useDragList } from '../common/useDragList'
import { BlockComposer } from '../today/BlockComposer'
import { ApplyTemplateMenu } from '../today/ApplyTemplateMenu'
import { SaveTemplateModal } from '../templates/SaveTemplateModal'

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
        <div className="view-empty">
          <div>Loading blocks…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="today-view">
        <div className="view-empty">
          <div style={{ color: 'var(--danger)' }}>Error: {error}</div>
        </div>
      </div>
    )
  }

  const isEmptyAndClosed = blocks.length === 0 && composerState.mode === 'closed'

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
      </div>

      {/* Timeline */}
      {isEmptyAndClosed ? (
        <div className="today-timeline">
          <div className="timeline-gutter" />
          <div className="timeline-blocks">
            <button
              type="button"
              className="timeline-ghost-row"
              onClick={openNewComposer}
            >
              Add your first block — starts now at {minutesToClock(nowMin)}
            </button>
            <div style={{ marginTop: '12px' }}>
              <button className="btn-secondary" onClick={() => setTemplateMenuOpen(true)}>
                Apply template
              </button>
            </div>
          </div>
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
                />
              )
            })}
          </div>
        </div>
      )}

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
