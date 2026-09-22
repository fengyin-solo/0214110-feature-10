// Integration test: real CodeMirror EditorView under jsdom.
// Verifies rendered checkbox widgets, click dispatch, selection batches,
// undo (single history entry) and raw-text/rendered-view consistency.
//
// Run: node --test src/editor/tasks.dom.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo } from '@codemirror/commands'
import { keymap } from '@codemirror/view'

import { markdownDecorationPlugin, taskClickHandler } from './decoration-plugin.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
global.window = dom.window
global.document = dom.window.document
global.navigator = dom.window.navigator
global.Element = dom.window.Element
global.Node = dom.window.Node
global.getComputedStyle = dom.window.getComputedStyle
global.requestAnimationFrame = (cb) => setTimeout(cb, 0)
global.cancelAnimationFrame = (id) => clearTimeout(id)
global.MutationObserver = dom.window.MutationObserver
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub
dom.window.ResizeObserver = ResizeObserverStub

function mount(doc) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const state = EditorState.create({
    doc,
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdownDecorationPlugin,
      taskClickHandler
    ]
  })
  const view = new EditorView({ state, parent })
  view.measure()
  return view
}

function boxes(view) {
  return [...view.dom.querySelectorAll('[data-task-box]')]
}

function clickBox(view, el) {
  const pos = Number(el.getAttribute('data-task-box'))
  el.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
  return pos
}

test('rendered widgets mirror raw statuses, including unknown markers', () => {
  const view = mount('- [x] a\n- [ ] b\n- [?] c\n# end')
  // Move the caret off the task list so every row is in rendered state.
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  const els = boxes(view)
  assert.equal(els.length, 3)
  assert.ok(els[0].classList.contains('md-task-checkbox--checked'))
  assert.ok(!els[1].classList.contains('md-task-checkbox--checked'))
  assert.ok(els[2].classList.contains('md-task-checkbox--unknown'))
  // raw text untouched
  assert.equal(view.state.doc.toString(), '- [x] a\n- [ ] b\n- [?] c\n# end')
})

test('clicking a widget edits only that char and the DOM updates', () => {
  const view = mount('- [ ] a\n- [x] b\n# end')
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  const before = boxes(view)
  clickBox(view, before[0])
  assert.equal(view.state.doc.toString(), '- [x] a\n- [x] b\n# end')
  const after = boxes(view)
  assert.ok(after[0].classList.contains('md-task-checkbox--checked'))
  // other row untouched
  assert.ok(after[1].classList.contains('md-task-checkbox--checked'))
})

test('rapid repeated clicks stay attached to their own rows', () => {
  const view = mount('- [x] a\n- [ ] b\n- [ ] c\n# end')
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  for (let i = 0; i < 5; i++) {
    const row2 = boxes(view)[1]
    clickBox(view, row2)
  }
  assert.equal(view.state.doc.toString(), '- [x] a\n- [x] b\n- [ ] c\n# end')
})

test('nested group click is ONE undo entry', () => {
  const view = mount('- [ ] p\n  - [x] a\n  - [ ] b\n# end')
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  clickBox(view, boxes(view)[0])
  assert.equal(view.state.doc.toString(), '- [x] p\n  - [x] a\n  - [x] b\n# end')
  // single undo reverts the whole batch
  undo(view)
  assert.equal(view.state.doc.toString(), '- [ ] p\n  - [x] a\n  - [ ] b\n# end')
})

test('multi-line selection batch toggles every selected task at once', () => {
  const doc = '- [x] a\n- [ ] b\n- [?] c\n- [ ] d'
  const view = mount(doc)
  // select lines 1..3
  const line3End = view.state.doc.line(3).to
  view.dispatch({ selection: { anchor: 0, head: line3End } })
  const clickAt = view.state.doc.line(2).from + 2
  const el = view.dom.querySelector(`[data-task-box="${clickAt}"]`)
  assert.ok(el, 'checkbox inside multi-line selection stays rendered')
  clickBox(view, el)
  assert.equal(view.state.doc.toString(), '- [x] a\n- [x] b\n- [?] c\n- [ ] d')
  // one undo restores all rows together
  undo(view)
  assert.equal(view.state.doc.toString(), doc)
})

test('unknown marker survives edit round trips and cursor edit/show raw', () => {
  const view = mount('- [?] decide later\n\n# Heading')
  // place caret on the task line → raw syntax shown (no widget), text intact
  view.dispatch({ selection: { anchor: 6 } })
  assert.equal(boxes(view).length, 0)
  assert.match(view.dom.textContent, /\[?\]/)
  // move caret away → widget comes back, still unknown
  view.dispatch({ selection: { anchor: view.state.doc.line(3).from } })
  const el = boxes(view)[0]
  assert.ok(el.classList.contains('md-task-checkbox--unknown'))
  assert.equal(view.state.doc.toString(), '- [?] decide later\n\n# Heading')
})
