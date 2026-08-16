import { get, set } from 'idb-keyval'
import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import { createDefaultResume } from '../data/defaultResume'
import {
  createBuiltinTemplates,
  mergeMissingBuiltins,
  sanitizeRemovedBuiltinIds,
} from '../data/defaultTemplates'
import {
  documentLibrarySchema,
  legacyResumeDocumentSchema,
  resumeDocumentSchema,
  styleFingerprint,
  templateLibrarySchema,
  type ResumeDocumentV1,
  type ResumeStyles,
  type ResumeTemplate,
  type SaveStatus,
} from '../types/resume'

/** 旧版单文档 key，hydrate 时迁移到多文档库后保留备份不强制删除 */
const LEGACY_DOCUMENT_KEY = 'resume-builder:document:v1'
const DOCUMENTS_KEY = 'resume-builder:documents:v1'
const TEMPLATES_KEY = 'resume-builder:templates:v1'

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Pinia/Vue 响应式 Proxy 不能直接 structuredClone，需先 toRaw */
const clonePlain = <T>(value: T): T => structuredClone(toRaw(value))

const ensureDocumentId = (raw: unknown): ResumeDocumentV1 | null => {
  const legacy = legacyResumeDocumentSchema.safeParse(raw)
  if (!legacy.success) return null
  const withId = {
    ...legacy.data,
    id: legacy.data.id && legacy.data.id.length > 0 ? legacy.data.id : createId(),
    templateId: legacy.data.templateId ?? null,
  }
  const parsed = resumeDocumentSchema.safeParse(withId)
  return parsed.success ? parsed.data : null
}

export const useResumeStore = defineStore('resume', () => {
  const documents = ref<ResumeDocumentV1[]>([])
  const activeDocumentId = ref<string | null>(null)
  const templates = ref<ResumeTemplate[]>(createBuiltinTemplates())
  /** 用户删除的内置模板 id，持久化后 mergeMissingBuiltins 不再补回 */
  const removedBuiltinIds = ref<string[]>([])
  const saveStatus = ref<SaveStatus>('idle')
  const hydrated = ref(false)
  /** 上次通过三种样式保存动作确认后的指纹；与当前样式不同则 styleDirty */
  const committedStyleFingerprint = ref('')
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const documentList = computed(() =>
    documents.value
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)),
  )

  const document = computed(() => {
    const id = activeDocumentId.value
    if (id === null) return null
    return documents.value.find((item) => item.id === id) || null
  })

  const currentTemplate = computed(() => {
    const doc = document.value
    if (doc === null || doc.templateId === null) return null
    return templates.value.find((item) => item.id === doc.templateId) || null
  })

  const styleDirty = computed(() => {
    const doc = document.value
    if (doc === null) return false
    const current = styleFingerprint(doc.styles, doc.customCss)
    return current !== committedStyleFingerprint.value
  })

  const markStyleCommitted = () => {
    const doc = document.value
    if (doc === null) {
      committedStyleFingerprint.value = ''
      return
    }
    committedStyleFingerprint.value = styleFingerprint(doc.styles, doc.customCss)
  }

  const persistDocuments = async () => {
    saveStatus.value = 'saving'
    try {
      const payload = documentLibrarySchema.parse({
        schemaVersion: 1,
        documents: documents.value,
      })
      await set(DOCUMENTS_KEY, payload)
      saveStatus.value = 'saved'
    } catch (error) {
      console.error('保存简历库失败', error)
      saveStatus.value = 'error'
    }
  }

  const persistTemplates = async () => {
    try {
      const payload = templateLibrarySchema.parse({
        schemaVersion: 1,
        templates: templates.value,
        removedBuiltinIds: removedBuiltinIds.value,
      })
      await set(TEMPLATES_KEY, payload)
    } catch (error) {
      console.error('保存模板库失败', error)
      saveStatus.value = 'error'
    }
  }

  /**
   * 合并频繁输入产生的文档保存请求。
   * 正文与工作区样式都会写入当前简历；模板库需显式三种动作才会改写。
   */
  const scheduleSave = () => {
    const doc = document.value
    if (doc !== null) {
      doc.updatedAt = new Date().toISOString()
    }
    saveStatus.value = 'saving'
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persistDocuments()
    }, 500)
  }

  const hydrate = async () => {
    try {
      const [savedLibrary, legacyDoc, savedLibraryTemplates] = await Promise.all([
        get(DOCUMENTS_KEY),
        get(LEGACY_DOCUMENT_KEY),
        get(TEMPLATES_KEY),
      ])

      const libraryResult = templateLibrarySchema.safeParse(savedLibraryTemplates)
      if (libraryResult.success) {
        removedBuiltinIds.value = sanitizeRemovedBuiltinIds(
          libraryResult.data.removedBuiltinIds,
        )
        const merged = mergeMissingBuiltins(
          libraryResult.data.templates,
          removedBuiltinIds.value,
        )
        templates.value = merged
        const templatesChanged =
          JSON.stringify(merged) !== JSON.stringify(libraryResult.data.templates)
        const removedChanged =
          JSON.stringify(removedBuiltinIds.value) !==
          JSON.stringify(libraryResult.data.removedBuiltinIds)
        if (templatesChanged || removedChanged) {
          await persistTemplates()
        }
      } else {
        removedBuiltinIds.value = []
        templates.value = createBuiltinTemplates()
        await persistTemplates()
      }

      const docsResult = documentLibrarySchema.safeParse(savedLibrary)
      if (docsResult.success) {
        documents.value = docsResult.data.documents
      } else {
        const migrated = ensureDocumentId(legacyDoc)
        if (migrated !== null) {
          documents.value = [migrated]
          await persistDocuments()
        } else {
          documents.value = []
        }
      }
    } catch (error) {
      console.error('读取本地数据失败', error)
      saveStatus.value = 'error'
    } finally {
      hydrated.value = true
      if (saveStatus.value !== 'error') saveStatus.value = 'saved'
    }
  }

  const openDocument = (id: string): boolean => {
    const target = documents.value.find((item) => item.id === id)
    if (target === undefined) {
      activeDocumentId.value = null
      markStyleCommitted()
      return false
    }
    activeDocumentId.value = id
    markStyleCommitted()
    return true
  }

  const closeDocument = () => {
    activeDocumentId.value = null
    markStyleCommitted()
  }

  /**
   * 新建简历。可基于模板样式；正文使用默认示例 Markdown。
   */
  const createDocument = async (options?: {
    title?: string
    templateId?: string | null
  }): Promise<ResumeDocumentV1> => {
    const templateId =
      options !== undefined && options.templateId !== undefined
        ? options.templateId
        : null
    const bound =
      templateId !== null
        ? templates.value.find((item) => item.id === templateId)
        : undefined
    const title =
      options !== undefined && options.title !== undefined && options.title.trim().length > 0
        ? options.title.trim().slice(0, 100)
        : '未命名简历'
    const doc =
      bound !== undefined
        ? createDefaultResume({
            title,
            templateId: bound.id,
            styles: clonePlain(bound.styles),
            customCss: bound.customCss,
          })
        : createDefaultResume({ title, templateId: null })
    documents.value = [doc, ...documents.value]
    activeDocumentId.value = doc.id
    markStyleCommitted()
    await persistDocuments()
    return doc
  }

  const deleteDocument = async (id: string): Promise<boolean> => {
    const exists = documents.value.some((item) => item.id === id)
    if (!exists) return false
    documents.value = documents.value.filter((item) => item.id !== id)
    if (activeDocumentId.value === id) {
      activeDocumentId.value = null
      markStyleCommitted()
    }
    await persistDocuments()
    return true
  }

  const requireDocument = (): ResumeDocumentV1 => {
    const doc = document.value
    if (doc === null) {
      throw new Error('当前没有打开的简历')
    }
    return doc
  }

  const updateMarkdown = (value: string) => {
    requireDocument().markdown = value
    scheduleSave()
  }

  const updateCustomCss = (value: string) => {
    requireDocument().customCss = value
    scheduleSave()
  }

  const updateTitle = (value: string) => {
    requireDocument().title = value
    scheduleSave()
  }

  const updateStyle = <K extends keyof ResumeStyles>(key: K, value: ResumeStyles[K]) => {
    requireDocument().styles[key] = value
    scheduleSave()
  }

  const updateAutoFitScale = (value: number) => {
    requireDocument().autoFitScale = value
    scheduleSave()
  }

  const updateSmartPagination = (value: boolean) => {
    requireDocument().smartPagination = value
    scheduleSave()
  }

  const replaceDocument = (value: ResumeDocumentV1) => {
    const current = requireDocument()
    const parsed = resumeDocumentSchema.parse({
      ...value,
      id: current.id,
      templateId: value.templateId ?? null,
    })
    const index = documents.value.findIndex((item) => item.id === current.id)
    if (index < 0) return
    const list = documents.value.slice()
    list[index] = clonePlain(parsed)
    documents.value = list
    markStyleCommitted()
    scheduleSave()
  }

  const resetDocument = () => {
    const current = requireDocument()
    const next = createDefaultResume({ id: current.id })
    const index = documents.value.findIndex((item) => item.id === current.id)
    if (index < 0) return
    const list = documents.value.slice()
    list[index] = next
    documents.value = list
    markStyleCommitted()
    scheduleSave()
  }

  const resetStyles = () => {
    const doc = requireDocument()
    const bound = currentTemplate.value
    if (bound !== null) {
      doc.styles = clonePlain(bound.styles)
      doc.customCss = bound.customCss
    } else {
      const defaults = createDefaultResume()
      doc.styles = defaults.styles
      doc.customCss = defaults.customCss
    }
    doc.autoFitScale = 1
    scheduleSave()
  }

  /**
   * 套用模板样式到当前简历（不改 Markdown 正文）。
   */
  const applyTemplate = (templateId: string) => {
    const target = templates.value.find((item) => item.id === templateId)
    if (target === undefined) return false
    const doc = requireDocument()
    doc.styles = clonePlain(target.styles)
    doc.customCss = target.customCss
    doc.templateId = target.id
    doc.autoFitScale = 1
    markStyleCommitted()
    scheduleSave()
    return true
  }

  /**
   * ① 只保存到当前简历：工作区样式已随自动保存进文档；
   * 此处确认「不写模板库」，并清除相对上次提交的脏标记。
   */
  const saveStylesToDocumentOnly = () => {
    markStyleCommitted()
    scheduleSave()
  }

  /**
   * ② 另存为新模板：把当前样式 + Custom CSS 写入模板库并绑定。
   */
  const saveStylesAsNewTemplate = async (name: string) => {
    const doc = requireDocument()
    const trimmed = name.trim()
    if (trimmed.length === 0) return null
    const template: ResumeTemplate = {
      id: createId(),
      name: trimmed.slice(0, 80),
      styles: clonePlain(doc.styles),
      customCss: doc.customCss,
      builtIn: false,
      updatedAt: new Date().toISOString(),
    }
    templates.value = [...templates.value, template]
    doc.templateId = template.id
    markStyleCommitted()
    await persistTemplates()
    scheduleSave()
    return template
  }

  /**
   * ③ 更新到当前模板：把当前样式写回绑定的模板定义。
   */
  const updateCurrentTemplateFromDocument = async () => {
    const doc = requireDocument()
    const id = doc.templateId
    if (id === null) return false
    const index = templates.value.findIndex((item) => item.id === id)
    if (index < 0) return false
    const current = templates.value[index]
    const next: ResumeTemplate = {
      ...current,
      styles: clonePlain(doc.styles),
      customCss: doc.customCss,
      updatedAt: new Date().toISOString(),
    }
    const list = templates.value.slice()
    list[index] = next
    templates.value = list
    markStyleCommitted()
    await persistTemplates()
    return true
  }

  const renameTemplate = async (templateId: string, name: string) => {
    const trimmed = name.trim()
    if (trimmed.length === 0) return false
    const index = templates.value.findIndex((item) => item.id === templateId)
    if (index < 0) return false
    const list = templates.value.slice()
    list[index] = {
      ...list[index],
      name: trimmed.slice(0, 80),
      updatedAt: new Date().toISOString(),
    }
    templates.value = list
    await persistTemplates()
    return true
  }

  const deleteTemplate = async (templateId: string) => {
    const target = templates.value.find((item) => item.id === templateId)
    if (target === undefined) return false
    templates.value = templates.value.filter((item) => item.id !== templateId)
    if (target.builtIn && !removedBuiltinIds.value.includes(templateId)) {
      removedBuiltinIds.value = [...removedBuiltinIds.value, templateId]
    }
    let touched = false
    documents.value = documents.value.map((doc) => {
      if (doc.templateId !== templateId) return doc
      touched = true
      return { ...doc, templateId: null }
    })
    if (touched) scheduleSave()
    await persistTemplates()
    return true
  }

  /** 清空已删内置记录并重新合并种子模板（自定义模板保留） */
  const restoreRemovedBuiltins = async () => {
    if (removedBuiltinIds.value.length === 0) return false
    removedBuiltinIds.value = []
    templates.value = mergeMissingBuiltins(templates.value, [])
    await persistTemplates()
    return true
  }

  return {
    documents,
    documentList,
    activeDocumentId,
    document,
    templates,
    removedBuiltinIds,
    saveStatus,
    hydrated,
    currentTemplate,
    styleDirty,
    hydrate,
    openDocument,
    closeDocument,
    createDocument,
    deleteDocument,
    updateMarkdown,
    updateCustomCss,
    updateTitle,
    updateStyle,
    updateAutoFitScale,
    updateSmartPagination,
    replaceDocument,
    resetDocument,
    resetStyles,
    applyTemplate,
    saveStylesToDocumentOnly,
    saveStylesAsNewTemplate,
    updateCurrentTemplateFromDocument,
    renameTemplate,
    deleteTemplate,
    restoreRemovedBuiltins,
  }
})
