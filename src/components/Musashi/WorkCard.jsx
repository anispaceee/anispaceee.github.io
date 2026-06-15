import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Star } from 'lucide-react';
import './WorkCard.css';

const TYPE_CONFIG = {
  illustration: { label: '插画', color: '#ff6b9d' },
  galgame: { label: 'Galgame', color: '#ff9f43' },
  novel:   { label: '小说',   color: '#9b59b6' },
  manga:   { label: '漫画',   color: '#00a1d6' },
};

const STATUS_MAP = {
  completed: '已完结',
  hiatus: '搁置',
};

export default function WorkCard({ work }) {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    navigate(`/musashi/${work.id}`);
  }, [navigate, work.id]);

  const typeInfo = TYPE_CONFIG[work.type] || { label: work.type, color: '#999' };
  const statusLabel = work.status && work.status !== 'ongoing' ? STATUS_MAP[work.status] || work.status : null;

  return (
    <div className="wc-card" onClick={handleClick}>
      <div className="wc-cover">
        {work.cover_image ? (
          <img src={work.cover_image} alt={work.title} loading="lazy" />
        ) : (
          <div className="wc-cover-placeholder">
            <span>{(work.title || '?')[0]}</span>
          </div>
        )}

        <span className="wc-type-badge" style={{ background: typeInfo.color }}>
          {typeInfo.label}
        </span>

        {statusLabel && (
          <span className="wc-status-badge">{statusLabel}</span>
        )}
      </div>

      <div className="wc-info">
        <h3 className="wc-title">{work.title}</h3>

        <div className="wc-meta">
          <span className="wc-author">{work.author_name || '匿名'}</span>
          <span className="wc-views">
            <Eye size={12} />
            {work.view_count ?? 0}
          </span>
          {work.rating_count > 0 && (
            <span className="wc-rating">
              <Star size={12} fill="#f59e0b" color="#f59e0b" />
              {work.rating_count > 0 ? (work.rating_sum / work.rating_count).toFixed(1) : ''}
            </span>
          )}
        </div>

        {work.tags && work.tags.length > 0 && (
          <div className="wc-tags">
            {work.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="wc-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
