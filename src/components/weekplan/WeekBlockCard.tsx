import type { DayBlock, Task, BlockKind } from '../../db/types'
import type { WeekGroupBy } from '../../lib/weekPlan'
import { minutesToClock, formatDuration } from '../../lib/time'
import { formatDueLabel, quadrantOf, type Quadrant } from '../../lib/todo'

const KIND_LABELS: Record<BlockKind, string> = {
  deep: 'Deep',
  shallow: 'Shallow',
  ritual: 'Ritual',
  break: 'Break',
}

// Same category-color convention as WeekAllocationDonut (and lib/todo's
// QUADRANTS/PRIORITIES dots) — tokens reused as arbitrary category colors,
// not literal severity.
const KIND_COLORS: Record<BlockKind, string> = {
  deep: 'var(--accent)',
  shallow: 'var(--warn)',
  ritual: 'var(--danger)',
  break: 'var(--border-strong)',
}

// Short chip text for the Importance grouping — spells out which of
// important/urgent the linked task carries, mirroring the composer's own
// "Important" / "Urgent" tag labels rather than the long QUADRANTS
// sentence-style labels (those are for the TODO group header, not a card
// chip).
const QUADRANT_CHIP_LABEL: Record<Quadrant, string> = {
  do: 'Important · Urgent',
  plan: 'Important',
  delegate: 'Urgent',
  drop: 'Neither',
}

interface WeekBlockCardProps {
  block: DayBlock
  task: Task | null
  groupBy: WeekGroupBy
  now: Date
  onEdit: () => void
  draggable: boolean
  onDragStart: () => void
  onDragEnd: () => void
}

export function WeekBlockCard({ block, task, groupBy, now, onEdit, draggable, onDragStart, onDragEnd }: WeekBlockCardProps) {
  const endMin = block.startMin + block.durationMin
  const chip =
    task === null
      ? null
      : groupBy === 'importance'
        ? QUADRANT_CHIP_LABEL[quadrantOf(task)]
        : task.dueAt
          ? formatDueLabel(task.dueAt, now) || null
          : null

  // Built as an array + join (not a template literal directly in
  // `className={}`) so the `check-css-classes.mjs` static scan — which only
  // parses literal template contents, not variable-interpolated ones — does
  // not misparse the `kind`-suffixed class into a dangling literal. Matches
  // TimelineBlock's convention for the same reason.
  const cardClassName = ['week-block-card', `week-block-kind-${block.kind}`].join(' ')

  return (
    <button
      type="button"
      className={cardClassName}
      draggable={draggable}
      onDragStart={(e) => {
        e.stopPropagation()
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      aria-label={`Edit block: ${block.title}`}
    >
      <div className="week-block-card-top">
        <span className="week-block-kind-dot" style={{ backgroundColor: KIND_COLORS[block.kind] }} />
        <span className="week-block-card-title">{block.title}</span>
      </div>
      <div className="week-block-card-time">
        {minutesToClock(block.startMin)} – {minutesToClock(endMin)}
      </div>
      <div className="week-block-card-meta">
        <span className="week-block-card-duration">{formatDuration(block.durationMin)}</span>
        <span className="week-block-card-kind">{KIND_LABELS[block.kind]}</span>
        {chip && <span className="week-block-card-chip">{chip}</span>}
      </div>
    </button>
  )
}
