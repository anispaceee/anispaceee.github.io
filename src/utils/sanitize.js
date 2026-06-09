/**
 * URL 安全校验工具
 * 用于防止 Markdown/image URL 中的 javascript:/data: 等危险协议注入 (XSS)
 */

/**
 * 验证 URL 是否安全，仅允许 http: https: mailto: 协议
 * 不安全或无协议返回空字符串，防止 XSS
 */
export function safeUrl(url) {
  if (!url || typeof url !== 'string') return ''
  try {
    const u = new URL(url, 'https://placeholder.invalid/')
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return ''
    return u.toString()
  } catch {
    return ''
  }
}

/**
 * 对 HTML 内容做基本的 XSS 防护（escape < > & " '）
 * 用于非 Markdown 的纯文本渲染场景
 */
export function sanitizeHtml(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}