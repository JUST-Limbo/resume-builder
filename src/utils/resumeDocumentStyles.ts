import type { ResumeStyles } from '../types/resume'

/**
 * 预览 iframe / 打印 / 效果编辑区共用的 web font。
 * Inter + Noto Sans/Serif SC 作主字体；本机雅黑仅作回退，避免预览有雅黑、导出无雅黑时分叉。
 */
export const RESUME_WEB_FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+SC:wght@400;500;700;800&family=Noto+Serif+SC:wght@400;500;700&display=swap'

/**
 * 按预设解析 font-family。
 * Web 字体必须排在本机雅黑/苹方之前：效果编辑区有雅黑、Playwright Chromium 通常没有，
 * 若雅黑优先会导致预览与打印/矢量导出字重、字色与行盒度量全面分叉。
 */
export const resumeFontFamilies: Record<ResumeStyles['fontPreset'], string> = {
  system: "'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', Arial, sans-serif",
  modern: "Inter, 'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', Arial, sans-serif",
  serif: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', SimSun, serif",
}

/**
 * 向 document 注入简历 web font stylesheet（幂等）。
 *
 * 用例：injectResumeFontLinks(iframeDocument)
 */
export const injectResumeFontLinks = (targetDocument: Document) => {
  const existing = targetDocument.querySelector('link[data-resume-fonts="true"]')
  if (existing !== null) return null

  const link = targetDocument.createElement('link')
  link.rel = 'stylesheet'
  link.href = RESUME_WEB_FONT_STYLESHEET
  link.setAttribute('data-resume-fonts', 'true')
  targetDocument.head.appendChild(link)
  return link
}

/**
 * 等待简历相关字体可用（link onload + FontFaceSet）。
 *
 * 用例：await ensureResumeFonts(iframeDocument)
 */
export const ensureResumeFonts = async (targetDocument: Document) => {
  const link = injectResumeFontLinks(targetDocument)

  if (link !== null) {
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      link.addEventListener('load', finish, { once: true })
      link.addEventListener('error', finish, { once: true })
      window.setTimeout(finish, 4000)
    })
  }

  const fontSet = targetDocument.fonts
  if (fontSet === undefined) return

  await fontSet.ready

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
    samples.map((sample) => fontSet.load(sample).catch(() => undefined)),
  )
  await fontSet.ready
}

export type ResumeSurfaceVars = Record<string, string>

export type ResumeTypography = {
  bodySize: number
  nameSize: number
  sectionSize: number
  entrySize: number
  itemGap: number
  sectionGap: number
  h1MarginBottom: number
  h2MarginBottom: number
  h2RuleGap: number
  h3MarginTop: number
  h3MarginBottom: number
  paragraphMarginBottom: number
  listMarginBottom: number
  profileMarginBottom: number
}

/**
 * 统一换算字号 / 间距，供 CSS 变量与分页引擎共用，避免编辑区与导出分叉。
 *
 * 用例：baseFontSize=10、scale=0.9 → nameSize 约 19.35pt（下限 17*scale）
 */
export const resolveResumeTypography = (
  styles: ResumeStyles,
  scale = 1,
): ResumeTypography => {
  const bodySize = styles.baseFontSize * scale
  const itemGap = styles.itemGap * scale
  const sectionGap = styles.sectionGap * scale
  return {
    bodySize,
    itemGap,
    sectionGap,
    nameSize: Math.max(bodySize * 2.15, 17 * scale),
    sectionSize: Math.max(bodySize * 1.3, 10.5 * scale),
    entrySize: Math.max(bodySize * 1.06, 9 * scale),
    h1MarginBottom: Math.max(8 * scale, 5),
    h2MarginBottom: Math.max(7 * scale, 4),
    h2RuleGap: Math.max(5 * scale, 4),
    h3MarginTop: Math.max(itemGap + 3, 3),
    h3MarginBottom: Math.max(itemGap, 2),
    paragraphMarginBottom: Math.max(itemGap + 2, 2),
    listMarginBottom: Math.max(itemGap + 3, 3),
    profileMarginBottom: Math.max(3 * scale, 2),
  }
}

/**
 * 样式面板「线条粗细」(设计单位 CSS px) → 预览 / 打印 / 导出共用的绝对线宽。
 * 一律取整到整数 CSS px：分数 px / pt 在半像素 Y 上会被抗锯齿扩成约 2 物理像素，
 * 且 border 描边与 height 填色在 Blink 屏绘 / PDF 矢量路径上仍会分叉。
 *
 * 用例：
 * - resolveResumeRuleWidthCss(0) → "0px"
 * - resolveResumeRuleWidthCss(0.5) → "1px"
 * - resolveResumeRuleWidthCss(1) → "1px"
 * - resolveResumeRuleWidthCss(1.5) → "2px"
 * - resolveResumeRuleWidthCss(2) → "2px"
 */
export const resolveResumeRuleWidthCss = (dividerWidthPx: number): string => {
  if (!(dividerWidthPx > 0)) return '0px'
  const snapped = Math.max(1, Math.round(dividerWidthPx))
  return `${snapped}px`
}

const parseCssLengthToPx = (raw: string): number => {
  const value = raw.trim()
  if (value.length === 0) return 0
  if (value.endsWith('px')) {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n : 0
  }
  if (value.endsWith('pt')) {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n * (96 / 72) : 0
  }
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 读取元素祖先链上的累计 Y 缩放（transform: scale / matrix）。
 * getBoundingClientRect 返回视觉坐标；margin 微调是布局 CSS px。
 * 效果区 `.resume-page { transform: scale(zoom) }` 时二者必须换算，
 * 否则按视觉 frac 去改 CSS margin，实际只移动 frac*zoom，永远对不齐。
 */
const readLayoutScaleY = (el: HTMLElement): number => {
  let scale = 1
  let node: HTMLElement | null = el
  while (node !== null) {
    const transform = getComputedStyle(node).transform
    if (transform !== 'none') {
      if (transform.indexOf('matrix3d(') === 0) {
        const raw = transform.slice(9, -1).split(',')
        const b = Number.parseFloat(raw[1].trim())
        const f = Number.parseFloat(raw[5].trim())
        const sy = Math.sqrt(b * b + f * f)
        if (Number.isFinite(sy) && sy > 0) scale *= sy
      } else if (transform.indexOf('matrix(') === 0) {
        const raw = transform.slice(7, -1).split(',')
        const b = Number.parseFloat(raw[1].trim())
        const d = Number.parseFloat(raw[3].trim())
        const sy = Math.sqrt(b * b + d * d)
        if (Number.isFinite(sy) && sy > 0) scale *= sy
      }
    }
    node = node.parentElement
  }
  return scale
}

/**
 * 分隔线顶边的布局 Y（CSS px）。
 * 优先相对最近的 `.resume-page`（带 zoom 变换）换算；编辑区无变换时相对 measureRoot。
 */
const readRuleTopCssPx = (
  h2: HTMLElement,
  measureRoot: HTMLElement,
  rulePx: number,
): number => {
  const rect = h2.getBoundingClientRect()
  const page = h2.closest('.resume-page') as HTMLElement | null
  if (page !== null) {
    const pageScale = readLayoutScaleY(page)
    if (pageScale > 0 && Math.abs(pageScale - 1) > 0.0001) {
      const pageRect = page.getBoundingClientRect()
      return (rect.bottom - pageRect.top) / pageScale - rulePx
    }
  }

  const h2Scale = readLayoutScaleY(h2)
  const scale = h2Scale > 0 ? h2Scale : 1
  const rootRect = measureRoot.getBoundingClientRect()
  return (rect.bottom - rulePx * scale - rootRect.top) / scale
}

/**
 * 把各 h2 分隔线对齐到整 CSS 像素。
 * 半像素 Y 上的 1px 实线会被抗锯齿画成约 2px，造成「同一页两条线粗细不一」
 * 以及效果区相对矢量 PDF 偏粗。
 *
 * TipTap 会重建标题 DOM 并丢掉 inline style / data-*，因此把 margin 微调写进 root 内
 * stylesheet。选择器用 `> h2:nth-child(n)`（按兄弟位置，中间夹 p/ul/div 也精确命中），
 * 避免误用「第 n 个 h2」与「第 n 个兄弟」混算。
 *
 * 用例：snapResumeSectionRules(pageRoot) · snapResumeSectionRules(iframeDocument.body)
 */
export const snapResumeSectionRules = (root: HTMLElement | null) => {
  if (root === null) return

  const doc = root.ownerDocument
  if (doc === null) return

  const styleAttr = 'data-resume-rule-snap-css'
  let styleEl = root.querySelector(`style[${styleAttr}]`) as HTMLStyleElement | null
  if (styleEl === null) {
    styleEl = doc.createElement('style')
    styleEl.setAttribute(styleAttr, 'true')
    root.insertBefore(styleEl, root.firstChild)
  }

  // 先清空上一轮微调，避免基于已偏移几何二次取整
  styleEl.textContent = ''
  void root.offsetHeight

  const headings = Array.from(root.querySelectorAll('h2'))
  const rules: string[] = []

  for (const node of headings) {
    const h2 = node as HTMLElement
    const parent = h2.parentElement
    if (parent === null) continue

    const childIndex = Array.from(parent.children).indexOf(h2)
    if (!(childIndex >= 0)) continue

    const parentSel = resolveRuleParentSelector(parent, root)
    if (parentSel.length === 0) continue

    // margin 会改变后续标题 Y：每步先应用已累计规则再测当前条
    styleEl.textContent = rules.join('\n')
    void root.offsetHeight

    const cs = getComputedStyle(h2)
    const rulePx = parseCssLengthToPx(cs.getPropertyValue('--resume-rule-width'))
    if (!(rulePx > 0)) continue

    const ruleTopCss = readRuleTopCssPx(h2, root, rulePx)
    const frac = ruleTopCss - Math.floor(ruleTopCss)
    const snap = frac < 0.5 ? -frac : 1 - frac
    if (Math.abs(snap) < 0.001) continue

    // 用 margin 微调而非 transform：合成层平移仍可能把 1px 线滤成 2px
    const gapAdj =
      snap < 0
        ? `calc(var(--resume-h2-rule-gap) - ${Math.abs(snap)}px)`
        : `calc(var(--resume-h2-rule-gap) + ${snap}px)`
    rules.push(
      `${parentSel} > h2:nth-child(${childIndex + 1})::after{margin-top:${gapAdj};}`,
    )
  }

  styleEl.textContent = rules.join('\n')
}

/**
 * 生成相对稳定、且不依赖会被 PM 清掉的 data-* 的父级选择器。
 * root 为单个 `.page-shell`（导出 onclone）时用短选择器，避免依赖克隆树是否仍含 #resume-pages。
 */
const resolveRuleParentSelector = (parent: HTMLElement, root: HTMLElement): string => {
  if (parent.classList.contains('ProseMirror')) {
    return '.ProseMirror'
  }
  if (parent.classList.contains('resume-content')) {
    const shell = parent.closest('.page-shell')
    if (shell === null) return '.resume-content'
    if (root === shell) return '.resume-content'
    const pages = shell.parentElement
    if (pages !== null && pages.id === 'resume-pages') {
      const index = Array.from(pages.children).indexOf(shell) + 1
      if (index > 0) {
        return `#resume-pages > .page-shell:nth-child(${index}) .resume-content`
      }
    }
    return '.resume-content'
  }
  if (parent.classList.contains('resume-thumb__content')) {
    return '.resume-thumb__content'
  }
  return ''
}

/**
 * 将样式设置转成文档表面 CSS 变量（编辑区、缩略图、预览/导出共用）。
 *
 * 用例：baseFontSize=10、autoFitScale=0.9 → --resume-body 约为 9pt
 */
export const buildResumeSurfaceVars = (
  styles: ResumeStyles,
  scale = 1,
): ResumeSurfaceVars => {
  const t = resolveResumeTypography(styles, scale)
  const ruleWidth = resolveResumeRuleWidthCss(styles.dividerWidth)
  return {
    '--resume-font': resumeFontFamilies[styles.fontPreset],
    '--resume-text': styles.textColor,
    '--resume-muted': styles.mutedColor,
    '--resume-divider': styles.dividerColor,
    /* 设计别名：样式面板仍按 px 调；实际绘制一律读 --resume-rule-width */
    '--resume-divider-width': ruleWidth,
    '--resume-rule-width': ruleWidth,
    '--resume-body': `${t.bodySize}pt`,
    '--resume-line': String(styles.lineHeight),
    '--resume-section-gap': `${t.sectionGap}px`,
    '--resume-item-gap': `${t.itemGap}px`,
    '--resume-name-align': styles.nameAlignment,
    '--resume-name-size': `${t.nameSize}pt`,
    '--resume-section-size': `${t.sectionSize}pt`,
    '--resume-entry-size': `${t.entrySize}pt`,
    '--resume-margin-x': `${styles.marginX}mm`,
    '--resume-margin-y': `${styles.marginY}mm`,
    '--resume-h1-mb': `${t.h1MarginBottom}px`,
    '--resume-h2-mb': `${t.h2MarginBottom}px`,
    '--resume-h2-rule-gap': `${t.h2RuleGap}px`,
    '--resume-h3-mt': `${t.h3MarginTop}px`,
    '--resume-h3-mb': `${t.h3MarginBottom}px`,
    '--resume-p-mb': `${t.paragraphMarginBottom}px`,
    '--resume-list-mb': `${t.listMarginBottom}px`,
    '--resume-profile-mb': `${t.profileMarginBottom}px`,
  }
}

const serializeSurfaceVars = (vars: ResumeSurfaceVars): string =>
  Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n      ')

/**
 * 简历正文排版（依赖 CSS 变量）。编辑器 / 缩略图 / iframe 预览与导出共用，避免三套分叉。
 *
 * h2 分隔线不用 h2 自身的 border-bottom：html2canvas 对中文 baseline 易把线画进字里；
 * 改为块级 ::after（线与文字上下相邻）。线宽用整数 px 的 height + 纯色填充（非 border 描边）：
 * Blink 把 border 编成 PDF stroke、把 fill 编成 rect，观感易分叉；再配合
 * snapResumeSectionRules 把线顶对齐整像素，避免半像素抗锯齿发粗。
 *
 * 用例：buildResumeDocumentCss('.resume-content')
 * 用例：buildResumeDocumentCss('.ProseMirror')
 */
export const buildResumeDocumentCss = (rootSelector: string): string => {
  const root = rootSelector.trim()
  return `
    ${root} {
      color: var(--resume-text);
      font-synthesis: none;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    ${root} h1,
    ${root} h2,
    ${root} h3,
    ${root} h4,
    ${root} h5,
    ${root} h6,
    ${root} p,
    ${root} ul,
    ${root} ol,
    ${root} blockquote,
    ${root} pre,
    ${root} table {
      margin-top: 0;
    }
    ${root} h1 {
      margin: 0 0 var(--resume-h1-mb);
      color: var(--resume-text);
      font-size: var(--resume-name-size);
      line-height: 1.2;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-align: var(--resume-name-align);
    }
    ${root} h2 {
      display: block;
      margin: var(--resume-section-gap) 0 var(--resume-h2-mb);
      padding-bottom: 0;
      color: var(--resume-text);
      font-size: var(--resume-section-size);
      line-height: 1.35;
      font-weight: 700;
      border-bottom: none;
      background: none;
      text-decoration: none;
    }
    ${root} h2::after {
      content: '';
      display: block;
      box-sizing: border-box;
      width: 100%;
      height: var(--resume-rule-width);
      margin-top: var(--resume-h2-rule-gap);
      border: 0;
      padding: 0;
      background-color: var(--resume-divider);
      background-image: none;
      box-shadow: none;
      outline: none;
      transform: none;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
      pointer-events: none;
    }
    ${root} h3 {
      margin: var(--resume-h3-mt) 0 var(--resume-h3-mb);
      color: var(--resume-text);
      font-size: var(--resume-entry-size);
      line-height: 1.4;
      font-weight: 700;
    }
    ${root} p {
      margin-bottom: var(--resume-p-mb);
      color: var(--resume-text);
    }
    /* 覆盖 Tailwind preflight 的 list-style: none，保证编辑区/缩略图/导出角标一致 */
    ${root} ul {
      margin-bottom: var(--resume-list-mb);
      padding-left: 1.45em;
      list-style-type: disc;
      list-style-position: outside;
      color: var(--resume-text);
    }
    ${root} ol {
      margin-bottom: var(--resume-list-mb);
      padding-left: 1.45em;
      list-style-type: decimal;
      list-style-position: outside;
      color: var(--resume-text);
    }
    ${root} li {
      display: list-item;
      margin-bottom: var(--resume-item-gap);
      padding-left: 0.12em;
      color: var(--resume-text);
    }
    ${root} li:last-child {
      margin-bottom: 0;
    }
    /*
     * TipTap StarterKit 的 li 内会包一层 <p>，而 markdown-it 导出是纯文本节点。
     * 若保留 p 的 --resume-p-mb，会与 li 的 item-gap 外边距塌陷成更大间隙，
     * 效果区列表系统性偏高、页末比打印更早断页。
     */
    ${root} li > p {
      margin-top: 0;
      margin-bottom: 0;
    }
    ${root} strong {
      color: var(--resume-text);
      font-weight: 700;
    }
    ${root} em {
      color: var(--resume-muted);
    }
    ${root} a {
      color: var(--resume-muted);
      text-decoration: none;
    }
    ${root} blockquote {
      margin-right: 0;
      margin-bottom: var(--resume-list-mb);
      margin-left: 0;
      padding-left: 10px;
      color: var(--resume-muted);
      border-left: 2px solid var(--resume-divider);
    }
    ${root} pre {
      margin-bottom: var(--resume-list-mb);
      padding: 8px 10px;
      overflow: hidden;
      color: var(--resume-text);
      background: #f5f6f6;
      border-radius: 4px;
      white-space: pre-wrap;
    }
    ${root} table {
      width: 100%;
      border-collapse: collapse;
      color: var(--resume-text);
    }
    ${root} th,
    ${root} td {
      padding: 4px 6px;
      border: 1px solid #d8dcde;
    }
    ${root} .resume-profile-line,
    ${root} h1 + p,
    ${root} h1 + ul,
    ${root} h1 + ol {
      margin-bottom: var(--resume-profile-mb);
      color: var(--resume-text);
      text-align: var(--resume-name-align);
    }
    ${root} .resume-profile-line a {
      color: var(--resume-text);
    }
    /* TipTap 双栏原子外层：边距对齐打印 h3.resume-row，避免再叠一层行高 */
    ${root} .resume-row-block {
      margin: var(--resume-h3-mt) 0 var(--resume-h3-mb);
    }
    ${root} .resume-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 20px;
      color: var(--resume-text);
      font-size: var(--resume-entry-size);
      line-height: 1.4;
      font-weight: 700;
    }
    ${root} .resume-row-block .resume-row {
      margin: 0;
    }
    ${root} .resume-row[data-level='0'] {
      font-weight: 400;
    }
    ${root} .resume-row-main {
      min-width: 0;
      color: var(--resume-text);
    }
    ${root} .resume-row-side {
      flex: 0 0 auto;
      color: var(--resume-text);
      font-weight: 500;
      white-space: nowrap;
    }
  `
}

/**
 * 将 CSS 变量声明序列化为可写入 stylesheet 的声明块。
 *
 * 用例：varsToCssDeclarations(buildResumeSurfaceVars(styles, 1))
 */
export const varsToCssDeclarations = (vars: ResumeSurfaceVars): string =>
  serializeSurfaceVars(vars)

/**
 * 去掉标题上会与共享 ::after 分隔线冲突、或在 html2canvas 下穿字的写法。
 * 仅处理 h1/h2 规则体，不影响表格等其它 border-bottom。
 *
 * 用例：`h2 { border-bottom: 2px solid red; letter-spacing: .02em }` → 保留字距，去掉 border-bottom
 */
export const sanitizeResumeCustomCss = (css: string): string => {
  const trimmed = css.trim()
  if (trimmed.length === 0) return ''

  return trimmed.replace(
    /(h[12](?:\s*,\s*h[12])*)\s*\{([^}]*)\}/gi,
    (_full, selectors: string, body: string) => {
      const cleaned = body
        .replace(/border-bottom\s*:[^;]+;?/gi, '')
        .replace(/border\s*:[^;]+;?/gi, '')
        .replace(/text-decoration(?:-line)?\s*:[^;]*underline[^;]*;?/gi, '')
        .replace(/box-shadow\s*:[^;]+;?/gi, '')
      return `${selectors}{${cleaned}}`
    },
  )
}
