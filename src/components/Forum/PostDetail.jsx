import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ForumService } from '../../services/api';
import { renderMarkdown } from '../../utils/renderMarkdown';
import { Heart, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import UserAvatar from '../Common/UserAvatar';
import './PostDetail.css';

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [newReply, setNewReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const loadPost = async () => {
      try {
        const data = await ForumService.getPostById(id);
        setPost(data);
        setReplies(data.replies || []);
        setLikeCount(data.likes || 0);
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

  const isAuthor = currentUser && post && currentUser.id === post.author_id;

  const handleReply = async () => {
    if (!newReply.trim()) return;

    if (!isAuthenticated) {
      setReplyError('请先登录后再回复');
      openAuth();
      return;
    }

    setSubmitting(true);
    setReplyError('');
    try {
      await ForumService.addReply(id, newReply.trim());
      const data = await ForumService.getPostById(id);
      setPost(data);
      setReplies(data.replies || []);
      setNewReply('');
    } catch (err) {
      setReplyError(err.message || '回复失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleLike = async () => {
    if (!isAuthenticated) {
      openAuth();
      return;
    }
    try {
      const result = await ForumService.toggleLike(id);
      setLiked(result.liked);
      setLikeCount(prev => result.liked ? prev + 1 : Math.max(0, prev - 1));
    } catch {
      // 静默失败
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await ForumService.deletePost(id);
      navigate('/forum');
    } catch (err) {
      alert(err.message || '删除失败');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="post-detail-page">
        <div className="post-detail-container" style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader2 size={32} className="spinning" />
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>雨何时停？</p>
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
          <Link to="/forum" className="back-link">返回放課後</Link>
        </div>
      </div>
    );
  }

  const authorName = post.author_name || '未知用户';
  const authorAvatar = post.author_avatar || '';
  const postImages = Array.isArray(post.images) ? post.images : [];
  const postTags = Array.isArray(post.tags) ? post.tags : [];

  return (
    <div className="post-detail-page">
      <div className="post-detail-container">
        <div className="post-detail-back">
          <Link to="/forum">← 返回放課後</Link>
        </div>

        <div className="post-detail-card">
          <div className="detail-header">
            <span className={`post-cat-tag ${post.category}`}>
              {getCategoryLabel(post.category)}
            </span>
            <h1 className="detail-title">{post.title}</h1>
          </div>

          <div className="detail-author">
            <UserAvatar userId={post.author_id} src={authorAvatar} alt={authorName} size={40} className="detail-author-avatar" />
            <div className="detail-author-info">
              <span className="detail-author-name">{authorName}</span>
              <span className="detail-time">{post.created_at}</span>
            </div>
            {isAuthor && (
              <button className="detail-delete-btn" onClick={() => setShowDeleteConfirm(true)} title="删除帖子">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="detail-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />

          {postImages.length > 0 && (
            <div className="detail-images">
              {postImages.map((url, i) => (
                <img key={i} src={url} alt="" className="detail-img" loading="lazy" />
              ))}
            </div>
          )}

          {postTags.length > 0 && (
            <div className="detail-tags">
              {postTags.map(tag => (
                <span key={tag} className="post-tag">#{tag}</span>
              ))}
            </div>
          )}

          <div className="detail-stats">
            <span>💬 {post.replies_count || 0} 回复</span>
            <span>👁 {post.views || 0} 浏览</span>
            <button className={`detail-like-btn ${liked ? 'liked' : ''}`} onClick={handleToggleLike}>
              ❤️ {likeCount} 喜欢
            </button>
          </div>
        </div>

        {showDeleteConfirm && (
          <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
            <div className="delete-confirm-dialog" onClick={e => e.stopPropagation()}>
              <h3>确认删除</h3>
              <p>删除后无法恢复，帖子及其所有回复将被永久移除。</p>
              <div className="delete-confirm-actions">
                <button className="delete-cancel-btn" onClick={() => setShowDeleteConfirm(false)}>取消</button>
                <button className="delete-confirm-btn" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <><Loader2 size={14} className="spinning" /> 删除中...</> : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="replies-section">
          <h2 className="replies-title">回复 ({replies.length})</h2>

          <div className="replies-list">
            {replies.map(reply => {
              const replyName = reply.author_name || '未知用户';
              const replyAvatar = reply.author_avatar || '';
              return (
                <div key={reply.id} className="reply-item">
                  <UserAvatar userId={reply.author_id} src={replyAvatar} alt={replyName} size={32} className="reply-avatar" />
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
            {replyError && (
              <div className="reply-error">
                <AlertCircle size={14} />
                <span>{replyError}</span>
              </div>
            )}
            <textarea
              placeholder={isAuthenticated ? '写下你的回复...' : '请先登录后再回复'}
              value={newReply}
              onChange={e => setNewReply(e.target.value)}
              className="reply-input"
              rows={3}
              disabled={!isAuthenticated}
            />
            <button
              className="reply-btn"
              onClick={isAuthenticated ? handleReply : () => openAuth()}
              disabled={!newReply.trim() || submitting}
            >
              {submitting ? '回复中...' : isAuthenticated ? '回复' : '登录后回复'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
