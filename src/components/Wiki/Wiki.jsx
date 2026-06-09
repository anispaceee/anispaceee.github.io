import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BangumiService, ApiError } from '../../services/api';
import { SubjectCard } from '../Common/CommonComponents';
import { Search, BookOpen, Tv, Gamepad2, Music, ExternalLink, Star, Users, Loader2, AlertCircle, RotateCw } from 'lucide-react';
import './Wiki.css';

const TYPE_OPTIONS = [
  { key: 'all', label: '全部', typeCode: 0, icon: Search },
  { key: 'anime', label: '动画', typeCode: 2, icon: Tv },
  { key: 'novel', label: '小说', typeCode: 1, icon: BookOpen },
  { key: 'game', label: '游戏', typeCode: 4, icon: Gamepad2 },
  { key: 'music', label: '音乐', typeCode: 3, icon: Music },
  { key: 'person', label: '人物', typeCode: 'person', icon: Users },
];

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="280" fill="%23f9f3f5"%3E%3Crect width="200" height="280" rx="10"/%3E%3Ctext x="100" y="140" text-anchor="middle" fill="%23d4b8c0" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';

export default function Wiki() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [activeType, setActiveType] = useState(() => {
    const typeParam = searchParams.get('type');
    if (typeParam && TYPE_OPTIONS.some(t => t.key === typeParam)) return typeParam;
    return 'anime';
  });
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  const [liveResults, setLiveResults] = useState([]);
  const [liveSearching, setLiveSearching] = useState(false);
  const [showLiveResults, setShowLiveResults] = useState(false);
  const [liveError, setLiveError] = useState(false);
  const liveSearchTimer = useRef(null);
  const searchWrapRef = useRef(null);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);

  const initialSearchDone = useRef(false);

  // 从 URL 参数初始化搜索
  useEffect(() => {
    if (!initialSearchDone.current) {
      initialSearchDone.current = true;
      const q = searchParams.get('q');
      if (q && q.trim()) {
        handleSearch(1, q, searchParams.get('type') || activeType);
      }
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowLiveResults(false);
      }
    };
    const handleKeyDown = (e) => {
      if (!showLiveResults) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex(prev => Math.min(prev + 1, liveResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(prev => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && suggestionIndex >= 0 && liveResults[suggestionIndex]) {
        e.preventDefault();
        const item = liveResults[suggestionIndex];
        const isPerson = item.type === 'person';
        if (isPerson) {
          openMoegirl(item.name_cn || item.name);
        } else {
          navigate(`/info/${item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime'}/${item.id}`);
        }
        setShowLiveResults(false);
      } else if (e.key === 'Escape') {
        setShowLiveResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLiveResults, suggestionIndex, liveResults]);

  const handleLiveSearch = useCallback((value) => {
    setQuery(value);
    setSuggestionIndex(-1);
    if (liveSearchTimer.current) clearTimeout(liveSearchTimer.current);
    if (!value.trim()) {
      setLiveResults([]);
      setShowLiveResults(false);
      setLiveError(false);
      return;
    }
    setShowLiveResults(true);
    setLiveSearching(true);
    setLiveError(false);
    liveSearchTimer.current = setTimeout(async () => {
      try {
        const typeOption = TYPE_OPTIONS.find(t => t.key === activeType);
        if (typeOption?.typeCode === 'person') {
          const res = await fetch(`https://api.bgm.tv/v0/persons?keyword=${encodeURIComponent(value)}&limit=8&offset=0`, {
            headers: { 'User-Agent': 'ANISpace/1.0' },
          });
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          setLiveResults((data.data || []).map(item => ({
            ...item,
            type: 'person',
            name_cn: item.name || item.short_summary || '',
            images: { common: item.images?.common || item.images?.medium || '' },
            rating: { score: 0, total: 0 },
          })));
        } else {
          const typeCode = typeOption?.typeCode || 0;
          const result = await BangumiService.searchSubjects(value, typeCode, 8, 0);
          setLiveResults(result?.list || []);
        }
        setLiveError(false);
      } catch (err) {
        setLiveError(true);
        setLiveResults([]);
      } finally {
        setLiveSearching(false);
      }
    }, 300);
  }, [activeType]);

  const handleSearch = useCallback(async (p = 1, searchQuery = null, searchType = null) => {
    const q = searchQuery || query;
    const type = searchType || activeType;
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }
    setShowLiveResults(false);
    setSearching(true);
    setError('');
    const offset = (p - 1) * PAGE_SIZE;
    try {
      const typeOption = TYPE_OPTIONS.find(t => t.key === type);

      if (typeOption?.typeCode === 'person') {
        const res = await fetch(`https://api.bgm.tv/v0/persons?keyword=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${offset}`);
        if (res.ok) {
          const data = await res.json();
          const results = data.data || [];
          setResults(results.map(item => ({
            ...item,
            type: 'person',
            name_cn: item.name || item.short_summary || '',
            images: { common: item.images?.common || item.images?.medium || '' },
            rating: { score: 0, total: 0 },
          })));
          setTotal(data.total || results.length);
        }
      } else {
        const typeCode = typeOption?.typeCode || 0;
        const result = await BangumiService.searchSubjects(q, typeCode, PAGE_SIZE, offset);
        setResults(result?.list || []);
        setTotal(result?.results || 0);
      }
      setPage(p);
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : '搜索失败');
    } finally {
      setSearching(false);
    }
  }, [query, activeType]);

  const openMoegirl = (name) => {
    window.open(`https://mzh.moegirl.org.cn/index.php?search=${encodeURIComponent(name)}`, '_blank');
  };

  const handleWatchAction = (item) => {
    const typeCode = item.type || 2;
    const name = item.name_cn || item.name || '';

    if (typeCode === 4) {
      window.open(`https://www.touchgal.top/search?keyword=${encodeURIComponent(name)}`, '_blank', 'noopener,noreferrer');
    } else if (typeCode === 2) {
      navigate(`/video?play=bgm_${item.id}&type=anime&bgm_id=${item.id}&bgm_name=${encodeURIComponent(name)}`);
    } else if (typeCode === 1) {
      navigate(`/video?play=bgm_${item.id}&type=novel&bgm_id=${item.id}&bgm_name=${encodeURIComponent(name)}`);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="wiki-page">
      <div className="wiki-header">
        <div className="wiki-title">
          <BookOpen size={22} />
          <h1>百科 & 数据库</h1>
        </div>
        <p className="wiki-desc">搜索动画、小说、游戏作品，点击角色名跳转萌娘百科</p>
      </div>

      <div className="wiki-search" ref={searchWrapRef}>
        <div className="wiki-search-bar">
          <Search size={16} />
          <input
            placeholder="搜索作品、角色..."
            value={query}
            onChange={e => handleLiveSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch(1)}
            onFocus={() => { if (query.trim() && liveResults.length > 0) setShowLiveResults(true); }}
          />
          <button className="wiki-search-btn" onClick={() => handleSearch(1)} disabled={searching}>
            {searching ? <Loader2 size={14} className="spinning" /> : '搜索'}
          </button>
        </div>
        {showLiveResults && query.trim() && (
          <div className="wiki-live-results">
            {liveSearching ? (
              <div className="wiki-live-skeleton">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="wiki-live-skeleton-item">
                    <div className="wiki-skeleton-cover shimmer" />
                    <div className="wiki-skeleton-info">
                      <div className="wiki-skeleton-line wiki-skeleton-title shimmer" />
                      <div className="wiki-skeleton-line wiki-skeleton-sub shimmer" />
                    </div>
                  </div>
                ))}
              </div>
            ) : liveError ? (
              <div className="wiki-live-error">
                <AlertCircle size={16} />
                <span>搜索失败，请重试</span>
                <button className="wiki-live-retry" onClick={() => handleLiveSearch(query)}>重试</button>
              </div>
            ) : liveResults.length > 0 ? (
              <>
                {liveResults.map((item, idx) => {
                  const cover = item.images?.common || item.images?.medium || '';
                  const name = item.name_cn || item.name || '';
                  const isPerson = item.type === 'person';
                  return (
                    <Link
                      key={item.id}
                      to={isPerson ? '#' : `/info/${item.type === 1 ? 'novel' : item.type === 4 ? 'game' : 'anime'}/${item.id}`}
                      className={`wiki-live-item ${suggestionIndex === idx ? 'focused' : ''}`}
                      onClick={() => { setShowLiveResults(false); if (isPerson) openMoegirl(name); }}
                    >
                      {isPerson ? (
                        <img src={cover || FALLBACK_IMG} alt="" className="wiki-live-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
                      ) : (
                        <img src={cover || FALLBACK_IMG} alt="" className="wiki-live-cover" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
                      )}
                      <div className="wiki-live-info">
                        <span className="wiki-live-name">{name}</span>
                        <div className="wiki-live-meta">
                          {isPerson && <span className="wiki-live-type-badge"><Users size={9} /> 人物</span>}
                          {item.rating?.score > 0 && <span className="wiki-live-score"><Star size={10} fill="#ffc107" /> {item.rating.score.toFixed(1)}</span>}
                          {isPerson && item.short_summary && <span className="wiki-live-summary">{item.short_summary.slice(0, 30)}...</span>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
                <button className="wiki-live-more" onClick={() => handleSearch(1)}>查看全部结果...</button>
              </>
            ) : (
              <div className="wiki-live-empty">
                <Search size={20} />
                <span>未找到相关内容</span>
              </div>
            )}
          </div>
        )}
        <div className="wiki-type-tabs">
          {TYPE_OPTIONS.map(t => (
            <button key={t.key} className={`wiki-type-tab ${activeType === t.key ? 'active' : ''}`} onClick={() => setActiveType(t.key)}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="wiki-error"><AlertCircle size={16} /> {error} <button onClick={() => handleSearch(page)}><RotateCw size={12} /> 重试</button></div>}

      {/* 空状态提示 */}
      {results.length === 0 && !searching && !error && !query.trim() && (
        <div className="wiki-empty-state">
          <Search size={48} className="wiki-empty-icon" />
          <p className="wiki-empty-text">搜索你感兴趣的动画、小说、游戏...</p>
        </div>
      )}

      <div className="wiki-results">
        {results.length > 0 && <div className="wiki-results-header"><span>共 {total} 条结果</span></div>}
        <div className="wiki-grid">
          {results.map(item => {
            const typeCode = item.type || 2;
            const isPerson = typeCode === 'person';

            if (isPerson) {
              const name = item.name_cn || item.name || '';
              const cover = item.images?.common || item.images?.medium || '';
              return (
                <div key={item.id} className="wiki-card wiki-card-person glass-card">
                  <div className="wiki-card-cover-link">
                    <img src={cover || FALLBACK_IMG} alt={name} className="wiki-card-cover wiki-card-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} loading="lazy" />
                  </div>
                  <div className="wiki-card-info">
                    <div className="wiki-card-name">{name}</div>
                    <div className="wiki-card-meta">
                      <span className="wiki-card-type"><Users size={11} /> 人物</span>
                    </div>
                    {item.short_summary && <p className="wiki-card-summary">{item.short_summary}</p>}
                    <button className="wiki-card-moegirl" onClick={() => openMoegirl(name)}>
                      <ExternalLink size={11} /> 萌娘百科
                    </button>
                  </div>
                </div>
              );
            }

            const typeKey = typeCode === 1 ? 'novel' : typeCode === 4 ? 'game' : 'anime';
            return (
              <SubjectCard
                key={item.id}
                item={item}
                type={typeKey}
                linkTo={`/info/${typeKey}/${item.id}`}
              />
            );
          })}
        </div>
        {results.length > 0 && totalPages > 1 && (
          <div className="wiki-pagination">
            <button disabled={page <= 1} onClick={() => handleSearch(page - 1)}>上一页</button>
            <span>第 {page}/{totalPages} 页</span>
            <button disabled={page >= totalPages} onClick={() => handleSearch(page + 1)}>下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}
