import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Tag, ExternalLink } from 'lucide-react';
import { NewsService, StorageService } from '../../services/api';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import './NewsZone.css';

export default function NewsDetail() {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadArticle = async () => {
      setLoading(true);
      try {
        // 优先从后端 API 获取
        const data = await NewsService.getNewsById(id);
        setArticle(data);
      } catch {
        // 后端获取失败时，回退到 localStorage
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
  }, [id]);

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
      '新作速报': '#e6a23c',
      '业界动态': '#67c23a',
      '新作发售': '#f56c6c',
      '文学赏': '#909399',
    };
    return colors[cat] || '#409eff';
  };

  // 后端返回的 images 可能是 JSON 字符串
  const images = (() => {
    if (!article.images) return [];
    if (Array.isArray(article.images)) return article.images;
    try { return JSON.parse(article.images); } catch { return []; }
  })();

  return (
    <div className="news-zone">
      <div className="news-detail">
        <Link to="/" className="news-detail-back">
          <ArrowLeft size={14} /> 返回资讯
        </Link>

        <div className="news-detail-header">
          <div className="news-detail-meta">
            <span className="news-item-category" style={{ backgroundColor: getCategoryColor(article.category) }}>
              {article.category}
            </span>
            <span className="news-item-date"><Calendar size={10} /> {article.created_at || article.date}</span>
            {article.source && <span className="news-item-source">{article.source}</span>}
          </div>
          <h1 className="news-detail-title">{article.title}</h1>
        </div>

        {article.type === 'link' && article.link && (
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="news-detail-ext-link">
            <ExternalLink size={14} /> 查看原文链接
          </a>
        )}

        {article.content && (
          <div className="news-detail-content">
            <MarkdownRenderer content={article.content} />
          </div>
        )}

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
