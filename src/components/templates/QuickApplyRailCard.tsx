import { useState, useMemo } from 'react'
import { useTemplatesStore } from '../../stores/templates'
import { useDayStore } from '../../stores/day'
import { formatLastUsed } from '../../lib/templates'

export function QuickApplyRailCard() {
  const templates = useTemplatesStore((s) => s.templates)
  const applyTemplateGtd = useTemplatesStore((s) => s.applyTemplateGtd)
  const select = useTemplatesStore((s) => s.select)
  const currentDay = useDayStore((s) => s.currentDay)

  const [selectedTplId, setSelectedTplId] = useState<string>('')
  const [applying, setApplying] = useState(false)

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

  const handleApply = async () => {
    if (!selectedTplId) return
    const id = Number(selectedTplId)
    if (Number.isNaN(id)) return

    setApplying(true)
    try {
      await applyTemplateGtd(id, 'inbox', currentDay)
      setSelectedTplId('')
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      {/* Quick Apply Card */}
      <div className="tpl-rail-widget">
        <div className="tpl-rail-head">
          <span className="tpl-rail-title">Quick apply</span>
          <span className="tpl-rail-sub">Apply a template directly to Today.</span>
        </div>

        <select
          className="tpl-rail-select"
          value={selectedTplId}
          onChange={(e) => setSelectedTplId(e.target.value)}
          aria-label="Select template to apply"
        >
          <option value="">Select a template...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="tpl-rail-apply-btn"
          disabled={!selectedTplId || applying}
          onClick={() => void handleApply()}
        >
          {applying ? 'Applying…' : 'Apply'}
        </button>
      </div>

      {/* Recently Used Card on Right Rail */}
      <div className="tpl-rail-widget">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="tpl-rail-title">Recently used</span>
          <span style={{ fontSize: 11.5, color: '#2d4a3e', fontWeight: 500 }}>All</span>
        </div>

        <div className="tpl-recent-list">
          {recentlyUsed.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No recent templates</div>
          ) : (
            recentlyUsed.map((t, idx) => (
              <div
                key={t.id}
                className="tpl-recent-item"
                onClick={() => void select(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void select(t.id)
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
    </>
  )
}
