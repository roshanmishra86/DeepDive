import { useState } from 'react'
import type { Task, Subtask } from '../../db/types'
import { TodoTaskRow } from './TodoTaskRow'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { Archive } from '@phosphor-icons/react/dist/csr/Archive'
import { Folder } from '@phosphor-icons/react/dist/csr/Folder'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'

interface TodoGroupSectionProps {
  id: string
  label: string
  hint?: string
  colorTheme?: 'danger' | 'warn' | 'info' | 'muted'
  iconType?: 'star' | 'amber-star' | 'clock' | 'archive' | 'folder' | 'calendar'
  tasks: Task[]
  now: Date
  selectedTaskId: number | null
  focusedTaskId?: number | null
  expandedTaskIds: Record<number, boolean>
  subtasksByTask: Record<number, Subtask[]>
  dropTargetId?: number | null
  dragDisabledReason?: string | null
  onSelectTask: (taskId: number) => void
  onToggleExpandTask: (taskId: number) => void
  onEditTask: (taskId: number) => void
  onDragStartTask?: (taskId: number) => void
  onDragOverTask?: (taskId: number) => void
  onDropOnTask?: (taskId: number) => void
  onDragEndTask?: () => void
}

export function TodoGroupSection({
  label,
  hint,
  colorTheme = 'muted',
  iconType = 'star',
  tasks,
  now,
  selectedTaskId,
  focusedTaskId = null,
  expandedTaskIds,
  subtasksByTask,
  dropTargetId = null,
  dragDisabledReason = null,
  onSelectTask,
  onToggleExpandTask,
  onEditTask,
  onDragStartTask,
  onDragOverTask,
  onDropOnTask,
  onDragEndTask,
}: TodoGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpenTaskId, setMenuOpenTaskId] = useState<number | null>(null)

  const themeClass =
    colorTheme === 'danger'
      ? 'todo-accordion-danger'
      : colorTheme === 'warn'
      ? 'todo-accordion-warn'
      : colorTheme === 'info'
      ? 'todo-accordion-info'
      : 'todo-accordion-muted'

  const renderIcon = () => {
    switch (iconType) {
      case 'star':
        return <Star size={16} />
      case 'amber-star':
        return <Star size={16} weight="fill" />
      case 'clock':
        return <Clock size={16} />
      case 'archive':
        return <Archive size={16} />
      case 'folder':
        return <Folder size={16} />
      case 'calendar':
        return <CalendarBlank size={16} />
      default:
        return <Star size={16} />
    }
  }

  const countLabel = `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`

  return (
    <section
      className={`todo-accordion-section todo-group ${themeClass}${menuOpenTaskId !== null ? ' todo-section-menu-active' : ''}`}
      style={menuOpenTaskId !== null ? { position: 'relative', zIndex: 40 } : undefined}
    >
      <div
        className={`todo-accordion-header ${themeClass}${collapsed ? ' collapsed' : ''}`}
        onClick={() => {
          setCollapsed((prev) => !prev)
          setMenuOpenTaskId(null)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setCollapsed((prev) => !prev)
            setMenuOpenTaskId(null)
          }
        }}
      >
        <div className="todo-accordion-left">
          <span className={`todo-accordion-chevron${collapsed ? ' collapsed' : ''}`}>
            <CaretDown size={14} weight="bold" />
          </span>
          <span className="todo-accordion-icon">{renderIcon()}</span>
          <span className="todo-accordion-label">{label}</span>
          {hint && <span className="todo-accordion-hint">{hint}</span>}
        </div>

        <span className="todo-accordion-count todo-group-count">{countLabel}</span>
      </div>

      {!collapsed && (
        <div className="todo-accordion-tasks">
          {tasks.length === 0 ? (
            <div className="todo-accordion-empty">No tasks in this group</div>
          ) : (
            tasks.map((task) => (
              <TodoTaskRow
                key={task.id}
                task={task}
                now={now}
                isSelected={selectedTaskId === task.id}
                isFocused={focusedTaskId === task.id}
                isExpanded={!!expandedTaskIds[task.id]}
                isDragTarget={dropTargetId === task.id}
                dragDisabledReason={dragDisabledReason}
                subtasks={subtasksByTask[task.id] ?? []}
                menuOpen={menuOpenTaskId === task.id}
                onMenuToggle={(open) => setMenuOpenTaskId(open ? task.id : null)}
                onSelect={() => onSelectTask(task.id)}
                onToggleExpand={() => onToggleExpandTask(task.id)}
                onEdit={() => onEditTask(task.id)}
                onDragStart={() => onDragStartTask?.(task.id)}
                onDragOver={() => onDragOverTask?.(task.id)}
                onDrop={() => onDropOnTask?.(task.id)}
                onDragEnd={onDragEndTask}
              />
            ))
          )}
        </div>
      )}
    </section>
  )
}
