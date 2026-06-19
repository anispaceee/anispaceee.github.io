import { Pin, MessageCircle, Clock } from 'lucide-react';
import BlockRenderer from './BlockRenderer.jsx';

/**
 * 笔记卡片
 * @param {object} note - 笔记对象
 * @param {() => void} onOpen - 打开笔记
 */
export default function CreativeNoteCard({ note, onOpen }) {
  const previewBlocks = (note.blocks || []).slice(0, 3);
  const tagCount = (note.tags || []).length;
  const blockCount = (note.blocks || []).length;

  return (
    <div className={`cs-note-card ${note.is_pinned ? 'pinned' : ''}`} onClick={onOpen}>
      <div className="cs-note-card-header">
        {note.is_pinned ? <Pin size={12} className="cs-pin-icon" /> : null}
        <span className="cs-note-card-title">{note.title || '无标题'}</span>
      </div>
      <div className="cs-note-card-preview">
        {previewBlocks.length > 0 ? (
          previewBlocks.map((b) => <BlockRenderer key={b.id} block={b} />)
        ) : (
          <p className="cs-note-card-empty">空笔记</p>
        )}
      </div>
      <div className="cs-note-card-footer">
        <span className="cs-note-meta"><Clock size={11} /> {note.updated_at?.slice(0, 10) || ''}</span>
        <span className="cs-note-meta"><MessageCircle size={11} /> {blockCount} 块</span>
        {tagCount > 0 && <span className="cs-note-tags">{(note.tags || []).slice(0, 3).map(t => <span key={t} className="cs-note-tag">{t}</span>)}</span>}
      </div>
    </div>
  );
}
