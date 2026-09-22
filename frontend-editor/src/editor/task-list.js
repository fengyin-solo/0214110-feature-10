import { parseMarkdownRegions } from './markdown-parser'

/**
 * Task list operations.
 *
 * 所有函数都是纯计算：根据当前文档文本推导任务项与变更集，
 * 不缓存任何状态 —— 因此撤销、重做、重开文稿后行为始终一致。
 *
 * 关键不变量：所有切换都是「单字符替换单字符」（` ` ↔ `x`），
 * 文档长度与位置永不偏移，连续点击不会相互干扰。
 */

/**
 * 收集文档中的全部任务项。
 * @param {string} doc - 文档全文
 * @returns {Array<{checkFrom:number, markPos:number, marker:string,
 *                  checked:boolean, known:boolean, from:number, to:number}>}
 */
export function collectTaskItems(doc) {
  return parseMarkdownRegions(doc)
    .filter((r) => r.type === 'task-list')
    .map((r) => ({
      checkFrom: r.meta.checkFrom,
      markPos: r.meta.checkFrom + 1, // 标记字符在 [ ] 中间
      marker: r.meta.marker,
      checked: r.meta.checked,
      known: r.meta.known,
      from: r.from,
      to: r.to
    }))
}

/**
 * 统计任务进度。未知标记计入总数但不算完成。
 * @param {string} doc
 * @returns {{ total: number, done: number }}
 */
export function taskProgress(doc) {
  const items = collectTaskItems(doc)
  return { total: items.length, done: items.filter((i) => i.checked).length }
}

/**
 * 生成「切换单个任务」的变更集。
 *
 * 派发前重新读取当前文档中该位置的字符并校验：
 * - 连续快速点击时，即使 Widget 持有的是过期位置/状态，
 *   也只会按「当前真实字符」翻转，绝不会把错误的字符写到错误的位置；
 * - 未知标记（[-]、[?] 等）返回 null，调用方不应修改，
 *   保证未知完成状态不串行、不丢失。
 *
 * @param {EditorState} state
 * @param {number} checkFrom - `[` 的位置
 * @returns {Array|null} changes 数组，或 null 表示不可切换
 */
export function toggleTaskChanges(state, checkFrom) {
  const markPos = checkFrom + 1
  if (checkFrom < 0 || markPos >= state.doc.length) return null
  // 校验位置确实是一个任务复选框
  if (state.doc.sliceString(checkFrom, checkFrom + 1) !== '[') return null
  if (state.doc.sliceString(checkFrom + 2, checkFrom + 3) !== ']') return null

  const current = state.doc.sliceString(markPos, markPos + 1)
  if (current === ' ') return [{ from: markPos, to: markPos + 1, insert: 'x' }]
  if (current === 'x' || current === 'X') {
    return [{ from: markPos, to: markPos + 1, insert: ' ' }]
  }
  return null // 未知标记：只读，不修改
}

/**
 * 生成「批量设置完成状态」的变更集。
 *
 * - 仅处理已知标记（[ ] / [x] / [X]），未知标记原样保留；
 * - 已处于目标状态的项自动跳过（幂等，重复执行无副作用）；
 * - 返回的数组合并为一次 dispatch，即一个撤销单元；
 * - range 为 null 时作用于全文，否则仅作用于与选区相交的任务行。
 *
 * @param {EditorState} state
 * @param {boolean} checked - 目标状态：true 勾选，false 取消
 * @param {{from:number, to:number}|null} [range]
 * @returns {Array} changes 数组（可能为空）
 */
export function setTasksChanges(state, checked, range = null) {
  const items = collectTaskItems(state.doc.toString())
  const changes = []
  for (const item of items) {
    if (!item.known) continue // 未知标记不串改
    if (range && (item.to < range.from || item.from > range.to)) continue
    if (item.checked === checked) continue // 幂等：跳过已就绪的项
    changes.push({
      from: item.markPos,
      to: item.markPos + 1,
      insert: checked ? 'x' : ' '
    })
  }
  return changes
}
