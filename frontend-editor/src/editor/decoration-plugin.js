import {
  ViewPlugin,
  Decoration,
  WidgetType
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { parseMarkdownRegions } from './markdown-parser'
import { toggleTaskChanges } from './task-list'

/**
 * HR Widget — renders a horizontal rule
 */
class HrWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('hr')
    hr.className = 'md-hr'
    return hr
  }
  ignoreEvent() { return false }
}

/**
 * Image Widget — renders an image preview
 */
class ImageWidget extends WidgetType {
  constructor(alt, url) {
    super()
    this.alt = alt
    this.url = url
  }

  /**
   * 检测是否为本地文件系统路径
   */
  isLocalPath(path) {
    if (!path) return false
    // Windows: C:\, D:\, \\network\path
    if (/^[a-zA-Z]:\\/.test(path) || path.startsWith('\\\\')) return true
    // Unix/Mac: /absolute/path or ~/home/path or file://
    if (path.startsWith('file://') || (path.startsWith('/') && !path.startsWith('//'))) return true
    // Relative paths: ./path or ../path
    if (path.startsWith('./') || path.startsWith('../')) return true
    return false
  }

  /**
   * 检测是否为网络路径
   */
  isNetworkPath(path) {
    if (!path) return false
    return /^https?:\/\//i.test(path) || path.startsWith('//')
  }

  toDOM() {
    const wrapper = document.createElement('span')
    wrapper.className = 'md-image-placeholder'

    // 检查是否为网络路径
    if (this.isNetworkPath(this.url)) {
      const img = document.createElement('img')
      img.src = this.url
      img.alt = this.alt || ''
      img.className = 'md-image-widget'
      img.style.maxWidth = '100%'
      img.onerror = () => {
        wrapper.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>图片加载失败: ${this.alt || this.url}</span>
          </div>
        `
        wrapper.className = 'md-image-placeholder'
      }
      wrapper.textContent = ''
      wrapper.className = ''
      wrapper.appendChild(img)
    } 
    // 检查是否为本地文件系统路径
    else if (this.isLocalPath(this.url)) {
      wrapper.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>浏览器无法访问本地路径: ${this.url}</span>
          </div>
          <span style="font-size: 11px; opacity: 0.7;">提示：请使用 http:// 或 https:// 开头的网络图片地址</span>
        </div>
      `
    } 
    // 其他情况（可能是相对路径或无效路径）
    else {
      wrapper.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>${this.alt || '图片'}: ${this.url || '未指定路径'}</span>
        </div>
      `
    }
    return wrapper
  }
  ignoreEvent() { return false }
  eq(other) { return other.url === this.url && other.alt === this.alt }
}

/**
 * Checkbox Widget for task lists.
 *
 * - 已知标记（[ ] / [x]）：渲染为可点击复选框，点击即切换底层文本；
 * - 未知标记（[-]、[?] 等）：渲染为虚线框并原样展示字符，只读，
 *   点击与批量操作都不会改写它，保证未知完成状态不丢失。
 *
 * 切换通过 view.dispatch 修改真实 Markdown 文本，渲染视图由文本
 * 重新推导，因此正文与渲染永远一致，且可撤销。
 */
class CheckboxWidget extends WidgetType {
  constructor(marker, checkFrom) {
    super()
    this.marker = marker
    this.checkFrom = checkFrom
    this.checked = marker === 'x' || marker === 'X'
    this.known = this.checked || marker === ' '
  }

  toDOM(view) {
    const span = document.createElement('span')
    if (this.known) {
      span.className = `md-task-checkbox${this.checked ? ' md-task-checkbox--checked' : ''}`
      if (!this.checked) span.innerHTML = '&nbsp;'
      span.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        // 基于当前 state 重新校验后再派发，连续点击不会串改
        const changes = toggleTaskChanges(view.state, this.checkFrom)
        if (changes) view.dispatch({ changes })
      })
    } else {
      span.className = 'md-task-checkbox md-task-checkbox--unknown'
      span.textContent = this.marker
      span.title = `未知标记 [${this.marker}]，已原样保留，不参与勾选`
    }
    return span
  }

  ignoreEvent() { return true }
  eq(other) { return other.marker === this.marker && other.checkFrom === this.checkFrom }
}

// Decoration marks
const headingDeco = (level) => Decoration.mark({ class: `md-heading md-heading--${level}` })
const boldDeco = Decoration.mark({ class: 'md-bold' })
const italicDeco = Decoration.mark({ class: 'md-italic' })
const strikeDeco = Decoration.mark({ class: 'md-strikethrough' })
const inlineCodeDeco = Decoration.mark({ class: 'md-inline-code' })
const linkDeco = Decoration.mark({ class: 'md-link' })
const blockquoteDeco = Decoration.mark({ class: 'md-blockquote' })
const syntaxHiddenDeco = Decoration.mark({ class: 'md-syntax-hidden' })
const syntaxVisibleDeco = Decoration.mark({ class: 'md-syntax-visible' })
const codeBlockDeco = Decoration.line({ class: 'md-code-block' })
const listMarkerDeco = Decoration.mark({ class: 'md-list-marker' })
const headingMarkDeco = Decoration.mark({ class: 'md-heading-mark' })
const taskDoneDeco = Decoration.mark({ class: 'md-task-text--done' })

/**
 * Get the line range that the cursor is on.
 * Returns { from, to } of the current line(s) covered by all selections.
 */
function getCursorLineRanges(state) {
  const ranges = []
  for (const sel of state.selection.ranges) {
    const lineFrom = state.doc.lineAt(sel.from)
    const lineTo = state.doc.lineAt(sel.to)
    ranges.push({ from: lineFrom.from, to: lineTo.to })
  }
  return ranges
}

/**
 * Check if a region overlaps with any cursor line range.
 */
function isCursorOnRegion(region, cursorRanges) {
  return cursorRanges.some(cr => region.from <= cr.to && region.to >= cr.from)
}

/**
 * Build decorations for the entire document.
 * Core logic: if cursor is on a region, show syntax marks; otherwise, hide them and show rendered result.
 */
function buildDecorations(view) {
  const { state } = view
  const doc = state.doc.toString()
  const regions = parseMarkdownRegions(doc)
  const cursorRanges = getCursorLineRanges(state)
  const builder = new RangeSetBuilder()

  // We need to collect all decorations and sort them by from position
  const decos = []

  for (const region of regions) {
    const cursorOn = isCursorOnRegion(region, cursorRanges)

    switch (region.type) {
      case 'heading': {
        const { level, markFrom, markTo } = region.meta
        // Always apply heading style to content
        decos.push({ from: region.contentFrom, to: region.to, deco: headingDeco(level) })
        if (cursorOn) {
          // Show the hash marks with special styling
          decos.push({ from: markFrom, to: markTo, deco: headingMarkDeco })
        } else {
          // Hide the hash marks
          decos.push({ from: markFrom, to: markTo, deco: syntaxHiddenDeco })
        }
        break
      }

      case 'bold': {
        // Apply bold to content
        decos.push({ from: region.contentFrom, to: region.contentTo, deco: boldDeco })
        if (!cursorOn) {
          // Hide markers
          decos.push({ from: region.from, to: region.contentFrom, deco: syntaxHiddenDeco })
          decos.push({ from: region.contentTo, to: region.to, deco: syntaxHiddenDeco })
        } else {
          decos.push({ from: region.from, to: region.contentFrom, deco: syntaxVisibleDeco })
          decos.push({ from: region.contentTo, to: region.to, deco: syntaxVisibleDeco })
        }
        break
      }

      case 'italic': {
        decos.push({ from: region.contentFrom, to: region.contentTo, deco: italicDeco })
        if (!cursorOn) {
          decos.push({ from: region.from, to: region.contentFrom, deco: syntaxHiddenDeco })
          decos.push({ from: region.contentTo, to: region.to, deco: syntaxHiddenDeco })
        } else {
          decos.push({ from: region.from, to: region.contentFrom, deco: syntaxVisibleDeco })
          decos.push({ from: region.contentTo, to: region.to, deco: syntaxVisibleDeco })
        }
        break
      }

      case 'strikethrough': {
        decos.push({ from: region.contentFrom, to: region.contentTo, deco: strikeDeco })
        if (!cursorOn) {
          decos.push({ from: region.from, to: region.contentFrom, deco: syntaxHiddenDeco })
          decos.push({ from: region.contentTo, to: region.to, deco: syntaxHiddenDeco })
        } else {
          decos.push({ from: region.from, to: region.contentFrom, deco: syntaxVisibleDeco })
          decos.push({ from: region.contentTo, to: region.to, deco: syntaxVisibleDeco })
        }
        break
      }

      case 'inline-code': {
        decos.push({ from: region.contentFrom, to: region.contentTo, deco: inlineCodeDeco })
        if (!cursorOn) {
          const markerLen = region.meta.markerLen
          decos.push({ from: region.from, to: region.from + markerLen, deco: syntaxHiddenDeco })
          decos.push({ from: region.to - markerLen, to: region.to, deco: syntaxHiddenDeco })
        } else {
          const markerLen = region.meta.markerLen
          decos.push({ from: region.from, to: region.from + markerLen, deco: syntaxVisibleDeco })
          decos.push({ from: region.to - markerLen, to: region.to, deco: syntaxVisibleDeco })
        }
        break
      }

      case 'link': {
        if (!cursorOn) {
          // Show only the link text with link styling
          decos.push({ from: region.contentFrom, to: region.contentTo, deco: linkDeco })
          // Hide [
          decos.push({ from: region.from, to: region.contentFrom, deco: syntaxHiddenDeco })
          // Hide ](url)
          decos.push({ from: region.contentTo, to: region.to, deco: syntaxHiddenDeco })
        } else {
          decos.push({ from: region.contentFrom, to: region.contentTo, deco: linkDeco })
          decos.push({ from: region.from, to: region.contentFrom, deco: syntaxVisibleDeco })
          decos.push({ from: region.contentTo, to: region.to, deco: syntaxVisibleDeco })
        }
        break
      }

      case 'image': {
        if (!cursorOn) {
          // Replace the entire image syntax with a widget
          decos.push({
            from: region.from,
            to: region.to,
            deco: Decoration.replace({
              widget: new ImageWidget(region.meta.alt, region.meta.url)
            })
          })
        }
        // When cursor is on it, show raw syntax (no decoration needed)
        break
      }

      case 'hr': {
        if (!cursorOn) {
          decos.push({
            from: region.from,
            to: region.to,
            deco: Decoration.replace({
              widget: new HrWidget()
            })
          })
        }
        break
      }

      case 'blockquote': {
        const { markFrom, markTo } = region.meta
        decos.push({ from: region.from, to: region.to, deco: blockquoteDeco })
        if (!cursorOn) {
          decos.push({ from: markFrom, to: markTo, deco: syntaxHiddenDeco })
        } else {
          decos.push({ from: markFrom, to: markTo, deco: syntaxVisibleDeco })
        }
        break
      }

      case 'list-bullet': {
        const { markerFrom, markerTo } = region.meta
        decos.push({ from: markerFrom, to: markerTo, deco: listMarkerDeco })
        break
      }

      case 'list-ordered': {
        const { markerFrom, markerTo } = region.meta
        decos.push({ from: markerFrom, to: markerTo, deco: listMarkerDeco })
        break
      }

      case 'task-list': {
        const { checkFrom, checkTo, checked, marker } = region.meta
        if (!cursorOn) {
          // 替换 `[x] ` 为复选框；空任务（行尾即 `]`）时不能越界吞掉换行
          decos.push({
            from: checkFrom,
            to: Math.min(checkTo + 1, region.to),
            deco: Decoration.replace({
              widget: new CheckboxWidget(marker, checkFrom)
            })
          })
        }
        // 已完成任务的文本划线置灰（光标在行间时同样生效，保持正文一致）
        if (checked && region.contentFrom < region.contentTo) {
          decos.push({ from: region.contentFrom, to: region.contentTo, deco: taskDoneDeco })
        }
        break
      }

      case 'code-block': {
        // Apply line decoration to each line in the code block
        const startLine = state.doc.lineAt(region.from)
        const endLine = state.doc.lineAt(region.to)
        for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
          const line = state.doc.line(lineNum)
          decos.push({ from: line.from, to: line.from, deco: codeBlockDeco, isLine: true })
        }
        // Hide fence markers when cursor is not on the block
        if (!cursorOn) {
          const firstLine = state.doc.lineAt(region.from)
          const lastLine = state.doc.lineAt(region.to)
          // Hide opening fence
          decos.push({ from: firstLine.from, to: firstLine.to, deco: syntaxHiddenDeco })
          // Hide closing fence
          decos.push({ from: lastLine.from, to: lastLine.to, deco: syntaxHiddenDeco })
        }
        break
      }
    }
  }

  // Sort decorations by from position, then by whether they are line decorations
  decos.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from
    // Line decorations should come before mark decorations at the same position
    if (a.isLine && !b.isLine) return -1
    if (!a.isLine && b.isLine) return 1
    return 0
  })

  // Filter out invalid ranges (from >= to for non-line decorations)
  for (const d of decos) {
    if (d.isLine) {
      builder.add(d.from, d.from, d.deco)
    } else if (d.from < d.to) {
      builder.add(d.from, d.to, d.deco)
    }
  }

  return builder.finish()
}

/**
 * The main ViewPlugin that drives live markdown rendering.
 */
export const markdownDecorationPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view)
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)
