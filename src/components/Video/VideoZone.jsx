import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { VideoService } from '../../services/api';
import { Play, Upload, Search, Flame, Clock, TrendingUp, Film, Tv, Gamepad2, BookOpen, Heart, MessageCircle, Eye, X, ChevronRight, Sparkles, Zap } from 'lucide-react';
import './VideoZone.css';

const CATEGORIES = [
  { key: 'all', label: '首页', icon: Film },
  { key: 'anime', label: '动画', icon: Tv, subs: ['番剧', 'MAD·AMV', 'MMD·3D', '短片·手书', '鬼畜', '翻唱'] },
  { key: 'game', label: '游戏', icon: Gamepad2, subs: ['单机游戏', '电子竞技', '手机游戏'] },
  { key: 'novel', label: '小说', icon: BookOpen, subs: ['轻小说', '有声书', '同人'] },
  { key: 'life', label: '生活', icon: Film, subs: ['日常', '美食', '萌宠', '绘画'] },
];

const BANNER_ITEMS = [
  { id: 1, title: '2026春季新番导视', subtitle: '40+部新番一网打尽', color: '#e886a2' },
  { id: 2, title: 'MAD·AMV创作大赛', subtitle: '用剪辑诠释热爱', color: '#7eb8da' },
  { id: 3, title: '鬼畜区年度盛典', subtitle: '快乐永不停歇', color: '#f7b98e' },
];

export default function VideoZone() {
  const navigate = useNavigate();
  const { isAuthenticated, openAuth } = useApp();

  const [activeCategory, setActiveCategory] = useState('all');
  const [activeSubCategory, setActiveSubCategory] = useState('');
  const [sortBy, setSortBy] = useState('hot');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [videos, setVideos] = useState(() => VideoService.getAll());
  const searchInputRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setBannerIndex(prev => (prev + 1) % BANNER_ITEMS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleSearch = (query) => {
    const q = query || searchQuery;
    if (!q.trim()) { setSearchResults(null); return; }
    const results = VideoService.search(q.trim());
    setSearchResults(results);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setShowSearch(false);
  };

  const filteredVideos = (() => {
    let list = videos;
    if (activeCategory !== 'all') {
      list = list.filter(v => v.category === activeCategory);
    }
    if (activeSubCategory) {
      list = list.filter(v => v.subCategory === activeSubCategory || (v.tags && v.tags.includes(activeSubCategory)));
    }
    if (sortBy === 'hot') {
      list = [...list].sort((a, b) => b.views - a.views);
    } else if (sortBy === 'new') {
      list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortBy === 'danmaku') {
      list = [...list].sort((a, b) => (b.danmakuCount || 0) - (a.danmakuCount || 0));
    }
    return list;
  })();

  const hotVideos = [...videos].sort((a, b) => b.views - a.views).slice(0, 5);
  const latestVideos = [...videos].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  const currentCategory = CATEGORIES.find(c => c.key === activeCategory);

  const formatCount = (n) => {
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return String(n);
  };

  const goToVideo = (videoId) => {
    navigate(`/video/${videoId}`);
  };

  return (
    <div className="vz-page">
      <div className="vz-container">
        <div className="vz-header">
          <div className="vz-header-left">
            <h1 className="vz-title"><Film size={22} /> 影视区</h1>
          </div>
          <div className="vz-header-right">
            <div className="vz-search-wrap">
              <div className={`vz-search-bar ${showSearch ? 'expanded' : ''}`}>
                <Search size={16} className="vz-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="vz-search-input"
                  placeholder="搜索视频、UP主..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); handleSearch(e.target.value); }}
                  onFocus={() => setShowSearch(true)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                {searchQuery && (
                  <button className="vz-search-clear" onClick={clearSearch}><X size={14} /></button>
                )}
              </div>
            </div>
            {isAuthenticated && (
              <button className="vz-upload-btn" onClick={() => navigate('/video/upload')}>
                <Upload size={16} /> 投稿
              </button>
            )}
          </div>
        </div>

        <div className="vz-nav">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                className={`vz-nav-item ${activeCategory === cat.key ? 'active' : ''}`}
                onClick={() => { setActiveCategory(cat.key); setActiveSubCategory(''); }}
              >
                <Icon size={16} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {currentCategory?.subs && activeCategory !== 'all' && (
          <div className="vz-sub-nav">
            <button className={`vz-sub-item ${!activeSubCategory ? 'active' : ''}`} onClick={() => setActiveSubCategory('')}>全部</button>
            {currentCategory.subs.map(sub => (
              <button key={sub} className={`vz-sub-item ${activeSubCategory === sub ? 'active' : ''}`} onClick={() => setActiveSubCategory(sub)}>
                {sub}
              </button>
            ))}
          </div>
        )}

        {searchResults !== null && (
          <div className="vz-search-results">
            <div className="vz-search-header">
              <h3>搜索结果：{searchQuery}（{searchResults.length}个）</h3>
              <button className="vz-search-close" onClick={clearSearch}>清除搜索</button>
            </div>
            {searchResults.length === 0 ? (
              <div className="vz-empty">未找到相关视频</div>
            ) : (
              <div className="vz-video-grid">
                {searchResults.map(video => (
                  <VideoCard key={video.id} video={video} onClick={() => goToVideo(video.id)} formatCount={formatCount} />
                ))}
              </div>
            )}
          </div>
        )}

        {searchResults === null && activeCategory === 'all' && (
          <>
            <div className="vz-banner">
              <div className="vz-banner-slides" style={{ transform: `translateX(-${bannerIndex * 100}%)` }}>
                {BANNER_ITEMS.map((item, i) => (
                  <div key={i} className="vz-banner-slide" style={{ background: `linear-gradient(135deg, ${item.color}22, ${item.color}44)` }}>
                    <div className="vz-banner-content">
                      <h2>{item.title}</h2>
                      <p>{item.subtitle}</p>
                      <button className="vz-banner-btn">查看详情 <ChevronRight size={14} /></button>
                    </div>
                    <div className="vz-banner-deco" style={{ background: item.color }} />
                  </div>
                ))}
              </div>
              <div className="vz-banner-dots">
                {BANNER_ITEMS.map((_, i) => (
                  <button key={i} className={`vz-banner-dot ${bannerIndex === i ? 'active' : ''}`} onClick={() => setBannerIndex(i)} />
                ))}
              </div>
            </div>

            <div className="vz-section">
              <div className="vz-section-header">
                <h2><Flame size={18} /> 热门视频</h2>
                <button className="vz-more-btn" onClick={() => { setSortBy('hot'); setActiveCategory('all'); }}>
                  查看更多 <ChevronRight size={14} />
                </button>
              </div>
              <div className="vz-hot-grid">
                {hotVideos.map((video, i) => (
                  <div key={video.id} className="vz-hot-card" onClick={() => goToVideo(video.id)}>
                    <span className={`vz-hot-rank ${i < 3 ? 'top' : ''}`}>{i + 1}</span>
                    <div className="vz-hot-info">
                      <h4>{video.title}</h4>
                      <div className="vz-hot-meta">
                        <span><Eye size={11} /> {formatCount(video.views)}</span>
                        <span><MessageCircle size={11} /> {formatCount(video.danmakuCount || 0)}</span>
                        <span>{video.author}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="vz-section">
              <div className="vz-section-header">
                <h2><Sparkles size={18} /> 最新投稿</h2>
              </div>
              <div className="vz-video-grid">
                {latestVideos.map(video => (
                  <VideoCard key={video.id} video={video} onClick={() => goToVideo(video.id)} formatCount={formatCount} />
                ))}
              </div>
            </div>
          </>
        )}

        {searchResults === null && activeCategory !== 'all' && (
          <>
            <div className="vz-toolbar">
              <div className="vz-sort-tabs">
                <button className={`vz-sort-tab ${sortBy === 'hot' ? 'active' : ''}`} onClick={() => setSortBy('hot')}>
                  <Flame size={14} /> 综合热门
                </button>
                <button className={`vz-sort-tab ${sortBy === 'new' ? 'active' : ''}`} onClick={() => setSortBy('new')}>
                  <Clock size={14} /> 最新发布
                </button>
                <button className={`vz-sort-tab ${sortBy === 'danmaku' ? 'active' : ''}`} onClick={() => setSortBy('danmaku')}>
                  <MessageCircle size={14} /> 弹幕最多
                </button>
              </div>
            </div>

            {filteredVideos.length === 0 ? (
              <div className="vz-empty">
                <Film size={48} />
                <p>该分类暂无视频</p>
              </div>
            ) : (
              <div className="vz-video-grid">
                {filteredVideos.map(video => (
                  <VideoCard key={video.id} video={video} onClick={() => goToVideo(video.id)} formatCount={formatCount} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VideoCard({ video, onClick, formatCount }) {
  return (
    <div className="vz-video-card" onClick={onClick}>
      <div className="vz-card-cover">
        <div className="vz-cover-placeholder">
          <Play size={28} />
        </div>
        <span className="vz-card-duration">{video.duration}</span>
        <div className="vz-card-danmaku-count">
          <MessageCircle size={10} /> {formatCount(video.danmakuCount || 0)}
        </div>
        <div className="vz-card-overlay">
          <Play size={32} />
        </div>
      </div>
      <div className="vz-card-info">
        <h3 className="vz-card-title" title={video.title}>{video.title}</h3>
        <div className="vz-card-meta">
          <span className="vz-card-author">{video.author}</span>
          <div className="vz-card-stats">
            <span><Eye size={11} /> {formatCount(video.views)}</span>
            <span><Heart size={11} /> {formatCount(video.likes)}</span>
          </div>
        </div>
        {video.tags && video.tags.length > 0 && (
          <div className="vz-card-tags">
            {video.tags.slice(0, 2).map(tag => (
              <span key={tag} className="vz-card-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
