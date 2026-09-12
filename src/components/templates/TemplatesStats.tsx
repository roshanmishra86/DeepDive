import { useMemo } from 'react'
import { Stack } from '@phosphor-icons/react/dist/csr/Stack'
import { ArrowCounterClockwise } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { computeTemplateStats, type TemplateStats } from '../../lib/templates'
import type { TemplateWithStats } from '../../stores/templates'

interface TemplatesStatsProps {
  templates: TemplateWithStats[]
}

export function TemplatesStats({ templates }: TemplatesStatsProps) {
  const stats: TemplateStats = useMemo(() => {
    return computeTemplateStats(templates)
  }, [templates])

  return (
    <section className="tpl-stats-grid" aria-label="Template statistics">
      <div className="tpl-stat-card">
        <div className="tpl-stat-icon-wrap" aria-hidden="true">
          <Stack size={22} weight="duotone" />
        </div>
        <div className="tpl-stat-info">
          <span className="tpl-stat-number">{stats.totalTemplates}</span>
          <span className="tpl-stat-label">templates</span>
          <span className="tpl-stat-sublabel">saved in your library</span>
        </div>
      </div>

      <div className="tpl-stat-card">
        <div className="tpl-stat-icon-wrap" aria-hidden="true">
          <ArrowCounterClockwise size={22} weight="bold" />
        </div>
        <div className="tpl-stat-info">
          <span className="tpl-stat-number">{stats.usedThisWeek}</span>
          <span className="tpl-stat-label">used this week</span>
          <span className="tpl-stat-sublabel">recently applied</span>
        </div>
      </div>

      <div className="tpl-stat-card">
        <div className="tpl-stat-icon-wrap" aria-hidden="true">
          <CalendarBlank size={22} weight="duotone" />
        </div>
        <div className="tpl-stat-info">
          <span className="tpl-stat-number">{stats.recurringCount}</span>
          <span className="tpl-stat-label">recurring</span>
          <span className="tpl-stat-sublabel">auto-suggested templates</span>
        </div>
      </div>

      <div className="tpl-stat-card">
        <div className="tpl-stat-icon-wrap" aria-hidden="true">
          <Star size={22} weight="duotone" />
        </div>
        <div className="tpl-stat-info">
          <span className="tpl-stat-number">{stats.favouritesCount}</span>
          <span className="tpl-stat-label">favourites</span>
          <span className="tpl-stat-sublabel">pinned for quick access</span>
        </div>
      </div>
    </section>
  )
}
