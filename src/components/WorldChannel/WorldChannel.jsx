import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { WorldChannelService, UserService } from '../../services/api';
import { Globe, Plus, Heart, MessageCircle, Clock, TrendingUp, Image, X, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import UserAvatar from '../Common/UserAvatar';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import './WorldChannel.css';

const PAGE_SIZE = 20;

export default function WorldChannel() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState('latest');
  const [showNewPost, setShowNewPost] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newImages, setNewImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [expandedPost, setExpandedPost] = useState(null);
  const [repliesMap, setRepliesMap] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [replySubmitting, setReplySubmitting] = useState({});
  const [fullscreenImg, setFullscreenImg] = useState(null);
  const imageInputRef = useRef(null);

  const getUser = (userId) => UserService.getById(userId);

  const loadPosts = useCallback(async (pageNum = 1, append = false) => {
    try {
      const data = await WorldChannelService.getMessages(pageNum, PAGE_SIZE);
      const newPosts = data.messages || [];
      if (append) {
        setPosts(prev => [...prev, ...newPosts]);
      } else {
        setPosts(newPosts);
      }
      setHasMore(newPosts.length >= PAGE_SIZE);
    } catch {
      if (!append) setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadPosts(1, false);
  }, [loadPosts]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadPosts(nextPage, true);
  };

  const sortedPosts = [...posts].sort((a, b) => {
    if (sortBy === 'hot') return (b.likes || 0) - (a.likes || 0);
    return 0;
  });

  const handleNewPost = async () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!newContent.trim() && newImages.length === 0) return;
    setSubmitting(true);
    try {
      const sent = await WorldChannelService.sendMessage(newContent.trim());
      const newPost = {
        id: sent.id || Date.now(),
        author_id: currentUser.id,
        author_name: currentUser.name || currentUser.username,
        author_avatar: currentUser.avatar,
        content: newContent.trim(),
        images: newImages.map(img => img.preview),
        likes: 0,
        replies_count: 0,
        created_at: sent.created_at || new Date().toISOString(),
      };
      setPosts(prev => [newPost, ...prev]);
      setNewContent('');
      setNewImages([]);
      setShowNewPost(false);
    } catch {
      // 降级：本地添加
      const newPost = {
        id: Date.now(),
        author_id: currentUser.id,
        author_name: currentUser.name || currentUser.username,
        author_avatar: currentUser.avatar,
        content: newContent.trim(),
        images: newImages.map(img => img.preview),
        likes: 0,
        replies_count: 0,
        created_at: new Date().toISOString(),
      };
      setPosts(prev => [newPost, ...prev]);
      setNewContent('');
      setNewImages([]);
      setShowNewPost(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (postId) => {
    if (!isAuthenticated) { openAuth(); return; }
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, likes: (p.likes || 0) + (p.liked ? -1 : 1), liked: !p.liked }
        : p
    ));
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const remaining = 5 - newImages.length;
    const toProcess = files.slice(0, remaining);
    toProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setNewImages(prev => [...prev, { file, preview: ev.target.result, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (index) => {
    setNewImages(prev => prev.filter((_, i) => i !== index));
  };

  const toggleExpand = (postId) => {
    if (expandedPost === postId) {
      setExpandedPost(null);
    } else {
      setExpandedPost(postId);
    }
  };

  const handleReply = async (postId) => {
    if (!isAuthenticated) { openAuth(); return; }
    const content = replyInputs[postId]?.trim();
    if (!content) return;
    setReplySubmitting(prev => ({ ...prev, [postId]: true }));
    try {
      await WorldChannelService.sendMessage(content);
      // 添加回复到本地状态
      const newReply = {
        id: Date.now(),
        author_id: currentUser.id,
        author_name: currentUser.name || currentUser.username,
        author_avatar: currentUser.avatar,
        content,
        created_at: new Date().toISOString(),
      };
      setRepliesMap(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newReply],
      }));
      setReplyInputs(prev => ({ ...prev, [postId]: '' }));
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, replies_count: (p.replies_count || 0) + 1 } : p
      ));
    } catch {
      // 静默失败
    } finally {
      setReplySubmitting(prev => ({ ...prev, [postId]: false }));
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now - date;
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
      if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="world-channel">
      <div className="wc-header">
        <div className="wc-header-info">
          <Globe size={20} className="wc-header-icon" />
          <h1 className="wc-title">世界频道</h1>
        </div>
        <div className="wc-header-actions">
          <div className="wc-sort">
            <button className={`wc-sort-btn ${sortBy === 'latest' ? 'active' : ''}`} onClick={() => setSortBy('latest')}>
              <Clock size={14} /> 最新
            </button>
            <button className={`wc-sort-btn ${sortBy === 'hot' ? 'active' : ''}`} onClick={() => setSortBy('hot')}>
              <TrendingUp size={14} /> 最热
            </button>
          </div>
          <button className="wc-new-post-btn" onClick={() => { if (!isAuthenticated) { openAuth(); return; } setShowNewPost(!showNewPost); }}>
            <Plus size={16} /> 发帖
          </button>
        </div>
      </div>

      {showNewPost && (
        <div className="wc-new-post-form">
          <div className="wc-form-header">
            <UserAvatar userId={currentUser?.id} src={currentUser?.avatar} alt={currentUser?.name} size={36} />
            <span className="wc-form-author">{currentUser?.name || currentUser?.username}</span>
          </div>
          <textarea
            className="wc-form-textarea"
            placeholder="分享你的想法...（支持 Markdown 语法）"
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            rows={4}
          />
          {newImages.length > 0 && (
            <div className="wc-form-images">
              {newImages.map((img, i) => (
                <div key={i} className="wc-form-image-thumb">
                  <img src={img.preview} alt="" loading="lazy" />
                  <button className="wc-form-image-remove" onClick={() => removeImage(i)}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="wc-form-actions">
            <div className="wc-form-tools">
              <button className="wc-form-tool-btn" onClick={() => imageInputRef.current?.click()} disabled={newImages.length >= 5}>
                <Image size={16} /> 图片
              </button>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/gif" multiple onChange={handleImageSelect} hidden />
              <span className="wc-form-hint">{newImages.length}/5</span>
            </div>
            <div className="wc-form-submit-row">
              <button className="wc-form-cancel" onClick={() => { setShowNewPost(false); setNewContent(''); setNewImages([]); }}>取消</button>
              <button className="wc-form-submit" onClick={handleNewPost} disabled={(!newContent.trim() && newImages.length === 0) || submitting}>
                {submitting ? <><Loader2 size={14} className="spinning" /> 发布中...</> : '发布'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="wc-timeline">
        {loading ? (
          <div className="wc-loading">
            <Loader2 size={28} className="spinning" />
            <span>加载中...</span>
          </div>
        ) : sortedPosts.length === 0 ? (
          <div className="wc-empty">
            <Globe size={48} />
            <p>还没有人发帖，来发第一条吧！</p>
          </div>
        ) : (
          sortedPosts.map(post => {
            const author = post.author_name ? { name: post.author_name, avatar: post.author_avatar } : getUser(post.author_id);
            const isExpanded = expandedPost === post.id;
            const replies = repliesMap[post.id] || [];

            return (
              <div key={post.id} className="wc-post-card">
                <div className="wc-post-main">
                  <div className="wc-post-left">
                    <UserAvatar userId={post.author_id} src={author?.avatar} alt={author?.name} size={42} className="wc-post-avatar" />
                    <div className="wc-post-timeline-line" />
                  </div>
                  <div className="wc-post-body">
                    <div className="wc-post-header">
                      <span className="wc-post-author">{author?.name || '未知用户'}</span>
                      <span className="wc-post-time">{formatTime(post.created_at)}</span>
                    </div>
                    <div className="wc-post-content">
                      <MarkdownRenderer content={post.content} />
                    </div>
                    {post.images && post.images.length > 0 && (
                      <div className="wc-post-images">
                        {post.images.map((img, i) => (
                          <img key={i} src={img} alt="" className="wc-post-img" onClick={() => setFullscreenImg(img)} loading="lazy" />
                        ))}
                      </div>
                    )}
                    <div className="wc-post-actions">
                      <button className={`wc-action-btn ${post.liked ? 'liked' : ''}`} onClick={() => handleLike(post.id)}>
                        <Heart size={14} fill={post.liked ? 'currentColor' : 'none'} /> {post.likes || 0}
                      </button>
                      <button className="wc-action-btn" onClick={() => toggleExpand(post.id)}>
                        <MessageCircle size={14} /> {post.replies_count || 0}
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="wc-replies-section">
                        {replies.length > 0 && (
                          <div className="wc-replies-list">
                            {replies.map(reply => {
                              const replyAuthor = reply.author_name ? { name: reply.author_name, avatar: reply.author_avatar } : getUser(reply.author_id);
                              return (
                                <div key={reply.id} className="wc-reply-item">
                                  <UserAvatar userId={reply.author_id} src={replyAuthor?.avatar} alt={replyAuthor?.name} size={28} className="wc-reply-avatar" />
                                  <div className="wc-reply-body">
                                    <div className="wc-reply-header">
                                      <span className="wc-reply-author">{replyAuthor?.name || '未知用户'}</span>
                                      <span className="wc-reply-time">{formatTime(reply.created_at)}</span>
                                    </div>
                                    <div className="wc-reply-content">{reply.content}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="wc-reply-form">
                          <input
                            type="text"
                            placeholder={isAuthenticated ? '写下你的回复...' : '登录后回复'}
                            value={replyInputs[post.id] || ''}
                            onChange={e => setReplyInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && handleReply(post.id)}
                            disabled={!isAuthenticated}
                            className="wc-reply-input"
                          />
                          <button
                            className="wc-reply-send"
                            onClick={() => handleReply(post.id)}
                            disabled={!replyInputs[post.id]?.trim() || replySubmitting[post.id] || !isAuthenticated}
                          >
                            {replySubmitting[post.id] ? <Loader2 size={14} className="spinning" /> : <Send size={14} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {hasMore && posts.length > 0 && (
          <div className="wc-load-more">
            <button className="wc-load-more-btn" onClick={handleLoadMore}>加载更多</button>
          </div>
        )}
      </div>

      {fullscreenImg && (
        <div className="wc-fullscreen-overlay" onClick={() => setFullscreenImg(null)}>
          <img src={fullscreenImg} alt="" className="wc-fullscreen-img" onClick={e => e.stopPropagation()} />
          <button className="wc-fullscreen-close" onClick={() => setFullscreenImg(null)}><X size={24} /></button>
        </div>
      )}
    </div>
  );
}
