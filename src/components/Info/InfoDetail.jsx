import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { BangumiService, RatingService, FavoriteService, CollectionMarkService, ApiError, isOnline, StorageService } from '../../services/api';
import { Star, ExternalLink, Heart, Share2, Bookmark, MessageCircle, Send, ArrowLeft, RefreshCw, Users, Calendar, Tv, BookOpen, Gamepad2, ChevronRight, Play, Loader2, Filter, ChevronDown, AlertCircle } from 'lucide-react';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import { useState, useEffect, useCallback, useRef } from 'react';
import './InfoDetail.css';

const TYPE_ICONS = { 1: BookOpen, 2: Tv, 4: Gamepad2 };
const TYPE_LABELS = { 1: '小说', 2: '动画', 3: '音乐', 4: '游戏', 6: '三次元' };
const WEEKDAYS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const FALLBACK_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="%23f9f3f5"%3E%3Crect width="80" height="80" rx="40"/%3E%3Ctext x="40" y="44" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';
const FALLBACK_COVER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="280" fill="%23f9f3f5"%3E%3Crect width="200" height="280" rx="10"/%3E%3Ctext x="100" y="140" text-anchor="middle" fill="%23d4b8c0" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';

function AvatarImg({ src, alt, size = 40 }) {
  const [failed, setFailed] = useState(false);
  return <img src={failed ? FALLBACK_AVATAR : src} alt={alt} className="detail-avatar-img" style={{ width: size, height: size }} onError={() => setFailed(true)} loading="lazy" />;
}

function CoverImg({ src, alt }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="detail-cover-wrap">
      {!loaded && !failed && <div className="detail-cover-skeleton shimmer" />}
      <img src={failed ? FALLBACK_COVER : src} alt={alt} className={`detail-cover ${loaded ? 'loaded' : ''}`} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} loading="lazy" />
    </div>
  );
}

function VerticalRatingDistribution({ rating, onFilterChange, activeFilter }) {
  if (!rating || !rating.count) return null;
  const counts = rating.count;
  const total = rating.total || 0;
  if (total === 0) return null;
  const maxCount = Math.max(...Object.values(counts), 1);

  const scoreColors = {
    10: '#e84393', 9: '#fd79a8', 8: '#e886a2', 7: '#fab1a0',
    6: '#ffeaa7', 5: '#dfe6e9', 4: '#b2bec3', 3: '#636e72',
    2: '#2d3436', 1: '#6c5ce7',
  };

  return (
    <div className="vertical-rating-dist">
      <div className="vrd-bars">
        {[10,9,8,7,6,5,4,3,2,1].map(s => {
          const count = counts[s] || 0;
          const pct = (count / maxCount) * 100;
          const totalPct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
          const isActive = activeFilter === s;
          const isAnyFilter = activeFilter !== null;
          return (
            <button key={s} className={`vrd-bar-col ${isActive ? 'active' : ''} ${isAnyFilter && !isActive ? 'dimmed' : ''}`}
              onClick={() => onFilterChange(activeFilter === s ? null : s)} title={`${s}分: ${count}人 (${totalPct}%)`}>
              <span className="vrd-pct">{totalPct}%</span>
              <div className="vrd-bar-track">
                <div className="vrd-bar-fill" style={{ height: `${pct}%`, background: scoreColors[s] || 'var(--primary)' }} />
              </div>
              <span className="vrd-score">{s}</span>
            </button>
          );
        })}
      </div>
      {activeFilter && (
        <div className="vrd-filter-hint">
          <Filter size={12} /> 筛选: {activeFilter}分 ({counts[activeFilter] || 0}人)
          <button className="vrd-filter-clear" onClick={() => onFilterChange(null)}>清除</button>
        </div>
      )}
    </div>
  );
}

function InfoBoxItem({ item }) {
  if (!item || !item.key) return null;
  const values = Array.isArray(item.value) ? item.value : [item.value];
  return (
    <div className="infobox-row">
      <span className="infobox-key">{item.key}</span>
      <span className="infobox-value">
        {values.map((v, i) => {
          if (typeof v === 'object' && v.v) return <span key={i}>{v.v}{i < values.length - 1 ? ' / ' : ''}</span>;
          return <span key={i}>{String(v)}{i < values.length - 1 ? ' / ' : ''}</span>;
        })}
      </span>
    </div>
  );
}

export default function InfoDetail() {
  const { type: routeType, id } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, openAuth } = useApp();

  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const [characters, setCharacters] = useState([]);
  const [persons, setPersons] = useState([]);
  const [charsLoading, setCharsLoading] = useState(false);

  const [userScore, setUserScore] = useState(0);
  const [hoverScore, setHoverScore] = useState(0);
  const [isFav, setIsFav] = useState(false);
  const [collectionMark, setCollectionMark] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentsPerPage, setCommentsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState('latest');
  const [localComments, setLocalComments] = useState([]);

  const [bgmComments, setBgmComments] = useState([]);
  const [bgmCommentsLoading, setBgmCommentsLoading] = useState(false);
  const [bgmCommentsPage, setBgmCommentsPage] = useState(1);
  const [bgmCommentsHasMore, setBgmCommentsHasMore] = useState(true);
  const [activeRatingFilter, setActiveRatingFilter] = useState(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true); setError(null); setProgress(10);
    try {
      setProgress(30);
      const data = await BangumiService.getSubjectDetail(id);
      setProgress(70);
      if (!data || !data.id) throw new ApiError('请求的内容不存在', 404, 'NOT_FOUND');
      setSubject(data); setProgress(90);
      if (currentUser) {
        const rating = RatingService.getUserRating(currentUser.id, parseInt(id));
        if (rating) setUserScore(rating.score);
        setIsFav(FavoriteService.isFavorited(currentUser.id, 'info', parseInt(id)));
        const mark = CollectionMarkService.getMark(currentUser.id, parseInt(id));
        if (mark) setCollectionMark(mark.mark);
      }
      setProgress(100);
      setCharsLoading(true);
      try {
        const [chars, pers] = await Promise.all([BangumiService.getSubjectCharacters(id), BangumiService.getSubjectPersons(id)]);
        setCharacters(chars); setPersons(pers);
      } catch { setCharacters([]); setPersons([]); }
      finally { setCharsLoading(false); }
    } catch (err) { setError(err instanceof ApiError ? err : new ApiError(err.message || '加载失败')); }
    finally { setLoading(false); }
  }, [id, currentUser]);

  const COMMENT_CACHE_PREFIX = 'acg_bgm_comments_';

  const fetchBgmComments = useCallback(async (page = 1) => {
    if (!id) return;
    const cacheKey = `${COMMENT_CACHE_PREFIX}${id}_${page}`;
    const cached = StorageService.get(cacheKey, null);
    if (cached && Date.now() - cached.timestamp < 1800000) {
      if (page === 1) setBgmComments(cached.data);
      else setBgmComments(prev => [...prev, ...cached.data]);
      setBgmCommentsHasMore(cached.data.length >= 20);
      return;
    }
    setBgmCommentsLoading(true);
    try {
      const url = `https://api.bgm.tv/v0/subjects/${id}/comments?offset=${(page - 1) * 20}&limit=20`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'ANISpace/1.0',
          'Accept': 'application/json',
        },
      });
      if (!res.ok) {
        const fallbackUrl = `https://api.bgm.tv/subject/${id}/comments?page=${page}&limit=20`;
        const fallbackRes = await fetch(fallbackUrl, { headers: { 'User-Agent': 'ANISpace/1.0' } });
        if (!fallbackRes.ok) throw new Error('Failed');
        const fallbackData = await fallbackRes.json();
        const comments = (Array.isArray(fallbackData) ? fallbackData : fallbackData?.comments || []).map(c => ({
          id: c.id || Math.random().toString(36).slice(2),
          username: c.user?.nickname || c.user?.username || '匿名',
          avatar: c.user?.avatar?.small || c.user?.avatar?.medium || FALLBACK_AVATAR,
          content: c.comment || c.content || '',
          score: c.rate || c.score || null,
          createdAt: c.updated_at || c.created_at || '',
        }));
        if (page === 1) setBgmComments(comments);
        else setBgmComments(prev => [...prev, ...comments]);
        setBgmCommentsHasMore(comments.length >= 20);
        StorageService.set(cacheKey, { data: comments, timestamp: Date.now() });
        return;
      }
      const data = await res.json();
      const comments = (data?.data || data?.comments || []).map(c => ({
        id: c.id || Math.random().toString(36).slice(2),
        username: c.user?.nickname || c.user?.username || '匿名',
        avatar: c.user?.avatar?.small || c.user?.avatar?.medium || FALLBACK_AVATAR,
        content: c.comment || c.content || '',
        score: c.rate || c.score || null,
        createdAt: c.updated_at || c.created_at || '',
      }));
      if (page === 1) setBgmComments(comments);
      else setBgmComments(prev => [...prev, ...comments]);
      setBgmCommentsHasMore(comments.length >= 20);
      StorageService.set(cacheKey, { data: comments, timestamp: Date.now() });
    } catch {
      if (page === 1) setBgmComments([]);
    } finally {
      setBgmCommentsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);
  useEffect(() => { fetchBgmComments(1); }, [fetchBgmComments]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [id]);

  const handleRate = (score) => {
    if (!isAuthenticated) { openAuth(); return; }
    RatingService.addRating(currentUser.id, parseInt(id), subject?.type || 2, score);
    setUserScore(score);
  };

  const toggleFav = () => {
    if (!isAuthenticated) { openAuth(); return; }
    FavoriteService.toggle(currentUser.id, 'info', parseInt(id));
    setIsFav(!isFav);
  };

  const handleComment = () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!newComment.trim()) return;
    const comment = {
      id: Date.now(),
      userId: currentUser.id,
      username: currentUser.name,
      avatar: currentUser.avatar,
      content: newComment,
      timestamp: new Date().toLocaleString('zh-CN'),
      likes: 0,
      score: userScore || null,
      replies: [],
      createdAt: Date.now(),
    };
    const updated = [...localComments, comment];
    setLocalComments(updated);
    setNewComment('');
  };

  const handleCommentLike = (commentId) => {
    setLocalComments(prev => prev.map(c => 
      c.id === commentId ? { ...c, likes: c.likes + 1 } : c
    ));
  };

  const handleCommentReply = (commentId, replyContent) => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!replyContent.trim()) return;
    setLocalComments(prev => prev.map(c => 
      c.id === commentId 
        ? { ...c, replies: [...c.replies, {
            id: Date.now(),
            userId: currentUser.id,
            username: currentUser.name,
            avatar: currentUser.avatar,
            content: replyContent,
            timestamp: new Date().toLocaleString('zh-CN'),
            likes: 0,
          }]
        } 
        : c
    ));
  };

  const handleCommentReport = (commentId) => {
    if (!isAuthenticated) { openAuth(); return; }
    if (confirm('确定要举报这条评论吗？')) {
      setLocalComments(prev => prev.filter(c => c.id !== commentId));
      alert('举报已提交，感谢您的反馈');
    }
  };

  const [watchLoading, setWatchLoading] = useState(false);
  const [watchSources, setWatchSources] = useState([]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const scrollTimerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (scrollTimerRef.current) return;
      scrollTimerRef.current = setTimeout(() => {
        setScrollY(window.scrollY);
        scrollTimerRef.current = null;
      }, 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const blurAmount = Math.min(15, Math.max(0, (scrollY - 50) * 0.1));
  const contentOpacity = Math.min(1, Math.max(0, (scrollY - 50) / 100));
  const contentTranslateY = Math.max(0, 60 - scrollY * 0.6);

  const ANIME_SOURCES = [
    { id: 'bilibili', name: 'Bilibili', icon: '📺', searchUrl: (name) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(name)}` },
    { id: 'acfun', name: 'AcFun', icon: '🎬', searchUrl: (name) => `https://www.acfun.cn/search?keyword=${encodeURIComponent(name)}` },
    { id: 'dmhy', name: '动漫花园', icon: '🌸', searchUrl: (name) => `https://share.dmhy.org/topics/list?keyword=${encodeURIComponent(name)}` },
    { id: 'nyaa', name: 'Nyaa', icon: '🐱', searchUrl: (name) => `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(name)}` },
    { id: 'mikan', name: '蜜柑计划', icon: '🍊', searchUrl: (name) => `https://mikanani.me/Home/Search?searchstr=${encodeURIComponent(name)}` },
    { id: 'acgrip', name: 'ACG.RIP', icon: '🔥', searchUrl: (name) => `https://acg.rip/?term=${encodeURIComponent(name)}` },
  ];

  const GAME_SOURCES = [
    { id: 'steam', name: 'Steam', icon: '🎮', searchUrl: (name) => `https://store.steampowered.com/search/?term=${encodeURIComponent(name)}` },
    { id: 'epic', name: 'Epic Games', icon: '🎯', searchUrl: (name) => `https://store.epicgames.com/zh-CN/browse?q=${encodeURIComponent(name)}` },
    { id: 'gog', name: 'GOG', icon: '💿', searchUrl: (name) => `https://www.gog.com/en/games?query=${encodeURIComponent(name)}` },
    { id: 'tap', name: 'TapTap', icon: '📱', searchUrl: (name) => `https://www.taptap.cn/search/${encodeURIComponent(name)}` },
  ];

  const NOVEL_SOURCES = [
    { id: 'amazon', name: 'Amazon', icon: '📚', searchUrl: (name) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(name)}&i=stripbooks` },
    { id: 'kindle', name: 'Kindle', icon: '📖', searchUrl: (name) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(name)}&i=digital-text` },
    { id: 'bookwalker', name: 'BOOKWALKER', icon: '📕', searchUrl: (name) => `https://bookwalker.jp/search/?qcat=&word=${encodeURIComponent(name)}` },
    { id: 'wenku8', name: '轻小说文库', icon: '📝', searchUrl: (name) => `https://www.wenku8.net/modules/article/search.php?searchkey=${encodeURIComponent(name)}` },
  ];

  const handleWatchNow = async () => {
    if (watchLoading) return;
    setWatchLoading(true);
    const typeCode = subject?.type || 2;
    const name = subject?.name_cn || subject?.name || '';
    const nameJp = subject?.name || '';

    let sources = [];
    if (typeCode === 2) {
      sources = ANIME_SOURCES.map(s => ({
        ...s,
        url: s.searchUrl ? s.searchUrl(name || nameJp) : null,
      }));
    } else if (typeCode === 4) {
      sources = GAME_SOURCES.map(s => ({
        ...s,
        url: s.searchUrl ? s.searchUrl(name || nameJp) : null,
      }));
    } else if (typeCode === 1) {
      sources = NOVEL_SOURCES.map(s => ({
        ...s,
        url: s.searchUrl ? s.searchUrl(nameJp || name) : null,
      }));
    }

    if (sources.length > 0) {
      setWatchSources(sources);
      setShowSourcePicker(true);
    } else {
      const typeKey = typeCode === 1 ? 'novel' : typeCode === 4 ? 'game' : 'anime';
      navigate(`/video?play=bgm_${id}&type=${typeKey}&bgm_id=${id}&bgm_name=${encodeURIComponent(name)}`);
    }
    setWatchLoading(false);
  };

  const handleSourceSelect = (source) => {
    if (source.url) {
      window.open(source.url, '_blank', 'noopener,noreferrer');
    }
    setShowSourcePicker(false);
  };

  const loadMoreComments = () => {
    const nextPage = bgmCommentsPage + 1;
    setBgmCommentsPage(nextPage);
    fetchBgmComments(nextPage);
  };

  const filteredBgmComments = activeRatingFilter !== null
    ? bgmComments.filter(c => c.score === activeRatingFilter)
    : bgmComments;

  if (loading) {
    return (
      <div className="info-detail-page">
        <div className="detail-loading">
          <div className="detail-loading-progress"><div className="detail-progress-bar" style={{ width: `${progress}%` }} /></div>
          <div className="detail-loading-spinner" />
          <p className="detail-loading-text">正在获取内容信息...</p>
          <p className="detail-loading-hint">{progress < 50 ? '连接 Bangumi API...' : progress < 90 ? '解析内容数据...' : '即将完成...'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errCode = error.code || 'UNKNOWN';
    const isOffline = errCode === 'OFFLINE';
    const isNotFound = errCode === 'NOT_FOUND';
    return (
      <div className="info-detail-page">
        <div className="detail-error">
          <div className="detail-error-icon">{isOffline ? '📡' : isNotFound ? '🔍' : '⚠️'}</div>
          <h2 className="detail-error-title">{isOffline ? '网络连接已断开' : isNotFound ? '内容不存在' : '加载失败'}</h2>
          <p className="detail-error-msg">{error.userMessage || error.message}</p>
          <p className="detail-error-hint">{isOffline ? '请检查网络连接后重试' : isNotFound ? '该内容可能已被删除或ID无效' : '请稍后重试，或前往Bangumi查看'}</p>
          <div className="detail-error-actions">
            <button className="detail-error-retry" onClick={fetchDetail}><RefreshCw size={16} /> 重试</button>
            {!isNotFound && <a href={BangumiService.buildBangumiUrl(id)} target="_blank" rel="noopener noreferrer" className="detail-error-bangumi"><ExternalLink size={16} /> 在Bangumi查看</a>}
            <Link to="/info" className="detail-error-back"><ArrowLeft size={16} /> 返回资讯区</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!subject) return null;

  const subjectType = subject.type || 2;
  const typeKey = BangumiService.getTypeByCode(subjectType);
  const typeLabel = TYPE_LABELS[subjectType] || '其他';
  const TypeIcon = TYPE_ICONS[subjectType] || Tv;
  const coverUrl = subject.images?.large || subject.images?.medium || subject.images?.common || '';
  const score = subject.rating?.score || 0;
  const totalRatings = subject.rating?.total || 0;
  const rank = subject.rank;
  const avgScore = RatingService.getAverageScore(parseInt(id));
  const mainStaff = persons.filter(p => p.role === '导演' || p.role === '原作' || p.role === '系列构成' || p.role === '动画制作' || p.role === '作者' || p.role === '插图' || p.role === '开发商' || p.role === '发行商');
  const mainChars = characters.filter(c => c.role === '主角').slice(0, 8);
  const supportChars = characters.filter(c => c.role !== '主角').slice(0, 8);
  const collection = subject.collection || {};
  const collectionTotal = (collection.wish || 0) + (collection.collect || 0) + (collection.doing || 0) + (collection.on_hold || 0) + (collection.dropped || 0);

  return (
    <div className="info-detail-page animate-fade-in">
      {subject?.images?.large && (
        <div 
          className="detail-page-background"
          style={{ 
            backgroundImage: `url(${subject.images.large.replace(/\/[lg]\/|\/cover\//, '/large/')})`,
          }}
        >
          <div className="detail-bg-overlay" style={{ opacity: 0.35 + Math.min(0.45, scrollY * 0.002) }} />
          <div className="detail-bg-blur" />
        </div>
      )}
      {!subject?.images?.large && (
        <div className="detail-page-background detail-page-bg-fallback">
          <div className="detail-bg-overlay" />
        </div>
      )}
      <div className="detail-hero">
        <h1 className="detail-hero-title" style={{ opacity: Math.max(0, 1 - scrollY / 200) }}>
          {subject.name_cn || subject.name}
        </h1>
      </div>
      <div 
        className="detail-container"
        style={{
          opacity: scrollY < 50 ? 0 : contentOpacity,
          transform: `translateY(${contentTranslateY}px)`,
          transition: 'opacity 0.1s ease, transform 0.1s ease',
        }}
      >
        <div className="detail-breadcrumb">
          <Link to="/info" className="breadcrumb-link">资讯区</Link>
          <ChevronRight size={14} />
          <span className={`breadcrumb-type type-${typeKey}`}>{typeLabel}</span>
          <ChevronRight size={14} />
          <span className="breadcrumb-current">{subject.name_cn || subject.name}</span>
        </div>

        <div className="detail-main-card">
          <div className="detail-top-section">
            <CoverImg src={coverUrl} alt={subject.name_cn || subject.name} />
            <div className="detail-info-area">
              <div className="detail-title-row">
                <span className={`detail-type-badge type-${typeKey}`}><TypeIcon size={13} /> {typeLabel}</span>
                {rank > 0 && <span className="detail-rank-badge">Rank #{rank}</span>}
              </div>
              <h1 className="detail-title">{subject.name_cn || subject.name}</h1>
              {subject.name && subject.name !== subject.name_cn && <p className="detail-original-name">{subject.name}</p>}
              <button className="detail-watch-btn" onClick={handleWatchNow} disabled={watchLoading}>
                {watchLoading ? <Loader2 size={16} className="vp-spin" /> : <Play size={16} fill="#fff" />}
                {watchLoading ? '正在跳转...' : '立即观看'}
              </button>
              {showSourcePicker && (
                <div className="detail-source-picker">
                  <h4>{subject?.type === 4 ? '查找游戏' : subject?.type === 1 ? '查找小说' : '选择播放源'}</h4>
                  <p className="detail-source-hint">点击将在新标签页打开搜索结果</p>
                  <div className="detail-source-list">
                    {watchSources.map(s => (
                      <button key={s.id} className="detail-source-item" onClick={() => handleSourceSelect(s)}>
                        <span className="detail-source-icon">{s.icon}</span>
                        <span className="detail-source-name">{s.name}</span>
                        <ExternalLink size={12} />
                      </button>
                    ))}
                  </div>
                  <button className="detail-source-close" onClick={() => setShowSourcePicker(false)}>取消</button>
                </div>
              )}
              <div className="detail-rating-block">
                <div className="detail-score-display">
                  <span className="detail-score-num">{score > 0 ? score.toFixed(1) : 'N/A'}</span>
                  <div className="detail-score-meta">
                    <span className="detail-score-label">Bangumi评分</span>
                    {totalRatings > 0 && <span className="detail-score-count">{totalRatings} 人评分</span>}
                  </div>
                </div>
                <div className="detail-score-divider" />
                <div className="detail-user-rate">
                  <p className="rate-prompt">{userScore ? `你的评分：${userScore}/10` : '点击评分'}</p>
                  <div className="rate-stars">
                    {[1,2,3,4,5,6,7,8,9,10].map(s => (
                      <button key={s} className={`rate-star-btn ${s <= (hoverScore || userScore) ? 'active' : ''}`}
                        onMouseEnter={() => setHoverScore(s)} onMouseLeave={() => setHoverScore(0)} onClick={() => handleRate(s)}>
                        <Star size={16} fill={s <= (hoverScore || userScore) ? '#ffc107' : 'none'} />
                      </button>
                    ))}
                  </div>
                  {avgScore > 0 && <p className="community-avg">社区均分：{avgScore}</p>}
                </div>
              </div>
              {subject.infobox && subject.infobox.length > 0 && (
                <div className="detail-infobox">{subject.infobox.map((item, i) => <InfoBoxItem key={i} item={item} />)}</div>
              )}
              {subject.tags && subject.tags.length > 0 && (
                <div className="detail-tags">{subject.tags.slice(0, 15).map((tag, i) => {
                  const tagName = typeof tag === 'string' ? tag : tag.name;
                  return <span key={i} className="detail-tag">{tagName}</span>;
                })}</div>
              )}
              <div className="detail-actions">
                <div className="detail-mark-group">
                  {Object.entries(CollectionMarkService.MARK_LABELS).map(([key, label]) => (
                    <button key={key} className={`detail-mark-btn ${collectionMark === key ? `active mark-${key}` : ''}`}
                      onClick={() => {
                        if (!isAuthenticated) { openAuth(); return; }
                        CollectionMarkService.setMark(currentUser.id, parseInt(id), subject?.type || 2, key, subject?.name_cn || subject?.name || '', subject?.images?.common || '');
                        setCollectionMark(prev => prev === key ? null : key);
                      }}>{label}</button>
                  ))}
                </div>
                <button className={`detail-action-btn ${isFav ? 'favorited' : ''}`} onClick={toggleFav}>
                  <Bookmark size={16} fill={isFav ? 'var(--primary)' : 'none'} /> {isFav ? '已收藏' : '收藏'}
                </button>
                <button className="detail-action-btn"><Share2 size={16} /> 分享</button>
                <a href={BangumiService.buildBangumiUrl(id)} target="_blank" rel="noopener noreferrer" className="detail-action-btn bangumi-link">
                  <ExternalLink size={16} /> 在Bangumi查看
                </a>
              </div>
            </div>
          </div>

          {collectionTotal > 0 && (
            <div className="detail-collection-section">
              <h2 className="detail-section-title"><Users size={16} /> 收藏统计</h2>
              <div className="detail-collection-grid">
                <div className="collection-item wish"><span className="collection-num">{collection.wish || 0}</span><span className="collection-label">想看</span></div>
                <div className="collection-item collect"><span className="collection-num">{collection.collect || 0}</span><span className="collection-label">看过</span></div>
                <div className="collection-item doing"><span className="collection-num">{collection.doing || 0}</span><span className="collection-label">在看</span></div>
                <div className="collection-item on-hold"><span className="collection-num">{collection.on_hold || 0}</span><span className="collection-label">搁置</span></div>
                <div className="collection-item dropped"><span className="collection-num">{collection.dropped || 0}</span><span className="collection-label">抛弃</span></div>
              </div>
            </div>
          )}

          {score > 0 && totalRatings > 0 && (
            <div className="detail-rating-section">
              <h2 className="detail-section-title"><Star size={16} /> 评分分布</h2>
              <VerticalRatingDistribution rating={subject.rating} onFilterChange={setActiveRatingFilter} activeFilter={activeRatingFilter} />
            </div>
          )}

          <div className="detail-summary-section">
            <h2 className="detail-section-title">简介</h2>
            <div className="detail-summary-text"><MarkdownRenderer content={subject.summary || '暂无简介'} /></div>
          </div>

          {mainChars.length > 0 && (
            <div className="detail-chars-section">
              <h2 className="detail-section-title">角色</h2>
              <div className="detail-chars-grid">
                {mainChars.map((c, i) => {
                  const charImg = c.images?.medium || c.images?.grid || '';
                  return (
                    <div key={c.id || i} className="detail-char-card">
                      {charImg ? <AvatarImg src={charImg} alt={c.name} size={48} /> : <div className="detail-char-avatar-placeholder">{(c.name || '?')[0]}</div>}
                      <div className="detail-char-info"><span className="detail-char-name">{c.name}</span>{c.role && <span className="detail-char-role">{c.role}</span>}</div>
                    </div>
                  );
                })}
              </div>
              {supportChars.length > 0 && (
                <details className="detail-chars-more">
                  <summary>查看更多角色 ({supportChars.length})</summary>
                  <div className="detail-chars-grid">
                    {supportChars.map((c, i) => {
                      const charImg = c.images?.medium || c.images?.grid || '';
                      return (
                        <div key={c.id || i} className="detail-char-card">
                          {charImg ? <AvatarImg src={charImg} alt={c.name} size={48} /> : <div className="detail-char-avatar-placeholder">{(c.name || '?')[0]}</div>}
                          <div className="detail-char-info"><span className="detail-char-name">{c.name}</span>{c.role && <span className="detail-char-role">{c.role}</span>}</div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          )}

          {mainStaff.length > 0 && (
            <div className="detail-staff-section">
              <h2 className="detail-section-title">制作人员</h2>
              <div className="detail-staff-grid">
                {mainStaff.map((p, i) => {
                  const personImg = p.images?.medium || p.images?.grid || '';
                  return (
                    <div key={p.id || i} className="detail-staff-card">
                      <AvatarImg src={personImg} alt={p.name} size={40} />
                      <div className="detail-staff-info"><span className="detail-staff-name">{p.name}</span><span className="detail-staff-role">{p.role}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="detail-comments-section">
            <h2 className="detail-section-title"><MessageCircle size={16} /> 吐槽与评论</h2>
            
            <div className="detail-comment-form">
              <textarea placeholder="写下你的评论..." value={newComment} onChange={e => setNewComment(e.target.value)} rows={3} />
              <button className="comment-submit" onClick={handleComment} disabled={!newComment.trim()}><Send size={14} /> 发表评论</button>
            </div>

            <div className="detail-comments-toolbar">
              <div className="detail-comments-sort">
                <span className="sort-label">排序:</span>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="sort-select">
                  <option value="latest">最新</option>
                  <option value="hottest">最热</option>
                </select>
              </div>
              <div className="detail-comments-perpage">
                <span className="perpage-label">每页:</span>
                <select value={commentsPerPage} onChange={e => setCommentsPerPage(parseInt(e.target.value))} className="perpage-select">
                  <option value="10">10条</option>
                  <option value="20">20条</option>
                  <option value="50">50条</option>
                </select>
              </div>
            </div>

            <div className="detail-comments-list">
              {(() => {
                const sortedComments = [...localComments].sort((a, b) => {
                  if (sortBy === 'hottest') {
                    return b.likes - a.likes;
                  }
                  return b.createdAt - a.createdAt;
                });
                const paginatedComments = sortedComments.slice(0, commentsPerPage);
                
                if (paginatedComments.length === 0) {
                  return <div className="detail-no-comments">暂无评论，快来发表第一条评论吧！</div>;
                }
                
                return paginatedComments.map(c => (
                  <div key={c.id} className="detail-comment-item">
                    <AvatarImg src={c.avatar} alt={c.username} size={36} />
                    <div className="comment-body">
                      <div className="comment-header">
                        <span className="comment-name">{c.username}</span>
                        {c.score && <span className="comment-score-badge">⭐ {c.score}</span>}
                        <span className="comment-time">{c.timestamp}</span>
                      </div>
                      <p className="comment-content">{c.content}</p>
                      <div className="comment-actions">
                        <button className="comment-action-btn like" onClick={() => handleCommentLike(c.id)}>
                          <Heart size={14} /> {c.likes}
                        </button>
                        <button className="comment-action-btn reply" onClick={() => {
                          const replyContent = prompt('输入回复内容：');
                          if (replyContent) handleCommentReply(c.id, replyContent);
                        }}>
                          <MessageCircle size={14} /> 回复
                        </button>
                        <button className="comment-action-btn report" onClick={() => handleCommentReport(c.id)}>
                          <AlertCircle size={14} /> 举报
                        </button>
                      </div>
                      {c.replies && c.replies.length > 0 && (
                        <div className="comment-replies">
                          {c.replies.map(reply => (
                            <div key={reply.id} className="comment-reply">
                              <AvatarImg src={reply.avatar} alt={reply.username} size={24} />
                              <div className="reply-body">
                                <span className="reply-name">{reply.username}</span>
                                <span className="reply-content">{reply.content}</span>
                                <span className="reply-time">{reply.timestamp}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="bgm-comments-section">
              <div className="bgm-comments-header">
                <h3 className="bgm-comments-title">Bangumi 社区评论</h3>
                <div className="bgm-comments-toolbar">
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bgm-sort-select">
                    <option value="latest">最新</option>
                    <option value="hottest">最热</option>
                  </select>
                  <select value={commentsPerPage} onChange={e => setCommentsPerPage(parseInt(e.target.value))} className="bgm-perpage-select">
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                  </select>
                </div>
              </div>
              {activeRatingFilter !== null && (
                <div className="bgm-filter-bar">
                  <Filter size={12} /> 筛选: {activeRatingFilter}分
                  <button className="bgm-filter-clear" onClick={() => setActiveRatingFilter(null)}>清除筛选</button>
                </div>
              )}
              {bgmCommentsLoading && bgmComments.length === 0 ? (
                <div className="bgm-comments-loading"><Loader2 size={20} className="vp-spin" /> 加载评论中...</div>
              ) : filteredBgmComments.length === 0 ? (
                <div className="detail-no-comments">暂无评论</div>
              ) : (
                <>
                  <div className="bgm-comments-list">
                    {filteredBgmComments.slice(0, commentsPerPage).map(c => (
                      <div key={c.id} className="bgm-comment-item">
                        <img src={c.avatar} alt="" className="bgm-comment-avatar" onError={e => { e.target.src = FALLBACK_AVATAR; }} loading="lazy" />
                        <div className="bgm-comment-body">
                          <div className="bgm-comment-header">
                            <span className="bgm-comment-name">{c.username}</span>
                            {c.score && <span className="comment-score-badge">⭐ {c.score}</span>}
                            {c.createdAt && <span className="bgm-comment-time">{new Date(c.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}</span>}
                          </div>
                          <p className="bgm-comment-content">{c.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {bgmCommentsHasMore && activeRatingFilter === null && (
                    <div className="bgm-comments-more">
                      <button className="bgm-load-more" onClick={loadMoreComments} disabled={bgmCommentsLoading}>
                        {bgmCommentsLoading ? <Loader2 size={14} className="vp-spin" /> : <ChevronDown size={14} />} 加载更多
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
