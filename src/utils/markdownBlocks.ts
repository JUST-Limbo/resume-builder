/**
 * 将 Markdown 按「空行」切成可独立编辑的块（近似 Typora 的块级编辑）。
 *
 * 用例：
 * - 普通段落、标题：空行分隔后各成一块
 * - 列表项连续多行且中间无空行：保持为同一块
 * - 代码围栏 ``` 内的空行不切开
 * - 仅空白文档：返回一个空字符串块，便于直接点击编辑
 */
export const splitMarkdownBlocks = (source: string): string[] => {
  const normalized = source.replace(/\r\n/g, '\n')
  if (normalized.trim().length === 0) return ['']

  const lines = normalized.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false

  const flush = () => {
    if (current.length === 0) return
    blocks.push(current.join('\n'))
    current = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
      current.push(line)
      continue
    }
    if (!inFence && trimmed.length === 0) {
      flush()
      continue
    }
    current.push(line)
  }
  flush()

  return blocks.length > 0 ? blocks : ['']
}

/**
 * 用空行把块拼回完整 Markdown。
 *
 * 用例：块 A=`# 标题`、块 B=`- 条目` → `# 标题\n\n- 条目`
 */
export const joinMarkdownBlocks = (blocks: string[]): string => {
  const meaningful = blocks.map((block) => block.replace(/\s+$/g, '')).filter((block, index, list) => {
    if (block.length > 0) return true
    return list.length === 1 && index === 0
  })
  if (meaningful.length === 0) return ''
  return meaningful.join('\n\n')
}
