import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Bold, Italic, Heading2, List, ListOrdered,
  Quote, Link, ImagePlus, Code,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import ImageUploader from './ImageUploader';
import { renderMarkdown } from '../../utils/renderMarkdown';
import './MarkdownEditor.css';

/**
 * 分屏预览式 Markdown 编辑器
 *
 * 左侧：Markdown 源码编辑 + 工具栏
 * 右侧：实时渲染预览（可折叠）
 *
 * @param {object} props
 * @param {string} props.value - Markdown 源码
 * @param {function} props.onChange - 源码变化回调
 * @param {string} [props.placeholder] - 占位文本
 * @param {number} [props.rows=12] - 最小行数
 */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder = '开始写作...',
  rows = 12,
}) {
  const [showPreview, setShowPreview] = useState(true);
  const [showImageUploader, setShowImageUploader] = useState(false);
  const textareaRef = useRef(null);

  // 实时渲染预览 HTML
  const previewHtml = useMemo(() => renderMarkdown(value || ''), [value]);

  // 源码输入处理
  const handleChange = useCallback((e) => {
    onChange(e.target.value);
  }, [onChange]);

  // 工具栏操作：在光标位置插入 Markdown 标记
  const insertMarkdown = useCallback((prefix, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const replacement = `${prefix}${selected || defaultText}${suffix}`;
    const newValue = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    onChange(newValue);

    // 恢复光标
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + prefix.length + (selected || defaultText).length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }, [onChange]);

  // 插入图片
  const handleImageInsert = useCallback((url) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const markdown = `![图片](${url})`;
    const start = textarea.selectionStart;
    const newValue = textarea.value.substring(0, start) + markdown + '\n' + textarea.value.substring(start);
    onChange(newValue);
    setShowImageUploader(false);
  }, [onChange]);

  // 工具栏按钮配置
  const toolbarButtons = [
    { icon: Bold, label: '粗体', action: () => insertMarkdown('**', '**', '粗体文本') },
    { icon: Italic, label: '斜体', action: () => insertMarkdown('*', '*', '斜体文本') },
    { icon: Heading2, label: '标题', action: () => insertMarkdown('## ', '', '标题') },
    { icon: List, label: '无序列表', action: () => insertMarkdown('- ', '', '列表项') },
    { icon: ListOrdered, label: '有序列表', action: () => insertMarkdown('1. ', '', '列表项') },
    { icon: Quote, label: '引用', action: () => insertMarkdown('> ', '', '引用文本') },
    { icon: Code, label: '代码', action: () => insertMarkdown('`', '`', '代码') },
    { icon: Link, label: '链接', action: () => insertMarkdown('[', '](url)', '链接文本') },
    { icon: ImagePlus, label: '图片', action: () => setShowImageUploader(true) },
  ];

  return (
    <div className="mde-wrapper">
      {/* 工具栏 */}
      <div className="mde-toolbar">
        <div className="mde-toolbar-group">
          {toolbarButtons.map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              type="button"
              className="mde-toolbar-btn"
              onClick={action}
              title={label}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
        <div className="mde-toolbar-group">
          <button
            type="button"
            className={`mde-toolbar-btn mde-mode-btn${showPreview ? ' active' : ''}`}
            onClick={() => setShowPreview(v => !v)}
            title={showPreview ? '隐藏预览' : '显示预览'}
          >
            {showPreview ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            {showPreview ? '隐藏预览' : '预览'}
          </button>
        </div>
      </div>

      {/* 编辑 + 预览区域 */}
      <div className={`mde-body${showPreview ? ' with-preview' : ''}`}>
        <textarea
          ref={textareaRef}
          className="mde-source"
          value={value || ''}
          onChange={handleChange}
          placeholder={placeholder}
          style={{ minHeight: `${rows * 24}px` }}
        />
        {showPreview && (
          <div
            className="mde-preview"
            style={{ minHeight: `${rows * 24}px` }}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>

      {/* 图片上传弹窗 */}
      {showImageUploader && (
        <div className="mde-image-overlay" onClick={() => setShowImageUploader(false)}>
          <div className="mde-image-dialog" onClick={e => e.stopPropagation()}>
            <h3>插入图片</h3>
            <ImageUploader
              value=""
              onChange={handleImageInsert}
              label="选择图片"
              variant="preview"
            />
            <button
              className="work-btn work-btn-secondary"
              onClick={() => setShowImageUploader(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
