import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getTaskStats } from '@/editor/tasks'

const STORAGE_KEY = 'md-live-editor:doc:v1'
const SAVE_DELAY = 400

/**
 * Read the persisted document. Raw text is stored verbatim, so unknown task
 * markers (e.g. `[?]`) survive reloads exactly as written.
 * @returns {string|null}
 */
export function loadStoredContent() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (typeof raw !== 'string') return null
    return raw
  } catch {
    return null
  }
}

export const useEditorStore = defineStore('editor', () => {
  const content = ref('')
  const fileName = ref('untitled.md')
  const isDirty = ref(false)
  const wordCount = ref(0)
  const charCount = ref(0)
  const lineCount = ref(0)
  const cursorLine = ref(1)
  const cursorCol = ref(1)
  const savedAt = ref(0)
  const saveError = ref(false)
  const taskStats = ref({ total: 0, done: 0, unknown: 0, percent: 0 })

  const statusText = computed(() => {
    return `Ln ${cursorLine.value}, Col ${cursorCol.value} | ${wordCount.value} words | ${charCount.value} chars`
  })

  const saveStatus = computed(() => {
    if (saveError.value) return { key: 'error', text: '保存失败' }
    if (isDirty.value) return { key: 'saving', text: '未保存' }
    if (savedAt.value) return { key: 'saved', text: '已保存' }
    return { key: 'idle', text: '' }
  })

  function recompute(newContent) {
    charCount.value = newContent.length
    lineCount.value = newContent.split('\n').length
    wordCount.value = newContent.trim() ? newContent.trim().split(/\s+/).length : 0
    taskStats.value = getTaskStats(newContent)
  }

  let saveTimer = null
  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, content.value)
      saveError.value = false
      savedAt.value = Date.now()
      isDirty.value = false
    } catch {
      saveError.value = true
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, SAVE_DELAY)
  }

  function updateContent(newContent) {
    content.value = newContent
    isDirty.value = true
    recompute(newContent)
    // Checklist toggles (and every other edit) flow through here, so word
    // count, task progress and the save prompt stay in lock-step with the
    // document.
    scheduleSave()
  }

  /** Initial document hydration — does not mark the file as modified. */
  function initContent(newContent) {
    content.value = newContent
    isDirty.value = false
    recompute(newContent)
    if (saveTimer) clearTimeout(saveTimer)
    persist()
  }

  function updateCursor(line, col) {
    cursorLine.value = line
    cursorCol.value = col
  }

  function setFileName(name) {
    fileName.value = name
  }

  function markSaved() {
    isDirty.value = false
  }

  return {
    content,
    fileName,
    isDirty,
    wordCount,
    charCount,
    lineCount,
    cursorLine,
    cursorCol,
    taskStats,
    savedAt,
    saveError,
    statusText,
    saveStatus,
    updateContent,
    initContent,
    updateCursor,
    setFileName,
    markSaved
  }
})
