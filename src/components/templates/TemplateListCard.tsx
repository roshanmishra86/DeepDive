import { formatDuration } from '../../lib/time'
import { activeWeekdays } from '../../lib/templates'
import type { TemplateWithStats } from '../../stores/templates'
import { Copy } from '@phosphor-icons/react/dist/csr/Copy'

interface TemplateListCardProps {
  template: TemplateWithStats
  isSelected: boolean
  onSelect: () => void
  onDuplicate: () => void
}

export function TemplateListCard({ template, isSelected, onSelect, onDuplicate }: TemplateListCardProps) {
  const active = activeWeekdays(template.weekdays)

  return (
    <div className="tpl-card-wrap">
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
      <button
        type="button"
        className="tpl-card-duplicate"
        onClick={(e) => {
          // Card button is a sibling, not a parent, so this isn't strictly
          // needed for bubbling — kept anyway so a future nesting change
          // can't silently make this also trigger onSelect.
          e.stopPropagation()
          onDuplicate()
        }}
        aria-label={`Duplicate ${template.name}`}
        data-testid={`tpl-duplicate-${template.id}`}
      >
        <Copy size={13} />
      </button>
    </div>
  )
}
