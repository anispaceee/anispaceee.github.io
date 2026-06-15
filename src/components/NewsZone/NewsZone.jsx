import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Tv, Book, Plus, ExternalLink, Loader2, Newspaper, Calendar, RefreshCw, Flame, Sparkles, Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { NewsService } from '../../services/api';
import { useApp } from '../../context/AppContext';
import AnimeSchedule from './AnimeSchedule';
import './NewsZone.css';

// 来源配置
const SOURCE_CONFIG = {
  bangumi_calendar: { label: 'Bangumi 新番', color: '#f09199', icon: Tv },
  bangumi_hot: { label: 'Bangumi 热门', color: '#e8674f', icon: Flame },
  bangumi_game: { label: 'Bangumi 游戏', color: '#f97316', icon: Sparkles },
  bangumi_book: { label: 'Bangumi 书籍', color: '#8b5cf6', icon: Book },
  ymgal: { label: '月幕 Galgame', color: '#a855f7', icon: Sparkles },
  hikarinagi: { label: '光凪', color: '#f472b6', icon: Sparkles },
  cngal: { label: 'CnGal', color: '#06b6d4', icon: Book },
  vndb: { label: 'VNDB', color: '#6366f1', icon: Book },
  steam: { label: 'Steam', color: '#1b2838', icon: Sparkles },
  jikan_season: { label: 'MAL 当季', color: '#2e51a2', icon: Tv },
  jikan_top: { label: 'MAL 热门', color: '#0b3d91', icon: Flame },
  custom: { label: '站内资讯', color: '#10b981', icon: Sparkles },
};

const CATEGORIES = ['全部', '新番导视', '热门推荐', '游戏推荐', '轻小说', 'VN推荐', '新作发售', 'Gal档案', '业界动态', '每周速报', 'Steam精选', 'Steam特惠', 'Steam新品'];

export default function NewsZone() {
  const navigate = useNavigate();
  const { isAuthenticated, openAuth } = useApp();
  const [feedNews, setFeedNews] = useState([]);
  const [customNews, setCustomNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeTab, setActiveTab] = useState('feed');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({ title: '', source: '', link: '', category: '', cover: '' });
  const [coverPreview, setCoverPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const carouselTimerRef = useRef(null);
  const coverInputRef = useRef(null);

  // 合并所有资讯
  const allNews = [...feedNews, ...customNews.map(n => ({ ...n, source: 'custom' }))];
  const hotNews = allNews.filter(n => n.cover).slice(0, 5);

  // 筛选
  const filteredNews = allNews.filter(n => {
    if (activeSource && n.source !== activeSource) return false;
    if (activeCategory !== '全部' && n.category !== activeCategory) return false;
    return true;
  });

  // 加载数据（全量一次性加载）
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [feedData, customData] = await Promise.allSettled([
        NewsService.getNewsFeed({ page: 1, limit: 9999 }),
        NewsService.getCustomNews(1, 9999),
      ]);
      const newFeed = feedData.status === 'fulfilled' ? (feedData.value?.news || []) : [];
      const newCustom = customData.status === 'fulfilled' ? (customData.value?.news || []) : [];
      setFeedNews(newFeed);
      setCustomNews(newCustom);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // 每5分钟自动刷新数据
    const timer = setInterval(() => loadData(), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadData]);

  // 轮播自动播放
  useEffect(() => {
    if (hotNews.length <= 1) return;
    carouselTimerRef.current = setInterval(() => {
      setCarouselIndex(prev => (prev + 1) % hotNews.length);
    }, 5000);
    return () => clearInterval(carouselTimerRef.current);
  }, [hotNews.length]);

  // 刷新指定源
  const handleRefresh = async (source) => {
    setRefreshing(true);
    try {
      if (source) {
        await NewsService.refreshSource(source);
      }
      await loadData();
    } catch (err) {
      console.error('刷新失败:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // 提交资讯
  const resetForm = () => {
    setApplyForm({ title: '', source: '', link: '', category: '', cover: '' });
    setCoverPreview('');
  };

  const handleCloseModal = () => {
    setShowApplyModal(false);
    resetForm();
  };

  const handleSubmitApply = async () => {
    if (!isAuthenticated) {
      openAuth();
      return;
    }
    setSubmitting(true);
    try {
      if (!applyForm.title.trim() || !applyForm.link.trim()) {
        alert('请填写完整信息');
        return;
      }
      await NewsService.createNews({
        type: 'link',
        title: applyForm.title.trim(),
        source: applyForm.source.trim(),
        link: applyForm.link.trim(),
        category: applyForm.category || '业界动态',
        cover: applyForm.cover.trim() || coverPreview || '',
      });
      handleCloseModal();
      loadData();
    } catch (err) {
      alert(err.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCoverPreview(ev.target.result);
      setApplyForm(prev => ({ ...prev, cover: ev.target.result }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const getSourceLabel = (source) => SOURCE_CONFIG[source]?.label || source;
  const getSourceColor = (source) => SOURCE_CONFIG[source]?.color || '#6b7280';

  return (
    <div className="news-zone">
      {/* Header */}
      <div className="news-zone-header">
        <div className="news-zone-title">
          <Newspaper size={20} />
          <h2>毒电波！！</h2>
          <span className="news-zone-subtitle">二次元业界动态 · 新番导视 · 多源聚合</span>
        </div>
        <div className="news-zone-actions">
          <button
            className={`news-refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={() => handleRefresh('')}
            disabled={refreshing}
            title="刷新资讯"
          >
            <RefreshCw size={14} />
          </button>
          <button className="news-apply-btn" onClick={() => setShowApplyModal(true)}>
            <Plus size={14} /> 投稿
          </button>
          <div className="news-zone-tabs">
            <button
              className={`news-zone-tab ${activeTab === 'feed' ? 'active' : ''}`}
              onClick={() => setActiveTab('feed')}
            >
              <Newspaper size={14} /> 资讯流
            </button>
            <button
              className={`news-zone-tab ${activeTab === 'schedule' ? 'active' : ''}`}
              onClick={() => setActiveTab('schedule')}
            >
              <Tv size={14} /> 放送表
            </button>
          </div>
        </div>
      </div>

      {/* 放送表 Tab */}
      {activeTab === 'schedule' && <AnimeSchedule />}

      {/* 资讯流 Tab */}
      {activeTab === 'feed' && (
        <>
      {/* 全宽大图 Banner 轮播 — 与首页格式一致 */}
      {hotNews.length > 0 && (
        <div className="news-carousel">
          <div className="news-carousel-track" style={{ transform: `translateX(-${carouselIndex * 100}%)` }}>
            {hotNews.map((news, idx) => (
              <div
                key={news.id || idx}
                className="news-carousel-slide"
                onClick={() => {
                  if (news.type === 'article' || news.id) navigate(`/news/${news.id}`);
                  else if (news.link) window.open(news.link, '_blank');
                }}
              >
                <div className="news-carousel-bg" style={{ backgroundImage: `url(${news.cover})` }} />
                <div className="news-carousel-gradient" />
                <div className="news-carousel-content">
                  <div className="news-carousel-info">
                    <div className="news-carousel-badge" style={{ backgroundColor: getSourceColor(news.source) }}>
                      {getSourceLabel(news.source)}
                    </div>
                    <h2 className="news-carousel-title">{news.title}</h2>
                    <div className="news-carousel-meta">
                      <span className="news-carousel-type">{news.category || '资讯'}</span>
                    </div>
                    {news.summary && <p className="news-carousel-summary">{news.summary.length > 80 ? news.summary.substring(0, 80) + '...' : news.summary}</p>}
                    <div className="news-carousel-actions">
                      <span className="news-carousel-btn-primary">查看详情</span>
                      {news.link && <span className="news-carousel-btn-secondary" onClick={(e) => { e.stopPropagation(); window.open(news.link, '_blank'); }}>访问来源</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hotNews.length > 1 && (
            <>
              <button className="news-carousel-arrow news-carousel-arrow-left" onClick={() => setCarouselIndex(prev => (prev - 1 + hotNews.length) % hotNews.length)}>
                <ChevronLeft size={24} />
              </button>
              <button className="news-carousel-arrow news-carousel-arrow-right" onClick={() => setCarouselIndex(prev => (prev + 1) % hotNews.length)}>
                <ChevronRight size={24} />
              </button>
              <div className="news-carousel-dots">
                {hotNews.map((_, idx) => (
                  <button
                    key={idx}
                    className={`news-carousel-dot ${idx === carouselIndex ? 'active' : ''}`}
                    onClick={() => setCarouselIndex(idx)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 来源筛选 */}
      <div className="news-source-filters">
        <button
          className={`news-source-filter ${!activeSource ? 'active' : ''}`}
          onClick={() => setActiveSource('')}
        >
          全部来源
        </button>
        {Object.entries(SOURCE_CONFIG).map(([key, config]) => (
          <button
            key={key}
            className={`news-source-filter ${activeSource === key ? 'active' : ''}`}
            style={{ '--source-color': config.color }}
            onClick={() => setActiveSource(activeSource === key ? '' : key)}
          >
            {config.label}
          </button>
        ))}
      </div>

      {/* 分类筛选 */}
      <div className="news-category-filters">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`news-category-filter ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 资讯瀑布流 */}
      {loading ? (
        <div className="news-loading"><Loader2 size={16} className="spinning" /> 雨何时停？</div>
      ) : (
        <div className="news-masonry">
          {filteredNews.length === 0 ? (
            <div className="news-empty">暂无资讯，点击刷新获取最新内容</div>
          ) : (
            filteredNews.map(news => {
              const sourceConfig = SOURCE_CONFIG[news.source] || {};
              const isArticle = news.type === 'article';
              const handleClick = () => {
                if (isArticle) navigate(`/news/${news.id}`);
                else if (news.link) window.open(news.link, '_blank');
              };

              return (
                <div
                  key={`${news.source}-${news.id || news.source_id}`}
                  className="news-masonry-item"
                  onClick={handleClick}
                  style={{ cursor: 'pointer' }}
                >
                  {news.cover && (
                    <div className="news-masonry-cover">
                      <img src={news.cover} alt="" loading="lazy" />
                    </div>
                  )}
                  <div className="news-masonry-body">
                    <div className="news-masonry-meta">
                      <span className="news-masonry-source" style={{ backgroundColor: getSourceColor(news.source) }}>
                        {getSourceLabel(news.source)}
                      </span>
                      {news.category && (
                        <span className="news-masonry-category">{news.category}</span>
                      )}
                    </div>
                    <h3 className="news-masonry-title">{news.title}</h3>
                    {news.summary && (
                      <p className="news-masonry-summary">{news.summary}</p>
                    )}
                    <div className="news-masonry-footer">
                      <span className="news-masonry-date">
                        <Calendar size={10} /> {news.created_at?.split('T')[0] || ''}
                      </span>
                      {isArticle ? (
                        <span className="news-masonry-action">阅读全文</span>
                      ) : news.link ? (
                        <a href={news.link} target="_blank" rel="noopener noreferrer" className="news-masonry-ext" onClick={e => e.stopPropagation()}>
                          <ExternalLink size={10} /> 原文
                        </a>
                      ) : null}
                      {news.extra?.rating && (
                        <span className="news-masonry-rating">★ {news.extra.rating}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      </> )}

      {/* 提交资讯 Modal */}
      {showApplyModal && (
        <div className="news-apply-overlay" onClick={handleCloseModal}>
          <div className="news-apply-modal" onClick={e => e.stopPropagation()}>
            <div className="news-apply-header">
              <h3>提交资讯</h3>
              <button className="news-apply-close" onClick={handleCloseModal}>×</button>
            </div>

            <div className="news-submit-tabs">
              <button
                className="news-submit-tab active"
              >
                🔗 短讯
              </button>
              <button
                className="news-submit-tab"
                onClick={() => navigate('/news/editor')}
              >
                📝 长文
              </button>
            </div>

            <div className="news-apply-body">
              {/* 封面图上传 */}
              <div className="news-form-group">
                <label>封面图</label>
                <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverUpload} />
                {coverPreview ? (
                  <div className="news-cover-preview">
                    <img src={coverPreview} alt="封面预览" />
                    <button className="news-cover-remove" onClick={() => { setCoverPreview(''); setApplyForm(prev => ({ ...prev, cover: '' })); }}><X size={12} /></button>
                  </div>
                ) : (
                  <div className="news-cover-upload" onClick={() => coverInputRef.current?.click()}>
                    <ImageIcon size={20} /> 点击上传封面图
                  </div>
                )}
                <input type="url" placeholder="或输入封面图 URL" value={applyForm.cover && !coverPreview ? applyForm.cover : ''} onChange={e => { setApplyForm(prev => ({ ...prev, cover: e.target.value })); setCoverPreview(''); }} className="news-cover-url-input" />
              </div>

              <div className="news-form-group">
                <label>资讯标题 *</label>
                <input type="text" placeholder="例如：XX新作发售" value={applyForm.title} onChange={e => setApplyForm(prev => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="news-form-group">
                <label>来源</label>
                <input type="text" placeholder="例如：电击文库" value={applyForm.source} onChange={e => setApplyForm(prev => ({ ...prev, source: e.target.value }))} />
              </div>
              <div className="news-form-group">
                <label>链接地址 *</label>
                <input type="url" placeholder="https://..." value={applyForm.link} onChange={e => setApplyForm(prev => ({ ...prev, link: e.target.value }))} />
              </div>
              <div className="news-form-group">
                <label>分类</label>
                <select value={applyForm.category || '业界动态'} onChange={e => setApplyForm(prev => ({ ...prev, category: e.target.value }))}>
                  {CATEGORIES.filter(c => c !== '全部').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="news-apply-footer">
              <button className="news-apply-cancel" onClick={handleCloseModal}>取消</button>
              <button className="news-apply-submit" onClick={handleSubmitApply} disabled={submitting}>
                {submitting ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
