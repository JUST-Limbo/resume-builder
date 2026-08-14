import { z } from 'zod'

export const fontPresetSchema = z.enum(['system', 'modern', 'serif'])
export const nameAlignmentSchema = z.enum(['left', 'center'])
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const resumeStylesSchema = z.object({
  marginX: z.number().min(8).max(25),
  marginY: z.number().min(8).max(25),
  baseFontSize: z.number().min(8).max(12),
  lineHeight: z.number().min(1.2).max(1.8),
  sectionGap: z.number().min(4).max(20),
  itemGap: z.number().min(0).max(12),
  fontPreset: fontPresetSchema,
  nameAlignment: nameAlignmentSchema,
  textColor: colorSchema,
  mutedColor: colorSchema,
  dividerColor: colorSchema,
  dividerWidth: z.number().min(0).max(3),
})

export const resumeDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1).max(100),
  markdown: z.string(),
  styles: resumeStylesSchema,
  customCss: z.string(),
  autoFitScale: z.number().min(0.5).max(1),
  updatedAt: z.string(),
})

export type ResumeStyles = z.infer<typeof resumeStylesSchema>
export type ResumeDocumentV1 = z.infer<typeof resumeDocumentSchema>
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type EditorMode = 'markdown' | 'css'
export type AutoFitStatus = 'idle' | 'running' | 'fit' | 'already-fit' | 'cannot-fit'

export type AutoFitResult = {
  status: Exclude<AutoFitStatus, 'idle' | 'running'>
  scale: number
  pageCount: number
}
