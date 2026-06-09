import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StorageService, UserService, FriendService } from '../../services/api';
import { Heart, MessageSquare, Share2, Lock, Globe, MoreHorizontal, Send, Image, X, Eye, Users, Plus, ChevronDown, Search, Loader2 } from 'lucide-react';
import './FriendSpace.css';

const SPACE_STORAGE = 'acg_friend_space';
const FALLBACK_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const VISIBILITY = { friends: 'friends', public: 'public' };
const VISIBILITY_LABELS = { friends: '仅好友', public: '公开' };

function getInitialPosts() {
  const saved = StorageService.get(SPACE_STORAGE, null);
  if (saved) return saved;
  return [
    {
      id: '1',
      userId: 'user1',
      content: '今天看了《葬送的芙莉莲》最新一集，真的太感动了！芙莉莲对时间的理解让人深思...',
      images: [],
      visibility: 'friends',
      likes: ['user2', 'user3'],
      comments: [
        { id: 'c1', userId: 'user2', content: '我也看了！最后那段真的催泪', createdAt: new Date().toISOString() },
      ],
      views: 42,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: '2',
      userId: 'user2',
      content: '新买的命运石之门手办到了！El Psy Kongroo！',
      images: [],
      visibility: 'public',
      likes: ['user1'],
      comments: [],
      views: 28,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ];
}

export default function FriendSpace() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const navigate = useNavigate();
  const [posts, setPosts] = useState(getInitialPosts);
  const [newContent, setNewContent] = useState('');
  const [newVisibility, setNewVisibility] = useState('friends');
  const [showComposer, setShowComposer] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [filter, setFilter] = useState('all');

  // 找好友搜索相关状态
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const savePosts = useCallback((newPosts) => {
    setPosts(newPosts);
    StorageService.set(SPACE_STORAGE, newPosts);
  }, []);

  const handlePost = () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!newContent.trim()) return;
    const post = {
      id: Date.now().toString(),
      userId: currentUser.id,
      content: newContent.trim(),
      images: [],
      visibility: newVisibility,
      likes: [],
      comments: [],
      views: 0,
      createdAt: new Date().toISOString(),
    };
    savePosts([post, ...posts]);
    setNewContent('');
    setShowComposer(false);
  };

  const toggleLike = (postId) => {
    if (!isAuthenticated) { openAuth(); return; }
    savePosts(posts.map(p => {
      if (p.id !== postId) return p;
      const liked = p.likes.includes(currentUser.id);
      return { ...p, likes: liked ? p.likes.filter(id => id !== currentUser.id) : [...p.likes, currentUser.id] };
    }));
  };

  const addComment = (postId) => {
    if (!isAuthenticated) { openAuth(); return; }
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    savePosts(posts.map(p => {
      if (p.id !== postId) return p;
      return { ...p, comments: [...p.comments, { id: Date.now().toString(), userId: currentUser.id, content, createdAt: new Date().toISOString() }] };
    }));
    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
  };

  const toggleComments = (postId) => {
    setExpandedComments(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  const getUserById = (id) => {
    if (currentUser && id === currentUser.id) return currentUser;
    return UserService.getById(id) || { name: '用户' + String(id).slice(-4), avatar: FALLBACK_AVATAR };
  };

  const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    return Math.floor(diff / 86400000) + '天前';
  };

  const filteredPosts = filter === 'all' ? posts : posts.filter(p => p.visibility === filter);

  const handleSearchUsers = () => {
    if (!searchKeyword.trim()) return;
    setSearchLoading(true);
    FriendService.searchUsers(searchKeyword.trim()).then(data => {
      setSearchResults(Array.isArray(data) ? data : []);
    }).catch(() => {
      setSearchResults([]);
    }).finally(() => setSearchLoading(false));
  };

  return (
    <div className="friend-space-page">
      <div className="friend-space-header">
        <div className="friend-space-title">
          <Users size={22} />
          <h1>好友空间</h1>
          <span className="friend-space-subtitle">仅好友可见的私密动态</span>
        </div>
        <div className="friend-space-header-actions">
          <button className="friend-space-search-btn" onClick={() => setShowSearchDialog(true)}>
            <Search size={16} /> 找好友
          </button>
          <button className="friend-space-compose-btn" onClick={() => { if (!isAuthenticated) { openAuth(); return; } setShowComposer(!showComposer); }}>
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
            </div>
          </div>
          <textarea className="composer-input" placeholder="分享你的想法..." value={newContent} onChange={e => setNewContent(e.target.value)} rows={3} />
          <div className="composer-actions">
            <button className="composer-tool" title="添加图片"><Image size={16} /></button>
            <button className="composer-submit" onClick={handlePost} disabled={!newContent.trim()}>发布</button>
          </div>
        </div>
      )}

      <div className="friend-space-filters">
        <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>全部</button>
        <button className={`filter-btn ${filter === 'friends' ? 'active' : ''}`} onClick={() => setFilter('friends')}><Lock size={12} /> 好友</button>
        <button className={`filter-btn ${filter === 'public' ? 'active' : ''}`} onClick={() => setFilter('public')}><Globe size={12} /> 公开</button>
      </div>

      <div className="friend-space-feed">
        {filteredPosts.length === 0 ? (
          <div className="friend-space-empty">
            <Users size={32} />
            <p>暂无动态</p>
            <span>发布第一条动态吧~</span>
          </div>
        ) : filteredPosts.map(post => {
          const author = getUserById(post.userId);
          const isLiked = isAuthenticated && post.likes.includes(currentUser?.id);
          return (
            <div key={post.id} className="space-post">
              <div className="space-post-header">
                <img src={author.avatar || FALLBACK_AVATAR} alt="" className="space-post-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_AVATAR; }} />
                <div className="space-post-author">
                  <span className="space-post-name">{author.name}</span>
                  <span className="space-post-meta">
                    {formatTime(post.createdAt)} · {post.visibility === 'friends' ? <><Lock size={10} /> 仅好友</> : <><Globe size={10} /> 公开</>}
                  </span>
                </div>
              </div>
              <div className="space-post-content">{post.content}</div>
              {post.images?.length > 0 && (
                <div className="space-post-images">
                  {post.images.map((img, i) => <img key={i} src={img} alt="" className="space-post-img" loading="lazy" />)}
                </div>
              )}
              <div className="space-post-stats">
                <span><Eye size={12} /> {post.views}</span>
              </div>
              <div className="space-post-actions">
                <button className={`space-action ${isLiked ? 'liked' : ''}`} onClick={() => toggleLike(post.id)}>
                  <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} /> {post.likes.length}
                </button>
                <button className="space-action" onClick={() => toggleComments(post.id)}>
                  <MessageSquare size={14} /> {post.comments.length}
                </button>
                <button className="space-action"><Share2 size={14} /> 分享</button>
              </div>
              {expandedComments[post.id] && (
                <div className="space-post-comments">
                  {post.comments.map(c => {
                    const commenter = getUserById(c.userId);
                    return (
                      <div key={c.id} className="space-comment">
                        <img src={commenter.avatar || FALLBACK_AVATAR} alt="" className="space-comment-avatar" onError={e => { e.target.src = FALLBACK_AVATAR; }} />
                        <div className="space-comment-body">
                          <span className="space-comment-name">{commenter.name}</span>
                          <span className="space-comment-text">{c.content}</span>
                          <span className="space-comment-time">{formatTime(c.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="space-comment-input">
                    <input placeholder="写评论..." value={commentInputs[post.id] || ''} onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addComment(post.id)} />
                    <button onClick={() => addComment(post.id)}><Send size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
