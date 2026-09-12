import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import type { EnergyLevel, InboxGroup } from '../../db/types'
import { useBlocksStore } from '../../stores/blocks'
import { useDayStore } from '../../stores/day'
import { Lightning } from '@phosphor-icons/react/dist/csr/Lightning'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { Tag } from '@phosphor-icons/react/dist/csr/Tag'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'

const ESTIMATE_OPTIONS = [15, 25, 30, 45, 60, 90]

const TAG_OPTIONS = [
  'Deep Work',
  'Admin',
  'Research',
  'Reading',
  'Communication',
  'Planning',
  'Errand',
]

const ENERGY_OPTIONS: { level: EnergyLevel; label: string }[] = [
  { level: 'high', label: 'High energy' },
  { level: 'medium', label: 'Medium energy' },
  { level: 'low', label: 'Low energy' },
]

export function QuickTaskInput() {
  const currentDay = useDayStore((s) => s.currentDay)
  const addInboxTask = useBlocksStore((s) => s.addInboxTask)

  const [title, setTitle] = useState('')
  const [energy, setEnergy] = useState<EnergyLevel | null>(null)
  const [estimateMin, setEstimateMin] = useState<number>(25)
  const [tags, setTags] = useState<string[]>([])
  const [dueChoice, setDueChoice] = useState<string | null>(null)

  const [activeMenu, setActiveMenu] = useState<'energy' | 'estimate' | 'tag' | 'due' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = async () => {
    const trimmed = title.trim()
    if (!trimmed) return

    let group: InboxGroup = 'next'
    let dueAt: string | null = null

    if (dueChoice === 'waiting') {
      group = 'waiting'
    } else if (dueChoice === 'tomorrow') {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      dueAt = tomorrow.toISOString()
      group = 'waiting'
    } else if (dueChoice === 'someday') {
      group = 'waiting'
    }

    await addInboxTask(currentDay, {
      title: trimmed,
      energy,
      estimateMin,
      tags: tags.length > 0 ? tags : undefined,
      dueAt,
      group,
    })

    setTitle('')
    setEnergy(null)
    setEstimateMin(25)
    setTags([])
    setDueChoice(null)
    setActiveMenu(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <div className="quick-capture-card" ref={containerRef}>
      <div className="quick-capture-top">
        <div className="quick-capture-circle" />
        <input
          type="text"
          className="quick-capture-input"
          placeholder="What needs to get done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="quick-capture-bottom">
        <div className="quick-capture-chips">
          {/* Energy Chip */}
          <div className="quick-chip-wrap">
            <button
              type="button"
              className={`quick-chip-btn ${energy ? 'quick-chip-btn-active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'energy' ? null : 'energy')}
            >
              <Lightning size={13} />
              <span>{energy ? energy.charAt(0).toUpperCase() + energy.slice(1) : 'Energy'}</span>
              <CaretDown size={10} />
            </button>
            {activeMenu === 'energy' && (
              <div className="quick-chip-menu">
                <div
                  className={`quick-chip-menu-item ${energy === null ? 'quick-chip-menu-item-selected' : ''}`}
                  onClick={() => {
                    setEnergy(null)
                    setActiveMenu(null)
                  }}
                >
                  None
                </div>
                {ENERGY_OPTIONS.map((opt) => (
                  <div
                    key={opt.level}
                    className={`quick-chip-menu-item ${energy === opt.level ? 'quick-chip-menu-item-selected' : ''}`}
                    onClick={() => {
                      setEnergy(opt.level)
                      setActiveMenu(null)
                    }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Estimate Chip */}
          <div className="quick-chip-wrap">
            <button
              type="button"
              className={`quick-chip-btn ${estimateMin ? 'quick-chip-btn-active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'estimate' ? null : 'estimate')}
            >
              <Clock size={13} />
              <span>{estimateMin ? `${estimateMin}m` : 'Estimate'}</span>
              <CaretDown size={10} />
            </button>
            {activeMenu === 'estimate' && (
              <div className="quick-chip-menu">
                {ESTIMATE_OPTIONS.map((min) => (
                  <div
                    key={min}
                    className={`quick-chip-menu-item ${estimateMin === min ? 'quick-chip-menu-item-selected' : ''}`}
                    onClick={() => {
                      setEstimateMin(min)
                      setActiveMenu(null)
                    }}
                  >
                    {min} min
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tag Chip */}
          <div className="quick-chip-wrap">
            <button
              type="button"
              className={`quick-chip-btn ${tags.length > 0 ? 'quick-chip-btn-active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'tag' ? null : 'tag')}
            >
              <Tag size={13} />
              <span>{tags.length > 0 ? tags.join(', ') : 'Project / Tag'}</span>
              <CaretDown size={10} />
            </button>
            {activeMenu === 'tag' && (
              <div className="quick-chip-menu">
                {TAG_OPTIONS.map((tagName) => {
                  const isSelected = tags.includes(tagName)
                  return (
                    <div
                      key={tagName}
                      className={`quick-chip-menu-item ${isSelected ? 'quick-chip-menu-item-selected' : ''}`}
                      onClick={() => {
                        if (isSelected) {
                          setTags(tags.filter((t) => t !== tagName))
                        } else {
                          setTags([...tags, tagName])
                        }
                        setActiveMenu(null)
                      }}
                    >
                      {tagName}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Due Later Chip */}
          <div className="quick-chip-wrap">
            <button
              type="button"
              className={`quick-chip-btn ${dueChoice ? 'quick-chip-btn-active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'due' ? null : 'due')}
            >
              <CalendarBlank size={13} />
              <span>{dueChoice ? dueChoice : 'Due later'}</span>
              <CaretDown size={10} />
            </button>
            {activeMenu === 'due' && (
              <div className="quick-chip-menu">
                <div
                  className={`quick-chip-menu-item ${dueChoice === null ? 'quick-chip-menu-item-selected' : ''}`}
                  onClick={() => {
                    setDueChoice(null)
                    setActiveMenu(null)
                  }}
                >
                  Today (Do Next)
                </div>
                <div
                  className={`quick-chip-menu-item ${dueChoice === 'waiting' ? 'quick-chip-menu-item-selected' : ''}`}
                  onClick={() => {
                    setDueChoice('waiting')
                    setActiveMenu(null)
                  }}
                >
                  Waiting / Later
                </div>
                <div
                  className={`quick-chip-menu-item ${dueChoice === 'tomorrow' ? 'quick-chip-menu-item-selected' : ''}`}
                  onClick={() => {
                    setDueChoice('tomorrow')
                    setActiveMenu(null)
                  }}
                >
                  Tomorrow
                </div>
                <div
                  className={`quick-chip-menu-item ${dueChoice === 'someday' ? 'quick-chip-menu-item-selected' : ''}`}
                  onClick={() => {
                    setDueChoice('someday')
                    setActiveMenu(null)
                  }}
                >
                  Someday
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="quick-capture-actions">
          <span className="quick-capture-hint">Press Enter to add</span>
          <button type="button" className="quick-capture-add-btn" onClick={() => void handleSubmit()}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
