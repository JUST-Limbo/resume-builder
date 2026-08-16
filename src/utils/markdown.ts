import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

const PAGE_BREAK_MARKER = 'RESUME_MANUAL_PAGE_BREAK_8D47A5'

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: false,
})

/**
 * 渲染简历 Markdown，并转换两项简历专用约定：
 *
 * - `### 公司 || 日期` 转为左右布局。
 * - 独占一行的 `\newpage` 转为手动分页标记。
 *
 * 原始 HTML 被关闭，最终结果还会经过 DOMPurify，避免备份文件注入脚本。
 */
export const renderResumeMarkdown = (source: string) => {
  const normalized = source
    .split(/\r?\n/)
    .map((line) => (line.trim() === '\\newpage' ? PAGE_BREAK_MARKER : line))
    .join('\n')

  const cleanHtml = DOMPurify.sanitize(markdown.render(normalized), {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  })
  const container = document.createElement('div')
  container.innerHTML = cleanHtml

  const rowCandidates = container.querySelectorAll('h3, p')
  for (const element of Array.from(rowCandidates)) {
    const text = element.textContent
    if (text === null || !text.includes('||')) continue
    const separatorIndex = text.indexOf('||')
    const left = text.slice(0, separatorIndex).trim()
    const right = text.slice(separatorIndex + 2).trim()
    if (left.length === 0 || right.length === 0) continue

    element.textContent = ''
    element.classList.add('resume-row')
    const leftElement = document.createElement('span')
    const rightElement = document.createElement('span')
    leftElement.className = 'resume-row-main'
    rightElement.className = 'resume-row-side'
    leftElement.textContent = left
    rightElement.textContent = right
    element.append(leftElement, rightElement)
  }

  const paragraphs = container.querySelectorAll('p')
  for (const paragraph of Array.from(paragraphs)) {
    if (paragraph.textContent !== PAGE_BREAK_MARKER) continue
    const marker = document.createElement('div')
    marker.className = 'resume-manual-page-break'
    paragraph.replaceWith(marker)
  }

  const nameHeading = container.querySelector('h1')
  if (nameHeading !== null) {
    nameHeading.classList.add('resume-name')
    let sibling = nameHeading.nextElementSibling
    while (sibling !== null && sibling.tagName !== 'H2') {
      sibling.classList.add('resume-profile-line')
      sibling = sibling.nextElementSibling
    }
  }

  for (const heading of Array.from(container.querySelectorAll('h2'))) {
    heading.classList.add('resume-section')
  }
  for (const heading of Array.from(container.querySelectorAll('h3'))) {
    heading.classList.add('resume-entry')
  }

  for (const anchor of Array.from(container.querySelectorAll('a'))) {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noreferrer noopener')
  }

  return container.innerHTML
}
