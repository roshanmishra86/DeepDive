import { useEffect, useState } from 'react'
import { useTodayStore } from '../../stores/today'
import { toDayKey } from '../../lib/time'
import { openDatabase } from '../../db/index'
import { layout, daySummary, blockState, conflicts, nextFreeStart } from '../../lib/today'
import { formatDuration, minutesToClock, parseClock } from '../../lib/time'
import { TimelineBlock } from '../today/TimelineBlock'
import { BlockComposer } from '../today/BlockComposer'
import { ApplyTemplateMenu } from '../today/ApplyTemplateMenu'
import { SaveTemplateModal } from '../templates/SaveTemplateModal'

type ComposerState =
  | { mode: 'closed' }
  | { mode: 'new'; startMin: number }
  | { mode: 'edit'; blockId: number }

export function TodayView() {
  const blocks = useTodayStore((s) => s.blocks)
  const loading = useTodayStore((s) => s.loading)
  const error = useTodayStore((s) => s.error)
  const hydrate = useTodayStore((s) => s.hydrate)
  const shutdownMin = useTodayStore((s) => s.shutdownMin)
  const setShutdown = useTodayStore((s) => s.setShutdown)

  const [nowMin, setNowMin] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })

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
        const hydrationDay = toDayKey(new Date())
        await hydrate(driver, hydrationDay)
      } catch (err) {
        console.error('Failed to hydrate today view:', err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [hydrate])

  // Update nowMin every 30s
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }, 30000)
    return () => window.clearInterval(id)
  }, [])

  const summary = daySummary(blocks)
  const conflictList = conflicts(blocks)
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

  const rows = layout(blocks)

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
