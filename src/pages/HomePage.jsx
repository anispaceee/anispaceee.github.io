import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { BangumiService, UserService, ForumService, WorldChannelService, NewsService } from '../services/api';
import { ArrowRight, Flame, Heart, MessageSquare, Calendar, RefreshCw, Star, Shuffle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles, Loader2, Tv, BookOpen, Gamepad2, MessageCircle, Globe, Clock, TrendingUp, Newspaper, Send, Image, X, Users as UsersIcon } from 'lucide-react';
import { SubjectCard, SkeletonCard, ErrorState } from '../components/Common/CommonComponents';
import UserAvatar from '../components/Common/UserAvatar';
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

  const coverUrl = subject.images?.large || subject.images?.common || subject.images?.medium || '';
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
            {loading ? '雨何时停？' : '换一个'}
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
  const [newsItems, setNewsItems] = useState([]);
  const [homeWorldInput, setHomeWorldInput] = useState('');
  const [homeWorldSending, setHomeWorldSending] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState([]);

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
      try {
        const data = await NewsService.getCustomNews(1, 5);
        setNewsItems((data.news || []).slice(0, 5));
      } catch {}
    };
    loadHomeData();
  }, []);

  const handleHomeWorldSend = useCallback(async () => {
    if (!isAuthenticated || !homeWorldInput.trim() || homeWorldSending) return;
    setHomeWorldSending(true);
    try {
      await WorldChannelService.sendMessage(homeWorldInput.trim());
      const newMsg = {
        id: Date.now(),
        author_id: currentUser.id,
        author_name: currentUser.name || currentUser.username,
        author_avatar: currentUser.avatar,
        content: homeWorldInput.trim(),
        likes: 0,
        replies_count: 0,
        created_at: new Date().toISOString(),
      };
      setRecentMessages(prev => [...prev, newMsg]);
      setHomeWorldInput('');
    } catch {
      // 静默失败
    } finally {
      setHomeWorldSending(false);
    }
  }, [isAuthenticated, homeWorldInput, homeWorldSending, currentUser]);

  const handleTerminalCommand = useCallback(() => {
    const cmd = terminalInput.trim();
    if (!cmd) return;
    const newHistory = [...terminalHistory, { type: 'input', text: cmd }];
    const lower = cmd.toLowerCase();
    let response = '';
    if (lower === 'help') {
      response = 'Available commands:\n  help    - Show this help\n  clear   - Clear terminal\n  about   - About ANISpace\n  date    - Show current date\n  echo    - Echo text back\n  neko    - 🐱\n  elpsy   - El Psy Kongroo!';
    } else if (lower === 'clear') {
      setTerminalHistory([]);
      setTerminalInput('');
      return;
    } else if (lower === 'about') {
      response = 'ANISpace — ACG Community Platform\nBuilt with React + Cloudflare Workers';
    } else if (lower === 'date') {
      response = new Date().toLocaleString('zh-CN');
    } else if (lower.startsWith('echo ')) {
      response = cmd.slice(5);
    } else if (lower === 'neko') {
      response = '🐱 Meow~';
    } else if (lower === 'elpsy') {
      response = 'El Psy Kongroo! 世界线变动率 1.048596%';
    } else {
      response = `command not found: ${cmd.split(' ')[0]}`;
    }
    response.split('\n').forEach(line => {
      newHistory.push({ type: 'output', text: line });
    });
    setTerminalHistory(newHistory);
    setTerminalInput('');
  }, [terminalInput, terminalHistory]);

  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselTimerRef = useRef(null);

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

  // 自动轮播
  useEffect(() => {
    if (carouselItems.length <= 1) return;
    const startTimer = () => {
      carouselTimerRef.current = setInterval(() => {
        setCarouselIndex(prev => (prev + 1) % carouselItems.length);
      }, 5000);
    };
    startTimer();
    return () => clearInterval(carouselTimerRef.current);
  }, [carouselItems.length]);

  const goToSlide = (idx) => {
    setCarouselIndex(idx);
    clearInterval(carouselTimerRef.current);
    carouselTimerRef.current = setInterval(() => {
      setCarouselIndex(prev => (prev + 1) % carouselItems.length);
    }, 5000);
  };

  const prevSlide = () => goToSlide((carouselIndex - 1 + carouselItems.length) % carouselItems.length);
  const nextSlide = () => goToSlide((carouselIndex + 1) % carouselItems.length);

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
      {/* 全宽大图 Banner 轮播 */}
      <div className="home-banner-section">
        {carouselLoading ? (
          <div className="home-banner-loading">
            <Loader2 size={32} className="spinning" />
            <span>雨何时停？</span>
          </div>
        ) : carouselItems.length > 0 ? (
          <div className="home-banner-carousel">
            <div className="home-banner-track" style={{ transform: `translateX(-${carouselIndex * 100}%)` }}>
              {carouselItems.map((item, idx) => {
                const img = item.images?.large || item.images?.common || item.images?.medium || item.image || '';
                const score = item.rating?.score || item.rating?.value || item.score || 0;
                const typeLabel = item.type === 1 ? '小说' : item.type === 4 ? '游戏' : '动画';
                const typePath = item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime';
                const title = item.name_cn || item.name || '';
                const summary = item.summary || '';
                return (
                  <Link key={item.id} to={`/info/${typePath}/${item.id}`} className="home-banner-slide">
                    <div className="home-banner-bg" style={{ backgroundImage: `url(${img})` }} />
                    <div className="home-banner-gradient" />
                    <div className="home-banner-content">
                      <div className="home-banner-info">
                        <div className="home-banner-badge">{idx === 0 ? '🌸 本周推荐' : '✨ 精选推荐'}</div>
                        <h2 className="home-banner-title">{title}</h2>
                        <div className="home-banner-meta">
                          <span className="home-banner-type">{typeLabel}</span>
                          {score > 0 && <span className="home-banner-score"><Star size={14} fill="#ffc107" style={{ color: '#ffc107' }} /> {score.toFixed(1)}</span>}
                        </div>
                        {summary && <p className="home-banner-summary">{summary.length > 80 ? summary.substring(0, 80) + '...' : summary}</p>}
                        <div className="home-banner-actions">
                          <span className="home-banner-btn-primary">♡ 想看</span>
                          <span className="home-banner-btn-secondary">查看详情</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <button className="home-banner-arrow home-banner-arrow-left" onClick={prevSlide}><ChevronLeft size={24} /></button>
            <button className="home-banner-arrow home-banner-arrow-right" onClick={nextSlide}><ChevronRight size={24} /></button>
            <div className="home-banner-dots">
              {carouselItems.map((_, i) => (
                <button key={i} className={`home-banner-dot ${i === carouselIndex ? 'active' : ''}`} onClick={() => goToSlide(i)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="home-banner-empty">
            <Sparkles size={32} />
            <span>暂无推荐</span>
          </div>
        )}
      </div>

      <div className="home-container">
        <div className="home-columns">
          <div className="home-main-col">
            <div className="home-random-section">
              <div className="home-random-header">
                <h2 className="home-section-title"><Sparkles size={18} /> 随·心·斩！</h2>
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

            {/* 放課後热议 */}
            <div className="home-hot-section">
              <div className="home-hot-header">
                <h2 className="home-section-title"><Flame size={18} /> 放課後热议</h2>
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
            {/* 毒电波 - Mac窗口风格 */}
            <div className="home-news-mac-window">
              <div className="home-news-titlebar">
                <div className="home-news-controls">
                  <span className="home-news-ctrl close" />
                  <span className="home-news-ctrl minimize" />
                  <span className="home-news-ctrl maximize" />
                </div>
                <span className="home-news-title"><Newspaper size={13} /> 毒电波！！</span>
                <Link to="/news" className="home-news-more"><ArrowRight size={12} /></Link>
              </div>
              <div className="home-news-list">
                {newsItems.length > 0 ? newsItems.map(news => (
                  <div key={news.id} className="home-news-item">
                    <div className="home-news-item-title">{news.title}</div>
                    <div className="home-news-item-meta">
                      <span className="home-news-item-source">{news.source || 'ANISpace'}</span>
                      <span className="home-news-item-time">{news.date || (news.created_at && news.created_at.split('T')[0]) || ''}</span>
                    </div>
                  </div>
                )) : (
                  <div className="home-news-empty">暂无资讯</div>
                )}
              </div>
            </div>

            {/* Terminal - Mac终端风格 */}
            <div className="home-terminal-window">
              <div className="home-terminal-titlebar">
                <div className="home-terminal-controls">
                  <span className="home-terminal-ctrl close" />
                  <span className="home-terminal-ctrl minimize" />
                  <span className="home-terminal-ctrl maximize" />
                </div>
                <span className="home-terminal-title">Terminal — ANISpace</span>
              </div>
              <div className="home-terminal-body">
                <div className="home-terminal-output">
                  <div className="home-terminal-line">Welcome to ANISpace Terminal v1.0.0</div>
                  <div className="home-terminal-line hint">Type 'help' for available commands.</div>
                  {terminalHistory.map((entry, i) => (
                    <div key={i} className="home-terminal-line">
                      {entry.type === 'input' ? (
                        <><span className="home-terminal-prompt">$ </span><span>{entry.text}</span></>
                      ) : (
                        <span className="home-terminal-response">{entry.text}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="home-terminal-input-line">
                  <span className="home-terminal-prompt">$ </span>
                  <input
                    type="text"
                    className="home-terminal-input"
                    value={terminalInput}
                    onChange={e => setTerminalInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleTerminalCommand(); }}
                    autoFocus={false}
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>

            {/* 世界线 - Mac窗口样式 */}
            <div className="home-world-mac-window">
              <div className="home-world-titlebar">
                <div className="home-world-controls">
                  <span className="home-world-ctrl close" />
                  <span className="home-world-ctrl minimize" />
                  <span className="home-world-ctrl maximize" />
                </div>
                <span className="home-world-title"><Globe size={13} /> 世界线</span>
                <span className="home-world-online"><UsersIcon size={11} /> {recentMessages.length}+</span>
              </div>
              <div className="home-world-messages">
                {recentMessages.length === 0 ? (
                  <div className="home-world-empty">
                    <Globe size={32} />
                    <p>还没有人发言</p>
                  </div>
                ) : recentMessages.map(msg => {
                  const msgUserName = msg.author_name || getUserById(msg.author_id)?.name || '未知';
                  const msgUserAvatar = msg.author_avatar || getUserById(msg.author_id)?.avatar || '';
                  const isOwn = currentUser && msg.author_id === currentUser.id;
                  return (
                    <div key={msg.id} className={`home-world-msg ${isOwn ? 'self' : 'other'}`}>
                      {!isOwn && <UserAvatar userId={msg.author_id} src={msgUserAvatar} alt={msgUserName} size={28} className="home-world-msg-avatar" />}
                      <div className="home-world-msg-body">
                        {!isOwn && <span className="home-world-msg-name">{msgUserName}</span>}
                        <div className={`home-world-msg-bubble ${isOwn ? 'bubble-self' : 'bubble-other'}`}>
                          {msg.content}
                        </div>
                        <span className="home-world-msg-time">
                          {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      {isOwn && <UserAvatar userId={msg.author_id} src={msgUserAvatar} alt={msgUserName} size={28} className="home-world-msg-avatar" />}
                    </div>
                  );
                })}
              </div>
              <div className="home-world-input-area">
                <input
                  type="text"
                  className="home-world-input"
                  placeholder={isAuthenticated ? '说点什么...' : '登录后发言'}
                  value={homeWorldInput}
                  onChange={e => setHomeWorldInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleHomeWorldSend(); } }}
                  readOnly={!isAuthenticated}
                  onClick={() => { if (!isAuthenticated) openAuth(); }}
                />
                <button className="home-world-send-btn" onClick={handleHomeWorldSend} disabled={!isAuthenticated || !homeWorldInput.trim() || homeWorldSending}>
                  {homeWorldSending ? <Loader2 size={14} className="spinning" /> : <Send size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
