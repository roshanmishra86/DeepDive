import type { DayBlock, InboxGroup } from '../../db/types'
import { InboxTaskRow } from './InboxTaskRow'

interface InboxUnifiedTaskListProps {
  blocks: DayBlock[]
  onToggleComplete: (blockId: number) => void
  onStartFocus: (blockId: number) => void
  onStopFocus: (blockId: number) => void
  onSetGroup: (blockId: number, group: InboxGroup) => void
  onDelete: (blockId: number) => void
  onDragStart?: (blockId: number) => void
  onDragOver?: (targetIndex: number) => void
  onDrop?: (targetGroup: InboxGroup, targetIndex: number) => void
}

export function InboxUnifiedTaskList({
  blocks,
  onToggleComplete,
  onStartFocus,
  onStopFocus,
  onSetGroup,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: InboxUnifiedTaskListProps) {
  if (blocks.length === 0) {
    return (
      <div className="inbox-unified-list-card">
        <div className="inbox-unified-empty">
          <p className="inbox-unified-empty-title">No tasks in this view</p>
          <p className="inbox-unified-empty-subtitle">
            Tasks matching your active filter will appear here. Add a new task above or switch filters.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="inbox-unified-list-card">
      <div className="inbox-unified-rows">
        {blocks.map((block, index) => (
          <InboxTaskRow
            key={block.id}
            block={block}
            isWorking={block.inboxGroup === 'working'}
            onToggleComplete={() => onToggleComplete(block.id)}
            onStartFocus={() => onStartFocus(block.id)}
            onStopFocus={() => onStopFocus(block.id)}
            onSetGroup={(newGroup) => onSetGroup(block.id, newGroup)}
            onDelete={() => onDelete(block.id)}
            onDragStart={() => onDragStart?.(block.id)}
            onDragOver={() => onDragOver?.(index)}
            onDrop={() => onDrop?.(block.inboxGroup ?? 'capture', index)}
          />
        ))}
      </div>
    </div>
  )
}
