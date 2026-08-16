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
let applyingExternal = false
let emitTimer: ReturnType<typeof setTimeout> | null = null

const normalize = (value: string) => value.replace(/\r\n/g, '\n')

/**
 * 切换当前行标题级别（Markdown）。
 * 用例：Ctrl+2 → 行首变成 `## `
 */
const toggleHeadingOnLine = (level: number) => {
  if (editorInstance === null || props.language !== 'markdown') return
  const model = editorInstance.getModel()
  const selection = editorInstance.getSelection()
  if (model === null || selection === null) return
  const line = selection.startLineNumber
  const text = model.getLineContent(line)
  const stripped = text.replace(/^#{1,6}\s+/, '')
  const next = `${'#'.repeat(level)} ${stripped}`
  editorInstance.executeEdits('heading', [
    {
      range: new monaco.Range(line, 1, line, text.length + 1),
      text: next,
    },
  ])
}

const wrapSelection = (before: string, after: string) => {
  if (editorInstance === null) return
  const selection = editorInstance.getSelection()
  const model = editorInstance.getModel()
  if (selection === null || model === null) return
  const selected = model.getValueInRange(selection)
  editorInstance.executeEdits('wrap', [
    {
      range: selection,
      text: `${before}${selected}${after}`,
    },
  ])
}

const applyExternalValue = (value: string) => {
  if (editorInstance === null) return
  const current = editorInstance.getValue()
  if (normalize(current) === normalize(value)) return

  applyingExternal = true
  const model = editorInstance.getModel()
  const position = editorInstance.getPosition()
  const selection = editorInstance.getSelection()

  if (model !== null && !editorInstance.hasTextFocus()) {
    editorInstance.executeEdits('external-sync', [
      {
        range: model.getFullModelRange(),
        text: value,
      },
    ])
  } else if (model !== null) {
    // 左栏聚焦时若右侧回写，尽量保留光标行
    editorInstance.executeEdits('external-sync', [
      {
        range: model.getFullModelRange(),
        text: value,
      },
    ])
    if (selection !== null) {
      const lineCount = model.getLineCount()
      const line = Math.min(selection.startLineNumber, lineCount)
      const maxCol = model.getLineMaxColumn(line)
      const col = Math.min(selection.startColumn, maxCol)
      editorInstance.setPosition({ lineNumber: line, column: col })
    } else if (position !== null) {
      editorInstance.setPosition(position)
    }
  } else {
    editorInstance.setValue(value)
  }

  queueMicrotask(() => {
    applyingExternal = false
  })
}

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

  if (props.language === 'markdown') {
    for (let level = 1; level <= 6; level += 1) {
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | (monaco.KeyCode.Digit0 + level), () => {
        toggleHeadingOnLine(level)
      })
    }
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => {
      wrapSelection('**', '**')
    })
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
      wrapSelection('*', '*')
    })
  }

  contentSubscription = editorInstance.onDidChangeModelContent(() => {
    if (editorInstance === null || applyingExternal) return
    const value = editorInstance.getValue()
    if (emitTimer !== null) clearTimeout(emitTimer)
    emitTimer = setTimeout(() => {
      emitTimer = null
      emit('update:modelValue', value)
    }, 120)
  })
})

watch(
  () => props.modelValue,
  (value) => {
    if (editorInstance === null || applyingExternal) return
    applyExternalValue(value)
  },
)

onBeforeUnmount(() => {
  if (emitTimer !== null) clearTimeout(emitTimer)
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
