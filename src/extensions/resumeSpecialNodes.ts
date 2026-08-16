import { mergeAttributes, Node } from '@tiptap/core'

/**
 * 解析简历双栏行源码，例如 `### 公司 || 日期`。
 *
 * 用例：
 * - `### A || B` → level=3, left=A, right=B
 * - `A || B` → level=0（段落）
 * - 任一侧为空则视为无效
 */
export const parseResumeRowRaw = (
  raw: string,
): { level: number; left: string; right: string } | null => {
  const trimmed = raw.replace(/\r\n/g, '\n').trim()
  if (trimmed.length === 0 || !trimmed.includes('||')) return null

  let level = 0
  let body = trimmed
  const headingMatch = trimmed.match(/^(#{1,6})\s+([\s\S]+)$/)
  if (headingMatch !== null) {
    level = headingMatch[1].length
    body = headingMatch[2].trim()
  }

  const separatorIndex = body.indexOf('||')
  if (separatorIndex < 0) return null
  const left = body.slice(0, separatorIndex).trim()
  const right = body.slice(separatorIndex + 2).trim()
  if (left.length === 0 || right.length === 0) return null
  return { level, left, right }
}

/**
 * 从解析结果拼回无损源码行。
 *
 * 用例：level=3,left=公司,right=2020 → `### 公司 || 2020`
 */
export const formatResumeRowRaw = (level: number, left: string, right: string): string => {
  const body = `${left.trim()} || ${right.trim()}`
  if (level <= 0) return body
  return `${'#'.repeat(Math.min(level, 6))} ${body}`
}

const isTableLine = (line: string): boolean => {
  const trimmed = line.trim()
  if (trimmed.length === 0) return false
  if (/^\|?[\s:|-]+\|[\s:|-]*\|?$/.test(trimmed)) return true
  return trimmed.includes('|') && /^\s*\|.*\|\s*$/.test(line)
}

/**
 * 独占一行的 `\newpage` → 分页原子节点；序列化仍输出 `\newpage`。
 */
export const ResumePageBreak = Node.create({
  name: 'resumePageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  priority: 1100,

  parseHTML() {
    return [{ tag: 'div[data-type="resume-page-break"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'resume-page-break',
        class: 'resume-manual-page-break',
        contenteditable: 'false',
      }),
    ]
  },

  addNodeView() {
    return () => {
      const dom = document.createElement('div')
      dom.className = 'resume-manual-page-break'
      dom.setAttribute('data-type', 'resume-page-break')
      dom.contentEditable = 'false'
      dom.title = '手动分页（\\newpage）'
      const label = document.createElement('span')
      label.className = 'resume-manual-page-break__label'
      label.textContent = '分页'
      dom.appendChild(label)
      return {
        dom,
        contentDOM: null,
        // 视觉分页会改 minHeight / class，不视为文档变更
        ignoreMutation: () => true,
      }
    }
  },

  markdownTokenName: 'resumePageBreak',

  parseMarkdown: (_token, helpers) => helpers.createNode('resumePageBreak'),

  renderMarkdown: () => '\\newpage',

  markdownTokenizer: {
    name: 'resumePageBreak',
    level: 'block',
    start(src: string) {
      const match = src.match(/(?:^|\n)[ \t]*\\newpage[ \t]*(?=\n|$)/)
      if (match === null || match.index === undefined) return -1
      return match.index + (match[0].startsWith('\n') ? 1 : 0)
    },
    tokenize(src: string) {
      const match = src.match(/^[ \t]*\\newpage[ \t]*(?:\n|$)/)
      if (match === null) return undefined
      return {
        type: 'resumePageBreak',
        raw: match[0],
      }
    },
  },
})

/**
 * `### A || B` 双栏行：只读成稿渲染，点进源码编辑，禁止 HTML 往返拆丢 `||`。
 */
export const ResumeRow = Node.create({
  name: 'resumeRow',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  priority: 1050,

  addAttributes() {
    return {
      raw: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-raw') || '',
        renderHTML: (attributes) => ({ 'data-raw': attributes.raw }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="resume-row"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'resume-row',
        'data-raw': node.attrs.raw,
        class: 'resume-row-block',
        contenteditable: 'false',
      }),
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.className = 'resume-row-block'
      dom.setAttribute('data-type', 'resume-row')
      dom.contentEditable = 'false'

      const renderView = document.createElement('div')
      renderView.className = 'resume-row-block__view'
      const sourceView = document.createElement('textarea')
      sourceView.className = 'resume-row-block__source'
      sourceView.rows = 1
      sourceView.spellcheck = false
      sourceView.setAttribute('aria-label', '编辑双栏行 Markdown')

      let editing = false

      const paint = (raw: string) => {
        const parsed = parseResumeRowRaw(raw)
        dom.setAttribute('data-raw', raw)
        sourceView.value = raw
        renderView.textContent = ''
        if (parsed === null) {
          renderView.className = 'resume-row-block__view resume-row-block__view--invalid'
          renderView.textContent = raw || '无效的双栏行'
          return
        }
        renderView.className = 'resume-row-block__view resume-row'
        if (parsed.level > 0) renderView.dataset.level = String(parsed.level)
        else delete renderView.dataset.level
        const left = document.createElement('span')
        const right = document.createElement('span')
        left.className = 'resume-row-main'
        right.className = 'resume-row-side'
        left.textContent = parsed.left
        right.textContent = parsed.right
        renderView.append(left, right)
      }

      const showRender = () => {
        editing = false
        sourceView.replaceWith(renderView)
      }

      const showSource = () => {
        editing = true
        renderView.replaceWith(sourceView)
        sourceView.focus()
        const length = sourceView.value.length
        sourceView.setSelectionRange(length, length)
      }

      const commit = () => {
        if (!editing) return
        const nextRaw = sourceView.value.replace(/\r\n/g, '\n').trim()
        const pos = getPos()
        if (typeof pos === 'number') {
          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, { raw: nextRaw })
              return true
            })
            .run()
        }
        paint(nextRaw)
        showRender()
      }

      paint(String(node.attrs.raw || ''))
      dom.appendChild(renderView)

      renderView.addEventListener('mousedown', (event) => {
        event.preventDefault()
        showSource()
      })
      sourceView.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          event.preventDefault()
          commit()
        }
        event.stopPropagation()
      })
      sourceView.addEventListener('blur', () => {
        commit()
      })
      sourceView.addEventListener('mousedown', (event) => {
        event.stopPropagation()
      })

      return {
        dom,
        contentDOM: null,
        update: (updated) => {
          if (updated.type.name !== 'resumeRow') return false
          if (!editing) paint(String(updated.attrs.raw || ''))
          return true
        },
        stopEvent: (event) => {
          if (!editing) return false
          return event.target === sourceView
        },
        ignoreMutation: () => true,
      }
    }
  },

  markdownTokenName: 'resumeRow',

  parseMarkdown: (token, helpers) =>
    helpers.createNode('resumeRow', { raw: String(token.raw || '').replace(/\n$/, '') }),

  renderMarkdown: (node) => String(node.attrs?.raw || ''),

  markdownTokenizer: {
    name: 'resumeRow',
    level: 'block',
    start(src: string) {
      const lines = src.split('\n')
      let offset = 0
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        if (parseResumeRowRaw(line) !== null) return offset
        offset += line.length + 1
      }
      return -1
    },
    tokenize(src: string) {
      const lineEnd = src.indexOf('\n')
      const line = lineEnd < 0 ? src : src.slice(0, lineEnd)
      if (parseResumeRowRaw(line) === null) return undefined
      const raw = lineEnd < 0 ? line : `${line}\n`
      return {
        type: 'resumeRow',
        raw,
      }
    },
  },
})

type SourceBlockToken = {
  type: string
  raw: string
  label?: string
}

/**
 * 表格等难行内编辑内容：整块保留源码，点进 textarea 编辑。
 */
export const ResumeSourceBlock = Node.create({
  name: 'resumeSourceBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  priority: 1000,

  addAttributes() {
    return {
      raw: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-raw') || '',
        renderHTML: (attributes) => ({ 'data-raw': attributes.raw }),
      },
      label: {
        default: '源码块',
        parseHTML: (element) => element.getAttribute('data-label') || '源码块',
        renderHTML: (attributes) => ({ 'data-label': attributes.label }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="resume-source-block"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'resume-source-block',
        'data-raw': node.attrs.raw,
        'data-label': node.attrs.label,
        class: 'resume-source-block',
        contenteditable: 'false',
      }),
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.className = 'resume-source-block'
      dom.setAttribute('data-type', 'resume-source-block')
      dom.contentEditable = 'false'

      const badge = document.createElement('div')
      badge.className = 'resume-source-block__badge'
      const pre = document.createElement('pre')
      pre.className = 'resume-source-block__pre'
      const source = document.createElement('textarea')
      source.className = 'resume-source-block__source'
      source.spellcheck = false

      let editing = false
      let currentLabel = String(node.attrs.label || '源码块')

      const paint = (raw: string, label: string) => {
        currentLabel = label
        badge.textContent = `${label} · 点击编辑源码`
        pre.textContent = raw
        source.value = raw
        dom.setAttribute('data-raw', raw)
        dom.setAttribute('data-label', label)
      }

      const showRender = () => {
        editing = false
        if (source.parentElement === dom) source.replaceWith(pre)
      }

      const showSource = () => {
        editing = true
        if (pre.parentElement === dom) pre.replaceWith(source)
        source.focus()
      }

      const commit = () => {
        if (!editing) return
        const nextRaw = source.value.replace(/\r\n/g, '\n').replace(/\s+$/g, '')
        const pos = getPos()
        if (typeof pos === 'number') {
          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, {
                raw: nextRaw,
                label: currentLabel,
              })
              return true
            })
            .run()
        }
        paint(nextRaw, currentLabel)
        showRender()
      }

      paint(String(node.attrs.raw || ''), currentLabel)
      dom.append(badge, pre)

      badge.addEventListener('mousedown', (event) => {
        event.preventDefault()
        showSource()
      })
      pre.addEventListener('mousedown', (event) => {
        event.preventDefault()
        showSource()
      })
      source.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          event.preventDefault()
          commit()
        }
        event.stopPropagation()
      })
      source.addEventListener('blur', () => commit())
      source.addEventListener('mousedown', (event) => event.stopPropagation())

      return {
        dom,
        contentDOM: null,
        update: (updated) => {
          if (updated.type.name !== 'resumeSourceBlock') return false
          if (!editing) {
            paint(String(updated.attrs.raw || ''), String(updated.attrs.label || '源码块'))
          }
          return true
        },
        stopEvent: (event) => editing && event.target === source,
        ignoreMutation: () => true,
      }
    }
  },

  markdownTokenName: 'resumeSourceBlock',

  parseMarkdown: (token, helpers) => {
    const sourceToken = token as SourceBlockToken
    return helpers.createNode('resumeSourceBlock', {
      raw: String(sourceToken.raw || '').replace(/\n$/, ''),
      label: sourceToken.label || '表格',
    })
  },

  renderMarkdown: (node) => String(node.attrs?.raw || ''),

  markdownTokenizer: {
    name: 'resumeSourceBlock',
    level: 'block',
    start(src: string) {
      const lines = src.split('\n')
      let offset = 0
      for (let index = 0; index < lines.length; index += 1) {
        if (isTableLine(lines[index])) return offset
        offset += lines[index].length + 1
      }
      return -1
    },
    tokenize(src: string) {
      const lines = src.split('\n')
      if (!isTableLine(lines[0])) return undefined
      const collected: string[] = []
      for (const line of lines) {
        if (!isTableLine(line)) break
        collected.push(line)
      }
      if (collected.length === 0) return undefined
      const raw = `${collected.join('\n')}\n`
      return {
        type: 'resumeSourceBlock',
        raw,
        label: '表格',
      }
    },
  },
})
