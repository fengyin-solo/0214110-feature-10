import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { taskProgress } from '@/editor/task-list'

export const useEditorStore = defineStore('editor', () => {
  const content = ref('')
  const fileName = ref('untitled.md')
  const isDirty = ref(false)
  const wordCount = ref(0)
  const charCount = ref(0)
  const lineCount = ref(0)
  const cursorLine = ref(1)
  const cursorCol = ref(1)
  const taskDone = ref(0)
  const taskTotal = ref(0)

  const statusText = computed(() => {
    return `Ln ${cursorLine.value}, Col ${cursorCol.value} | ${wordCount.value} words | ${charCount.value} chars`
  })

  function updateContent(newContent, { markDirty = true } = {}) {
    content.value = newContent
    if (markDirty) isDirty.value = true
    // Update stats
    charCount.value = newContent.length
    lineCount.value = newContent.split('\n').length
    wordCount.value = newContent.trim() ? newContent.trim().split(/\s+/).length : 0
    // 任务清单进度（随任何清单变化同步：点击、批量、撤销、重开）
    const tp = taskProgress(newContent)
    taskDone.value = tp.done
    taskTotal.value = tp.total
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
    taskDone,
    taskTotal,
    statusText,
    updateContent,
    updateCursor,
    setFileName,
    markSaved
  }
})
