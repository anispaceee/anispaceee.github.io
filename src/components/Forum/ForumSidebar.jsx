import { Link } from 'react-router-dom';
import { MessageCircle, Gamepad2, Tv, BookOpen, Coffee, Plus, Heart, Eye, LogIn, Flame, Hash, FileText, BarChart3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import UserAvatar from '../Common/UserAvatar';
import './Forum.css';

const BOARDS = [
  { key: 'game', label: '游戏', icon: Gamepad2, color: '#6366f1' },
  { key: 'anime', label: '动画', icon: Tv, color: '#f43f5e' },
  { key: 'novel', label: '小说', icon: BookOpen, color: '#10b981' },
  { key: 'chat', label: '吹水', icon: Coffee, color: '#f59e0b' },
];

export function ForumLeftSidebar({ posts, activeBoard, onBoardChange, onNewPost }) {
  const { currentUser, isAuthenticated, openAuth } = useApp();

  const boardPostCounts = (() => {
    const counts = {};
    BOARDS.forEach(b => { counts[b.key] = 0; });
    posts.forEach(p => { if (counts[p.category] !== undefined) counts[p.category]++; });
    return counts;
  })();

  return (
    <aside className="forum-sidebar-left">
      {isAuthenticated && currentUser ? (
        <div className="sidebar-profile-card">
          <UserAvatar userId={currentUser.id} src={currentUser.avatar} alt={currentUser.nickname || currentUser.username} size={56} className="profile-avatar" />
          <h3 className="profile-name">{currentUser.nickname || currentUser.username}</h3>
          {currentUser.bio && <p className="profile-bio">{currentUser.bio}</p>}
          <div className="profile-stats">
            <div className="profile-stat-item">
              <span className="profile-stat-value">{posts.filter(p => p.author_id === currentUser.id).length}</span>
              <span className="profile-stat-label">帖子</span>
            </div>
            <div className="profile-stat-item">
              <span className="profile-stat-value">{posts.reduce((sum, p) => sum + (p.author_id === currentUser.id ? (p.likes || 0) : 0), 0)}</span>
              <span className="profile-stat-label">获赞</span>
            </div>
          </div>
          <button className="new-post-btn sidebar-new-post" onClick={onNewPost}>
            <Plus size={14} /> 发帖
          </button>
        </div>
      ) : (
        <div className="sidebar-login-card">
          <div className="login-card-icon"><LogIn size={28} /></div>
          <p className="login-card-text">登录后参与社区讨论</p>
          <button className="login-card-btn" onClick={openAuth}>GitHub 登录</button>
        </div>
      )}

      <div className="sidebar-section">
        <h4 className="sidebar-section-title"><Hash size={13} /> 板块</h4>
        <div className="sidebar-board-list">
          <button className={`sidebar-board-item ${!activeBoard ? 'active' : ''}`} onClick={() => onBoardChange(null)}>
            <MessageCircle size={14} /> 全部 <span className="sidebar-board-count">{posts.length}</span>
          </button>
          {BOARDS.map(board => {
            const Icon = board.icon;
            return (
              <button key={board.key} className={`sidebar-board-item ${activeBoard === board.key ? 'active' : ''}`} onClick={() => onBoardChange(activeBoard === board.key ? null : board.key)}>
                <Icon size={14} /> {board.label} <span className="sidebar-board-count">{boardPostCounts[board.key] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export function ForumRightSidebar({ posts, hotPosts, hotTags, onTagClick }) {
  // 如果没有传入 hotPosts/hotTags，从 posts 中计算
  const computedHotPosts = hotPosts || (() => {
    return [...posts]
      .sort((a, b) => ((b.views || 0) + (b.likes || 0) * 3 + (b.replies_count || 0) * 5) - ((a.views || 0) + (a.likes || 0) * 3 + (a.replies_count || 0) * 5))
      .slice(0, 5);
  })();

  const computedHotTags = hotTags || (() => {
    const tagMap = {};
    posts.forEach(p => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      tags.forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
    });
    return Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([tag]) => tag);
  })();

  return (
    <aside className="forum-sidebar-right">
      <div className="sidebar-section">
        <h4 className="sidebar-section-title"><Flame size={13} /> 热门帖子</h4>
        <div className="sidebar-hot-list">
          {computedHotPosts.map((post, idx) => (
            <Link to={`/forum/post/${post.id}`} key={post.id} className="sidebar-hot-item">
              <span className={`sidebar-hot-rank ${idx < 3 ? 'top' : ''}`}>{idx + 1}</span>
              <div className="sidebar-hot-info">
                <span className="sidebar-hot-title">{post.title}</span>
                <span className="sidebar-hot-meta"><Eye size={10} /> {post.views || 0} · <Heart size={10} /> {post.likes || 0}</span>
              </div>
            </Link>
          ))}
          {computedHotPosts.length === 0 && <p className="sidebar-empty-text">暂无热门帖子</p>}
        </div>
      </div>

      {computedHotTags.length > 0 && (
        <div className="sidebar-section">
          <h4 className="sidebar-section-title"><Hash size={13} /> 热门标签</h4>
          <div className="sidebar-tag-cloud">
            {computedHotTags.map(tag => (
              <button key={tag} className="sidebar-tag-pill" onClick={() => onTagClick?.(tag)}>{tag}</button>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <h4 className="sidebar-section-title"><BarChart3 size={13} /> 社区统计</h4>
        <div className="sidebar-stats-grid">
          <div className="sidebar-stat-card">
            <FileText size={16} />
            <span className="sidebar-stat-value">{posts.length}</span>
            <span className="sidebar-stat-label">帖子</span>
          </div>
          <div className="sidebar-stat-card">
            <MessageCircle size={16} />
            <span className="sidebar-stat-value">{posts.reduce((s, p) => s + (p.replies_count || 0), 0)}</span>
            <span className="sidebar-stat-label">回复</span>
          </div>
          <div className="sidebar-stat-card">
            <Heart size={16} />
            <span className="sidebar-stat-value">{posts.reduce((s, p) => s + (p.likes || 0), 0)}</span>
            <span className="sidebar-stat-label">点赞</span>
          </div>
          <div className="sidebar-stat-card">
            <Eye size={16} />
            <span className="sidebar-stat-value">{posts.reduce((s, p) => s + (p.views || 0), 0)}</span>
            <span className="sidebar-stat-label">浏览</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
