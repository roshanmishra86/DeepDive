import type { DayBlock, Task } from '../../db/types'
import type { WeekGroupBy } from '../../lib/weekPlan'
import { dayHours } from '../../lib/weekPlan'
import { fromDayKey, MONTHS } from '../../lib/time'
import { WeekBlockCard } from './WeekBlockCard'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function dayHeaderLabel(day: string): { weekday: string; date: string } {
  const d = fromDayKey(day)
  return {
    weekday: WEEKDAY_LABELS[d.getDay()],
    date: `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`,
  }
}

interface DraggingBlock {
  blockId: number
  fromDay: string
}

interface WeekDayColumnProps {
  day: string
  blocks: DayBlock[]
  tasksById: Map<number, Task>
  groupBy: WeekGroupBy
  now: Date
  isToday: boolean
  isPast: boolean
  dragging: DraggingBlock | null
  onDragStartBlock: (blockId: number, fromDay: string) => void
  onDragEndBlock: () => void
  onDropDay: (day: string) => void
  onEditBlock: (blockId: number) => void
  onAddBlock: () => void
}

export function WeekDayColumn({
  day,
  blocks,
  tasksById,
  groupBy,
  now,
  isToday,
  isPast,
  dragging,
  onDragStartBlock,
  onDragEndBlock,
  onDropDay,
  onEditBlock,
  onAddBlock,
}: WeekDayColumnProps) {
  const { weekday, date } = dayHeaderLabel(day)
  const hours = dayHours(blocks)
  const isDropTarget = dragging !== null && dragging.fromDay !== day

  return (
    <div
      className={['week-day-col', isToday && 'week-day-col-today', isPast && 'week-day-col-past'].filter(Boolean).join(' ')}
      onDragOver={(e) => {
        if (!isDropTarget) return
        e.preventDefault()
      }}
      onDrop={(e) => {
        if (!isDropTarget) return
        e.preventDefault()
        onDropDay(day)
      }}
    >
      <div className="week-day-col-header">
        <span className="week-day-col-weekday">{weekday}</span>
        <span className="week-day-col-date">{date}</span>
        <span className="week-day-col-hours">{hours.toFixed(1)} h</span>
      </div>

      <div className="week-day-col-blocks">
        {blocks.map((block) => (
          <WeekBlockCard
            key={block.id}
            block={block}
            task={block.taskId ? tasksById.get(block.taskId) ?? null : null}
            groupBy={groupBy}
            now={now}
            onEdit={() => onEditBlock(block.id)}
            draggable
            onDragStart={() => onDragStartBlock(block.id, day)}
            onDragEnd={onDragEndBlock}
          />
        ))}

        <button type="button" className="week-add-block-btn" onClick={onAddBlock}>
          <Plus size={12} />
          Add block
        </button>
      </div>
    </div>
  )
}
