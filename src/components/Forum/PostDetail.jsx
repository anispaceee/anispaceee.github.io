import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ForumService } from '../../services/api';
import { renderMarkdown } from '../../utils/renderMarkdown';
import { Heart, Loader2, AlertCircle, Trash2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import UserAvatar from '../Common/UserAvatar';
import RichTextEditor from '../Common/RichTextEditor';
import './PostDetail.css';

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [newReply, setNewReply] = useState('');
  const [replyParentId, setReplyParentId] = useState(null);
  const [replyMention, setReplyMention] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [replySort, setReplySort] = useState('oldest');
  const [replyLikes, setReplyLikes] = useState({});
  const [expandedReplies, setExpandedReplies] = useState({});
  const replyInputRef = useRef(null);

  const loadPost = async () => {
    try {
      const data = await ForumService.getPostById(id, replySort);
      setPost(data);
      const treeReplies = buildReplyTree(data.replies || []);
      setReplies(treeReplies);
      setLikeCount(data.likes || 0);
      const likeState = {};
      (data.replies || []).forEach(r => {
        likeState[r.id] = { liked: r.is_liked || false, count: r.likes || 0 };
      });
      setReplyLikes(likeState);
    } catch (err) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPost();
  }, [id, replySort]);

  const buildReplyTree = (flatReplies) => {
    const topReplies = [];
    const childMap = {};
    flatReplies.forEach(r => {
      if (r.parent_id) {
        if (!childMap[r.parent_id]) childMap[r.parent_id] = [];
        childMap[r.parent_id].push(r);
      } else {
        topReplies.push(r);
      }
    });
    return topReplies.map(r => ({
      ...r,
      children: childMap[r.id] || [],
    }));
  };

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
      await ForumService.addReply(id, newReply.trim(), replyParentId);
      await loadPost();
      setNewReply('');
      setReplyParentId(null);
      setReplyMention('');
    } catch (err) {
      setReplyError(err.message || '回复失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplyTo = (reply) => {
    if (!isAuthenticated) { openAuth(); return; }
    // 如果回复的是二级回复，parent_id 指向其父级（一级）
    setReplyParentId(reply.parent_id || reply.id);
    setReplyMention(`@${reply.author_name || '未知用户'} `);
    setNewReply(`@${reply.author_name || '未知用户'} `);
    replyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const textarea = document.querySelector('.reply-form .rich-textarea');
      if (textarea) textarea.focus();
    }, 100);
  };

  const handleToggleLike = async () => {
    if (!isAuthenticated) { openAuth(); return; }
    try {
      const result = await ForumService.toggleLike(id);
      setLiked(result.liked);
      setLikeCount(prev => result.liked ? prev + 1 : Math.max(0, prev - 1));
    } catch { /* 静默 */ }
  };

  const handleToggleReplyLike = async (replyId) => {
    if (!isAuthenticated) { openAuth(); return; }
    try {
      const result = await ForumService.toggleReplyLike(replyId);
      setReplyLikes(prev => ({
        ...prev,
        [replyId]: {
          liked: result.liked,
          count: Math.max(0, (prev[replyId]?.count || 0) + (result.liked ? 1 : -1)),
        },
      }));
    } catch { /* 静默 */ }
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

  const toggleExpandReplies = (parentId) => {
    setExpandedReplies(prev => ({ ...prev, [parentId]: !prev[parentId] }));
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
  const totalReplies = (post.replies || []).length;

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
          <div className="replies-header">
            <h2 className="replies-title">回复 ({totalReplies})</h2>
            <div className="reply-sort-pills">
              <button className={`reply-sort-pill ${replySort === 'oldest' ? 'active' : ''}`} onClick={() => setReplySort('oldest')}>最早</button>
              <button className={`reply-sort-pill ${replySort === 'newest' ? 'active' : ''}`} onClick={() => setReplySort('newest')}>最新</button>
              <button className={`reply-sort-pill ${replySort === 'hot' ? 'active' : ''}`} onClick={() => setReplySort('hot')}>最热</button>
            </div>
          </div>

          <div className="replies-list">
            {replies.map(reply => {
              const replyName = reply.author_name || '未知用户';
              const replyAvatar = reply.author_avatar || '';
              const replyLikeState = replyLikes[reply.id] || { liked: false, count: 0 };
              const hasChildren = reply.children && reply.children.length > 0;
              const isExpanded = expandedReplies[reply.id] !== false;

              return (
                <div key={reply.id} className="reply-item">
                  <div className="reply-main">
                    <UserAvatar userId={reply.author_id} src={replyAvatar} alt={replyName} size={32} className="reply-avatar" />
                    <div className="reply-body">
                      <div className="reply-header">
                        <span className="reply-name">{replyName}</span>
                        <span className="reply-time">{reply.created_at}</span>
                      </div>
                      <div className="reply-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(reply.content) }} />
                      <div className="reply-actions">
                        <button className="reply-action-btn" onClick={() => handleReplyTo(reply)}>
                          <MessageCircle size={12} /> 回复
                        </button>
                        <button className={`reply-action-btn like ${replyLikeState.liked ? 'liked' : ''}`} onClick={() => handleToggleReplyLike(reply.id)}>
                          <Heart size={12} /> {replyLikeState.count || 0}
                        </button>
                      </div>
                    </div>
                  </div>

                  {hasChildren && (
                    <div className="reply-nested">
                      {(isExpanded ? reply.children : reply.children.slice(0, 3)).map(child => {
                        const childName = child.author_name || '未知用户';
                        const childAvatar = child.author_avatar || '';
                        const childLikeState = replyLikes[child.id] || { liked: false, count: 0 };
                        return (
                          <div key={child.id} className="reply-nested-item">
                            <UserAvatar userId={child.author_id} src={childAvatar} alt={childName} size={24} className="reply-avatar small" />
                            <div className="reply-body">
                              <div className="reply-header">
                                <span className="reply-name">{childName}</span>
                                <span className="reply-time">{child.created_at}</span>
                              </div>
                              <div className="reply-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(child.content) }} />
                              <div className="reply-actions">
                                <button className="reply-action-btn" onClick={() => handleReplyTo(child)}>
                                  <MessageCircle size={12} /> 回复
                                </button>
                                <button className={`reply-action-btn like ${childLikeState.liked ? 'liked' : ''}`} onClick={() => handleToggleReplyLike(child.id)}>
                                  <Heart size={12} /> {childLikeState.count || 0}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {reply.children.length > 3 && (
                        <button className="reply-expand-btn" onClick={() => toggleExpandReplies(reply.id)}>
                          {isExpanded ? <><ChevronUp size={12} /> 收起</> : <><ChevronDown size={12} /> 展开 {reply.children.length} 条回复</>}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="reply-form" ref={replyInputRef}>
            {replyParentId && (
              <div className="reply-indicator">
                <span>回复 {replyMention.trim()}</span>
                <button className="reply-indicator-clear" onClick={() => { setReplyParentId(null); setReplyMention(''); setNewReply(''); }}>✕</button>
              </div>
            )}
            {replyError && (
              <div className="reply-error">
                <AlertCircle size={14} />
                <span>{replyError}</span>
              </div>
            )}
            <RichTextEditor
              value={newReply}
              onChange={setNewReply}
              placeholder={isAuthenticated ? '写下你的回复...' : '请先登录后再回复'}
              disabled={!isAuthenticated}
              rows={3}
            />
            <div className="reply-form-footer">
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
    </div>
  );
}
