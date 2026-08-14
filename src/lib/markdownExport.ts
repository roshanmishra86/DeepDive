import type { Subtask, Task } from '../db/types'
import { effectiveTaskEstimate } from './todo'
import { formatDuration } from './time'
import { markdownToNote, noteToMarkdown, serializeNote } from './richText'

export const NOTES_START = '<!-- deep-work:notes:start -->'
export const NOTES_END = '<!-- deep-work:notes:end -->'

export function markdownFilename(title: string, id: number): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || `task-${id}`}.md`
}

function metadata(task: Task, subtasks: Subtask[]): string[] {
  const estimate = effectiveTaskEstimate(task, subtasks)
  return [
    `- Due: ${task.dueAt ?? 'None'}`,
    `- Estimate: ${estimate === null ? 'None' : formatDuration(estimate)}`,
    `- Important: ${task.important ? 'Yes' : 'No'}`,
    `- Urgent: ${task.urgent ? 'Yes' : 'No'}`,
    `- Completed: ${task.completedAt ?? 'Unknown'}`,
    `- Archived: ${task.archivedAt ?? 'Unknown'}`,
  ]
}

export function exportTaskMarkdown(task: Task, subtasks: Subtask[]): string {
  const checklist = subtasks.length === 0
    ? []
    : ['', '## Subtasks', ...subtasks.map((subtask) => `- [${subtask.done ? 'x' : ' '}] ${subtask.title} — ${formatDuration(subtask.estimateMin)}`)]
  return [
    `# ${task.title}`,
    '',
    ...metadata(task, subtasks),
    ...checklist,
    '',
    NOTES_START,
    // The stored note is a rich-text envelope; a human reading the .md must not
    // see raw JSON. Legacy plain-text notes pass through unchanged.
    noteToMarkdown(task.notes),
    NOTES_END,
    '',
  ].join('\n')
}

/** Returns a storable note, not markdown source: the editor would otherwise render `**bold**` literally. */
export function importMarkdownNotes(markdown: string): string {
  const start = markdown.indexOf(NOTES_START)
  const end = markdown.indexOf(NOTES_END, start + NOTES_START.length)
  const body = start === -1 || end === -1
    ? markdown
    : markdown.slice(start + NOTES_START.length, end).replace(/^\n|\n$/g, '')
  return serializeNote(markdownToNote(body))
}
