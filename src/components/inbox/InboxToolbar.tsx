import { useState, useRef, useEffect } from 'react'
import type { EnergyLevel, InboxGroup } from '../../db/types'
import type { InboxSortMode } from '../../lib/inbox'
import { Play } from '@phosphor-icons/react/dist/csr/Play'
import { CaretDoubleRight } from '@phosphor-icons/react/dist/csr/CaretDoubleRight'
import { Tray } from '@phosphor-icons/react/dist/csr/Tray'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { Funnel } from '@phosphor-icons/react/dist/csr/Funnel'
import { ArrowsDownUp } from '@phosphor-icons/react/dist/csr/ArrowsDownUp'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { DotsThree } from '@phosphor-icons/react/dist/csr/DotsThree'
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { Power } from '@phosphor-icons/react/dist/csr/Power'

interface InboxToolbarProps {
  onOpenImportTodo: () => void
  onOpenIncompleteYesterday: () => void
  onShutdownDay: () => void
  sortKey: InboxSortMode
  onSortChange: (sort: InboxSortMode) => void
  energyFilter: EnergyLevel | 'all'
  onEnergyFilterChange: (energy: EnergyLevel | 'all') => void
  completedFilter?: 'all' | 'active' | 'done'
  onCompletedFilterChange?: (completed: 'all' | 'active' | 'done') => void
  activeGroup?: InboxGroup | 'all'
  onGroupChange?: (group: InboxGroup | 'all') => void
  groupCounts?: {
    working: number
    next: number
    capture: number
    waiting: number
  }
}

export function InboxToolbar({
  onOpenImportTodo,
  onOpenIncompleteYesterday,
  onShutdownDay,
  sortKey,
  onSortChange,
  energyFilter,
  onEnergyFilterChange,
  completedFilter = 'all',
  onCompletedFilterChange,
  activeGroup = 'all',
  onGroupChange,
  groupCounts = { working: 0, next: 0, capture: 0, waiting: 0 },
}: InboxToolbarProps) {
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)

  const filterRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (filterRef.current && !filterRef.current.contains(target)) {
        setFilterMenuOpen(false)
      }
      if (sortRef.current && !sortRef.current.contains(target)) {
        setSortMenuOpen(false)
      }
      if (actionsRef.current && !actionsRef.current.contains(target)) {
        setActionsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleGroupClick = (group: InboxGroup) => {
    if (!onGroupChange) return
    if (activeGroup === group) {
      onGroupChange('all')
    } else {
      onGroupChange(group)
    }
  }

  const getFilterLabel = () => {
    if (energyFilter !== 'all') {
      const cap = energyFilter.charAt(0).toUpperCase() + energyFilter.slice(1)
      return `Energy: ${cap}`
    }
    if (completedFilter === 'active') return 'Filter: Active'
    if (completedFilter === 'done') return 'Filter: Done'
    return 'Filter: All'
  }

  const getSortLabel = () => {
    switch (sortKey) {
      case 'added':
        return 'Sort: Added'
      case 'estimate':
        return 'Sort: Estimate'
      case 'priority':
        return 'Sort: Energy'
      case 'title':
        return 'Sort: Alphabetical'
      default:
        return 'Sort: Added'
    }
  }

  return (
    <div className="inbox-toolbar">
      {/* Tag-based workflow state tabs */}
      <div className="inbox-workflow-tabs" role="tablist" aria-label="Workflow states">
        <button
          type="button"
          role="tab"
          aria-selected={activeGroup === 'working'}
          className={`inbox-workflow-tab ${activeGroup === 'working' ? 'inbox-workflow-tab-active' : ''}`}
          onClick={() => handleGroupClick('working')}
        >
          <Play size={11} weight="fill" />
          <span>Working Now</span>
          <span className="inbox-workflow-badge">{groupCounts.working}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeGroup === 'next'}
          className={`inbox-workflow-tab ${activeGroup === 'next' ? 'inbox-workflow-tab-active' : ''}`}
          onClick={() => handleGroupClick('next')}
        >
          <CaretDoubleRight size={12} weight="bold" />
          <span>Do Next</span>
          <span className="inbox-workflow-badge">{groupCounts.next}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeGroup === 'capture'}
          className={`inbox-workflow-tab ${activeGroup === 'capture' ? 'inbox-workflow-tab-active' : ''}`}
          onClick={() => handleGroupClick('capture')}
        >
          <Tray size={13} />
          <span>Capture</span>
          <span className="inbox-workflow-badge">{groupCounts.capture}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeGroup === 'waiting'}
          className={`inbox-workflow-tab ${activeGroup === 'waiting' ? 'inbox-workflow-tab-active' : ''}`}
          onClick={() => handleGroupClick('waiting')}
        >
          <Clock size={13} />
          <span>Waiting / Later</span>
          <span className="inbox-workflow-badge">{groupCounts.waiting}</span>
        </button>
      </div>

      {/* Filter, Sort, and Action controls */}
      <div className="inbox-toolbar-right">
        {/* Filter Dropdown */}
        <div className="inbox-dropdown-wrap" ref={filterRef}>
          <button
            type="button"
            className="inbox-pill-btn"
            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
            aria-expanded={filterMenuOpen}
            aria-label="Filter tasks"
          >
            <Funnel size={13} />
            <span>{getFilterLabel()}</span>
            <CaretDown size={11} />
          </button>

          {filterMenuOpen && (
            <div className="inbox-dropdown-menu">
              <div
                className={`inbox-dropdown-item ${energyFilter === 'all' && completedFilter === 'all' ? 'inbox-dropdown-item-active' : ''}`}
                onClick={() => {
                  onEnergyFilterChange('all')
                  onCompletedFilterChange?.('all')
                  setFilterMenuOpen(false)
                }}
              >
                Filter: All
              </div>
              <div className="inbox-dropdown-divider" />
              <div
                className={`inbox-dropdown-item ${energyFilter === 'high' ? 'inbox-dropdown-item-active' : ''}`}
                onClick={() => {
                  onEnergyFilterChange('high')
                  setFilterMenuOpen(false)
                }}
              >
                Energy: High
              </div>
              <div
                className={`inbox-dropdown-item ${energyFilter === 'medium' ? 'inbox-dropdown-item-active' : ''}`}
                onClick={() => {
                  onEnergyFilterChange('medium')
                  setFilterMenuOpen(false)
                }}
              >
                Energy: Medium
              </div>
              <div
                className={`inbox-dropdown-item ${energyFilter === 'low' ? 'inbox-dropdown-item-active' : ''}`}
                onClick={() => {
                  onEnergyFilterChange('low')
                  setFilterMenuOpen(false)
                }}
              >
                Energy: Low
              </div>
              {onCompletedFilterChange && (
                <>
                  <div className="inbox-dropdown-divider" />
                  <div
                    className={`inbox-dropdown-item ${completedFilter === 'active' ? 'inbox-dropdown-item-active' : ''}`}
                    onClick={() => {
                      onCompletedFilterChange('active')
                      setFilterMenuOpen(false)
                    }}
                  >
                    Status: Active only
                  </div>
                  <div
                    className={`inbox-dropdown-item ${completedFilter === 'done' ? 'inbox-dropdown-item-active' : ''}`}
                    onClick={() => {
                      onCompletedFilterChange('done')
                      setFilterMenuOpen(false)
                    }}
                  >
                    Status: Completed only
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="inbox-dropdown-wrap" ref={sortRef}>
          <button
            type="button"
            className="inbox-pill-btn"
            onClick={() => setSortMenuOpen(!sortMenuOpen)}
            aria-expanded={sortMenuOpen}
            aria-label="Sort tasks"
          >
            <ArrowsDownUp size={13} />
            <span>{getSortLabel()}</span>
            <CaretDown size={11} />
          </button>

          {sortMenuOpen && (
            <div className="inbox-dropdown-menu">
              <div
                className={`inbox-dropdown-item ${sortKey === 'added' ? 'inbox-dropdown-item-active' : ''}`}
                onClick={() => {
                  onSortChange('added')
                  setSortMenuOpen(false)
                }}
              >
                Sort: Added
              </div>
              <div
                className={`inbox-dropdown-item ${sortKey === 'priority' ? 'inbox-dropdown-item-active' : ''}`}
                onClick={() => {
                  onSortChange('priority')
                  setSortMenuOpen(false)
                }}
              >
                Sort: Energy (Priority)
              </div>
              <div
                className={`inbox-dropdown-item ${sortKey === 'estimate' ? 'inbox-dropdown-item-active' : ''}`}
                onClick={() => {
                  onSortChange('estimate')
                  setSortMenuOpen(false)
                }}
              >
                Sort: Estimate (Duration)
              </div>
              <div
                className={`inbox-dropdown-item ${sortKey === 'title' ? 'inbox-dropdown-item-active' : ''}`}
                onClick={() => {
                  onSortChange('title')
                  setSortMenuOpen(false)
                }}
              >
                Sort: Alphabetical
              </div>
            </div>
          )}
        </div>

        {/* Actions Menu */}
        <div className="inbox-dropdown-wrap" ref={actionsRef}>
          <button
            type="button"
            className="inbox-pill-btn inbox-actions-menu-btn"
            onClick={() => setActionsMenuOpen(!actionsMenuOpen)}
            aria-expanded={actionsMenuOpen}
            aria-label="More actions"
            title="Today actions"
          >
            <DotsThree size={18} weight="bold" />
          </button>

          {actionsMenuOpen && (
            <div className="inbox-dropdown-menu inbox-dropdown-menu-right">
              <div
                className="inbox-dropdown-item"
                onClick={() => {
                  onOpenImportTodo()
                  setActionsMenuOpen(false)
                }}
              >
                <ArrowRight size={13} />
                <span>Import from TODO</span>
              </div>
              <div
                className="inbox-dropdown-item"
                onClick={() => {
                  onOpenIncompleteYesterday()
                  setActionsMenuOpen(false)
                }}
              >
                <Clock size={13} />
                <span>Show incomplete from yesterday</span>
              </div>
              <div className="inbox-dropdown-divider" />
              <div
                className="inbox-dropdown-item inbox-dropdown-item-danger"
                onClick={() => {
                  onShutdownDay()
                  setActionsMenuOpen(false)
                }}
              >
                <Power size={13} />
                <span>Shut down day</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

