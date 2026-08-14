import { get, set } from 'idb-keyval'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createDefaultResume } from '../data/defaultResume'
import {
  resumeDocumentSchema,
  type ResumeDocumentV1,
  type ResumeStyles,
  type SaveStatus,
} from '../types/resume'

const STORAGE_KEY = 'resume-builder:document:v1'

export const useResumeStore = defineStore('resume', () => {
  const document = ref<ResumeDocumentV1>(createDefaultResume())
  const saveStatus = ref<SaveStatus>('idle')
  const hydrated = ref(false)
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const persist = async () => {
    saveStatus.value = 'saving'
    document.value.updatedAt = new Date().toISOString()
    try {
      const payload = resumeDocumentSchema.parse(document.value)
      await set(STORAGE_KEY, payload)
      saveStatus.value = 'saved'
    } catch (error) {
      console.error('保存简历失败', error)
      saveStatus.value = 'error'
    }
  }

  /**
   * 合并频繁输入产生的保存请求。
   *
   * 用例：Monaco 连续输入时只在停止 500ms 后写入 IndexedDB；
   * 样式滑块连续拖动时也不会每一帧都执行持久化。
   */
  const scheduleSave = () => {
    saveStatus.value = 'saving'
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persist()
    }, 500)
  }

  const hydrate = async () => {
    try {
      const saved = await get(STORAGE_KEY)
      const result = resumeDocumentSchema.safeParse(saved)
      if (result.success) document.value = result.data
    } catch (error) {
      console.error('读取本地简历失败', error)
      saveStatus.value = 'error'
    } finally {
      hydrated.value = true
      if (saveStatus.value !== 'error') saveStatus.value = 'saved'
    }
  }

  const updateMarkdown = (value: string) => {
    document.value.markdown = value
    scheduleSave()
  }

  const updateCustomCss = (value: string) => {
    document.value.customCss = value
    scheduleSave()
  }

  const updateTitle = (value: string) => {
    document.value.title = value
    scheduleSave()
  }

  const updateStyle = <K extends keyof ResumeStyles>(key: K, value: ResumeStyles[K]) => {
    document.value.styles[key] = value
    scheduleSave()
  }

  const updateAutoFitScale = (value: number) => {
    document.value.autoFitScale = value
    scheduleSave()
  }

  const replaceDocument = (value: ResumeDocumentV1) => {
    document.value = structuredClone(value)
    scheduleSave()
  }

  const resetDocument = () => {
    document.value = createDefaultResume()
    scheduleSave()
  }

  const resetStyles = () => {
    const defaults = createDefaultResume()
    document.value.styles = defaults.styles
    document.value.autoFitScale = 1
    scheduleSave()
  }

  return {
    document,
    saveStatus,
    hydrated,
    hydrate,
    updateMarkdown,
    updateCustomCss,
    updateTitle,
    updateStyle,
    updateAutoFitScale,
    replaceDocument,
    resetDocument,
    resetStyles,
  }
})
