import { useState, useMemo } from 'react'
import type { EnergyLevel, InboxGroup } from '../../db/types'
import { useTodayBlocks } from '../../stores/useTodayBlocks'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { groupInboxBlocks, sortInboxGroup, filterInboxBlocks, type InboxSortMode } from '../../lib/inbox'
import { QuickTaskInput } from '../inbox/QuickTaskInput'
import { InboxStatCards } from '../inbox/InboxStatCards'
import { InboxToolbar } from '../inbox/InboxToolbar'
import { InboxTaskGroup } from '../inbox/InboxTaskGroup'
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

  const [importTodoOpen, setImportTodoOpen] = useState(false)
  const [incompleteYesterdayOpen, setIncompleteYesterdayOpen] = useState(false)

  const { drag, start, over, clear } = useDragList<number>()

  // Filter and group blocks
  const grouped = useMemo(() => {
    // 1. Filter
    const filtered = filterInboxBlocks(blocks, {
      energy: energyFilter,
    })

    // 2. Group
    const groups = groupInboxBlocks(filtered)

    // 3. Sort each group
    return {
      working: sortInboxGroup(groups.working, sortKey),
      next: sortInboxGroup(groups.next, sortKey),
      capture: sortInboxGroup(groups.capture, sortKey),
      waiting: sortInboxGroup(groups.waiting, sortKey),
    }
  }, [blocks, energyFilter, sortKey])

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

      <InboxStatCards blocks={blocks} />

      <InboxToolbar
        onOpenImportTodo={() => setImportTodoOpen(true)}
        onOpenIncompleteYesterday={() => setIncompleteYesterdayOpen(true)}
        onShutdownDay={() => void handleShutdown()}
        sortKey={sortKey}
        onSortChange={setSortKey}
        energyFilter={energyFilter}
        onEnergyFilterChange={setEnergyFilter}
      />

      <div className="inbox-groups-container">
        <InboxTaskGroup
          group="working"
          title="Working Now"
          blocks={grouped.working}
          onToggleComplete={(id) => void toggleCompleted(currentDay, id)}
          onStartFocus={(id) => void startFocusOnBlock(currentDay, id)}
          onStopFocus={(id) => void stopFocusOnBlock(currentDay, id)}
          onSetGroup={(id, group) => void setInboxGroup(currentDay, id, group)}
          onDelete={(id) => void removeBlock(currentDay, id)}
          onDragStart={start}
          onDragOver={over}
          onDrop={(grp, idx) => void handleDrop(grp, idx)}
        />

        <InboxTaskGroup
          group="next"
          title="Do Next"
          blocks={grouped.next}
          onToggleComplete={(id) => void toggleCompleted(currentDay, id)}
          onStartFocus={(id) => void startFocusOnBlock(currentDay, id)}
          onStopFocus={(id) => void stopFocusOnBlock(currentDay, id)}
          onSetGroup={(id, group) => void setInboxGroup(currentDay, id, group)}
          onDelete={(id) => void removeBlock(currentDay, id)}
          onDragStart={start}
          onDragOver={over}
          onDrop={(grp, idx) => void handleDrop(grp, idx)}
        />

        <InboxTaskGroup
          group="capture"
          title="Capture"
          blocks={grouped.capture}
          onToggleComplete={(id) => void toggleCompleted(currentDay, id)}
          onStartFocus={(id) => void startFocusOnBlock(currentDay, id)}
          onStopFocus={(id) => void stopFocusOnBlock(currentDay, id)}
          onSetGroup={(id, group) => void setInboxGroup(currentDay, id, group)}
          onDelete={(id) => void removeBlock(currentDay, id)}
          onDragStart={start}
          onDragOver={over}
          onDrop={(grp, idx) => void handleDrop(grp, idx)}
        />

        <InboxTaskGroup
          group="waiting"
          title="Waiting / Later"
          blocks={grouped.waiting}
          onToggleComplete={(id) => void toggleCompleted(currentDay, id)}
          onStartFocus={(id) => void startFocusOnBlock(currentDay, id)}
          onStopFocus={(id) => void stopFocusOnBlock(currentDay, id)}
          onSetGroup={(id, group) => void setInboxGroup(currentDay, id, group)}
          onDelete={(id) => void removeBlock(currentDay, id)}
          onDragStart={start}
          onDragOver={over}
          onDrop={(grp, idx) => void handleDrop(grp, idx)}
        />
      </div>

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
