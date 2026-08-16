/**
 * 本机简历矢量 PDF 导出服务。
 *
 * 启动：在仓库根目录执行 `npm run export-server`（或 `cd export-server && npm start`）
 * 默认监听 http://127.0.0.1:3917
 *
 * - GET  /health      → 探测是否在线
 * - POST /export/pdf  → body: { html, filename? }，返回 application/pdf
 *
 * CORS 仅放行本地 Vite / preview origin。前端应提交「已分页」的完整 HTML，
 * 与预览/打印共用同一套 DOM，避免服务端另写排版。
 */

import express from 'express'
import { chromium } from 'playwright'

const HOST = '127.0.0.1'
const PORT = Number(process.env.EXPORT_SERVER_PORT || 3917)

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])

/** @type {import('playwright').Browser | null} */
let browser = null

const getBrowser = async () => {
  if (browser !== null && browser.isConnected()) {
    return browser
  }
  browser = await chromium.launch({
    headless: true,
  })
  return browser
}

const applyCors = (req, res) => {
  const origin = req.headers.origin
  if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
  }
}

const safeFilename = (raw) => {
  if (typeof raw !== 'string') return 'resume.pdf'
  const trimmed = raw.trim()
  if (trimmed.length === 0) return 'resume.pdf'
  const cleaned = trimmed.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-')
  if (cleaned.length === 0) return 'resume.pdf'
  if (cleaned.toLowerCase().endsWith('.pdf')) return cleaned
  return `${cleaned}.pdf`
}

/** RFC 5987：ASCII fallback + UTF-8 filename*，兼容只认 filename= 的下载器。 */
const contentDispositionAttachment = (filename) => {
  const asciiFallback = filename.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_')
  const fallback =
    asciiFallback.replace(/\.pdf$/i, '').length > 0 ? asciiFallback : 'resume.pdf'
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '12mb' }))

app.use((req, res, next) => {
  applyCors(req, res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'resume-export-server',
    port: PORT,
  })
})

app.post('/export/pdf', async (req, res) => {
  const html = req.body && typeof req.body.html === 'string' ? req.body.html : ''
  if (html.trim().length === 0) {
    res.status(400).json({ error: '缺少可打印 HTML（body.html）' })
    return
  }

  const filename = safeFilename(req.body.filename)
  let context = null

  try {
    const activeBrowser = await getBrowser()
    context = await activeBrowser.newContext({
      // 与前端 A4 CSS 像素一致，减少分页观感偏差
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()

    // 完整文档由前端 renderResumeIntoFrame 生成；此处只负责打印引擎出 PDF
    await page.setContent(html, {
      waitUntil: 'networkidle',
      timeout: 60000,
    })

    // 等待 web font / 本机回退字体就绪，降低与预览分叉
    await page.evaluate(async () => {
      if (document.fonts === undefined) return
      await document.fonts.ready
      const samples = [
        '400 12pt Inter',
        '500 12pt Inter',
        '700 12pt Inter',
        '800 12pt Inter',
        '400 12pt "Noto Sans SC"',
        '500 12pt "Noto Sans SC"',
        '700 12pt "Noto Sans SC"',
        '800 12pt "Noto Sans SC"',
        '400 12pt "Noto Serif SC"',
        '500 12pt "Noto Serif SC"',
        '700 12pt "Noto Serif SC"',
      ]
      await Promise.all(
        samples.map((sample) => document.fonts.load(sample).catch(() => undefined)),
      )
      await document.fonts.ready
    })

    // 再等一帧，让分页后的布局稳定
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        }),
    )

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', contentDispositionAttachment(filename))
    res.send(Buffer.from(pdfBuffer))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[export/pdf]', message)
    res.status(500).json({ error: `PDF 生成失败：${message}` })
  } finally {
    if (context !== null) {
      await context.close().catch(() => undefined)
    }
  }
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

const server = app.listen(PORT, HOST, () => {
  console.log(`[resume-export-server] listening on http://${HOST}:${PORT}`)
  console.log('[resume-export-server] GET /health · POST /export/pdf')
  console.log('[resume-export-server] CORS: Vite localhost:5173 / preview :4173')
})

server.on('error', async (err) => {
  if (err && err.code === 'EADDRINUSE') {
    try {
      const res = await fetch(`http://${HOST}:${PORT}/health`)
      if (res.ok) {
        const data = await res.json()
        if (data && data.ok === true && data.service === 'resume-export-server') {
          console.log(`[resume-export-server] already running on http://${HOST}:${PORT}, reuse existing process`)
          process.exit(0)
        }
      }
    } catch (_probeErr) {
      // fall through
    }
    console.error(`[resume-export-server] port ${PORT} is already in use (not this service)`)
    process.exit(1)
  }
  console.error('[resume-export-server] listen error:', err)
  process.exit(1)
})

const shutdown = async () => {
  console.log('[resume-export-server] shutting down…')
  server.close()
  if (browser !== null) {
    await browser.close().catch(() => undefined)
    browser = null
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
