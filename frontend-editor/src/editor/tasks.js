/**
 * Task list logic: structural parsing, progress stats and batch toggling.
 *
 * Task lines follow GFM-like syntax with two extensions:
 *   - ordered tasks  (`1. [x] done`)
 *   - unknown markers (`- [?] maybe`) — the marker character is preserved
 *     verbatim in the document; it is never normalized away nor mis-counted.
 *
 * Status values:
 *   true  — checked       ([x] / [X])
 *   false — unchecked     ([ ])
 *   null  — unknown       ([?] and any other single character)
 */

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/
const UL_TASK_RE = /^(\s*)([-*+])\s\[([^\]]?)\]/
const OL_TASK_RE = /^(\s*)(\d+)([.)])\s\[([^\]]?)\]/
const UL_ITEM_RE = /^(\s*)([-*+])(?:\s|$)/
const OL_ITEM_RE = /^(\s*)(\d+)([.)])(?:\s|$)/

/**
 * @typedef {Object} TaskEntry
 * @property {number} number        1-based line number
 * @property {number} from          document offset of line start
 * @property {number} to            document offset of line end
 * @property {number} indent        indentation (spaces)
 * @property {boolean} ordered
 * @property {number} boxFrom       document offset of the '[' of the checkbox
 * @property {number} boxCharOffset document offset of the marker character
 * @property {number} boxTo         document offset of the ']' of the checkbox
 * @property {boolean|null} status  true/false/unknown
 * @property {string} marker        the raw single character inside the brackets
 */

/**
 * Split a document (string or CodeMirror Text) into lines while tracking
 * absolute document offsets.
 */
function analyzeLines(doc) {
  const lines = []
  if (typeof doc === 'string') {
    let from = 0
    const parts = doc.split('\n')
    for (let i = 0; i < parts.length; i++) {
      lines.push({ text: parts[i], from, to: from + parts[i].length })
      from += parts[i].length + 1
    }
  } else {
    // CodeMirror Text: line.from already accounts for the '\n' separators.
    for (let n = 1; n <= doc.lines; n++) {
      const line = doc.line(n)
      lines.push({ text: line.text, from: line.from, to: line.to })
    }
  }
  return lines
}

function markerStatus(ch) {
  if (ch === 'x' || ch === 'X') return true
  if (ch === ' ' || ch === '') return false
  return null
}

function matchTaskLine(text) {
  let m = text.match(UL_TASK_RE)
  if (m) {
    return {
      indent: m[1].length,
      ordered: false,
      boxStart: m[1].length + m[2].length + 1, // offset of '['
      marker: m[3]
    }
  }
  m = text.match(OL_TASK_RE)
  if (m) {
    return {
      indent: m[1].length,
      ordered: true,
      boxStart: m[1].length + m[2].length + m[3].length + 1,
      marker: m[4]
    }
  }
  return null
}

/**
 * Indent of any list line (task or plain item) on the block boundary stack.
 * Returns -1 for non-list lines.
 */
function listLineIndent(text) {
  let m = text.match(UL_ITEM_RE)
  if (m) return m[1].length
  m = text.match(OL_ITEM_RE)
  if (m) return m[1].length
  return -1
}

/**
 * Analyze a document and return all task entries plus fence line numbers.
 * @param {string|import('@codemirror/state').Text} doc
 * @returns {{ entries: TaskEntry[], fenceLines: Set<number>, lines: Object[] }}
 */
export function analyzeTasks(doc) {
  const lines = analyzeLines(doc)
  const entries = []
  const fenceLines = new Set()
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const { text, from } = lines[i]
    if (FENCE_RE.test(text)) {
      fenceLines.add(i + 1)
      inFence = !inFence
      continue
    }
    lines[i].inFence = inFence
    if (inFence) continue

    const match = matchTaskLine(text)
    if (match) {
      const boxFrom = from + match.boxStart
      entries.push({
        number: i + 1,
        from,
        to: lines[i].to,
        indent: match.indent,
        ordered: match.ordered,
        boxFrom,
        boxCharOffset: boxFrom + 1,
        boxTo: boxFrom + 2,
        status: markerStatus(match.marker),
        marker: match.marker
      })
    }
  }

  return { entries, fenceLines, lines }
}

/**
 * Collect task entries nested underneath the entry on `lineNumber`.
 * The group is the whole nested subtree: every task more indented than the
 * anchor, regardless of intermediate plain bullets or deeper task parents.
 * Blank lines and indented paragraph continuation stay inside; a line
 * dedented back to the anchor level (or shallower), or a top-level non-list
 * line, ends the group.
 */
export function collectDescendants(entries, lineNumber, lines) {
  const anchor = entries.find(e => e.number === lineNumber)
  if (!anchor) return []

  const result = []
  const byNumber = new Map(entries.map(e => [e.number, e]))
  for (let i = lineNumber; i < lines.length; i++) {
    // i is 0-based here; lineNumber is 1-based, so this starts at the first
    // line AFTER the anchor.
    const { text, inFence } = lines[i]
    if (inFence) continue
    if (text.trim() === '') continue
    const indent = listLineIndent(text)
    if (indent === -1) {
      // Non-list content only breaks the group when it is not nested into
      // the parent item (paragraph continuation stays inside).
      if (/^\s/.test(text)) continue
      break
    }
    if (indent <= anchor.indent) break
    const task = byNumber.get(i + 1)
    if (task) result.push(task)
  }
  return result
}

/**
 * Aggregate progress statistics for a document.
 * @returns {{total:number, done:number, unknown:number, percent:number}}
 */
export function getTaskStats(doc) {
  const { entries } = analyzeTasks(doc)
  let done = 0
  let unknown = 0
  for (const e of entries) {
    if (e.status === true) done++
    else if (e.status === null) unknown++
  }
  const total = entries.length
  return {
    total,
    done,
    unknown,
    percent: total ? Math.round((done / total) * 100) : 0
  }
}

/**
 * Group state for a parent entry, based on its known-status descendants
 * plus the entry itself.
 * @returns {'all'|'none'|'some'|'unknown'}
 */
export function getGroupState(entries, lineNumber, lines) {
  const anchor = entries.find(e => e.number === lineNumber)
  if (!anchor) return 'unknown'
  const scope = [anchor, ...collectDescendants(entries, lineNumber, lines)]
  if (scope.length <= 1) {
    return anchor.status === true ? 'all' : anchor.status === false ? 'none' : 'unknown'
  }
  const known = scope.filter(e => e.status !== null)
  if (known.length === 0) return 'unknown'
  if (known.every(e => e.status === true)) return 'all'
  if (known.every(e => e.status === false)) return 'none'
  return 'some'
}

/**
 * Decide which checkbox replacements a click (or a multi-line selection click)
 * should perform.
 *
 * Rules:
 * - Multiple task lines selected + click inside the selection → batch mode:
 *   every known task in the selected lines is flipped uniformly; unknown
 *   markers are left untouched (explicit conversion only happens on a direct,
 *   single click).
 * - Otherwise, single-click on an unknown marker converts it to [x].
 * - Otherwise, the group (entry + nested descendants) is toggled; unknown
 *   descendants are preserved.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos document position of the clicked checkbox
 * @returns {{changes: {from:number,to:number,insert:string}[], target: TaskEntry|null}}
 */
export function planTaskChanges(state, pos) {
  const { entries, lines } = analyzeTasks(state.doc)
  const target = entries.find(e => pos >= e.boxFrom && pos <= e.boxTo) || null
  if (!target) return { changes: [], target: null }

  const main = state.selection.main
  const multiLine = !main.empty && state.doc.lineAt(main.from).number !== state.doc.lineAt(main.to).number
  const clickInsideSelection = pos >= Math.min(main.from, main.to) && pos <= Math.max(main.from, main.to)

  let scope
  let mode // 'batch' | 'group' | 'self'

  if (multiLine && clickInsideSelection) {
    mode = 'batch'
    const fromLine = state.doc.lineAt(Math.min(main.from, main.to)).number
    const toLine = state.doc.lineAt(Math.max(main.from, main.to)).number
    scope = entries.filter(e => e.number >= fromLine && e.number <= toLine)
  } else if (target.status === null) {
    // Direct click on an unknown marker — an explicit normalization.
    mode = 'self'
    scope = [target]
  } else {
    mode = 'group'
    const descendants = collectDescendants(entries, target.number, lines)
    scope = [target, ...descendants]
  }

  const changes = []

  if (mode === 'self') {
    if (target.marker !== 'x') {
      changes.push({ from: target.boxCharOffset, to: target.boxCharOffset + 1, insert: 'x' })
    }
    return { changes, target }
  }

  // Known-status items decide the uniform target state.
  const known = scope.filter(e => e.status !== null)
  if (known.length === 0) return { changes: [], target }
  const targetChecked = !known.every(e => e.status === true)

  for (const e of scope) {
    if (e.status === null) continue // unknown markers are never rewritten in bulk
    const isChecked = e.status === true
    if (isChecked !== targetChecked) {
      changes.push({
        from: e.boxCharOffset,
        to: e.boxCharOffset + 1,
        insert: targetChecked ? 'x' : ' '
      })
    }
  }
  return { changes, target }
}
