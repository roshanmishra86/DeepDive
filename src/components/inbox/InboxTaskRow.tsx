import { useState, useRef, useEffect } from 'react'
import type { DayBlock, InboxGroup } from '../../db/types'
import {
  formatEstimateTime,
  formatEnergyLabel,
  formatDueDate,
} from '../../lib/inbox'
import { notePlainText, isEmptyNote } from '../../lib/richText'
import { useTimerStore } from '../../stores/timer'
import { useTasksStore } from '../../stores/tasks'
import { DotsSixVertical } from '@phosphor-icons/react/dist/csr/DotsSixVertical'
import { DotsThree } from '@phosphor-icons/react/dist/csr/DotsThree'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Play } from '@phosphor-icons/react/dist/csr/Play'
import { Square } from '@phosphor-icons/react/dist/csr/Square'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { Lightning } from '@phosphor-icons/react/dist/csr/Lightning'
import { FolderSimple } from '@phosphor-icons/react/dist/csr/FolderSimple'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { CaretDoubleRight } from '@phosphor-icons/react/dist/csr/CaretDoubleRight'
import { Tray } from '@phosphor-icons/react/dist/csr/Tray'
import { TrashSimple } from '@phosphor-icons/react/dist/csr/TrashSimple'

interface InboxTaskRowProps {
  block: DayBlock
  isWorking?: boolean
  onToggleComplete: () => void
  onStartFocus: () => void
  onStopFocus: () => void
  onSetGroup: (group: InboxGroup) => void
  onDelete: () => void
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
}

export function InboxTaskRow({
  block,
  isWorking: isWorkingProp,
  onToggleComplete,
  onStartFocus,
  onStopFocus,
  onSetGroup,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: InboxTaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [badgeMenuOpen, setBadgeMenuOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)

  const timerRunning = useTimerStore((s) => s.running)
  const timerBlockTitle = useTimerStore((s) => s.blockTitle)

  // Is this block the currently active working block?
  const isWorking = isWorkingProp ?? block.inboxGroup === 'working'
  const isAttachedToTimer = isWorking && timerBlockTitle === block.title

  useEffect(() => {
    if (!menuOpen) return
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < 180 && rect.top > spaceBelow) {
        setOpenUpward(true)
      } else {
        setOpenUpward(false)
      }
    }
  }, [menuOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false)
      }
      if (badgeRef.current && !badgeRef.current.contains(target)) {
        setBadgeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hasNote = Boolean(block.note && !isEmptyNote(block.note))
  const plainNote = hasNote && block.note ? notePlainText(block.note).trim() : ''

  const linkedTask = useTasksStore((s) => (block.taskId ? s.tasks.find((t) => t.id === block.taskId) : null))
  const dueAt = linkedTask?.dueAt ?? null

  const energyLabel = formatEnergyLabel(block.energy)
  const durationLabel = block.durationMin ? formatEstimateTime(block.durationMin) : null
  const dueLabel = formatDueDate(dueAt, block.inboxGroup)
  const projectLabel = block.tags && block.tags.length > 0 ? block.tags.join(', ') : null

  let rowClassName = 'inbox-task-row'
  if (isWorking) rowClassName += ' inbox-task-row-working'
  if (block.completed) rowClassName += ' inbox-task-row-done'
  if (menuOpen || badgeMenuOpen) rowClassName += ' inbox-task-row-menu-open'

  const renderWorkflowBadge = () => {
    const group: InboxGroup = block.inboxGroup ?? 'capture'
    switch (group) {
      case 'working':
        return (
          <button
            type="button"
            className="workflow-badge workflow-badge-working"
            onClick={() => setBadgeMenuOpen(!badgeMenuOpen)}
            aria-label="Workflow state: Working Now. Click to change."
          >
            <Play size={10} weight="fill" />
            <span>Working Now</span>
          </button>
        )
      case 'next':
        return (
          <button
            type="button"
            className="workflow-badge workflow-badge-next"
            onClick={() => setBadgeMenuOpen(!badgeMenuOpen)}
            aria-label="Workflow state: Do Next. Click to change."
          >
            <CaretDoubleRight size={11} weight="bold" />
            <span>Do Next</span>
          </button>
        )
      case 'capture':
        return (
          <button
            type="button"
            className="workflow-badge workflow-badge-capture"
            onClick={() => setBadgeMenuOpen(!badgeMenuOpen)}
            aria-label="Workflow state: Capture. Click to change."
          >
            <Tray size={11} />
            <span>Capture</span>
          </button>
        )
      case 'waiting':
        return (
          <button
            type="button"
            className="workflow-badge workflow-badge-waiting"
            onClick={() => setBadgeMenuOpen(!badgeMenuOpen)}
            aria-label="Workflow state: Waiting / Later. Click to change."
          >
            <Clock size={11} />
            <span>Waiting / Later</span>
          </button>
        )
      default:
        return null
    }
  }

  return (
    <div
      className={rowClassName}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver?.()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop?.()
      }}
    >
      {/* Drag handle */}
      <div
        className="inbox-task-drag-handle"
        draggable
        onDragStart={onDragStart}
        aria-label="Drag to reorder"
      >
        <DotsSixVertical size={14} />
      </div>

      {/* Circular Checkbox */}
      <button
        type="button"
        className={`inbox-task-checkbox ${block.completed ? 'inbox-task-checkbox-checked' : ''}`}
        onClick={onToggleComplete}
        aria-label={block.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {block.completed && <Check size={11} weight="bold" />}
      </button>

      {/* Title & Metadata */}
      <div className="inbox-task-main">
        <div className="inbox-task-title-row">
          <span className={`inbox-task-title ${block.completed ? 'inbox-task-title-done' : ''}`}>
            {block.title}
          </span>
        </div>

        <div className="inbox-task-meta-row">
          {energyLabel && (
            <span className="inbox-task-meta-item" title={`Energy: ${energyLabel}`}>
              <Lightning size={12} />
              <span>{energyLabel}</span>
            </span>
          )}

          {durationLabel && (
            <span className="inbox-task-meta-item" title={`Duration: ${durationLabel}`}>
              <Clock size={12} />
              <span>{durationLabel}</span>
            </span>
          )}

          {projectLabel && (
            <span className="inbox-task-meta-item" title={`Project: ${projectLabel}`}>
              <FolderSimple size={12} />
              <span>{projectLabel}</span>
            </span>
          )}

          {dueLabel && (
            <span className="inbox-task-meta-item" title={`Due: ${dueLabel}`}>
              <CalendarBlank size={12} />
              <span>{dueLabel}</span>
            </span>
          )}

          {hasNote && plainNote && (
            <span className="inbox-task-meta-item inbox-task-meta-note" title={plainNote}>
              <span>○</span>
              <span>{plainNote}</span>
            </span>
          )}
        </div>
      </div>

      {/* Right side: Badge, Focus button, and Options */}
      <div className="inbox-task-right-controls">
        {/* Workflow state badge with switcher dropdown */}
        <div className="inbox-workflow-badge-wrap" ref={badgeRef}>
          {renderWorkflowBadge()}

          {badgeMenuOpen && (
            <div className="inbox-task-more-menu inbox-workflow-switcher-menu">
              {block.inboxGroup !== 'working' && (
                <div
                  className="inbox-task-more-item"
                  onClick={() => {
                    onSetGroup('working')
                    setBadgeMenuOpen(false)
                  }}
                >
                  <Play size={11} weight="fill" />
                  <span>Move to Working Now</span>
                </div>
              )}
              {block.inboxGroup !== 'next' && (
                <div
                  className="inbox-task-more-item"
                  onClick={() => {
                    onSetGroup('next')
                    setBadgeMenuOpen(false)
                  }}
                >
                  <CaretDoubleRight size={12} weight="bold" />
                  <span>Move to Do Next</span>
                </div>
              )}
              {block.inboxGroup !== 'capture' && (
                <div
                  className="inbox-task-more-item"
                  onClick={() => {
                    onSetGroup('capture')
                    setBadgeMenuOpen(false)
                  }}
                >
                  <Tray size={12} />
                  <span>Move to Capture</span>
                </div>
              )}
              {block.inboxGroup !== 'waiting' && (
                <div
                  className="inbox-task-more-item"
                  onClick={() => {
                    onSetGroup('waiting')
                    setBadgeMenuOpen(false)
                  }}
                >
                  <Clock size={12} />
                  <span>Move to Waiting / Later</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Start / Stop Focus Action Button */}
        {isWorking && timerRunning && isAttachedToTimer ? (
          <button
            type="button"
            className="inbox-task-action-btn inbox-task-stop-btn"
            onClick={onStopFocus}
            aria-label="Stop focus"
          >
            <Square size={10} weight="fill" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            type="button"
            className="inbox-task-action-btn inbox-task-start-btn"
            onClick={onStartFocus}
            aria-label="Start focus"
          >
            <Play size={10} weight="fill" />
            <span>Start focus</span>
          </button>
        )}

        {/* 3 dots menu */}
        <div className={`inbox-task-more-wrap${menuOpen ? ' inbox-task-more-wrap-open' : ''}`} ref={menuRef}>
          <button
            type="button"
            className="inbox-task-more-btn"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(!menuOpen)
            }}
            aria-label="Task options"
            aria-expanded={menuOpen}
          >
            <DotsThree size={18} weight="bold" />
          </button>

          {menuOpen && (
            <div className={`inbox-task-more-menu${openUpward ? ' inbox-task-more-menu-upward' : ''}`} role="menu">
              {block.inboxGroup !== 'working' && (
                <div
                  className="inbox-task-more-item"
                  role="menuitem"
                  onClick={() => {
                    onSetGroup('working')
                    setMenuOpen(false)
                  }}
                >
                  <Play size={11} weight="fill" />
                  <span>Move to Working Now</span>
                </div>
              )}
              {block.inboxGroup !== 'next' && (
                <div
                  className="inbox-task-more-item"
                  role="menuitem"
                  onClick={() => {
                    onSetGroup('next')
                    setMenuOpen(false)
                  }}
                >
                  <CaretDoubleRight size={12} weight="bold" />
                  <span>Move to Do Next</span>
                </div>
              )}
              {block.inboxGroup !== 'capture' && (
                <div
                  className="inbox-task-more-item"
                  role="menuitem"
                  onClick={() => {
                    onSetGroup('capture')
                    setMenuOpen(false)
                  }}
                >
                  <Tray size={12} />
                  <span>Move to Capture</span>
                </div>
              )}
              {block.inboxGroup !== 'waiting' && (
                <div
                  className="inbox-task-more-item"
                  role="menuitem"
                  onClick={() => {
                    onSetGroup('waiting')
                    setMenuOpen(false)
                  }}
                >
                  <Clock size={12} />
                  <span>Move to Waiting / Later</span>
                </div>
              )}
              <div className="inbox-task-more-divider" />
              <div
                className="inbox-task-more-item inbox-task-more-item-danger"
                role="menuitem"
                onClick={() => {
                  onDelete()
                  setMenuOpen(false)
                }}
              >
                <TrashSimple size={12} />
                <span>Delete</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

