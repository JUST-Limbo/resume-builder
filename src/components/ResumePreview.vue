<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AutoFitResult, ResumeDocumentV1, ResumeStyles } from '../types/resume'
import { renderResumeMarkdown } from '../utils/markdown'

const props = defineProps<{
  document: ResumeDocumentV1
}>()

const emit = defineEmits<{
  pageCount: [value: number]
  scaleChange: [value: number]
  autoFitRunning: [value: boolean]
  autoFitResult: [value: AutoFitResult]
}>()

const frame = ref<HTMLIFrameElement | null>(null)
const PAGE_WIDTH_PX = (210 / 25.4) * 96
const PAGE_HEIGHT_PX = (297 / 25.4) * 96
let renderTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let renderSequence = 0

const fontFamilies: Record<ResumeStyles['fontPreset'], string> = {
  system: "'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', Arial, sans-serif",
  modern: "Inter, 'Source Han Sans SC', 'Microsoft YaHei', Arial, sans-serif",
  serif: "'Source Han Serif SC', 'Songti SC', SimSun, serif",
}

const buildStyleSheet = (styles: ResumeStyles, scale: number, zoom: number) => {
  const bodySize = styles.baseFontSize * scale
  const itemGap = styles.itemGap * scale
  const sectionGap = styles.sectionGap * scale
  const nameSize = Math.max(bodySize * 2.15, 17)
  const sectionSize = Math.max(bodySize * 1.3, 10.5)
  const entrySize = Math.max(bodySize * 1.06, 9)
  const profileAlignment = styles.nameAlignment === 'center' ? 'center' : 'left'
  const fontFamily = fontFamilies[styles.fontPreset]

  return `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      padding: 28px;
      color: ${styles.textColor};
      background: #e9ecee;
      font-family: ${fontFamily};
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
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-size: ${bodySize}pt;
      line-height: ${styles.lineHeight};
    }
    h1, h2, h3, p, ul, ol, blockquote, pre, table { margin-top: 0; }
    h1 {
      margin: 0 0 ${Math.max(8 * scale, 5)}px;
      color: ${styles.textColor};
      font-size: ${nameSize}pt;
      line-height: 1.12;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-align: ${profileAlignment};
    }
    h2 {
      margin: ${sectionGap}px 0 ${Math.max(7 * scale, 4)}px;
      padding-bottom: ${Math.max(4 * scale, 2)}px;
      color: ${styles.textColor};
      font-size: ${sectionSize}pt;
      line-height: 1.2;
      font-weight: 750;
      border-bottom: ${styles.dividerWidth}px solid ${styles.dividerColor};
    }
    h3 {
      margin: ${Math.max(itemGap + 3, 3)}px 0 ${Math.max(itemGap, 2)}px;
      color: ${styles.textColor};
      font-size: ${entrySize}pt;
      line-height: 1.35;
      font-weight: 700;
    }
    p { margin-bottom: ${Math.max(itemGap + 2, 2)}px; }
    ul, ol {
      margin-bottom: ${Math.max(itemGap + 3, 3)}px;
      padding-left: 1.45em;
    }
    li { margin-bottom: ${itemGap}px; padding-left: 0.12em; }
    li:last-child { margin-bottom: 0; }
    strong { font-weight: 700; }
    em { color: ${styles.mutedColor}; }
    a { color: ${styles.mutedColor}; text-decoration: none; }
    blockquote {
      margin-right: 0;
      margin-bottom: ${Math.max(itemGap + 3, 3)}px;
      margin-left: 0;
      padding-left: 10px;
      color: ${styles.mutedColor};
      border-left: 2px solid ${styles.dividerColor};
    }
    pre {
      padding: 8px 10px;
      overflow: hidden;
      background: #f5f6f6;
      border-radius: 4px;
      white-space: pre-wrap;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 6px; border: 1px solid #d8dcde; }
    .resume-profile-line {
      margin-bottom: ${Math.max(3 * scale, 2)}px;
      color: ${styles.textColor};
      text-align: ${profileAlignment};
    }
    .resume-profile-line a { color: ${styles.textColor}; }
    .resume-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 20px;
    }
    .resume-row-main { min-width: 0; }
    .resume-row-side {
      flex: 0 0 auto;
      color: ${styles.textColor};
      font-weight: 500;
      white-space: nowrap;
    }
    .resume-overflow {
      outline: 1px dashed #b42318;
      outline-offset: 2px;
    }
    @media print {
      @page { size: A4; margin: 0; }
      html, body { width: 210mm; background: #fff; }
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
        box-shadow: none;
        transform: none !important;
        break-after: page;
        page-break-after: always;
      }
      .page-shell:last-child .resume-page {
        break-after: auto;
        page-break-after: auto;
      }
    }
  `
}

const waitForFrame = (frameWindow: Window) =>
  new Promise<void>((resolve) => {
    frameWindow.requestAnimationFrame(() => {
      frameWindow.requestAnimationFrame(() => resolve())
    })
  })

const waitForImages = async (iframeDocument: Document) => {
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

const paginate = (iframeDocument: Document, zoom: number) => {
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

    const isHeading = node.tagName === 'H2' || node.tagName === 'H3'
    const nextNode = index < nodes.length - 1 ? nodes[index + 1] : null
    if (isHeading && nextNode !== null && hasContent(currentContent)) {
      const headingProbe = node.cloneNode(true) as HTMLElement
      const nextProbe = nextNode.cloneNode(true) as HTMLElement
      currentContent.append(headingProbe, nextProbe)
      const keepsTogether = fits()
      currentContent.removeChild(headingProbe)
      currentContent.removeChild(nextProbe)
      if (!keepsTogether) currentContent = createPage()
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

const renderDocument = async (scale: number, reportPageCount: boolean) => {
  const iframe = frame.value
  if (iframe === null) return 0
  const iframeDocument = iframe.contentDocument
  const iframeWindow = iframe.contentWindow
  if (iframeDocument === null || iframeWindow === null) return 0

  renderSequence += 1
  const sequence = renderSequence
  const availableWidth = Math.max(iframe.clientWidth - 56, 320)
  const zoom = Math.min(1, availableWidth / PAGE_WIDTH_PX)
  const html = renderResumeMarkdown(props.document.markdown)

  iframeDocument.open()
  iframeDocument.write(
    '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>简历预览</title></head><body><div id="resume-source"></div><main id="resume-pages"></main></body></html>',
  )
  iframeDocument.close()

  const baseStyle = iframeDocument.createElement('style')
  baseStyle.textContent = buildStyleSheet(props.document.styles, scale, zoom)
  iframeDocument.head.appendChild(baseStyle)
  const customStyle = iframeDocument.createElement('style')
  customStyle.textContent = props.document.customCss
  iframeDocument.head.appendChild(customStyle)

  const source = iframeDocument.querySelector<HTMLElement>('#resume-source')
  if (source === null) return 0
  source.innerHTML = html

  await iframeDocument.fonts.ready
  await waitForImages(iframeDocument)
  await waitForFrame(iframeWindow)
  if (sequence !== renderSequence) return 0

  const count = paginate(iframeDocument, zoom)
  if (reportPageCount) emit('pageCount', count)
  return count
}

const scheduleRender = () => {
  if (renderTimer !== null) clearTimeout(renderTimer)
  renderTimer = setTimeout(() => {
    renderTimer = null
    void renderDocument(props.document.autoFitScale, true)
  }, 160)
}

const fitToOnePage = async () => {
  emit('autoFitRunning', true)
  try {
    const fullSizePages = await renderDocument(1, false)
    if (fullSizePages <= 1) {
      emit('scaleChange', 1)
      const result: AutoFitResult = { status: 'already-fit', scale: 1, pageCount: fullSizePages }
      emit('autoFitResult', result)
      emit('pageCount', fullSizePages)
      return result
    }

    const readableScale = 8.5 / props.document.styles.baseFontSize
    const minScale = Math.min(1, Math.max(0.75, readableScale))
    const minSizePages = await renderDocument(minScale, false)
    if (minSizePages > 1) {
      emit('scaleChange', minScale)
      const result: AutoFitResult = {
        status: 'cannot-fit',
        scale: minScale,
        pageCount: minSizePages,
      }
      emit('autoFitResult', result)
      emit('pageCount', minSizePages)
      return result
    }

    let low = minScale
    let high = 1
    let bestScale = minScale
    let bestPageCount = minSizePages
    for (let iteration = 0; iteration < 12 && high - low > 0.005; iteration += 1) {
      const middle = Number(((low + high) / 2).toFixed(4))
      const pageCount = await renderDocument(middle, false)
      if (pageCount <= 1) {
        bestScale = middle
        bestPageCount = pageCount
        low = middle
      } else {
        high = middle
      }
    }

    await renderDocument(bestScale, true)
    emit('scaleChange', bestScale)
    const result: AutoFitResult = { status: 'fit', scale: bestScale, pageCount: bestPageCount }
    emit('autoFitResult', result)
    return result
  } finally {
    emit('autoFitRunning', false)
  }
}

const resetAutoFit = async () => {
  emit('scaleChange', 1)
  return renderDocument(1, true)
}

const printResume = async () => {
  await renderDocument(props.document.autoFitScale, true)
  const iframe = frame.value
  if (iframe === null || iframe.contentWindow === null) return
  iframe.contentWindow.focus()
  iframe.contentWindow.print()
}

watch(
  () => props.document,
  () => scheduleRender(),
  { deep: true },
)

onMounted(() => {
  scheduleRender()
  if (frame.value !== null) {
    resizeObserver = new ResizeObserver(() => scheduleRender())
    resizeObserver.observe(frame.value)
  }
})

onBeforeUnmount(() => {
  if (renderTimer !== null) clearTimeout(renderTimer)
  if (resizeObserver !== null) resizeObserver.disconnect()
})

defineExpose({
  fitToOnePage,
  resetAutoFit,
  printResume,
  refresh: scheduleRender,
})
</script>

<template>
  <iframe
    ref="frame"
    class="resume-preview-frame"
    title="A4 简历实时预览"
    sandbox="allow-same-origin allow-modals"
  />
</template>

<style scoped>
.resume-preview-frame {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #e9ecee;
  border: 0;
}
</style>
