<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronDown,
  Download,
  FilePlus2,
  FileText,
  LoaderCircle,
  Pencil,
  Printer,
  Trash2,
} from 'lucide-vue-next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'
import { Button } from '../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { useResumeStore } from '../stores/resume'
import type { ResumeDocumentV1 } from '../types/resume'
import { exportTextFile, toSafeFilename } from '../utils/download'
import { exportResumePdf, exportResumePdfViaLocalServer, ExportServerUnavailableError, openResumePrintDialog } from '../utils/exportResumePdf'

/** Reka Select 不允许空字符串 value */
const TEMPLATE_NONE = '__none__'

const router = useRouter()
const store = useResumeStore()

const newTitle = ref('')
/** 仅用于「新增简历」，与模板库浏览互不联动 */
const selectedTemplateId = ref('')
const creating = ref(false)
const noticeText = ref('')
const exportingId = ref<string | null>(null)

type PendingConfirm = { id: string; title: string } | null
const pendingConfirm = ref<PendingConfirm>(null)

const templateSelectValue = computed({
  get: () =>
    selectedTemplateId.value.length > 0 ? selectedTemplateId.value : TEMPLATE_NONE,
  set: (value: string) => {
    selectedTemplateId.value = value === TEMPLATE_NONE ? '' : value
  },
})

const formatUpdatedAt = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const templateName = (templateId: string | null) => {
  if (templateId === null) return '未绑定'
  const found = store.templates.find((item) => item.id === templateId)
  return found !== undefined ? found.name : '未知模板'
}

const openResume = (id: string) => {
  void router.push({ name: 'edit', params: { id } })
}

const onTemplateSelect = (value: unknown) => {
  if (typeof value !== 'string') return
  templateSelectValue.value = value
}

const showNotice = (text: string) => {
  noticeText.value = text
  window.setTimeout(() => {
    if (noticeText.value === text) noticeText.value = ''
  }, 3200)
}

const createResume = async () => {
  if (creating.value) return
  creating.value = true
  try {
    const templateId =
      selectedTemplateId.value.length > 0 ? selectedTemplateId.value : null
    const doc = await store.createDocument({
      title: newTitle.value,
      templateId,
    })
    newTitle.value = ''
    await router.push({ name: 'edit', params: { id: doc.id } })
  } catch (error) {
    console.error('创建简历失败', error)
    showNotice('创建失败，请重试。')
  } finally {
    creating.value = false
  }
}

const confirmOpen = ref(false)

const confirmDescription = computed(() => {
  const pending = pendingConfirm.value
  if (pending === null) return ''
  return `确定删除简历「${pending.title}」？此操作不可恢复。`
})

/**
 * AlertDialogAction 本质是 DialogClose：会先同步把 open 置 false。
 * 若用「pending !== null」兼作 open，关窗会先清空 pending，随后的 @click 读到 null 导致删除不执行。
 * 因此 open 与 pending 必须拆开；关窗用微任务延后清 pending，保证同一次点击里 Action 仍能读到目标。
 */
const onConfirmOpenChange = (open: boolean) => {
  confirmOpen.value = open
  if (!open) {
    queueMicrotask(() => {
      if (!confirmOpen.value) pendingConfirm.value = null
    })
  }
}

const askRemoveResume = (id: string, title: string, event: Event) => {
  event.stopPropagation()
  event.preventDefault()
  pendingConfirm.value = { id, title }
  confirmOpen.value = true
}

const exportMarkdown = (item: ResumeDocumentV1, event?: Event) => {
  if (event !== undefined) {
    event.stopPropagation()
    event.preventDefault()
  }
  exportTextFile(
    `${toSafeFilename(item.title)}.md`,
    item.markdown,
    'text/markdown;charset=utf-8',
  )
  showNotice(`已导出「${item.title}」的 Markdown。`)
}

const exportPdfPrint = async (item: ResumeDocumentV1, event?: Event) => {
  if (event !== undefined) {
    event.stopPropagation()
    event.preventDefault()
  }
  if (exportingId.value !== null) return
  exportingId.value = item.id
  try {
    await openResumePrintDialog(item)
  } catch (error) {
    console.error('打开打印预览失败', error)
    showNotice('无法打开打印预览，请稍后重试。')
  } finally {
    exportingId.value = null
  }
}

const exportPdfVectorLocal = async (item: ResumeDocumentV1, event?: Event) => {
  if (event !== undefined) {
    event.stopPropagation()
    event.preventDefault()
  }
  if (exportingId.value !== null) return
  exportingId.value = item.id
  try {
    await exportResumePdfViaLocalServer(item)
    showNotice(`已导出「${item.title}」的矢量 PDF（本机服务）。`)
  } catch (error) {
    console.error('本机矢量 PDF 导出失败', error)
    if (error instanceof ExportServerUnavailableError) {
      showNotice('请先启动导出服务（npm run export-server），或改用打印另存。')
      return
    }
    showNotice('矢量 PDF 导出失败，请稍后重试。')
  } finally {
    exportingId.value = null
  }
}

const exportPdfRaster = async (item: ResumeDocumentV1, event?: Event) => {
  if (event !== undefined) {
    event.stopPropagation()
    event.preventDefault()
  }
  if (exportingId.value !== null) return
  exportingId.value = item.id
  try {
    await exportResumePdf(item)
    showNotice(`已导出「${item.title}」的位图 PDF。`)
  } catch (error) {
    console.error('导出 PDF 失败', error)
    showNotice('位图 PDF 导出失败，请稍后重试。')
  } finally {
    exportingId.value = null
  }
}

const runConfirm = async () => {
  const pending = pendingConfirm.value
  if (pending === null) return
  confirmOpen.value = false
  pendingConfirm.value = null
  await store.deleteDocument(pending.id)
}

onMounted(async () => {
  if (!store.hydrated) await store.hydrate()
  if (selectedTemplateId.value.length === 0 && store.templates.length > 0) {
    selectedTemplateId.value = store.templates[0].id
  }
})
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <div class="page-header__title">
          <h1>我的</h1>
          <p class="eyebrow">MY RESUMES</p>
        </div>
        <p class="page-lead">管理本地简历；点击进入编辑。数据保存在本机 IndexedDB。</p>
      </div>
      <div class="page-save" :data-state="store.saveStatus">
        <LoaderCircle v-if="store.saveStatus === 'saving'" :size="14" class="spin" />
        <span v-if="store.saveStatus === 'saving'">保存中</span>
        <span v-else-if="store.saveStatus === 'error'">保存异常</span>
        <span v-else>本地已就绪</span>
      </div>
    </header>

    <p v-if="noticeText.length > 0" class="page-notice" role="status">{{ noticeText }}</p>

    <div v-if="!store.hydrated" class="page-loading">
      <LoaderCircle class="spin" :size="18" />
      <span>读取本地数据…</span>
    </div>

    <div v-else class="page-grid">
      <section class="page-card" aria-labelledby="section-list">
        <div class="page-card__head">
          <FileText :size="18" />
          <div class="page-card__title">
            <h2 id="section-list">我的简历</h2>
            <p class="eyebrow">LIST</p>
          </div>
        </div>
        <p class="page-card__desc">点击一行进入编辑；右侧导出 / 删除独立操作，避免误触。</p>

        <ul v-if="store.documentList.length > 0" class="resume-list">
          <li v-for="item in store.documentList" :key="item.id" class="resume-row">
            <button
              type="button"
              class="resume-row__main"
              :title="`打开「${item.title}」`"
              @click="openResume(item.id)"
            >
              <span class="resume-row__title">{{ item.title }}</span>
              <span class="resume-row__meta">
                {{ formatUpdatedAt(item.updatedAt) }} · 模板 {{ templateName(item.templateId) }}
              </span>
            </button>
            <div class="resume-row__actions" @click.stop>
              <Button type="button" size="sm" variant="ghost" @click="openResume(item.id)">
                <Pencil :size="14" />
                编辑
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="exportingId === item.id"
                    :title="exportingId === item.id ? '正在导出…' : '导出'"
                  >
                    <LoaderCircle v-if="exportingId === item.id" :size="14" class="spin" />
                    <Download v-else :size="14" />
                    导出
                    <ChevronDown :size="12" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-56" @click.stop>
                  <DropdownMenuItem
                    :disabled="exportingId !== null"
                    @select="exportMarkdown(item)"
                  >
                    <FileText :size="14" />
                    Markdown（.md）
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    :disabled="exportingId !== null"
                    @select="() => exportPdfVectorLocal(item)"
                  >
                    <Download :size="14" />
                    PDF（矢量 · 本机服务）
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    :disabled="exportingId !== null"
                    @select="() => exportPdfPrint(item)"
                  >
                    <Printer :size="14" />
                    PDF（打印另存 · 矢量）
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    :disabled="exportingId !== null"
                    @select="() => exportPdfRaster(item)"
                  >
                    <Download :size="14" />
                    PDF（位图下载）
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                title="删除"
                @click="askRemoveResume(item.id, item.title, $event)"
              >
                <Trash2 :size="14" />
              </Button>
            </div>
          </li>
        </ul>
        <p v-else class="empty-hint">还没有简历，可在右侧「新增简历」创建第一份。</p>
      </section>

      <section class="page-card" aria-labelledby="section-create">
        <div class="page-card__head">
          <FilePlus2 :size="18" />
          <div class="page-card__title">
            <h2 id="section-create">新增简历</h2>
            <p class="eyebrow">CREATE</p>
          </div>
        </div>
        <p class="page-card__desc">填写名称并选择模板样式，然后创建进入编辑。</p>

        <div class="field">
          <Label for="new-resume-title">简历名称</Label>
          <Input
            id="new-resume-title"
            v-model="newTitle"
            type="text"
            maxlength="100"
            placeholder="例如：张三-前端开发"
            class="h-9"
            @keydown.enter.prevent="createResume"
          />
        </div>

        <div class="field">
          <Label>基于模板（可选）</Label>
          <Select :model-value="templateSelectValue" @update:model-value="onTemplateSelect">
            <SelectTrigger class="h-9 w-full">
              <SelectValue placeholder="选择模板" />
            </SelectTrigger>
            <SelectContent position="popper" class="z-50 w-[var(--reka-select-trigger-width)]">
              <SelectItem :value="TEMPLATE_NONE">不绑定模板（默认样式）</SelectItem>
              <SelectItem v-for="tpl in store.templates" :key="tpl.id" :value="tpl.id">
                {{ tpl.name }}{{ tpl.builtIn ? '（内置）' : '' }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          class="create-btn"
          size="lg"
          :disabled="creating"
          @click="createResume"
        >
          <LoaderCircle v-if="creating" :size="16" class="spin" />
          <FilePlus2 v-else :size="16" />
          {{ creating ? '创建中…' : '创建并进入编辑' }}
        </Button>
      </section>
    </div>

    <AlertDialog :open="confirmOpen" @update:open="onConfirmOpenChange">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除简历</AlertDialogTitle>
          <AlertDialogDescription>{{ confirmDescription }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="runConfirm">删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style scoped>
.page-shell {
  height: 100%;
  overflow: auto;
  padding: 28px 24px 48px;
  background: #f1f3f4;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  max-width: 1080px;
  margin: 0 auto 22px;
}

.page-header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.page-header__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 6px;
}

.page-lead {
  margin: 0;
  color: #7b8388;
  font-size: 13px;
}

.eyebrow {
  margin: 0;
  color: #8b9296;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.17em;
}

.page-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  color: #778086;
  background: #fff;
  border: 1px solid #e2e5e6;
  border-radius: 8px;
  font-size: 11px;
  white-space: nowrap;
}

.page-save[data-state='error'] {
  color: #b42318;
}

.page-notice {
  max-width: 1080px;
  margin: -8px auto 14px;
  padding: 8px 12px;
  color: #7a3e3e;
  background: #fff5f5;
  border: 1px solid #f0d0d0;
  border-radius: 8px;
  font-size: 12px;
}

.page-loading {
  display: flex;
  max-width: 1080px;
  margin: 40px auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #747d82;
  font-size: 13px;
}

.page-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 16px;
  max-width: 1080px;
  margin: 0 auto;
}

.page-card {
  padding: 18px;
  background: #fff;
  border: 1px solid #e2e5e6;
  border-radius: 12px;
  box-shadow: 0 1px 8px rgba(25, 30, 33, 0.03);
}

.page-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  color: #202428;
}

.page-card__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.page-card__head h2 {
  margin: 0;
  font-size: 16px;
}

.page-card__desc {
  margin: 0 0 14px;
  color: #7b8388;
  font-size: 12px;
  line-height: 1.5;
}

.field {
  display: grid;
  gap: 7px;
  margin-bottom: 12px;
}

.create-btn {
  width: 100%;
  height: 38px;
  font-size: 13px;
  font-weight: 650;
}

.empty-hint {
  margin: 8px 0 0;
  color: #7b8388;
  font-size: 12px;
}

.resume-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.resume-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 4px 4px 4px 12px;
  background: #fafbfb;
  border: 1px solid #e2e5e6;
  border-radius: 10px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.resume-row:hover {
  background: #fff;
  border-color: #cfd4d7;
}

.resume-row__main {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 8px 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.resume-row__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #202428;
  font-size: 13px;
  font-weight: 650;
}

.resume-row__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #7b8388;
  font-size: 11px;
}

.resume-row__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 4px;
}

@media (max-width: 820px) {
  .page-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
  }
}
</style>
