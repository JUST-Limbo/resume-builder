export type ResumeModuleBlock = {
  id: string
  title: string
  markdown: string
}

export type ParsedResumeModules = {
  preamble: string
  modules: ResumeModuleBlock[]
}

type ModuleStart = {
  offset: number
  title: string
}

/**
 * 按 Markdown 二级标题拆分简历模块，首个二级标题之前的姓名、联系方式等归入 preamble。
 * 围栏代码块内的 `##` 不视为模块，避免代码示例被误拆。
 *
 * 用例：`# 张三\n\n## 经历\n正文\n## 项目\n正文` → preamble + 两个模块。
 * 用例：```` ```md\n## 示例\n``` ```` → 不产生模块。
 * 用例：`## 经历 ##` → 标题解析为“经历”，原 Markdown 保持不变。
 */
export const parseResumeModules = (markdown: string): ParsedResumeModules => {
  const starts: ModuleStart[] = []
  const linePattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g
  let fenceCharacter = ''
  let fenceLength = 0
  let lineMatch = linePattern.exec(markdown)

  while (lineMatch !== null) {
    const lineWithEnding = lineMatch[0]
    if (lineWithEnding.length === 0) break

    const line = lineWithEnding.replace(/(?:\r\n|\n|\r)$/, '')
    const fenceMatch = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/)
    if (fenceMatch !== null) {
      const marker = fenceMatch[1]
      const character = marker.charAt(0)
      if (fenceCharacter.length === 0) {
        fenceCharacter = character
        fenceLength = marker.length
      } else if (
        character === fenceCharacter &&
        marker.length >= fenceLength &&
        /^[ \t]{0,3}(?:`+|~+)[ \t]*$/.test(line)
      ) {
        fenceCharacter = ''
        fenceLength = 0
      }
      lineMatch = linePattern.exec(markdown)
      continue
    }

    if (fenceCharacter.length === 0) {
      const headingMatch = line.match(/^[ \t]{0,3}##(?!#)[ \t]+(.+?)[ \t]*$/)
      if (headingMatch !== null) {
        const title = headingMatch[1].replace(/[ \t]+#+[ \t]*$/, '').trim()
        starts.push({
          offset: lineMatch.index,
          title: title.length > 0 ? title : '未命名模块',
        })
      }
    }

    lineMatch = linePattern.exec(markdown)
  }

  if (starts.length === 0) return { preamble: markdown, modules: [] }

  const modules = starts.map((start, index) => {
    const next = starts[index + 1]
    const end = next === undefined ? markdown.length : next.offset
    return {
      id: `module-${index}-${start.offset}`,
      title: start.title,
      markdown: markdown.slice(start.offset, end),
    }
  })

  return {
    preamble: markdown.slice(0, starts[0].offset),
    modules,
  }
}

/**
 * 将模块草稿重新拼接为 Markdown；各块保留原始换行与内容，仅改变块顺序或删除整块。
 *
 * 用例：模块顺序 `[经历, 项目]` 调整为 `[项目, 经历]` 时，preamble 始终保持在最前。
 * 用例：删除全部模块时只保留姓名、联系方式等 preamble。
 */
export const serializeResumeModules = (
  preamble: string,
  modules: readonly ResumeModuleBlock[],
): string => preamble + modules.map((module) => module.markdown).join('')
