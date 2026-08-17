import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { ResumeDocumentV1 } from '../types/resume'
import { exportBlobFile, toSafeFilename } from './download'
import {
  PAGE_HEIGHT_MM,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_MM,
  PAGE_WIDTH_PX,
  renderResumeIntoFrame,
  waitForFrame,
} from './resumePageEngine'
import { snapResumeSectionRules } from './resumeDocumentStyles'

/** 与 export-server 默认端口一致；改端口时两边同步。 */
export const EXPORT_SERVER_BASE_URL = 'http://127.0.0.1:3917'

/**
 * 本机导出服务只允许由本机 HTTP 页面访问。
 *
 * 用例：
 * - http://localhost:5173 → true
 * - http://127.0.0.1:4173 → true
 * - https://just-limbo.github.io/resume-builder/ → false
 */
export const canUseLocalExportServer = () => {
  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  return window.location.protocol === 'http:' && isLocalhost
}

/**
 * 导出 / 打印另存用的建议文件名（无扩展名）：来自简历标题并去掉非法字符。
 *
 * 用例：
 * - resumeExportBasename({ title: '林晓 / 前端' }) → '林晓-前端'
 * - resumeExportBasename({ title: '   ' }) → 'resume'
 */
export const resumeExportBasename = (doc: Pick<ResumeDocumentV1, 'title'>) =>
  toSafeFilename(doc.title)

/**
 * 本机导出服务不可用（未启动 / 端口不通）。
 *
 * 用例：catch (e) { if (e instanceof ExportServerUnavailableError) … }
 */
export class ExportServerUnavailableError extends Error {
  constructor(message = '本机导出服务未启动') {
    super(message)
    this.name = 'ExportServerUnavailableError'
  }
}

/**
 * 探测本机 Playwright 导出服务是否在线。
 *
 * 用例：await isExportServerOnline() → true/false
 */
export const isExportServerOnline = async (): Promise<boolean> => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 1500)
  try {
    const response = await fetch(`${EXPORT_SERVER_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * 用与打印同源的 renderResumeIntoFrame 分页，序列化为完整 HTML。
 * 供本机导出服务 page.pdf()，避免服务端另写排版。
 *
 * 用例：const html = await buildPrintableResumeHtml(document)
 */
export const buildPrintableResumeHtml = async (doc: ResumeDocumentV1): Promise<string> => {
  const pageWidth = Math.round(PAGE_WIDTH_PX)
  const pageHeight = Math.round(PAGE_HEIGHT_PX)

  const iframe = window.document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('title', '简历矢量导出')
  iframe.setAttribute('sandbox', 'allow-same-origin')
  iframe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${pageWidth}px`,
    `height:${pageHeight}px`,
    'opacity:0.01',
    'pointer-events:none',
    'border:0',
    'z-index:0',
  ].join(';')

  window.document.body.appendChild(iframe)

  try {
    const iframeDocument = iframe.contentDocument
    const iframeWindow = iframe.contentWindow
    if (iframeDocument === null || iframeWindow === null) {
      throw new Error('无法创建矢量导出预览帧')
    }

    await renderResumeIntoFrame(iframeDocument, iframeWindow, doc, {
      scale: doc.autoFitScale,
      zoom: 1,
    })

    const shells = iframeDocument.querySelectorAll('.page-shell')
    if (shells.length === 0) {
      throw new Error('没有可导出的简历页')
    }

    // 与打印另存一致：HTML <title> 用安全化简历名（Playwright 侧主要靠 Content-Disposition）
    iframeDocument.title = resumeExportBasename(doc)
    await waitForFrame(iframeWindow)

    return `<!DOCTYPE html>\n${iframeDocument.documentElement.outerHTML}`
  } finally {
    iframe.remove()
  }
}

/**
 * 经本机 Playwright 服务静默下载矢量 PDF（文字可选中）。
 * 服务未启动时抛 ExportServerUnavailableError。
 *
 * 用例：await exportResumePdfViaLocalServer(document)
 */
export const exportResumePdfViaLocalServer = async (doc: ResumeDocumentV1) => {
  const online = await isExportServerOnline()
  if (!online) {
    throw new ExportServerUnavailableError(
      '本机导出服务未启动。请先在项目根目录运行 npm run export-server，然后再试；或改用「PDF（打印另存 · 矢量）」。',
    )
  }

  const html = await buildPrintableResumeHtml(doc)
  const filename = `${resumeExportBasename(doc)}.pdf`

  const response = await fetch(`${EXPORT_SERVER_BASE_URL}/export/pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/pdf',
    },
    body: JSON.stringify({
      html,
      filename,
    }),
  })

  if (!response.ok) {
    let detail = `导出服务返回 ${response.status}`
    try {
      const payload = (await response.json()) as { error?: unknown }
      if (payload !== null && typeof payload.error === 'string' && payload.error.length > 0) {
        detail = payload.error
      }
    } catch {
      // 非 JSON 错误体时沿用 status 文案
    }
    throw new Error(detail)
  }

  const blob = await response.blob()
  exportBlobFile(filename, blob)
}

/**
 * 打开与预览同源的打印对话框（浏览器矢量排版）。
 * 受浏览器安全限制无法静默下载矢量 PDF；请用户在对话框中选择「另存为 PDF」。
 *
 * 用例：
 * - await openResumePrintDialog(document) → 弹出打印预览
 */
export const openResumePrintDialog = async (doc: ResumeDocumentV1) => {
  const pageWidth = Math.round(PAGE_WIDTH_PX)
  const pageHeight = Math.round(PAGE_HEIGHT_PX)
  // Chromium「另存为 PDF」常取顶层 document.title，而非仅 iframe 内 <title>。
  // 进入打印前先暂存（编辑页多为「简历名 · Resume Builder」），结束后必须还原该值，勿与 EditView 的 title 同步互相覆盖。
  const suggestedTitle = resumeExportBasename(doc)
  const previousParentTitle = window.document.title

  const iframe = window.document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('title', '简历打印')
  iframe.setAttribute('sandbox', 'allow-same-origin allow-modals')
  iframe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${pageWidth}px`,
    `height:${pageHeight}px`,
    'opacity:0.01',
    'pointer-events:none',
    'border:0',
    'z-index:0',
  ].join(';')

  window.document.body.appendChild(iframe)

  const iframeDocument = iframe.contentDocument
  const iframeWindow = iframe.contentWindow
  if (iframeDocument === null || iframeWindow === null) {
    iframe.remove()
    throw new Error('无法创建打印预览帧')
  }

  const restoreParentTitle = () => {
    window.document.title = previousParentTitle
  }

  try {
    await renderResumeIntoFrame(iframeDocument, iframeWindow, doc, {
      scale: doc.autoFitScale,
      zoom: 1,
    })

    const shells = iframeDocument.querySelectorAll('.page-shell')
    if (shells.length === 0) {
      throw new Error('没有可打印的简历页')
    }

    iframeDocument.title = suggestedTitle
    window.document.title = suggestedTitle

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(fallbackTimer)
        restoreParentTitle()
        iframe.remove()
        resolve()
      }
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        window.clearTimeout(fallbackTimer)
        restoreParentTitle()
        iframe.remove()
        reject(error)
      }

      // 必须先挂 afterprint：部分浏览器在 print() 返回前就已派发
      iframeWindow.addEventListener('afterprint', finish, { once: true })
      // 不派发 afterprint 时超时清理；勿在 print() 后立刻 finish（非阻塞浏览器会拆掉打印帧）
      const fallbackTimer = window.setTimeout(finish, 120000)

      try {
        iframeWindow.focus()
        iframeWindow.print()
      } catch (error) {
        fail(error)
      }
    })
  } catch (error) {
    restoreParentTitle()
    iframe.remove()
    throw error
  }
}

/**
 * 将分页后的 A4 `.page-shell` 栅格化为 PDF 并触发下载（位图，文字不可选）。
 * 矢量级一致请用 openResumePrintDialog（打印 → 另存为 PDF）。
 *
 * 用例：
 * - exportResumePdf(document) → 下载「标题.pdf」
 */
export const exportResumePdf = async (doc: ResumeDocumentV1) => {
  const filename = `${resumeExportBasename(doc)}.pdf`
  const dpr = window.devicePixelRatio > 1 ? window.devicePixelRatio : 1
  const captureScale = Math.max(2, Math.round(dpr * 2))
  const pageWidth = Math.round(PAGE_WIDTH_PX)
  const pageHeight = Math.round(PAGE_HEIGHT_PX)

  const iframe = window.document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('sandbox', 'allow-same-origin')
  // 视口内极低透明度：opacity:0 时部分浏览器会跳过绘制，导致截图像空白/错位
  iframe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${pageWidth}px`,
    `height:${pageHeight}px`,
    'opacity:0.01',
    'pointer-events:none',
    'border:0',
    'z-index:0',
  ].join(';')

  window.document.body.appendChild(iframe)

  try {
    const iframeDocument = iframe.contentDocument
    const iframeWindow = iframe.contentWindow
    if (iframeDocument === null || iframeWindow === null) {
      throw new Error('无法创建导出预览帧')
    }

    await renderResumeIntoFrame(iframeDocument, iframeWindow, doc, {
      scale: doc.autoFitScale,
      zoom: 1,
      forExport: true,
    })

    const shells = Array.from(iframeDocument.querySelectorAll<HTMLElement>('.page-shell'))
    if (shells.length === 0) {
      throw new Error('没有可导出的简历页')
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    for (let index = 0; index < shells.length; index += 1) {
      const shell = shells[index]
      isolateShellForCapture(shells, shell, iframe, iframeWindow, pageWidth, pageHeight)
      await waitForFrame(iframeWindow)

      const canvas = await capturePageShell(shell, captureScale, pageWidth, pageHeight)
      const imageData = canvas.toDataURL('image/png')
      if (index > 0) pdf.addPage()
      pdf.addImage(imageData, 'PNG', 0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, undefined, 'FAST')
    }

    pdf.save(filename)
  } finally {
    iframe.remove()
  }
}

/** 只保留当前页可见，并把 iframe 滚回原点，避免多页叠裁与父页 scroll 串扰。 */
const isolateShellForCapture = (
  shells: HTMLElement[],
  active: HTMLElement,
  iframe: HTMLIFrameElement,
  iframeWindow: Window,
  pageWidth: number,
  pageHeight: number,
) => {
  for (const shell of shells) {
    shell.style.display = shell === active ? 'block' : 'none'
  }
  iframe.style.width = `${pageWidth}px`
  iframe.style.height = `${pageHeight}px`
  iframeWindow.scrollTo(0, 0)
  const iframeDocument = iframe.contentDocument
  if (iframeDocument !== null) {
    iframeDocument.documentElement.scrollTop = 0
    iframeDocument.body.scrollTop = 0
  }
}

const capturePageShell = async (
  shell: HTMLElement,
  captureScale: number,
  pageWidth: number,
  pageHeight: number,
) => {
  const baseOptions = {
    scale: captureScale,
    backgroundColor: '#ffffff' as string | null,
    logging: false,
    useCORS: true,
    allowTaint: true,
    width: pageWidth,
    height: pageHeight,
    windowWidth: pageWidth,
    windowHeight: pageHeight,
    x: 0,
    y: 0,
    // 切勿使用 -window.scrollY：父页面滚动会错移 iframe 内截图框，顶行被裁成「只剩字脚」
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDocument: Document, element: HTMLElement) => {
      prepareExportClone(clonedDocument, element)
    },
  }

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(shell, {
      ...baseOptions,
      foreignObjectRendering: true,
    })
  } catch {
    canvas = await html2canvas(shell, {
      ...baseOptions,
      foreignObjectRendering: false,
    })
  }

  if (canvas.width === 0 || canvas.height === 0) {
    canvas = await html2canvas(shell, {
      ...baseOptions,
      foreignObjectRendering: false,
    })
  }

  return trimCanvasToPage(canvas, pageWidth, pageHeight, captureScale)
}

/** 若截图像素略大于目标页，顶对齐裁切，避免把页外灰边或邻页缝带进 PDF。 */
const trimCanvasToPage = (
  source: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  captureScale: number,
) => {
  const targetWidth = Math.round(pageWidth * captureScale)
  const targetHeight = Math.round(pageHeight * captureScale)
  if (source.width === targetWidth && source.height === targetHeight) {
    return source
  }

  const trimmed = window.document.createElement('canvas')
  trimmed.width = targetWidth
  trimmed.height = targetHeight
  const context = trimmed.getContext('2d')
  if (context === null) return source
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.drawImage(
    source,
    0,
    0,
    Math.min(source.width, targetWidth),
    Math.min(source.height, targetHeight),
    0,
    0,
    Math.min(source.width, targetWidth),
    Math.min(source.height, targetHeight),
  )
  return trimmed
}

/**
 * 克隆树上只做截图必要修正：取消缩放/阴影、统一背景；
 * 不改 padding/宽高，避免与已分页结果重排分叉。
 * 默认栅格化路径下放开 content overflow，减轻中文顶行误裁。
 */
const prepareExportClone = (clonedDocument: Document, shell: HTMLElement) => {
  shell.style.margin = '0'
  shell.style.overflow = 'hidden'
  shell.style.background = '#ffffff'
  shell.style.transform = 'none'
  shell.style.display = 'block'

  const page = shell.querySelector('.resume-page') as HTMLElement | null
  if (page !== null) {
    page.style.transform = 'none'
    page.style.boxShadow = 'none'
    page.style.position = 'relative'
    page.style.inset = 'auto'
    page.style.left = '0'
    page.style.top = '0'
    page.style.margin = '0'
    page.style.background = '#ffffff'
  }

  const content = shell.querySelector('.resume-content') as HTMLElement | null
  if (content !== null) {
    content.style.overflow = 'visible'
  }

  // 去掉可能叠在 ::after 分隔线上的下划线/底边，避免导出出现「双线」
  for (const heading of Array.from(shell.querySelectorAll('h2'))) {
    const el = heading as HTMLElement
    el.style.textDecoration = 'none'
    el.style.textDecorationLine = 'none'
    el.style.borderBottom = 'none'
    el.style.backgroundImage = 'none'
    el.style.boxShadow = 'none'
  }

  const style = clonedDocument.createElement('style')
  // 与 resumeDocumentStyles 同源：整数 px 填色带，禁止 border 描边在栅格/PDF 上另算线宽
  style.textContent = `
    h2 {
      text-decoration: none !important;
      border-bottom: none !important;
      box-shadow: none !important;
      background-image: none !important;
    }
    h2::after {
      box-sizing: border-box !important;
      height: var(--resume-rule-width) !important;
      border: 0 !important;
      padding: 0 !important;
      background-color: var(--resume-divider) !important;
      background-image: none !important;
      box-shadow: none !important;
      outline: none !important;
    }
  `
  clonedDocument.head.appendChild(style)

  // 克隆树可能微移布局；再对齐一次，避免 html2canvas 吃到半像素线
  snapResumeSectionRules(shell)

  const clonedBody = clonedDocument.body
  if (clonedBody !== null) {
    clonedBody.style.margin = '0'
    clonedBody.style.padding = '0'
    clonedBody.style.background = '#ffffff'
    clonedBody.style.overflow = 'hidden'
  }
  const clonedHtml = clonedDocument.documentElement
  if (clonedHtml !== null) {
    clonedHtml.style.margin = '0'
    clonedHtml.style.padding = '0'
    clonedHtml.style.overflow = 'hidden'
    clonedHtml.style.background = '#ffffff'
  }
}
