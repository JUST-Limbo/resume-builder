<script setup lang="ts">
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ResumePageBreak,
  ResumeRow,
  ResumeSourceBlock,
} from '../extensions/resumeSpecialNodes'
import { ResumeShortcuts } from '../extensions/resumeShortcuts'
import { ResumeVisualPagination } from '../extensions/resumeVisualPagination'
import { ResumeProfileLine } from '../extensions/resumeProfileLine'
import type { ResumeStyles } from '../types/resume'
import {
  A4_HEIGHT_PX,
  PAGE_GAP_PX,
  contentAreaHeightPx,
  mmToPx,
  stackHeightPx,
} from '../utils/a4Layout'
import {
  buildResumeDocumentCss,
  buildResumeSurfaceVars,
  ensureResumeFonts,
  sanitizeResumeCustomCss,
  snapResumeSectionRules,
} from '../utils/resumeDocumentStyles'

const props = defineProps<{
  modelValue: string
  styles: ResumeStyles
  customCss: string
  autoFitScale: number
  /** 智能分页（keep-with-next）；默认由文档字段控制 */
  smartPagination: boolean
  /** 禅模式：隐藏提示条，更沉浸 */
  compact?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  pageCount: [value: number]
}>()

let applyingExternal = false
let lastEmitted = props.modelValue
let emitTimer: ReturnType<typeof setTimeout> | null = null

const surfaceStyle = computed(() =>
  buildResumeSurfaceVars(props.styles, props.autoFitScale),
)
const stackRoot = ref<HTMLElement | null>(null)
const pageRoot = ref<HTMLElement | null>(null)
const customStyleEl = ref<HTMLStyleElement | null>(null)
const visualPageCount = ref(1)
/** 纸叠高度取「理论页叠」与「实际正文」较大值，避免底页露馅 */
const stackHeightCss = ref(`${stackHeightPx(1)}px`)

const stackStyle = computed(() => ({
  height: stackHeightCss.value,
  ['--resume-page-gap' as string]: `${PAGE_GAP_PX}px`,
  ['--resume-page-height' as string]: `${A4_HEIGHT_PX}px`,
}))

const sheetStyle = (index: number) => ({
  top: `${index * (A4_HEIGHT_PX + PAGE_GAP_PX)}px`,
  height: `${A4_HEIGHT_PX}px`,
})

const syncStackHeight = () => {
  const page = pageRoot.value
  const theoretical = stackHeightPx(visualPageCount.value, A4_HEIGHT_PX, PAGE_GAP_PX)
  const actual = page !== null ? page.offsetHeight : 0
  stackHeightCss.value = `${Math.max(theoretical, actual)}px`
}

/** 页面容器类选择器改写到纸张层，避免整段连续白底盖住页间隙 */
const rewritePageChromeCss = (css: string) =>
  css
    .replace(/\.typora-page\b/g, '.typora-sheet')
    .replace(/\.resume-page\b/g, '.typora-sheet')

const syncCustomCss = () => {
  const root = stackRoot.value
  if (root === null) return
  if (customStyleEl.value === null) {
    const style = document.createElement('style')
    style.setAttribute('data-resume-custom-css', 'true')
    root.prepend(style)
    customStyleEl.value = style
  }
  const documentCss = buildResumeDocumentCss('.typora-page .ProseMirror')
  const customCss = sanitizeResumeCustomCss(rewritePageChromeCss(props.customCss))
  customStyleEl.value.textContent = `${documentCss}\n${customCss}`
}

watch(
  () => props.customCss,
  () => {
    syncCustomCss()
    scheduleSnapSectionRules()
  },
)

const scheduleSnapSectionRules = () => {
  const run = () => {
    snapResumeSectionRules(pageRoot.value)
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      run()
      // ProseMirror 对齐/装饰更新会重建 h2；延后补打，避免标记被冲掉
      window.setTimeout(run, 48)
      window.setTimeout(run, 140)
      window.setTimeout(run, 320)
    })
  })
}

const refreshVisualPagination = () => {
  const current = editor.value
  if (current === undefined) return
  const storage = (
    current.storage as unknown as {
      resumeVisualPagination?: { refresh?: () => void }
    }
  ).resumeVisualPagination
  if (storage !== undefined && typeof storage.refresh === 'function') {
    storage.refresh()
  }
  scheduleSnapSectionRules()
}

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      },
    }),
    Placeholder.configure({
      placeholder: '开始撰写简历… 输入 # 空格可设标题',
    }),
    Markdown.configure({
      markedOptions: {
        gfm: true,
        breaks: true,
      },
    }),
    ResumePageBreak,
    ResumeRow,
    ResumeSourceBlock,
    ResumeShortcuts,
    ResumeProfileLine,
    ResumeVisualPagination.configure({
      getContentHeightPx: () => contentAreaHeightPx(props.styles.marginY),
      getMarginYPx: () => mmToPx(props.styles.marginY),
      getPageGapPx: () => PAGE_GAP_PX,
      getPageHeightPx: () => A4_HEIGHT_PX,
      getSmartPaginationEnabled: () => props.smartPagination,
      onPack: (count) => {
        const next = Math.max(1, count)
        visualPageCount.value = next
        emit('pageCount', next)
        void nextTick(() => {
          syncStackHeight()
          scheduleSnapSectionRules()
        })
      },
      onAligned: () => {
        scheduleSnapSectionRules()
      },
    }),
  ],
  content: props.modelValue,
  contentType: 'markdown',
  editorProps: {
    attributes: {
      class: 'resume-doc ProseMirror',
      spellcheck: 'false',
    },
  },
  onUpdate: ({ editor: current }) => {
    if (applyingExternal) return
    const markdown = current.getMarkdown()
    if (normalizeMarkdown(markdown) === normalizeMarkdown(lastEmitted)) {
      lastEmitted = markdown
      return
    }
    lastEmitted = markdown
    if (emitTimer !== null) clearTimeout(emitTimer)
    emitTimer = setTimeout(() => {
      emitTimer = null
      applyingExternal = true
      emit('update:modelValue', markdown)
      queueMicrotask(() => {
        applyingExternal = false
      })
    }, 200)
  },
})

const normalizeMarkdown = (value: string) => value.replace(/\r\n/g, '\n').replace(/\s+$/g, '')

watch(
  () => props.modelValue,
  (value) => {
    const current = editor.value
    if (current === undefined || applyingExternal) return
    if (normalizeMarkdown(value) === normalizeMarkdown(lastEmitted)) {
      lastEmitted = value
      return
    }
    if (normalizeMarkdown(current.getMarkdown()) === normalizeMarkdown(value)) {
      lastEmitted = value
      return
    }
    lastEmitted = value
    applyingExternal = true
    current.commands.setContent(value, { contentType: 'markdown' })
    queueMicrotask(() => {
      applyingExternal = false
    })
  },
)

watch(
  () =>
    [
      props.styles.marginY,
      props.styles.marginX,
      props.autoFitScale,
      props.smartPagination,
      props.styles.baseFontSize,
      props.styles.lineHeight,
      props.styles.itemGap,
      props.styles.sectionGap,
      props.styles.dividerWidth,
    ] as const,
  () => {
    void nextTick(() => refreshVisualPagination())
  },
)

let pageResizeObserver: ResizeObserver | null = null

onMounted(() => {
  void (async () => {
    // 与打印/导出同源等待 web font，避免首屏用雅黑度量分页、字体就绪后再跳
    await ensureResumeFonts(document)
    await nextTick()
    syncCustomCss()
    refreshVisualPagination()
    syncStackHeight()
    if (pageRoot.value !== null) {
      pageResizeObserver = new ResizeObserver(() => syncStackHeight())
      pageResizeObserver.observe(pageRoot.value)
    }
  })()
})

onBeforeUnmount(() => {
  if (pageResizeObserver !== null) {
    pageResizeObserver.disconnect()
    pageResizeObserver = null
  }
  if (emitTimer !== null) clearTimeout(emitTimer)
  editor.value?.destroy()
})
</script>

<template>
  <div class="typora-editor" :class="{ 'typora-editor--compact': compact }">
    <div class="typora-scroll">
      <div ref="stackRoot" class="typora-stack" :style="stackStyle">
        <div
          v-for="index in visualPageCount"
          :key="index"
          class="typora-sheet"
          :style="sheetStyle(index - 1)"
          aria-hidden="true"
        />
        <div ref="pageRoot" class="typora-page" :style="surfaceStyle">
          <EditorContent :editor="editor" class="typora-page__body" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.typora-editor {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: #d8dde1;
}

.typora-editor--compact .typora-scroll {
  padding: 36px 24px 56px;
}

.typora-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 28px 20px 64px;
}

.typora-stack {
  position: relative;
  width: 210mm;
  margin: 0 auto;
}

.typora-sheet {
  position: absolute;
  left: 0;
  width: 210mm;
  background: #fff;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 12px 36px rgba(30, 38, 43, 0.18),
    0 2px 6px rgba(30, 38, 43, 0.08);
  pointer-events: none;
}

.typora-page {
  position: relative;
  z-index: 1;
  width: 210mm;
  min-height: var(--resume-page-height, 1123px);
  margin: 0;
  padding: var(--resume-margin-y) var(--resume-margin-x);
  color: var(--resume-text);
  background: transparent;
  font-family: var(--resume-font);
  font-size: var(--resume-body);
  line-height: var(--resume-line);
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.typora-page__body {
  min-height: calc(var(--resume-page-height, 1123px) - 2 * var(--resume-margin-y));
  border: 0;
  outline: none;
  box-shadow: none;
  background: transparent;
}

/* TipTap 可编辑根：只承担编辑，不画整文档大框；纸张视觉交给 .typora-sheet */
:deep(.ProseMirror),
:deep(.resume-doc),
:deep(.tiptap) {
  min-height: inherit;
  border: 0;
  outline: none;
  box-shadow: none;
  background: transparent;
}

:deep(.ProseMirror > * + *) {
  margin-top: 0;
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  float: left;
  height: 0;
  color: #9aa1a6;
  content: attr(data-placeholder);
  pointer-events: none;
  font-size: 12px;
}

/* 正文排版由 buildResumeDocumentCss 注入，与预览/导出同源 */

:deep(.resume-auto-page-spacer) {
  box-sizing: border-box;
  pointer-events: none;
  user-select: none;
  border: 0;
  outline: none;
  box-shadow: none;
  background: transparent;
}

:deep(.resume-manual-page-break) {
  position: relative;
  display: flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  margin: 14px 0;
  border: 0;
  outline: none;
  box-shadow: none;
  background: transparent;
  user-select: none;
}

:deep(.resume-manual-page-break--expanded) {
  position: relative;
  box-sizing: border-box;
  height: auto;
  margin: 0;
  align-items: center;
  justify-content: center;
  padding-bottom: 0;
  border: 0;
  outline: none;
  box-shadow: none;
  background: transparent;
}

:deep(.resume-manual-page-break--expanded .resume-manual-page-break__label) {
  position: absolute;
  bottom: calc(var(--resume-page-margin-y, var(--resume-margin-y)) + 6px);
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
}

:deep(.resume-manual-page-break__label) {
  padding: 0 8px;
  color: transparent;
  background: transparent;
  font-size: 10px;
  letter-spacing: 0.08em;
  opacity: 0;
  pointer-events: none;
}

/* .resume-row-block / .resume-row 边距与行高由 buildResumeDocumentCss 注入 */

:deep(.resume-row-block__view) {
  cursor: text;
}

:deep(.resume-row-block__view--invalid) {
  color: #b42318;
  font-size: 12px;
}

/* .resume-row 排版由 buildResumeDocumentCss 注入；以下仅编辑态交互 */

:deep(.resume-row-block__source),
:deep(.resume-source-block__source) {
  display: block;
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  color: #202428;
  background: #f7f8f8;
  border: 1px solid #cfd4d6;
  border-radius: 6px;
  outline: none;
  resize: vertical;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
}

:deep(.resume-source-block) {
  margin: 8px 0;
  overflow: hidden;
  border: 1px dashed #d5d9db;
  border-radius: 8px;
  background: #fafbfb;
}

:deep(.resume-source-block__badge) {
  padding: 6px 10px;
  color: #7b8388;
  border-bottom: 1px solid #e8ebec;
  cursor: pointer;
  font-size: 10px;
  font-weight: 650;
}

:deep(.resume-source-block__pre) {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  color: #31373b;
  cursor: text;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
