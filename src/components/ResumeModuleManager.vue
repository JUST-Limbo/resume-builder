<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-vue-next'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  parseResumeModules,
  serializeResumeModules,
  type ResumeModuleBlock,
} from '../utils/resumeModules'

const props = defineProps<{
  open: boolean
  markdown: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: [value: string]
}>()

const preamble = ref('')
const modules = ref<ResumeModuleBlock[]>([])
const draggedId = ref<string | null>(null)
const dragTargetId = ref<string | null>(null)

const nextMarkdown = computed(() => serializeResumeModules(preamble.value, modules.value))
const hasChanges = computed(() => nextMarkdown.value !== props.markdown)

const resetDraft = () => {
  const parsed = parseResumeModules(props.markdown)
  preamble.value = parsed.preamble
  modules.value = parsed.modules
  draggedId.value = null
  dragTargetId.value = null
}

watch(
  () => props.open,
  (open) => {
    if (open) resetDraft()
  },
)

const onOpenChange = (open: boolean) => {
  emit('update:open', open)
}

const removeModule = (id: string) => {
  modules.value = modules.value.filter((module) => module.id !== id)
}

const moveModule = (id: string, direction: -1 | 1) => {
  const sourceIndex = modules.value.findIndex((module) => module.id === id)
  if (sourceIndex < 0) return
  const targetIndex = sourceIndex + direction
  if (targetIndex < 0 || targetIndex >= modules.value.length) return
  const next = modules.value.slice()
  const source = next[sourceIndex]
  next[sourceIndex] = next[targetIndex]
  next[targetIndex] = source
  modules.value = next
}

const onDragStart = (event: DragEvent, id: string) => {
  draggedId.value = id
  if (event.dataTransfer === null) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', id)
}

const onDragOver = (id: string) => {
  if (draggedId.value === null || draggedId.value === id) return
  dragTargetId.value = id
}

const onDrop = (event: DragEvent, targetId: string) => {
  const sourceId = draggedId.value
  if (sourceId === null || sourceId === targetId) return

  const next = modules.value.slice()
  const sourceIndex = next.findIndex((module) => module.id === sourceId)
  if (sourceIndex < 0) return
  const removed = next.splice(sourceIndex, 1)
  const source = removed[0]
  if (source === undefined) return

  let targetIndex = next.findIndex((module) => module.id === targetId)
  if (targetIndex < 0) return
  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    const rect = target.getBoundingClientRect()
    if (event.clientY > rect.top + rect.height / 2) targetIndex += 1
  }
  next.splice(targetIndex, 0, source)
  modules.value = next
  draggedId.value = null
  dragTargetId.value = null
}

const onDragEnd = () => {
  draggedId.value = null
  dragTargetId.value = null
}

const applyChanges = () => {
  if (!hasChanges.value) return
  emit('apply', nextMarkdown.value)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="module-manager sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>模块管理</DialogTitle>
        <DialogDescription>
          以 Markdown 二级标题（##）识别模块。拖拽调整顺序，删除后点击“应用更改”生效。
        </DialogDescription>
      </DialogHeader>

      <ol v-if="modules.length > 0" class="module-manager__list">
        <li
          v-for="(module, index) in modules"
          :key="module.id"
          class="module-manager__item"
          :class="{
            'is-dragging': draggedId === module.id,
            'is-drag-target': dragTargetId === module.id,
          }"
          draggable="true"
          @dragstart="onDragStart($event, module.id)"
          @dragover.prevent="onDragOver(module.id)"
          @drop.prevent="onDrop($event, module.id)"
          @dragend="onDragEnd"
        >
          <span class="module-manager__handle" title="拖拽调整顺序">
            <GripVertical :size="17" />
          </span>
          <span class="module-manager__name">
            <strong>{{ module.title }}</strong>
            <small>第 {{ index + 1 }} 个模块</small>
          </span>
          <span class="module-manager__actions">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="index === 0"
              :aria-label="`上移${module.title}`"
              @click="moveModule(module.id, -1)"
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="index === modules.length - 1"
              :aria-label="`下移${module.title}`"
              @click="moveModule(module.id, 1)"
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              :aria-label="`删除${module.title}`"
              @click="removeModule(module.id)"
            >
              <Trash2 />
            </Button>
          </span>
        </li>
      </ol>
      <p v-else class="module-manager__empty">
        未检测到可管理模块。请先在简历中添加以 <code>##</code> 开头的二级标题。
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" @click="emit('update:open', false)">取消</Button>
        <Button type="button" :disabled="!hasChanges" @click="applyChanges">应用更改</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.module-manager__list {
  display: flex;
  max-height: min(56vh, 520px);
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 2px;
  overflow: auto;
  list-style: none;
}

.module-manager__item {
  display: flex;
  min-height: 52px;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  background: #fff;
  border: 1px solid #dfe3e5;
  border-radius: 8px;
  transition: border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
}

.module-manager__item.is-dragging {
  opacity: 0.45;
}

.module-manager__item.is-drag-target {
  border-color: #6b7378;
  box-shadow: 0 0 0 2px rgba(107, 115, 120, 0.16);
}

.module-manager__handle {
  display: inline-flex;
  flex: 0 0 auto;
  width: 24px;
  height: 32px;
  align-items: center;
  justify-content: center;
  color: #8a9297;
  cursor: grab;
}

.module-manager__handle:active {
  cursor: grabbing;
}

.module-manager__name {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}

.module-manager__name strong {
  overflow: hidden;
  color: #252b2f;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.module-manager__name small {
  color: #81898e;
  font-size: 10px;
}

.module-manager__actions {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 2px;
}

.module-manager__empty {
  margin: 0;
  padding: 28px 20px;
  color: #70787d;
  text-align: center;
  background: #f7f8f8;
  border: 1px dashed #d7dcde;
  border-radius: 8px;
  line-height: 1.6;
}

.module-manager__empty code {
  font-family: 'Cascadia Code', Consolas, monospace;
}
</style>
