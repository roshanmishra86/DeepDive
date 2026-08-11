import type { Subtask, Task } from '../db/types'
import { effectiveTaskEstimate } from './week'
import { formatDuration } from './time'

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
    task.notes,
    NOTES_END,
    '',
  ].join('\n')
}

export function importMarkdownNotes(markdown: string): string {
  const start = markdown.indexOf(NOTES_START)
  const end = markdown.indexOf(NOTES_END, start + NOTES_START.length)
  if (start === -1 || end === -1) return markdown
  return markdown.slice(start + NOTES_START.length, end).replace(/^\n|\n$/g, '')
}
