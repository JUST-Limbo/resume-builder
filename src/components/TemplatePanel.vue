<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, LayoutTemplate, Save, SaveAll } from 'lucide-vue-next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import type { ResumeTemplate } from '../types/resume'

const props = defineProps<{
  templates: ResumeTemplate[]
  currentTemplateId: string | null
  currentTemplateName: string | null
  styleDirty: boolean
  canUpdateTemplate: boolean
}>()

const emit = defineEmits<{
  apply: [templateId: string]
  saveDocumentOnly: []
  saveAsNew: [name: string]
  updateTemplate: []
  delete: [templateId: string]
}>()

const newTemplateName = ref('')
const showSaveAsForm = ref(false)
const confirmDeleteOpen = ref(false)
const noticeText = ref('')

const boundLabel = computed(() => {
  if (props.currentTemplateName !== null) return props.currentTemplateName
  return '未绑定模板'
})

const selectValue = computed(() =>
  props.currentTemplateId !== null ? props.currentTemplateId : undefined,
)

const showNotice = (text: string) => {
  noticeText.value = text
  window.setTimeout(() => {
    if (noticeText.value === text) noticeText.value = ''
  }, 2800)
}

/** 下拉切换即套用样式到当前简历（不等三种保存确认；同 id 且未脏则跳过） */
const onSelectTemplate = (value: unknown) => {
  if (typeof value !== 'string' || value.length === 0) return
  if (value === props.currentTemplateId && !props.styleDirty) return
  emit('apply', value)
}

const submitSaveAs = () => {
  const name = newTemplateName.value.trim()
  if (name.length === 0) {
    showNotice('请输入模板名称。')
    return
  }
  emit('saveAsNew', name)
  newTemplateName.value = ''
  showSaveAsForm.value = false
}

const pendingDeleteId = ref<string | null>(null)

const askDeleteCurrent = () => {
  if (props.currentTemplateId === null) return
  const target = props.templates.find((item) => item.id === props.currentTemplateId)
  if (target === undefined) {
    showNotice('未找到当前模板。')
    return
  }
  pendingDeleteId.value = props.currentTemplateId
  confirmDeleteOpen.value = true
}

const onDeleteOpenChange = (open: boolean) => {
  confirmDeleteOpen.value = open
  if (!open) {
    queueMicrotask(() => {
      if (!confirmDeleteOpen.value) pendingDeleteId.value = null
    })
  }
}

const runDelete = () => {
  const id = pendingDeleteId.value
  if (id === null) return
  confirmDeleteOpen.value = false
  pendingDeleteId.value = null
  emit('delete', id)
}
</script>

<template>
  <section class="template-panel">
    <div class="template-panel__head">
      <LayoutTemplate :size="16" />
      <div class="template-panel__title">
        <h3>样式模板</h3>
        <p class="eyebrow">TEMPLATE</p>
      </div>
    </div>

    <p class="template-panel__status">
      当前：<strong>{{ boundLabel }}</strong>
      <Badge v-if="styleDirty" variant="secondary" class="dirty-pill">样式待确认</Badge>
    </p>

    <p v-if="noticeText.length > 0" class="panel-notice" role="status">{{ noticeText }}</p>

    <div class="field">
      <Label>选择 / 切换模板</Label>
      <Select :model-value="selectValue" @update:model-value="onSelectTemplate">
        <SelectTrigger class="h-9 w-full">
          <SelectValue placeholder="选择模板以套用样式…" />
        </SelectTrigger>
        <SelectContent position="popper" class="z-[80]">
          <SelectItem v-for="item in templates" :key="item.id" :value="item.id">
            {{ item.name }}{{ item.builtIn ? '（内置）' : '' }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <p class="hint">
      切换模板会立刻写入当前简历的字体、边距、颜色、分隔线与 Custom CSS（不含正文）。
      正文仍随简历自动保存；下方三种动作决定样式如何相对模板库落库。
    </p>

    <div v-if="styleDirty" class="dirty-banner">
      样式已写入当前简历草稿（自动保存），但尚未确认相对模板的落库方式。
    </div>

    <div class="actions">
      <Button type="button" variant="outline" class="action" @click="emit('saveDocumentOnly')">
        <Save class="action__icon" :size="14" />
        <span class="action__body">
          <span class="action__title">只保存到当前简历</span>
          <span class="action__desc">不改模板库，并清除「待确认」</span>
        </span>
      </Button>
      <Button type="button" variant="outline" class="action" @click="showSaveAsForm = !showSaveAsForm">
        <SaveAll class="action__icon" :size="14" />
        <span class="action__body">
          <span class="action__title">另存为新模板</span>
          <span class="action__desc">用当前样式创建模板并绑定</span>
        </span>
      </Button>
      <Button
        type="button"
        variant="outline"
        class="action"
        :disabled="!canUpdateTemplate"
        :title="canUpdateTemplate ? '写回当前绑定模板' : '请先选择或另存为模板'"
        @click="emit('updateTemplate')"
      >
        <Check class="action__icon" :size="14" />
        <span class="action__body">
          <span class="action__title">更新到当前模板</span>
          <span class="action__desc">{{
            canUpdateTemplate ? '覆盖模板库中的定义' : '未绑定模板，已禁用'
          }}</span>
        </span>
      </Button>
    </div>

    <div v-if="showSaveAsForm" class="save-as">
      <Input
        v-model="newTemplateName"
        type="text"
        maxlength="80"
        class="h-9"
        placeholder="新模板名称，例如：紧凑一页"
        @keydown.enter.prevent="submitSaveAs"
      />
      <Button type="button" @click="submitSaveAs">创建并绑定</Button>
    </div>

    <Button
      v-if="currentTemplateId !== null"
      type="button"
      variant="link"
      class="linkish"
      @click="askDeleteCurrent"
    >
      删除当前用户模板…
    </Button>

    <AlertDialog :open="confirmDeleteOpen" @update:open="onDeleteOpenChange">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除模板</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除模板「{{ currentTemplateName }}」？内置模板删除后不会自动恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="runDelete">删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>

<style scoped>
.template-panel {
  padding: 0 0 8px;
}

.template-panel__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  color: #202428;
}

.template-panel__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.template-panel__head h3 {
  margin: 0;
  font-size: 15px;
}

.eyebrow {
  margin: 0;
  color: #565d62;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.template-panel__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  color: #3f4549;
  font-size: 12px;
}

.dirty-pill {
  color: #8a4216;
  background: #fff4e8;
}

.panel-notice {
  margin: 0 0 10px;
  padding: 7px 10px;
  color: #7a3e3e;
  background: #fff5f5;
  border: 1px solid #f0d0d0;
  border-radius: 8px;
  font-size: 11px;
}

.field {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
}

.hint {
  margin: 0 0 12px;
  color: #565d62;
  font-size: 10px;
  line-height: 1.5;
}

.dirty-banner {
  margin-bottom: 12px;
  padding: 8px 10px;
  color: #8a4216;
  background: #fff7ef;
  border: 1px solid #f0d7bd;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.45;
}

.actions {
  display: grid;
  gap: 6px;
}

/* 覆盖 Button 默认 h-8 / 居中 / nowrap，改成左对齐双行块 */
.action {
  display: flex;
  width: 100%;
  height: auto;
  min-height: 0;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 8px;
  padding: 7px 10px;
  border-color: #d8dde0;
  color: #202428;
  font-size: inherit;
  font-weight: 400;
  line-height: 1.25;
  text-align: left;
  white-space: normal;
  box-shadow: none;
}

.action:hover {
  background: #f4f6f7;
  color: #202428;
}

.action:disabled {
  opacity: 0.55;
}

.action__icon {
  margin-top: 1px;
  color: #5c656b;
}

.action__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  align-items: flex-start;
}

.action__title {
  display: block;
  color: #202428;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.action__desc {
  display: block;
  color: #6a7278;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.35;
}

.save-as {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-top: 10px;
}

.linkish {
  margin-top: 8px;
  height: auto;
  padding: 0;
  color: #565d62;
  font-size: 11px;
}
</style>
