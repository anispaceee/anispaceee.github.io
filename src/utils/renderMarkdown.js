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
    .replace(/^- (.+)$/gm, '<li>$1</li>');
  // 先把连续的 <li> 行合并进 <ul>，再转换换行，
  // 否则贪婪匹配会把列表项之间的普通段落一起卷进 <ul>
  html = html.replace(/(?:<li>[^\n]*<\/li>\n?)+/g, m => `<ul>${m.replace(/\n/g, '')}</ul>`);
  html = html.replace(/\n/g, '<br/>');
  return html;
}
