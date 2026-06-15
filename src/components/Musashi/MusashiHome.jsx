import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Loader2, BookOpen, Image, Palette, Gamepad2, Star, TrendingUp } from 'lucide-react';
import { MusashiService } from '../../services/musashiApi';
import { useApp } from '../../context/AppContext';
import WorkCard from './WorkCard';
import './MusashiHome.css';

const TYPE_TABS = [
  { key: '',      label: '全部', icon: null },
  { key: 'illustration', label: '插画', icon: Image },
  { key: 'novel',   label: '小说', icon: BookOpen },
  { key: 'manga',   label: '漫画', icon: Palette },
  { key: 'galgame', label: 'Galgame', icon: Gamepad2 },
];

const SORT_OPTIONS = [
  { key: 'latest',   label: '最新', sort: 'latest' },
  { key: 'popular',  label: '最热', sort: 'hot' },
  { key: 'rating',   label: '评分最高', sort: 'rating' },
];

const PAGE_SIZE = 20;

export default function MusashiHome() {
  const navigate = useNavigate();
  const { isAuthenticated } = useApp();

  const [activeType, setActiveType] = useState('');
  const [activeSort, setActiveSort] = useState('latest');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const debounceRef = useRef(null);

  // Rankings state
  const [rankings, setRankings] = useState([]);
  const [rankType, setRankType] = useState('daily');

  // Fetch rankings
  useEffect(() => {
    MusashiService.getRankings({ type: rankType, category: activeType || 'all', limit: 10 })
      .then(data => setRankings(data.rankings || []))
      .catch(() => setRankings([]));
  }, [rankType, activeType]);

  // Fetch works
  useEffect(() => {
    let cancelled = false;
    async function fetchWorks() {
      setLoading(true);
      try {
        const res = await MusashiService.getWorks({
          type: activeType || undefined,
          sort: SORT_OPTIONS.find(o => o.key === activeSort)?.sort || 'latest',
          page,
          limit: PAGE_SIZE,
          search: search || undefined,
        });
        if (!cancelled) {
          const list = res.works || Array.isArray(res) ? res : (res.data || []);
          const total = res.pagination?.total ?? res.total ?? 1;
          setWorks(Array.isArray(list) ? list : []);
          setTotalPages(Math.max(1, Math.ceil(total / PAGE_SIZE)));
        }
      } catch {
        if (!cancelled) setWorks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchWorks();
    return () => { cancelled = true; };
  }, [activeType, activeSort, page, search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [activeType, activeSort, search]);

  // Debounced search
  const handleSearchInput = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 300);
  }, []);

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSearch(searchInput);
    }
  }, [searchInput]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setSearch('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className="mh-page">
      {/* Header */}
      <div className="mh-header">
        <div className="mh-header-left">
          <h1 className="mh-title">
            <BookOpen size={22} />
            武藏也
          </h1>
          <p className="mh-subtitle">创作者发布与体验平台</p>
        </div>
        {isAuthenticated && (
          <button className="mh-publish-btn" onClick={() => navigate('/musashi/new')}>
            <Plus size={16} />
            发布作品
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mh-filters">
        <div className="mh-tabs">
          {TYPE_TABS.map(tab => (
            <button
              key={tab.key}
              className={`mh-tab${activeType === tab.key ? ' active' : ''}`}
              onClick={() => setActiveType(tab.key)}
            >
              {tab.icon && <tab.icon size={14} />}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mh-sort-group">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              className={`mh-sort-btn${activeSort === opt.key ? ' active' : ''}`}
              onClick={() => setActiveSort(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="mh-search-bar">
        <Search size={16} className="mh-search-icon" />
        <input
          type="text"
          value={searchInput}
          onChange={handleSearchInput}
          onKeyDown={handleSearchKeyDown}
          placeholder="搜索作品标题或标签..."
          className="mh-search-input"
        />
        {searchInput && (
          <button className="mh-clear-btn" onClick={handleClearSearch}>×</button>
        )}
      </div>

      {/* Main Content + Sidebar */}
      <div className="mh-main">
        <div className="mh-content">
          {/* Content */}
          {loading && (
            <div className="mh-loading">
              <Loader2 size={32} className="mh-spinning" />
              <p>加载中...</p>
            </div>
          )}

          {!loading && works.length === 0 && (
            <div className="mh-empty">
              <BookOpen size={48} />
              <p>{search ? '未找到相关作品，试试其他关键词' : '暂无作品，快来发布第一个吧'}</p>
            </div>
          )}

          {!loading && works.length > 0 && (
            <>
              <div className="mh-grid">
                {works.map(work => (
                  <WorkCard key={work.id} work={work} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mh-pagination">
                  <button
                    className="mh-page-btn"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    上一页
                  </button>
                  <span className="mh-page-info">{page} / {totalPages}</span>
                  <button
                    className="mh-page-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Rankings Sidebar */}
        <aside className="mh-sidebar">
          <div className="mh-rankings">
            <div className="mh-rankings-header">
              <TrendingUp size={16} />
              <span>排行榜</span>
            </div>
            <div className="mh-rankings-tabs">
              {['daily', 'weekly', 'monthly'].map(rt => (
                <button
                  key={rt}
                  className={`mh-rankings-tab${rankType === rt ? ' active' : ''}`}
                  onClick={() => setRankType(rt)}
                >
                  {{ daily: '日榜', weekly: '周榜', monthly: '月榜' }[rt]}
                </button>
              ))}
            </div>
            <div className="mh-rankings-list">
              {rankings.length === 0 && (
                <div className="mh-rankings-empty">暂无数据</div>
              )}
              {rankings.map((item, idx) => (
                <div
                  key={item.work_id || idx}
                  className="mh-rankings-item"
                  onClick={() => navigate(`/musashi/${item.work_id}`)}
                >
                  <span className={`mh-rankings-rank rank-${idx + 1}`}>
                    {idx + 1}
                  </span>
                  <div className="mh-rankings-info">
                    <span className="mh-rankings-title">{item.title}</span>
                    <span className="mh-rankings-author">{item.author_name}</span>
                  </div>
                  {item.score && (
                    <span className="mh-rankings-score">{Math.round(item.score)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
