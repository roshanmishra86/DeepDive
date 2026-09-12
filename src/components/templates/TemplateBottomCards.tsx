import { useMemo } from 'react'
import { computeCategoryBreakdown, formatLastUsed } from '../../lib/templates'
import type { TemplateWithStats } from '../../stores/templates'

interface TemplateBottomCardsProps {
  templates: TemplateWithStats[]
  onSelectTemplate: (id: number) => void
  onViewAllRecent?: () => void
}

export function TemplateBottomCards({
  templates,
  onSelectTemplate,
  onViewAllRecent,
}: TemplateBottomCardsProps) {
  // 1. Recently used templates sorted by lastUsedAt descending
  const recentlyUsed = useMemo(() => {
    const withUsed = templates.filter((t) => t.lastUsedAt !== null)
    return withUsed
      .sort((a, b) => {
        const timeA = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
        const timeB = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
        return timeB - timeA
      })
      .slice(0, 4)
  }, [templates])

  // 2. Category breakdown
  const categoryBreakdown = useMemo(() => {
    return computeCategoryBreakdown(templates)
  }, [templates])

  const totalCount = templates.length

  // Calculate SVG donut stroke offsets
  const radius = 42
  const circumference = 2 * Math.PI * radius // ~263.89

  let accumulatedOffset = 0
  const donutSegments = categoryBreakdown.map((item) => {
    const fraction = totalCount > 0 ? item.count / totalCount : 0
    const strokeDasharray = `${fraction * circumference} ${circumference}`
    const strokeDashoffset = -accumulatedOffset
    accumulatedOffset += fraction * circumference
    return {
      ...item,
      strokeDasharray,
      strokeDashoffset,
    }
  })

  return (
    <div className="tpl-bottom-analytics-grid">
      {/* Card 1: Recently Used */}
      <div className="tpl-analytics-card">
        <div className="tpl-analytics-head">
          <h3 className="tpl-analytics-title">Recently used</h3>
          <button
            type="button"
            className="tpl-analytics-all-link"
            onClick={onViewAllRecent}
          >
            All
          </button>
        </div>

        <div className="tpl-recent-list">
          {recentlyUsed.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 0' }}>
              No templates used recently.
            </div>
          ) : (
            recentlyUsed.map((t, idx) => (
              <div
                key={t.id}
                className="tpl-recent-item"
                onClick={() => onSelectTemplate(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectTemplate(t.id)
                }}
              >
                <div className="tpl-recent-left">
                  <span className="tpl-recent-num">{idx + 1}</span>
                  <span className="tpl-recent-name">{t.name}</span>
                </div>
                <span className="tpl-recent-date">{formatLastUsed(t.lastUsedAt)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Card 2: Template Categories */}
      <div className="tpl-analytics-card">
        <div className="tpl-analytics-head">
          <h3 className="tpl-analytics-title">Template categories</h3>
        </div>

        <div className="tpl-donut-layout">
          <div className="tpl-donut-wrap">
            <svg width="120" height="120" viewBox="0 0 120 120">
              {/* Background circle track */}
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke="#e7e5e4"
                strokeWidth="12"
              />
              {/* Colored Category Segments */}
              {donutSegments.map((seg) => (
                <circle
                  key={seg.category}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="12"
                  strokeDasharray={seg.strokeDasharray}
                  strokeDashoffset={seg.strokeDashoffset}
                  style={{
                    transform: 'rotate(-90deg)',
                    transformOrigin: '50% 50%',
                    transition: 'stroke-dasharray 0.3s ease',
                  }}
                />
              ))}
            </svg>

            <div className="tpl-donut-center">
              <span className="tpl-donut-center-num">{totalCount}</span>
              <span className="tpl-donut-center-label">templates</span>
            </div>
          </div>

          <div className="tpl-donut-legend">
            {categoryBreakdown.map((cat) => (
              <div key={cat.category} className="tpl-legend-row">
                <div className="tpl-legend-left">
                  <span className="tpl-legend-dot" style={{ background: cat.color }} />
                  <span className="tpl-legend-cat">{cat.label}</span>
                </div>
                <span className="tpl-legend-count">
                  {cat.count} ({cat.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card 3: How Templates Help */}
      <div className="tpl-analytics-card">
        <div className="tpl-analytics-head">
          <h3 className="tpl-analytics-title">How templates help</h3>
        </div>

        <div className="tpl-guidance-list">
          <div className="tpl-guidance-item">
            <div className="tpl-guidance-badge">1</div>
            <div className="tpl-guidance-text">
              <span className="tpl-guidance-title">Use templates for repeatable checklists</span>
              <span className="tpl-guidance-desc">Save time on routine work.</span>
            </div>
          </div>

          <div className="tpl-guidance-item">
            <div className="tpl-guidance-badge">2</div>
            <div className="tpl-guidance-text">
              <span className="tpl-guidance-title">Apply directly to Today when planning your day</span>
              <span className="tpl-guidance-desc">Turn templates into actions in one step.</span>
            </div>
          </div>

          <div className="tpl-guidance-item">
            <div className="tpl-guidance-badge">3</div>
            <div className="tpl-guidance-text">
              <span className="tpl-guidance-title">Edit tasks after apply without changing the source</span>
              <span className="tpl-guidance-desc">Keep your templates flexible and up to date.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
