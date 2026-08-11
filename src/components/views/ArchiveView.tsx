import { useEffect, useState } from 'react'
import { useArchiveStore } from '../../stores/archive'
import { useAppStore } from '../../stores/app'
import { openDatabase } from '../../db/index'
import { toDayKey } from '../../lib/time'
import { MonthCalendar } from '../archive/MonthCalendar'
import { DeepHoursHistogram } from '../archive/DeepHoursHistogram'
import { DayRecordPane } from '../archive/DayRecordPane'
import { useTasksStore } from '../../stores/tasks'
import { SubtaskList } from '../todo/SubtaskList'
import { NotePencil } from '@phosphor-icons/react/dist/csr/NotePencil'
import { ArrowUUpLeft } from '@phosphor-icons/react/dist/csr/ArrowUUpLeft'
import { effectiveTaskEstimate } from '../../lib/todo'
import { formatDuration } from '../../lib/time'
import { ConfirmActionModal } from '../common/ConfirmActionModal'

function formatArchiveTimestamp(value: string | null): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function ArchiveView() {
  const hydrate = useArchiveStore((s) => s.hydrate)
  const loading = useArchiveStore((s) => s.loading)
  const error = useArchiveStore((s) => s.error)
  const headline = useArchiveStore((s) => s.headline)
  const hasRecords = useArchiveStore((s) => s.hasRecords)
  const hasDayRecords = useArchiveStore((s) => s.hasDayRecords)
  const setView = useAppStore((s) => s.setView)
  const openPlan = useAppStore((s) => s.openPlan)
  const archivedTasks = useTasksStore((s) => s.archivedTasks)
  const hydrateArchived = useTasksStore((s) => s.hydrateArchived)
  const loadingArchived = useTasksStore((s) => s.loadingArchived)
  const errorArchived = useTasksStore((s) => s.errorArchived)
  const subtasksByTask = useTasksStore((s) => s.subtasksByTask)
  const unarchiveTask = useTasksStore((s) => s.unarchiveTask)
  const [restoreTaskId, setRestoreTaskId] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const driver = await openDatabase()
        if (!mounted) return
        const today = toDayKey(new Date())
        await Promise.all([hydrate(driver, today), hydrateArchived(driver)])
      } catch (err) {
        console.error('Failed to hydrate archive view:', err)
        // Surface DB-open failures through the store's error contract — with
        // `loading` starting true (Phase 10), a swallowed error would render
        // "Loading archive…" forever. setState merges; this matches the
        // store's own `set({ error, loading: false })` catch shape.
        if (mounted) {
          useArchiveStore.setState({ error: String(err), loading: false })
        }
      }
    })()
    return () => {
      mounted = false
    }
  }, [hydrate, hydrateArchived])

  const dayInitialLoading = loading && headline === null
  const overallEmpty = !dayInitialLoading && !loadingArchived && !error && !errorArchived && !hasRecords && archivedTasks.length === 0
  const restoreTask = archivedTasks.find((task) => task.id === restoreTaskId) ?? null

  return (
    <div className="arc-view">
      <div className="arc-header">
        <div>
          <div className="arc-title">Archive</div>
          <div className="arc-subtitle">
            Every day you planned blocks. A dot means the day has a record — open it to see what actually landed.
          </div>
        </div>

        {headline && hasDayRecords && (
          <div className="arc-headline">
            <div className="arc-stat">
              <div className="arc-stat-value">{headline.blocksDone}</div>
              <div className="arc-stat-label">Blocks done</div>
            </div>
            <div className="arc-stat">
              <div className="arc-stat-value">
                {headline.completionPct}
                <span className="arc-stat-pct">%</span>
              </div>
              <div className="arc-stat-label">Completion</div>
            </div>
            <div className="arc-stat">
              <div className="arc-stat-value">{headline.dayStreak}</div>
              <div className="arc-stat-label">Day streak</div>
            </div>
          </div>
        )}
      </div>

      <div className="arc-body">
        {loadingArchived && <div className="arc-section-status">Loading completed tasks…</div>}
        {errorArchived && <div className="arc-section-status arc-section-error">Could not load completed tasks: {errorArchived}</div>}
        {archivedTasks.length > 0 && (
          <section className="arc-task-section" aria-label="Completed tasks">
            <div className="arc-section-label">Completed tasks</div>
            {archivedTasks.map((task) => {
              const subtasks = subtasksByTask[task.id] ?? []
              const estimate = effectiveTaskEstimate(task, subtasks)
              return (
                <div className="arc-task-row" key={task.id}>
                  <div className="arc-task-main">
                    <button type="button" className="arc-task-title" onClick={() => void openPlan({ kind: 'task', id: task.id })}>{task.title}</button>
                    <span className="arc-task-meta">
                      completed {formatArchiveTimestamp(task.completedAt)} · archived {formatArchiveTimestamp(task.archivedAt)}
                      {estimate !== null && ` · ${formatDuration(estimate)} estimated`}
                      {` · ${subtasks.filter((subtask) => subtask.done).length}/${subtasks.length} subtasks`}
                    </span>
                    <SubtaskList task={task} now={new Date()} />
                  </div>
                  <div className="arc-task-actions">
                    <button type="button" className="btn-icon" onClick={() => void openPlan({ kind: 'task', id: task.id })} aria-label={`Open plan for ${task.title}`}><NotePencil size={16} weight={task.notes ? 'fill' : 'regular'} /></button>
                    <button type="button" className="btn-icon" onClick={() => setRestoreTaskId(task.id)} aria-label={`Restore ${task.title}`}><ArrowUUpLeft size={16} /></button>
                  </div>
                </div>
              )
            })}
          </section>
        )}
        {overallEmpty ? (
          <div className="view-empty">
            <div className="view-empty-title">No recorded days yet</div>
            <div className="view-empty-text">The archive fills in as you plan days — every day with blocks or a shut-down note lands here.</div>
            <button type="button" className="btn-accent arc-empty-cta" onClick={() => setView('today')}>Plan today</button>
          </div>
        ) : dayInitialLoading ? (
          <div className="arc-section-status">Loading archive…</div>
        ) : error ? (
          <div className="arc-section-status arc-section-error">Error: {error}</div>
        ) : !hasDayRecords ? (
          <div className="view-empty arc-day-empty">
            <div className="view-empty-title">No recorded days yet</div>
            <div className="view-empty-text">Plan a day to add it to the calendar archive.</div>
            <button type="button" className="btn-accent arc-empty-cta" onClick={() => setView('today')}>Plan today</button>
          </div>
        ) : (
          <>
            <div className="arc-left-column">
              <MonthCalendar />
              <DeepHoursHistogram />
            </div>
            <DayRecordPane />
          </>
        )}
      </div>
      {restoreTask && (
        <ConfirmActionModal
          title={`Restore "${restoreTask.title}"?`}
          description="This returns the completed task to TODO. Its completion time and plan will be preserved."
          confirmLabel="Restore task"
          destructive={false}
          onCancel={() => setRestoreTaskId(null)}
          onConfirm={() => { setRestoreTaskId(null); void unarchiveTask(restoreTask.id) }}
        />
      )}
    </div>
  )
}
