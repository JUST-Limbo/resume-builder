<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import {
  AlertCircle,
  Check,
  Code2,
  FileJson,
  FileText,
  LoaderCircle,
  Maximize2,
  PanelRight,
  Printer,
  RotateCcw,
  Upload,
} from 'lucide-vue-next'
import ResumePreview from './components/ResumePreview.vue'
import StylePanel from './components/StylePanel.vue'
import { useResumeStore } from './stores/resume'
import {
  resumeDocumentSchema,
  type AutoFitResult,
  type EditorMode,
  type ResumeStyles,
} from './types/resume'
import { exportTextFile, toSafeFilename } from './utils/download'

const MonacoEditor = defineAsyncComponent(() => import('./components/MonacoEditor.vue'))
const store = useResumeStore()
const editorMode = ref<EditorMode>('markdown')
const mobilePane = ref<'editor' | 'preview' | 'styles'>('editor')
const stylePanelVisible = ref(true)
const pageCount = ref(1)
const importInput = ref<HTMLInputElement | null>(null)
const preview = ref<InstanceType<typeof ResumePreview> | null>(null)
const autoFitRunning = ref(false)
const notice = ref<{ type: 'success' | 'warning'; text: string } | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | null = null

const editorValue = computed({
  get: () => (editorMode.value === 'markdown' ? store.document.markdown : store.document.customCss),
  set: (value: string) => {
    if (editorMode.value === 'markdown') store.updateMarkdown(value)
    else store.updateCustomCss(value)
  },
})

const editorLanguage = computed(() => (editorMode.value === 'markdown' ? 'markdown' : 'css'))
const safeFilename = computed(() => toSafeFilename(store.document.title))
const scalePercent = computed(() => Math.round(store.document.autoFitScale * 100))

const showNotice = (type: 'success' | 'warning', text: string) => {
  notice.value = { type, text }
  if (noticeTimer !== null) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = null
    noticeTimer = null
  }, 4200)
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
    const result = resumeDocumentSchema.safeParse(raw)
    if (!result.success) {
      window.alert('备份文件格式不正确或版本不受支持。')
      return
    }
    const confirmed = window.confirm('导入会覆盖浏览器中当前保存的简历，是否继续？')
    if (!confirmed) return
    store.replaceDocument(result.data)
    showNotice('success', '备份已导入，内容和样式均已恢复。')
  } catch (error) {
    console.error('导入备份失败', error)
    window.alert('无法读取这个备份文件。')
  } finally {
    target.value = ''
  }
}

const exportBackup = () => {
  exportTextFile(
    `${safeFilename.value}.resume.json`,
    JSON.stringify(store.document, null, 2),
    'application/json;charset=utf-8',
  )
}

const exportMarkdown = () => {
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
  const confirmed = window.confirm('恢复匿名默认模板会覆盖当前内容和样式，是否继续？')
  if (!confirmed) return
  store.resetDocument()
  showNotice('success', '已恢复匿名默认模板。')
}

onMounted(() => {
  void store.hydrate()
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">R</div>
        <div>
          <p>RESUME BUILDER</p>
          <input
            class="document-title"
            :value="store.document.title"
            aria-label="简历名称"
            @input="updateTitleFromEvent"
          />
        </div>
      </div>

      <div class="save-state" :data-state="store.saveStatus">
        <LoaderCircle v-if="store.saveStatus === 'saving'" :size="15" class="spin" />
        <AlertCircle v-else-if="store.saveStatus === 'error'" :size="15" />
        <Check v-else :size="15" />
        <span v-if="store.saveStatus === 'saving'">正在保存</span>
        <span v-else-if="store.saveStatus === 'error'">保存失败</span>
        <span v-else>已保存到本机</span>
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
        <button type="button" title="导出 Markdown" @click="exportMarkdown">
          <FileText :size="17" />
          <span>Markdown</span>
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
        <button class="button-primary" type="button" @click="printResume">
          <Printer :size="17" />
          <span>导出 PDF</span>
        </button>
        <button
          type="button"
          title="显示或隐藏样式面板"
          @click="stylePanelVisible = !stylePanelVisible"
        >
          <PanelRight :size="17" />
        </button>
      </nav>
    </header>

    <div class="mobile-tabs" role="tablist" aria-label="移动端视图切换">
      <button :class="{ active: mobilePane === 'editor' }" @click="mobilePane = 'editor'">编辑</button>
      <button :class="{ active: mobilePane === 'preview' }" @click="mobilePane = 'preview'">预览</button>
      <button :class="{ active: mobilePane === 'styles' }" @click="mobilePane = 'styles'">样式</button>
    </div>

    <main class="workspace" :class="{ 'workspace--styles-hidden': !stylePanelVisible }">
      <section class="editor-pane" :class="{ 'mobile-hidden': mobilePane !== 'editor' }">
        <div class="pane-header">
          <div class="editor-tabs">
            <button
              :class="{ active: editorMode === 'markdown' }"
              type="button"
              @click="editorMode = 'markdown'"
            >
              <FileText :size="15" /> Markdown
            </button>
            <button
              :class="{ active: editorMode === 'css' }"
              type="button"
              @click="editorMode = 'css'"
            >
              <Code2 :size="15" /> Custom CSS
            </button>
          </div>
          <button class="text-button" type="button" @click="resetDocument">
            <RotateCcw :size="14" /> 恢复模板
          </button>
        </div>
        <div v-if="editorMode === 'css'" class="css-tip">
          高级样式仅作用于简历区域。例如：<code>h2 { letter-spacing: .08em; }</code>
        </div>
        <div class="editor-body">
          <Suspense>
            <MonacoEditor
              :key="editorMode"
              v-model="editorValue"
              :language="editorLanguage"
            />
            <template #fallback>
              <div class="loading-pane"><LoaderCircle class="spin" /> 正在加载编辑器…</div>
            </template>
          </Suspense>
        </div>
      </section>

      <section class="preview-pane" :class="{ 'mobile-hidden': mobilePane !== 'preview' }">
        <div class="pane-header preview-header">
          <div><span class="status-dot" />A4 实时预览</div>
          <span>{{ pageCount }} 页 · {{ scalePercent }}%</span>
        </div>
        <div class="preview-body">
          <ResumePreview
            ref="preview"
            :document="store.document"
            @page-count="pageCount = $event"
            @scale-change="store.updateAutoFitScale"
            @auto-fit-running="autoFitRunning = $event"
            @auto-fit-result="handleAutoFitResult"
          />
        </div>
      </section>

      <StylePanel
        v-if="stylePanelVisible"
        class="styles-pane"
        :class="{ 'mobile-hidden': mobilePane !== 'styles' }"
        :styles="store.document.styles"
        @update="updateStyle"
        @reset="store.resetStyles"
      />
    </main>

    <Transition name="notice">
      <div v-if="notice !== null" class="notice" :class="`notice--${notice.type}`">
        <Check v-if="notice.type === 'success'" :size="17" />
        <AlertCircle v-else :size="17" />
        {{ notice.text }}
      </div>
    </Transition>
  </div>
</template>
