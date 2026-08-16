import type { ResumeStyles, ResumeTemplate } from '../types/resume'

/** 内置「经典简约」样式，与匿名默认简历一致 */
export const BUILTIN_CLASSIC_ID = 'builtin-classic'

export const classicStyles = (): ResumeStyles => ({
  marginX: 14,
  marginY: 12,
  baseFontSize: 10,
  lineHeight: 1.5,
  sectionGap: 11,
  itemGap: 3,
  fontPreset: 'system',
  nameAlignment: 'left',
  textColor: '#1a1a1a',
  mutedColor: '#6b7280',
  dividerColor: '#1a1a1a',
  dividerWidth: 1,
})

/**
 * 种子模板库（仅样式 + Custom CSS，不含 Markdown）。
 * 首次打开写入 IndexedDB；之后由 mergeMissingBuiltins 补齐缺失内置，并刷新已有内置的样式定义。
 * 当前仅保留「经典简约」一个内置；本地库中其它 builtIn 会在合并时清掉。
 */
export const createBuiltinTemplates = (): ResumeTemplate[] => {
  const now = new Date().toISOString()
  return [
    {
      id: BUILTIN_CLASSIC_ID,
      name: '经典简约',
      styles: classicStyles(),
      customCss: [
        `h1 { font-weight: 800; letter-spacing: -0.01em; }`,
        `h2 { font-weight: 700; letter-spacing: 0.02em; }`,
        /* 与打印 markdown 注入的 .resume-profile-line 对齐；h1+p 兜底未打 class 的首段 */
        `.resume-profile-line, h1 + p, h1 + ul, h1 + ol { font-size: 0.9em; }`,
      ].join(' '),
      builtIn: true,
      updatedAt: now,
    },
  ]
}

/** 当前种子内置 id 集合（用于清理 removedBuiltinIds 中的已下架 id） */
export const currentBuiltinIdSet = (): Set<string> =>
  new Set(createBuiltinTemplates().map((item) => item.id))

/**
 * 只保留仍在种子库中的「用户已删内置」记录，避免下架模板占「恢复默认」计数。
 */
export const sanitizeRemovedBuiltinIds = (
  removedBuiltinIds: readonly string[],
): string[] => {
  const seedIds = currentBuiltinIdSet()
  return removedBuiltinIds.filter((id) => seedIds.has(id))
}

const stylesEqual = (a: ResumeStyles, b: ResumeStyles): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * 将缺失的内置模板补进本地库（按 id），并刷新已有内置的 name / styles / customCss。
 * 新增内置插在最后一个 builtIn 之后、自定义模板之前。
 * 用户自定义模板（builtIn=false）原样保留。
 * `removedBuiltinIds` 中的内置 id 视为用户已删除，不再自动加回。
 * 种子库中已不存在的 builtIn（下架）会从本地列表移除，不会进入 removedBuiltinIds。
 */
export const mergeMissingBuiltins = (
  existing: ResumeTemplate[],
  removedBuiltinIds: readonly string[] = [],
): ResumeTemplate[] => {
  const builtins = createBuiltinTemplates()
  const seedById = new Map(builtins.map((item) => [item.id, item]))
  const removed = new Set(removedBuiltinIds)

  const synced = existing
    .filter((item) => {
      if (!item.builtIn) return true
      if (!seedById.has(item.id)) return false
      if (removed.has(item.id)) return false
      return true
    })
    .map((item) => {
      if (!item.builtIn) return item
      const seed = seedById.get(item.id)
      if (seed === undefined) return item
      if (
        item.name === seed.name &&
        item.customCss === seed.customCss &&
        stylesEqual(item.styles, seed.styles)
      ) {
        return item
      }
      return {
        ...item,
        name: seed.name,
        styles: seed.styles,
        customCss: seed.customCss,
        builtIn: true,
        updatedAt: seed.updatedAt,
      }
    })

  const existingIds = new Set(synced.map((item) => item.id))
  const missing = builtins.filter(
    (item) => !existingIds.has(item.id) && !removed.has(item.id),
  )
  if (missing.length === 0) return synced

  let lastBuiltinIndex = -1
  for (let i = 0; i < synced.length; i += 1) {
    if (synced[i].builtIn) lastBuiltinIndex = i
  }
  if (lastBuiltinIndex < 0) return [...missing, ...synced]
  return [
    ...synced.slice(0, lastBuiltinIndex + 1),
    ...missing,
    ...synced.slice(lastBuiltinIndex + 1),
  ]
}
