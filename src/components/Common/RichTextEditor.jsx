import { useRef } from 'react';
import { Bold, Italic, List, Quote, Link as LinkIcon } from 'lucide-react';

export default function RichTextEditor({ value, onChange, placeholder, disabled, rows = 4 }) {
  const textareaRef = useRef(null);

  const insertMarkdown = (prefix, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);
    const newText = value.substring(0, start) + prefix + selected + suffix + value.substring(end);
    onChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const toolbarActions = [
    { icon: <Bold size={14} />, title: '粗体', action: () => insertMarkdown('**', '**') },
    { icon: <Italic size={14} />, title: '斜体', action: () => insertMarkdown('*', '*') },
    { icon: <LinkIcon size={14} />, title: '链接', action: () => insertMarkdown('[', '](url)') },
    { icon: <List size={14} />, title: '列表', action: () => insertMarkdown('- ') },
    { icon: <Quote size={14} />, title: '引用', action: () => insertMarkdown('> ') },
  ];

  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        {toolbarActions.map((btn, i) => (
          <button key={i} className="rich-toolbar-btn" title={btn.title} type="button" onClick={btn.action} disabled={disabled}>
            {btn.icon}
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="rich-textarea"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        disabled={disabled}
      />
    </div>
  );
}
