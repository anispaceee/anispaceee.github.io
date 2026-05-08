import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Bold, Italic, Underline, Link as LinkIcon, Image as ImageIcon, Code, List, ListOrdered, Heading1, Heading2, Heading3, Quote, Minus, Smile, Eye, EyeOff, Type, Superscript } from 'lucide-react';
import './MarkdownEditor.css';

const EMOJIS = ['😊','😂','🥰','😎','🤔','😅','😍','🥺','😭','😤','👍','❤️','🎉','✨','🌟','💫','🎵','🎮','📺','🎬','🌸','🎀','🐱','🐰','🦊','🐻','🐨','🐼','💖','💗','💕','🔥','⭐','💎','🎪','🎨','🎭','🎬','🎤','🎧','🎸','🎹','🎺','🎻','🎬','🏆','🥇','🎯','🎲','🧩','🔮','🪄','🧸','🍬','🍭','🍰','🎂','🍩','🍪','🧁','🍫','☕','🍵','🥤','🧃','🍓','🍒','🍑','🍊','🍋','🍇','🍉','🥝'];

function parseMarkdown(text) {
  if (!text) return '';
  let html = text;
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="md-code-block"><code class="lang-${lang || 'text'}">${code.trim()}</code></pre>`
  );
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) =>
    `<div class="md-math-block">${formula.trim()}</div>`
  );
  html = html.replace(/\$([^$\n]+)\$/g, (_, formula) =>
    `<span class="md-math-inline">${formula.trim()}</span>`
  );

  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<u>$1</u>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="md-img" src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-link" href="$2" target="_blank" rel="noopener">$1</a>');

  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

  html = html.replace(/^(\d+)\. (.+)$/gm, '<div class="md-ol-item"><span class="md-ol-num">$1.</span> $2</div>');
  html = html.replace(/^[\-\*] (.+)$/gm, '<div class="md-ul-item">• $1</div>');

  html = html.replace(/^---$/gm, '<hr class="md-hr"/>');

  html = html.replace(/\n/g, '<br/>');

  html = html.replace(/<br\/><h/g, '<h');
  html = html.replace(/<\/h([123])><br\/>/g, '</h$1>');
  html = html.replace(/<br\/><hr/g, '<hr');
  html = html.replace(/<hr class="md-hr"\/><br\/>/g, '<hr class="md-hr"/>');
  html = html.replace(/<br\/><pre/g, '<pre');
  html = html.replace(/<\/pre><br\/>/g, '</pre>');
  html = html.replace(/<br\/><blockquote/g, '<blockquote');
  html = html.replace(/<\/blockquote><br\/>/g, '</blockquote>');
  html = html.replace(/<br\/><div class="md-/g, '<div class="md-');
  html = html.replace(/<\/div><br\/>/g, '</div>');

  return html;
}

export function MarkdownRenderer({ content, className = '' }) {
  const html = useMemo(() => parseMarkdown(content), [content]);
  return <div className={`md-rendered ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function MarkdownEditor({ value, onChange, placeholder = '支持 Markdown 语法，输入 $公式$ 渲染数学公式...', height = 300, compact = false }) {
  const [showPreview, setShowPreview] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef(null);

  const insertText = useCallback((before, after = '', defaultText = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.substring(start, end) || defaultText;
    const newText = value.substring(0, start) + before + selected + after + value.substring(end);
    onChange(newText);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = start + before.length + selected.length + after.length;
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  }, [value, onChange]);

  const toolbarActions = useMemo(() => [
    { icon: <Heading1 size={14} />, action: () => insertText('# ', ''), title: '一级标题' },
    { icon: <Heading2 size={14} />, action: () => insertText('## ', ''), title: '二级标题' },
    { icon: <Heading3 size={14} />, action: () => insertText('### ', ''), title: '三级标题' },
    { icon: <Bold size={14} />, action: () => insertText('**', '**', '粗体'), title: '粗体' },
    { icon: <Italic size={14} />, action: () => insertText('*', '*', '斜体'), title: '斜体' },
    { icon: <Underline size={14} />, action: () => insertText('__', '__', '下划线'), title: '下划线' },
    { icon: <LinkIcon size={14} />, action: () => insertText('[', '](url)', '链接文字'), title: '链接' },
    { icon: <ImageIcon size={14} />, action: () => insertText('![', '](url)', '图片描述'), title: '图片' },
    { icon: <Code size={14} />, action: () => insertText('`', '`', '代码'), title: '行内代码' },
    { icon: <Type size={14} />, action: () => insertText('```\n', '\n```', '代码块'), title: '代码块' },
    { icon: <List size={14} />, action: () => insertText('- ', '', '列表项'), title: '无序列表' },
    { icon: <ListOrdered size={14} />, action: () => insertText('1. ', '', '列表项'), title: '有序列表' },
    { icon: <Quote size={14} />, action: () => insertText('> ', '', '引用'), title: '引用' },
    { icon: <Minus size={14} />, action: () => insertText('\n---\n', ''), title: '分隔线' },
    { icon: <Superscript size={14} />, action: () => insertText('$', '$', 'x^2'), title: '数学公式' },
    { icon: <Smile size={14} />, action: () => setShowEmoji(!showEmoji), title: '表情' },
  ], [insertText, showEmoji]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      insertText('  ', '');
    }
  }, [insertText]);

  const insertEmoji = useCallback((emoji) => {
    insertText(emoji, '');
    setShowEmoji(false);
  }, [insertText]);

  return (
    <div className={`md-editor ${compact ? 'md-editor-compact' : ''}`}>
      <div className="md-toolbar">
        <div className="md-toolbar-actions">
          {toolbarActions.map((item, i) => (
            <button key={i} className="md-toolbar-btn" onClick={item.action} title={item.title} type="button">
              {item.icon}
            </button>
          ))}
        </div>
        <button className={`md-preview-toggle ${showPreview ? 'active' : ''}`} onClick={() => setShowPreview(!showPreview)} title="预览">
          {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
          {showPreview ? '编辑' : '预览'}
        </button>
      </div>

      {showEmoji && (
        <div className="md-emoji-picker">
          {EMOJIS.map(e => (
            <button key={e} className="md-emoji-btn" onClick={() => insertEmoji(e)} type="button">{e}</button>
          ))}
        </div>
      )}

      <div className="md-content">
        {showPreview ? (
          <div className="md-preview" style={{ minHeight: height }}>
            <MarkdownRenderer content={value} />
            {!value && <p className="md-preview-empty">暂无内容</p>}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="md-textarea"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{ minHeight: height }}
          />
        )}
      </div>
    </div>
  );
}
