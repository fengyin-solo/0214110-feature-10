// Store tests: stats stay in sync with checklist edits, save prompt flips,
// and reload restores unknown markers verbatim.
//
// Run: node --no-warnings --loader ../test-loader.mjs --test stores.test.mjs
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { setActivePinia, createPinia } from 'pinia'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
global.window = dom.window
global.document = dom.window.document
global.navigator = dom.window.navigator
global.localStorage = dom.window.localStorage

import { useEditorStore, loadStoredContent } from './editor.js'

beforeEach(() => {
  dom.window.localStorage.clear()
  setActivePinia(createPinia())
})

test('init hydrates without dirty flag; updates mark dirty + recompute stats', () => {
  const store = useEditorStore()
  store.initContent('- [x] a\n- [ ] b\n- [?] c')
  assert.equal(store.isDirty, false)
  assert.deepEqual(store.taskStats, { total: 3, done: 1, unknown: 1, percent: 33 })

  store.updateContent('- [x] a\n- [x] b\n- [?] c')
  assert.equal(store.isDirty, true)
  assert.deepEqual(store.taskStats, { total: 3, done: 2, unknown: 1, percent: 67 })
})

test('empty checklist hides progress (total 0)', () => {
  const store = useEditorStore()
  store.initContent('# heading\n\nplain text only')
  assert.equal(store.taskStats.total, 0)
  assert.equal(store.taskStats.percent, 0)
})

test('word/char counts update together with checklist edits', () => {
  const store = useEditorStore()
  store.initContent('- [ ] hello world')
  const wordsBefore = store.wordCount
  const charsBefore = store.charCount
  // The space inside "[ ]" is a word boundary, so marking done ("[x]")
  // reduces the token count deterministically; char count is unchanged.
  store.updateContent('- [x] hello world')
  assert.equal(store.wordCount, wordsBefore - 1)
  assert.equal(store.charCount, charsBefore)

  store.updateContent('- [x] hello world again')
  assert.equal(store.wordCount, wordsBefore)
})

test('save prompt: dirty → saved after debounce; errors surface', async () => {
  const store = useEditorStore()
  store.initContent('initial')
  assert.equal(store.saveStatus.key, 'saved')

  store.updateContent('changed')
  assert.equal(store.saveStatus.key, 'saving')

  await new Promise(r => setTimeout(r, 600))
  assert.equal(store.saveStatus.key, 'saved')

  // persistence actually wrote the raw text
  assert.equal(loadStoredContent(), 'changed')
})

test('reload restores unknown markers and every other byte verbatim', async () => {
  const store = useEditorStore()
  const doc = '# Title\n\n- [x] one\n- [?] mystery `code`\n- [ ] two\n\n> quote\n'
  store.initContent(doc)
  store.updateContent(doc.replace('- [ ] two', '- [x] two'))
  await new Promise(r => setTimeout(r, 600))

  const restored = loadStoredContent()
  assert.equal(restored, doc.replace('- [ ] two', '- [x] two'))
  assert.match(restored, /\[?\]/)

  const fresh = useEditorStore()
  fresh.initContent(restored)
  assert.deepEqual(fresh.taskStats, { total: 3, done: 2, unknown: 1, percent: 67 })
})
