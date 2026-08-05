/**
 * Row types and enums mirroring the SQLite schema.
 * SQLite stores booleans as 0|1 integers; repository functions convert to/from TypeScript boolean
 * at the boundary so the app never sees 0|1.
 */

export type BlockKind = 'deep' | 'shallow' | 'ritual' | 'break'
export type SessionPhase = 'focus' | 'rest'
export type DayStatus = 'full' | 'part' | 'miss'
export type BlockRepeat = 'once' | 'daily' | 'weekdays'

export interface Task {
  id: number
  title: string
  notes: string
  important: boolean
  urgent: boolean
  dueAt: string | null
  estimateMin: number | null
  done: boolean
  createdAt: string
  archived: boolean
}

export interface DayBlock {
  id: number
  day: string
  taskId: number | null
  title: string
  kind: BlockKind
  startMin: number
  durationMin: number
  pomodoros: number
  completed: boolean
  sort: number
  note: string
  repeat: BlockRepeat
  trackId: number | null
  quiet: boolean
}

export interface Template {
  id: number
  name: string
  description: string
  startMin: number
  weekdays: number
}

export interface TemplateBlock {
  id: number
  templateId: number
  title: string
  kind: BlockKind
  startMin: number
  durationMin: number
  pomodoros: number
  sort: number
}

export interface Ritual {
  id: number
  title: string
  active: boolean
  sort: number
}

export interface RitualLog {
  day: string
  ritualId: number
  done: boolean
}

export interface PomodoroSession {
  id: number
  blockId: number | null
  startedAt: string
  endedAt: string | null
  phase: SessionPhase
  completed: boolean
}

export interface DayNote {
  day: string
  note: string
  shutdownMin: number | null
}

export interface Distraction {
  id: number
  day: string
  text: string
  createdAt: string
  resolved: boolean
}

export interface Track {
  id: number
  path: string
  displayName: string
  category: string
  durationSec: number | null
}

export interface Setting {
  key: string
  value: string
}
