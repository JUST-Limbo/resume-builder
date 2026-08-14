<script setup lang="ts">
import * as monaco from 'monaco-editor'
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  language: 'markdown' | 'css'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

type MonacoWorkerEnvironment = {
  getWorker: (moduleId: string, label: string) => Worker
}

const globalScope = self as typeof self & {
  MonacoEnvironment: MonacoWorkerEnvironment
}

globalScope.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'css') return new CssWorker()
    return new EditorWorker()
  },
}

const container = ref<HTMLElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null
let contentSubscription: monaco.IDisposable | null = null

onMounted(() => {
  if (container.value === null) return

  editorInstance = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: props.language,
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
    fontSize: 14,
    lineHeight: 22,
    wordWrap: 'on',
    wrappingIndent: 'same',
    scrollBeyondLastLine: false,
    padding: { top: 18, bottom: 18 },
    renderLineHighlight: 'line',
    roundedSelection: false,
    tabSize: 2,
  })

  contentSubscription = editorInstance.onDidChangeModelContent(() => {
    if (editorInstance === null) return
    emit('update:modelValue', editorInstance.getValue())
  })
})

watch(
  () => props.modelValue,
  (value) => {
    if (editorInstance === null || editorInstance.getValue() === value) return
    editorInstance.setValue(value)
  },
)

onBeforeUnmount(() => {
  if (contentSubscription !== null) contentSubscription.dispose()
  if (editorInstance !== null) editorInstance.dispose()
})
</script>

<template>
  <div ref="container" class="monaco-host" />
</template>

<style scoped>
.monaco-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
