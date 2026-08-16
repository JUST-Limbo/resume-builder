import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  A4_HEIGHT_PX,
  PAGE_GAP_PX,
  alignPackToPageGeometry,
  isKeepLabelText,
  keepKindFromHeadingLevel,
  listPageBreakAnchors,
  measureBlockStartHeightPx,
  measureFlowAdvancePx,
  mmToPx,
  packVisualPages,
  type PackKeepKind,
  type VisualPagePackItem,
  type VisualPagePackResult,
} from '../utils/a4Layout'
import { parseResumeRowRaw } from './resumeSpecialNodes'

export type ResumeVisualPaginationOptions = {
  /** 当前单页内容区高度（px），随页边距变化 */
  getContentHeightPx: () => number
  /** 上下页边距（px），用于跨页 spacer 补齐每页 margin */
  getMarginYPx?: () => number
  getPageGapPx?: () => number
  getPageHeightPx?: () => number
  /** 是否启用智能 keep（标题/标签防孤悬）；默认关闭 */
  getSmartPaginationEnabled?: () => boolean
  /** 装页结果回调，供外层渲染纸叠与顶栏页数 */
  onPack?: (pageCount: number) => void
  /** 页几何对齐完成（装饰/spacer 稳定）后回调，供分隔线像素对齐等 */
  onAligned?: () => void
}

const pluginKey = new PluginKey<DecorationSet>('resumeVisualPagination')

/** 手动分页节点未撑开时的基准占位（与 CSS height: 28px 对齐；装页时用常量，避免被撑开高度污染） */
const MANUAL_BREAK_BASE_PX = 28

const createSpacerElement = (height: number, gap: number, marginY: number) => {
  const el = document.createElement('div')
  el.className = 'resume-auto-page-spacer'
  el.dataset.autoPageSpacer = 'true'
  el.contentEditable = 'false'
  el.style.height = `${height}px`
  el.style.setProperty('--resume-page-gap', `${gap}px`)
  el.style.setProperty('--resume-page-margin-y', `${marginY}px`)
  return el
}

const signatureOf = (packed: VisualPagePackResult) =>
  JSON.stringify({
    spacers: packed.spacers,
    breaks: packed.breakExpands,
    pageCount: packed.pageCount,
  })

/**
 * 效果区视觉分页：不改写文档，只用 decoration spacer + 手动分页节点撑高，
 * 让连续 TipTap 正文对齐多张 A4 纸叠。页间视觉靠纸叠空隙，spacer 本身透明不画灰缝。
 */
export const ResumeVisualPagination = Extension.create<ResumeVisualPaginationOptions>({
  name: 'resumeVisualPagination',

  addOptions() {
    return {
      getContentHeightPx: () => 900,
      getMarginYPx: () => mmToPx(14),
      getPageGapPx: () => PAGE_GAP_PX,
      getPageHeightPx: () => A4_HEIGHT_PX,
      getSmartPaginationEnabled: () => false,
      onPack: undefined,
      onAligned: undefined,
    }
  },

  addStorage() {
    return {
      refresh: () => undefined as void,
    }
  },

  addProseMirrorPlugins() {
    const extension = this

    return [
      new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const next = tr.getMeta(pluginKey) as DecorationSet | undefined
            if (next !== undefined) return next
            if (tr.docChanged) return old.map(tr.mapping, tr.doc)
            return old
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state) || DecorationSet.empty
          },
        },
        view(editorView) {
          let lastSignature = ''
          let lastPacked: VisualPagePackResult | null = null
          let lastContentItems: VisualPagePackItem[] | null = null
          let alignSettled = false
          let timer = 0
          let alignTimer = 0
          let applying = false
          /** 忽略自身改 spacer / decoration 引起的 ResizeObserver，打断装页↔对齐反馈环 */
          let ignoreResizeUntil = 0

          const bumpIgnoreResize = () => {
            ignoreResizeUntil = performance.now() + 120
          }

          const clearBreakStyles = () => {
            const breaks = editorView.dom.querySelectorAll<HTMLElement>('.resume-manual-page-break')
            for (const el of Array.from(breaks)) {
              el.style.minHeight = ''
              el.classList.remove('resume-manual-page-break--expanded')
            }
          }

          const applyBreakStyles = (
            expands: { pos: number; height: number }[],
            marginY: number,
            gap: number,
          ) => {
            clearBreakStyles()
            for (const item of expands) {
              if (item.height <= 0) continue
              const dom = editorView.nodeDOM(item.pos)
              if (!(dom instanceof HTMLElement)) continue
              if (!dom.classList.contains('resume-manual-page-break')) continue
              dom.classList.add('resume-manual-page-break--expanded')
              dom.style.minHeight = `${item.height}px`
              dom.style.setProperty('--resume-page-margin-y', `${marginY}px`)
              dom.style.setProperty('--resume-page-gap', `${gap}px`)
            }
          }

          const findSpacerBefore = (pos: number) => {
            const dom = editorView.nodeDOM(pos)
            if (!(dom instanceof HTMLElement)) return null
            const prev = dom.previousElementSibling
            if (!(prev instanceof HTMLElement)) return null
            if (prev.dataset.autoPageSpacer !== 'true') return null
            return prev
          }

          const pageRootTop = () => {
            const page = editorView.dom.closest('.typora-page')
            if (!(page instanceof HTMLElement)) return null
            return page.getBoundingClientRect().top
          }

          const measureTopPx = (docPos: number) => {
            const rootTop = pageRootTop()
            if (rootTop === null) return null
            const dom = editorView.nodeDOM(docPos)
            if (!(dom instanceof HTMLElement)) return null
            return dom.getBoundingClientRect().top - rootTop
          }

          const resolveKeepKind = (node: ProseMirrorNode): PackKeepKind => {
            const smartEnabled = extension.options.getSmartPaginationEnabled
              ? extension.options.getSmartPaginationEnabled()
              : false
            if (!smartEnabled) return 'none'

            if (node.type.name === 'heading') {
              return keepKindFromHeadingLevel(Number(node.attrs.level))
            }
            if (node.type.name === 'resumeRow') {
              const parsed = parseResumeRowRaw(String(node.attrs.raw || ''))
              if (parsed === null) return 'none'
              return keepKindFromHeadingLevel(parsed.level)
            }
            if (node.type.name === 'paragraph') {
              if (isKeepLabelText(node.textContent)) return 'label'
            }
            return 'none'
          }

          const isListType = (name: string) => name === 'bulletList' || name === 'orderedList'

          /**
           * 列表按 li 装页（对齐 resumePageEngine.addList），避免整表 keep-together
           * 在页尾留下大片空白。条目高度用相邻 li / 表前块的流式推进量。
           */
          const pushListItems = (
            listNode: ProseMirrorNode,
            listPos: number,
            listDom: HTMLElement,
            items: VisualPagePackItem[],
            prevContentDom: HTMLElement | null,
            prevWasBreak: boolean,
            listGroupId: number,
          ) => {
            let prevLiDom: HTMLElement | null = null

            listNode.forEach((child, offset) => {
              if (child.type.name !== 'listItem') return
              const itemPos = listPos + 1 + offset
              const liDom = editorView.nodeDOM(itemPos)
              if (!(liDom instanceof HTMLElement)) return

              let height: number
              if (prevLiDom !== null) {
                height = measureFlowAdvancePx(liDom, prevLiDom)
              } else if (prevWasBreak || prevContentDom === null) {
                const listTop = listDom.getBoundingClientRect().top
                height = Math.max(0, liDom.getBoundingClientRect().bottom - listTop)
              } else {
                let spacer = 0
                let el = prevContentDom.nextElementSibling
                while (el !== null && el !== listDom) {
                  if (el instanceof HTMLElement && el.dataset.autoPageSpacer === 'true') {
                    spacer += el.offsetHeight
                  }
                  el = el.nextElementSibling
                }
                height = Math.max(
                  0,
                  liDom.getBoundingClientRect().bottom -
                    prevContentDom.getBoundingClientRect().bottom -
                    spacer,
                )
              }

              // list margin-bottom 留给「下一块相对 listDom 的 flow advance」计一次，
              // 勿在末条再加，否则每个列表多计 ~list-mb，一页多个列表会系统性提前断页。
              items.push({
                pos: itemPos,
                height: Math.max(0, height),
                isBreak: false,
                keepWithNext: false,
                keepKind: 'none',
                listGroupId,
              })
              prevLiDom = liDom
            })

            return prevLiDom !== null ? listDom : null
          }

          /**
           * 装页测量必须按「无 spacer」连续文档流：已插入的 auto-spacer 会切断
           * 相邻块 margin 塌陷，把推进量虚高约一个边距，进而锁死错误断页。
           */
          const withSpacersHidden = (measure: () => VisualPagePackItem[]) => {
            const spacers = Array.from(
              editorView.dom.querySelectorAll<HTMLElement>('[data-auto-page-spacer="true"]'),
            )
            for (const el of spacers) {
              el.style.display = 'none'
            }
            if (spacers.length > 0) {
              void editorView.dom.offsetHeight
            }
            try {
              return measure()
            } finally {
              for (const el of spacers) {
                el.style.display = ''
              }
              if (spacers.length > 0) {
                void editorView.dom.offsetHeight
              }
            }
          }

          const collectItems = (): VisualPagePackItem[] =>
            withSpacersHidden(() => {
              const items: VisualPagePackItem[] = []
              let prevContentDom: HTMLElement | null = null
              let prevWasBreak = false
              let listGroupSeq = 0

              editorView.state.doc.forEach((node, pos) => {
                const dom = editorView.nodeDOM(pos)
                if (!(dom instanceof HTMLElement)) return
                const isBreak = node.type.name === 'resumePageBreak'
                if (isBreak) {
                  items.push({
                    pos,
                    height: MANUAL_BREAK_BASE_PX,
                    isBreak: true,
                    keepWithNext: false,
                    keepKind: 'none',
                  })
                  prevContentDom = dom
                  prevWasBreak = true
                  return
                }

                if (isListType(node.type.name)) {
                  listGroupSeq += 1
                  const listDomAfter = pushListItems(
                    node,
                    pos,
                    dom,
                    items,
                    prevContentDom,
                    prevWasBreak,
                    listGroupSeq,
                  )
                  if (listDomAfter !== null) {
                    prevContentDom = listDomAfter
                    prevWasBreak = false
                  }
                  return
                }

                // 换页后首块：计 mt+边框盒，勿用含 mb 的 margin-box（否则与下一块 flow 双计 mb）
                const height =
                  prevWasBreak || prevContentDom === null
                    ? measureBlockStartHeightPx(
                        dom,
                        prevContentDom === null && dom.parentElement !== null
                          ? dom.parentElement.getBoundingClientRect().top
                          : undefined,
                      )
                    : measureFlowAdvancePx(dom, prevContentDom)

                const keepKind = resolveKeepKind(node)
                items.push({
                  pos,
                  height,
                  isBreak: false,
                  keepWithNext: keepKind !== 'none',
                  keepKind,
                })
                prevContentDom = dom
                prevWasBreak = false
              })
              return items
            })

          /**
           * 正文块结构/高度是否发生「有意义」变化。
           * 允许 ±1px 亚像素取整抖动，避免反复装页把 align 结果冲掉。
           */
          const isSignificantContentChange = (next: VisualPagePackItem[]) => {
            const prev = lastContentItems
            if (prev === null) return true
            if (prev.length !== next.length) return true
            for (let index = 0; index < next.length; index += 1) {
              const a = prev[index]
              const b = next[index]
              if (
                a.pos !== b.pos ||
                a.isBreak !== b.isBreak ||
                a.keepWithNext !== b.keepWithNext ||
                a.keepKind !== b.keepKind ||
                a.listGroupId !== b.listGroupId
              ) {
                return true
              }
              if (Math.abs(a.height - b.height) > 1) return true
            }
            return false
          }

          const buildDecorations = (packed: VisualPagePackResult, gap: number, marginY: number) =>
            DecorationSet.create(
              editorView.state.doc,
              packed.spacers.map((spacer) =>
                Decoration.widget(
                  spacer.pos,
                  () => createSpacerElement(spacer.height, gap, marginY),
                  { side: -1, key: `page-spacer-${spacer.pos}` },
                ),
              ),
            )

          const commitPack = (packed: VisualPagePackResult, gap: number, marginY: number) => {
            const sig = signatureOf(packed)
            lastPacked = packed
            if (sig === lastSignature) {
              extension.options.onPack?.(packed.pageCount)
              return false
            }
            lastSignature = sig
            applying = true
            bumpIgnoreResize()
            editorView.dispatch(editorView.state.tr.setMeta(pluginKey, buildDecorations(packed, gap, marginY)))
            applyBreakStyles(packed.breakExpands, marginY, gap)
            extension.options.onPack?.(packed.pageCount)
            applying = false
            bumpIgnoreResize()
            return true
          }

          const notifyAligned = () => {
            const cb = extension.options.onAligned
            if (typeof cb === 'function') {
              window.requestAnimationFrame(() => {
                if (editorView.isDestroyed) return
                cb()
              })
            }
          }

          const alignCommittedPack = (
            packed: VisualPagePackResult,
            gap: number,
            marginY: number,
            pageHeight: number,
          ) => {
            if (editorView.isDestroyed) return

            const anchors = listPageBreakAnchors(packed, (breakPos) => {
              const node = editorView.state.doc.nodeAt(breakPos)
              if (node === null) return null
              return breakPos + node.nodeSize
            })
            if (anchors.length === 0) {
              alignSettled = true
              notifyAligned()
              return
            }

            bumpIgnoreResize()
            const aligned = alignPackToPageGeometry(
              packed,
              anchors,
              measureTopPx,
              (anchor, nextHeight) => {
                if (anchor.kind === 'spacer') {
                  const el = findSpacerBefore(anchor.pos)
                  if (el !== null) el.style.height = `${nextHeight}px`
                } else {
                  const dom = editorView.nodeDOM(anchor.pos)
                  if (dom instanceof HTMLElement) {
                    dom.style.minHeight = `${nextHeight}px`
                  }
                }
                // 强制同步布局，供下一锚点测量
                void editorView.dom.offsetHeight
              },
              marginY,
              gap,
              pageHeight,
            )

            commitPack(aligned, gap, marginY)
            alignSettled = true
            bumpIgnoreResize()
            notifyAligned()
          }

          const scheduleAlign = (gap: number, marginY: number, pageHeight: number) => {
            window.clearTimeout(alignTimer)
            alignTimer = window.setTimeout(() => {
              window.requestAnimationFrame(() => {
                if (editorView.isDestroyed || lastPacked === null) return
                alignCommittedPack(lastPacked, gap, marginY, pageHeight)
              })
            }, 0)
          }

          const recompute = () => {
            if (applying || editorView.isDestroyed) return

            const contentHeight = extension.options.getContentHeightPx()
            const gap = extension.options.getPageGapPx
              ? extension.options.getPageGapPx()
              : PAGE_GAP_PX
            const marginY = extension.options.getMarginYPx
              ? extension.options.getMarginYPx()
              : mmToPx(14)
            const pageHeight = extension.options.getPageHeightPx
              ? extension.options.getPageHeightPx()
              : A4_HEIGHT_PX
            if (contentHeight <= 0) return

            const items = collectItems()
            const contentChanged = isSignificantContentChange(items)

            // 正文未变且已对齐：跳过重装页，避免 pack 用 remain 盖掉 align 后的 spacer（第 2 页上下抖）
            if (!contentChanged && alignSettled && lastPacked !== null) {
              return
            }

            if (contentChanged || lastPacked === null) {
              lastContentItems = items
              alignSettled = false
              const packed = packVisualPages(items, contentHeight, gap, marginY)
              commitPack(packed, gap, marginY)
              scheduleAlign(gap, marginY, pageHeight)
              return
            }

            // 正文未变但尚未对齐：只跑几何校正，不再用 pack remain 重置 spacer
            scheduleAlign(gap, marginY, pageHeight)
          }

          const schedule = () => {
            window.clearTimeout(timer)
            timer = window.setTimeout(() => {
              window.requestAnimationFrame(recompute)
            }, 48)
          }

          const invalidate = () => {
            lastSignature = ''
            lastContentItems = null
            alignSettled = false
            schedule()
          }

          extension.storage.refresh = () => {
            invalidate()
          }

          const resizeObserver = new ResizeObserver(() => {
            if (applying || performance.now() < ignoreResizeUntil) return
            schedule()
          })
          resizeObserver.observe(editorView.dom)

          schedule()

          return {
            update(view, prevState) {
              if (applying) return
              if (view.state.doc !== prevState.doc) {
                invalidate()
              }
            },
            destroy() {
              window.clearTimeout(timer)
              window.clearTimeout(alignTimer)
              resizeObserver.disconnect()
              clearBreakStyles()
              extension.storage.refresh = () => undefined
            },
          }
        },
      }),
    ]
  },
})
