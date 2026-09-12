import { useState, useMemo } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { DotsThreeVertical } from '@phosphor-icons/react/dist/csr/DotsThreeVertical'
import { Sun } from '@phosphor-icons/react/dist/csr/Sun'
import { Target } from '@phosphor-icons/react/dist/csr/Target'
import { Users } from '@phosphor-icons/react/dist/csr/Users'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { FileText } from '@phosphor-icons/react/dist/csr/FileText'
import { ShoppingCart } from '@phosphor-icons/react/dist/csr/ShoppingCart'
import { Bug } from '@phosphor-icons/react/dist/csr/Bug'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import { Moon } from '@phosphor-icons/react/dist/csr/Moon'
import { Receipt } from '@phosphor-icons/react/dist/csr/Receipt'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { Compass } from '@phosphor-icons/react/dist/csr/Compass'
import { Copy } from '@phosphor-icons/react/dist/csr/Copy'
import { Trash } from '@phosphor-icons/react/dist/csr/Trash'
import { filterTemplates, formatLastUsed, getTagClass } from '../../lib/templates'
import type { TemplateWithStats } from '../../stores/templates'

interface TemplateCatalogProps {
  templates: TemplateWithStats[]
  selectedId: number | null
  onSelect: (id: number) => void
  onToggleFavourite: (id: number) => void
  onDuplicate: (id: number) => void
  onDelete: (id: number) => void
}

const CATEGORY_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'work', label: 'Work' },
  { id: 'personal', label: 'Personal' },
  { id: 'ritual', label: 'Rituals' },
]

function renderTemplateIcon(iconName?: string) {
  switch (iconName) {
    case 'sun':
      return <Sun size={20} weight="fill" color="#d97706" />
    case 'target':
      return <Target size={20} weight="bold" color="#2d4a3e" />
    case 'users':
      return <Users size={20} weight="bold" color="#2563eb" />
    case 'calendar':
      return <CalendarBlank size={20} weight="bold" color="#2d4a3e" />
    case 'file-text':
      return <FileText size={20} weight="bold" color="#475569" />
    case 'shopping-cart':
      return <ShoppingCart size={20} weight="bold" color="#0d9488" />
    case 'bug':
      return <Bug size={20} weight="bold" color="#e11d48" />
    case 'flag':
      return <Flag size={20} weight="bold" color="#ea580c" />
    case 'moon':
      return <Moon size={20} weight="bold" color="#7c3aed" />
    case 'receipt':
      return <Receipt size={20} weight="bold" color="#0284c7" />
    case 'heart':
      return <Heart size={20} weight="bold" color="#e11d48" />
    case 'compass':
      return <Compass size={20} weight="bold" color="#059669" />
    default:
      return <Target size={20} weight="bold" color="#2d4a3e" />
  }
}

export function TemplateCatalog({
  templates,
  selectedId,
  onSelect,
  onToggleFavourite,
  onDuplicate,
  onDelete,
}: TemplateCatalogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeChip, setActiveChip] = useState('all')
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    return filterTemplates(templates, searchQuery, activeChip)
  }, [templates, searchQuery, activeChip])

  return (
    <div className="tpl-catalog-pane">
      {/* Search Input */}
      <div className="tpl-search-box">
        <MagnifyingGlass size={16} className="tpl-search-icon" />
        <input
          type="text"
          className="tpl-search-input"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search templates"
        />
      </div>

      {/* Filter Chips */}
      <div className="tpl-chips-scroll" role="tablist" aria-label="Template categories">
        {CATEGORY_CHIPS.map((chip) => {
          const isActive = activeChip === chip.id
          const chipClass = isActive ? 'tpl-chip active' : 'tpl-chip'
          return (
            <button
              key={chip.id}
              type="button"
              className={chipClass}
              onClick={() => setActiveChip(chip.id)}
              role="tab"
              aria-selected={isActive}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Template Cards List */}
      <div className="tpl-catalog-list">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
            No templates found matching your filter.
          </div>
        ) : (
          filtered.map((t) => {
            const isSelected = selectedId === t.id
            const isStarred = Boolean(t.favourite)
            const cardClass = isSelected ? 'tpl-catalog-card selected' : 'tpl-catalog-card'
            const starClass = isStarred ? 'tpl-star-btn starred' : 'tpl-star-btn'
            const taskCount = t.blockCount ?? 0
            const lastUsedLabel = formatLastUsed(t.lastUsedAt)

            return (
              <div
                key={t.id}
                className={cardClass}
                onClick={() => onSelect(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelect(t.id)
                }}
              >
                {/* Icon Wrap */}
                <div className="tpl-card-icon-wrap" aria-hidden="true">
                  {renderTemplateIcon(t.icon)}
                </div>

                {/* Body */}
                <div className="tpl-card-body">
                  <div className="tpl-card-top-row">
                    <span className="tpl-card-name">{t.name}</span>

                    <div className="tpl-card-top-actions">
                      <span className="tpl-card-task-count">{taskCount} tasks</span>

                      <button
                        type="button"
                        className={starClass}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleFavourite(t.id)
                        }}
                        aria-label={isStarred ? `Unfavourite ${t.name}` : `Favourite ${t.name}`}
                      >
                        <Star size={15} weight={isStarred ? 'fill' : 'regular'} />
                      </button>

                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          className="tpl-card-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenId(menuOpenId === t.id ? null : t.id)
                          }}
                          aria-label={`Options for ${t.name}`}
                        >
                          <DotsThreeVertical size={16} />
                        </button>

                        {menuOpenId === t.id && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '100%',
                              zIndex: 50,
                              background: '#ffffff',
                              borderRadius: 8,
                              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                              border: '1px solid var(--border-light, #e7e5e4)',
                              padding: 4,
                              minWidth: 120,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="tpl-btn-secondary"
                              style={{ width: '100%', border: 'none', justifyContent: 'flex-start', padding: '6px 10px', fontSize: 12 }}
                              onClick={() => {
                                setMenuOpenId(null)
                                onDuplicate(t.id)
                              }}
                            >
                              <Copy size={14} />
                              <span>Duplicate</span>
                            </button>
                            <button
                              type="button"
                              className="tpl-btn-secondary"
                              style={{ width: '100%', border: 'none', justifyContent: 'flex-start', padding: '6px 10px', fontSize: 12, color: '#ef4444' }}
                              onClick={() => {
                                setMenuOpenId(null)
                                onDelete(t.id)
                              }}
                            >
                              <Trash size={14} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {t.description && (
                    <p className="tpl-card-desc">{t.description}</p>
                  )}

                  <div className="tpl-card-bottom-row">
                    <div className="tpl-card-tags">
                      {(t.tags ?? []).slice(0, 3).map((tag) => (
                        <span key={tag} className={`tpl-tag-pill ${getTagClass(tag)}`}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <span className="tpl-card-last-used">{lastUsedLabel}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
