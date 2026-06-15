import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BangumiService, StorageService } from '../../services/api';
import { Search, Loader2, X, Clock, Tv, BookOpen, Gamepad2, Music, Users, MessageCircle, Film, Newspaper, ChevronRight, Trash2 } from 'lucide-react';
import { extractPreview } from '../../utils/subjectType';
import './GlobalSearch.css';

const SEARCH_HISTORY_KEY = 'acg_search_history';
const MAX_HISTORY = 20;

const TYPE_ICONS = {
  anime: Tv,
  novel: BookOpen,
  game: Gamepad2,
  music: Music,
  person: Users,
  post: MessageCircle,
  video: Film,
  club: Users,
  news: Newspaper,
};

const TYPE_LABELS = {
  anime: '动画',
  novel: '小说',
  game: '游戏',
  music: '音乐',
  person: '人物',
  post: '帖子',
  video: '视频',
  club: 'Tea Time！',
  news: '资讯',
};

function highlightText(text, query) {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="gs-highlight">{part}</mark>
      : part
  );
}

export default function GlobalSearch({ onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [history, setHistory] = useState(() => {
    const saved = StorageService.get(SEARCH_HISTORY_KEY, []);
    return Array.isArray(saved) ? saved : [];
  });
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const flatItems = getFlatItems();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) handleItemClick(item);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, results, suggestions, query]);

  const getFlatItems = () => {
    const items = [];
    if (!query.trim() && history.length > 0) {
      history.forEach(h => items.push({ type: 'history', text: h }));
    }
    if (query.trim() && suggestions.length > 0) {
      suggestions.forEach(s => items.push({ type: 'suggestion', text: s }));
    }
    Object.entries(results).forEach(([type, list]) => {
      list.slice(0, 5).forEach(item => items.push({ type, item }));
    });
    return items;
  };

  const saveHistory = (text) => {
    const updated = [text, ...history.filter(h => h !== text)].slice(0, MAX_HISTORY);
    setHistory(updated);
    StorageService.set(SEARCH_HISTORY_KEY, updated);
  };

  const removeHistoryItem = (text, e) => {
    e.stopPropagation();
    const updated = history.filter(h => h !== text);
    setHistory(updated);
    StorageService.set(SEARCH_HISTORY_KEY, updated);
  };

  const clearHistory = () => {
    setHistory([]);
    StorageService.set(SEARCH_HISTORY_KEY, []);
  };

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults({});
      setSuggestions([]);
      return;
    }
    setLoading(true);
    const grouped = {};
    try {
      const [animeRes, novelRes, gameRes, musicRes] = await Promise.allSettled([
        BangumiService.searchSubjects(q, 2, 5, 0),
        BangumiService.searchSubjects(q, 1, 5, 0),
        BangumiService.searchSubjects(q, 4, 5, 0),
        BangumiService.searchSubjects(q, 3, 5, 0),
      ]);
      if (animeRes.status === 'fulfilled' && animeRes.value?.list?.length) grouped.anime = animeRes.value.list;
      if (novelRes.status === 'fulfilled' && novelRes.value?.list?.length) grouped.novel = novelRes.value.list;
      if (gameRes.status === 'fulfilled' && gameRes.value?.list?.length) grouped.game = gameRes.value.list;
      if (musicRes.status === 'fulfilled' && musicRes.value?.list?.length) grouped.music = musicRes.value.list;

      try {
        const personRes = await fetch(`https://api.bgm.tv/v0/persons?keyword=${encodeURIComponent(q)}&limit=5&offset=0`);
        if (personRes.ok) {
          const personData = await personRes.json();
          if (personData.data?.length) grouped.person = personData.data;
        }
      } catch {}

      const forumPosts = StorageService.get('acg_forum_posts') || [];
      const matchedPosts = forumPosts.filter(p =>
        p.title.toLowerCase().includes(q.toLowerCase()) ||
        p.content.toLowerCase().includes(q.toLowerCase()) ||
        (p.tags && p.tags.some(t => t.toLowerCase().includes(q.toLowerCase())))
      ).slice(0, 5);
      if (matchedPosts.length > 0) grouped.post = matchedPosts;

      const suggestionSet = new Set();
      [...(grouped.anime || []), ...(grouped.novel || []), ...(grouped.game || []), ...(grouped.music || [])].forEach(item => {
        const name = item.name_cn || item.name;
        if (name && name.toLowerCase().includes(q.toLowerCase())) {
          suggestionSet.add(name);
        }
      });
      setSuggestions(Array.from(suggestionSet).slice(0, 8));
    } catch {} finally {
      setLoading(false);
    }
    setResults(grouped);
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setActiveIndex(-1);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim()) {
      setResults({});
      setSuggestions([]);
      return;
    }
    timerRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleItemClick = (flatItem) => {
    if (flatItem.type === 'history' || flatItem.type === 'suggestion') {
      setQuery(flatItem.text);
      saveHistory(flatItem.text);
      doSearch(flatItem.text);
      return;
    }
    const item = flatItem.item;
    const typeCode = item.type || 2;
    saveHistory(query);
    if (typeCode === 'person' || flatItem.type === 'person') {
      window.open(`https://mzh.moegirl.org.cn/index.php?search=${encodeURIComponent(item.name || item.name_cn)}`, '_blank');
    } else if (flatItem.type === 'post') {
      navigate(`/forum/post/${item.id}`);
    } else {
      const typeKey = typeCode === 1 ? 'novel' : typeCode === 4 ? 'game' : typeCode === 3 ? 'music' : 'anime';
      navigate(`/info/${typeKey}/${item.id}`, { state: { preview: extractPreview(item) } });
    }
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      saveHistory(query);
      doSearch(query);
    }
  };

  const totalResults = Object.values(results).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="gs-overlay" onClick={onClose}>
      <div className="gs-panel" ref={panelRef} onClick={e => e.stopPropagation()}>
        <form className="gs-input-wrap" onSubmit={handleSubmit}>
          <Search size={18} className="gs-input-icon" />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索动画、小说、游戏、音乐、帖子、社团..."
            value={query}
            onChange={handleInputChange}
            className="gs-input"
          />
          {loading && <Loader2 size={16} className="gs-spinner" />}
          {query && <button className="gs-clear" onClick={() => { setQuery(''); setResults({}); setSuggestions([]); }}><X size={14} /></button>}
        </form>

        <div className="gs-body">
          {!query.trim() && history.length > 0 && (
            <div className="gs-section">
              <div className="gs-section-header">
                <Clock size={12} /> 搜索历史
                <button className="gs-history-clear" onClick={clearHistory}><Trash2 size={11} /> 清除全部</button>
              </div>
              <div className="gs-history-list">
                {history.map((h, i) => (
                  <div key={i} className={`gs-history-item-wrap ${activeIndex === i ? 'active' : ''}`}>
                    <button className="gs-history-item" onClick={() => { setQuery(h); saveHistory(h); doSearch(h); }}>
                      {h}
                    </button>
                    <button className="gs-history-delete" onClick={(e) => removeHistoryItem(h, e)}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {query.trim() && suggestions.length > 0 && (
            <div className="gs-section">
              <div className="gs-section-header"><Search size={12} /> 搜索建议</div>
              {suggestions.map((s, i) => (
                <button key={i} className={`gs-suggestion-item ${activeIndex === i ? 'active' : ''}`}
                  onClick={() => { setQuery(s); saveHistory(s); doSearch(s); }}>
                  <Search size={12} /> {highlightText(s, query)}
                </button>
              ))}
            </div>
          )}

          {loading && totalResults === 0 && (
            <div className="gs-loading"><Loader2 size={20} className="gs-spinner-lg" /> 搜索中...</div>
          )}

          {!loading && query.trim() && totalResults === 0 && (
            <div className="gs-empty">
              <Search size={32} />
              <p>未找到 "{query}" 相关内容</p>
              <span>试试其他关键词</span>
            </div>
          )}

          {Object.entries(results).map(([type, list]) => {
            if (!list.length) return null;
            const Icon = TYPE_ICONS[type] || Search;
            let flatOffset = 0;
            Object.entries(results).forEach(([t, l]) => {
              if (t === type) return;
              if (Object.keys(results).indexOf(t) < Object.keys(results).indexOf(type)) flatOffset += l.slice(0, 5).length;
            });
            return (
              <div key={type} className="gs-section">
                <div className="gs-section-header">
                  <Icon size={12} /> {TYPE_LABELS[type] || type}
                  <span className="gs-section-count">{list.length}条</span>
                </div>
                {list.slice(0, 5).map((item, i) => {
                  const globalIndex = flatOffset + i + (suggestions.length || history.length);
                  const name = item.name_cn || item.name || item.title || '';
                  const cover = item.images?.common || item.images?.medium || '';
                  const score = item.rating?.score || 0;
                  return (
                    <button
                      key={item.id || i}
                      className={`gs-result-item ${activeIndex === globalIndex ? 'active' : ''}`}
                      onClick={() => handleItemClick({ type, item })}
                    >
                      {cover && <img src={cover} alt="" className="gs-result-cover" onError={e => { e.target.style.display = 'none'; }} loading="lazy" />}
                      <div className="gs-result-info">
                        <span className="gs-result-name">{highlightText(name, query)}</span>
                        {score > 0 && <span className="gs-result-score"><Star size={10} /> {score.toFixed(1)}</span>}
                      </div>
                      <ChevronRight size={14} className="gs-result-arrow" />
                    </button>
                  );
                })}
                {list.length > 5 && (
                  <button
                    className="gs-view-more"
                    onClick={() => { navigate('/wiki?q=' + encodeURIComponent(query) + '&type=' + type); onClose(); }}
                  >
                    查看更多 →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Star({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffc107" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
