import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Tv, Book, Gamepad2, Plus, ExternalLink, Loader2, Newspaper, Calendar, RefreshCw, Flame, Sparkles, Bold, Italic, Link as LinkIcon, List, Quote, Image as ImageIcon, Eye, EyeOff, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { NewsService } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import './NewsZone.css';

// 来源配置
const SOURCE_CONFIG = {
  bangumi_calendar: { label: 'Bangumi 新番', color: '#f09199', icon: Tv },
  bangumi_hot: { label: 'Bangumi 热门', color: '#e8674f', icon: Flame },
  gamersky: { label: '游民星空', color: '#3b82f6', icon: Newspaper },
  '3dmgame': { label: '3DMGame', color: '#f59e0b', icon: Gamepad2 },
  ymgal: { label: '月幕 Galgame', color: '#a855f7', icon: Sparkles },
  cngal: { label: 'CnGal', color: '#06b6d4', icon: Book },
  custom: { label: '站内资讯', color: '#10b981', icon: Sparkles },
};

const CATEGORIES = ['全部', '新番导视', '热门推荐', '业界动态', '新作发售', 'Gal档案', '每周速报'];

export default function NewsZone() {
  const navigate = useNavigate();
  const { isAuthenticated, openAuth } = useApp();
  const [feedNews, setFeedNews] = useState([]);
  const [customNews, setCustomNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submitMode, setSubmitMode] = useState('link');
  const [applyForm, setApplyForm] = useState({ title: '', source: '', link: '', category: '', cover: '' });
  const [articleContent, setArticleContent] = useState('');
  const [articleImages, setArticleImages] = useState([]);
  const [coverPreview, setCoverPreview] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const carouselTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const textareaRef = useRef(null);

  // 合并所有资讯
  const allNews = [...feedNews, ...customNews.map(n => ({ ...n, source: 'custom' }))];
  const hotNews = allNews.filter(n => n.cover).slice(0, 5);

  // 筛选
  const filteredNews = allNews.filter(n => {
    if (activeSource && n.source !== activeSource) return false;
    if (activeCategory !== '全部' && n.category !== activeCategory) return false;
    return true;
  });

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [feedData, customData] = await Promise.allSettled([
        NewsService.getNewsFeed({ page: 1, limit: 50 }),
        NewsService.getCustomNews(1, 50),
      ]);
      if (feedData.status === 'fulfilled') {
        setFeedNews(feedData.value?.news || []);
      }
      if (customData.status === 'fulfilled') {
        setCustomNews(customData.value?.news || []);
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
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
    setArticleContent('');
    setArticleImages([]);
    setCoverPreview('');
    setShowPreview(false);
    setSubmitMode('link');
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
      if (submitMode === 'link') {
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
      } else {
        if (!applyForm.title.trim() || !articleContent.trim()) {
          alert('请填写标题和文章内容');
          return;
        }
        await NewsService.createNews({
          type: 'article',
          title: applyForm.title.trim(),
          source: applyForm.source.trim(),
          category: applyForm.category || '业界动态',
          content: articleContent,
          cover: applyForm.cover.trim() || coverPreview || '',
          images: articleImages,
        });
      }
      handleCloseModal();
      loadData();
    } catch (err) {
      alert(err.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (articleImages.length + files.length > 5) {
      alert('最多上传5张图片');
      return;
    }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setArticleImages(prev => {
          if (prev.length >= 5) return prev;
          return [...prev, ev.target.result];
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
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

  const removeImage = (index) => {
    setArticleImages(prev => prev.filter((_, i) => i !== index));
  };

  const insertMarkdown = (before, after = '', defaultText = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = articleContent.substring(start, end) || defaultText;
    const newText = articleContent.substring(0, start) + before + selected + after + articleContent.substring(end);
    setArticleContent(newText);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = start + before.length + selected.length + after.length;
      ta.setSelectionRange(cursorPos, cursorPos);
    });
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
        </div>
      </div>

      {/* 轮播热点 */}
      {hotNews.length > 0 && (
        <div className="news-carousel">
          <div className="news-carousel-track">
            {hotNews.map((news, idx) => (
              <div
                key={news.id || idx}
                className={`news-carousel-slide ${idx === carouselIndex ? 'active' : ''}`}
                style={{ backgroundImage: `url(${news.cover})` }}
                onClick={() => {
                  if (news.type === 'article') navigate(`/news/${news.id}`);
                  else if (news.link) window.open(news.link, '_blank');
                }}
              >
                <div className="news-carousel-overlay">
                  <span className="news-carousel-source" style={{ backgroundColor: getSourceColor(news.source) }}>
                    {getSourceLabel(news.source)}
                  </span>
                  <h3 className="news-carousel-title">{news.title}</h3>
                  {news.summary && <p className="news-carousel-summary">{news.summary}</p>}
                </div>
              </div>
            ))}
          </div>
          {hotNews.length > 1 && (
            <>
              <button className="news-carousel-arrow left" onClick={() => setCarouselIndex(prev => (prev - 1 + hotNews.length) % hotNews.length)}>
                <ChevronLeft size={18} />
              </button>
              <button className="news-carousel-arrow right" onClick={() => setCarouselIndex(prev => (prev + 1) % hotNews.length)}>
                <ChevronRight size={18} />
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

      {/* 资讯卡片流 */}
      {loading ? (
        <div className="news-loading"><Loader2 size={16} className="spinning" /> 雨何时停？</div>
      ) : (
        <div className="news-card-grid">
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
                  key={`${news.source}-${news.id}`}
                  className={`news-card ${news.cover ? 'news-card-with-cover' : ''}`}
                  onClick={handleClick}
                  style={{ cursor: 'pointer' }}
                >
                  {news.cover && (
                    <div className="news-card-cover">
                      <img src={news.cover} alt="" loading="lazy" />
                    </div>
                  )}
                  <div className="news-card-body">
                    <div className="news-card-meta">
                      <span className="news-card-source-badge" style={{ backgroundColor: getSourceColor(news.source) }}>
                        {getSourceLabel(news.source)}
                      </span>
                      {news.category && (
                        <span className="news-card-category">{news.category}</span>
                      )}
                      <span className="news-card-date">
                        <Calendar size={10} /> {news.created_at?.split('T')[0] || ''}
                      </span>
                    </div>
                    <h3 className="news-card-title">{news.title}</h3>
                    {news.summary && (
                      <p className="news-card-summary">{news.summary}</p>
                    )}
                    <div className="news-card-footer">
                      {isArticle ? (
                        <span className="news-card-action">阅读全文</span>
                      ) : news.link ? (
                        <span className="news-card-action" onClick={e => e.stopPropagation()}>
                          <a href={news.link} target="_blank" rel="noopener noreferrer" className="news-card-ext-link">
                            <ExternalLink size={12} /> 查看原文
                          </a>
                        </span>
                      ) : null}
                      {news.extra?.rating && (
                        <span className="news-card-rating">★ {news.extra.rating}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

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
                className={`news-submit-tab ${submitMode === 'link' ? 'active' : ''}`}
                onClick={() => setSubmitMode('link')}
              >
                🔗 短讯
              </button>
              <button
                className={`news-submit-tab ${submitMode === 'article' ? 'active' : ''}`}
                onClick={() => setSubmitMode('article')}
              >
                📝 长文
              </button>
            </div>

            <div className="news-apply-body">
              {/* 封面图上传（两种模式共用） */}
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

              {submitMode === 'link' ? (
                <>
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
                </>
              ) : (
                <>
                  <div className="news-form-group">
                    <label>文章标题 *</label>
                    <input type="text" placeholder="例如：XX新作深度评测" value={applyForm.title} onChange={e => setApplyForm(prev => ({ ...prev, title: e.target.value }))} />
                  </div>
                  <div className="news-form-group">
                    <label>来源</label>
                    <input type="text" placeholder="可选，例如：本人原创" value={applyForm.source} onChange={e => setApplyForm(prev => ({ ...prev, source: e.target.value }))} />
                  </div>
                  <div className="news-form-group">
                    <label>分类</label>
                    <select value={applyForm.category || '业界动态'} onChange={e => setApplyForm(prev => ({ ...prev, category: e.target.value }))}>
                      {CATEGORIES.filter(c => c !== '全部').map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="news-form-group">
                    <label>文章内容 *</label>
                    <div className="news-article-toolbar">
                      <button className="news-toolbar-btn" onClick={() => insertMarkdown('**', '**', '粗体')} title="粗体"><Bold size={14} /></button>
                      <button className="news-toolbar-btn" onClick={() => insertMarkdown('*', '*', '斜体')} title="斜体"><Italic size={14} /></button>
                      <button className="news-toolbar-btn" onClick={() => insertMarkdown('[', '](url)', '链接文字')} title="链接"><LinkIcon size={14} /></button>
                      <button className="news-toolbar-btn" onClick={() => insertMarkdown('- ', '', '列表项')} title="列表"><List size={14} /></button>
                      <button className="news-toolbar-btn" onClick={() => insertMarkdown('> ', '', '引用')} title="引用"><Quote size={14} /></button>
                      <button className="news-toolbar-btn" onClick={() => insertMarkdown('### ', '', '标题')} title="标题"><Bold size={14} /></button>
                      <button className="news-toolbar-btn" onClick={() => fileInputRef.current?.click()} title="上传图片"><ImageIcon size={14} /></button>
                      <button className={`news-toolbar-btn ${showPreview ? 'active' : ''}`} onClick={() => setShowPreview(!showPreview)} title="预览">
                        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageUpload} />
                    {showPreview ? (
                      <div className="news-preview">
                        <MarkdownRenderer content={articleContent} />
                        {!articleContent && <p style={{ color: 'var(--text-quaternary)', textAlign: 'center' }}>暂无内容</p>}
                      </div>
                    ) : (
                      <textarea ref={textareaRef} className="news-article-textarea" placeholder="支持 Markdown 语法，输入文章内容..." value={articleContent} onChange={e => setArticleContent(e.target.value)} />
                    )}
                    {articleImages.length > 0 && (
                      <div className="news-image-previews">
                        {articleImages.map((img, idx) => (
                          <div key={idx} className="news-image-thumb">
                            <img src={img} alt={`预览 ${idx + 1}`} loading="lazy" />
                            <button className="news-image-remove" onClick={() => removeImage(idx)}><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {articleImages.length < 5 && (
                      <div className="news-image-upload" onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon size={16} /> 点击上传图片（最多5张）
                      </div>
                    )}
                  </div>
                </>
              )}
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
