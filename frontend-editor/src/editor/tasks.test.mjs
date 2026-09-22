// Standalone logic tests for task-list behavior (no CM DOM required).
// Run: node --test src/editor/tasks.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, Text } from '@codemirror/state'
import { analyzeTasks, getTaskStats, planTaskChanges, collectDescendants, getGroupState } from './tasks.js'
import { parseMarkdownRegions } from './markdown-parser.js'

function makeState(doc, selection) {
  return EditorState.create({
    doc: typeof doc === 'string' ? Text.of(doc.split('\n')) : doc,
    selection
  })
}

function apply(state, changes) {
  return state.update({ changes }).state
}

function runClicks(state, pos, times) {
  for (let i = 0; i < times; i++) {
    const { changes } = planTaskChanges(state, pos)
    state = apply(state, changes)
  }
  return state
}

test('empty document and empty list yield zero stats', () => {
  assert.deepEqual(getTaskStats(''), { total: 0, done: 0, unknown: 0, percent: 0 })
  assert.deepEqual(getTaskStats('# just a heading\n\nno tasks here'), { total: 0, done: 0, unknown: 0, percent: 0 })
  // Plain bullets are not tasks
  assert.equal(getTaskStats('- bullet\n- another').total, 0)
})

test('unknown markers are parsed, preserved and counted separately', () => {
  const doc = '- [x] a\n- [ ] b\n- [?] c\n- [Q] d\n- [] e'
  const { entries } = analyzeTasks(doc)
  assert.equal(entries.length, 5)
  assert.deepEqual(entries.map(e => e.status), [true, false, null, null, false])
  assert.deepEqual(entries.map(e => e.marker), ['x', ' ', '?', 'Q', ''])
  const stats = getTaskStats(doc)
  assert.deepEqual(stats, { total: 5, done: 1, unknown: 2, percent: 20 })
})

test('ordered tasks and nested tasks are supported', () => {
  const doc = '1. [x] one\n2. [ ] two\n   1) [?] sub\n   - [x] deep'
  const { entries } = analyzeTasks(doc)
  assert.deepEqual(entries.map(e => e.ordered), [true, true, true, false])
  assert.deepEqual(entries.map(e => e.indent), [0, 0, 3, 3])
})

test('single checkbox toggles and rapid repeated clicks never cross rows', () => {
  let doc = '- [x] a\n- [ ] b\n- [ ] c'
  let state = makeState(doc)
  const firstBox = 2 // '[' of first line
  state = runClicks(state, firstBox, 4)
  // 4 flips → back to checked; other rows untouched
  const text = state.doc.toString()
  assert.equal(text, '- [x] a\n- [ ] b\n- [ ] c')

  // 3 flips on first → unchecked
  state = runClicks(makeState(doc), firstBox, 3)
  assert.equal(state.doc.toString(), '- [ ] a\n- [ ] b\n- [ ] c')

  // rapid clicks on the second box: first row must not change.
  // b has no descendants, so it toggles in place; 5 flips → checked.
  const secondBox = analyzeTasks(doc).entries[1].boxFrom
  state = runClicks(makeState(doc), secondBox, 5)
  assert.equal(state.doc.toString(), '- [x] a\n- [x] b\n- [ ] c')
  // one more flip → back to unchecked, row a unaffected throughout
  state = runClicks(state, secondBox, 1)
  assert.equal(state.doc.toString(), '- [x] a\n- [ ] b\n- [ ] c')
})

test('nested group: parent click toggles whole subtree in one batch', () => {
  const doc = '- [ ] parent\n  - [x] a\n  - [ ] b\n    - [x] c\n- [ ] sibling'
  let state = makeState(doc)
  const parentBox = doc.indexOf('[')
  const plan = planTaskChanges(state, parentBox)
  assert.equal(plan.changes.length, 2) // parent + b flip to x; a, c stay x
  state = apply(state, plan.changes)
  const lines = state.doc.toString().split('\n')
  assert.deepEqual(lines.slice(0, 4), [
    '- [x] parent',
    '  - [x] a',
    '  - [x] b',
    '    - [x] c'
  ])
  assert.equal(lines[4], '- [ ] sibling')

  // all-checked group click unchecks everything
  const plan2 = planTaskChanges(state, parentBox)
  state = apply(state, plan2.changes)
  assert.ok(state.doc.toString().startsWith('- [ ] parent\n  - [ ] a\n  - [ ] b\n    - [ ] c'))
})

test('unknown marker: direct click converts to [x]; group/selection bulk keeps it', () => {
  const doc = '- [?] parent\n  - [ ] a\n  - [?] b'
  let state = makeState(doc)
  const plan = planTaskChanges(state, 2)
  state = apply(state, plan.changes)
  // direct click on unknown parent converts only parent to x, group logic
  // doesn't fan out descendants
  assert.equal(state.doc.toString(), '- [x] parent\n  - [ ] a\n  - [?] b')

  // After the direct conversion the group is mixed (parent checked, a not),
  // so one more click keeps "set all checked"; the next click unchecks.
  let plan2 = planTaskChanges(state, 2)
  state = apply(state, plan2.changes)
  assert.equal(state.doc.toString(), '- [x] parent\n  - [x] a\n  - [?] b')
  plan2 = planTaskChanges(state, 2)
  state = apply(state, plan2.changes)
  assert.equal(state.doc.toString(), '- [ ] parent\n  - [ ] a\n  - [?] b')

  // round-trip the group once more; b stays unknown throughout
  const plan3 = planTaskChanges(state, 2)
  state = apply(state, plan3.changes)
  assert.equal(state.doc.toString(), '- [x] parent\n  - [x] a\n  - [?] b')
  const plan4 = planTaskChanges(state, 2)
  state = apply(state, plan4.changes)
  assert.equal(state.doc.toString(), '- [ ] parent\n  - [ ] a\n  - [?] b')
})

test('multi-line selection batch flips all known tasks, keeps unknown and non-tasks', () => {
  const doc = '- [x] a\n- [ ] b\n- [?] c\nplain text\n- [x] d'
  // select from line 1 start through line 3
  const selStart = 0
  const selEnd = doc.indexOf('c') + 1
  let state = makeState(doc, { anchor: selStart, head: selEnd })
  const plan = planTaskChanges(state, analyzeTasks(doc).entries[1].boxFrom)
  state = apply(state, plan.changes)
  // not-all-checked → batch sets every known task to checked; unknown & outside untouched
  const text = state.doc.toString()
  assert.equal(text, '- [x] a\n- [x] b\n- [?] c\nplain text\n- [x] d')

  // batch again sets them all back to unchecked, unknown still intact
  state = makeState(state.doc, { anchor: selStart, head: selEnd })
  const plan2 = planTaskChanges(state, analyzeTasks(state.doc).entries[1].boxFrom)
  state = apply(state, plan2.changes)
  assert.equal(state.doc.toString(), '- [ ] a\n- [ ] b\n- [?] c\nplain text\n- [x] d')
})

test('group boundaries: nested tasks and plain bullets, dedent and content', () => {
  // A task nested under a plain bullet is still inside the parent's nested
  // subtree and participates in the group toggle.
  const doc = '- [ ] parent\n  - plain bullet\n    - [x] deep\n- [ ] top'
  const { entries, lines } = analyzeTasks(doc)
  assert.deepEqual(collectDescendants(entries, 1, lines).map(e => e.number), [3])
  const state = makeState(doc)
  // mixed group → first click completes everything (parent flips, deep stays x)
  let plan = planTaskChanges(state, 2)
  let out = apply(state, plan.changes).doc.toString()
  assert.equal(out, '- [x] parent\n  - plain bullet\n    - [x] deep\n- [ ] top')
  // second click unchecks the whole group
  const state2 = makeState(out)
  plan = planTaskChanges(state2, 2)
  out = apply(state2, plan.changes).doc.toString()
  assert.equal(out, '- [ ] parent\n  - plain bullet\n    - [ ] deep\n- [ ] top')

  // a top-level non-list line breaks the group; an indented continuation does not
  const doc2 = '- [ ] p\n  - [x] child\nparagraph\n  - [x] orphan'
  const m2 = analyzeTasks(doc2)
  assert.deepEqual(collectDescendants(m2.entries, 1, m2.lines).map(e => e.number), [2])

  // a dedented list item ends the group
  const doc3 = '- [ ] p\n  - [x] child\n- bullet\n  - [x] after'
  const m3 = analyzeTasks(doc3)
  assert.deepEqual(collectDescendants(m3.entries, 1, m3.lines).map(e => e.number), [2])

  // blank line + indented continuation keeps the group alive
  const doc4 = '- [ ] p\n  - [x] child\n\n      note inside\n  - [ ] c2'
  const m4 = analyzeTasks(doc4)
  assert.deepEqual(collectDescendants(m4.entries, 1, m4.lines).map(e => e.number), [2, 5])
})

test('only bracket char changes — rest of markdown content is byte-identical', () => {
  const doc = '- [ ] buy **milk** — see [link](https://x.com) and `code`'
  const state = makeState(doc)
  const plan = planTaskChanges(state, 2)
  const out = apply(state, plan.changes).doc.toString()
  assert.equal(out, '- [x] buy **milk** — see [link](https://x.com) and `code`')
  // single-character replacement ranges
  assert.ok(plan.changes.every(c => c.to === c.from + 1))
})

test('checkboxes inside fenced code blocks are inert', () => {
  const doc = '```\n- [x] not a task\n```\n- [ ] real'
  const { entries } = analyzeTasks(doc)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].number, 4)
  assert.deepEqual(getTaskStats(doc), { total: 1, done: 0, unknown: 0, percent: 0 })
})

test('parser regions carry stable anchors and unknown status', () => {
  const doc = '- [?] hi\n1. [x] ordered'
  const regions = parseMarkdownRegions(doc).filter(r => r.type === 'task-list')
  assert.equal(regions.length, 2)
  assert.equal(regions[0].meta.checked, null)
  assert.equal(regions[0].meta.rawMarker, '?')
  assert.equal(regions[0].meta.checkCharOffset, doc.indexOf('?'))
  assert.equal(regions[1].meta.ordered, true)
  assert.equal(regions[1].meta.checked, true)
})

test('reopening: doc text round-trips verbatim (unknown markers included)', () => {
  const doc = '- [x] a\n- [?] b\n- [ ] c\n\n# Heading\ntext'
  const serialized = JSON.stringify(doc) // simulate persistence
  const restored = JSON.parse(serialized)
  assert.deepEqual(getTaskStats(restored), getTaskStats(doc))
  assert.equal(restored, doc)
})

test('no-op clicks produce zero changes (safe for undo history)', () => {
  const doc = '- [ ] a\n- [?] b'
  assert.equal(planTaskChanges(makeState(doc), 100).changes.length, 0)
  // unknown already-x can't happen, but group with only unknown descendants…
  const doc2 = '- [ ] a\n  - [?] b'
  const state = makeState(doc2)
  const plan = planTaskChanges(state, 2)
  assert.ok(plan.changes.length >= 1)
})

test('group state aggregation', () => {
  const doc = '- [ ] p\n  - [x] a\n  - [?] b\n  - [ ] c'
  const { entries, lines } = analyzeTasks(doc)
  assert.equal(getGroupState(entries, 1, lines), 'some')
  const doc2 = '- [x] p\n  - [x] a\n  - [?] b'
  const m2 = analyzeTasks(doc2)
  assert.equal(getGroupState(m2.entries, 1, m2.lines), 'all')
})
