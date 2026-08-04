import { useEffect, useState } from 'react'
import { useTodayStore } from '../../stores/today'
import { toDayKey } from '../../lib/time'
import { openDatabase } from '../../db/index'
import { layout, daySummary, blockState, conflicts } from '../../lib/today'
import { formatDuration, minutesToClock } from '../../lib/time'
import { TimelineBlock } from '../today/TimelineBlock'
import { BlockEditor } from '../today/BlockEditor'
import { ApplyTemplateMenu } from '../today/ApplyTemplateMenu'

export function TodayView() {
  const blocks = useTodayStore((s) => s.blocks)
  const loading = useTodayStore((s) => s.loading)
  const error = useTodayStore((s) => s.error)
  const hydrate = useTodayStore((s) => s.hydrate)

  const [nowMin, setNowMin] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorBlockId, setEditorBlockId] = useState<number | null>(null)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)

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
  const rows = layout(blocks)
  const conflictList = conflicts(blocks)
  const overlapByBlockId = new Map(conflictList.map((c) => [c.blockId, c.overlapMin]))

  const openEditor = (blockId: number | null = null) => {
    setEditorBlockId(blockId)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditorBlockId(null)
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
        </div>
        <div className="today-actions">
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
            onClick={() => openEditor(null)}
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
      {blocks.length === 0 ? (
        <div className="view-empty">
          <div>No blocks scheduled</div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => openEditor(null)}>
              New block
            </button>
            <button className="btn-secondary" onClick={() => setTemplateMenuOpen(true)}>
              Apply template
            </button>
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
            {rows.map((row, i) => (
              row.type === 'block' ? (
                <TimelineBlock
                  key={row.block.id}
                  block={row.block}
                  height={row.height}
                  state={blockState(row.block, nowMin)}
                  nowMin={nowMin}
                  onEdit={() => openEditor(row.block.id)}
                  overlapMin={overlapByBlockId.get(row.block.id)}
                />
              ) : (
                <div
                  key={`gap-${i}`}
                  style={{
                    height: `${row.height}px`,
                    background: 'transparent',
                  }}
                />
              )
            ))}
          </div>
        </div>
      )}

      {/* Editor modal */}
      {editorOpen && (
        <BlockEditor
          blockId={editorBlockId}
          onClose={closeEditor}
        />
      )}

      {/* Template menu */}
      {templateMenuOpen && (
        <ApplyTemplateMenu
          onClose={() => setTemplateMenuOpen(false)}
        />
      )}
    </div>
  )
}
