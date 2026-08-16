/**
 * 将 Custom CSS 限定到缩略图表面，并把预览/编辑器里的页面容器选择器
 * 映射到缩略图对应节点，使同一套 customCss 三处观感一致。
 *
 * 用例：`.resume-page { border-top: 6px solid #123 }` → 缩略图页顶色带
 * 用例：`h2 { color: #123 }` → 仅作用于该缩略图内容区
 */
export const scopeResumeCustomCss = (css: string, surfaceId: string): string => {
  const trimmed = css.trim()
  if (trimmed.length === 0) return ''

  const root = `[data-resume-thumb="${CSS.escape(surfaceId)}"]`
  const pageSel = `${root} .resume-thumb__page`
  const contentSel = `${root} .resume-thumb__content`

  const rewriteSelector = (raw: string): string => {
    const sel = raw.trim()
    if (sel.length === 0) return sel
    if (/\.resume-page\b|\.typora-page\b/.test(sel)) {
      return sel
        .replace(/\.resume-page\b/g, pageSel)
        .replace(/\.typora-page\b/g, pageSel)
    }
    if (/\.resume-content\b|\.ProseMirror\b|\.resume-doc\b|\.resume-thumb__content\b/.test(sel)) {
      return sel
        .replace(/\.resume-content\b/g, contentSel)
        .replace(/\.ProseMirror\b/g, contentSel)
        .replace(/\.resume-doc\b/g, contentSel)
        .replace(/\.resume-thumb__content\b/g, contentSel)
    }
    if (sel.startsWith(root) || sel.startsWith(pageSel) || sel.startsWith(contentSel)) {
      return sel
    }
    return `${contentSel} ${sel}`
  }

  const rules: string[] = []
  const ruleRe = /([^{}@]+)\{([^{}]*)\}/g
  let match = ruleRe.exec(trimmed)
  while (match !== null) {
    const selectorGroup = match[1].trim()
    const body = match[2]
    if (selectorGroup.length > 0) {
      const scoped = selectorGroup
        .split(',')
        .map(rewriteSelector)
        .filter((item) => item.length > 0)
        .join(', ')
      if (scoped.length > 0) rules.push(`${scoped} {${body}}`)
    }
    match = ruleRe.exec(trimmed)
  }

  if (rules.length === 0) {
    return `${contentSel} { ${trimmed} }`
  }
  return rules.join('\n')
}
