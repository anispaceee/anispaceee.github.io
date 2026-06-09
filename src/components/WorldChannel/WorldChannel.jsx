import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { WorldChannelService, UserService } from '../../services/api';
import { Globe, Image, X, Send, Loader2, Users as UsersIcon } from 'lucide-react';
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
  const messagesEndRef = useRef(null);

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

  const isOwnMessage = (post) => {
    return currentUser && post.author_id === currentUser.id;
  };

  return (
    <div className="world-channel">
      {/* 聊天头部 */}
      <div className="wc-chat-header">
        <div className="wc-chat-header-left">
          <Globe size={20} className="wc-chat-header-icon" />
          <h1 className="wc-chat-title">世界频道</h1>
          <span className="wc-online-badge"><UsersIcon size={12} /> {posts.length}+</span>
        </div>
      </div>

      {/* 消息区域 */}
      <div className="wc-messages-area">
        {loading ? (
          <div className="wc-loading">
            <Loader2 size={28} className="spinning" />
            <span>加载中...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="wc-empty">
            <Globe size={48} />
            <p>还没有人发帖，来发第一条吧！</p>
          </div>
        ) : (
          posts.map(post => {
            const author = post.author_name ? { name: post.author_name, avatar: post.author_avatar } : getUser(post.author_id);
            const isOwn = isOwnMessage(post);
            const isExpanded = expandedPost === post.id;
            const replies = repliesMap[post.id] || [];

            return (
              <div key={post.id} className={`wc-message ${isOwn ? 'wc-message-self' : 'wc-message-other'}`}>
                {!isOwn && (
                  <UserAvatar userId={post.author_id} src={author?.avatar} alt={author?.name} size={36} className="wc-msg-avatar" />
                )}
                <div className="wc-msg-body">
                  <div className="wc-msg-header">
                    {!isOwn && <span className="wc-msg-name">{author?.name || '未知用户'}</span>}
                    <span className="wc-msg-time">{formatTime(post.created_at)}</span>
                  </div>
                  <div className={`wc-msg-bubble ${isOwn ? 'wc-bubble-self' : 'wc-bubble-other'}`}>
                    <div className="wc-msg-content">
                      <MarkdownRenderer content={post.content} />
                    </div>
                    {post.images && post.images.length > 0 && (
                      <div className="wc-msg-images">
                        {post.images.map((img, i) => (
                          <img key={i} src={img} alt="" className="wc-msg-img" onClick={() => setFullscreenImg(img)} loading="lazy" />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="wc-msg-actions">
                    <button className={`wc-msg-action-btn ${post.liked ? 'liked' : ''}`} onClick={() => handleLike(post.id)}>
                      ❤ {post.likes || 0}
                    </button>
                    <button className="wc-msg-action-btn" onClick={() => toggleExpand(post.id)}>
                      💬 {post.replies_count || 0}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="wc-replies-section">
                      {replies.length > 0 && (
                        <div className="wc-replies-list">
                          {replies.map(reply => {
                            const replyAuthor = reply.author_name ? { name: reply.author_name, avatar: reply.author_avatar } : getUser(reply.author_id);
                            const isReplyOwn = currentUser && reply.author_id === currentUser.id;
                            return (
                              <div key={reply.id} className={`wc-reply-msg ${isReplyOwn ? 'wc-reply-self' : ''}`}>
                                {!isReplyOwn && <UserAvatar userId={reply.author_id} src={replyAuthor?.avatar} alt={replyAuthor?.name} size={24} className="wc-reply-avatar" />}
                                <div className={`wc-reply-bubble ${isReplyOwn ? 'wc-bubble-self' : 'wc-bubble-other'}`}>
                                  {!isReplyOwn && <span className="wc-reply-name">{replyAuthor?.name || '未知用户'}</span>}
                                  <span className="wc-reply-text">{reply.content}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="wc-reply-form">
                        <input
                          type="text"
                          placeholder={isAuthenticated ? '回复...' : '登录后回复'}
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
            );
          })
        )}

        {hasMore && posts.length > 0 && (
          <div className="wc-load-more">
            <button className="wc-load-more-btn" onClick={handleLoadMore}>加载更多</button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="wc-input-area">
        {showNewPost ? (
          <div className="wc-input-expanded">
            <textarea
              className="wc-input-textarea"
              placeholder="分享你的想法...（支持 Markdown 语法）"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={3}
              autoFocus
            />
            {newImages.length > 0 && (
              <div className="wc-input-images">
                {newImages.map((img, i) => (
                  <div key={i} className="wc-input-image-thumb">
                    <img src={img.preview} alt="" loading="lazy" />
                    <button className="wc-input-image-remove" onClick={() => removeImage(i)}><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="wc-input-actions">
              <div className="wc-input-tools">
                <button className="wc-input-tool-btn" onClick={() => imageInputRef.current?.click()} disabled={newImages.length >= 5}>
                  <Image size={16} />
                </button>
                <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/gif" multiple onChange={handleImageSelect} hidden />
                <span className="wc-input-hint">{newImages.length}/5</span>
              </div>
              <div className="wc-input-submit-row">
                <button className="wc-input-cancel" onClick={() => { setShowNewPost(false); setNewContent(''); setNewImages([]); }}>取消</button>
                <button className="wc-input-send" onClick={handleNewPost} disabled={(!newContent.trim() && newImages.length === 0) || submitting}>
                  {submitting ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} 发送
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="wc-input-bar">
            <button className="wc-input-img-btn" onClick={() => imageInputRef.current?.click()}>
              <Image size={18} />
            </button>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/gif" multiple onChange={handleImageSelect} hidden />
            <input
              type="text"
              className="wc-input-pill"
              placeholder={isAuthenticated ? '说点什么...' : '登录后发言'}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              onFocus={() => { if (newContent.trim() || newImages.length > 0) setShowNewPost(true); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isAuthenticated) { openAuth(); return; }
                  setShowNewPost(true);
                }
              }}
              readOnly={!isAuthenticated}
              onClick={() => { if (!isAuthenticated) openAuth(); }}
            />
            <button className="wc-input-send-pill" onClick={() => { if (!isAuthenticated) { openAuth(); return; } if (newContent.trim()) { setShowNewPost(true); } else setShowNewPost(true); }}>
              <Send size={16} />
            </button>
          </div>
        )}
      </div>

      {/* 全屏图片 */}
      {fullscreenImg && (
        <div className="wc-fullscreen-overlay" onClick={() => setFullscreenImg(null)}>
          <img src={fullscreenImg} alt="" className="wc-fullscreen-img" onClick={e => e.stopPropagation()} />
          <button className="wc-fullscreen-close" onClick={() => setFullscreenImg(null)}><X size={24} /></button>
        </div>
      )}
    </div>
  );
}
