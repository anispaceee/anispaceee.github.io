import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BangumiService, ApiError } from '../../services/api';
import { SubjectCard } from '../Common/CommonComponents';
import { Search, BookOpen, Tv, Gamepad2, Music, ExternalLink, Star, Users, Calendar, Tag, Loader2, AlertCircle, RotateCw, ChevronRight, ChevronLeft, Play, Book, Trophy, Filter, Shuffle, Newspaper } from 'lucide-react';
import './Wiki.css';

const TYPE_OPTIONS = [
  { key: 'all', label: '全部', typeCode: 0, icon: Search },
  { key: 'anime', label: '动画', typeCode: 2, icon: Tv },
  { key: 'novel', label: '小说', typeCode: 1, icon: BookOpen },
  { key: 'game', label: '游戏', typeCode: 4, icon: Gamepad2 },
  { key: 'music', label: '音乐', typeCode: 3, icon: Music },
  { key: 'person', label: '人物', typeCode: 'person', icon: Users },
];

const RANK_TABS = [
  { key: 'anime', label: '动画', icon: Tv, color: '#409eff' },
  { key: 'novel', label: '小说', icon: Book, color: '#67c23a' },
  { key: 'game', label: '游戏', icon: Gamepad2, color: '#e6a23c' },
];

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="280" fill="%23f9f3f5"%3E%3Crect width="200" height="280" rx="10"/%3E%3Ctext x="100" y="140" text-anchor="middle" fill="%23d4b8c0" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';

const RANK_PAGE_SIZE = 20;
const RANK_CACHE_KEY = 'acg_wiki_rankings';
const RANK_CACHE_TTL = 60 * 60 * 1000;
const RANK_SORT_OPTIONS = [
  { key: 'score', label: '评分', icon: Star },
  { key: 'heat', label: '热度', icon: Trophy },
  { key: 'date', label: '更新', icon: Calendar },
];

export default function Wiki() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('anime');
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

  // 排行榜状态 - 增大请求量以支持分页
  const [rankings, setRankings] = useState({ anime: [], novel: [], game: [] });
  const [activeRankTab, setActiveRankTab] = useState('anime');
  const [rankLoading, setRankLoading] = useState(false);
  const [rankPage, setRankPage] = useState(1);
  const [rankSort, setRankSort] = useState('score');
  const rankTimerRef = useRef(null);

  // 随机推荐状态
  const [randomItem, setRandomItem] = useState(null);
  const [randomLoading, setRandomLoading] = useState(false);

  // 资讯状态 - 区分资讯与条目
  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);

  useEffect(() => {
    fetchRankings();
    fetchRandomItem();
    fetchNews();
    rankTimerRef.current = setInterval(() => fetchRankings(true), RANK_CACHE_TTL);
    return () => { if (rankTimerRef.current) clearInterval(rankTimerRef.current); setError(''); };
  }, []);

  const fetchRandomItem = async () => {
    setRandomLoading(true);
    try {
      const subject = await BangumiService.getRandomSubject();
      setRandomItem(subject);
    } catch {} finally {
      setRandomLoading(false);
    }
  };

  // 获取资讯 - 特指业界动态、新作发售、新番导视等文章内容
  const fetchNews = async () => {
    setNewsLoading(true);
    try {
      const result = await BangumiService.getPopular('anime', 6, 0);
      const items = (result?.data || []).slice(0, 6);
      setNewsItems(items.map(item => ({
        id: item.id,
        title: item.name_cn || item.name,
        cover: item.image || item.images?.common || '',
        summary: item.summary || '',
        score: item.score || item.rating?.score || 0,
        type: item.type || 2,
        date: item.air_date || '',
      })));
    } catch {} finally {
      setNewsLoading(false);
    }
  };

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

  const fetchRankings = async (forceRefresh = false) => {
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(RANK_CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < RANK_CACHE_TTL) {
            setRankings(data);
            return;
          }
        }
      } catch {}
    }

    setRankLoading(true);
    try {
      const [animeRes, novelRes, gameRes] = await Promise.allSettled([
        BangumiService.searchSubjects('', 2, 50, 0),
        BangumiService.searchSubjects('', 1, 50, 0),
        BangumiService.searchSubjects('', 4, 50, 0),
      ]);

      const getData = (res) => res.status === 'fulfilled' ? (res.value?.list || []) : [];

      const data = {
        anime: getData(animeRes),
        novel: getData(novelRes),
        game: getData(gameRes),
      };

      setRankings(data);
      try {
        localStorage.setItem(RANK_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
      } catch {}
    } catch (err) {
      console.error('Failed to fetch rankings');
    } finally {
      setRankLoading(false);
    }
  };

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

  const handleSearch = useCallback(async (p = 1) => {
    if (!query.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }
    setShowLiveResults(false);
    setSearching(true);
    setError('');
    const offset = (p - 1) * PAGE_SIZE;
    try {
      const typeOption = TYPE_OPTIONS.find(t => t.key === activeType);
      
      if (typeOption?.typeCode === 'person') {
        const res = await fetch(`https://api.bgm.tv/v0/persons?keyword=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${offset}`);
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
        const result = await BangumiService.searchSubjects(query, typeCode, PAGE_SIZE, offset);
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
  const allRankItems = (() => {
    const items = [...(rankings[activeRankTab] || [])];
    switch (rankSort) {
      case 'score': items.sort((a, b) => (b.rating?.score || 0) - (a.rating?.score || 0)); break;
      case 'heat': items.sort((a, b) => (b.rating?.total || 0) - (a.rating?.total || 0)); break;
      case 'date': items.sort((a, b) => {
        const da = a.air_date || '';
        const db = b.air_date || '';
        return db.localeCompare(da);
      }); break;
    }
    return items;
  })();
  const rankTotalPages = Math.max(1, Math.ceil(allRankItems.length / RANK_PAGE_SIZE));
  const currentRankings = allRankItems.slice((rankPage - 1) * RANK_PAGE_SIZE, rankPage * RANK_PAGE_SIZE);

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

      {/* 搜索有结果时隐藏排行榜 */}
      {results.length === 0 && !query.trim() && (
      <div className="wiki-rankings-section">
        <div className="wiki-rankings-header">
          <Trophy size={18} className="wiki-rankings-icon" />
          <h2>排行榜</h2>
          <div className="wiki-rank-sort">
            {RANK_SORT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <button key={opt.key} className={`wiki-rank-sort-btn ${rankSort === opt.key ? 'active' : ''}`} onClick={() => { setRankSort(opt.key); setRankPage(1); }}>
                  <Icon size={12} /> {opt.label}
                </button>
              );
            })}
          </div>
          <button className="wiki-rank-refresh" onClick={() => fetchRankings(true)} disabled={rankLoading} title="刷新排行榜">
            <RotateCw size={14} className={rankLoading ? 'spinning' : ''} />
          </button>
        </div>
        
        <div className="wiki-rank-tabs">
          {RANK_TABS.map(tab => (
            <button 
              key={tab.key} 
              className={`wiki-rank-tab ${activeRankTab === tab.key ? 'active' : ''}`}
              onClick={() => { setActiveRankTab(tab.key); setRankPage(1); }}
              style={{ '--rank-color': tab.color }}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        {rankLoading ? (
          <div className="wiki-rank-loading"><Loader2 size={20} className="spinning" /> 加载排行榜...</div>
        ) : (
          <>
            <div className="wiki-rank-list">
              {currentRankings.map((item, index) => {
                const globalIndex = (rankPage - 1) * RANK_PAGE_SIZE + index;
                const cover = item.images?.common || item.images?.medium || '';
                const name = item.name_cn || item.name || '';
                const score = item.rating?.score || 0;
                const typeCode = item.type || 2;
                const rankIcon = globalIndex < 3 ? (
                  <span className={`wiki-rank-icon wiki-rank-${globalIndex + 1}`}>{globalIndex + 1}</span>
                ) : (
                  <span className="wiki-rank-num">{globalIndex + 1}</span>
                );
                
                return (
                  <div key={item.id} className="wiki-rank-item">
                    <div className="wiki-rank-index">{rankIcon}</div>
                    <img src={cover || FALLBACK_IMG} alt={name} className="wiki-rank-cover" onError={e => { e.target.src = FALLBACK_IMG; }} loading="lazy" />
                    <div className="wiki-rank-info">
                      <div className="wiki-rank-name">{name}</div>
                      <div className="wiki-rank-meta">
                        <span className="wiki-rank-score"><Star size={10} fill="#ffc107" /> {score.toFixed(1)}</span>
                        <span className="wiki-rank-count">{item.rating?.total || 0}人评分</span>
                      </div>
                    </div>
                    <button 
                      className={`wiki-rank-action wiki-rank-action-${typeCode}`}
                      onClick={() => handleWatchAction(item)}
                    >
                      {typeCode === 4 ? (
                        <><Gamepad2 size={12} /> 立即游玩</>
                      ) : typeCode === 1 ? (
                        <><Book size={12} /> 立即阅读</>
                      ) : (
                        <><Play size={12} /> 立即观看</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            {/* 排行榜分页 */}
            {rankTotalPages > 1 && (
              <div className="wiki-rank-pagination">
                <button className="wiki-rank-page-btn" disabled={rankPage <= 1} onClick={() => setRankPage(p => p - 1)}>
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: rankTotalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`wiki-rank-page-btn ${rankPage === p ? 'active' : ''}`} onClick={() => setRankPage(p)}>
                    {p}
                  </button>
                ))}
                <button className="wiki-rank-page-btn" disabled={rankPage >= rankTotalPages} onClick={() => setRankPage(p => p + 1)}>
                  <ChevronRight size={14} />
                </button>
                <span className="wiki-rank-page-info">第 {rankPage}/{rankTotalPages} 页</span>
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* 随机推荐模块 */}
      <div className="wiki-random-section">
        <div className="wiki-random-header">
          <Shuffle size={18} className="wiki-random-icon" />
          <h2>随机推荐</h2>
          <button className="wiki-random-refresh" onClick={fetchRandomItem} disabled={randomLoading}>
            {randomLoading ? <Loader2 size={14} className="spinning" /> : <RotateCw size={14} />} 换一个
          </button>
        </div>
        {randomItem && (
          <div className="wiki-random-card">
            <Link to={`/info/${randomItem.type === 1 ? 'novel' : randomItem.type === 4 ? 'game' : 'anime'}/${randomItem.id}`} className="wiki-random-cover-link">
              <img src={randomItem.image || randomItem.images?.common || FALLBACK_IMG} alt="" className="wiki-random-cover" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
            </Link>
            <div className="wiki-random-info">
              <Link to={`/info/${randomItem.type === 1 ? 'novel' : randomItem.type === 4 ? 'game' : 'anime'}/${randomItem.id}`} className="wiki-random-name">{randomItem.name_cn || randomItem.name}</Link>
              {randomItem.name && randomItem.name !== (randomItem.name_cn || randomItem.name) && <span className="wiki-random-name-jp">{randomItem.name}</span>}
              <div className="wiki-random-meta">
                {randomItem.score > 0 && <span className="wiki-random-score"><Star size={12} fill="#ffc107" /> {randomItem.score.toFixed(1)}</span>}
                {randomItem.tags?.length > 0 && (
                  <div className="wiki-random-tags">
                    {randomItem.tags.slice(0, 4).map((tag, i) => <span key={i} className="wiki-random-tag">{tag}</span>)}
                  </div>
                )}
              </div>
              {randomItem.summary && <p className="wiki-random-summary">{randomItem.summary}</p>}
            </div>
          </div>
        )}
      </div>

      {error && <div className="wiki-error"><AlertCircle size={16} /> {error} <button onClick={() => handleSearch(page)}><RotateCw size={12} /> 重试</button></div>}

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
