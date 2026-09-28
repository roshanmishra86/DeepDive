import { useState, useMemo } from 'react'
import type { EnergyLevel, InboxGroup } from '../../db/types'
import { useTodayBlocks } from '../../stores/useTodayBlocks'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import {
  filterInboxBlocks,
  sortUnifiedInboxBlocks,
  type InboxSortMode,
} from '../../lib/inbox'
import { QuickTaskInput } from '../inbox/QuickTaskInput'
import { InboxStatCards } from '../inbox/InboxStatCards'
import { InboxToolbar } from '../inbox/InboxToolbar'
import { InboxUnifiedTaskList } from '../inbox/InboxUnifiedTaskList'
import { ImportFromTodoModal } from '../inbox/ImportFromTodoModal'
import { IncompleteYesterdayModal } from '../inbox/IncompleteYesterdayModal'
import { useDragList } from '../common/useDragList'

export function InboxView() {
  const blocks = useTodayBlocks()
  const currentDay = useDayStore((s) => s.currentDay)
  const shutdownDay = useDayStore((s) => s.shutdownDay)

  const toggleCompleted = useBlocksStore((s) => s.toggleCompleted)
  const removeBlock = useBlocksStore((s) => s.removeBlock)
  const setInboxGroup = useBlocksStore((s) => s.setInboxGroup)
  const startFocusOnBlock = useBlocksStore((s) => s.startFocusOnBlock)
  const stopFocusOnBlock = useBlocksStore((s) => s.stopFocusOnBlock)
  const moveBlockBetweenGroups = useBlocksStore((s) => s.moveBlockBetweenGroups)

  const [sortKey, setSortKey] = useState<InboxSortMode>('added')
  const [energyFilter, setEnergyFilter] = useState<EnergyLevel | 'all'>('all')
  const [completedFilter, setCompletedFilter] = useState<'all' | 'active' | 'done'>('all')
  const [activeGroup, setActiveGroup] = useState<InboxGroup | 'all'>('all')

  const [importTodoOpen, setImportTodoOpen] = useState(false)
  const [incompleteYesterdayOpen, setIncompleteYesterdayOpen] = useState(false)

  const { drag, start, over, clear } = useDragList<number>()

  // Count blocks per GTD workflow group
  const groupCounts = useMemo(() => {
    let working = 0
    let next = 0
    let capture = 0
    let waiting = 0
    for (const b of blocks) {
      const grp = b.inboxGroup ?? 'capture'
      if (grp === 'working') working++
      else if (grp === 'next') next++
      else if (grp === 'waiting') waiting++
      else capture++
    }
    return { working, next, capture, waiting }
  }, [blocks])

  // Filter and sort for the unified task list
  const displayedBlocks = useMemo(() => {
    const filtered = filterInboxBlocks(blocks, {
      energy: energyFilter,
      completed: completedFilter,
      group: activeGroup,
    })
    return sortUnifiedInboxBlocks(filtered, sortKey)
  }, [blocks, energyFilter, completedFilter, activeGroup, sortKey])

  const handleDrop = async (targetGroup: InboxGroup, targetIndex: number) => {
    if (drag.sourceId === null) return
    await moveBlockBetweenGroups(currentDay, drag.sourceId, targetGroup, targetIndex)
    clear()
  }

  const handleShutdown = async () => {
    const confirmed = window.confirm(
      'Shut down the day? All unfinished tasks will be returned to TODO, and today will be closed.'
    )
    if (confirmed) {
      await shutdownDay(currentDay)
    }
  }

  return (
    <div className="inbox-view">
      <div className="inbox-header">
        <h1 className="inbox-title">Today</h1>
        <p className="inbox-subtitle">
          Capture tasks quickly, work through them today, and send unfinished items back to TODO.
        </p>
      </div>

      <QuickTaskInput />

      <InboxStatCards
        blocks={blocks}
        onOpenImportTodo={() => setImportTodoOpen(true)}
      />

      <InboxToolbar
        onOpenImportTodo={() => setImportTodoOpen(true)}
        onOpenIncompleteYesterday={() => setIncompleteYesterdayOpen(true)}
        onShutdownDay={() => void handleShutdown()}
        sortKey={sortKey}
        onSortChange={setSortKey}
        energyFilter={energyFilter}
        onEnergyFilterChange={setEnergyFilter}
        completedFilter={completedFilter}
        onCompletedFilterChange={setCompletedFilter}
        activeGroup={activeGroup}
        onGroupChange={setActiveGroup}
        groupCounts={groupCounts}
      />

      <InboxUnifiedTaskList
        blocks={displayedBlocks}
        onToggleComplete={(id) => void toggleCompleted(currentDay, id)}
        onStartFocus={(id) => void startFocusOnBlock(currentDay, id)}
        onStopFocus={(id) => void stopFocusOnBlock(currentDay, id)}
        onSetGroup={(id, group) => void setInboxGroup(currentDay, id, group)}
        onDelete={(id) => void removeBlock(currentDay, id)}
        onDragStart={start}
        onDragOver={over}
        onDrop={(grp, idx) => void handleDrop(grp, idx)}
      />

      <div className="inbox-rollover-banner">
        <span>⇄</span>
        <span>Unfinished items will be sent back to TODO at the end of the day.</span>
      </div>

      <ImportFromTodoModal
        isOpen={importTodoOpen}
        onClose={() => setImportTodoOpen(false)}
      />

      <IncompleteYesterdayModal
        isOpen={incompleteYesterdayOpen}
        onClose={() => setIncompleteYesterdayOpen(false)}
      />
    </div>
  )
}

