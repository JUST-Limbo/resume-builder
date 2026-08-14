/**
 * 下载浏览器内生成的文本文件。
 *
 * 用例：
 * - exportTextFile('resume.md', markdown, 'text/markdown;charset=utf-8')
 * - exportTextFile('resume.resume.json', json, 'application/json;charset=utf-8')
 */
export const exportTextFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/**
 * 将用户输入的标题转换为安全文件名。
 *
 * 用例：
 * - “林晓 / 前端简历” -> “林晓-前端简历”
 * - 空标题 -> “resume”
 */
export const toSafeFilename = (title: string) => {
  const safe = title.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-')
  return safe.length > 0 ? safe : 'resume'
}
