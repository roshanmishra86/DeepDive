import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Kanban } from '@phosphor-icons/react/dist/csr/Kanban'
import { Funnel } from '@phosphor-icons/react/dist/csr/Funnel'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'

export type TodoTabId = 'all' | 'priority' | 'project' | 'deadline' | 'board' | 'completed'
export type TodoSortMode = 'priority' | 'due' | 'title'
export type TodoGroupMode = 'priority' | 'project' | 'deadline' | 'none'

interface TodoTabsProps {
  activeTab: TodoTabId
  onTabChange: (tab: TodoTabId) => void
  sortMode: TodoSortMode
  onSortChange: (sort: TodoSortMode) => void
  groupMode: TodoGroupMode
  onGroupChange: (group: TodoGroupMode) => void
  onToggleFilterMenu?: () => void
}

export function TodoTabs({
  activeTab,
  onTabChange,
  sortMode,
  onSortChange,
  groupMode,
  onGroupChange,
  onToggleFilterMenu,
}: TodoTabsProps) {
  return (
    <div className="todo-toolbar-row">
      <div className="todo-tabs-group" role="tablist" aria-label="Todo views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`todo-tab-btn${activeTab === 'all' ? ' active' : ''}`}
          onClick={() => onTabChange('all')}
        >
          All tasks
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'priority'}
          className={`todo-tab-btn${activeTab === 'priority' ? ' active' : ''}`}
          onClick={() => onTabChange('priority')}
        >
          By priority
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'project'}
          className={`todo-tab-btn${activeTab === 'project' ? ' active' : ''}`}
          onClick={() => onTabChange('project')}
        >
          By project
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'deadline'}
          className={`todo-tab-btn${activeTab === 'deadline' ? ' active' : ''}`}
          onClick={() => onTabChange('deadline')}
        >
          <CalendarBlank size={14} />
          Deadline
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'board'}
          className={`todo-tab-btn${activeTab === 'board' ? ' active' : ''}`}
          onClick={() => onTabChange('board')}
        >
          <Kanban size={14} />
          Board
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'completed'}
          className={`todo-tab-btn${activeTab === 'completed' ? ' active' : ''}`}
          onClick={() => onTabChange('completed')}
        >
          Completed
        </button>
      </div>

      <div className="todo-controls-group">
        <button
          type="button"
          className="todo-control-btn"
          onClick={onToggleFilterMenu}
          aria-label="Filter tasks"
        >
          <Funnel size={13} />
          Filter
        </button>

        <div className="todo-control-select-wrap">
          <select
            className="todo-control-select"
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value as TodoSortMode)}
            aria-label="Sort by"
          >
            <option value="priority">Sort: Priority</option>
            <option value="due">Sort: Due date</option>
            <option value="title">Sort: Title</option>
          </select>
          <CaretDown size={12} className="todo-control-select-chevron" />
        </div>

        <div className="todo-control-select-wrap">
          <select
            className="todo-control-select"
            value={groupMode}
            onChange={(e) => onGroupChange(e.target.value as TodoGroupMode)}
            aria-label="Group by"
          >
            <option value="priority">Group: Priority</option>
            <option value="project">Group: Project</option>
            <option value="deadline">Group: Deadline</option>
            <option value="none">Group: None</option>
          </select>
          <CaretDown size={12} className="todo-control-select-chevron" />
        </div>
      </div>
    </div>
  )
}
