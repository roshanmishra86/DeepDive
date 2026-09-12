import { useState } from 'react'
import type { DayBlock, InboxGroup } from '../../db/types'
import { InboxTaskRow } from './InboxTaskRow'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight'

interface InboxTaskGroupProps {
  group: InboxGroup
  title: string
  blocks: DayBlock[]
  onToggleComplete: (blockId: number) => void
  onStartFocus: (blockId: number) => void
  onStopFocus: (blockId: number) => void
  onSetGroup: (blockId: number, group: InboxGroup) => void
  onDelete: (blockId: number) => void
  onDragStart: (blockId: number) => void
  onDragOver: (targetIndex: number) => void
  onDrop: (targetGroup: InboxGroup, targetIndex: number) => void
}

export function InboxTaskGroup({
  group,
  title,
  blocks,
  onToggleComplete,
  onStartFocus,
  onStopFocus,
  onSetGroup,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: InboxTaskGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="inbox-group-section">
      <div
        className="inbox-group-header"
        onClick={() => setCollapsed(!collapsed)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {collapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
        <span>{title}</span>
        <span className="inbox-group-count">{blocks.length}</span>
      </div>

      {!collapsed && (
        <div
          className="inbox-task-list"
          onDragOver={(e) => {
            e.preventDefault()
            onDragOver(blocks.length)
          }}
          onDrop={(e) => {
            e.preventDefault()
            onDrop(group, blocks.length)
          }}
        >
          {blocks.length === 0 ? (
            <div className="inbox-empty-group-drop">
              No tasks in {title.toLowerCase()}
            </div>
          ) : (
            blocks.map((block, index) => (
              <InboxTaskRow
                key={block.id}
                block={block}
                isWorking={group === 'working'}
                onToggleComplete={() => onToggleComplete(block.id)}
                onStartFocus={() => onStartFocus(block.id)}
                onStopFocus={() => onStopFocus(block.id)}
                onSetGroup={(newGroup) => onSetGroup(block.id, newGroup)}
                onDelete={() => onDelete(block.id)}
                onDragStart={() => onDragStart(block.id)}
                onDragOver={() => onDragOver(index)}
                onDrop={() => onDrop(group, index)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
