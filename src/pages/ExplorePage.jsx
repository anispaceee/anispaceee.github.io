import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExploreService, StorageService } from '../services/api';
import { behaviorCollector } from '../lib/BehaviorCollector';
import { sessionProfile } from '../lib/SessionProfile';
import { Tv, BookOpen, Gamepad2, Newspaper, MessageCircle, Sparkles, Loader2, RefreshCw, ChevronRight, Star, Image } from 'lucide-react';
import { SubjectCard } from '../components/Common/CommonComponents';
import './ExplorePage.css';

const CATEGORIES = [
  { key: '', label: '全部', icon: Sparkles },
  { key: 'anime', label: '动画', icon: Tv },
  { key: 'novel', label: '小说', icon: BookOpen },
  { key: 'game', label: '游戏', icon: Gamepad2 },
  { key: 'post', label: '帖子', icon: MessageCircle },
  { key: 'news', label: '资讯', icon: Newspaper },
];

const TYPE_LABELS = { 1: '小说', 2: '动画', 3: '音乐', 4: '游戏', 6: '三次元' };

export default function ExplorePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef(null);
  const sentinelRef = useRef(null);

  const fetchFeed = useCallback(async (cat, pg, append = false) => {
    setLoading(true);
    try {
      const data = await ExploreService.getFeed(cat, pg);
      const newItems = data.items || [];
      setItems(prev => append ? [...prev, ...newItems] : newItems);
      setHasMore(data.has_more || false);
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    behaviorCollector.trackPageEnter('explore');
    sessionProfile.trackAction('page_enter', 0, { page: 'explore' });
    setPage(1);
    setItems([]);
    fetchFeed(category, 1);
    return () => behaviorCollector.trackPageLeave();
  }, [category, fetchFeed]);

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchFeed(category, nextPage, true);
      }
    }, { threshold: 0.1 });
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, page, category, fetchFeed]);

  const handleItemClick = (item) => {
    if (item.item_type === 'subject') {
      const typeKey = item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime';
      behaviorCollector.trackRecommendClick(item.subject_id, 'explore', 0, 'feed', typeKey);
      sessionProfile.trackAction('view_subject', item.subject_id, { type: typeKey });
      navigate(`/info/${typeKey}/${item.subject_id}`);
    } else if (item.item_type === 'post') {
      behaviorCollector.trackViewPost(item.post_id);
      navigate(`/forum/post/${item.post_id}`);
    } else if (item.item_type === 'news') {
      behaviorCollector.trackNewsClick(item.news_id);
      navigate(`/news/${item.news_id}`);
    } else if (item.item_type === 'work') {
      navigate(`/musashi/${item.work_id}`);
    }
  };

  const renderItem = (item, index) => {
    if (item.item_type === 'subject') {
      const images = typeof item.images === 'string' ? JSON.parse(item.images || '{}') : (item.images || {});
      const cover = images.large || images.common || images.medium || '';
      const tags = typeof item.tags === 'string' ? JSON.parse(item.tags || '[]') : (item.tags || []);
      return (
        <div key={`s-${item.subject_id}-${index}`} className="explore-card" onClick={() => handleItemClick(item)}>
          {cover ? <img src={cover} alt="" className="explore-card-cover" loading="lazy" onError={e => { e.target.style.display = 'none'; }} /> : <div className="explore-card-cover-placeholder"><Image size={24} /></div>}
          <div className="explore-card-info">
            <span className="explore-card-name">{item.name_cn || item.name}</span>
            <div className="explore-card-meta">
              {item.score > 0 && <span className="explore-card-score"><Star size={10} /> {item.score.toFixed(1)}</span>}
              <span className="explore-card-type">{TYPE_LABELS[item.type] || ''}</span>
            </div>
            {tags.length > 0 && (
              <div className="explore-card-tags">
                {tags.slice(0, 3).map((t, i) => <span key={i} className="explore-card-tag">{typeof t === 'string' ? t : t.name}</span>)}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (item.item_type === 'post') {
      return (
        <div key={`p-${item.post_id}-${index}`} className="explore-card explore-card-post" onClick={() => handleItemClick(item)}>
          <div className="explore-card-info">
            <span className="explore-card-name">{item.title}</span>
            <div className="explore-card-meta">
              {item.author && <span className="explore-card-author">@{item.author}</span>}
              {item.like_count > 0 && <span className="explore-card-likes">♥ {item.like_count}</span>}
            </div>
            {item.content && <p className="explore-card-excerpt">{item.content}</p>}
          </div>
          <ChevronRight size={14} className="explore-card-arrow" />
        </div>
      );
    }

    if (item.item_type === 'news') {
      return (
        <div key={`n-${item.news_id}-${index}`} className="explore-card explore-card-news" onClick={() => handleItemClick(item)}>
          {item.cover_url && <img src={item.cover_url} alt="" className="explore-card-cover-sm" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
          <div className="explore-card-info">
            <span className="explore-card-name">{item.title}</span>
            <div className="explore-card-meta">
              {item.source && <span className="explore-card-source">{item.source}</span>}
            </div>
          </div>
          <ChevronRight size={14} className="explore-card-arrow" />
        </div>
      );
    }

    if (item.item_type === 'work') {
      return (
        <div key={`w-${item.work_id}-${index}`} className="explore-card explore-card-work" onClick={() => handleItemClick(item)}>
          {item.cover_url && <img src={item.cover_url} alt="" className="explore-card-cover-sm" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
          <div className="explore-card-info">
            <span className="explore-card-name">{item.title}</span>
            <div className="explore-card-meta">
              {item.author_name && <span className="explore-card-author">@{item.author_name}</span>}
              {item.work_type && <span className="explore-card-type">{item.work_type}</span>}
            </div>
          </div>
          <ChevronRight size={14} className="explore-card-arrow" />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="explore-page">
      <div className="explore-header">
        <h2><Sparkles size={20} /> 探索</h2>
        <p className="explore-subtitle">发现你感兴趣的内容</p>
      </div>

      <div className="explore-tabs">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              className={`explore-tab ${category === cat.key ? 'active' : ''}`}
              onClick={() => setCategory(cat.key)}
            >
              <Icon size={14} /> {cat.label}
            </button>
          );
        })}
      </div>

      <div className="explore-grid">
        {items.map((item, index) => renderItem(item, index))}
      </div>

      {loading && (
        <div className="explore-loading">
          <Loader2 size={20} className="explore-spinner" /> 加载中...
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="explore-empty">
          <Sparkles size={32} />
          <p>暂无内容，换个分类看看？</p>
        </div>
      )}

      <div ref={sentinelRef} className="explore-sentinel" />
    </div>
  );
}
