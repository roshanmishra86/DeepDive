import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../stores/app'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { useTasksStore } from '../../stores/tasks'
import {
  weekDays,
  weekStats,
  allocationByKind,
  mostFocusedDay,
  mostBlocksDay,
  sortDayBlocks,
  type WeekGroupBy,
} from '../../lib/weekPlan'
import { startOfWeek, addDays, fromDayKey, toDayKey } from '../../lib/time'
import { upcomingTasks } from '../../lib/todo'
import { nextFreeStart } from '../../lib/today'
import type { Task } from '../../db/types'
import { WeekStatsRow } from '../weekplan/WeekStatsRow'
import { WeekDatePicker } from '../weekplan/WeekDatePicker'
import { WeekDayColumn } from '../weekplan/WeekDayColumn'
import { WeekAllocationDonut } from '../weekplan/WeekAllocationDonut'
import { BlockComposer } from '../today/BlockComposer'
import { Plus } from '@phosphor-icons/react/dist/csr/Plus'

type ComposerState =
  | { mode: 'closed' }
  | { mode: 'new'; day: string; startMin: number }
  | { mode: 'edit'; day: string; blockId: number }

interface DraggingBlock {
  blockId: number
  fromDay: string
}

function weekdayLabel(day: string): string {
  return fromDayKey(day).toLocaleDateString('en-US', { weekday: 'long' })
}

export function WeekPlanView() {
  const [anchorMonday, setAnchorMonday] = useState(() => startOfWeek(fromDayKey(useDayStore.getState().currentDay)))
  const [groupBy, setGroupBy] = useState<WeekGroupBy>('importance')
  const [composerState, setComposerState] = useState<ComposerState>({ mode: 'closed' })
  const [dragging, setDragging] = useState<DraggingBlock | null>(null)
  // Set the moment the user navigates to a different week (prev/next arrows).
  // Once set, the auto-advance effect below stops moving the anchor out from
  // under them — a week rollover crossing midnight must never yank the view
  // back to "this week" while someone is looking at a different one.
  const manuallyAnchored = useRef(false)

  const currentDay = useDayStore((s) => s.currentDay)
  const nowMin = useDayStore((s) => s.nowMin)
  const weeklyGoalMin = useAppStore((s) => s.weeklyGoalMin)
  const blocksByDay = useBlocksStore((s) => s.blocksByDay)
  const ensureDays = useBlocksStore((s) => s.ensureDays)
  const moveToDay = useBlocksStore((s) => s.moveToDay)
  const tasks = useTasksStore((s) => s.tasks)

  const days = useMemo(() => weekDays(anchorMonday), [anchorMonday])

  // The canonical multi-day store owns block data; this effect only ensures
  // the seven days on screen are loaded, and re-runs whenever the anchor
  // (and therefore the day span, memoized above) changes. No second cache.
  useEffect(() => {
    void ensureDays(days)
  }, [days, ensureDays])

  // Advance the anchor when the day clock crosses into a new week (e.g. left
  // open Sunday night into Monday) — but never once the user has manually
  // navigated to a different week via the prev/next arrows.
  useEffect(() => {
    if (manuallyAnchored.current) return
    const currentWeekMonday = startOfWeek(fromDayKey(currentDay))
    setAnchorMonday((prev) => (toDayKey(prev) === toDayKey(currentWeekMonday) ? prev : currentWeekMonday))
  }, [currentDay])

  // One clock, owned by the day store — rebuilt the same way TodoView does,
  // never read from `new Date()` directly.
  const now = useMemo(() => {
    const date = fromDayKey(currentDay)
    date.setMinutes(nowMin)
    return date
  }, [currentDay, nowMin])

  const tasksById = useMemo(() => new Map<number, Task>(tasks.map((t) => [t.id, t])), [tasks])

  const stats = useMemo(() => weekStats(blocksByDay, days, now), [blocksByDay, days, now])
  const allocation = useMemo(() => allocationByKind(blocksByDay, days), [blocksByDay, days])
  const focusedDay = useMemo(() => mostFocusedDay(blocksByDay, days), [blocksByDay, days])
  const busiestDay = useMemo(() => mostBlocksDay(blocksByDay, days), [blocksByDay, days])
  const weeklyFocus = useMemo(() => upcomingTasks(tasks, now, 3), [tasks, now])

  const focusedDayHours = focusedDay
    ? (blocksByDay[focusedDay] ?? []).filter((b) => b.kind === 'deep').reduce((sum, b) => sum + b.durationMin, 0) / 60
    : 0
  const busiestDayCount = busiestDay
    ? (blocksByDay[busiestDay] ?? []).filter((b) => b.kind !== 'break').length
    : 0

  // The header's "New block" button has no day of its own to anchor to, so it
  // defaults to `currentDay` — but once the user has navigated to a
  // different week, `currentDay` falls outside `days` and the block would be
  // created on a day the visible week can't show. Fall back to the first
  // visible day in that case, using the same day-key string comparison the
  // rest of this file uses (`days` and `currentDay` are already `toDayKey`
  // strings, so a direct membership check is the matching comparison).
  const headerComposerDay = days.includes(currentDay) ? currentDay : days[0]

  const openNewComposer = (day: string) => {
    const fromMin = day === currentDay ? nowMin : 0
    const startMin = nextFreeStart(blocksByDay[day] ?? [], fromMin, 30)
    setComposerState({ mode: 'new', day, startMin })
  }

  const openEditComposer = (day: string, blockId: number) => {
    setComposerState({ mode: 'edit', day, blockId })
  }

  const closeComposer = () => setComposerState({ mode: 'closed' })

  const handleDropDay = (toDay: string) => {
    if (dragging && dragging.fromDay !== toDay) {
      void moveToDay({ blockId: dragging.blockId, fromDay: dragging.fromDay, toDay })
    }
    setDragging(null)
  }

  return (
    <div className="week-view">
      <div className="week-header">
        <div>
          <h1 className="week-title">This Week</h1>
          <p className="week-subtitle">
            A visual overview of your week. Plan your time blocks and stay aligned with what matters most.
          </p>
        </div>
        <div className="week-controls">
          <div className="week-group-by">
            <span className="week-group-label">Group by</span>
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-btn${groupBy === 'importance' ? ' segmented-btn-active' : ''}`}
                onClick={() => setGroupBy('importance')}
              >
                Importance
              </button>
              <button
                type="button"
                className={`segmented-btn${groupBy === 'deadline' ? ' segmented-btn-active' : ''}`}
                onClick={() => setGroupBy('deadline')}
              >
                Deadline
              </button>
            </div>
          </div>
          <button type="button" className="btn-accent" onClick={() => openNewComposer(headerComposerDay)}>
            <Plus size={16} />
            New block
          </button>
        </div>
      </div>

      <div className="week-body">
        <WeekStatsRow stats={stats} weeklyGoalMin={weeklyGoalMin} />

        <WeekDatePicker
          anchorMonday={anchorMonday}
          todayKey={currentDay}
          onPrev={() => {
            manuallyAnchored.current = true
            setAnchorMonday((d) => addDays(d, -7))
          }}
          onNext={() => {
            manuallyAnchored.current = true
            setAnchorMonday((d) => addDays(d, 7))
          }}
        />

        <div className="week-columns">
          {days.map((day) => (
            <WeekDayColumn
              key={day}
              day={day}
              blocks={sortDayBlocks(blocksByDay[day] ?? [], groupBy, tasksById, now)}
              tasksById={tasksById}
              groupBy={groupBy}
              now={now}
              isToday={day === currentDay}
              isPast={day < currentDay}
              dragging={dragging}
              onDragStartBlock={(blockId, fromDay) => setDragging({ blockId, fromDay })}
              onDragEndBlock={() => setDragging(null)}
              onDropDay={handleDropDay}
              onEditBlock={(blockId) => openEditComposer(day, blockId)}
              onAddBlock={() => openNewComposer(day)}
            />
          ))}
        </div>

        <div className="week-footer-trio">
          <section className="week-footer-card">
            <h3 className="week-footer-title">Weekly focus</h3>
            <p className="week-footer-sub">Top priorities this week</p>
            {weeklyFocus.length === 0 ? (
              <div className="week-footer-empty">Nothing scheduled yet</div>
            ) : (
              <ol className="week-focus-list">
                {weeklyFocus.map(({ task, rankColor }, i) => (
                  <li key={task.id} className="week-focus-item">
                    <span className="week-focus-rank" style={{ color: rankColor }}>
                      {i + 1}
                    </span>
                    <span className="week-focus-title">{task.title}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="week-footer-card">
            <h3 className="week-footer-title">Time allocation</h3>
            <p className="week-footer-sub">How your time is distributed</p>
            <WeekAllocationDonut allocation={allocation} />
          </section>

          <section className="week-footer-card">
            <h3 className="week-footer-title">Weekly insights</h3>
            <ul className="week-insights-list">
              <li>
                {focusedDay
                  ? `Most focused day: ${weekdayLabel(focusedDay)} (${focusedDayHours.toFixed(1)} h)`
                  : 'No deep work logged yet this week'}
              </li>
              <li>
                {busiestDay
                  ? `Most blocks on a day: ${weekdayLabel(busiestDay)} (${busiestDayCount})`
                  : 'No blocks scheduled yet this week'}
              </li>
            </ul>
          </section>
        </div>
      </div>

      {composerState.mode !== 'closed' && (
        <BlockComposer
          key={composerState.mode === 'edit' ? `edit-${composerState.day}-${composerState.blockId}` : `new-${composerState.day}`}
          blockId={composerState.mode === 'edit' ? composerState.blockId : null}
          startMin={composerState.mode === 'new' ? composerState.startMin : 0}
          day={composerState.day}
          onDone={closeComposer}
        />
      )}
    </div>
  )
}
