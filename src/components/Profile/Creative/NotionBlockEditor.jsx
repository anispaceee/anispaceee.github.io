import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, GripVertical, Trash2, Copy, Image as ImageIcon, Upload, Search, X, Loader2 } from 'lucide-react';
import { StorageService, BangumiAuthService } from '../../../services/api.js';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const BLOCK_TYPES = [
  { key: 'text', label: '文本', prefix: '' },
  { key: 'h1', label: '标题1', prefix: '# ' },
  { key: 'h2', label: '标题2', prefix: '## ' },
  { key: 'h3', label: '标题3', prefix: '### ' },
  { key: 'todo', label: '待办', prefix: '[] ' },
  { key: 'quote', label: '引用', prefix: '> ' },
  { key: 'divider', label: '分割线', prefix: '---' },
  { key: 'image', label: '图片', prefix: '/img' },
  { key: 'subject-link', label: '条目', prefix: '/subject' },
];

function genId() {
  return 'block-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** 根据输入内容前缀推断块类型转换 */
function detectTypeConversion(content) {
  if (content.startsWith('### ')) return { type: 'h3', content: content.slice(4) };
  if (content.startsWith('## ')) return { type: 'h2', content: content.slice(3) };
  if (content.startsWith('# ')) return { type: 'h1', content: content.slice(2) };
  if (content.startsWith('[] ')) return { type: 'todo', content: content.slice(3), checked: false };
  if (content.startsWith('> ')) return { type: 'quote', content: content.slice(2) };
  if (content === '---') return { type: 'divider', content: '' };
  return null;
}

/**
 * Notion 式块编辑器
 * @param {object} note - { id, title, blocks }
 * @param {(patch) => void} onChange - 内容变更回调（debounce 自动保存由父组件处理）
 */
export default function NotionBlockEditor({ note, onChange }) {
  const [title, setTitle] = useState(note?.title || '');
  const [blocks, setBlocks] = useState(note?.blocks || []);
  const [focusedId, setFocusedId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [uploadingId, setUploadingId] = useState(null); // 正在上传的图片块ID
  const [searchOpenId, setSearchOpenId] = useState(null); // 搜索弹窗打开的条目块ID
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const editorRef = useRef(null);
  const blockRefs = useRef({});
  const fileInputRef = useRef(null);

  // 同步外部 note 变更（切换笔记时）
  useEffect(() => {
    setTitle(note?.title || '');
    setBlocks(note?.blocks && note.blocks.length > 0 ? note.blocks : [{ id: genId(), type: 'text', content: '' }]);
  }, [note?.id]);

  // 通知父组件变更
  const emitChange = useCallback((newTitle, newBlocks) => {
    onChange?.({ title: newTitle, blocks: newBlocks });
  }, [onChange]);

  const updateBlock = useCallback((id, patch) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, ...patch } : b);
      emitChange(title, next);
      return next;
    });
  }, [title, emitChange]);

  const addBlockAfter = useCallback((id, type = 'text') => {
    const newBlock = { id: genId(), type, content: '' };
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      const next = idx >= 0 ? [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)] : [...prev, newBlock];
      emitChange(title, next);
      return next;
    });
    setTimeout(() => {
      blockRefs.current[newBlock.id]?.focus();
      setFocusedId(newBlock.id);
    }, 0);
  }, [title, emitChange]);

  const deleteBlock = useCallback((id) => {
    setBlocks(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(b => b.id !== id);
      emitChange(title, next);
      return next;
    });
  }, [title, emitChange]);

  const duplicateBlock = useCallback((id) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: genId() };
      const next = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      emitChange(title, next);
      return next;
    });
  }, [title, emitChange]);

  const mergeWithPrev = useCallback((id) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx <= 0) return prev;
      const prevBlock = prev[idx - 1];
      const curBlock = prev[idx];
      if (prevBlock.type !== 'text' && prevBlock.type !== 'todo') return prev;
      const merged = { ...prevBlock, content: (prevBlock.content || '') + (curBlock.content || ''), type: prevBlock.type === 'todo' ? 'text' : prevBlock.type };
      delete merged.checked;
      const next = [...prev.slice(0, idx - 1), merged, ...prev.slice(idx + 1)];
      emitChange(title, next);
      setTimeout(() => {
        const el = blockRefs.current[merged.id];
        if (el) {
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }, 0);
      return next;
    });
  }, [title, emitChange]);

  const moveBlock = useCallback((fromId, toId) => {
    setBlocks(prev => {
      const fromIdx = prev.findIndex(b => b.id === fromId);
      const toIdx = prev.findIndex(b => b.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      emitChange(title, next);
      return next;
    });
  }, [title, emitChange]);

  const convertBlockType = useCallback((id, type) => {
    setBlocks(prev => {
      const next = prev.map(b => {
        if (b.id !== id) return b;
        const updated = { ...b, type };
        if (type === 'todo') updated.checked = b.checked || false;
        if (type === 'divider') updated.content = '';
        if (type === 'image' && !updated.src) updated.src = '';
        if (type === 'subject-link' && !updated.subject_id) { updated.subject_id = 0; updated.subject_name = ''; updated.subject_image = ''; }
        return updated;
      });
      emitChange(title, next);
      return next;
    });
    setMenuOpenId(null);
  }, [title, emitChange]);

  const handleBlockInput = useCallback((id, e) => {
    const text = e.currentTarget.textContent;
    const block = blocks.find(b => b.id === id);
    if (!block) return;
    // 检测快捷输入转换
    const conversion = detectTypeConversion(text);
    if (conversion && block.type === 'text') {
      updateBlock(id, conversion);
      setTimeout(() => {
        const el = blockRefs.current[id];
        if (el) {
          el.textContent = conversion.content || '';
          el.focus();
        }
      }, 0);
      return;
    }
    updateBlock(id, { content: text });
  }, [blocks, updateBlock]);

  const handleKeyDown = useCallback((id, e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addBlockAfter(id, 'text');
    } else if (e.key === 'Backspace') {
      const text = e.currentTarget.textContent;
      if (text === '') {
        e.preventDefault();
        mergeWithPrev(id);
      }
    }
  }, [addBlockAfter, mergeWithPrev]);

  const handleTitleChange = useCallback((e) => {
    const v = e.target.value;
    setTitle(v);
    emitChange(v, blocks);
  }, [blocks, emitChange]);

  // 图片上传
  const handleImageUpload = useCallback(async (blockId, file) => {
    if (!file) return;
    setUploadingId(blockId);
    try {
      const result = await StorageService.uploadImage(file);
      if (result.url) {
        updateBlock(blockId, { src: result.url });
      }
    } catch (err) {
      console.error('上传失败:', err);
      alert('上传失败: ' + err.message);
    } finally {
      setUploadingId(null);
    }
  }, [updateBlock]);

  const triggerFileInput = useCallback((blockId) => {
    fileInputRef.current?.click();
    // 存储当前块ID以便上传时使用
    fileInputRef.current.dataset.blockId = blockId;
  }, []);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    const blockId = fileInputRef.current?.dataset?.blockId;
    if (file && blockId) {
      handleImageUpload(blockId, file);
    }
    // 清空input以便再次选择
    e.target.value = '';
  }, [handleImageUpload]);

  // 条目搜索
  const handleSubjectSearch = useCallback(async (keyword) => {
    if (!keyword.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const result = await BangumiAuthService.searchSubjects(keyword, 0, 10, 0);
      setSearchResults(result.list || []);
    } catch (err) {
      console.error('搜索失败:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const selectSubject = useCallback((subject) => {
    if (searchOpenId) {
      updateBlock(searchOpenId, {
        subject_id: subject.id,
        subject_name: subject.name,
        subject_image: subject.images?.medium || subject.image || '',
      });
      setSearchOpenId(null);
      setSearchKeyword('');
      setSearchResults([]);
    }
  }, [searchOpenId, updateBlock]);

  // 拖拽
  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (toId) => {
    if (dragId && dragId !== toId) moveBlock(dragId, toId);
    setDragId(null);
  };

  const renderEditableBlock = (block) => {
    if (block.type === 'divider') {
      return <hr className="cs-block cs-block-divider" />;
    }
    if (block.type === 'image') {
      return (
        <div className="cs-block cs-block-image-edit">
          {block.src ? (
            <img src={block.src} alt="" onError={(e) => { e.target.src = FALLBACK_IMG; }} />
          ) : (
            <div className="cs-image-placeholder">
              <ImageIcon size={20} />
              <span>点击上传或粘贴图片 URL</span>
            </div>
          )}
          <div className="cs-image-actions">
            <input
              type="text"
              className="cs-image-url-input"
              placeholder="图片 URL"
              value={block.src || ''}
              onChange={(e) => updateBlock(block.id, { src: e.target.value })}
            />
            <button
              className="cs-btn cs-btn-ghost cs-btn-small"
              onClick={() => triggerFileInput(block.id)}
              disabled={uploadingId === block.id}
              title="上传图片"
            >
              {uploadingId === block.id ? <Loader2 size={12} className="cs-spin" /> : <Upload size={12} />}
            </button>
          </div>
        </div>
      );
    }
    if (block.type === 'subject-link') {
      return (
        <div className="cs-block cs-block-subject-link-edit">
          <div className="cs-subject-link-preview">
            {block.subject_image && (
              <img src={block.subject_image} alt="" className="cs-subject-thumb" onError={(e) => { e.target.src = FALLBACK_IMG; }} />
            )}
            <span className="cs-subject-name-preview">{block.subject_name || '未选择条目'}</span>
          </div>
          <div className="cs-subject-link-actions">
            <input
              type="number"
              placeholder="条目 ID"
              value={block.subject_id || ''}
              onChange={(e) => updateBlock(block.id, { subject_id: Number(e.target.value) || 0 })}
              className="cs-subject-id-input"
            />
            <button
              className="cs-btn cs-btn-ghost cs-btn-small"
              onClick={() => setSearchOpenId(block.id)}
              title="搜索条目"
            >
              <Search size={12} />
            </button>
          </div>
        </div>
      );
    }
    if (block.type === 'todo') {
      return (
        <div className="cs-block cs-block-todo-edit">
          <button
            className={`cs-todo-checkbox ${block.checked ? 'checked' : ''}`}
            onClick={() => updateBlock(block.id, { checked: !block.checked })}
          >
            {block.checked ? '✓' : ''}
          </button>
          <div
            ref={(el) => { blockRefs.current[block.id] = el; }}
            className={`cs-block-editable cs-block-todo-text ${block.checked ? 'checked' : ''}`}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => handleBlockInput(block.id, e)}
            onKeyDown={(e) => handleKeyDown(block.id, e)}
            onFocus={() => setFocusedId(block.id)}
            data-placeholder="待办事项..."
          />
        </div>
      );
    }
    // text / h1 / h2 / h3 / quote
    const className = `cs-block-editable cs-block-${block.type}-edit`;
    const placeholder = { h1: '标题1', h2: '标题2', h3: '标题3', quote: '引用内容', text: '输入文字，或使用 # ## [] > 等快捷输入' }[block.type] || '';
    return (
      <div
        ref={(el) => { blockRefs.current[block.id] = el; }}
        className={className}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => handleBlockInput(block.id, e)}
        onKeyDown={(e) => handleKeyDown(block.id, e)}
        onFocus={() => setFocusedId(block.id)}
        data-placeholder={placeholder}
      />
    );
  };

  return (
    <div className="cs-editor" ref={editorRef}>
      {/* 隐藏的文件上传input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      
      {/* 条目搜索弹窗 */}
      {searchOpenId && (
        <div className="cs-search-modal">
          <div className="cs-search-modal-header">
            <Search size={14} /> 搜索条目
            <button className="cs-search-close" onClick={() => { setSearchOpenId(null); setSearchKeyword(''); setSearchResults([]); }}>
              <X size={14} />
            </button>
          </div>
          <div className="cs-search-input-wrap">
            <input
              type="text"
              placeholder="输入条目名称..."
              value={searchKeyword}
              onChange={(e) => { setSearchKeyword(e.target.value); handleSubjectSearch(e.target.value); }}
              autoFocus
            />
            {searchLoading && <Loader2 size={14} className="cs-spin" />}
          </div>
          <div className="cs-search-results">
            {searchResults.length === 0 && !searchLoading && searchKeyword && (
              <div className="cs-search-empty">没有找到结果</div>
            )}
            {searchResults.map((s) => (
              <div key={s.id} className="cs-search-item" onClick={() => selectSubject(s)}>
                <img src={s.images?.medium || s.image || FALLBACK_IMG} alt="" className="cs-search-thumb" onError={(e) => { e.target.src = FALLBACK_IMG; }} />
                <div className="cs-search-info">
                  <span className="cs-search-name">{s.name}</span>
                  <span className="cs-search-meta">{s.type_name || ''} · {s.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <input
        className="cs-editor-title"
        type="text"
        placeholder="无标题"
        value={title}
        onChange={handleTitleChange}
      />
      <div className="cs-editor-blocks">
        {blocks.map((block) => (
          <div
            key={block.id}
            className={`cs-editor-block-row ${focusedId === block.id ? 'focused' : ''}`}
            draggable
            onDragStart={() => handleDragStart(block.id)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(block.id)}
          >
            <div className="cs-block-controls">
              <button className="cs-block-add" onClick={() => addBlockAfter(block.id, 'text')} title="在下方添加块">
                <Plus size={14} />
              </button>
              <span className="cs-block-grip" title="拖拽排序">
                <GripVertical size={14} />
              </span>
            </div>
            <div className="cs-block-content">
              {renderEditableBlock(block)}
            </div>
            <div className="cs-block-menu">
              <button className="cs-block-menu-btn" onClick={() => setMenuOpenId(menuOpenId === block.id ? null : block.id)} title="块菜单">
                ⋮
              </button>
              {menuOpenId === block.id && (
                <div className="cs-block-menu-dropdown">
                  <div className="cs-menu-section">
                    <div className="cs-menu-label">转换为</div>
                    {BLOCK_TYPES.map(t => (
                      <button key={t.key} className="cs-menu-item" onClick={() => convertBlockType(block.id, t.key)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="cs-menu-divider" />
                  <button className="cs-menu-item" onClick={() => { duplicateBlock(block.id); setMenuOpenId(null); }}>
                    <Copy size={12} /> 复制
                  </button>
                  <button className="cs-menu-item danger" onClick={() => { deleteBlock(block.id); setMenuOpenId(null); }}>
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
