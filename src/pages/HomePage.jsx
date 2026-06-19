import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { BangumiService, UserService, ForumService, WorldChannelService, NewsService, AniBTService, RecommendService, CollectionMarkService } from '../services/api';
import { behaviorCollector } from '../lib/BehaviorCollector';
import { sessionProfile } from '../lib/SessionProfile';
import HikarinagiService from '../services/HikarinagiService';
import { extractPreview } from '../utils/subjectType';
import { ArrowRight, Flame, Heart, MessageSquare, Calendar, RefreshCw, Star, Shuffle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sparkles, Loader2, Tv, BookOpen, Gamepad2, MessageCircle, Globe, Clock, TrendingUp, Newspaper, Send, Image, X, Users as UsersIcon } from 'lucide-react';
import { SubjectCard, SkeletonCard, ErrorState } from '../components/Common/CommonComponents';
import UserAvatar from '../components/Common/UserAvatar';
import HomeTerminal from '../components/Home/HomeTerminal';
import './HomePage.css';

const TYPE_OPTIONS = [
  { key: 'all', label: '全部', typeCode: 0 },
  { key: 'anime', label: '动画', typeCode: 2 },
  { key: 'novel', label: '小说', typeCode: 1 },
  { key: 'game', label: '游戏', typeCode: 4 },
  { key: 'real', label: '三次元', typeCode: 6 },
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

function RandomRecommendCard({ subject, loading, onRefresh, activeType, onTypeChange }) {
  const [lastClick, setLastClick] = useState(0);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => { setCoverLoaded(false); setCoverFailed(false); }, [subject?.id]);

  const handleRefresh = () => {
    const now = Date.now();
    if (now - lastClick < 2000) return;
    setLastClick(now);
    onRefresh();
    behaviorCollector.trackRecommendClick(subject?.id, 'home_random', 0, 'random', activeType);
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
  const typeLabel = typeCode === 1 ? '小说' : typeCode === 4 ? '游戏' : typeCode === 6 ? '三次元' : '动画';
  const TypeIcon = typeCode === 1 ? BookOpen : typeCode === 4 ? Gamepad2 : Tv;
  const linkTo = `/info/${typeCode === 1 ? 'novel' : typeCode === 4 ? 'game' : typeCode === 6 ? 'anime' : 'anime'}/${subject.id}`;

  return (
    <div className="random-recommend-card">
      <Link to={linkTo} state={{ preview: extractPreview(subject) }} className="random-cover-link">
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
        <Link to={linkTo} state={{ preview: extractPreview(subject) }} className="random-title">{title}</Link>
        <p className="random-summary">{summary}</p>
        <div className="random-meta">
          <div className="random-type-filter">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                className={`random-type-filter-btn ${activeType === opt.key ? 'active' : ''}`}
                onClick={() => onTypeChange(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, openAuth, socialMode, filterNsfw } = useApp();

  useEffect(() => {
    behaviorCollector.trackPageEnter('home');
    return () => behaviorCollector.trackPageLeave();
  }, []);

  const [hotPosts, setHotPosts] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [carouselItems, setCarouselItems] = useState([]);
  const [carouselLoading, setCarouselLoading] = useState(true);
  const [newsItems, setNewsItems] = useState([]);
  const [homeWorldInput, setHomeWorldInput] = useState('');
  const [homeWorldSending, setHomeWorldSending] = useState(false);
  const [recommendGals, setRecommendGals] = useState([]);
  const [hotComments, setHotComments] = useState([]);

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const data = await ForumService.getPosts(1, 20);
        const posts = (data.posts || []).sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 15);
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
      try {
        const feedData = await NewsService.getNewsFeed({ limit: 5 });
        const feedItems = (feedData.news || []).map(n => ({
          ...n,
          source: n.source === 'bangumi_calendar' ? 'Bangumi' : n.source === 'bangumi_hot' ? 'Bangumi热门' : n.source === 'bangumi_game' ? 'Bangumi游戏' : n.source === 'bangumi_book' ? 'Bangumi书籍' : n.source === 'ymgal' ? '月幕' : n.source === 'hikarinagi' ? '光凪' : n.source === 'cngal' ? 'CnGal' : n.source === 'steam' ? 'Steam' : n.source,
        }));
        setNewsItems(prev => {
          const existing = prev.filter(p => !feedItems.find(f => f.title === p.title));
          return [...feedItems, ...existing].slice(0, 5);
        });
      } catch {}
      // Hikarinagi 推荐 Galgame + 热门评论
      try {
        const [galData, commentData] = await Promise.allSettled([
          HikarinagiService.page.getRecommendGalgames(),
          HikarinagiService.page.getHotComments(),
        ]);
        if (galData.status === 'fulfilled' && galData.value) {
          const gals = Array.isArray(galData.value) ? galData.value : [];
          // 过滤限制级内容（基于标签）
          if (filterNsfw) {
            const nsfwKeywords = ['R18', 'r18', '成人向', '18禁', '18+', 'NSFW', 'nsfw', '成人', '成年向'];
            const filtered = gals.filter(gal => {
              const tags = gal.tags || [];
              return !tags.some(tag => {
                const tagName = typeof tag === 'string' ? tag : (tag.name || tag.tag || '');
                return nsfwKeywords.some(kw => tagName.toLowerCase().includes(kw.toLowerCase()));
              });
            });
            setRecommendGals(filtered.slice(0, 5));
          } else {
            setRecommendGals(gals.slice(0, 5));
          }
        }
        if (commentData.status === 'fulfilled' && commentData.value) {
          const comments = Array.isArray(commentData.value) ? commentData.value : [];
          setHotComments(comments.slice(0, 5));
        }
      } catch {}
    };
    loadHomeData();
  }, [filterNsfw]);

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

  const [carouselIndex, setCarouselIndex] = useState(1); // start at 1 because of clone
  const carouselTimerRef = useRef(null);
  const carouselTrackRef = useRef(null);
  const [carouselTransition, setCarouselTransition] = useState(true);

  // 横滑推荐：加载当季所有在更动画（优先 AniBT，降级 Bangumi）
  useEffect(() => {
    const loadCarousel = async () => {
      setCarouselLoading(true);
      try {
        const result = await AniBTService.getSeasonAnime();
        if (result?.ok && result?.data?.byWeekday) {
          const allItems = result.data.byWeekday.flatMap(dayGroup =>
            (dayGroup.animes || []).map(anime => ({
              id: anime.bgmId,
              name: anime.title?.japanese || anime.title?.primary || '',
              name_cn: anime.title?.chinese || anime.title?.primary || '',
              images: anime.cover ? { large: anime.cover, common: anime.cover, medium: anime.cover } : {},
              rating: anime.rating ? { score: anime.rating, value: anime.rating } : {},
              type: 2,
              summary: anime.kind || '',
              url: `/subject/${anime.bgmId}`,
            }))
          );
          const seen = new Set();
          const unique = allItems.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
          const sorted = unique.sort((a, b) => (b.rating?.score || 0) - (a.rating?.score || 0));
          // 过滤限制级内容
          let finalItems = sorted;
          if (filterNsfw && finalItems.length > 0) {
            try {
              const inaccessibleIds = await BangumiService.checkAccessibility(finalItems);
              if (inaccessibleIds.size > 0) {
                finalItems = finalItems.filter(item => !inaccessibleIds.has(item.id));
              }
            } catch {}
          }
          setCarouselItems(finalItems);
        } else {
          // 降级到 Bangumi Calendar
          const data = await BangumiService.getCalendar();
          if (Array.isArray(data)) {
            const allItems = data.flatMap(day => day.items || []);
            const animeItems = allItems.filter(item => item.type === 2);
            const seen = new Set();
            const unique = animeItems.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
            const sorted = unique.sort((a, b) => (b.rating?.score || 0) - (a.rating?.score || 0));
            // 过滤限制级内容
            let finalItems = sorted;
            if (filterNsfw && finalItems.length > 0) {
              try {
                const inaccessibleIds = await BangumiService.checkAccessibility(finalItems);
                if (inaccessibleIds.size > 0) {
                  finalItems = finalItems.filter(item => !inaccessibleIds.has(item.id));
                }
              } catch {}
            }
            setCarouselItems(finalItems);
          }
        }
      } catch {
        // 降级到 Bangumi Calendar
        try {
          const data = await BangumiService.getCalendar();
          if (Array.isArray(data)) {
            const allItems = data.flatMap(day => day.items || []);
            const animeItems = allItems.filter(item => item.type === 2);
            const seen = new Set();
            const unique = animeItems.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
            const sorted = unique.sort((a, b) => (b.rating?.score || 0) - (a.rating?.score || 0));
            // 过滤限制级内容
            let finalItems = sorted;
            if (filterNsfw && finalItems.length > 0) {
              try {
                const inaccessibleIds = await BangumiService.checkAccessibility(finalItems);
                if (inaccessibleIds.size > 0) {
                  finalItems = finalItems.filter(item => !inaccessibleIds.has(item.id));
                }
              } catch {}
            }
            setCarouselItems(finalItems);
          }
        } catch { setCarouselItems([]); }
      }
      finally { setCarouselLoading(false); }
    };
    loadCarousel();
  }, [filterNsfw]);

  // 无缝循环：到达 clone 时瞬移
  useEffect(() => {
    if (carouselItems.length <= 1) return;
    const len = carouselItems.length;

    // 从最后一个 clone 跳到真实的最后一个
    if (carouselIndex === 0) {
      const timer = setTimeout(() => {
        setCarouselTransition(false);
        setCarouselIndex(len);
        // 下一帧恢复 transition
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setCarouselTransition(true);
          });
        });
      }, 500); // 等动画结束
      return () => clearTimeout(timer);
    }

    // 从第一个 clone 跳到真实的第一个
    if (carouselIndex === len + 1) {
      const timer = setTimeout(() => {
        setCarouselTransition(false);
        setCarouselIndex(1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setCarouselTransition(true);
          });
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [carouselIndex, carouselItems.length]);

  // 自动轮播
  useEffect(() => {
    if (carouselItems.length <= 1) return;
    const startTimer = () => {
      carouselTimerRef.current = setInterval(() => {
        setCarouselIndex(prev => prev + 1);
      }, 5000);
    };
    startTimer();
    return () => clearInterval(carouselTimerRef.current);
  }, [carouselItems.length]);

  const goToSlide = (idx) => {
    // idx is the real index (0-based), map to carousel index (1-based due to clone)
    setCarouselIndex(idx + 1);
    clearInterval(carouselTimerRef.current);
    carouselTimerRef.current = setInterval(() => {
      setCarouselIndex(prev => prev + 1);
    }, 5000);
  };

  const prevSlide = () => {
    setCarouselTransition(true);
    setCarouselIndex(prev => prev - 1);
    clearInterval(carouselTimerRef.current);
    carouselTimerRef.current = setInterval(() => {
      setCarouselIndex(prev => prev + 1);
    }, 5000);
  };
  const nextSlide = () => {
    setCarouselTransition(true);
    setCarouselIndex(prev => prev + 1);
    clearInterval(carouselTimerRef.current);
    carouselTimerRef.current = setInterval(() => {
      setCarouselIndex(prev => prev + 1);
    }, 5000);
  };

  const [randomSubject, setRandomSubject] = useState(null);
  const [randomLoading, setRandomLoading] = useState(true);
  const [randomType, setRandomType] = useState('all');

  const [calendarData, setCalendarData] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [activeWeekday, setActiveWeekday] = useState(new Date().getDay());

  const getCategoryLabel = (cat) => ({ game: '游戏', anime: '动画', novel: '小说', chat: '吹水' }[cat] || cat);
  const getUserById = (id) => UserService.getById(id);

  const fetchRandom = useCallback(async (type) => {
    setRandomLoading(true);
    try {
      const data = await RecommendService.getRecommend('home_random');
      const items = data?.items || [];
      if (items.length > 0) {
        // 获取用户已收藏的条目 ID，用于前端二次过滤
        let collectedIds = new Set();
        if (isAuthenticated && currentUser?.id) {
          try {
            const collections = await CollectionMarkService.getByUserId(currentUser.id);
            if (Array.isArray(collections)) {
              collectedIds = new Set(collections.map(c => c.subject_id));
            }
          } catch {}
        }
        const filteredItems = items.filter(i => !collectedIds.has(i.subject_id));
        const pool = filteredItems.length > 0 ? filteredItems : items;
        // 加权随机选择一条
        const totalWeight = pool.reduce((s, i) => s + (i.score || 1), 0);
        let rand = Math.random() * totalWeight;
        let selected = pool[0];
        for (const item of pool) {
          rand -= (item.score || 1);
          if (rand <= 0) { selected = item; break; }
        }
        const subject = await BangumiService.getSubject(selected.subject_id);
        if (subject) {
          // 过滤限制级内容
          if (filterNsfw) {
            try {
              const inaccessibleIds = await BangumiService.checkAccessibility([subject]);
              if (inaccessibleIds.has(subject.id)) {
                setRandomSubject(null);
                setRandomLoading(false);
                return;
              }
            } catch {}
          }
          setRandomSubject(subject);
        }
        else throw new Error('No subject returned');
      } else {
        throw new Error('Empty recommend');
      }
    } catch {
      // 降级：使用原有随机逻辑
      try {
        const typeCode = TYPE_OPTIONS.find(o => o.key === (type || randomType))?.typeCode || 0;
        // 获取用户已收藏的条目 ID 作为排除列表
        let excludeIds = [];
        if (isAuthenticated && currentUser?.id) {
          try {
            const collections = await CollectionMarkService.getByUserId(currentUser.id);
            if (Array.isArray(collections)) {
              excludeIds = collections.map(c => c.subject_id);
            }
          } catch {}
        }
        const subject = await BangumiService.getRandomSubject(typeCode, excludeIds);
        if (subject && filterNsfw) {
          try {
            const inaccessibleIds = await BangumiService.checkAccessibility([subject]);
            if (inaccessibleIds.has(subject.id)) {
              setRandomSubject(null);
              setRandomLoading(false);
              return;
            }
          } catch {}
        }
        setRandomSubject(subject);
      } catch {
        setRandomSubject(null);
      }
    } finally {
      setRandomLoading(false);
    }
  }, [randomType, filterNsfw, isAuthenticated, currentUser]);

  const handleRandomTypeChange = useCallback((type) => {
    setRandomType(type);
    fetchRandom(type);
  }, [fetchRandom]);

  useEffect(() => { fetchRandom('all'); }, []);

  useEffect(() => { fetchCalendar(); }, []);

  const fetchCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const result = await AniBTService.getSeasonAnime();
      if (result?.ok && result?.data?.byWeekday) {
        // 将 AniBT 的 byWeekday 格式转换为与 Bangumi Calendar 兼容的结构
        const converted = result.data.byWeekday.map(dayGroup => ({
          weekday: { id: dayGroup.weekday === 7 ? 0 : dayGroup.weekday },
          items: (dayGroup.animes || []).map(anime => ({
            id: anime.bgmId,
            name: anime.title?.japanese || anime.title?.primary || '',
            name_cn: anime.title?.chinese || anime.title?.primary || '',
            images: anime.cover ? { large: anime.cover, common: anime.cover, medium: anime.cover } : {},
            rating: anime.rating ? { score: anime.rating, value: anime.rating } : {},
            type: 2,
            url: `/subject/${anime.bgmId}`,
            _anibtKind: anime.kind || '',
            _anibtFormat: anime.format || '',
            _anibtAiringAt: anime.airingAt || 0,
          })),
        }));
        // 过滤限制级内容
        if (filterNsfw) {
          for (const dayGroup of converted) {
            if (dayGroup.items.length > 0) {
              try {
                const inaccessibleIds = await BangumiService.checkAccessibility(dayGroup.items);
                if (inaccessibleIds.size > 0) {
                  dayGroup.items = dayGroup.items.filter(item => !inaccessibleIds.has(item.id));
                }
              } catch {}
            }
          }
        }
        setCalendarData(converted);
      } else {
        // 降级到 Bangumi Calendar
        const data = await BangumiService.getCalendar();
        if (Array.isArray(data)) {
          // 过滤限制级内容
          if (filterNsfw) {
            for (const dayGroup of data) {
              if (dayGroup.items && dayGroup.items.length > 0) {
                try {
                  const inaccessibleIds = await BangumiService.checkAccessibility(dayGroup.items);
                  if (inaccessibleIds.size > 0) {
                    dayGroup.items = dayGroup.items.filter(item => !inaccessibleIds.has(item.id));
                  }
                } catch {}
              }
            }
          }
          setCalendarData(data);
        }
      }
    } catch {
      // 降级到 Bangumi Calendar
      try {
        const data = await BangumiService.getCalendar();
        if (Array.isArray(data)) {
          // 过滤限制级内容
          if (filterNsfw) {
            for (const dayGroup of data) {
              if (dayGroup.items && dayGroup.items.length > 0) {
                try {
                  const inaccessibleIds = await BangumiService.checkAccessibility(dayGroup.items);
                  if (inaccessibleIds.size > 0) {
                    dayGroup.items = dayGroup.items.filter(item => !inaccessibleIds.has(item.id));
                  }
                } catch {}
              }
            }
          }
          setCalendarData(data);
        }
      } catch {}
    } finally { setCalendarLoading(false); }
  }, [filterNsfw]);

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
            <div
              className="home-banner-track"
              ref={carouselTrackRef}
              style={{
                transform: `translateX(-${carouselIndex * 100}%)`,
                transition: carouselTransition ? 'transform 0.5s ease' : 'none',
              }}
            >
              {/* Clone last item at the beginning */}
              {carouselItems.length > 1 && (() => {
                const item = carouselItems[carouselItems.length - 1];
                const img = item.images?.large || item.images?.common || item.images?.medium || item.image || '';
                const score = item.rating?.score || item.rating?.value || item.score || 0;
                const title = item.name_cn || item.name || '';
                const summary = item.summary || '';
                return (
                  <Link key="clone-last" to={`/info/anime/${item.id}`} state={{ preview: extractPreview(item) }} className="home-banner-slide">
                    <div className="home-banner-bg" style={{ backgroundImage: `url(${img})` }} />
                    <div className="home-banner-gradient" />
                    <div className="home-banner-content">
                      <div className="home-banner-info">
                        <div className="home-banner-badge">✨ 精选推荐</div>
                        <h2 className="home-banner-title">{title}</h2>
                        <div className="home-banner-meta">
                          <span className="home-banner-type">动画</span>
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
              })()}
              {/* Real items */}
              {carouselItems.map((item, idx) => {
                const img = item.images?.large || item.images?.common || item.images?.medium || item.image || '';
                const score = item.rating?.score || item.rating?.value || item.score || 0;
                const typeLabel = item.type === 1 ? '小说' : item.type === 4 ? '游戏' : '动画';
                const typePath = item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime';
                const title = item.name_cn || item.name || '';
                const summary = item.summary || '';
                return (
                  <Link key={item.id} to={`/info/${typePath}/${item.id}`} state={{ preview: extractPreview(item) }} className="home-banner-slide">
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
              {/* Clone first item at the end */}
              {carouselItems.length > 1 && (() => {
                const item = carouselItems[0];
                const img = item.images?.large || item.images?.common || item.images?.medium || item.image || '';
                const score = item.rating?.score || item.rating?.value || item.score || 0;
                const title = item.name_cn || item.name || '';
                const summary = item.summary || '';
                return (
                  <Link key="clone-first" to={`/info/anime/${item.id}`} state={{ preview: extractPreview(item) }} className="home-banner-slide">
                    <div className="home-banner-bg" style={{ backgroundImage: `url(${img})` }} />
                    <div className="home-banner-gradient" />
                    <div className="home-banner-content">
                      <div className="home-banner-info">
                        <div className="home-banner-badge">🌸 本周推荐</div>
                        <h2 className="home-banner-title">{title}</h2>
                        <div className="home-banner-meta">
                          <span className="home-banner-type">动画</span>
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
              })()}
            </div>
            <button className="home-banner-arrow home-banner-arrow-left" onClick={prevSlide}><ChevronLeft size={24} /></button>
            <button className="home-banner-arrow home-banner-arrow-right" onClick={nextSlide}><ChevronRight size={24} /></button>
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
              <RandomRecommendCard subject={randomSubject} loading={randomLoading} onRefresh={() => fetchRandom()} activeType={randomType} onTypeChange={handleRandomTypeChange} />
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
                  calendarItems.map(item => (
                    <SubjectCard key={item.id} item={item} type="anime" linkTo={`/info/anime/${item.id}`} linkState={{ preview: extractPreview(item) }} />
                  ))}
              </div>
            </div>

            {/* 放課後热议 - 右滑瀑布流 */}
            {socialMode && (
            <div className="home-hot-section">
              <div className="home-hot-header">
                <h2 className="home-section-title"><Flame size={18} /> 放課後热议</h2>
                <Link to="/forum" className="home-more-link">更多 <ArrowRight size={12} /></Link>
              </div>
              <div className="home-hot-scroll">
                {hotPosts.map((post) => {
                  const authorName = post.author_name || getUserById(post.author_id)?.name || '未知';
                  const authorAvatar = post.author_avatar || getUserById(post.author_id)?.avatar || '';
                  const postImages = Array.isArray(post.images) ? post.images : [];
                  const hasImage = postImages.length > 0;
                  return (
                    <Link to={`/forum/post/${post.id}`} key={post.id} className="home-hot-card">
                      {hasImage && (
                        <div className="home-hot-card-cover">
                          <img src={typeof postImages[0] === 'string' ? postImages[0] : postImages[0]?.preview} alt="" loading="lazy" />
                          {postImages.length > 1 && <span className="home-hot-card-img-count">+{postImages.length - 1}</span>}
                        </div>
                      )}
                      <div className="home-hot-card-body">
                        <h3 className="home-hot-card-title">{post.title}</h3>
                        <div className="home-hot-card-meta">
                          <UserAvatar userId={post.author_id} src={authorAvatar} alt={authorName} size={18} />
                          <span className="home-hot-card-author">{authorName}</span>
                          <span className="home-hot-card-stats">
                            <Heart size={10} /> {post.likes || 0}
                            <MessageSquare size={10} /> {post.replies_count || 0}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
            )}
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
                {newsItems.length > 0 ? newsItems.map(news => {
                  const handleClick = () => {
                    if (news.type === 'article' || news.id) {
                      // 站内文章跳转详情页
                      navigate(`/news/${news.id}`, { state: { article: news } });
                    } else if (news.link) {
                      // 外链推荐打开新标签
                      window.open(news.link, '_blank');
                    }
                  };
                  return (
                    <div key={news.id || news.source_id} className="home-news-item" onClick={handleClick} style={{ cursor: 'pointer' }}>
                      <div className="home-news-item-title">{news.title}</div>
                      <div className="home-news-item-meta">
                        <span className="home-news-item-source">{news.source || 'ANISpace'}</span>
                        <span className="home-news-item-time">{news.date || (news.created_at && news.created_at.split('T')[0]) || ''}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="home-news-empty">暂无推荐</div>
                )}
              </div>
            </div>

            {/* Terminal - Mac终端风格 */}
            <HomeTerminal />

            {/* 推荐 Galgame - Hikarinagi */}
            {(recommendGals.length > 0) && (
            <div className="home-news-mac-window">
              <div className="home-news-titlebar">
                <div className="home-news-controls">
                  <span className="home-news-ctrl close" />
                  <span className="home-news-ctrl minimize" />
                  <span className="home-news-ctrl maximize" />
                </div>
                <span className="home-news-title"><Sparkles size={13} /> 推荐 Galgame</span>
                <Link to="/wiki?type=galgame" className="home-news-more"><ArrowRight size={12} /></Link>
              </div>
              <div className="home-news-list">
                {recommendGals.length === 0 ? (
                  <div className="home-news-empty">暂无推荐</div>
                ) : recommendGals.map(gal => {
                  const galName = gal.transTitle || (Array.isArray(gal.originTitle) ? gal.originTitle[0] : gal.originTitle) || '';
                  const galCover = gal.cover || '';
                  const galScore = gal.rate || gal.score || 0;
                  const preview = { id: gal.galId, name: galName, name_cn: galName, type: 4, image: galCover, images: { large: galCover } };
                  return (
                    <Link key={gal.galId} to={`/info/hikarinagi/galgame/${gal.galId}`} state={{ preview }} className="home-news-item" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {galCover && <img src={galCover} alt="" style={{ width: 32, height: 42, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="home-news-item-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{galName}</div>
                        <div className="home-news-item-meta">
                          <span className="home-news-item-source"><Sparkles size={9} /> Hikarinagi</span>
                          {galScore > 0 && <span style={{ color: '#ffc107', fontSize: 11 }}><Star size={9} fill="#ffc107" /> {Number(galScore).toFixed(1)}</span>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
            )}

            {/* 世界线 - Mac窗口样式 */}
            {socialMode && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
