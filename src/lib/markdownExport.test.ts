import { describe, expect, it } from 'vitest'
import type { Subtask, Task } from '../db/types'
import { exportTaskMarkdown, importMarkdownNotes, markdownFilename } from './markdownExport'

const task: Task = { id: 4, title: 'Ship feature', notes: 'Write the plan', important: true, urgent: false, priority: 'high', dueAt: null, estimateMin: 60, done: true, createdAt: 'now', archived: true, sort: 0, completedAt: 'done', archivedAt: 'archived' }
const subtasks: Subtask[] = [{ id: 1, taskId: 4, title: 'Test it', estimateMin: 30, done: false, sort: 0, createdAt: 'now', dueAt: null }]

describe('markdown plan helpers', () => {
  it('exports stable metadata, checklists, and markers', () => {
    const markdown = exportTaskMarkdown(task, subtasks)
    expect(markdown).toContain('# Ship feature')
    expect(markdown).toContain('- [ ] Test it — 30 min')
    expect(markdown).toContain('<!-- deep-work:notes:start -->\nWrite the plan')
    expect(markdownFilename('Ship feature', 4)).toBe('ship-feature.md')
    expect(markdownFilename('!!!', 4)).toBe('task-4.md')
  })

  it('imports only marked notes and treats unmarked files as body text', () => {
    expect(importMarkdownNotes('header\n<!-- deep-work:notes:start -->\nbody\n<!-- deep-work:notes:end -->\nfooter')).toBe('body')
    expect(importMarkdownNotes('plain markdown')).toBe('plain markdown')
  })
})
