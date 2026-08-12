import { useState } from 'react'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { useTodayBlocks } from '../../stores/useTodayBlocks'
import { blockProgress } from '../../lib/today'
import { formatDuration } from '../../lib/time'
import { isEmptyNote } from '../../lib/richText'
import type { DayBlock } from '../../db/types'
import type { BlockState } from '../../lib/today'
import { useAppStore } from '../../stores/app'
import { NotePencil } from '@phosphor-icons/react/dist/csr/NotePencil'

interface TimelineBlockProps {
  block: DayBlock
  height: number
  state: BlockState
  nowMin: number
  onEdit: () => void
  /** Minutes this block overlaps its predecessor, if any (see `conflicts()`). */
  overlapMin?: number
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
  dragTarget?: boolean
  /**
   * When provided (Today does), the NotePencil button selects this block in
   * the inline notes panel instead of opening `PlanPanel`. Left undefined so
   * this component stays reusable for the Phase 8 week grid, where it keeps
   * the original `openPlan` behaviour.
   */
  onSelectNotes?: (blockId: number) => void
  /** Applies `.timeline-block-selected` — shows which block the notes panel is bound to. */
  selected?: boolean
}

const NUDGE_MIN = 5

export function TimelineBlock({
  block,
  height,
  state,
  nowMin,
  onEdit,
  overlapMin,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragTarget = false,
  onSelectNotes,
  selected = false,
}: TimelineBlockProps) {
  const toggleCompleted = useBlocksStore((s) => s.toggleCompleted)
  const removeBlock = useBlocksStore((s) => s.removeBlock)
  const move = useBlocksStore((s) => s.move)
  const nudgeBlock = useBlocksStore((s) => s.nudgeBlock)
  const blocks = useTodayBlocks()
  const day = useDayStore((s) => s.currentDay)
  const openPlan = useAppStore((s) => s.openPlan)

  // Whether nudging this block ripples the shift to later blocks (default)
  // or is confined to just this block. Per-block so different blocks can be
  // nudged independently without the toggle "sticking".
  const [ripple, setRipple] = useState(true)

  const index = blocks.findIndex((b) => b.id === block.id)
  const isFirst = index === 0
  const isLast = index === blocks.length - 1

  const isCompact = height < 48
  let progress: ReturnType<typeof blockProgress> | null = null
  if (state === 'active') {
    progress = blockProgress(block, nowMin)
  }

  const classNames = [
    'timeline-block',
    `timeline-block-${state}`,
    isCompact && 'timeline-block-compact',
    overlapMin !== undefined && 'timeline-block-conflict',
    dragTarget && 'timeline-block-drag-target',
    selected && 'timeline-block-selected',
  ]
    .filter(Boolean)
    .join(' ')

  const handleToggle = () => toggleCompleted(day, block.id)
  const handleMoveUp = () => move(day, block.id, -1)
  const handleMoveDown = () => move(day, block.id, 1)
  const handleDelete = () => removeBlock(day, block.id)
  const handleNudgeEarlier = () => nudgeBlock(day, block.id, -NUDGE_MIN, ripple)
  const handleNudgeLater = () => nudgeBlock(day, block.id, NUDGE_MIN, ripple)

  return (
    <div className={classNames} style={{ height: `${height}px` }} onDragOver={(event) => { event.preventDefault(); onDragOver?.() }} onDrop={(event) => { event.preventDefault(); onDrop?.() }}>
      {isCompact ? (
        // Compact layout: single row
        <div className="timeline-block-compact-inner">
          <div className="timeline-block-left">
            <button
              className="timeline-checkbox"
              onClick={handleToggle}
              aria-label={`Toggle ${block.title} completion`}
              title={block.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              {block.completed && (
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path d="M1.2 4.2l1.9 1.9L6.8 2.3" />
                </svg>
              )}
            </button>
            <span className="timeline-block-title">{block.title}</span>
            {overlapMin !== undefined && (
              <span className="timeline-conflict-badge" role="alert">
                Overlaps by {overlapMin} min
              </span>
            )}
          </div>
          <span className="timeline-block-duration">{formatDuration(block.durationMin)}</span>
        </div>
      ) : (
        // Tall layout: stacked
        <div className="timeline-block-tall-inner">
          <div className="timeline-block-header">
            <div>
              {state === 'active' && (
                <div className="timeline-block-status">
                  <span className="status-dot" />
                  <span className="status-label">IN SESSION</span>
                </div>
              )}
              <div className="timeline-block-title">{block.title}</div>
              <div className="timeline-block-meta">{block.kind} · {block.pomodoros} pomodoros</div>
              {overlapMin !== undefined && (
                <div className="timeline-conflict-badge" role="alert">
                  Overlaps previous block by {overlapMin} min
                </div>
              )}
            </div>
            <span className="timeline-block-duration">{formatDuration(block.durationMin)}</span>
          </div>

          {progress && (
            <div className="timeline-block-progress">
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
              <div className="progress-text">
                <span>{progress.elapsedMin} min elapsed</span>
                <span>{progress.remainingMin} min left</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls overlay */}
      <div className="timeline-block-controls">
        <button type="button" className="timeline-drag-handle" draggable onDragStart={(event) => { event.stopPropagation(); onDragStart?.() }} onDragEnd={onDragEnd} aria-label={`Drag ${block.title}`} title="Drag to reorder">⠿</button>
        <button
          className={`btn-icon${ripple ? ' btn-icon-active' : ''}`}
          onClick={() => setRipple((r) => !r)}
          aria-pressed={ripple}
          aria-label={`${ripple ? 'Disable' : 'Enable'} ripple to later blocks when nudging ${block.title}`}
          title={ripple ? 'Nudging ripples to later blocks' : 'Nudging affects only this block'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M2 7c1.5-2 3-3 5-3s3.5 1 5 3c-1.5 2-3 3-5 3s-3.5-1-5-3z" />
            <circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button
          className="btn-icon"
          onClick={() => {
            if (onSelectNotes) onSelectNotes(block.id)
            else openPlan(block.taskId ? { kind: 'task', id: block.taskId } : { kind: 'block', id: block.id })
          }}
          aria-label={onSelectNotes ? `Show notes for ${block.title}` : `Open plan for ${block.title}`}
          title={onSelectNotes ? 'Show notes' : 'Open plan'}
        >
          <NotePencil size={14} weight={isEmptyNote(block.note) ? 'regular' : 'fill'} />
        </button>
        <button
          className="btn-icon"
          onClick={handleNudgeEarlier}
          aria-label={`Nudge ${block.title} 5 minutes earlier`}
          title="Nudge 5 min earlier"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M9 3L5 7l4 4" />
          </svg>
        </button>
        <button
          className="btn-icon"
          onClick={handleNudgeLater}
          aria-label={`Nudge ${block.title} 5 minutes later`}
          title="Nudge 5 min later"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M5 3l4 4-4 4" />
          </svg>
        </button>
        <button
          className="btn-icon"
          onClick={handleMoveUp}
          disabled={isFirst}
          aria-label={`Move ${block.title} up`}
          title="Move up"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M7 11L2 6h10z" />
          </svg>
        </button>
        <button
          className="btn-icon"
          onClick={handleMoveDown}
          disabled={isLast}
          aria-label={`Move ${block.title} down`}
          title="Move down"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M7 3l5 5H2z" />
          </svg>
        </button>
        <button
          className="btn-icon"
          onClick={onEdit}
          aria-label={`Edit ${block.title}`}
          title="Edit"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M1 13h3l8-8-3-3-8 8v3z" />
            <path d="M10 4l3-3" />
          </svg>
        </button>
        <button
          className="btn-icon btn-danger"
          onClick={handleDelete}
          aria-label={`Delete ${block.title}`}
          title="Delete"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M2 3h10M5 6v5M9 6v5M3 3l1 9c0 .5.5 1 1 1h4c.5 0 1-.5 1-1l1-9" />
          </svg>
        </button>
      </div>
    </div>
  )
}
