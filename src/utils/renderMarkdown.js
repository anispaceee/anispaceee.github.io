/**
 * 公共 Markdown 渲染工具
 * 用于 Forum PostPreview 和 PostDetail 的内容渲染
 */
import { safeUrl, sanitizeHtml } from './sanitize';

export function renderMarkdown(text) {
  if (!text) return '';
  let html = sanitizeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // 图片语法 ![alt](url) 必须在链接语法之前处理
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
      safeUrl(url) ? `<img src="${safeUrl(url)}" alt="${alt}" style="max-width:100%;border-radius:8px;margin:8px 0" loading="lazy" />` : ''
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) =>
      safeUrl(url) ? `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${t}</a>` : t
    )
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br/>');
  html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
  return html;
}
