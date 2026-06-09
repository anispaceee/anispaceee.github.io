import { Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { BangumiService, ApiError, StorageService, UserService } from '../services/api';
import { ArrowRight, TrendingUp, MessageCircle, Flame, Eye, Heart, MessageSquare, Clock, Search, Calendar, RefreshCw, Star, ExternalLink, Shuffle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Send, Image, Smile, X, Minus, Maximize2, Sparkles, Loader2, Play, Tv, BookOpen, Gamepad2, AlertCircle, RotateCw } from 'lucide-react';
import { SubjectCard, SkeletonCard, ErrorState } from '../components/Common/CommonComponents';
import NewsZone from '../components/NewsZone/NewsZone';
import './HomePage.css';

const TYPE_OPTIONS = [
  { key: 'all', label: '全部', typeCode: 0 },
  { key: 'anime', label: '动画', typeCode: 2 },
  { key: 'novel', label: '小说', typeCode: 1 },
  { key: 'game', label: '游戏', typeCode: 4 },
];
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const PAGE_SIZE = 12;
const FALLBACK_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';
const FALLBACK_COVER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450" fill="%23f9f3f5"%3E%3Crect width="800" height="450" rx="12"/%3E%3Ctext x="400" y="215" text-anchor="middle" fill="%23d4b8c0" font-size="40"%3E🌸%3C/text%3E%3Ctext x="400" y="260" text-anchor="middle" fill="%23d4b8c0" font-size="14"%3E发现你的下一部番%3C/text%3E%3C/svg%3E';

function AvatarWithFallback({ src, alt, className }) {
  const [failed, setFailed] = useState(false);
  return <img src={failed ? FALLBACK_AVATAR : src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />;
}

function Pagination({ currentPage, totalPages, totalItems, onPageChange, loading }) {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 7;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 4) pages.push('...');
      const start = Math.max(2, currentPage - 2);
      const end = Math.min(totalPages - 1, currentPage + 2);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 3) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="home-pagination">
      <button className="page-btn nav-btn" disabled={currentPage <= 1 || loading} onClick={() => onPageChange(1)} title="首页">
        <ChevronsLeft size={14} />
      </button>
      <button className="page-btn nav-btn" disabled={currentPage <= 1 || loading} onClick={() => onPageChange(currentPage - 1)} title="上一页">
        <ChevronLeft size={14} />
      </button>
      {getPageNumbers().map((page, i) =>
        page === '...' ? (
          <span key={`ellipsis-${i}`} className="page-ellipsis">...</span>
        ) : (
          <button key={page} className={`page-btn ${currentPage === page ? 'active' : ''}`} onClick={() => onPageChange(page)} disabled={loading}>
            {page}
          </button>
        )
      )}
      <button className="page-btn nav-btn" disabled={currentPage >= totalPages || loading} onClick={() => onPageChange(currentPage + 1)} title="下一页">
        <ChevronRight size={14} />
      </button>
      <button className="page-btn nav-btn" disabled={currentPage >= totalPages || loading} onClick={() => onPageChange(totalPages)} title="末页">
        <ChevronsRight size={14} />
      </button>
      <span className="page-info">第 {currentPage}/{totalPages} 页 · 共 {totalItems} 条</span>
    </div>
  );
}

function RandomRecommendCard({ subject, loading, onRefresh }) {
  const [lastClick, setLastClick] = useState(0);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => { setCoverLoaded(false); setCoverFailed(false); }, [subject?.id]);

  const handleRefresh = () => {
    const now = Date.now();
    if (now - lastClick < 2000) return;
    setLastClick(now);
    onRefresh();
  };

  if (loading && !subject) {
    return (
      <div className="random-recommend-card">
        <div className="random-cover-skeleton shimmer" />
        <div className="random-info-skeleton">
          <div className="skeleton-line w60 shimmer" />
          <div className="skeleton-line w80 shimmer" />
          <div className="skeleton-line w40 shimmer" />
        </div>
      </div>
    );
  }

  if (!subject) return null;

  const coverUrl = subject.images?.common || subject.images?.large || subject.images?.medium || '';
  const title = subject.name_cn || subject.name || '';
  const summary = subject.summary || '';
  const score = subject.rating?.score || subject.score || 0;
  const tags = (subject.tags || []).slice(0, 3).map(t => typeof t === 'string' ? t : t.name);
  const extraTags = (subject.tags || []).length - 3;
  const typeCode = subject.type || 2;
  const typeLabel = typeCode === 1 ? '小说' : typeCode === 4 ? '游戏' : '动画';
  const TypeIcon = typeCode === 1 ? BookOpen : typeCode === 4 ? Gamepad2 : Tv;
  const linkTo = `/info/${typeCode === 1 ? 'novel' : typeCode === 4 ? 'game' : 'anime'}/${subject.id}`;

  return (
    <div className="random-recommend-card">
      <Link to={linkTo} className="random-cover-link">
        <div className="random-cover-wrap">
          {!coverLoaded && !coverFailed && <div className="random-cover-skeleton shimmer" />}
          <img
            src={coverFailed ? FALLBACK_COVER : coverUrl}
            alt={title}
            className={`random-cover ${coverLoaded ? 'loaded' : ''}`}
            onLoad={() => setCoverLoaded(true)}
            onError={() => setCoverFailed(true)}
            loading="lazy"
          />
          <div className="random-cover-overlay">
            <span className="random-type-badge"><TypeIcon size={12} /> {typeLabel}</span>
            {score > 0 && <span className="random-score-badge"><Star size={12} fill="#ffc107" /> {score.toFixed(1)}</span>}
          </div>
        </div>
      </Link>
      <div className="random-info">
        <Link to={linkTo} className="random-title">{title}</Link>
        <p className="random-summary">{summary}</p>
        <div className="random-meta">
          {tags.length > 0 && (
            <div className="random-tags">
              {tags.map((tag, i) => <span key={i} className="random-tag">{tag}</span>)}
              {extraTags > 0 && <span className="random-tag-more">+{extraTags}</span>}
            </div>
          )}
          <button className="random-refresh-btn" onClick={handleRefresh} disabled={loading} title="换一个推荐">
            {loading ? <Loader2 size={14} className="spinning" /> : <Shuffle size={14} />}
            {loading ? '加载中...' : '换一个'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const hotPosts = [...StorageService.get('acg_forum_posts', [])].sort((a, b) => b.likes - a.likes).slice(0, 6);
  const recentMessages = StorageService.get('acg_world_messages', []).slice(0, 8);

  const [randomSubject, setRandomSubject] = useState(null);
  const [randomLoading, setRandomLoading] = useState(true);

  const [animeList, setAnimeList] = useState([]);
  const [animeLoading, setAnimeLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [searchCurrentPage, setSearchCurrentPage] = useState(() => parseInt(searchParams.get('sp')) || 1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchRetryCount, setSearchRetryCount] = useState(0);

  const [activeType, setActiveType] = useState(() => searchParams.get('type') || 'anime');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(() => parseInt(searchParams.get('page')) || 1);
  const [totalItems, setTotalItems] = useState(0);

  const [calendarData, setCalendarData] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [activeWeekday, setActiveWeekday] = useState(new Date().getDay());

  const [worldMessages, setWorldMessages] = useState(recentMessages);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const [minimized, setMinimized] = useState({ hotPosts: false, world: false });

  const getCategoryLabel = (cat) => ({ game: '游戏', anime: '动画', novel: '小说', chat: '吹水' }[cat] || cat);
  const getUserById = (id) => UserService.getById(id);

  const fetchRandom = useCallback(async () => {
    setRandomLoading(true);
    try {
      const subject = await BangumiService.getRandomSubject();
      setRandomSubject(subject);
    } catch {
      setRandomSubject(null);
    } finally {
      setRandomLoading(false);
    }
  }, []);

  useEffect(() => { fetchRandom(); }, [fetchRandom]);

  useEffect(() => {
    let cancelled = false;
    async function fetchAnime() {
      try {
        const result = await BangumiService.getPopular('anime', 6, 0);
        if (!cancelled && result?.data) setAnimeList(result.data.filter(Boolean));
      } catch {} finally { if (!cancelled) setAnimeLoading(false); }
    }
    fetchAnime();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { fetchItems(1); }, [activeType]);
  useEffect(() => { fetchCalendar(); }, []);

  const fetchItems = useCallback(async (page) => {
    setLoading(true); setError(null);
    const offset = (page - 1) * PAGE_SIZE;
    try {
      const typeForApi = activeType === 'all' ? 'anime' : activeType;
      const result = await BangumiService.getPopular(typeForApi, PAGE_SIZE, offset);
      setItems((result?.data || []).filter(Boolean));
      setTotalItems(result?.total || 0);
      setCurrentPage(page);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('type', activeType);
        next.set('page', String(page));
        return next;
      }, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : '加载失败');
    } finally { setLoading(false); }
  }, [activeType, setSearchParams]);

  const fetchCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const data = await BangumiService.getCalendar();
      if (Array.isArray(data)) setCalendarData(data);
    } catch {} finally { setCalendarLoading(false); }
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const searchTotalPages = Math.max(1, Math.ceil(searchTotal / PAGE_SIZE));

  const handleSearch = useCallback(async (page = 1) => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchCurrentPage(page);
    const offset = (page - 1) * PAGE_SIZE;
    try {
      const typeCode = TYPE_OPTIONS.find(t => t.key === activeType)?.typeCode || 0;
      const result = await BangumiService.searchSubjects(searchQuery, typeCode, PAGE_SIZE, offset);
      if (result && result.list) {
        setSearchResults(result);
        setSearchTotal(result.results || result.total || 0);
        setSearchRetryCount(0);
      } else {
        setSearchResults({ list: [], results: 0 });
        setSearchTotal(0);
      }
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('q', searchQuery);
        next.set('sp', String(page));
        return next;
      }, { replace: true });
    } catch (err) {
      const errMsg = err instanceof ApiError ? err.userMessage : '搜索失败，请重试';
      setSearchError(errMsg);
      if (!searchResults) {
        setSearchResults({ list: [], results: 0 });
        setSearchTotal(0);
      }
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, activeType, setSearchParams, searchResults]);

  const handleSearchRetry = useCallback(() => {
    setSearchRetryCount(prev => prev + 1);
    handleSearch(searchCurrentPage);
  }, [handleSearch, searchCurrentPage]);

  const handleWorldSend = () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!newMessage.trim()) return;
    setWorldMessages(prev => [...prev, {
      id: Date.now(), userId: currentUser.id, content: newMessage.trim(),
      timestamp: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    }]);
    setNewMessage('');
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [worldMessages]);

  const todayCalendar = calendarData.find(d => d.weekday?.id === activeWeekday);
  const calendarItems = todayCalendar?.items || [];
  const isSearchActive = searchResults !== null;
  const toggleMinimize = (key) => setMinimized(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="home-page">
      <div className="home-container">

        <div className="home-random-section">
          <div className="home-random-header">
            <h2 className="home-section-title"><Sparkles size={18} /> 随机推荐</h2>
          </div>
          <RandomRecommendCard subject={randomSubject} loading={randomLoading} onRefresh={fetchRandom} />
        </div>

        <NewsZone />

        <div className="home-search-section">
          <div className="home-search-bar">
            <div className="home-search-input-wrap">
              <Search size={16} />
              <input type="text" placeholder="搜索动画、小说、游戏..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch(1)} />
              {searchQuery && (
                <button className="home-search-clear" onClick={() => { setSearchQuery(''); setSearchResults(null); setSearchError(null); setSearchCurrentPage(1); setSearchTotal(0); }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <button className="home-search-btn" onClick={() => handleSearch(1)} disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? <span className="btn-spinner" /> : '搜索'}
            </button>
          </div>

          {searchError && (
            <div className="home-search-error">
              <AlertCircle size={16} />
              <span>{searchError}</span>
              <button className="home-search-retry" onClick={handleSearchRetry} disabled={isSearching}>
                <RotateCw size={14} className={isSearching ? 'spinning' : ''} /> 重试
              </button>
            </div>
          )}

          {isSearchActive && searchResults?.list?.length > 0 && (
            <div className="home-search-results">
              <div className="home-search-results-header">
                <h3>搜索结果 (共 {searchTotal} 条)</h3>
                <button className="home-search-close" onClick={() => { setSearchResults(null); setSearchQuery(''); setSearchCurrentPage(1); setSearchTotal(0); setSearchError(null); }}>
                  <X size={14} /> 关闭搜索
                </button>
              </div>
              <div className="home-search-grid">
                {searchResults.list.map(item => (
                  <SubjectCard key={item.id} item={item}
                    type={item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime'}
                    linkTo={`/info/${item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime'}/${item.id}`} />
                ))}
              </div>
              <Pagination
                currentPage={searchCurrentPage}
                totalPages={searchTotalPages}
                totalItems={searchTotal}
                onPageChange={handleSearch}
                loading={isSearching}
              />
            </div>
          )}
          {isSearchActive && !searchError && searchResults?.list?.length === 0 && (
            <div className="home-search-empty">
              <Search size={32} />
              <p>未找到相关内容</p>
              <span>试试其他关键词或切换分类</span>
            </div>
          )}
        </div>

        <div className="home-calendar-section">
          <div className="home-calendar-header">
            <h2 className="home-section-title"><Calendar size={18} /> 每日放送</h2>
            <button className="home-refresh-btn" onClick={fetchCalendar} title="刷新"><RefreshCw size={14} className={calendarLoading ? 'spinning' : ''} /></button>
          </div>
          <div className="home-calendar-weekdays">
            {WEEKDAYS.map((day, i) => (
              <button key={i} className={`home-weekday-btn ${activeWeekday === i ? 'active' : ''}`} onClick={() => setActiveWeekday(i)}>{day}</button>
            ))}
          </div>
          <div className="home-calendar-grid">
            {calendarLoading ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />) :
              calendarItems.slice(0, 6).map(item => (
                <SubjectCard key={item.id} item={item} type="anime" linkTo={`/info/anime/${item.id}`} />
              ))}
          </div>
        </div>

        <div className="home-items-section">
          <div className="home-items-header">
            <div className="home-type-tabs">
              {TYPE_OPTIONS.map(opt => (
                <button key={opt.key} className={`home-type-tab ${activeType === opt.key ? 'active' : ''}`}
                  onClick={() => { setActiveType(opt.key); setCurrentPage(1); }}>{opt.label}</button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="home-items-grid">{Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => fetchItems(currentPage)} />
          ) : (
            <div className="home-items-grid">
              {items.map(item => (
                <SubjectCard key={item.id} item={item}
                  type={activeType === 'all' ? (item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime') : activeType}
                  linkTo={`/info/${activeType === 'all' ? (item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime') : activeType}/${item.id}`} />
              ))}
            </div>
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            onPageChange={fetchItems}
            loading={loading}
          />
        </div>

        <div className="home-windows">
          <div className={`home-window ${minimized.hotPosts ? 'minimized' : ''}`}>
            <div className="home-window-header">
              <h2 className="home-section-title"><Flame size={18} /> 热门帖子</h2>
              <div className="home-window-actions">
                <Link to="/forum" className="home-more-link">更多 <ArrowRight size={12} /></Link>
                <button className="home-window-toggle" onClick={() => toggleMinimize('hotPosts')}>
                  {minimized.hotPosts ? <Maximize2 size={14} /> : <Minus size={14} />}
                </button>
              </div>
            </div>
            {!minimized.hotPosts && (
              <div className="home-window-body">
                <div className="home-hot-posts">
                  {hotPosts.map((post, index) => {
                    const author = getUserById(post.userId);
                    return (
                      <Link to={`/forum/post/${post.id}`} key={post.id} className="home-hot-post">
                        <span className="home-hot-rank">{index + 1}</span>
                        <div className="home-hot-content">
                          <div className="home-hot-top">
                            <span className={`home-post-cat ${post.category}`}>{getCategoryLabel(post.category)}</span>
                            <span className="home-hot-title">{post.title}</span>
                          </div>
                          <div className="home-hot-meta">
                            <span className="home-hot-author">
                              <AvatarWithFallback src={author?.avatar} alt={author?.name} className="home-hot-avatar" />
                              {author?.name}
                            </span>
                            <div className="home-hot-stats">
                              <span><Heart size={11} /> {post.likes}</span>
                              <span><MessageSquare size={11} /> {post.replies}</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className={`home-window home-world-window ${minimized.world ? 'minimized' : ''}`}>
            <div className="home-window-header">
              <h2 className="home-section-title"><MessageCircle size={18} /> 世界频道</h2>
              <div className="home-window-actions">
                <Link to="/world" className="home-more-link">更多 <ArrowRight size={12} /></Link>
                <button className="home-window-toggle" onClick={() => toggleMinimize('world')}>
                  {minimized.world ? <Maximize2 size={14} /> : <Minus size={14} />}
                </button>
              </div>
            </div>
            {!minimized.world && (
              <div className="home-window-body">
                <div className="home-world-chat">
                  <div className="home-chat-messages">
                    {worldMessages.map(msg => {
                      const user = getUserById(msg.userId);
                      const isSelf = currentUser && msg.userId === currentUser.id;
                      return (
                        <div key={msg.id} className={`home-chat-msg ${isSelf ? 'self' : 'other'}`}>
                          <AvatarWithFallback src={user?.avatar} alt={user?.name} className="home-chat-avatar" />
                          <div className="home-chat-bubble-wrap">
                            <span className="home-chat-name">{user?.name}</span>
                            <div className={`home-chat-bubble ${isSelf ? 'bubble-self' : 'bubble-other'}`}>
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="home-chat-input">
                    <input
                      type="text"
                      placeholder={isAuthenticated ? '说点什么...' : '登录后发言'}
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleWorldSend()}
                      disabled={!isAuthenticated}
                    />
                    <button className="home-chat-send" onClick={handleWorldSend} disabled={!newMessage.trim() || !isAuthenticated}>
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
