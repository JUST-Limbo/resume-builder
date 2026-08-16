<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LayoutTemplate, LoaderCircle } from 'lucide-vue-next'
import TemplateThumbnail from '../components/TemplateThumbnail.vue'
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
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useResumeStore } from '../stores/resume'

const store = useResumeStore()
const router = useRouter()

const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const noticeText = ref('')
const creatingId = ref<string | null>(null)

type PendingConfirm = { id: string; name: string; builtIn: boolean } | null
const pendingConfirm = ref<PendingConfirm>(null)
const confirmOpen = ref(false)
const restoringBuiltins = ref(false)

const createFromTemplate = async (templateId: string, templateName: string) => {
  if (creatingId.value !== null) return
  creatingId.value = templateId
  try {
    const doc = await store.createDocument({
      title: templateName,
      templateId,
    })
    await router.push({ name: 'edit', params: { id: doc.id } })
  } catch (error) {
    console.error('基于模板创建简历失败', error)
    showNotice('创建失败，请重试。')
  } finally {
    creatingId.value = null
  }
}

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

const showNotice = (text: string) => {
  noticeText.value = text
  window.setTimeout(() => {
    if (noticeText.value === text) noticeText.value = ''
  }, 3200)
}

const startRename = (id: string, name: string) => {
  renamingId.value = id
  renameDraft.value = name
}

const cancelRename = () => {
  renamingId.value = null
  renameDraft.value = ''
}

const commitRename = async (id: string) => {
  const ok = await store.renameTemplate(id, renameDraft.value)
  if (!ok) {
    showNotice('重命名失败，请检查名称。')
    return
  }
  cancelRename()
}

const askRemoveTemplate = (id: string, name: string, builtIn: boolean) => {
  pendingConfirm.value = { id, name, builtIn }
  confirmOpen.value = true
}

/**
 * 与 MineView 相同：AlertDialogAction(=DialogClose) 会先关窗；
 * open 与 pending 拆开，避免关窗清空目标导致删除不执行。
 */
const onConfirmOpenChange = (open: boolean) => {
  confirmOpen.value = open
  if (!open) {
    queueMicrotask(() => {
      if (!confirmOpen.value) pendingConfirm.value = null
    })
  }
}

const confirmDescription = computed(() => {
  const pending = pendingConfirm.value
  if (pending === null) return ''
  if (pending.builtIn) {
    return `确定删除内置模板「${pending.name}」？删除后不会自动恢复，可在页面底部「恢复默认模板」找回。`
  }
  return `确定删除模板「${pending.name}」？此操作不可恢复。`
})

const runConfirm = async () => {
  const pending = pendingConfirm.value
  if (pending === null) return
  confirmOpen.value = false
  pendingConfirm.value = null
  const ok = await store.deleteTemplate(pending.id)
  if (!ok) {
    showNotice('删除失败，请重试。')
    return
  }
  showNotice(`已删除模板「${pending.name}」。`)
}

const restoreBuiltins = async () => {
  if (restoringBuiltins.value) return
  restoringBuiltins.value = true
  try {
    const ok = await store.restoreRemovedBuiltins()
    if (!ok) {
      showNotice('当前没有已删除的内置模板。')
      return
    }
    showNotice('已恢复默认内置模板。')
  } finally {
    restoringBuiltins.value = false
  }
}

onMounted(async () => {
  if (!store.hydrated) await store.hydrate()
})
</script>

<template>
  <div class="page-shell">
    <header class="page-header">
      <div>
        <div class="page-header__title">
          <h1>简历模板</h1>
          <p class="eyebrow">TEMPLATES</p>
        </div>
        <p class="page-lead">
          卡片底部可基于该模板新建简历，或删除模板（内置 / 自定义均可）；自定义模板还可重命名。
          与「我的」页新增表单互不联动。
        </p>
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

    <section v-else class="page-card" aria-labelledby="section-templates">
      <div class="page-card__head">
        <LayoutTemplate :size="18" />
        <div class="page-card__title">
          <h2 id="section-templates">模板库</h2>
          <p class="eyebrow">LIBRARY</p>
        </div>
      </div>

      <ul class="preview-grid">
        <li v-for="tpl in store.templates" :key="tpl.id">
          <div class="preview-card">
            <div class="preview-card__media">
              <TemplateThumbnail :template="tpl" />
              <Badge
                v-if="!tpl.builtIn"
                class="preview-card__badge"
                variant="secondary"
              >
                自定义
              </Badge>
              <div class="preview-card__overlay">
                <Button
                  type="button"
                  size="sm"
                  class="preview-card__create"
                  :disabled="creatingId !== null"
                  @click.stop="createFromTemplate(tpl.id, tpl.name)"
                >
                  <LoaderCircle
                    v-if="creatingId === tpl.id"
                    :size="14"
                    class="spin"
                  />
                  {{ creatingId === tpl.id ? '创建中…' : '新建简历' }}
                </Button>
              </div>
            </div>

            <div class="preview-card__meta">
              <div class="preview-card__info">
                <div v-if="renamingId === tpl.id" class="rename-row">
                  <Input
                    v-model="renameDraft"
                    type="text"
                    maxlength="80"
                    class="h-7"
                    @keydown.enter.prevent="commitRename(tpl.id)"
                    @keydown.escape.prevent="cancelRename"
                    @click.stop
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    @click.stop="commitRename(tpl.id)"
                  >
                    保存
                  </Button>
                  <Button type="button" size="sm" variant="ghost" @click.stop="cancelRename">
                    取消
                  </Button>
                </div>
                <template v-else>
                  <strong>{{ tpl.name }}</strong>
                  <span>{{ formatUpdatedAt(tpl.updatedAt) }}</span>
                  <Button
                    v-if="!tpl.builtIn"
                    type="button"
                    size="sm"
                    variant="ghost"
                    class="preview-card__rename"
                    @click.stop="startRename(tpl.id, tpl.name)"
                  >
                    重命名
                  </Button>
                </template>
              </div>
              <div class="preview-card__actions">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  class="preview-card__action-btn"
                  :disabled="creatingId !== null"
                  @click.stop="createFromTemplate(tpl.id, tpl.name)"
                >
                  <LoaderCircle
                    v-if="creatingId === tpl.id"
                    :size="14"
                    class="spin"
                  />
                  {{ creatingId === tpl.id ? '创建中…' : '新建简历' }}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  class="preview-card__action-btn preview-card__action-btn--danger"
                  @click.stop="askRemoveTemplate(tpl.id, tpl.name, tpl.builtIn)"
                >
                  删除模板
                </Button>
              </div>
            </div>
          </div>
        </li>
      </ul>

      <div v-if="store.removedBuiltinIds.length > 0" class="restore-row">
        <p>已删除 {{ store.removedBuiltinIds.length }} 个内置模板。</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          :disabled="restoringBuiltins"
          @click="restoreBuiltins"
        >
          <LoaderCircle v-if="restoringBuiltins" :size="14" class="spin" />
          {{ restoringBuiltins ? '恢复中…' : '恢复默认模板' }}
        </Button>
      </div>
    </section>

    <AlertDialog :open="confirmOpen" @update:open="onConfirmOpenChange">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除模板</AlertDialogTitle>
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
  max-width: 52em;
  line-height: 1.5;
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

.page-card {
  max-width: 1080px;
  margin: 0 auto;
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
  margin-bottom: 14px;
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

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.preview-card {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e2e5e6;
  border-radius: 10px;
}

.preview-card__media {
  position: relative;
}

.preview-card__badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}

.preview-card__overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(18, 22, 26, 0.42);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.preview-card:hover .preview-card__overlay,
.preview-card:focus-within .preview-card__overlay {
  opacity: 1;
  pointer-events: auto;
  cursor: pointer;
}

.preview-card__create {
  gap: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}

.preview-card__meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 11px 12px;
  border-top: 1px solid #eef0f1;
}

.preview-card__info {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
  align-content: start;
}

.preview-card__info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.preview-card__info span {
  color: #7b8388;
  font-size: 11px;
}

.preview-card__rename {
  justify-self: start;
  height: auto;
  margin-top: 2px;
  padding: 0;
  color: #5b6570;
  font-size: 11px;
  font-weight: 500;
}

.preview-card__actions {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 6px;
  width: 5.75rem;
}

.preview-card__action-btn {
  width: 100%;
  justify-content: center;
  gap: 4px;
  padding-inline: 6px;
  font-size: 12px;
}

.preview-card__action-btn--danger {
  border-color: #f0d0d0;
  background: #fff8f8;
  color: #b42318;
}

.preview-card__action-btn--danger:hover {
  background: #fff1f1;
  color: #912018;
}

.rename-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 4px;
  width: 100%;
}

.restore-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #eef0f1;
}

.restore-row p {
  margin: 0;
  color: #7b8388;
  font-size: 12px;
}

@media (max-width: 820px) {
  .page-header {
    flex-direction: column;
  }
}
</style>
