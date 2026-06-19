import { Check, Image as ImageIcon, Link2, Minus } from 'lucide-react';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

/**
 * 单块渲染组件（只读展示模式）
 * @param {object} block - 块对象 { id, type, content, checked, src, subject_id, subject_name, subject_image }
 */
export default function BlockRenderer({ block }) {
  if (!block) return null;

  switch (block.type) {
    case 'h1':
      return <h1 className="cs-block cs-block-h1">{block.content || ''}</h1>;
    case 'h2':
      return <h2 className="cs-block cs-block-h2">{block.content || ''}</h2>;
    case 'h3':
      return <h3 className="cs-block cs-block-h3">{block.content || ''}</h3>;
    case 'todo':
      return (
        <div className={`cs-block cs-block-todo ${block.checked ? 'checked' : ''}`}>
          <span className="cs-todo-checkbox">{block.checked ? <Check size={14} /> : null}</span>
          <span className="cs-todo-text">{block.content || ''}</span>
        </div>
      );
    case 'quote':
      return <blockquote className="cs-block cs-block-quote">{block.content || ''}</blockquote>;
    case 'image':
      return (
        <div className="cs-block cs-block-image">
          {block.src ? (
            <img src={block.src} alt={block.content || ''} onError={(e) => { e.target.src = FALLBACK_IMG; }} />
          ) : (
            <div className="cs-image-placeholder"><ImageIcon size={20} /> 图片占位</div>
          )}
          {block.content && <div className="cs-image-caption">{block.content}</div>}
        </div>
      );
    case 'subject-link':
      return (
        <a className="cs-block cs-block-subject-link" href={`#/subject/${block.subject_id}`} target="_blank" rel="noreferrer">
          <img src={block.subject_image || FALLBACK_IMG} alt="" className="cs-subject-thumb" onError={(e) => { e.target.src = FALLBACK_IMG; }} />
          <div className="cs-subject-info">
            <Link2 size={12} />
            <span className="cs-subject-name">{block.subject_name || '未知条目'}</span>
          </div>
        </a>
      );
    case 'divider':
      return <hr className="cs-block cs-block-divider" />;
    case 'text':
    default:
      return <p className="cs-block cs-block-text">{block.content || ''}</p>;
  }
}
