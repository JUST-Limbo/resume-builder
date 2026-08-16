<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next'
import { Button } from './ui/button'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import type { ResumeStyles } from '../types/resume'

defineProps<{
  styles: ResumeStyles
}>()

const emit = defineEmits<{
  update: [key: keyof ResumeStyles, value: ResumeStyles[keyof ResumeStyles]]
  reset: []
}>()

const numberValue = (event: Event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return 0
  return Number(target.value)
}

const stringValue = (event: Event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return ''
  return target.value
}

const onFontPreset = (value: unknown) => {
  if (typeof value !== 'string') return
  emit('update', 'fontPreset', value as ResumeStyles['fontPreset'])
}

const onNameAlignment = (value: unknown) => {
  if (typeof value !== 'string') return
  emit('update', 'nameAlignment', value as ResumeStyles['nameAlignment'])
}
</script>

<template>
  <aside class="style-panel">
    <div class="style-panel__header">
      <div class="style-panel__title">
        <h2>样式设置</h2>
        <p class="eyebrow">DESIGN</p>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        title="恢复到当前模板样式（无模板则用默认）"
        @click="emit('reset')"
      >
        <RotateCcw :size="17" />
      </Button>
    </div>

    <section class="control-group">
      <h3>排版</h3>
      <div class="field">
        <Label>字体组合</Label>
        <Select :model-value="styles.fontPreset" @update:model-value="onFontPreset">
          <SelectTrigger class="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" class="z-[80]">
            <SelectItem value="system">系统无衬线</SelectItem>
            <SelectItem value="modern">Inter / Noto Sans</SelectItem>
            <SelectItem value="serif">Noto 衬线</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label class="field field--range">
        <span>正文字号 <b>{{ styles.baseFontSize.toFixed(1) }} pt</b></span>
        <input
          type="range"
          min="8"
          max="12"
          step="0.1"
          :value="styles.baseFontSize"
          @input="emit('update', 'baseFontSize', numberValue($event))"
        />
      </label>

      <label class="field field--range">
        <span>行高 <b>{{ styles.lineHeight.toFixed(2) }}</b></span>
        <input
          type="range"
          min="1.2"
          max="1.8"
          step="0.05"
          :value="styles.lineHeight"
          @input="emit('update', 'lineHeight', numberValue($event))"
        />
      </label>

      <div class="field">
        <Label>姓名对齐</Label>
        <Select :model-value="styles.nameAlignment" @update:model-value="onNameAlignment">
          <SelectTrigger class="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" class="z-[80]">
            <SelectItem value="left">左对齐</SelectItem>
            <SelectItem value="center">居中</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </section>

    <section class="control-group">
      <h3>页面与间距</h3>
      <label class="field field--range">
        <span>左右边距 <b>{{ styles.marginX }} mm</b></span>
        <input
          type="range"
          min="8"
          max="25"
          step="1"
          :value="styles.marginX"
          @input="emit('update', 'marginX', numberValue($event))"
        />
      </label>

      <label class="field field--range">
        <span>上下边距 <b>{{ styles.marginY }} mm</b></span>
        <input
          type="range"
          min="8"
          max="25"
          step="1"
          :value="styles.marginY"
          @input="emit('update', 'marginY', numberValue($event))"
        />
      </label>

      <label class="field field--range">
        <span>模块间距 <b>{{ styles.sectionGap }} px</b></span>
        <input
          type="range"
          min="4"
          max="20"
          step="1"
          :value="styles.sectionGap"
          @input="emit('update', 'sectionGap', numberValue($event))"
        />
      </label>

      <label class="field field--range">
        <span>条目间距 <b>{{ styles.itemGap }} px</b></span>
        <input
          type="range"
          min="0"
          max="12"
          step="1"
          :value="styles.itemGap"
          @input="emit('update', 'itemGap', numberValue($event))"
        />
      </label>
    </section>

    <section class="control-group">
      <h3>颜色与分隔线</h3>
      <div class="color-grid">
        <label class="color-field">
          <span>正文</span>
          <input
            type="color"
            :value="styles.textColor"
            @input="emit('update', 'textColor', stringValue($event))"
          />
        </label>
        <label class="color-field">
          <span>辅助</span>
          <input
            type="color"
            :value="styles.mutedColor"
            @input="emit('update', 'mutedColor', stringValue($event))"
          />
        </label>
        <label class="color-field">
          <span>线条</span>
          <input
            type="color"
            :value="styles.dividerColor"
            @input="emit('update', 'dividerColor', stringValue($event))"
          />
        </label>
      </div>

      <label class="field field--range">
        <span>线条粗细 <b>{{ styles.dividerWidth.toFixed(1) }} px</b></span>
        <input
          type="range"
          min="0"
          max="3"
          step="0.5"
          :value="styles.dividerWidth"
          @input="emit('update', 'dividerWidth', numberValue($event))"
        />
      </label>
    </section>
  </aside>
</template>

<style scoped>
.style-panel {
  /* 滚动由外层 .style-drawer__panel 统一承担，避免双层滚动 */
  height: auto;
  overflow: visible;
  padding: 22px 20px 28px;
  background: #fbfbfa;
  border-left: 1px solid var(--line);
}

.style-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.style-panel__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.style-panel__header h2 {
  margin: 0;
  font-size: 16px;
}

.eyebrow {
  margin: 0;
  color: #7b8388;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.control-group {
  padding: 18px 0;
  border-top: 1px solid var(--line);
}

.control-group h3 {
  margin: 0 0 14px;
  font-size: 12px;
  letter-spacing: 0.06em;
}

.field {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
  color: #565d62;
  font-size: 12px;
}

.field span {
  display: flex;
  justify-content: space-between;
}

.field b {
  color: #202428;
  font-weight: 600;
}

.field input[type='range'] {
  width: 100%;
  accent-color: #202428;
  cursor: pointer;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 18px;
}

.color-field {
  display: grid;
  gap: 7px;
  color: #62696e;
  font-size: 11px;
}

.color-field input {
  width: 100%;
  height: 34px;
  padding: 3px;
  background: #fff;
  border: 1px solid #dfe2e3;
  border-radius: 7px;
  cursor: pointer;
}
</style>
