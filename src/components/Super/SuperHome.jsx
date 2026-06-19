import { useState, useCallback, useEffect, useMemo } from 'react';
import { Search, Users, MessageCircle, FileText, Clock, Calendar, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { SuperService } from '../../services/SuperService';
import { useApp } from '../../context/AppContext';
import GroupCard from './GroupCard';
import './SuperHome.css';

const SORT_OPTIONS = [
  { key: 'members', label: '成员数', icon: Users },
  { key: 'posts', label: '帖子数', icon: MessageCircle },
  { key: 'topics', label: '话题数', icon: FileText },
  { key: 'createdAt', label: '创建时间', icon: Calendar },
  { key: 'updatedAt', label: '更新时间', icon: Clock },
];

const PAGE_SIZE = 20;

/**
 * SuperHome - 超展开首页组件
 * 展示 Bangumi 小组列表，支持搜索、排序和分页
 */
export default function SuperHome() {
  const { currentUser } = useApp();

  // State
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [sortBy, setSortBy] = useState('members');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch groups from API
  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await SuperService.getGroups(page, PAGE_SIZE, sortBy);
      setGroups(res.data || []);
      setTotal(res.total || 0);
      setTotalPages(Math.max(1, Math.ceil((res.total || 0) / PAGE_SIZE)));
    } catch (err) {
      setError(err.message || '加载小组列表失败');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Reset page when sort changes
  useEffect(() => {
    setPage(1);
  }, [sortBy]);

  // Local search filter
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter(g =>
      (g.title || g.name || '').toLowerCase().includes(q) ||
      (g.desc || '').toLowerCase().includes(q)
    );
  }, [groups, searchQuery]);

  // Debounced search
  const handleSearchInput = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    // Immediate local filter (no debounce needed for local)
    setSearchQuery(val);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setSearchQuery('');
  }, []);

  // Pagination handlers
  const handlePrevPage = useCallback(() => {
    setPage(p => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage(p => Math.min(totalPages, p + 1));
  }, []);

  // Render loading state
  if (loading && groups.length === 0) {
    return (
      <div className="sh-page">
        <div className="sh-header">
          <h1 className="sh-title">超展开</h1>
          <p className="sh-subtitle">Bangumi 小组讨论区</p>
        </div>
        <div className="sh-loading">
          <Loader2 size={32} className="sh-spinning" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && groups.length === 0) {
    return (
      <div className="sh-page">
        <div className="sh-header">
          <h1 className="sh-title">超展开</h1>
          <p className="sh-subtitle">Bangumi 小组讨论区</p>
        </div>
        <div className="sh-error">
          <AlertCircle size={32} />
          <p>{error}</p>
          <button className="sh-retry-btn" onClick={fetchGroups}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sh-page">
      {/* Header */}
      <div className="sh-header">
        <h1 className="sh-title">超展开</h1>
        <p className="sh-subtitle">Bangumi 小组讨论区</p>
      </div>

      {/* Toolbar: Search + Sort */}
      <div className="sh-toolbar">
        {/* Search */}
        <div className="sh-search-bar">
          <Search size={16} className="sh-search-icon" />
          <input
            type="text"
            value={searchInput}
            onChange={handleSearchInput}
            placeholder="搜索小组名称或简介..."
            className="sh-search-input"
          />
          {searchInput && (
            <button className="sh-clear-btn" onClick={handleClearSearch}>
              ×
            </button>
          )}
        </div>

        {/* Sort selector */}
        <div className="sh-sort-group">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              className={`sh-sort-btn ${sortBy === opt.key ? 'active' : ''}`}
              onClick={() => setSortBy(opt.key)}
            >
              <opt.icon size={14} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="sh-stats">
        <span className="sh-stat-item">
          共 <strong>{total}</strong> 个小组
        </span>
        {searchQuery && (
          <span className="sh-stat-item">
            当前显示 <strong>{filteredGroups.length}</strong> 个结果
          </span>
        )}
      </div>

      {/* Groups Grid */}
      <div className="sh-grid">
        {filteredGroups.length === 0 && !loading ? (
          <div className="sh-empty">
            <Users size={48} />
            <p>
              {searchQuery
                ? '未找到匹配的小组，试试其他关键词'
                : '暂无小组数据'}
            </p>
          </div>
        ) : (
          filteredGroups.map(group => (
            <GroupCard key={group.id} group={group} />
          ))
        )}
      </div>

      {/* Loading overlay (when paginating) */}
      {loading && groups.length > 0 && (
        <div className="sh-loading-overlay">
          <Loader2 size={24} className="sh-spinning" />
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !searchQuery && (
        <div className="sh-pagination">
          <button
            className="sh-page-btn"
            disabled={page <= 1 || loading}
            onClick={handlePrevPage}
          >
            <ChevronLeft size={16} />
            上一页
          </button>
          <span className="sh-page-info">
            {page} / {totalPages}
          </span>
          <button
            className="sh-page-btn"
            disabled={page >= totalPages || loading}
            onClick={handleNextPage}
          >
            下一页
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}