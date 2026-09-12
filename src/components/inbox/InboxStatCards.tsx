import type { DayBlock } from '../../db/types'
import { computeInboxMetrics, formatLoggedTime } from '../../lib/inbox'
import { Tray } from '@phosphor-icons/react/dist/csr/Tray'
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'

interface InboxStatCardsProps {
  blocks: DayBlock[]
}

export function InboxStatCards({ blocks }: InboxStatCardsProps) {
  const metrics = computeInboxMetrics(blocks)

  return (
    <div className="inbox-stats-row">
      <div className="inbox-stat-card">
        <div className="inbox-stat-icon-wrap">
          <Tray size={18} />
        </div>
        <div className="inbox-stat-info">
          <span className="inbox-stat-val">{metrics.capturedToday}</span>
          <span className="inbox-stat-label">tasks captured today</span>
        </div>
      </div>

      <div className="inbox-stat-card">
        <div className="inbox-stat-icon-wrap">
          <CheckCircle size={18} />
        </div>
        <div className="inbox-stat-info">
          <span className="inbox-stat-val">{metrics.completedToday}</span>
          <span className="inbox-stat-label">completed today</span>
        </div>
      </div>

      <div className="inbox-stat-card">
        <div className="inbox-stat-icon-wrap">
          <Clock size={18} />
        </div>
        <div className="inbox-stat-info">
          <span className="inbox-stat-val">{formatLoggedTime(metrics.focusSecLogged)}</span>
          <span className="inbox-stat-label">focus time logged</span>
        </div>
      </div>

      <div className="inbox-stat-card">
        <div className="inbox-stat-icon-wrap">
          <ArrowCounterClockwise size={18} />
        </div>
        <div className="inbox-stat-info">
          <span className="inbox-stat-val">{metrics.importedFromTodoCount}</span>
          <span className="inbox-stat-label">imported from TODO</span>
        </div>
      </div>
    </div>
  )
}
