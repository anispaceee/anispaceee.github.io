import { useState } from 'react';
import { Plus, Loader2, Inbox } from 'lucide-react';
import CreativeNoteCard from './CreativeNoteCard.jsx';

/**
 * 笔记列表
 * @param {array} notes - 笔记数组
 * @param {boolean} loading - 加载中
 * @param {(note) => void} onOpen - 打开笔记
 * @param {() => void} onCreate - 新建笔记
 */
export default function CreativeNoteList({ notes, loading, onOpen, onCreate }) {
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? notes.filter(n => (n.title || '').includes(filter) || (n.tags || []).some(t => t.includes(filter)))
    : notes;

  if (loading) {
    return (
      <div className="cs-note-list-loading">
        <Loader2 size={24} className="cs-spin" />
        <span>加载中...</span>
      </div>
    );
  }

  return (
    <div className="cs-note-list">
      <div className="cs-note-list-toolbar">
        <input
          className="cs-note-search"
          type="text"
          placeholder="搜索标题或标签..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="cs-btn cs-btn-primary" onClick={onCreate}>
          <Plus size={14} /> 新建笔记
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="cs-note-list-empty">
          <Inbox size={40} />
          <p>{filter ? '没有匹配的笔记' : '还没有笔记，点击"新建笔记"开始创作'}</p>
        </div>
      ) : (
        <div className="cs-note-grid">
          {filtered.map((note) => (
            <CreativeNoteCard key={note.id} note={note} onOpen={() => onOpen(note)} />
          ))}
        </div>
      )}
    </div>
  );
}
