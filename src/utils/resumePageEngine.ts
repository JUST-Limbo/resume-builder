import type { ResumeDocumentV1, ResumeStyles } from '../types/resume'
import {
  buildResumeDocumentCss,
  buildResumeSurfaceVars,
  ensureResumeFonts,
  sanitizeResumeCustomCss,
  snapResumeSectionRules,
  varsToCssDeclarations,
} from './resumeDocumentStyles'
import { renderResumeMarkdown } from './markdown'
import {
  KEEP_MAX_BLANK_RATIO,
  collectDomKeepProbeClones,
  resolveDomKeepKind,
} from './a4Layout'

export const PAGE_WIDTH_MM = 210
export const PAGE_HEIGHT_MM = 297
export const PAGE_WIDTH_PX = (PAGE_WIDTH_MM / 25.4) * 96
export const PAGE_HEIGHT_PX = (PAGE_HEIGHT_MM / 25.4) * 96

/**
 * 生成预览 / 导出共用的简历样式表。
 * 正文排版来自 buildResumeDocumentCss（与编辑器同源）；此处只保留纸张壳、缩放与打印规则。
 * zoom=1 用于 PDF 导出（无缩放变换）；预览区按可用宽度缩小。
 */
export const buildStyleSheet = (styles: ResumeStyles, scale: number, zoom: number) => {
  const vars = buildResumeSurfaceVars(styles, scale)
  const documentCss = buildResumeDocumentCss('.resume-content')

  return `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    * {
      scrollbar-width: thin;
      scrollbar-color: #c5cacd transparent;
    }
    *::-webkit-scrollbar { width: 8px; height: 8px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb {
      background-color: #c5cacd;
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: content-box;
    }
    *::-webkit-scrollbar-thumb:hover { background-color: #a8adb0; }
    *::-webkit-scrollbar-corner { background: transparent; }
    html, body { margin: 0; min-height: 100%; }
    body {
      padding: 28px;
      color: ${styles.textColor};
      background: #e9ecee;
      font-family: ${vars['--resume-font']};
      font-synthesis: none;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #resume-source { display: none; }
    #resume-pages {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    .page-shell {
      position: relative;
      flex: 0 0 auto;
      width: ${PAGE_WIDTH_PX * zoom}px;
      height: ${PAGE_HEIGHT_PX * zoom}px;
    }
    .resume-page {
      position: absolute;
      inset: 0 auto auto 0;
      width: 210mm;
      height: 297mm;
      padding: ${styles.marginY}mm ${styles.marginX}mm;
      overflow: hidden;
      color: ${styles.textColor};
      background: #fff;
      box-shadow: 0 10px 32px rgba(30, 38, 43, 0.14);
      transform: scale(${zoom});
      transform-origin: top left;
    }
    .resume-content {
      ${varsToCssDeclarations(vars)}
      width: 100%;
      height: 100%;
      overflow: hidden;
      color: var(--resume-text);
      font-family: var(--resume-font);
      font-size: var(--resume-body);
      line-height: var(--resume-line);
      font-synthesis: none;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    ${documentCss}
    .resume-overflow {
      outline: 1px dashed #b42318;
      outline-offset: 2px;
    }
    @media print {
      @page { size: A4; margin: 0; }
      * { scrollbar-width: none; }
      *::-webkit-scrollbar { width: 0; height: 0; }
      html, body {
        width: 210mm;
        background: #fff;
        color: ${styles.textColor};
        font-family: ${vars['--resume-font']};
        font-synthesis: none;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body { padding: 0; }
      #resume-pages { display: block; }
      .page-shell {
        width: 210mm !important;
        height: 297mm !important;
        margin: 0 !important;
      }
      .resume-page {
        position: relative;
        width: 210mm;
        height: 297mm;
        color: ${styles.textColor};
        box-shadow: none;
        transform: none !important;
        break-after: page;
        page-break-after: always;
      }
      .resume-content {
        color: var(--resume-text);
        font-family: var(--resume-font);
        font-size: var(--resume-body);
        line-height: var(--resume-line);
      }
      .page-shell:last-child .resume-page {
        break-after: auto;
        page-break-after: auto;
      }
      .resume-overflow { outline: none; }
    }
  `
}

export const waitForFrame = (frameWindow: Window) =>
  new Promise<void>((resolve) => {
    frameWindow.requestAnimationFrame(() => {
      frameWindow.requestAnimationFrame(() => resolve())
    })
  })

export const waitForImages = async (iframeDocument: Document) => {
  const pending = Array.from(iframeDocument.images).filter((image) => !image.complete)
  if (pending.length === 0) return

  await Promise.all(
    pending.map(
      (image) =>
        new Promise<void>((resolve) => {
          const finish = () => resolve()
          image.addEventListener('load', finish, { once: true })
          image.addEventListener('error', finish, { once: true })
          setTimeout(finish, 1500)
        }),
    ),
  )
}

const hasContent = (container: HTMLElement) => container.children.length > 0

/**
 * 将 #resume-source 子节点按 A4 可容纳高度分页写入 #resume-pages。
 * 返回页数。
 * @param smartPagination 开启时应用 keep-with-next；关闭时仅按高度/列表条目续排。
 */
export const paginate = (
  iframeDocument: Document,
  zoom: number,
  smartPagination = false,
) => {
  const source = iframeDocument.querySelector<HTMLElement>('#resume-source')
  const pagesRoot = iframeDocument.querySelector<HTMLElement>('#resume-pages')
  if (source === null || pagesRoot === null) return 0

  const nodes = Array.from(source.children)
  pagesRoot.textContent = ''
  let currentContent: HTMLElement

  const createPage = () => {
    const shell = iframeDocument.createElement('div')
    const page = iframeDocument.createElement('section')
    const content = iframeDocument.createElement('div')
    shell.className = 'page-shell'
    shell.style.width = `${PAGE_WIDTH_PX * zoom}px`
    shell.style.height = `${PAGE_HEIGHT_PX * zoom}px`
    page.className = 'resume-page'
    content.className = 'resume-content'
    page.appendChild(content)
    shell.appendChild(page)
    pagesRoot.appendChild(shell)
    currentContent = content
    return content
  }

  currentContent = createPage()

  const fits = () => currentContent.scrollHeight <= currentContent.clientHeight + 1

  const addList = (list: Element) => {
    let targetList = list.cloneNode(false) as HTMLElement
    currentContent.appendChild(targetList)

    for (const child of Array.from(list.children)) {
      const item = child.cloneNode(true) as HTMLElement
      targetList.appendChild(item)
      if (fits()) continue

      targetList.removeChild(item)
      if (targetList.children.length === 0) currentContent.removeChild(targetList)
      currentContent = createPage()
      targetList = list.cloneNode(false) as HTMLElement
      currentContent.appendChild(targetList)
      targetList.appendChild(item)
      if (!fits()) item.classList.add('resume-overflow')
    }
  }

  const addNode = (node: Element) => {
    const clone = node.cloneNode(true) as HTMLElement
    currentContent.appendChild(clone)
    if (fits()) return

    currentContent.removeChild(clone)
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      addList(node)
      return
    }

    if (hasContent(currentContent)) currentContent = createPage()
    currentContent.appendChild(clone)
    if (!fits()) clone.classList.add('resume-overflow')
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node.classList.contains('resume-manual-page-break')) {
      if (hasContent(currentContent) && index < nodes.length - 1) currentContent = createPage()
      continue
    }

    if (smartPagination) {
      const keepKind = resolveDomKeepKind(node)
      if (keepKind !== 'none' && hasContent(currentContent)) {
        const remain = Math.max(0, currentContent.clientHeight - currentContent.scrollHeight)
        const maxBlank = currentContent.clientHeight * KEEP_MAX_BLANK_RATIO
        const probes = collectDomKeepProbeClones(nodes, index)
        for (const probe of probes) {
          currentContent.appendChild(probe)
        }
        const keepsTogether = fits()
        for (const probe of probes) {
          currentContent.removeChild(probe)
        }

        // 与 shouldBreakBeforeKeep 对齐：放不下且剩余空白可接受时才整块下移
        if (!keepsTogether && remain <= maxBlank) {
          currentContent = createPage()
        }
      }
    }

    addNode(node)
  }

  const lastShell = pagesRoot.lastElementChild
  if (lastShell !== null) {
    const lastContent = lastShell.querySelector('.resume-content')
    if (lastContent !== null && lastContent.children.length === 0 && pagesRoot.children.length > 1) {
      pagesRoot.removeChild(lastShell)
    }
  }

  return pagesRoot.children.length
}

export type RenderResumeOptions = {
  scale: number
  zoom: number
  /** 导出时去掉阴影、灰底，便于截图 */
  forExport?: boolean
}

/**
 * 向已有 iframe document 写入并分页渲染一份简历，返回页数。
 */
export const renderResumeIntoFrame = async (
  iframeDocument: Document,
  iframeWindow: Window,
  doc: ResumeDocumentV1,
  options: RenderResumeOptions,
) => {
  const { scale, zoom, forExport = false } = options
  const html = renderResumeMarkdown(doc.markdown)

  iframeDocument.open()
  iframeDocument.write(
    '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>简历预览</title></head><body><div id="resume-source"></div><main id="resume-pages"></main></body></html>',
  )
  iframeDocument.close()

  await ensureResumeFonts(iframeDocument)

  const baseStyle = iframeDocument.createElement('style')
  baseStyle.textContent = buildStyleSheet(doc.styles, scale, zoom)
  iframeDocument.head.appendChild(baseStyle)

  if (forExport) {
    // 纸面 padding 继续用 mm（与预览同一套），避免 px 换算导致可排高度微差、分页错位；
    // shell 用 px 固定截图外框。zoom=1、无阴影，便于逐页捕获。
    const exportStyle = iframeDocument.createElement('style')
    exportStyle.textContent = `
      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        overflow: hidden;
      }
      #resume-pages {
        gap: 0;
        align-items: stretch;
      }
      .page-shell {
        width: ${PAGE_WIDTH_PX}px !important;
        height: ${PAGE_HEIGHT_PX}px !important;
        overflow: hidden;
      }
      .resume-page {
        position: relative;
        inset: auto;
        left: 0;
        top: 0;
        width: 210mm;
        height: 297mm;
        padding: ${doc.styles.marginY}mm ${doc.styles.marginX}mm;
        box-shadow: none;
        transform: none;
        overflow: hidden;
      }
      .resume-overflow { outline: none; }
    `
    iframeDocument.head.appendChild(exportStyle)
  }

  const customStyle = iframeDocument.createElement('style')
  customStyle.textContent = sanitizeResumeCustomCss(doc.customCss)
  iframeDocument.head.appendChild(customStyle)

  const source = iframeDocument.querySelector<HTMLElement>('#resume-source')
  if (source === null) return 0
  source.innerHTML = html

  await ensureResumeFonts(iframeDocument)
  await waitForImages(iframeDocument)
  await waitForFrame(iframeWindow)

  const pageCount = paginate(iframeDocument, zoom, doc.smartPagination)
  // 分页后再对齐：spacer / 页壳会影响 h2 的累计 Y
  const snapRoot = iframeDocument.body
  snapResumeSectionRules(snapRoot)
  await waitForFrame(iframeWindow)
  snapResumeSectionRules(snapRoot)
  return pageCount
}
