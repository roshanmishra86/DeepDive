import { useTasksStore } from '../../stores/tasks'
import type { TodoNavFilter } from '../../lib/todo'
import { Tray } from '@phosphor-icons/react/dist/csr/Tray'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { WarningCircle } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { CalendarX } from '@phosphor-icons/react/dist/csr/CalendarX'
import { Archive } from '@phosphor-icons/react/dist/csr/Archive'
import { Hourglass } from '@phosphor-icons/react/dist/csr/Hourglass'
import { Folder } from '@phosphor-icons/react/dist/csr/Folder'
import { At } from '@phosphor-icons/react/dist/csr/At'
import { Tag } from '@phosphor-icons/react/dist/csr/Tag'

interface FilterItem {
  id: TodoNavFilter
  label: string
  icon: React.ReactElement
}

const FILTER_ITEMS: FilterItem[] = [
  { id: 'all', label: 'All tasks', icon: <Tray size={14} /> },
  { id: 'starred', label: 'Starred', icon: <Star size={14} /> },
  { id: 'today', label: 'Today', icon: <Clock size={14} /> },
  { id: 'overdue', label: 'Overdue', icon: <WarningCircle size={14} /> },
  { id: 'no_date', label: 'No date', icon: <CalendarX size={14} /> },
  { id: 'someday', label: 'Someday', icon: <Archive size={14} /> },
  { id: 'waiting_for', label: 'Waiting for', icon: <Hourglass size={14} /> },
  { id: 'projects', label: 'Projects', icon: <Folder size={14} /> },
  { id: 'contexts', label: 'Contexts', icon: <At size={14} /> },
  { id: 'tags', label: 'Tags', icon: <Tag size={14} /> },
]

export function TodoSidebarFilter() {
  const activeFilter = useTasksStore((s) => s.activeGtdFilter)
  const setActiveFilter = useTasksStore((s) => s.setActiveGtdFilter)

  return (
    <div className="sidebar-section">
      <div className="sidebar-label">Filters</div>
      <div className="todo-sidebar-filters">
        {FILTER_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`todo-sidebar-filter-item${activeFilter === item.id ? ' active' : ''}`}
            onClick={() => setActiveFilter(item.id)}
          >
            <span className="todo-sidebar-filter-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
