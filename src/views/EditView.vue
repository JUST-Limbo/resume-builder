<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Download,
  FileJson,
  FileText,
  Focus,
  Info,
  Layers3,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PanelRight,
  Printer,
  RotateCcw,
  Rows3,
  Upload,
  X,
} from 'lucide-vue-next'
import ResumePreview from '../components/ResumePreview.vue'
import ResumeModuleManager from '../components/ResumeModuleManager.vue'
import StylePanel from '../components/StylePanel.vue'
import TemplatePanel from '../components/TemplatePanel.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { useResumeStore } from '../stores/resume'
import {
  legacyResumeDocumentSchema,
  type AutoFitResult,
  type ResumeStyles,
} from '../types/resume'
import {
  canUseLocalExportServer,
  exportResumePdf,
  exportResumePdfViaLocalServer,
  ExportServerUnavailableError,
  openResumePrintDialog,
} from '../utils/exportResumePdf'
import { exportTextFile, toSafeFilename } from '../utils/download'

const MonacoEditor = defineAsyncComponent(() => import('../components/MonacoEditor.vue'))
const MarkdownWysiwygEditor = defineAsyncComponent(
  () => import('../components/MarkdownWysiwygEditor.vue'),
)

const props = defineProps<{ id?: string }>()

const router = useRouter()
const store = useResumeStore()
const localExportAvailable = canUseLocalExportServer()
const hasResumeId = computed(() => typeof props.id === 'string' && props.id.length > 0)
const styleDrawerOpen = ref(true)
const cssEditorOpen = ref(false)
const zenMode = ref(false)
/** 进入禅模式前快照，退出时原样恢复 */
const zenSnapshot = ref<{
  styleDrawerOpen: boolean
  cssEditorOpen: boolean
} | null>(null)

/** 左中右栏宽（px）；中间效果栏吃剩余空间 */
const PANE_STORAGE_KEY = 'resume-builder:workspace-panes'
const PANE_HANDLE_PX = 5
const MIN_SOURCE_PANE = 220
const MIN_EFFECT_PANE = 280
const MIN_STYLE_PANE = 260
const DEFAULT_SOURCE_PANE = 420
const DEFAULT_STYLE_PANE = 340

const workspaceEl = ref<HTMLElement | null>(null)
const sourcePaneWidth = ref(DEFAULT_SOURCE_PANE)
const stylePaneWidth = ref(DEFAULT_STYLE_PANE)
const resizingPane = ref<'source' | 'style' | null>(null)

const workspacePaneStyle = computed(() => ({
  '--pane-source': `${sourcePaneWidth.value}px`,
  '--pane-style': `${stylePaneWidth.value}px`,
}))

const loadPaneWidths = () => {
  try {
    const raw = window.localStorage.getItem(PANE_STORAGE_KEY)
    if (raw === null) return
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return
    const record = parsed as { source?: unknown; style?: unknown }
    if (typeof record.source === 'number' && Number.isFinite(record.source) && record.source >= MIN_SOURCE_PANE) {
      sourcePaneWidth.value = Math.round(record.source)
    }
    if (typeof record.style === 'number' && Number.isFinite(record.style) && record.style >= MIN_STYLE_PANE) {
      stylePaneWidth.value = Math.round(record.style)
    }
  } catch {
    /* 忽略损坏的本地缓存 */
  }
}

const savePaneWidths = () => {
  try {
    window.localStorage.setItem(
      PANE_STORAGE_KEY,
      JSON.stringify({
        source: sourcePaneWidth.value,
        style: stylePaneWidth.value,
      }),
    )
  } catch {
    /* 隐私模式等可能写失败 */
  }
}

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min
  if (value > max) return max
  return value
}

const getWorkspaceWidth = () => {
  const el = workspaceEl.value
  if (el === null) return 0
  return el.getBoundingClientRect().width
}

let resizeStartX = 0
let resizeStartSource = 0
let resizeStartStyle = 0

const onPaneResizeMove = (event: PointerEvent) => {
  const which = resizingPane.value
  if (which === null) return
  const total = getWorkspaceWidth()
  if (total <= 0) return
  const dx = event.clientX - resizeStartX

  if (which === 'source') {
    const styleBudget = styleDrawerOpen.value
      ? stylePaneWidth.value + PANE_HANDLE_PX
      : 0
    const maxSource = total - MIN_EFFECT_PANE - PANE_HANDLE_PX - styleBudget
    sourcePaneWidth.value = clamp(
      Math.round(resizeStartSource + dx),
      MIN_SOURCE_PANE,
      Math.max(MIN_SOURCE_PANE, maxSource),
    )
    return
  }

  const sourceBudget = zenMode.value ? 0 : sourcePaneWidth.value + PANE_HANDLE_PX
  const maxStyle = total - MIN_EFFECT_PANE - PANE_HANDLE_PX - sourceBudget
  /* 分隔条在样式栏左侧：向左拖加大样式栏 */
  stylePaneWidth.value = clamp(
    Math.round(resizeStartStyle - dx),
    MIN_STYLE_PANE,
    Math.max(MIN_STYLE_PANE, maxStyle),
  )
}

const stopPaneResize = () => {
  if (resizingPane.value === null) return
  resizingPane.value = null
  document.body.classList.remove('is-pane-resizing')
  window.removeEventListener('pointermove', onPaneResizeMove)
  window.removeEventListener('pointerup', stopPaneResize)
  window.removeEventListener('pointercancel', stopPaneResize)
  savePaneWidths()
}

const startPaneResize = (which: 'source' | 'style', event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  resizingPane.value = which
  resizeStartX = event.clientX
  resizeStartSource = sourcePaneWidth.value
  resizeStartStyle = stylePaneWidth.value
  document.body.classList.add('is-pane-resizing')
  window.addEventListener('pointermove', onPaneResizeMove)
  window.addEventListener('pointerup', stopPaneResize)
  window.addEventListener('pointercancel', stopPaneResize)
}

const pageCount = ref(1)
const importInput = ref<HTMLInputElement | null>(null)
const preview = ref<InstanceType<typeof ResumePreview> | null>(null)
const autoFitRunning = ref(false)
const exportingPdf = ref(false)
const effectHintOpen = ref(false)
const moduleManagerOpen = ref(false)
const printingPdf = ref(false)

/** 顶栏页数以效果区视觉分页为准；预览引擎仅在自动适应时回写 */
const onPreviewPageCount = (count: number) => {
  if (autoFitRunning.value) pageCount.value = count
}

const notice = ref<{ type: 'success' | 'warning'; text: string } | null>(null)
const ready = ref(false)
let noticeTimer: ReturnType<typeof setTimeout> | null = null

const markdownValue = computed({
  get: () => (store.document !== null ? store.document.markdown : ''),
  set: (value: string) => store.updateMarkdown(value),
})

const cssValue = computed({
  get: () => (store.document !== null ? store.document.customCss : ''),
  set: (value: string) => store.updateCustomCss(value),
})

const safeFilename = computed(() =>
  toSafeFilename(store.document !== null ? store.document.title : 'resume'),
)
const scalePercent = computed(() =>
  store.document !== null ? Math.round(store.document.autoFitScale * 100) : 100,
)
const currentTemplateName = computed(() =>
  store.currentTemplate !== null ? store.currentTemplate.name : null,
)
const canUpdateTemplate = computed(
  () =>
    store.document !== null &&
    store.document.templateId !== null &&
    store.currentTemplate !== null,
)

const showNotice = (type: 'success' | 'warning', text: string) => {
  notice.value = { type, text }
  if (noticeTimer !== null) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = null
    noticeTimer = null
  }, 4200)
}

const applyModuleChanges = (markdown: string) => {
  store.updateMarkdown(markdown)
  showNotice('success', '简历模块已更新。')
}

const updateStyle = (key: keyof ResumeStyles, value: ResumeStyles[keyof ResumeStyles]) => {
  store.updateStyle(key, value)
}

const updateTitleFromEvent = (event: Event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  store.updateTitle(target.value)
}

const openImportDialog = () => {
  if (importInput.value !== null) importInput.value.click()
}

const importBackup = async (event: Event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const files = target.files
  if (files === null || files.length === 0) return
  const file = files[0]

  try {
    const raw = JSON.parse(await file.text())
    const result = legacyResumeDocumentSchema.safeParse(raw)
    if (!result.success) {
      window.alert('备份文件格式不正确或版本不受支持。')
      return
    }
    const confirmed = window.confirm('导入会覆盖浏览器中当前保存的简历，是否继续？')
    if (!confirmed) return
    const current = store.document
    if (current === null) return
    store.replaceDocument({
      ...result.data,
      id: current.id,
      templateId: result.data.templateId ?? null,
    })
    showNotice('success', '备份已导入，内容和样式均已恢复。')
  } catch (error) {
    console.error('导入备份失败', error)
    window.alert('无法读取这个备份文件。')
  } finally {
    target.value = ''
  }
}

const exportBackup = () => {
  if (store.document === null) return
  exportTextFile(
    `${safeFilename.value}.resume.json`,
    JSON.stringify(store.document, null, 2),
    'application/json;charset=utf-8',
  )
}

const exportMarkdown = () => {
  if (store.document === null) return
  exportTextFile(
    `${safeFilename.value}.md`,
    store.document.markdown,
    'text/markdown;charset=utf-8',
  )
}

const fitToOnePage = async () => {
  if (preview.value === null) return
  await preview.value.fitToOnePage()
}

const resetAutoFit = async () => {
  if (preview.value === null) return
  await preview.value.resetAutoFit()
  showNotice('success', '已恢复到 100% 排版尺寸。')
}

const toggleSmartPagination = () => {
  if (store.document === null) return
  const next = !store.document.smartPagination
  store.updateSmartPagination(next)
  showNotice(
    'success',
    next
      ? '已开启智能分页（防标题孤悬等）。'
      : '已关闭智能分页（按高度朴素断页，列表仍可按条续排）。',
  )
}

const exportPdfRaster = async () => {
  if (store.document === null || exportingPdf.value || printingPdf.value) return
  exportingPdf.value = true
  try {
    await exportResumePdf(store.document)
    showNotice('success', '位图 PDF 已开始下载（文字为图片，不可选中）。')
  } catch (error) {
    console.error('导出 PDF 失败', error)
    showNotice('warning', '位图 PDF 导出失败，请稍后重试。')
  } finally {
    exportingPdf.value = false
  }
}

/** 本机 Playwright 服务：同源 HTML → 静默矢量 PDF。 */
const exportPdfVectorLocal = async () => {
  if (store.document === null || exportingPdf.value || printingPdf.value) return
  exportingPdf.value = true
  try {
    await exportResumePdfViaLocalServer(store.document)
    showNotice('success', '矢量 PDF 已开始下载（本机服务）。')
  } catch (error) {
    console.error('本机矢量 PDF 导出失败', error)
    if (error instanceof ExportServerUnavailableError) {
      showNotice(
        'warning',
        '请先启动导出服务（npm run export-server），或改用「PDF（打印另存 · 矢量）」。',
      )
      return
    }
    showNotice('warning', '矢量 PDF 导出失败，请稍后重试或改用打印另存。')
  } finally {
    exportingPdf.value = false
  }
}

/** 主路径：同源渲染 + 浏览器打印引擎（矢量）；无法静默下载矢量 PDF。 */
const exportPdfPrint = async () => {
  if (store.document === null || exportingPdf.value || printingPdf.value) return
  printingPdf.value = true
  try {
    await openResumePrintDialog(store.document)
  } catch (error) {
    console.error('打开打印预览失败', error)
    showNotice('warning', '无法打开打印预览，请稍后重试。')
  } finally {
    printingPdf.value = false
  }
}

const printResume = async () => {
  if (preview.value === null) return
  await preview.value.printResume()
}

const handleAutoFitResult = (result: AutoFitResult) => {
  if (result.status === 'fit') {
    showNotice('success', `已压缩到一页，当前排版比例 ${Math.round(result.scale * 100)}%。`)
    return
  }
  if (result.status === 'already-fit') {
    showNotice('success', '当前内容已经能够完整排在一页。')
    return
  }
  showNotice(
    'warning',
    `已达到最低可读字号，当前仍为 ${result.pageCount} 页，请适当删减内容。`,
  )
}

const resetDocument = () => {
  const confirmed = window.confirm('恢复匿名默认简历会覆盖当前正文和样式，是否继续？')
  if (!confirmed) return
  store.resetDocument()
  showNotice('success', '已恢复匿名默认简历。')
}

const openStyleDrawer = () => {
  styleDrawerOpen.value = true
  cssEditorOpen.value = false
}

/** 效果区 / 禅栏「样式」：打开或关闭右侧样式栏 */
const toggleStyleDrawer = () => {
  if (styleDrawerOpen.value) {
    styleDrawerOpen.value = false
    return
  }
  openStyleDrawer()
}

const openCssEditor = () => {
  styleDrawerOpen.value = true
  cssEditorOpen.value = true
}

const enterZenMode = () => {
  if (zenMode.value) return
  zenSnapshot.value = {
    styleDrawerOpen: styleDrawerOpen.value,
    cssEditorOpen: cssEditorOpen.value,
  }
  styleDrawerOpen.value = false
  cssEditorOpen.value = false
  zenMode.value = true
}

const exitZenMode = () => {
  if (!zenMode.value) return
  zenMode.value = false
  const snap = zenSnapshot.value
  zenSnapshot.value = null
  if (snap !== null) {
    styleDrawerOpen.value = snap.styleDrawerOpen
    cssEditorOpen.value = snap.cssEditorOpen
  }
}

const toggleZenMode = () => {
  if (zenMode.value) exitZenMode()
  else enterZenMode()
}

const applyTemplate = (templateId: string) => {
  const ok = store.applyTemplate(templateId)
  if (ok) showNotice('success', '已套用模板样式（正文未改动）。')
}

const saveStylesToDocumentOnly = () => {
  store.saveStylesToDocumentOnly()
  showNotice('success', '样式已确认仅保留在当前简历，未改动模板库。')
}

const saveStylesAsNewTemplate = async (name: string) => {
  const created = await store.saveStylesAsNewTemplate(name)
  if (created === null) {
    window.alert('无法创建模板，请检查名称。')
    return
  }
  showNotice('success', `已另存为模板「${created.name}」并绑定到当前简历。`)
}

const updateCurrentTemplate = async () => {
  const ok = await store.updateCurrentTemplateFromDocument()
  if (!ok) {
    window.alert('当前未绑定模板，请先选择模板或另存为新模板。')
    return
  }
  const name = store.currentTemplate !== null ? store.currentTemplate.name : '当前模板'
  showNotice('success', `已将样式更新到模板「${name}」。`)
}

const deleteTemplate = async (templateId: string) => {
  const ok = await store.deleteTemplate(templateId)
  if (ok) showNotice('success', '模板已删除。')
}

/**
 * 禅模式快捷键：Ctrl/⌘+Shift+E（避开 Ctrl+Shift+Z 重做）；Escape 仅退出。
 */
const onGlobalKeydown = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'e') {
    event.preventDefault()
    toggleZenMode()
    return
  }
  if (zenMode.value && key === 'escape') {
    event.preventDefault()
    exitZenMode()
  }
}

const loadByRoute = async () => {
  ready.value = false
  if (!store.hydrated) {
    await store.hydrate()
  }
  const resumeId = props.id
  if (typeof resumeId !== 'string' || resumeId.length === 0) {
    store.closeDocument()
    ready.value = true
    return
  }
  const ok = store.openDocument(resumeId)
  if (!ok) {
    window.alert('找不到这份简历，已返回「我的」。')
    void router.replace({ name: 'mine' })
    return
  }
  ready.value = true
}

watch(
  () => props.id,
  () => {
    void loadByRoute()
  },
)

const DEFAULT_DOCUMENT_TITLE = 'Resume Builder'

/** 编辑页 tab 标题：有简历时用「标题 · Resume Builder」，否则还原默认。 */
const syncBrowserDocumentTitle = () => {
  const doc = store.document
  if (doc === null) {
    window.document.title = DEFAULT_DOCUMENT_TITLE
    return
  }
  const trimmed = doc.title.trim()
  if (trimmed.length === 0) {
    window.document.title = DEFAULT_DOCUMENT_TITLE
    return
  }
  window.document.title = `${trimmed} · Resume Builder`
}

watch(
  () => {
    if (store.document === null) return ''
    return store.document.title
  },
  () => {
    syncBrowserDocumentTitle()
  },
  { immediate: true },
)

onMounted(() => {
  loadPaneWidths()
  void loadByRoute()
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  stopPaneResize()
  window.removeEventListener('keydown', onGlobalKeydown)
  store.closeDocument()
  window.document.title = DEFAULT_DOCUMENT_TITLE
})
</script>

<template>
  <div v-if="!hasResumeId" class="edit-empty">
    <FileText :size="28" />
    <h2>尚未打开简历</h2>
    <p>请先到「我的」打开已有简历，或新建一份后再编辑。</p>
    <RouterLink class="edit-empty__link" :to="{ name: 'mine' }">前往我的</RouterLink>
  </div>
  <div v-else-if="!ready || store.document === null" class="edit-loading">
    <LoaderCircle class="spin" :size="18" />
    <span>加载简历…</span>
  </div>
  <div v-else class="app-shell" :class="{ 'app-shell--zen': zenMode }">
    <header v-if="!zenMode" class="topbar">
      <div class="brand">
        <div class="brand-text">
          <input
            class="document-title"
            :value="store.document.title"
            aria-label="简历名称"
            @input="updateTitleFromEvent"
          />
          <p>RESUME BUILDER</p>
        </div>
      </div>

      <div class="topbar-meta">
        <div class="doc-meta">
          <span class="status-dot" />
          <span>{{ pageCount }} 页 · {{ scalePercent }}%</span>
          <button type="button" class="template-chip" title="打开样式与模板" @click="openStyleDrawer">
            模板：{{ currentTemplateName || '未绑定' }}
            <i v-if="store.styleDirty">· 待确认</i>
          </button>
          <button class="text-button" type="button" @click="resetDocument">
            <RotateCcw :size="14" /> 恢复默认简历
          </button>
        </div>
        <div class="save-state" :data-state="store.saveStatus">
          <LoaderCircle v-if="store.saveStatus === 'saving'" :size="15" class="spin" />
          <AlertCircle v-else-if="store.saveStatus === 'error'" :size="15" />
          <Check v-else :size="15" />
          <span v-if="store.saveStatus === 'saving'">正在保存</span>
          <span v-else-if="store.saveStatus === 'error'">保存失败</span>
          <span v-else>已自动保存</span>
          <span v-if="store.styleDirty" class="style-dirty-tag">样式待确认</span>
        </div>
      </div>

      <nav class="toolbar" aria-label="简历操作">
        <input
          ref="importInput"
          class="visually-hidden"
          type="file"
          accept=".json,.resume.json,application/json"
          @change="importBackup"
        />
        <button type="button" title="导入 JSON 备份" @click="openImportDialog">
          <Upload :size="17" />
          <span>导入</span>
        </button>
        <button type="button" title="导出完整 JSON 备份" @click="exportBackup">
          <FileJson :size="17" />
          <span>备份</span>
        </button>
        <button type="button" :disabled="autoFitRunning" @click="fitToOnePage">
          <LoaderCircle v-if="autoFitRunning" :size="17" class="spin" />
          <Maximize2 v-else :size="17" />
          <span>自动一页</span>
        </button>
        <button
          v-if="store.document.autoFitScale < 0.999"
          type="button"
          title="撤销自动压缩"
          @click="resetAutoFit"
        >
          <RotateCcw :size="17" />
          <span>{{ scalePercent }}%</span>
        </button>
        <button
          type="button"
          :class="{ 'is-open': store.document.smartPagination }"
          :aria-pressed="store.document.smartPagination"
          :title="
            store.document.smartPagination
              ? '关闭智能分页：仅按高度断页，列表仍可按条续排'
              : '开启智能分页：防标题孤悬、keep-with-next（效果区与导出共用）'
          "
          @click="toggleSmartPagination"
        >
          <Rows3 :size="17" />
          <span>智能分页</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              :disabled="exportingPdf || printingPdf"
              :title="
                printingPdf
                  ? '正在打开打印…'
                  : exportingPdf
                    ? '正在导出…'
                    : '导出'
              "
            >
              <LoaderCircle v-if="exportingPdf || printingPdf" :size="17" class="spin" />
              <Download v-else :size="17" />
              <span>{{
                printingPdf ? '打印中…' : exportingPdf ? '导出中…' : '导出'
              }}</span>
              <ChevronDown :size="14" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56">
            <DropdownMenuItem :disabled="exportingPdf || printingPdf" @select="exportMarkdown">
              <FileText :size="14" />
              Markdown（.md）
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="localExportAvailable"
              :disabled="exportingPdf || printingPdf"
              @select="exportPdfVectorLocal"
            >
              <Download :size="14" />
              PDF（矢量 · 本机服务）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="exportingPdf || printingPdf" @select="exportPdfPrint">
              <Printer :size="14" />
              PDF（打印另存 · 矢量）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="exportingPdf || printingPdf" @select="exportPdfRaster">
              <Download :size="14" />
              PDF（位图下载）
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem :disabled="exportingPdf || printingPdf" @select="printResume">
              <Printer :size="14" />
              打印…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>

    <div v-else class="zen-bar">
      <div class="zen-bar__meta">
        <Focus :size="15" />
        <span title="禅模式">禅</span>
        <span class="zen-bar__hint">Esc 或 Ctrl/⌘+Shift+E 退出</span>
        <span v-if="store.styleDirty" class="style-dirty-tag">样式待确认</span>
      </div>
      <div class="zen-bar__actions">
        <button
          type="button"
          title="样式与模板"
          :class="{ 'is-open': styleDrawerOpen }"
          :aria-pressed="styleDrawerOpen"
          @click="toggleStyleDrawer"
        >
          <PanelRight :size="15" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              :disabled="exportingPdf || printingPdf"
              :title="
                printingPdf
                  ? '正在打开打印…'
                  : exportingPdf
                    ? '正在导出…'
                    : '导出'
              "
            >
              <LoaderCircle v-if="exportingPdf || printingPdf" :size="15" class="spin" />
              <Download v-else :size="15" />
              <ChevronDown :size="12" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56">
            <DropdownMenuItem :disabled="exportingPdf || printingPdf" @select="exportMarkdown">
              <FileText :size="14" />
              Markdown（.md）
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="localExportAvailable"
              :disabled="exportingPdf || printingPdf"
              @select="exportPdfVectorLocal"
            >
              <Download :size="14" />
              PDF（矢量 · 本机服务）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="exportingPdf || printingPdf" @select="exportPdfPrint">
              <Printer :size="14" />
              PDF（打印另存 · 矢量）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="exportingPdf || printingPdf" @select="exportPdfRaster">
              <Download :size="14" />
              PDF（位图下载）
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem :disabled="exportingPdf || printingPdf" @select="printResume">
              <Printer :size="14" />
              打印…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" class="button-primary" title="退出禅模式" @click="exitZenMode">
          <Minimize2 :size="15" />
          <span>退出</span>
        </button>
      </div>
    </div>

    <main
      ref="workspaceEl"
      class="workspace"
      :class="{
        'workspace--zen': zenMode,
        'workspace--style-open': styleDrawerOpen,
      }"
      :style="workspacePaneStyle"
    >
      <section v-show="!zenMode" class="source-pane">
        <div class="pane-header">
          <span>Markdown 源码</span>
          <span class="pane-header__hint">Ctrl/⌘+1~6 / B / I</span>
        </div>
        <div class="pane-body">
          <Suspense>
            <MonacoEditor v-model="markdownValue" language="markdown" />
            <template #fallback>
              <div class="loading-pane"><LoaderCircle class="spin" /> 加载源码编辑器…</div>
            </template>
          </Suspense>
        </div>
      </section>

      <div
        v-show="!zenMode"
        class="pane-resize"
        :class="{ 'is-active': resizingPane === 'source' }"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整源码与效果栏宽度"
        title="拖动调整宽度"
        @pointerdown="startPaneResize('source', $event)"
      />

      <section class="effect-pane">
        <div v-if="!zenMode" class="pane-header">
          <span>效果编辑</span>
          <div class="pane-header__trailing">
            <div class="pane-header__hint-group">
              <span class="pane-header__hint">快捷键 · 双栏 · 分页</span>
              <button
                type="button"
                class="pane-header__info"
                title="查看全部写法"
                aria-label="查看全部写法"
                @click="effectHintOpen = true"
              >
                <Info :size="13" />
              </button>
            </div>
            <button
              type="button"
              class="pane-header__style"
              title="删除或拖拽调整简历模块顺序"
              @click="moduleManagerOpen = true"
            >
              <Layers3 :size="14" />
              <span>模块管理</span>
            </button>
            <button
              type="button"
              class="pane-header__style"
              :class="{ 'button-attention': store.styleDirty, 'is-open': styleDrawerOpen }"
              title="样式、模板与 Custom CSS"
              :aria-pressed="styleDrawerOpen"
              @click="toggleStyleDrawer"
            >
              <PanelRight :size="14" />
              <span>样式</span>
            </button>
            <button
              type="button"
              class="pane-header__zen"
              title="禅模式（Ctrl/⌘+Shift+E）"
              aria-label="禅模式"
              @click="enterZenMode"
            >
              <Focus :size="14" />
              <span>禅</span>
            </button>
          </div>
        </div>
        <div class="pane-body">
          <Suspense>
            <MarkdownWysiwygEditor
              v-model="markdownValue"
              :styles="store.document.styles"
              :custom-css="store.document.customCss"
              :auto-fit-scale="store.document.autoFitScale"
              :smart-pagination="store.document.smartPagination"
              :compact="zenMode"
              @page-count="pageCount = $event"
            />
            <template #fallback>
              <div class="loading-pane"><LoaderCircle class="spin" /> 加载效果编辑器…</div>
            </template>
          </Suspense>
        </div>
      </section>

      <div
        v-if="styleDrawerOpen"
        class="pane-resize"
        :class="{ 'is-active': resizingPane === 'style' }"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整效果与样式栏宽度"
        title="拖动调整宽度"
        @pointerdown="startPaneResize('style', $event)"
      />

      <aside v-if="styleDrawerOpen" class="style-drawer" aria-label="样式、模板与 Custom CSS">
        <div class="style-drawer__bar">
          <div class="style-drawer__tabs">
            <button
              type="button"
              :class="{ active: !cssEditorOpen }"
              @click="cssEditorOpen = false"
            >
              样式设置
            </button>
            <button type="button" :class="{ active: cssEditorOpen }" @click="openCssEditor">
              Custom CSS
            </button>
          </div>
          <button type="button" class="icon-button" title="关闭" @click="styleDrawerOpen = false">
            <X :size="16" />
          </button>
        </div>
        <div v-if="!cssEditorOpen" class="style-drawer__panel">
          <TemplatePanel
            :templates="store.templates"
            :current-template-id="store.document.templateId"
            :current-template-name="currentTemplateName"
            :style-dirty="store.styleDirty"
            :can-update-template="canUpdateTemplate"
            @apply="applyTemplate"
            @save-document-only="saveStylesToDocumentOnly"
            @save-as-new="saveStylesAsNewTemplate"
            @update-template="updateCurrentTemplate"
            @delete="deleteTemplate"
          />
          <StylePanel
            :styles="store.document.styles"
            @update="updateStyle"
            @reset="store.resetStyles"
          />
        </div>
        <div v-else class="style-drawer__css">
          <p class="css-tip">
            作用于同一份成稿文档，并计入样式模板。例如：<code>h2 { letter-spacing: .08em; }</code>
          </p>
          <Suspense>
            <MonacoEditor v-model="cssValue" language="css" />
            <template #fallback>
              <div class="loading-pane"><LoaderCircle class="spin" /> 加载 CSS 编辑器…</div>
            </template>
          </Suspense>
          <div class="style-drawer__css-actions">
            <p v-if="store.styleDirty" class="dirty-inline">
              Custom CSS 已改，请在「样式设置」中确认三种保存之一。
            </p>
            <button type="button" @click="cssEditorOpen = false">返回样式 / 模板</button>
          </div>
        </div>
      </aside>
    </main>

    <div class="print-engine" aria-hidden="true">
      <ResumePreview
        ref="preview"
        :document="store.document"
        @page-count="onPreviewPageCount"
        @scale-change="store.updateAutoFitScale"
        @auto-fit-running="autoFitRunning = $event"
        @auto-fit-result="handleAutoFitResult"
      />
    </div>

    <Transition name="notice">
      <div v-if="notice !== null" class="notice" :class="`notice--${notice.type}`">
        <Check v-if="notice.type === 'success'" :size="17" />
        <AlertCircle v-else :size="17" />
        {{ notice.text }}
      </div>
    </Transition>

    <ResumeModuleManager
      v-model:open="moduleManagerOpen"
      :markdown="store.document.markdown"
      @apply="applyModuleChanges"
    />

    <Dialog :open="effectHintOpen" @update:open="effectHintOpen = $event">
      <DialogContent class="effect-hint-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>效果区写法说明</DialogTitle>
          <DialogDescription>
            与左侧 Markdown 源码共用同一份内容；下列约定在效果区与预览中同样生效。
          </DialogDescription>
        </DialogHeader>
        <div class="effect-hint-body">
          <section>
            <h3>快捷键</h3>
            <ul>
              <li><code>Ctrl/⌘ + 1~6</code>：切换标题级别 H1–H6</li>
              <li><code>Ctrl/⌘ + B</code>：加粗（<code>**文字**</code>）</li>
              <li><code>Ctrl/⌘ + I</code>：斜体（<code>*文字*</code>）</li>
            </ul>
          </section>
          <section>
            <h3>双栏布局</h3>
            <ul>
              <li>
                同一行用 <code>||</code> 分隔左右，例如
                <code>### 公司 · 职位 || 2022.06 - 至今</code>
              </li>
              <li>效果区渲染为左主体、右日期；点击该行可改 Markdown 源码</li>
              <li>编辑时按 <code>Esc</code> 或 <code>Ctrl/⌘ + Enter</code> 结束</li>
            </ul>
          </section>
          <section>
            <h3>手动分页</h3>
            <ul>
              <li>独占一行写 <code>\newpage</code>，后续内容从下一页开始</li>
              <li>效果区显示为「分页」标记（可拖动选择）</li>
            </ul>
          </section>
          <section>
            <h3>特殊块可点改</h3>
            <ul>
              <li>双栏行、表格等难行内编辑的内容会整块保留源码</li>
              <li>成稿只读展示；点击徽章/块进入源码编辑，同样用 <code>Esc</code> /
                <code>Ctrl/⌘ + Enter</code> 退出</li>
            </ul>
          </section>
          <section>
            <h3>其他约定</h3>
            <ul>
              <li>输入 <code>#</code> 再空格可设标题（与 Typora 类似）</li>
              <li>原始 HTML 默认禁用；高级样式请在 Custom CSS 中填写</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.edit-loading,
.edit-empty {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #747d82;
  font-size: 13px;
  background: #f1f3f4;
}

.edit-empty {
  flex-direction: column;
  gap: 10px;
  text-align: center;
  padding: 24px;
}

.edit-empty h2 {
  margin: 4px 0 0;
  color: #202428;
  font-size: 18px;
  font-weight: 700;
}

.edit-empty p {
  margin: 0;
  max-width: 28em;
  line-height: 1.5;
}

.edit-empty__link {
  display: inline-flex;
  margin-top: 6px;
  padding: 8px 14px;
  color: #111;
  text-decoration: none;
  background: #fff;
  border: 1px solid #e2e5e6;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 650;
}

.edit-empty__link:hover {
  background: #f7f8f8;
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
</style>
