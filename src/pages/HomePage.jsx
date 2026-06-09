import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { BangumiService, UserService, ForumService, WorldChannelService } from '../services/api';
import { ArrowRight, Flame, Heart, MessageSquare, Calendar, RefreshCw, Star, Shuffle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles, Loader2, Tv, BookOpen, Gamepad2, MessageCircle, Globe, Clock, TrendingUp } from 'lucide-react';
import { SubjectCard, SkeletonCard, ErrorState } from '../components/Common/CommonComponents';
import UserAvatar from '../components/Common/UserAvatar';
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
const FALLBACK_COVER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="450" fill="%23f9f3f5"%3E%3Crect width="800" height="450" rx="12"/%3E%3Ctext x="400" y="215" text-anchor="middle" fill="%23d4b8c0" font-size="40"%3E🌸%3C/text%3E%3Ctext x="400" y="260" text-anchor="middle" fill="%23d4b8c0" font-size="14"%3E发现你的下一部番%3C/text%3E%3C/svg%3E';

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

  const [hotPosts, setHotPosts] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [carouselItems, setCarouselItems] = useState([]);
  const [carouselLoading, setCarouselLoading] = useState(true);

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const data = await ForumService.getPosts(1, 100);
        const posts = (data.posts || []).sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 6);
        setHotPosts(posts);
      } catch {}
      try {
        const data = await WorldChannelService.getMessages(1, 5);
        setRecentMessages(data.messages || []);
      } catch {}
    };
    loadHomeData();
  }, []);

  // 横滑推荐：加载5个热门条目
  useEffect(() => {
    const loadCarousel = async () => {
      setCarouselLoading(true);
      try {
        const result = await BangumiService.getPopular('anime', 5);
        const items = result?.data || [];
        setCarouselItems(items);
      } catch { setCarouselItems([]); }
      finally { setCarouselLoading(false); }
    };
    loadCarousel();
  }, []);

  const [randomSubject, setRandomSubject] = useState(null);
  const [randomLoading, setRandomLoading] = useState(true);

  const [calendarData, setCalendarData] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [activeWeekday, setActiveWeekday] = useState(new Date().getDay());

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

  useEffect(() => { fetchCalendar(); }, []);

  const fetchCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const data = await BangumiService.getCalendar();
      if (Array.isArray(data)) setCalendarData(data);
    } catch {} finally { setCalendarLoading(false); }
  }, []);

  const todayCalendar = calendarData.find(d => d.weekday?.id === activeWeekday);
  const calendarItems = todayCalendar?.items || [];

  return (
    <div className="home-page">
      <div className="home-container">
        <div className="home-columns">
          <div className="home-main-col">
            {/* 横滑推荐 */}
            <div className="home-carousel-section">
              <div className="home-section-title" style={{ marginBottom: 12 }}><Sparkles size={18} /> 今日推荐</div>
              {carouselLoading ? (
                <div className="home-carousel">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="home-carousel-card">
                      <div className="home-carousel-cover">
                        <div className="shimmer" style={{ width: '100%', height: '100%' }} />
                      </div>
                      <div className="home-carousel-body">
                        <div className="shimmer" style={{ width: '60%', height: 14, borderRadius: 4, marginBottom: 8 }} />
                        <div className="shimmer" style={{ width: '40%', height: 10, borderRadius: 4 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : carouselItems.length > 0 ? (
                <>
                  <div className="home-carousel">
                    {carouselItems.map((item, idx) => {
                      const img = item.images?.common || item.images?.medium || item.image || '';
                      const score = item.rating?.score || item.rating?.value || item.score || 0;
                      const typeLabel = item.type === 1 ? '小说' : item.type === 4 ? '游戏' : '动画';
                      const typePath = item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime';
                      return (
                        <Link key={item.id} to={`/info/${typePath}/${item.id}`} className="home-carousel-card">
                          <div className="home-carousel-cover">
                            {img ? <img src={img} alt="" className="home-carousel-cover-img" loading="lazy" /> : <div style={{ width: '100%', height: '100%', background: 'var(--primary-bg)' }} />}
                            <div className="home-carousel-cover-gradient" />
                            <div className="home-carousel-badge">{idx === 0 ? '🌸 今日推荐' : '✨ 精选'}</div>
                            <div className="home-carousel-cover-info">
                              <div className="home-carousel-cover-title">{item.name_cn || item.name}</div>
                              <div className="home-carousel-cover-meta">⭐ {score > 0 ? score.toFixed(1) : '-'} · {typeLabel}</div>
                            </div>
                          </div>
                          <div className="home-carousel-body">
                            <div className="home-carousel-tags">
                              <span className="home-carousel-tag home-carousel-tag-pink">{typeLabel}</span>
                              {score > 8 && <span className="home-carousel-tag home-carousel-tag-green">高分</span>}
                              <span className="home-carousel-tag home-carousel-tag-blue">推荐</span>
                            </div>
                            <div className="home-carousel-actions">
                              <span className="home-carousel-btn-want">♡ 想看</span>
                              <span className="home-carousel-btn-detail">详情</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="home-carousel-dots">
                    {carouselItems.map((_, i) => (
                      <div key={i} className={`home-carousel-dot ${i === 0 ? 'active' : ''}`} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="home-carousel-empty">暂无推荐数据</div>
              )}
            </div>

            {/* 随机推荐 */}
            <div className="home-random-section">
              <div className="home-random-header">
                <h2 className="home-section-title"><Sparkles size={18} /> 随机推荐</h2>
              </div>
              <RandomRecommendCard subject={randomSubject} loading={randomLoading} onRefresh={fetchRandom} />
            </div>

            {/* 每日放送 */}
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

            {/* 热门讨论 */}
            <div className="home-hot-section">
              <div className="home-hot-header">
                <h2 className="home-section-title"><Flame size={18} /> 热门讨论</h2>
                <Link to="/forum" className="home-more-link">更多 <ArrowRight size={12} /></Link>
              </div>
              <div className="home-hot-posts">
                {hotPosts.map((post) => {
                  const authorName = post.author_name || getUserById(post.author_id)?.name || '未知';
                  const authorAvatar = post.author_avatar || getUserById(post.author_id)?.avatar || '';
                  return (
                    <Link to={`/forum/post/${post.id}`} key={post.id} className="home-hot-post">
                      <div className="home-hot-post-top">
                        <div className="home-hot-avatar-wrap">
                          <UserAvatar userId={post.author_id} src={authorAvatar} alt={authorName} size={28} />
                        </div>
                        <div>
                          <div className="home-hot-post-user">{authorName}</div>
                          <div className="home-hot-post-time">{post.created_at ? new Date(post.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit' }) : ''}</div>
                        </div>
                      </div>
                      <div className="home-hot-title">{post.title}</div>
                      <div className="home-hot-post-stats">
                        <span><Heart size={10} /> {post.likes || 0}</span>
                        <span><MessageSquare size={10} /> {post.replies_count || 0}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="home-side-col">
            {/* 行业资讯 */}
            <NewsZone />

            {/* 世界频道预览 */}
            <div className="home-world-section">
              <div className="home-world-header">
                <h2 className="home-section-title"><Globe size={18} /> 世界频道</h2>
                <Link to="/world" className="home-more-link">更多 <ArrowRight size={12} /></Link>
              </div>
              <div className="home-world-posts">
                {recentMessages.map(msg => {
                  const msgUserName = msg.author_name || getUserById(msg.author_id)?.name || '未知';
                  const msgUserAvatar = msg.author_avatar || getUserById(msg.author_id)?.avatar || '';
                  return (
                    <div key={msg.id} className="home-world-post">
                      <UserAvatar userId={msg.author_id} src={msgUserAvatar} alt={msgUserName} size={32} className="home-world-post-avatar" />
                      <div className="home-world-post-body">
                        <div className="home-world-post-header">
                          <span className="home-world-post-author">{msgUserName}</span>
                          <span className="home-world-post-time">{msg.created_at ? new Date(msg.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : ''}</span>
                        </div>
                        <p className="home-world-post-content">{msg.content}</p>
                        <div className="home-world-post-stats">
                          <span><Heart size={11} /> {msg.likes || 0}</span>
                          <span><MessageCircle size={11} /> {msg.replies_count || 0}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
