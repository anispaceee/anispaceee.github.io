import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Star, ExternalLink, Heart, Bookmark } from 'lucide-react';
import './CommonComponents.css';

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-cover shimmer" />
      <div className="skeleton-body">
        <div className="skeleton-line w80 shimmer" />
        <div className="skeleton-line w60 shimmer" />
        <div className="skeleton-line w40 shimmer" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="skeleton-row">
      <div className="skeleton-avatar shimmer" />
      <div className="skeleton-lines">
        <div className="skeleton-line w70 shimmer" />
        <div className="skeleton-line w50 shimmer" />
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry, compact = false }) {
  return (
    <div className={`error-state ${compact ? 'compact' : ''}`}>
      <div className="error-icon">!</div>
      <p className="error-message">{message || '加载失败'}</p>
      {onRetry && (
        <button className="error-retry-btn" onClick={onRetry}>重试</button>
      )}
    </div>
  );
}

export function OfflineBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const handleOffline = () => setShow(true);
    const handleOnline = () => setShow(false);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    if (!navigator.onLine) setShow(true);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="offline-banner">
      <span className="offline-dot" />
      网络连接已断开，部分功能可能不可用
    </div>
  );
}

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" fill="%23f9f3f5"%3E%3Crect width="300" height="300" rx="10"/%3E%3Ctext x="150" y="145" text-anchor="middle" fill="%23d4b8c0" font-size="40"%3E🌸%3C/text%3E%3Ctext x="150" y="180" text-anchor="middle" fill="%23d4b8c0" font-size="12"%3E暂无封面%3C/text%3E%3C/svg%3E';

export function LazyImage({ src, alt, className = '', fallbackSrc = '' }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!src) { setError(true); return; }
    setLoaded(false);
    setError(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && imgRef.current) {
          imgRef.current.src = src;
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '200px' }
    );
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [src]);

  return (
    <div className={`lazy-img-wrap ${className}`}>
      {!loaded && !error && <div className="lazy-img-placeholder shimmer" />}
      {error ? (
        <img src={fallbackSrc || FALLBACK_IMG} alt={alt} className="lazy-img loaded" />
      ) : (
        <img
          ref={imgRef}
          alt={alt}
          className={`lazy-img ${loaded ? 'loaded' : ''}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          src={undefined}
        />
      )}
    </div>
  );
}

export function SubjectCard({ item, type, onFavorite, isFavorited, linkTo, linkState, compact = false }) {
  const name = item.name_cn || item.nameCn || item.name || '未知标题';
  const originalName = item.name || '';
  const image = item.images?.common || item.images?.medium || item.image || '';
  const score = item.rating?.score || item.score || 0;
  const summary = item.summary || '';
  const tags = item.tags
    ? (Array.isArray(item.tags) ? item.tags.map(t => typeof t === 'string' ? t : t.name).filter(Boolean) : [])
    : [];
  const typeLabel = type === 'anime' ? '动画' : type === 'novel' ? '小说' : '游戏';
  const bangumiId = item.id;

  const content = (
    <div className="subject-card">
      <div className="subject-card-cover">
        <LazyImage
          src={image}
          alt={name}
          className="subject-card-img"
        />
        {score > 0 && <div className="subject-card-score">⭐ {Number(score).toFixed(1)}</div>}
        <span className={`subject-card-type type-${type}`}>{typeLabel}</span>
        {onFavorite && (
          <button
            className={`subject-card-fav ${isFavorited ? 'active' : ''}`}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onFavorite(bangumiId); }}
          >
            <Bookmark size={14} fill={isFavorited ? 'var(--primary)' : 'none'} />
          </button>
        )}
        <div className="subject-card-hover-title">{name}</div>
      </div>
      <div className="subject-card-body">
        <h3 className="subject-card-name" title={name}>{name}</h3>
        {!compact && originalName !== name && <p className="subject-card-original" title={originalName}>{originalName}</p>}
        {!compact && summary && <p className="subject-card-summary">{summary}</p>}
        {!compact && tags.length > 0 && (
          <div className="subject-card-tags">
            {tags.slice(0, 3).map(tag => <span key={tag} className="subject-tag">{tag}</span>)}
          </div>
        )}
        {!compact && <div className="subject-card-footer">
          <span className="subject-card-bangumi" role="button" tabIndex={0}
            onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(`https://bgm.tv/subject/${bangumiId}`, '_blank'); }}>
            <ExternalLink size={11} /> Bangumi
          </span>
        </div>}
      </div>
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo} state={linkState} className="subject-card-link">{content}</Link>;
  }
  return content;
}

export function LoadMoreButton({ onClick, loading, hasMore }) {
  if (!hasMore) return null;
  return (
    <div className="load-more-wrap">
      <button className="load-more-btn" onClick={onClick} disabled={loading}>
        {loading ? <span className="load-more-spinner" /> : '加载更多'}
      </button>
    </div>
  );
}

export function SectionLoader() {
  return (
    <div className="section-loader">
      <div className="section-spinner" />
      <span>雨何时停？</span>
    </div>
  );
}
