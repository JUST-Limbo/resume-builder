import { z } from 'zod'

export const nameAlignmentSchema = z.enum(['left', 'center'])
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const resumeStylesSchema = z.object({
  marginX: z.number().min(8).max(25),
  marginY: z.number().min(8).max(25),
  baseFontSize: z.number().min(8).max(12),
  lineHeight: z.number().min(1.2).max(1.8),
  sectionGap: z.number().min(4).max(20),
  itemGap: z.number().min(0).max(12),
  nameAlignment: nameAlignmentSchema,
  textColor: colorSchema,
  mutedColor: colorSchema,
  dividerColor: colorSchema,
  dividerWidth: z.number().min(0).max(3),
})

/**
 * 样式模板：只存可复用的视觉方案，不含 Markdown 正文。
 * 示例正文仍属于「简历文档」，避免套用模板时误覆盖用户内容。
 */
export const resumeTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  styles: resumeStylesSchema,
  customCss: z.string(),
  builtIn: z.boolean(),
  updatedAt: z.string(),
})

/**
 * 单份简历文档。id 用于多文档列表与路由 /edit/:id。
 * 旧版 IndexedDB 单文档无 id，hydrate 时补齐。
 */
export const resumeDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1).max(100),
  markdown: z.string(),
  styles: resumeStylesSchema,
  customCss: z.string(),
  autoFitScale: z.number().min(0.5).max(1),
  /**
   * 智能分页（keep-with-next / 防标题孤悬等）。
   * 默认关闭；开启后效果区视觉分页与打印/导出分页共用 keep 规则。
   * 旧文档缺字段时按 false 补齐。
   */
  smartPagination: z.boolean().default(false),
  /** 当前绑定的样式模板；null 表示未关联模板 */
  templateId: z.string().nullable().default(null),
  updatedAt: z.string(),
})

/** 兼容迁移：旧单文档可能缺少 id */
export const legacyResumeDocumentSchema = resumeDocumentSchema
  .omit({ id: true })
  .extend({
    id: z.string().min(1).optional(),
  })

export const documentLibrarySchema = z.object({
  schemaVersion: z.literal(1),
  documents: z.array(resumeDocumentSchema),
})

export const templateLibrarySchema = z.object({
  schemaVersion: z.literal(1),
  templates: z.array(resumeTemplateSchema),
  /** 用户主动删除的内置模板 id；hydrate 时 mergeMissingBuiltins 不得再补回 */
  removedBuiltinIds: z.array(z.string().min(1)).default([]),
})

export type ResumeStyles = z.infer<typeof resumeStylesSchema>
export type ResumeTemplate = z.infer<typeof resumeTemplateSchema>
export type ResumeDocumentV1 = z.infer<typeof resumeDocumentSchema>
export type DocumentLibraryV1 = z.infer<typeof documentLibrarySchema>
export type TemplateLibraryV1 = z.infer<typeof templateLibrarySchema>
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
/** 成稿（TipTap 行内所见即所得）或 Markdown 源码（Monaco） */
export type MarkdownEditMode = 'source' | 'wysiwyg'
export type AutoFitStatus = 'idle' | 'running' | 'fit' | 'already-fit' | 'cannot-fit'

export type AutoFitResult = {
  status: Exclude<AutoFitStatus, 'idle' | 'running'>
  scale: number
  pageCount: number
}

/**
 * 样式指纹：用于判断「相对上次确认的样式提交」是否有未落库意图的变更。
 *
 * 用例：改字号后 fingerprint 变化 → styleDirty；点「只保存到当前简历」后对齐。
 */
export const styleFingerprint = (styles: ResumeStyles, customCss: string): string =>
  JSON.stringify({ styles, customCss })
