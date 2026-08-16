/** 与 ResumePreview 一致的 A4 像素尺寸（96dpi） */
export const A4_WIDTH_PX = (210 / 25.4) * 96
export const A4_HEIGHT_PX = (297 / 25.4) * 96
/** 效果区多页之间的视觉间隙 */
export const PAGE_GAP_PX = 28

export const mmToPx = (mm: number) => (mm / 25.4) * 96

/**
 * 单页可排版内容区高度（去掉上下页边距）。
 * 四舍五入对齐 resumePageEngine 里 `.resume-content` 的 clientHeight（如 marginY=12 → 1032），
 * 避免效果区理论高度 1031.81 与打印实测差 0.2px 叠加上测量误差后提前断页。
 *
 * 用例：marginYmm=12 → 1032；marginYmm=14 → 约 1017
 */
export const contentAreaHeightPx = (marginYmm: number) =>
  Math.round(A4_HEIGHT_PX - 2 * mmToPx(marginYmm))

/** 纸张步进：一页高度 + 页间隙 */
export const pageStridePx = (pageHeight = A4_HEIGHT_PX, gap = PAGE_GAP_PX) => pageHeight + gap

/**
 * 第 pageIndex 页（0 起）内容区顶边相对 `.typora-page` 顶边的偏移。
 * 用例：pageIndex=1、marginY=53 → stride + 53
 */
export const pageContentTopPx = (
  pageIndex: number,
  marginYPx: number,
  pageHeight = A4_HEIGHT_PX,
  gap = PAGE_GAP_PX,
) => pageIndex * pageStridePx(pageHeight, gap) + marginYPx

/**
 * 单块 margin-box 高度（可能与邻块 margin 塌陷重复计算，仅作独立块估计）。
 * 保持浮点，勿对每块 ceil：一页几十块各进 1px 会系统性缩短可排高度、提前断页。
 *
 * 用例：h2 margin-top=11 + height=24 + margin-bottom=7 → 约 42
 */
export const measureDomBlockHeightPx = (dom: HTMLElement) => {
  const style = window.getComputedStyle(dom)
  const marginTop = Number.parseFloat(style.marginTop)
  const marginBottom = Number.parseFloat(style.marginBottom)
  const mt = Number.isFinite(marginTop) ? marginTop : 0
  const mb = Number.isFinite(marginBottom) ? marginBottom : 0
  const box = dom.getBoundingClientRect().height
  const fallback = dom.offsetHeight
  const core = box > 0 ? box : fallback
  return Math.max(0, core + mt + mb)
}

/**
 * 文档流首块（或换页后首块）的装页高度：含 margin-top + 边框盒，不含 margin-bottom。
 * mb 由下一块 measureFlowAdvancePx（prev 边框底 → 本块边框底）计入；
 * 若这里再用 measureDomBlockHeightPx 会把 mb 算两次（如 h1 mb=8 整页虚高 8px）。
 *
 * 用例：h1 高 34.4、mb=8 → 返回 34.4（不是 42.4）
 */
export const measureBlockStartHeightPx = (dom: HTMLElement, fromTopPx?: number) => {
  const rect = dom.getBoundingClientRect()
  if (fromTopPx !== undefined) {
    return Math.max(0, rect.bottom - fromTopPx)
  }
  const style = window.getComputedStyle(dom)
  const marginTop = Number.parseFloat(style.marginTop)
  const mt = Number.isFinite(marginTop) ? marginTop : 0
  const box = rect.height > 0 ? rect.height : dom.offsetHeight
  return Math.max(0, mt + box)
}

/**
 * 文档流中「上一内容块底 → 本块底」的推进高度，并扣掉中间的 auto-spacer，
 * 以正确处理 margin 塌陷，且不受已有视觉间隔污染。
 * 返回浮点推进量（与打印引擎 scrollHeight 累加方式一致）；spacer 写入 DOM 时再取整。
 *
 * 用例：两段之间 margin 塌陷为 8、无 spacer → 推进量 = 本块底 - 上块底
 */
export const measureFlowAdvancePx = (dom: HTMLElement, prevDom: HTMLElement | null) => {
  const rect = dom.getBoundingClientRect()
  if (prevDom === null) {
    const parent = dom.parentElement
    if (parent === null) return measureDomBlockHeightPx(dom)
    const parentTop = parent.getBoundingClientRect().top
    return Math.max(0, rect.bottom - parentTop)
  }

  let spacer = 0
  let el = prevDom.nextElementSibling
  while (el !== null && el !== dom) {
    if (el instanceof HTMLElement && el.dataset.autoPageSpacer === 'true') {
      // 用整数 offsetHeight，避免 getBoundingClientRect 亚像素与 spacer 整数高度来回差 1px
      spacer += el.offsetHeight
    }
    el = el.nextElementSibling
  }

  const prevBottom = prevDom.getBoundingClientRect().bottom
  return Math.max(0, rect.bottom - prevBottom - spacer)
}

export type VisualPageSpacer = {
  /** 插在该 doc 位置之前的间隔高度（含页内剩余空白 + 页间隙） */
  pos: number
  height: number
}

export type VisualPageBreakExpand = {
  /** resumePageBreak 节点起始位置 */
  pos: number
  height: number
}

/**
 * 智能分页 keep 亲和：
 * - section：章节 h2，与后续首段/列表首条尽量同页
 * - entry：项目/经历 h3、resume-row，与紧随技术栈/业务产出等正文同页（不含列表本体）
 * - label：短标签行（如「业务产出：」），与紧随列表首条同页
 * - none：无 keep
 */
export type PackKeepKind = 'none' | 'section' | 'entry' | 'label'

/** 强制换页时，本页剩余空白不得超过内容区此比例（避免过大留白） */
export const KEEP_MAX_BLANK_RATIO = 0.28

/** 单次 keep 窗口高度上限（相对内容区）；超出则收紧，允许列表按条续排 */
export const KEEP_MAX_WINDOW_RATIO = 0.55

/** 短标签行文本上限（「业务产出：」等） */
export const KEEP_LABEL_MAX_CHARS = 12

/**
 * 判定是否为应与下一块同页的短标签行。
 * 用例：`业务产出：` → true；`技术栈： Vue 3、…` → false（过长）
 */
export const isKeepLabelText = (text: string) => {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length === 0 || trimmed.length > KEEP_LABEL_MAX_CHARS) return false
  return /[：:]$/.test(trimmed)
}

/**
 * 从标题层级解析 keep 亲和。
 * 用例：level=2 → section；level=3 → entry；其它 → none
 */
export const keepKindFromHeadingLevel = (level: number): PackKeepKind => {
  if (level === 2) return 'section'
  if (level === 3) return 'entry'
  return 'none'
}

/**
 * 打印 DOM 节点的 keep 亲和（与视觉分页 resolveKeepKind 对齐）。
 * 用例：h2 → section；h3/resume-row → entry；短「业务产出：」→ label
 */
export const resolveDomKeepKind = (node: Element): PackKeepKind => {
  const tag = node.tagName
  if (tag === 'H2') return 'section'
  if (tag === 'H3') return 'entry'
  if (node.classList.contains('resume-row')) {
    const levelAttr = node.getAttribute('data-level')
    if (levelAttr === '2') return 'section'
    if (levelAttr === '3' || levelAttr === null || levelAttr === '') return 'entry'
    return 'none'
  }
  if (tag === 'P') {
    const text = node.textContent === null ? '' : node.textContent
    if (isKeepLabelText(text)) return 'label'
  }
  return 'none'
}

export type VisualPagePackItem = {
  pos: number
  height: number
  isBreak: boolean
  /** 与 keepKind !== 'none' 同步，便于旧逻辑比对 */
  keepWithNext: boolean
  /** 智能分页亲和类型 */
  keepKind: PackKeepKind
  /**
   * 同一列表内条目共享 id；keep 窗口遇到列表时只计入该组首条，
   * 其余条目可跨页续排。
   */
  listGroupId?: number
}

export type VisualPagePackResult = {
  pageCount: number
  spacers: VisualPageSpacer[]
  breakExpands: VisualPageBreakExpand[]
}

const isKeepBoundary = (item: VisualPagePackItem) =>
  item.keepKind === 'section' || item.keepKind === 'entry'

/**
 * 计算 keep 窗口「后续」高度（不含自身）。
 * - section：后续至多 2 个内容单元；列表只计首条
 * - entry：直到下一个 section/entry；计入技术栈/业务产出等正文，**不含列表**
 *   （列表由 label 锁首条，其余按条续排，避免把「移动业务中台」整段提前推走）
 * - label：仅下一块；若为列表则只计首条
 *
 * 用例：项目标题后接技术栈+业务产出+4 条列表 → 计入技术栈+业务产出，不含列表
 */
export const computeKeepTailHeight = (
  items: VisualPagePackItem[],
  index: number,
  contentHeight: number,
): number => {
  const item = items[index]
  const kind = item.keepKind
  if (kind === 'none') return 0

  const maxWindow = contentHeight * KEEP_MAX_WINDOW_RATIO
  let tail = 0
  let units = 0
  let look = index + 1
  const maxUnits = kind === 'label' ? 1 : kind === 'section' ? 2 : Number.POSITIVE_INFINITY

  while (look < items.length) {
    const follow = items[look]
    if (follow.isBreak) break
    if (kind !== 'label' && isKeepBoundary(follow)) break

    if (follow.listGroupId !== undefined) {
      if (kind === 'entry') break
      const groupId = follow.listGroupId
      tail += follow.height
      units += 1
      look += 1
      while (look < items.length && items[look].listGroupId === groupId) {
        look += 1
      }
    } else {
      tail += follow.height
      units += 1
      look += 1
    }

    if (units >= maxUnits) break
    if (item.height + tail > maxWindow) break
  }

  return Math.max(0, tail)
}

/**
 * 收集打印分页 keep 探测用的克隆节点（含自身）。
 * entry 不含列表；section/label 列表只带首条。
 *
 * 用例：h3 + 技术栈 + ul → [h3, 技术栈]；「业务产出：」+ ol → [p, ol(仅首 li)]
 */
export const collectDomKeepProbeClones = (nodes: Element[], index: number): HTMLElement[] => {
  const start = nodes[index]
  const kind = resolveDomKeepKind(start)
  const clones: HTMLElement[] = [start.cloneNode(true) as HTMLElement]
  if (kind === 'none') return clones

  let units = 0
  let look = index + 1
  const maxUnits = kind === 'label' ? 1 : kind === 'section' ? 2 : 8

  while (look < nodes.length) {
    const follow = nodes[look]
    if (follow.classList.contains('resume-manual-page-break')) break
    const followKind = resolveDomKeepKind(follow)
    if (kind !== 'label' && (followKind === 'section' || followKind === 'entry')) break

    if (follow.tagName === 'UL' || follow.tagName === 'OL') {
      if (kind === 'entry') break
      const firstItem = follow.children.length > 0 ? follow.children[0] : null
      if (firstItem !== null) {
        const listClone = follow.cloneNode(false) as HTMLElement
        listClone.appendChild(firstItem.cloneNode(true))
        clones.push(listClone)
      }
      units += 1
      look += 1
    } else {
      clones.push(follow.cloneNode(true) as HTMLElement)
      units += 1
      look += 1
    }

    if (units >= maxUnits) break
  }

  return clones
}

/**
 * 本页已有内容时，若自身+keep 尾放不下，是否应整块改到下一页。
 * 仅当剩余空白不超过 KEEP_MAX_BLANK_RATIO，且整窗能装进空页时才强制换页，
 * 避免「移动业务中台」等仅标题+技术栈仍可落在页末的场景被整段推走。
 *
 * 用例：remain 小、标题+首段放不下 → true；remain 大但整项目过高 → false（允许列表续排）
 */
export const shouldBreakBeforeKeep = (
  used: number,
  selfHeight: number,
  tailHeight: number,
  contentHeight: number,
): boolean => {
  if (used <= 0) return false
  const tolerance = contentHeight + 1
  if (used + selfHeight > tolerance) return true

  if (tailHeight <= 0) return false
  if (used + selfHeight + tailHeight <= tolerance) return false

  const remain = Math.max(0, contentHeight - used)
  const maxBlank = contentHeight * KEEP_MAX_BLANK_RATIO
  const windowHeight = selfHeight + tailHeight
  if (windowHeight > tolerance) return false
  return remain <= maxBlank
}

/**
 * 跨页视觉间隔高度 = 本页剩余空白 + 下页边距 + 页间隙 + 上页边距。
 * 效果区是单层 padding，必须用间隔「补」出每页自己的 margin。
 */
export const interPageSpacerHeight = (remainPx: number, marginYPx: number, gapPx: number) =>
  Math.max(gapPx + 2 * marginYPx, remainPx + gapPx + 2 * marginYPx)

/**
 * 按固定内容区高度把块级节点装进多页，产出视觉间隔。
 *
 * 对齐 resumePageEngine.paginate 主干：
 * - `\newpage`：当前页已有内容且后面还有节点时强制换页（标记本身不占正文高度）
 * - 高度溢出：整块挪到下一页；列表应在收集阶段拆成条目，以便与打印 addList 一样可跨页续排
 * - section/entry/label：智能 keep 窗口（列表只锁首条，受空白比例约束）；
 *   由调用方在 items.keepKind 上控制；keepKind 全为 none 即朴素按高度断页
 *
 * 用例：两块超高 → 第二块前插 spacer；手动分页 → breakExpand 吃掉剩余 + 页间隙。
 */
export const packVisualPages = (
  items: VisualPagePackItem[],
  contentHeight: number,
  gap: number,
  marginYPx: number,
): VisualPagePackResult => {
  const spacers: VisualPageSpacer[] = []
  const breakExpands: VisualPageBreakExpand[] = []
  let used = 0
  let pageCount = 1

  if (items.length === 0) {
    return { pageCount: 1, spacers, breakExpands }
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const hasFollowing = index < items.length - 1

    if (item.isBreak) {
      if (used > 0 && hasFollowing) {
        const remain = Math.max(0, contentHeight - used)
        breakExpands.push({
          pos: item.pos,
          height: Math.round(interPageSpacerHeight(remain, marginYPx, gap)),
        })
        pageCount += 1
        used = 0
      } else {
        // 页首连续分页或文末分页：只保留标记自然高度，不额外增页
        breakExpands.push({ pos: item.pos, height: 0 })
      }
      continue
    }

    const tailHeight = computeKeepTailHeight(items, index, contentHeight)
    const breakForKeep = shouldBreakBeforeKeep(used, item.height, tailHeight, contentHeight)

    if (breakForKeep) {
      const remain = Math.max(0, contentHeight - used)
      spacers.push({
        pos: item.pos,
        height: Math.round(interPageSpacerHeight(remain, marginYPx, gap)),
      })
      pageCount += 1
      used = 0
    }

    used += item.height
    if (used > contentHeight + 1) {
      used = contentHeight
    }
  }

  return { pageCount: Math.max(1, pageCount), spacers, breakExpands }
}

export type PageBreakAnchor =
  | { kind: 'spacer'; pos: number }
  | { kind: 'break'; pos: number; nextPos: number }

/**
 * 按文档顺序收集会开启新页的锚点（自动 spacer / 已展开的手动分页）。
 */
export const listPageBreakAnchors = (
  packed: VisualPagePackResult,
  breakNextPos: (breakPos: number) => number | null,
): PageBreakAnchor[] => {
  const anchors: PageBreakAnchor[] = []
  for (const spacer of packed.spacers) {
    anchors.push({ kind: 'spacer', pos: spacer.pos })
  }
  for (const item of packed.breakExpands) {
    if (item.height <= 0) continue
    const nextPos = breakNextPos(item.pos)
    if (nextPos === null) continue
    anchors.push({ kind: 'break', pos: item.pos, nextPos })
  }
  anchors.sort((a, b) => a.pos - b.pos)
  return anchors
}

/**
 * 将已插入的 spacer / 手动分页高度校正到真实纸张几何：
 * 新页首块顶边必须落在 pageContentTop(pageIndex)，缝只留在间隔内。
 *
 * mutateDom：边校正边写 DOM，保证后续页测量不受前页误差累积影响。
 */
export const alignPackToPageGeometry = (
  packed: VisualPagePackResult,
  anchors: PageBreakAnchor[],
  measureTopPx: (docPos: number) => number | null,
  mutateHeight: (anchor: PageBreakAnchor, nextHeight: number) => void,
  marginYPx: number,
  gapPx: number,
  pageHeight = A4_HEIGHT_PX,
): VisualPagePackResult => {
  const spacers = packed.spacers.map((item) => ({ ...item }))
  const breakExpands = packed.breakExpands.map((item) => ({ ...item }))
  const minHeight = gapPx + 2 * marginYPx

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index]
    const pageIndex = index + 1
    const desired = pageContentTopPx(pageIndex, marginYPx, pageHeight, gapPx)
    const startPos = anchor.kind === 'spacer' ? anchor.pos : anchor.nextPos
    const actual = measureTopPx(startPos)
    if (actual === null) continue

    const delta = desired - actual
    if (Math.abs(delta) < 0.75) continue

    if (anchor.kind === 'spacer') {
      const target = spacers.find((item) => item.pos === anchor.pos)
      if (target === undefined) continue
      target.height = Math.max(minHeight, Math.round(target.height + delta))
      mutateHeight(anchor, target.height)
    } else {
      const target = breakExpands.find((item) => item.pos === anchor.pos)
      if (target === undefined) continue
      target.height = Math.max(minHeight, Math.round(target.height + delta))
      mutateHeight(anchor, target.height)
    }
  }

  return {
    pageCount: packed.pageCount,
    spacers,
    breakExpands,
  }
}

/** 多页纸叠外层总高度 */
export const stackHeightPx = (pageCount: number, pageHeight = A4_HEIGHT_PX, gap = PAGE_GAP_PX) =>
  pageCount * pageHeight + Math.max(0, pageCount - 1) * gap
