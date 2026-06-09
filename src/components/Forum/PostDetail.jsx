import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ForumService, UserService } from '../../services/api';
import { safeUrl, sanitizeHtml } from '../../utils/sanitize.js';
import { MessageCircle, TrendingUp, Heart, Loader2, AlertCircle } from 'lucide-react';
import './PostDetail.css';

/** 将 Markdown 文本渲染为 HTML（与 Forum.jsx PostPreview 一致） */
function renderMarkdown(text) {
  if (!text) return '';
  let html = sanitizeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // 图片语法 ![alt](url) 必须在链接语法之前处理
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
      safeUrl(url) ? `<img src="${safeUrl(url)}" alt="${alt}" style="max-width:100%;border-radius:8px;margin:8px 0" loading="lazy" />` : ''
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) =>
      safeUrl(url) ? `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${t}</a>` : t
    )
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br/>');
  html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
  return html;
}

export default function PostDetail() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [newReply, setNewReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadPost = async () => {
      try {
        const data = await ForumService.getPostById(id);
        setPost(data);
        setReplies(data.replies || []);
      } catch (err) {
        setError(err.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };
    loadPost();
  }, [id]);

  const getCategoryLabel = (cat) => {
    const map = { game: '游戏', anime: '动画', novel: '小说', chat: '吹水' };
    return map[cat] || cat;
  };

  const handleReply = async () => {
    if (!newReply.trim()) return;
    setSubmitting(true);
    try {
      await ForumService.addReply(id, newReply.trim());
      // 重新加载帖子获取最新回复
      const data = await ForumService.getPostById(id);
      setPost(data);
      setReplies(data.replies || []);
      setNewReply('');
    } catch (err) {
      alert(err.message || '回复失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="post-detail-page">
        <div className="post-detail-container" style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader2 size={32} className="spinning" />
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="post-detail-page">
        <div className="post-not-found">
          <AlertCircle size={48} style={{ color: 'var(--error)' }} />
          <h2>{error || '帖子不存在'}</h2>
          <Link to="/forum" className="back-link">返回交流区</Link>
        </div>
      </div>
    );
  }

  const authorName = post.author_name || '未知用户';
  const authorAvatar = post.author_avatar || '';

  return (
    <div className="post-detail-page">
      <div className="post-detail-container">
        <div className="post-detail-back">
          <Link to="/forum">← 返回交流区</Link>
        </div>

        <div className="post-detail-card">
          <div className="detail-header">
            <span className={`post-cat-tag ${post.category}`}>
              {getCategoryLabel(post.category)}
            </span>
            <h1 className="detail-title">{post.title}</h1>
          </div>

          <div className="detail-author">
            <img src={authorAvatar} alt="" className="detail-author-avatar" onError={e => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E'; }} />
            <div className="detail-author-info">
              <span className="detail-author-name">{authorName}</span>
              <span className="detail-time">{post.created_at}</span>
            </div>
          </div>

          <div className="detail-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />

          <div className="detail-stats">
            <span>💬 {post.replies_count || 0} 回复</span>
            <span>👁 {post.views || 0} 浏览</span>
            <span>❤️ {post.likes || 0} 喜欢</span>
          </div>
        </div>

        <div className="replies-section">
          <h2 className="replies-title">回复 ({replies.length})</h2>

          <div className="replies-list">
            {replies.map(reply => {
              const replyName = reply.author_name || '未知用户';
              const replyAvatar = reply.author_avatar || '';
              return (
                <div key={reply.id} className="reply-item">
                  <img src={replyAvatar} alt="" className="reply-avatar" onError={e => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="%23f9f3f5"%3E%3Crect width="36" height="36" rx="18"/%3E%3Ctext x="18" y="22" text-anchor="middle" fill="%23c8bfcc" font-size="10"%3E%3F%3C/text%3E%3C/svg%3E'; }} />
                  <div className="reply-body">
                    <div className="reply-header">
                      <span className="reply-name">{replyName}</span>
                      <span className="reply-time">{reply.created_at}</span>
                    </div>
                    <div className="reply-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(reply.content) }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="reply-form">
            <textarea
              placeholder="写下你的回复..."
              value={newReply}
              onChange={e => setNewReply(e.target.value)}
              className="reply-input"
              rows={3}
            />
            <button className="reply-btn" onClick={handleReply} disabled={!newReply.trim() || submitting}>
              {submitting ? '回复中...' : '回复'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
