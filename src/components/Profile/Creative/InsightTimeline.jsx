import { useState, useEffect } from 'react';
import { Clock, Star, MessageCircle, Loader2, Film, Gamepad2, BookOpen, Tv } from 'lucide-react';
import { CreativeSpaceService } from '../../../services/api.js';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const TYPE_ICON = { 1: BookOpen, 2: Film, 4: Gamepad2, 6: Tv };
const TYPE_LABEL = { 1: '书籍', 2: '动画', 4: '游戏', 6: '三次元' };

/**
 * 感悟时间线：聚合 ratings.content + subject_comments
 */
export default function InsightTimeline() {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await CreativeSpaceService.getTimeline();
        if (!cancelled) setTimeline(data.timeline || []);
      } catch (err) {
        if (!cancelled) setError(err.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = typeFilter === 'all'
    ? timeline
    : timeline.filter(t => String(t.subject_type) === typeFilter);

  if (loading) {
    return (
      <div className="cs-timeline-loading">
        <Loader2 size={24} className="cs-spin" />
        <span>加载感悟时间线...</span>
      </div>
    );
  }

  if (error) {
    return <div className="cs-timeline-error">加载失败：{error}</div>;
  }

  return (
    <div className="cs-timeline">
      <div className="cs-timeline-toolbar">
        <span className="cs-timeline-title">感悟时间线</span>
        <div className="cs-timeline-filters">
          <button className={`cs-filter-btn ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>全部</button>
          {Object.entries(TYPE_LABEL).map(([k, label]) => (
            <button key={k} className={`cs-filter-btn ${typeFilter === k ? 'active' : ''}`} onClick={() => setTypeFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="cs-timeline-empty">
          <Clock size={40} />
          <p>还没有感悟记录。去详情页写评分短评或评论吧！</p>
        </div>
      ) : (
        <div className="cs-timeline-list">
          {filtered.map((item) => {
            const Icon = TYPE_ICON[item.subject_type] || Clock;
            return (
              <div key={`${item.type}-${item.id}`} className="cs-timeline-item">
                <div className="cs-timeline-dot">
                  {item.type === 'rating' ? <Star size={12} /> : <MessageCircle size={12} />}
                </div>
                <div className="cs-timeline-content">
                  <div className="cs-timeline-item-header">
                    <img src={item.subject_image || FALLBACK_IMG} alt="" className="cs-timeline-thumb" onError={(e) => { e.target.src = FALLBACK_IMG; }} />
                    <div className="cs-timeline-meta">
                      <span className="cs-timeline-subject-name">{item.subject_name || '未知条目'}</span>
                      <span className="cs-timeline-type">
                        <Icon size={11} /> {TYPE_LABEL[item.subject_type] || '其他'}
                      </span>
                      {item.type === 'rating' && item.score && (
                        <span className="cs-timeline-score">评分 {item.score}</span>
                      )}
                    </div>
                    <span className="cs-timeline-date">{item.created_at?.slice(0, 10) || ''}</span>
                  </div>
                  <p className="cs-timeline-text">{item.content || '（无内容）'}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
