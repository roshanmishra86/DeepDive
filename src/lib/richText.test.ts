import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/react'
import {
  RICH_NOTE_VERSION,
  isEmptyNote,
  markdownToNote,
  noteToMarkdown,
  notePlainText,
  parseNote,
  serializeNote,
} from './richText'

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
})
const para = (...content: JSONContent[]): JSONContent =>
  content.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content }
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

describe('parseNote', () => {
  it('splits legacy plain text into paragraphs with blank lines as empty paragraphs', () => {
    expect(parseNote('one\n\ntwo')).toEqual(doc(para(text('one')), para(), para(text('two'))))
  })

  it('keeps plain text containing HTML tags as text — the case that makes HTML-sniffing unsafe', () => {
    const stored = 'compare <p> and <b> tags'
    expect(parseNote(stored)).toEqual(doc(para(text(stored))))
    expect(notePlainText(stored)).toBe(stored)
  })

  it('treats valid JSON of a non-envelope shape as plain text with characters intact', () => {
    for (const stored of ['[1,2]', '123', '"text"', 'null', '{"type":"doc"}', '{"v":2,"type":"doc"}', 'true']) {
      expect(notePlainText(stored)).toBe(stored)
    }
  })

  it('treats malformed JSON as plain text', () => {
    expect(notePlainText('{"v":1,"type":"doc"')).toBe('{"v":1,"type":"doc"')
  })

  it('yields a single empty paragraph for an empty string', () => {
    expect(parseNote('')).toEqual(doc(para()))
  })

  it('round-trips an envelope and strips the envelope-only `v` key', () => {
    const source = doc(para(text('hello')), { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('a'))] }] })
    const stored = serializeNote(source)
    expect(JSON.parse(stored).v).toBe(RICH_NOTE_VERSION)
    expect(parseNote(stored)).toEqual(source)
    expect(parseNote(stored)).not.toHaveProperty('v')
  })
})

describe('isEmptyNote', () => {
  it('is true for every shape a blank note can take', () => {
    expect(isEmptyNote('')).toBe(true)
    expect(isEmptyNote('   \n  ')).toBe(true)
    expect(isEmptyNote(serializeNote({ type: 'doc' }))).toBe(true)
    expect(isEmptyNote(serializeNote(doc()))).toBe(true)
    expect(isEmptyNote(serializeNote(doc(para())))).toBe(true)
    expect(isEmptyNote(serializeNote(doc(para(text('  ')))))).toBe(true)
  })

  it('is false once there is user content — a serialized doc is truthy so `note !== \'\'` cannot be used', () => {
    expect(serializeNote(doc(para()))).not.toBe('')
    expect(isEmptyNote(serializeNote(doc(para(text('x')))))).toBe(false)
    expect(isEmptyNote('hello')).toBe(false)
    // An empty task item is still something the user can see in the editor.
    expect(isEmptyNote(serializeNote(doc({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [para()] }] })))).toBe(false)
  })
})

describe('notePlainText', () => {
  it('joins blocks with newlines and concatenates marked inline runs', () => {
    const stored = serializeNote(doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
      para(text('plain '), text('bold', [{ type: 'bold' }]), text(' end')),
    ))
    expect(notePlainText(stored)).toBe('Title\nplain bold end')
  })

  it('flattens nested lists', () => {
    const stored = serializeNote(doc({
      type: 'bulletList',
      content: [{
        type: 'listItem',
        content: [para(text('outer')), { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('inner'))] }] }],
      }],
    }))
    expect(notePlainText(stored)).toBe('outer\ninner')
  })
})

describe('markdown', () => {
  const markdown = [
    '# Heading',
    '',
    'Some **bold** and *italic* and a [link](https://example.com).',
    '',
    '- bullet one',
    '  - nested bullet',
    '',
    '1. first',
    '2. second',
    '',
    '- [x] done thing',
    '- [ ] open thing',
  ].join('\n')

  it('round-trips every node type in the supported subset', () => {
    expect(noteToMarkdown(serializeNote(markdownToNote(markdown)))).toBe(markdown)
  })

  it('parses marks into the tiptap shapes the editor expects', () => {
    const parsed = markdownToNote('a **b** [c](https://x.dev)')
    expect(parsed.content?.[0]).toEqual(para(
      text('a '),
      text('b', [{ type: 'bold' }]),
      text(' '),
      text('c', [{ type: 'link', attrs: { href: 'https://x.dev' } }]),
    ))
  })

  it('records task checked state', () => {
    const list = markdownToNote('- [x] yes\n- [ ] no').content?.[0]
    expect(list?.type).toBe('taskList')
    expect(list?.content?.map((item) => item.attrs?.checked)).toEqual([true, false])
  })

  it('exports a legacy plain-text note unchanged', () => {
    const legacy = 'line one\n\nline two with * and _ and [brackets]'
    expect(noteToMarkdown(legacy)).toBe(legacy)
  })

  it('degrades an unsupported node to its text instead of throwing or dropping it', () => {
    const stored = serializeNote(doc(
      { type: 'codeBlock', content: [text('const a = 1')] },
      { type: 'blockquote', content: [para(text('quoted'))] },
    ))
    expect(noteToMarkdown(stored)).toBe('const a = 1\n\nquoted')
  })

  it('degrades unsupported markdown to paragraph text rather than losing the line', () => {
    const parsed = markdownToNote('```js\ncode\n```')
    expect(notePlainText(serializeNote(parsed))).toBe('```js\ncode\n```')
  })

  it('escapes markdown syntax so literal characters survive the round trip', () => {
    const source = doc(para(text('use *stars* and snake_case and # hash')))
    const restored = markdownToNote(noteToMarkdown(serializeNote(source)))
    expect(restored).toEqual(source)
  })

  it('never throws on a note that is not an envelope', () => {
    expect(() => markdownToNote('')).not.toThrow()
    expect(markdownToNote('')).toEqual(doc(para()))
  })
})
