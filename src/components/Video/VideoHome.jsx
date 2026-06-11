import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, TrendingUp, Star, Settings, Loader2, Film, BookmarkPlus } from 'lucide-react';
import { BangumiService } from '../../services/api';
import { mediaSourceManager } from '../../services/media/MediaSourceManager';
import './VideoHome.css';

const FALLBACK_IMG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="267" fill="none">' +
  '<rect width="200" height="267" rx="8" fill="%23f0f0f0"/>' +
  '<text x="100" y="140" text-anchor="middle" fill="%23ccc" font-size="14">No Image</text>' +
  '</svg>'
);

const TYPE_MAP = { 1: '小说', 2: '动画', 3: '音乐', 4: '游戏', 6: '三次元' };

export default function VideoHome() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [popular, setPopular] = useState([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const debounceRef = useRef(null);

  // Load popular anime on mount
  useEffect(() => {
    let cancelled = false;
    async function loadPopular() {
      try {
        const res = await BangumiService.getPopular('anime', 10);
        if (!cancelled) setPopular(res.data || []);
      } catch {
        // Silently fail — popular section is non-critical
      } finally {
        if (!cancelled) setPopularLoading(false);
      }
    }
    loadPopular();
    return () => { cancelled = true; };
  }, []);

  // Debounced search
  const doSearch = useCallback(async (kw) => {
    if (!kw.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const data = await BangumiService.searchSubjects(kw.trim(), 2, 20, 0);
      setResults(data.list || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setKeyword(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  }, [doSearch]);

  const handleSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(keyword);
  }, [keyword, doSearch]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(keyword);
    }
  }, [keyword, doSearch]);

  const handleClear = useCallback(() => {
    setKeyword('');
    setResults([]);
    setSearched(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleSubjectClick = useCallback((subjectId) => {
    navigate(`/video/subject/${subjectId}`);
  }, [navigate]);

  // Determine display title: prefer name_cn, fallback to name
  const getTitle = useCallback((item) => item.name_cn || item.name || '未知', []);

  // Determine cover image
  const getCover = useCallback((item) => item.images?.large || item.image || FALLBACK_IMG, []);

  // Determine score display
  const getScore = useCallback((item) => {
    const s = item.rating?.score || item.score || 0;
    return s > 0 ? s.toFixed(1) : null;
  }, []);

  return (
    <div className="vh-page">
      {/* Header */}
      <div className="vh-header">
        <div className="vh-header-left">
          <h1 className="vh-title">
            <Film size={22} />
            番剧搜索
          </h1>
          <p className="vh-desc">搜索 Bangumi 条目，发现想看的番剧</p>
        </div>
        <button
          className="vh-settings-btn"
          onClick={() => navigate('/video/sources')}
          title="影源设置"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Search Bar */}
      <div className="vh-search-bar">
        <div className="vh-search-input-wrap">
          <Search size={18} className="vh-search-icon" />
          <input
            type="text"
            value={keyword}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="搜索番剧名称..."
            className="vh-search-input"
          />
          {keyword && (
            <button className="vh-clear-btn" onClick={handleClear}>×</button>
          )}
        </div>
        <button
          className="vh-search-btn"
          onClick={handleSearch}
          disabled={loading || !keyword.trim()}
        >
          {loading ? <Loader2 size={18} className="vh-spinning" /> : '搜索'}
        </button>
      </div>

      {/* Search Results */}
      {searched && (
        <div className="vh-section">
          <div className="vh-section-header">
            <h2>搜索结果</h2>
            {!loading && results.length > 0 && (
              <span className="vh-result-count">共 {results.length} 条</span>
            )}
          </div>

          {loading && (
            <div className="vh-loading">
              <Loader2 size={32} className="vh-spinning" />
              <p>正在搜索番剧...</p>
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="vh-empty">
              <Film size={48} />
              <p>未找到相关番剧，试试其他关键词</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="vh-grid">
              {results.map(item => (
                <div
                  key={item.id}
                  className="vh-card"
                  onClick={() => handleSubjectClick(item.id)}
                >
                  <div className="vh-card-cover">
                    <img
                      src={getCover(item)}
                      alt={getTitle(item)}
                      onError={e => { e.target.src = FALLBACK_IMG; }}
                      loading="lazy"
                    />
                    {getScore(item) && (
                      <span className="vh-card-score">
                        <Star size={12} /> {getScore(item)}
                      </span>
                    )}
                  </div>
                  <div className="vh-card-info">
                    <h3 className="vh-card-title">{getTitle(item)}</h3>
                    <div className="vh-card-meta">
                      {TYPE_MAP[item.type] && (
                        <span className="vh-card-tag">{TYPE_MAP[item.type]}</span>
                      )}
                      {item.air_date && (
                        <span className="vh-card-date">{item.air_date}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Popular Section — shown when not searching */}
      {!searched && (
        <div className="vh-section">
          <div className="vh-section-header">
            <h2><TrendingUp size={18} /> 热门番剧</h2>
          </div>

          {popularLoading && (
            <div className="vh-loading">
              <Loader2 size={28} className="vh-spinning" />
              <p>加载中...</p>
            </div>
          )}

          {!popularLoading && popular.length === 0 && (
            <div className="vh-empty">
              <p>暂无热门番剧数据</p>
            </div>
          )}

          {!popularLoading && popular.length > 0 && (
            <div className="vh-grid">
              {popular.map(item => (
                <div
                  key={item.id}
                  className="vh-card"
                  onClick={() => handleSubjectClick(item.id)}
                >
                  <div className="vh-card-cover">
                    <img
                      src={getCover(item)}
                      alt={getTitle(item)}
                      onError={e => { e.target.src = FALLBACK_IMG; }}
                      loading="lazy"
                    />
                    {getScore(item) && (
                      <span className="vh-card-score">
                        <Star size={12} /> {getScore(item)}
                      </span>
                    )}
                  </div>
                  <div className="vh-card-info">
                    <h3 className="vh-card-title">{getTitle(item)}</h3>
                    <div className="vh-card-meta">
                      {TYPE_MAP[item.type] && (
                        <span className="vh-card-tag">{TYPE_MAP[item.type]}</span>
                      )}
                      {item.air_date && (
                        <span className="vh-card-date">{item.air_date}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Default Empty State — when not searching and no popular data yet */}
      {!searched && !popularLoading && popular.length === 0 && (
        <div className="vh-empty vh-empty-hero">
          <Film size={56} />
          <p>搜索番剧开始观看</p>
        </div>
      )}
    </div>
  );
}
