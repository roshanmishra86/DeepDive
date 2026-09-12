import type { EnergyLevel } from '../../db/types'
import type { InboxSortMode } from '../../lib/inbox'
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { Power } from '@phosphor-icons/react/dist/csr/Power'

interface InboxToolbarProps {
  onOpenImportTodo: () => void
  onOpenIncompleteYesterday: () => void
  onShutdownDay: () => void
  sortKey: InboxSortMode
  onSortChange: (sort: InboxSortMode) => void
  energyFilter: EnergyLevel | 'all'
  onEnergyFilterChange: (energy: EnergyLevel | 'all') => void
}

export function InboxToolbar({
  onOpenImportTodo,
  onOpenIncompleteYesterday,
  onShutdownDay,
  sortKey,
  onSortChange,
  energyFilter,
  onEnergyFilterChange,
}: InboxToolbarProps) {
  return (
    <div className="inbox-toolbar">
      <div className="inbox-toolbar-left">
        <button
          type="button"
          className="inbox-toolbar-btn"
          onClick={onOpenImportTodo}
        >
          <ArrowRight size={14} />
          <span>Import from TODO</span>
        </button>

        <button
          type="button"
          className="inbox-toolbar-btn"
          onClick={onOpenIncompleteYesterday}
        >
          <Clock size={14} />
          <span>Show incomplete from yesterday</span>
        </button>

        <button
          type="button"
          className="inbox-toolbar-shutdown-btn"
          onClick={onShutdownDay}
          title="Sweep unfinished tasks to TODO and close today"
        >
          <Power size={14} />
          <span>Shut down day</span>
        </button>
      </div>

      <div className="inbox-toolbar-right">
        <select
          className="inbox-dropdown-select"
          value={energyFilter}
          onChange={(e) => onEnergyFilterChange(e.target.value as EnergyLevel | 'all')}
          aria-label="Filter by energy"
        >
          <option value="all">Filter: All</option>
          <option value="high">Energy: High</option>
          <option value="medium">Energy: Medium</option>
          <option value="low">Energy: Low</option>
        </select>

        <select
          className="inbox-dropdown-select"
          value={sortKey}
          onChange={(e) => onSortChange(e.target.value as InboxSortMode)}
          aria-label="Sort tasks"
        >
          <option value="added">Sort: Added</option>
          <option value="estimate">Sort: Estimate</option>
          <option value="energy">Sort: Energy</option>
          <option value="title">Sort: Alphabetical</option>
        </select>
      </div>
    </div>
  )
}
