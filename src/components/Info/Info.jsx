import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { BangumiService, FavoriteService, ApiError, isOnline } from '../../services/api';
import { SubjectCard, SkeletonCard, ErrorState, OfflineBanner } from '../Common/CommonComponents';
import { Search, Shuffle, ExternalLink, RefreshCw, Star, Bookmark, Calendar, MessageCircle, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import './Info.css';

const TYPE_OPTIONS = [
  { key: 'all', label: '全部', typeCode: 0 },
  { key: 'anime', label: '动画', typeCode: 2 },
  { key: 'novel', label: '小说', typeCode: 1 },
  { key: 'game', label: '游戏', typeCode: 4 },
];

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const PAGE_SIZE = 20;

export default function Info() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [searchComments, setSearchComments] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [searchCurrentPage, setSearchCurrentPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);

  const [randomItem, setRandomItem] = useState(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const [hoverScore, setHoverScore] = useState(0);
  const [userScore, setUserScore] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [online, setOnline] = useState(isOnline());

  const [activeType, setActiveType] = useState('anime');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [calendarData, setCalendarData] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState(null);
  const [activeWeekday, setActiveWeekday] = useState(new Date().getDay());
  const [showCalendar, setShowCalendar] = useState(true);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => { fetchItems(1); }, [activeType]);
  useEffect(() => { fetchCalendar(); }, []);

  const fetchItems = useCallback(async (page) => {
    setLoading(true);
    setError(null);
    const offset = (page - 1) * PAGE_SIZE;
    try {
      const typeForApi = activeType === 'all' ? 'anime' : activeType;
      const result = await BangumiService.getPopular(typeForApi, PAGE_SIZE, offset);
      setItems((result?.data || []).filter(Boolean));
      setTotalItems(result?.total || 0);
      setCurrentPage(page);
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  const fetchCalendar = useCallback(async () => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const data = await BangumiService.getCalendar();
      if (Array.isArray(data)) setCalendarData(data);
    } catch (err) {
      setCalendarError(err instanceof ApiError ? err.userMessage : '获取每日放送失败');
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const searchTotalPages = Math.max(1, Math.ceil(searchTotal / PAGE_SIZE));

  const handleSearch = useCallback(async (page = 1) => {
    if (!searchQuery.trim()) return;
    if (page === 1) { setIsSearching(true); setSearchResults(null); setSearchComments([]); }
    setSearchError(null);
    const offset = (page - 1) * PAGE_SIZE;
    try {
      const typeCode = TYPE_OPTIONS.find(t => t.key === activeType)?.typeCode || 0;
      const result = await BangumiService.searchSubjects(searchQuery, typeCode, PAGE_SIZE, offset);
      setSearchResults(result);
      setSearchCurrentPage(page);
      setSearchTotal(result?.results || 0);
      if (page === 1 && result?.list?.length > 0) {
        try {
          const commentsData = await BangumiService.getSubjectComments(result.list[0].id, 5, 0);
          setSearchComments(commentsData?.comments || commentsData?.data || []);
        } catch { setSearchComments([]); }
      }
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.userMessage : '搜索失败');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, activeType]);

  const handleRandomPick = useCallback(async () => {
    setRandomLoading(true);
    setHoverScore(0);
    setUserScore(0);
    try {
      const types = ['anime', 'novel', 'game'];
      const randomType = types[Math.floor(Math.random() * types.length)];
      const result = await BangumiService.getPopular(randomType, 30, 0);
      const list = result?.data || [];
      if (list.length > 0) setRandomItem(list[Math.floor(Math.random() * list.length)]);
    } catch {} finally { setRandomLoading(false); }
  }, []);

  const toggleFavorite = (itemId) => {
    if (!isAuthenticated) { openAuth(); return; }
    FavoriteService.toggle(currentUser.id, 'info', itemId);
  };

  const isFavorited = (itemId) => {
    if (!isAuthenticated || !currentUser) return false;
    return FavoriteService.isFavorited(currentUser.id, 'info', itemId);
  };

  const todayCalendar = calendarData.find(d => d.weekday?.id === activeWeekday);
  const calendarItems = todayCalendar?.items || [];

  const isSearchActive = searchResults !== null;

  return (
    <div className="info-page">
      <OfflineBanner />
      <div className="info-container">
        <div className="info-header">
          <h1 className="info-title">资讯区</h1>
          <p className="info-subtitle">来自 Bangumi 的最新 ACG 资讯 · 评分 · 评论</p>
        </div>

        <div className="info-search-bar">
          <div className="info-search-input-wrap">
            <Search size={16} />
            <input type="text" placeholder="搜索动画、小说、游戏..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch(1)} />
          </div>
          <button className="info-search-btn" onClick={() => handleSearch(1)} disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? <span className="btn-spinner" /> : '搜索'}
          </button>
          <button className="info-random-btn" onClick={handleRandomPick} disabled={randomLoading}>
            <Shuffle size={16} /> {randomLoading ? '获取中...' : '随机推荐'}
          </button>
        </div>

        {searchError && <ErrorState message={searchError} onRetry={() => handleSearch(1)} compact />}
        {isSearchActive && searchResults?.list?.length > 0 && (
          <div className="search-results">
            <h3>搜索结果 (共 {searchTotal} 条)</h3>
            <div className="search-results-grid">
              {searchResults.list.map(item => (
                <SubjectCard key={item.id} item={item}
                  type={item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime'}
                  onFavorite={toggleFavorite} isFavorited={isFavorited(item.id)}
                  linkTo={`/info/${item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime'}/${item.id}`} />
              ))}
            </div>
            {searchTotalPages > 1 && (
              <div className="info-pagination search-pagination">
                <button className="page-btn" disabled={searchCurrentPage <= 1} onClick={() => handleSearch(searchCurrentPage - 1)}>
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(7, searchTotalPages) }, (_, i) => {
                  let page;
                  if (searchTotalPages <= 7) page = i + 1;
                  else if (searchCurrentPage <= 4) page = i + 1;
                  else if (searchCurrentPage >= searchTotalPages - 3) page = searchTotalPages - 6 + i;
                  else page = searchCurrentPage - 3 + i;
                  return (
                    <button key={page} className={`page-btn ${searchCurrentPage === page ? 'active' : ''}`}
                      onClick={() => handleSearch(page)}>{page}</button>
                  );
                })}
                <button className="page-btn" disabled={searchCurrentPage >= searchTotalPages} onClick={() => handleSearch(searchCurrentPage + 1)}>
                  <ChevronRight size={16} />
                </button>
                <span className="page-info">第 {searchCurrentPage}/{searchTotalPages} 页 · 共 {searchTotal} 条</span>
              </div>
            )}
            {searchComments.length > 0 && (
              <div className="search-comments-section">
                <h4 className="search-comments-title"><MessageCircle size={14} /> 吐槽与评论</h4>
                <div className="search-comments-list">
                  {searchComments.slice(0, 5).map((c, i) => (
                    <div key={c.id || i} className="search-comment-item">
                      <div className="search-comment-header">
                        <span className="search-comment-user">{c.user?.nickname || c.user?.username || '匿名'}</span>
                        <span className="search-comment-time">{c.updated_at || ''}</span>
                      </div>
                      <p className="search-comment-text">{c.comment || c.content || ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button className="search-close-btn" onClick={() => { setSearchResults(null); setSearchQuery(''); setSearchCurrentPage(1); }}>关闭搜索</button>
          </div>
        )}
        {isSearchActive && searchResults?.list?.length === 0 && (
          <div className="search-no-results">未找到相关内容</div>
        )}

        {randomItem && (
          <div className="random-result animate-fade-in-up">
            <div className="random-cover-img">
              <img src={randomItem.image || randomItem.images?.common || ''} alt={randomItem.name_cn || randomItem.name} loading="lazy"
                onError={e => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="%23f9f3f5"%3E%3Crect width="200" height="200" rx="10"/%3E%3Ctext x="100" y="104" text-anchor="middle" fill="%23c8bfcc" font-size="13"%3ENo Image%3C/text%3E%3C/svg%3E'; }} />
            </div>
            <div className="random-info">
              <h3>{randomItem.name_cn || randomItem.name}</h3>
              <p className="random-original">{randomItem.name}</p>
              <div className="random-score-display">
                <span className="score-big">⭐ {randomItem.score?.toFixed(1) || 'N/A'}</span>
                {isAuthenticated && (
                  <div className="user-rate-area">
                    <span className="rate-label">我的评分：</span>
                    {[1,2,3,4,5,6,7,8,9,10].map(s => (
                      <button key={s} className={`rate-star ${s <= (hoverScore || userScore) ? 'active' : ''}`}
                        onMouseEnter={() => setHoverScore(s)} onMouseLeave={() => setHoverScore(0)} onClick={() => setUserScore(s)}>
                        <Star size={14} fill={s <= (hoverScore || userScore) ? 'var(--warning)' : 'none'} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="random-summary">{randomItem.summary || ''}</p>
              <div className="random-tags">{(randomItem.tags || []).slice(0, 5).map(tag => <span key={tag} className="subject-tag">{tag}</span>)}</div>
              <div className="random-actions-row">
                <button className={`action-btn ${isFavorited(randomItem.id) ? 'favorited' : ''}`} onClick={() => toggleFavorite(randomItem.id)}>
                  <Bookmark size={16} /> {isFavorited(randomItem.id) ? '已收藏' : '收藏'}
                </button>
                <span className="action-btn bangumi-jump" role="button" tabIndex={0}
                  onClick={() => window.open(BangumiService.buildBangumiUrl(randomItem.id), '_blank')}>
                  <ExternalLink size={16} /> Bangumi
                </span>
              </div>
            </div>
          </div>
        )}

        {!isSearchActive && (
          <>
            {showCalendar && (
              <div className="calendar-section">
                <div className="calendar-header">
                  <h2 className="calendar-title"><Calendar size={18} /> 每日放送</h2>
                  <div className="calendar-actions">
                    <button className="section-refresh-btn" onClick={fetchCalendar} title="刷新">
                      <RefreshCw size={14} className={calendarLoading ? 'spinning' : ''} />
                    </button>
                    <button className="calendar-toggle-btn" onClick={() => setShowCalendar(false)}>收起</button>
                  </div>
                </div>
                <div className="calendar-weekdays">
                  {WEEKDAYS.map((day, i) => (
                    <button key={i} className={`calendar-weekday-btn ${activeWeekday === i ? 'active' : ''}`}
                      onClick={() => setActiveWeekday(i)}>{day}</button>
                  ))}
                </div>
                {calendarLoading ? (
                  <div className="calendar-loading">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                ) : calendarError ? (
                  <ErrorState message={calendarError} onRetry={fetchCalendar} compact />
                ) : calendarItems.length > 0 ? (
                  <div className="calendar-items-grid">
                    {calendarItems.slice(0, 8).map(item => (
                      <SubjectCard key={item.id} item={item} type="anime"
                        onFavorite={toggleFavorite} isFavorited={isFavorited(item.id)}
                        linkTo={`/info/anime/${item.id}`} />
                    ))}
                  </div>
                ) : (
                  <div className="info-section-empty">当日暂无放送信息</div>
                )}
              </div>
            )}
            {!showCalendar && (
              <button className="calendar-expand-btn" onClick={() => setShowCalendar(true)}>
                <Calendar size={14} /> 展开每日放送
              </button>
            )}

            <div className="info-main-section">
              <div className="info-main-header">
                <div className="info-type-tabs">
                  {TYPE_OPTIONS.map(opt => (
                    <button key={opt.key} className={`info-type-tab ${activeType === opt.key ? 'active' : ''}`}
                      onClick={() => { setActiveType(opt.key); setCurrentPage(1); }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button className="section-refresh-btn" onClick={() => fetchItems(currentPage)} title="刷新">
                  <RefreshCw size={14} className={loading ? 'spinning' : ''} />
                </button>
              </div>

              {loading ? (
                <div className="info-main-grid">
                  {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : error ? (
                <ErrorState message={error} onRetry={() => fetchItems(currentPage)} />
              ) : items.length === 0 ? (
                <div className="info-section-empty">暂无内容</div>
              ) : (
                <div className="info-main-grid">
                  {items.map(item => (
                    <SubjectCard key={item.id} item={item}
                      type={activeType === 'all' ? (item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime') : activeType}
                      onFavorite={toggleFavorite} isFavorited={isFavorited(item.id)}
                      linkTo={`/info/${activeType === 'all' ? (item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime') : activeType}/${item.id}`} />
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="info-pagination">
                  <button className="page-btn" disabled={currentPage <= 1} onClick={() => fetchItems(currentPage - 1)}>
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let page;
                    if (totalPages <= 7) page = i + 1;
                    else if (currentPage <= 4) page = i + 1;
                    else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
                    else page = currentPage - 3 + i;
                    return (
                      <button key={page} className={`page-btn ${currentPage === page ? 'active' : ''}`}
                        onClick={() => fetchItems(page)}>{page}</button>
                    );
                  })}
                  <button className="page-btn" disabled={currentPage >= totalPages} onClick={() => fetchItems(currentPage + 1)}>
                    <ChevronRight size={16} />
                  </button>
                  <span className="page-info">共 {totalItems} 条 · {totalPages} 页</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
