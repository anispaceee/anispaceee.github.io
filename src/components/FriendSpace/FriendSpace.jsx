import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { FriendPostService, FriendService } from '../../services/api';
import { Heart, MessageSquare, Share2, Lock, Globe, MoreHorizontal, Send, Image, X, Eye, Users, Plus, ChevronDown, Search, Loader2, Trash2 } from 'lucide-react';
import './FriendSpace.css';

const FALLBACK_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const VISIBILITY = { friends: 'friends', public: 'public', private: 'private' };
const VISIBILITY_LABELS = { friends: '仅好友', public: '公开', private: '仅自己' };

function formatTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return Math.floor(diff / 86400000) + '天前';
}

function parseImages(images) {
  if (Array.isArray(images)) return images;
  if (typeof images === 'string' && images) {
    try { const arr = JSON.parse(images); return Array.isArray(arr) ? arr : []; } catch { return []; }
  }
  return [];
}

export default function FriendSpace() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const navigate = useNavigate();

  // 动态列表
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 发动态
  const [newContent, setNewContent] = useState('');
  const [newVisibility, setNewVisibility] = useState('friends');
  const [showComposer, setShowComposer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 评论
  const [expandedComments, setExpandedComments] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [commentsData, setCommentsData] = useState({}); // { postId: [comments] }
  const [commentSubmitting, setCommentSubmitting] = useState({});

  // 筛选
  const [filter, setFilter] = useState('all');

  // 找好友搜索
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // 图片URL输入
  const [newImages, setNewImages] = useState([]);
  const [imageUrlInput, setImageUrlInput] = useState('');

  // 删除菜单
  const [showMenu, setShowMenu] = useState(null);
  const menuRef = useRef(null);

  // 加载动态
  const loadPosts = useCallback(async (pageNum = 1, append = false) => {
    if (!isAuthenticated) { setLoading(false); return; }
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await FriendPostService.getFeed(pageNum, 20);
      const newPosts = data.posts || [];
      const total = data.pagination?.total || 0;

      if (append) {
        setPosts(prev => [...prev, ...newPosts]);
      } else {
        setPosts(newPosts);
      }
      setHasMore(newPosts.length >= 20 && (append ? posts.length + newPosts.length : newPosts.length) < total);
      setPage(pageNum);
    } catch {
      if (!append) setPosts([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadPosts(1);
  }, [loadPosts]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 发动态
  const handlePost = async () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!newContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      await FriendPostService.createPost(newContent.trim(), newVisibility, newImages);
      setNewContent('');
      setNewImages([]);
      setImageUrlInput('');
      setShowComposer(false);
      loadPosts(1);
    } catch (err) {
      alert('发布失败：' + (err.message || '未知错误'));
    } finally {
      setSubmitting(false);
    }
  };

  // 点赞
  const toggleLike = async (postId) => {
    if (!isAuthenticated) { openAuth(); return; }
    try {
      const result = await FriendPostService.toggleLike(postId);
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return {
          ...p,
          liked_by_me: result.liked,
          likes_count: (p.likes_count || 0) + (result.liked ? 1 : -1),
        };
      }));
    } catch { /* no-op */ }
  };

  // 加载评论
  const loadComments = async (postId) => {
    if (expandedComments[postId]) {
      setExpandedComments(prev => ({ ...prev, [postId]: false }));
      return;
    }
    try {
      const comments = await FriendPostService.getComments(postId);
      setCommentsData(prev => ({ ...prev, [postId]: Array.isArray(comments) ? comments : [] }));
      setExpandedComments(prev => ({ ...prev, [postId]: true }));
    } catch {
      setExpandedComments(prev => ({ ...prev, [postId]: true }));
    }
  };

  // 发评论
  const addComment = async (postId) => {
    if (!isAuthenticated) { openAuth(); return; }
    const content = commentInputs[postId]?.trim();
    if (!content || commentSubmitting[postId]) return;
    setCommentSubmitting(prev => ({ ...prev, [postId]: true }));
    try {
      await FriendPostService.addComment(postId, content);
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      // 刷新评论
      const comments = await FriendPostService.getComments(postId);
      setCommentsData(prev => ({ ...prev, [postId]: Array.isArray(comments) ? comments : [] }));
      // 更新评论计数
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
    } catch { /* no-op */ }
    setCommentSubmitting(prev => ({ ...prev, [postId]: false }));
  };

  // 删除动态
  const handleDeletePost = async (postId) => {
    if (!confirm('确定删除这条动态吗？')) return;
    try {
      await FriendPostService.deletePost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      setShowMenu(null);
    } catch (err) {
      alert('删除失败：' + (err.message || '未知错误'));
    }
  };

  // 搜索用户
  const handleSearchUsers = () => {
    if (!searchKeyword.trim()) return;
    setSearchLoading(true);
    FriendService.searchUsers(searchKeyword.trim()).then(data => {
      setSearchResults(Array.isArray(data) ? data : []);
    }).catch(() => {
      setSearchResults([]);
    }).finally(() => setSearchLoading(false));
  };

  // 筛选
  const filteredPosts = filter === 'all' ? posts : posts.filter(p => p.visibility === filter);

  // 未登录
  if (!isAuthenticated) {
    return (
      <div className="friend-space-page">
        <div className="friend-space-empty">
          <Users size={48} />
          <p>请先登录</p>
          <span>登录后即可查看好友动态</span>
          <button className="friend-space-compose-btn" style={{ marginTop: 12 }} onClick={() => openAuth()}>登录</button>
        </div>
      </div>
    );
  }

  return (
    <div className="friend-space-page">
      <div className="friend-space-header">
        <div className="friend-space-title">
          <Users size={22} />
          <h1>LeMU</h1>
          <span className="friend-space-subtitle">好友间的私密动态</span>
        </div>
        <div className="friend-space-header-actions">
          <button className="friend-space-search-btn" onClick={() => setShowSearchDialog(true)}>
            <Search size={16} /> 找好友
          </button>
          <button className="friend-space-compose-btn" onClick={() => setShowComposer(!showComposer)}>
            <Plus size={16} /> 发动态
          </button>
        </div>
      </div>

      {showComposer && (
        <div className="friend-space-composer">
          <div className="composer-header">
            <img src={currentUser?.avatar || FALLBACK_AVATAR} alt="" className="composer-avatar" loading="lazy" />
            <span className="composer-name">{currentUser?.name || '匿名'}</span>
            <div className="composer-visibility">
              <button className={`visibility-btn ${newVisibility === 'friends' ? 'active' : ''}`} onClick={() => setNewVisibility('friends')}>
                <Lock size={12} /> 仅好友
              </button>
              <button className={`visibility-btn ${newVisibility === 'public' ? 'active' : ''}`} onClick={() => setNewVisibility('public')}>
                <Globe size={12} /> 公开
              </button>
              <button className={`visibility-btn ${newVisibility === 'private' ? 'active' : ''}`} onClick={() => setNewVisibility('private')}>
                <Lock size={12} /> 仅自己
              </button>
            </div>
          </div>
          <textarea className="composer-input" placeholder="分享你的想法..." value={newContent} onChange={e => setNewContent(e.target.value)} rows={3} />
          <div className="composer-actions">
            <div className="composer-image-input">
              <button className="composer-tool" title="添加图片URL" onClick={() => {
                if (imageUrlInput.trim()) {
                  setNewImages(prev => [...prev, imageUrlInput.trim()]);
                  setImageUrlInput('');
                }
              }}><Image size={16} /></button>
              <input
                type="text"
                placeholder="粘贴图片URL..."
                value={imageUrlInput}
                onChange={e => setImageUrlInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && imageUrlInput.trim()) {
                    setNewImages(prev => [...prev, imageUrlInput.trim()]);
                    setImageUrlInput('');
                  }
                }}
                className="composer-image-url-input"
              />
            </div>
            {newImages.length > 0 && (
              <div className="composer-image-previews">
                {newImages.map((img, i) => (
                  <div key={i} className="composer-image-preview-item">
                    <img src={img} alt="" />
                    <button className="composer-image-remove" onClick={() => setNewImages(prev => prev.filter((_, idx) => idx !== i))}><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
            <button className="composer-submit" onClick={handlePost} disabled={!newContent.trim() || submitting}>
              {submitting ? <Loader2 size={14} className="spin" /> : '发布'}
            </button>
          </div>
        </div>
      )}

      <div className="friend-space-filters">
        <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>全部</button>
        <button className={`filter-btn ${filter === 'friends' ? 'active' : ''}`} onClick={() => setFilter('friends')}><Lock size={12} /> 好友</button>
        <button className={`filter-btn ${filter === 'public' ? 'active' : ''}`} onClick={() => setFilter('public')}><Globe size={12} /> 公开</button>
        <button className={`filter-btn ${filter === 'private' ? 'active' : ''}`} onClick={() => setFilter('private')}><Lock size={12} /> 仅自己</button>
      </div>

      <div className="friend-space-feed">
        {loading ? (
          <div className="friend-space-empty">
            <Loader2 size={32} className="spin" />
            <p>雨何时停？</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="friend-space-empty">
            <Users size={32} />
            <p>暂无动态</p>
            <span>发布第一条动态吧~</span>
          </div>
        ) : (
          <>
            {filteredPosts.map(post => {
              const isMine = currentUser && post.user_id === currentUser.id;
              const isLiked = post.liked_by_me;
              const postComments = commentsData[post.id] || [];
              return (
                <div key={post.id} className="space-post">
                  <div className="space-post-header">
                    <img
                      src={post.author_avatar || FALLBACK_AVATAR}
                      alt=""
                      className="space-post-avatar"
                      loading="lazy"
                      onError={e => { e.target.src = FALLBACK_AVATAR; }}
                      onClick={() => post.user_id !== currentUser?.id && navigate(`/user/${post.user_id}`)}
                      style={{ cursor: post.user_id !== currentUser?.id ? 'pointer' : 'default' }}
                    />
                    <div className="space-post-author">
                      <span
                        className="space-post-name"
                        onClick={() => post.user_id !== currentUser?.id && navigate(`/user/${post.user_id}`)}
                        style={{ cursor: post.user_id !== currentUser?.id ? 'pointer' : 'default' }}
                      >
                        {post.author_name || '未知用户'}
                      </span>
                      <span className="space-post-meta">
                        {formatTime(post.created_at)} · {post.visibility === 'friends' ? <><Lock size={10} /> 仅好友</> : post.visibility === 'private' ? <><Lock size={10} /> 仅自己</> : <><Globe size={10} /> 公开</>}
                      </span>
                    </div>
                    {isMine && (
                      <div style={{ position: 'relative', marginLeft: 'auto' }} ref={menuRef}>
                        <button className="space-action" onClick={() => setShowMenu(showMenu === post.id ? null : post.id)}>
                          <MoreHorizontal size={16} />
                        </button>
                        {showMenu === post.id && (
                          <div style={{ position: 'absolute', right: 0, top: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', zIndex: 10, minWidth: 100 }}>
                            <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', width: '100%', color: 'var(--error)', fontSize: 13 }} onClick={() => handleDeletePost(post.id)}>
                              <Trash2 size={14} /> 删除
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-post-content">{post.content}</div>
                  {parseImages(post.images).length > 0 && (
                    <div className="space-post-images">
                      {parseImages(post.images).map((img, i) => <img key={i} src={img} alt="" className="space-post-img" loading="lazy" />)}
                    </div>
                  )}
                  <div className="space-post-stats">
                    <span><Eye size={12} /> {post.views || 0}</span>
                  </div>
                  <div className="space-post-actions">
                    <button className={`space-action ${isLiked ? 'liked' : ''}`} onClick={() => toggleLike(post.id)}>
                      <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} /> {post.likes_count || 0}
                    </button>
                    <button className="space-action" onClick={() => loadComments(post.id)}>
                      <MessageSquare size={14} /> {post.comments_count || 0}
                    </button>
                    <button className="space-action" onClick={() => {
                      const url = `${window.location.origin}/lemu`;
                      navigator.clipboard.writeText(url).then(() => {
                        alert('链接已复制到剪贴板');
                      }).catch(() => {});
                    }}><Share2 size={14} /> 分享</button>
                  </div>
                  {expandedComments[post.id] && (
                    <div className="space-post-comments">
                      {postComments.map(c => (
                        <div key={c.id} className="space-comment">
                          <img src={c.author_avatar || FALLBACK_AVATAR} alt="" className="space-comment-avatar" onError={e => { e.target.src = FALLBACK_AVATAR; }} />
                          <div className="space-comment-body">
                            <span className="space-comment-name">{c.author_name || '未知'}</span>
                            <span className="space-comment-text">{c.content}</span>
                            <span className="space-comment-time">{formatTime(c.created_at)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="space-comment-input">
                        <input
                          placeholder="写评论..."
                          value={commentInputs[post.id] || ''}
                          onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && addComment(post.id)}
                        />
                        <button onClick={() => addComment(post.id)} disabled={commentSubmitting[post.id]}>
                          {commentSubmitting[post.id] ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {hasMore && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <button
                  className="filter-btn"
                  onClick={() => loadPosts(page + 1, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Loader2 size={14} className="spin" /> : <><ChevronDown size={14} /> 加载更多</>}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 找好友搜索弹窗 */}
      {showSearchDialog && (
        <div className="friend-search-overlay" onClick={() => setShowSearchDialog(false)}>
          <div className="friend-search-dialog" onClick={e => e.stopPropagation()}>
            <div className="friend-search-dialog-header">
              <h2>找好友</h2>
              <button className="friend-search-close" onClick={() => { setShowSearchDialog(false); setSearchResults([]); setSearchKeyword(''); }}>
                <X size={16} />
              </button>
            </div>
            <div className="friend-search-input-wrap">
              <Search size={16} className="friend-search-icon" />
              <input
                type="text"
                placeholder="输入用户名搜索..."
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearchUsers(); }}
                className="friend-search-input"
                autoFocus
              />
              {searchLoading && <Loader2 size={14} className="friend-search-spinner" />}
            </div>
            <div className="friend-search-results">
              {searchResults.length > 0 ? (
                searchResults.map(user => (
                  <div key={user.id} className="friend-search-result-item" onClick={() => { navigate(`/user/${user.id}`); setShowSearchDialog(false); }}>
                    <img src={user.avatar || FALLBACK_AVATAR} alt="" className="friend-search-result-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_AVATAR; }} />
                    <div className="friend-search-result-info">
                      <span className="friend-search-result-name">{user.name}</span>
                      {user.sign && <span className="friend-search-result-sign">{user.sign}</span>}
                    </div>
                  </div>
                ))
              ) : searchKeyword && !searchLoading ? (
                <div className="friend-search-empty">
                  <Users size={24} />
                  <p>未找到相关用户</p>
                </div>
              ) : !searchKeyword ? (
                <div className="friend-search-empty">
                  <Search size={24} />
                  <p>输入关键词搜索用户</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
