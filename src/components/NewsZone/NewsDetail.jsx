import { useState, useEffect } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Tag, ExternalLink, Newspaper } from 'lucide-react';
import { NewsService } from '../../services/api';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import './NewsZone.css';

const SOURCE_CONFIG = {
  bangumi_calendar: { label: 'Bangumi 新番', color: '#f09199' },
  bangumi_hot: { label: 'Bangumi 热门', color: '#e8674f' },
  ymgal: { label: '月幕 Galgame', color: '#a855f7' },
  hikarinagi: { label: '光凪', color: '#f472b6' },
  cngal: { label: 'CnGal', color: '#06b6d4' },
  custom: { label: '站内资讯', color: '#10b981' },
};

export default function NewsDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  // 支持从资讯流直接传入 state（爬取的资讯可能不在 news 表中）
  const stateArticle = location.state?.article;

  useEffect(() => {
    // 如果有 state 传入的资讯数据，直接使用
    if (stateArticle) {
      setArticle(stateArticle);
      setLoading(false);
      return;
    }

    const loadArticle = async () => {
      setLoading(true);
      try {
        const data = await NewsService.getNewsById(id);
        setArticle({ ...data, source: 'custom' });
      } catch {
        try {
          const saved = localStorage.getItem('acg_custom_news');
          const customNews = saved ? JSON.parse(saved) : [];
          const found = customNews.find(n => String(n.id) === String(id));
          setArticle(found || null);
        } catch {
          setArticle(null);
        }
      } finally {
        setLoading(false);
      }
    };
    loadArticle();
  }, [id, stateArticle]);

  if (loading) {
    return (
      <div className="news-zone">
        <div className="news-detail-loading">加载中...</div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="news-zone">
        <div className="news-detail-error">
          <p>未找到该文章</p>
          <Link to="/" className="news-detail-back">
            <ArrowLeft size={14} /> 返回首页
          </Link>
        </div>
      </div>
    );
  }

  const getCategoryColor = (cat) => {
    const colors = {
      '新番导视': '#409eff',
      '热门推荐': '#e6a23c',
      '业界动态': '#67c23a',
      '新作速报': '#f56c6c',
      '新作发售': '#f56c6c',
      '文学赏': '#909399',
    };
    return colors[cat] || '#409eff';
  };

  const sourceLabel = SOURCE_CONFIG[article.source]?.label || article.source || '';
  const sourceColor = SOURCE_CONFIG[article.source]?.color || '#6b7280';

  // 后端返回的 images 可能是 JSON 字符串
  const images = (() => {
    if (!article.images) return [];
    if (Array.isArray(article.images)) return article.images;
    try { return JSON.parse(article.images); } catch { return []; }
  })();

  // 解析 extra
  const extra = (() => {
    if (!article.extra) return {};
    if (typeof article.extra === 'object') return article.extra;
    try { return JSON.parse(article.extra); } catch { return {}; }
  })();

  return (
    <div className="news-zone">
      <div className="news-detail">
        <Link to="/" className="news-detail-back">
          <ArrowLeft size={14} /> 返回资讯
        </Link>

        <div className="news-detail-header">
          <div className="news-detail-meta">
            {sourceLabel && (
              <span className="news-detail-source-badge" style={{ backgroundColor: sourceColor }}>
                {sourceLabel}
              </span>
            )}
            {article.category && (
              <span className="news-item-category" style={{ backgroundColor: getCategoryColor(article.category) }}>
                {article.category}
              </span>
            )}
            <span className="news-item-date">
              <Calendar size={10} /> {article.created_at?.split('T')[0] || article.date || ''}
            </span>
            {article.source && !sourceLabel && (
              <span className="news-item-source">{article.source}</span>
            )}
          </div>
          <h1 className="news-detail-title">{article.title}</h1>
        </div>

        {/* 封面图（爬取的资讯可能有 cover） */}
        {article.cover && (
          <div className="news-detail-cover">
            <img src={article.cover} alt={article.title} loading="lazy" />
          </div>
        )}

        {/* Extra 信息（评分、放送日等） */}
        {extra.rating && (
          <div className="news-detail-extra">
            <span className="news-detail-rating">★ {extra.rating}</span>
            {extra.rank && <span className="news-detail-rank">排名 #{extra.rank}</span>}
            {extra.doing && <span className="news-detail-doing">{extra.doing}人在看</span>}
            {extra.weekday && <span className="news-detail-weekday">{extra.weekday}放送</span>}
          </div>
        )}

        {/* 摘要 */}
        {article.summary && !article.content && (
          <div className="news-detail-summary">{article.summary}</div>
        )}

        {/* 外链 */}
        {article.link && (
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="news-detail-ext-link">
            <ExternalLink size={14} /> 查看原文链接
          </a>
        )}

        {/* 文章内容 */}
        {article.content && (
          <div className="news-detail-content">
            <MarkdownRenderer content={article.content} />
          </div>
        )}

        {/* 图片 */}
        {images.length > 0 && (
          <div className="news-detail-images">
            {images.map((img, idx) => (
              <img key={idx} src={img} alt={`图片 ${idx + 1}`} className="news-detail-image" loading="lazy" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
