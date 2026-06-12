import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bold, Italic, Link as LinkIcon, List, ListOrdered, Quote, Heading2, Image as ImageIcon, Eye, EyeOff, X, Send, Loader2 } from 'lucide-react';
import { NewsService } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import './NewsZone.css';

const CATEGORIES = ['业界动态', '新番导视', '热门推荐', '新作发售', 'Gal档案', '每周速报'];

export default function NewsEditor() {
  const navigate = useNavigate();
  const { isAuthenticated, openAuth } = useApp();
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('业界动态');
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');
  const [cover, setCover] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [images, setImages] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCoverPreview(ev.target.result);
      setCover(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (images.length + files.length > 10) {
      alert('最多上传10张图片');
      return;
    }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImages(prev => {
          if (prev.length >= 10) return prev;
          const newImages = [...prev, ev.target.result];
          // 自动插入 Markdown 图片语法
          const imgMd = `\n![${file.name}](${ev.target.result})\n`;
          setContent(prev => prev + imgMd);
          return newImages;
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const insertMarkdown = (before, after = '', defaultText = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end) || defaultText;
    const newText = content.substring(0, start) + before + selected + after + content.substring(end);
    setContent(newText);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = start + before.length + selected.length + after.length;
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      openAuth();
      return;
    }
    if (!title.trim()) {
      alert('请填写文章标题');
      return;
    }
    if (!content.trim()) {
      alert('请填写文章内容');
      return;
    }
    setSubmitting(true);
    try {
      await NewsService.createNews({
        type: 'article',
        title: title.trim(),
        source: source.trim() || '原创',
        category,
        content,
        cover: cover || '',
        images,
      });
      navigate('/news');
    } catch (err) {
      alert(err.message || '发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="news-zone">
      <div className="news-editor-page">
        {/* 顶部工具栏 */}
        <div className="news-editor-topbar">
          <button className="news-editor-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} /> 返回
          </button>
          <div className="news-editor-topbar-actions">
            <button
              className={`news-editor-preview-toggle ${showPreview ? 'active' : ''}`}
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
              {showPreview ? '编辑' : '预览'}
            </button>
            <button
              className="news-editor-publish"
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !content.trim()}
            >
              {submitting ? <Loader2 size={14} className="spinning" /> : <Send size={14} />}
              {submitting ? '发布中...' : '发布文章'}
            </button>
          </div>
        </div>

        {/* 封面图 */}
        <div className="news-editor-cover-section">
          <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverUpload} />
          {coverPreview ? (
            <div className="news-editor-cover-preview">
              <img src={coverPreview} alt="封面" />
              <button className="news-editor-cover-remove" onClick={() => { setCoverPreview(''); setCover(''); }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="news-editor-cover-upload" onClick={() => coverInputRef.current?.click()}>
              <ImageIcon size={24} /> 点击添加封面图
            </div>
          )}
        </div>

        {/* 标题输入 */}
        <input
          className="news-editor-title-input"
          type="text"
          placeholder="输入文章标题..."
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={100}
        />

        {/* 元信息栏 */}
        <div className="news-editor-meta-bar">
          <select value={category} onChange={e => setCategory(e.target.value)} className="news-editor-category-select">
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="来源（可选，默认原创）"
            value={source}
            onChange={e => setSource(e.target.value)}
            className="news-editor-source-input"
          />
        </div>

        {/* 编辑器主体 */}
        <div className="news-editor-body">
          {/* 工具栏 */}
          {!showPreview && (
            <div className="news-editor-toolbar">
              <button onClick={() => insertMarkdown('### ', '', '标题')} title="标题"><Heading2 size={16} /></button>
              <button onClick={() => insertMarkdown('**', '**', '粗体')} title="粗体"><Bold size={16} /></button>
              <button onClick={() => insertMarkdown('*', '*', '斜体')} title="斜体"><Italic size={16} /></button>
              <button onClick={() => insertMarkdown('[', '](url)', '链接文字')} title="链接"><LinkIcon size={16} /></button>
              <button onClick={() => insertMarkdown('- ', '', '列表项')} title="无序列表"><List size={16} /></button>
              <button onClick={() => insertMarkdown('1. ', '', '列表项')} title="有序列表"><ListOrdered size={16} /></button>
              <button onClick={() => insertMarkdown('> ', '', '引用')} title="引用"><Quote size={16} /></button>
              <button onClick={() => insertMarkdown('---\n', '', '')} title="分割线">—</button>
              <button onClick={() => fileInputRef.current?.click()} title="上传图片"><ImageIcon size={16} /></button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageUpload} />
            </div>
          )}

          {/* 编辑/预览区域 */}
          {showPreview ? (
            <div className="news-editor-preview">
              <MarkdownRenderer content={content} />
              {!content && <p style={{ color: 'var(--text-quaternary)', textAlign: 'center', padding: 40 }}>暂无内容，切换回编辑模式开始写作</p>}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="news-editor-textarea"
              placeholder="开始写作... 支持 Markdown 语法"
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          )}
        </div>

        {/* 已上传图片 */}
        {images.length > 0 && (
          <div className="news-editor-images">
            <span className="news-editor-images-label">已上传图片：</span>
            <div className="news-editor-image-list">
              {images.map((img, idx) => (
                <div key={idx} className="news-editor-image-thumb">
                  <img src={img} alt={`图片 ${idx + 1}`} />
                  <button className="news-editor-image-remove" onClick={() => removeImage(idx)}><X size={10} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 底部字数统计 */}
        <div className="news-editor-footer">
          <span className="news-editor-wordcount">
            {content.length} 字
          </span>
        </div>
      </div>
    </div>
  );
}
