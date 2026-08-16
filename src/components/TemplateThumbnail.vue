<script setup lang="ts">
import type { ResumeTemplate } from '../types/resume'
import { defaultMarkdown } from '../data/defaultResume'
import ResumeThumbnail from './ResumeThumbnail.vue'

const props = defineProps<{
  template: ResumeTemplate
}>()
</script>

<template>
  <ResumeThumbnail
    :surface-id="`tpl-${template.id}`"
    :styles="template.styles"
    :custom-css="template.customCss"
    :markdown="defaultMarkdown"
    :scale="0.34"
    aspect="sheet"
  />
</template>
