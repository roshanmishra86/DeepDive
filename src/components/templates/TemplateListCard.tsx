import { formatDuration } from '../../lib/time'
import { activeWeekdays } from '../../lib/templates'
import type { TemplateWithStats } from '../../stores/templates'

interface TemplateListCardProps {
  template: TemplateWithStats
  isSelected: boolean
  onSelect: () => void
}

export function TemplateListCard({ template, isSelected, onSelect }: TemplateListCardProps) {
  const active = activeWeekdays(template.weekdays)

  return (
    <button
      className={`tpl-card ${isSelected ? 'tpl-card-active' : ''}`}
      onClick={onSelect}
      aria-label={`${template.name} template`}
      type="button"
    >
      <div className="tpl-card-header">
        <span className="tpl-card-name">{template.name}</span>
        <span className="tpl-card-duration">{formatDuration(template.totalMin)}</span>
      </div>
      <div className="tpl-card-description">
        {template.blockCount === 0
          ? 'No blocks'
          : template.blockCount === 1
            ? '1 block'
            : `${template.blockCount} blocks`}
        {template.description && ` · ${template.description}`}
      </div>
      <div className="tpl-card-weekdays">
        {active.length === 0 ? (
          <span className="tpl-weekday-chip tpl-weekday-inactive">No repeat</span>
        ) : (
          active.map((day) => (
            <span key={day.bit} className="tpl-weekday-chip tpl-weekday-active">
              {day.short}
            </span>
          ))
        )}
      </div>
    </button>
  )
}
