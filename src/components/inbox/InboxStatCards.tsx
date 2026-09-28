import type { DayBlock } from '../../db/types'
import { computeInboxMetrics, formatFocusTime } from '../../lib/inbox'
import { Tray } from '@phosphor-icons/react/dist/csr/Tray'
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight'

interface InboxStatCardsProps {
  blocks: DayBlock[]
  onOpenImportTodo?: () => void
}

export function InboxStatCards({ blocks, onOpenImportTodo }: InboxStatCardsProps) {
  const metrics = computeInboxMetrics(blocks)

  return (
    <div className="inbox-stats-row">
      <div className="inbox-stat-card">
        <div className="inbox-stat-left">
          <div className="inbox-stat-icon-wrap">
            <Tray size={18} />
          </div>
          <div className="inbox-stat-info">
            <span className="inbox-stat-val">{metrics.capturedToday}</span>
            <span className="inbox-stat-label">tasks captured today</span>
          </div>
        </div>
        <CaretRight size={14} className="inbox-stat-chevron" />
      </div>

      <div className="inbox-stat-card">
        <div className="inbox-stat-left">
          <div className="inbox-stat-icon-wrap">
            <CheckCircle size={18} />
          </div>
          <div className="inbox-stat-info">
            <span className="inbox-stat-val">{metrics.completedToday}</span>
            <span className="inbox-stat-label">completed today</span>
          </div>
        </div>
        <CaretRight size={14} className="inbox-stat-chevron" />
      </div>

      <div className="inbox-stat-card">
        <div className="inbox-stat-left">
          <div className="inbox-stat-icon-wrap">
            <Clock size={18} />
          </div>
          <div className="inbox-stat-info">
            <span className="inbox-stat-val">{formatFocusTime(metrics.focusSecLogged)}</span>
            <span className="inbox-stat-label">focus time logged</span>
          </div>
        </div>
        <CaretRight size={14} className="inbox-stat-chevron" />
      </div>

      <div
        className={`inbox-stat-card ${onOpenImportTodo ? 'inbox-stat-card-clickable' : ''}`}
        onClick={onOpenImportTodo}
        role={onOpenImportTodo ? 'button' : undefined}
        tabIndex={onOpenImportTodo ? 0 : undefined}
        onKeyDown={(e) => {
          if (onOpenImportTodo && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onOpenImportTodo()
          }
        }}
      >
        <div className="inbox-stat-left">
          <div className="inbox-stat-icon-wrap">
            <ArrowCounterClockwise size={18} />
          </div>
          <div className="inbox-stat-info">
            <span className="inbox-stat-val">{metrics.importedFromTodoCount}</span>
            <span className="inbox-stat-label">imported from TODO</span>
          </div>
        </div>
        <CaretRight size={14} className="inbox-stat-chevron" />
      </div>
    </div>
  )
}

