<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AutoFitResult, ResumeDocumentV1 } from '../types/resume'
import { exportResumePdf } from '../utils/exportResumePdf'
import {
  PAGE_WIDTH_PX,
  renderResumeIntoFrame,
} from '../utils/resumePageEngine'

const props = defineProps<{
  document: ResumeDocumentV1
}>()

const emit = defineEmits<{
  pageCount: [value: number]
  scaleChange: [value: number]
  autoFitRunning: [value: boolean]
  autoFitResult: [value: AutoFitResult]
}>()

const frame = ref<HTMLIFrameElement | null>(null)
let renderTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let renderSequence = 0

const renderDocument = async (scale: number, reportPageCount: boolean) => {
  const iframe = frame.value
  if (iframe === null) return 0
  const iframeDocument = iframe.contentDocument
  const iframeWindow = iframe.contentWindow
  if (iframeDocument === null || iframeWindow === null) return 0

  renderSequence += 1
  const sequence = renderSequence
  const availableWidth = Math.max(iframe.clientWidth - 56, 320)
  const zoom = Math.min(1, availableWidth / PAGE_WIDTH_PX)

  const count = await renderResumeIntoFrame(iframeDocument, iframeWindow, props.document, {
    scale,
    zoom,
  })
  if (sequence !== renderSequence) return 0

  if (reportPageCount) emit('pageCount', count)
  return count
}

const scheduleRender = () => {
  if (renderTimer !== null) clearTimeout(renderTimer)
  renderTimer = setTimeout(() => {
    renderTimer = null
    void renderDocument(props.document.autoFitScale, true)
  }, 160)
}

const fitToOnePage = async () => {
  emit('autoFitRunning', true)
  try {
    const fullSizePages = await renderDocument(1, false)
    if (fullSizePages <= 1) {
      emit('scaleChange', 1)
      const result: AutoFitResult = { status: 'already-fit', scale: 1, pageCount: fullSizePages }
      emit('autoFitResult', result)
      emit('pageCount', fullSizePages)
      return result
    }

    const readableScale = 8.5 / props.document.styles.baseFontSize
    const minScale = Math.min(1, Math.max(0.75, readableScale))
    const minSizePages = await renderDocument(minScale, false)
    if (minSizePages > 1) {
      emit('scaleChange', minScale)
      const result: AutoFitResult = {
        status: 'cannot-fit',
        scale: minScale,
        pageCount: minSizePages,
      }
      emit('autoFitResult', result)
      emit('pageCount', minSizePages)
      return result
    }

    let low = minScale
    let high = 1
    let bestScale = minScale
    let bestPageCount = minSizePages
    for (let iteration = 0; iteration < 12 && high - low > 0.005; iteration += 1) {
      const middle = Number(((low + high) / 2).toFixed(4))
      const pageCount = await renderDocument(middle, false)
      if (pageCount <= 1) {
        bestScale = middle
        bestPageCount = pageCount
        low = middle
      } else {
        high = middle
      }
    }

    await renderDocument(bestScale, true)
    emit('scaleChange', bestScale)
    const result: AutoFitResult = { status: 'fit', scale: bestScale, pageCount: bestPageCount }
    emit('autoFitResult', result)
    return result
  } finally {
    emit('autoFitRunning', false)
  }
}

const resetAutoFit = async () => {
  emit('scaleChange', 1)
  return renderDocument(1, true)
}

const exportPdf = async () => {
  await exportResumePdf(props.document)
}

/** 以 zoom=1 重绘后走浏览器打印引擎（与「导出 PDF」矢量主路径同源）。 */
const printResume = async () => {
  const iframe = frame.value
  if (iframe === null) return
  const iframeDocument = iframe.contentDocument
  const iframeWindow = iframe.contentWindow
  if (iframeDocument === null || iframeWindow === null) return

  renderSequence += 1
  const sequence = renderSequence
  await renderResumeIntoFrame(iframeDocument, iframeWindow, props.document, {
    scale: props.document.autoFitScale,
    zoom: 1,
  })
  if (sequence !== renderSequence) return

  iframeWindow.focus()
  iframeWindow.print()
}

watch(
  () => props.document,
  () => scheduleRender(),
  { deep: true },
)

onMounted(() => {
  scheduleRender()
  if (frame.value !== null) {
    resizeObserver = new ResizeObserver(() => scheduleRender())
    resizeObserver.observe(frame.value)
  }
})

onBeforeUnmount(() => {
  if (renderTimer !== null) clearTimeout(renderTimer)
  if (resizeObserver !== null) resizeObserver.disconnect()
})

defineExpose({
  fitToOnePage,
  resetAutoFit,
  exportPdf,
  printResume,
  refresh: scheduleRender,
})
</script>

<template>
  <iframe
    ref="frame"
    class="resume-preview-frame"
    title="A4 简历实时预览"
    sandbox="allow-same-origin allow-modals"
  />
</template>

<style scoped>
.resume-preview-frame {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #e9ecee;
  border: 0;
}
</style>
