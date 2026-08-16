<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import type { ResumeStyles } from '../types/resume'
import { renderResumeMarkdown } from '../utils/markdown'
import {
  buildResumeDocumentCss,
  buildResumeSurfaceVars,
  sanitizeResumeCustomCss,
} from '../utils/resumeDocumentStyles'
import { scopeResumeCustomCss } from '../utils/scopeResumeCustomCss'

const props = withDefaults(
  defineProps<{
    surfaceId: string
    styles: ResumeStyles
    customCss?: string
    markdown: string
    /** 相对 A4 的缩放，列表卡片略小、模板区略大 */
    scale?: number
    /** sheet=接近整页比例；crop=裁切上半页更满 */
    aspect?: 'sheet' | 'crop'
  }>(),
  {
    customCss: '',
    scale: 0.28,
    aspect: 'crop',
  },
)

const html = computed(() => renderResumeMarkdown(props.markdown))

const pageStyle = computed(() => {
  const vars = buildResumeSurfaceVars(props.styles, 1)
  return {
    ...vars,
    color: vars['--resume-text'],
    background: '#fff',
    fontFamily: vars['--resume-font'],
    fontSize: vars['--resume-body'],
    lineHeight: vars['--resume-line'],
    padding: `${vars['--resume-margin-y']} ${vars['--resume-margin-x']}`,
    transform: `scale(${props.scale})`,
  }
})

const safeId = computed(() => props.surfaceId.replace(/[^a-zA-Z0-9_-]/g, ''))

watchEffect((onCleanup) => {
  const styleId = `resume-thumb-css-${safeId.value}`
  const existing = document.getElementById(styleId)
  if (existing !== null) existing.remove()

  const contentSel = `[data-resume-thumb="${CSS.escape(props.surfaceId)}"] .resume-thumb__content`
  const documentCss = buildResumeDocumentCss(contentSel)
  const scopedCustom = scopeResumeCustomCss(
    sanitizeResumeCustomCss(props.customCss),
    props.surfaceId,
  )
  const el = document.createElement('style')
  el.id = styleId
  el.textContent = `${documentCss}\n${scopedCustom}`
  document.head.appendChild(el)
  onCleanup(() => {
    const node = document.getElementById(styleId)
    if (node !== null) node.remove()
  })
})
</script>

<template>
  <div
    class="resume-thumb"
    :class="{ 'resume-thumb--sheet': aspect === 'sheet' }"
    :data-resume-thumb="surfaceId"
    aria-hidden="true"
  >
    <div class="resume-thumb__viewport">
      <div class="resume-thumb__page" :style="pageStyle">
        <div class="resume-thumb__content" v-html="html" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.resume-thumb {
  width: 100%;
  overflow: hidden;
  background: #e9ecee;
  border-radius: 8px 8px 0 0;
  pointer-events: none;
  user-select: none;
}

.resume-thumb__viewport {
  position: relative;
  width: 100%;
  aspect-ratio: 210 / 240;
  overflow: hidden;
}

.resume-thumb--sheet .resume-thumb__viewport {
  aspect-ratio: 210 / 297;
}

.resume-thumb__page {
  position: absolute;
  top: 0;
  left: 0;
  width: 210mm;
  min-height: 297mm;
  box-sizing: border-box;
  transform-origin: top left;
  box-shadow: 0 8px 24px rgba(30, 38, 43, 0.12);
}
</style>
