import { Link } from 'react-router-dom';
import { useState } from 'react';
import { MessageCircle, Gamepad2, Tv, BookOpen, Coffee, Plus, Heart, Eye, LogIn, Flame, Hash, FileText, BarChart3, Flag, Palette, Star, X, ChevronDown, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/api';
import UserAvatar from '../Common/UserAvatar';
import './Forum.css';

const BOARD_CATEGORIES = [
  {
    key: 'admin',
    label: '校务室',
    icon: Flag,
    boards: [
      { key: 'announce', label: '站务公告', color: '#8b5cf6' },
      { key: 'intro', label: '新生报到', color: '#a78bfa' },
    ],
  },
  {
    key: 'anime',
    label: '动画部',
    icon: Tv,
    boards: [
      { key: 'newanime', label: '新番讨论', color: '#f43f5e' },
      { key: 'oldanime', label: '旧番/剧场', color: '#fb7185' },
    ],
  },
  {
    key: 'library',
    label: '图书室',
    icon: BookOpen,
    boards: [
      { key: 'novel', label: '轻小说/漫画', color: '#10b981' },
    ],
  },
  {
    key: 'game',
    label: '游戏部',
    icon: Gamepad2,
    boards: [
      { key: 'galgame', label: 'Galgame', color: '#ec4899' },
      { key: 'game', label: '综合游戏', color: '#6366f1' },
    ],
  },
  {
    key: 'creation',
    label: '创作社',
    icon: Palette,
    boards: [
      { key: 'original', label: '原创作品', color: '#f59e0b' },
    ],
  },
  {
    key: 'rooftop',
    label: '屋顶',
    icon: Coffee,
    boards: [
      { key: 'chat', label: '杂谈/资讯', color: '#06b6d4' },
    ],
  },
];

const CUSTOM_BOARDS_KEY = 'forum_custom_boards';
const ALL_BOARDS = BOARD_CATEGORIES.flatMap(cat => cat.boards);

function getCustomBoards() {
  return StorageService.get(CUSTOM_BOARDS_KEY, []);
}

export function ForumLeftSidebar({ posts, activeBoard, onBoardChange, onNewPost }) {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [expandedCats, setExpandedCats] = useState(() =>
    StorageService.get('forum_expanded_cats') || BOARD_CATEGORIES.map(c => c.key)
  );
  const [customBoards, setCustomBoards] = useState(getCustomBoards);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDesc, setNewBoardDesc] = useState('');

  const boardPostCounts = (() => {
    const counts = {};
    ALL_BOARDS.forEach(b => { counts[b.key] = 0; });
    customBoards.forEach(b => { counts[b.id] = 0; });
    posts.forEach(p => { if (counts[p.category] !== undefined) counts[p.category]++; });
    return counts;
  })();

  const toggleCat = (key) => {
    const newExpanded = expandedCats.includes(key)
      ? expandedCats.filter(k => k !== key)
      : [...expandedCats, key];
    setExpandedCats(newExpanded);
    StorageService.set('forum_expanded_cats', newExpanded);
  };

  const handleCreateBoard = () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!newBoardName.trim()) return;
    const newBoard = {
      id: 'custom_' + Date.now(),
      key: 'custom_' + Date.now(),
      label: newBoardName.trim(),
      color: '#f472b6',
      desc: newBoardDesc.trim(),
      creator: currentUser.id,
    };
    const updated = [newBoard, ...customBoards];
    setCustomBoards(updated);
    StorageService.set(CUSTOM_BOARDS_KEY, updated);
    setNewBoardName('');
    setNewBoardDesc('');
    setShowCreateBoard(false);
  };

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
        <h4 className="sidebar-section-title"><Hash size={13} /> 版区</h4>
        <div className="sidebar-board-list">
          <button className={`sidebar-board-item ${!activeBoard ? 'active' : ''}`} onClick={() => onBoardChange(null)}>
            <MessageCircle size={14} /> 全部 <span className="sidebar-board-count">{posts.length}</span>
          </button>
          {BOARD_CATEGORIES.map(cat => {
            const isExpanded = expandedCats.includes(cat.key);
            const CatIcon = cat.icon;
            return (
              <div key={cat.key} className="sidebar-cat-group">
                <div className="sidebar-cat-header" onClick={() => toggleCat(cat.key)}>
                  <CatIcon size={13} className="sidebar-cat-icon" />
                  <span className="sidebar-cat-label">{cat.label}</span>
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </div>
                {isExpanded && cat.boards.map(board => (
                  <button
                    key={board.key}
                    className={`sidebar-board-item sub ${activeBoard === board.key ? 'active' : ''}`}
                    onClick={() => onBoardChange(activeBoard === board.key ? null : board.key)}
                  >
                    <span className="sidebar-board-dot" style={{ background: board.color }} />
                    {board.label}
                    <span className="sidebar-board-count">{boardPostCounts[board.key] || 0}</span>
                  </button>
                ))}
              </div>
            );
          })}

          {/* 自制版区 */}
          <div className="sidebar-cat-group">
            <div className="sidebar-cat-header" onClick={() => toggleCat('custom')}>
              <Star size={13} className="sidebar-cat-icon" />
              <span className="sidebar-cat-label">自制版区</span>
              {expandedCats.includes('custom') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </div>
            {expandedCats.includes('custom') && (
              <>
                {customBoards.map(board => (
                  <button
                    key={board.id}
                    className={`sidebar-board-item sub ${activeBoard === board.id ? 'active' : ''}`}
                    onClick={() => onBoardChange(activeBoard === board.id ? null : board.id)}
                  >
                    <span className="sidebar-board-dot" style={{ background: board.color }} />
                    {board.label}
                    <span className="sidebar-board-count">{boardPostCounts[board.id] || 0}</span>
                  </button>
                ))}
                <button className="sidebar-board-create" onClick={() => { if (!isAuthenticated) { openAuth(); return; } setShowCreateBoard(true); }}>
                  <Plus size={12} /> 创建版区
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 创建版区弹窗 */}
      {showCreateBoard && (
        <div className="sidebar-modal-overlay" onClick={() => setShowCreateBoard(false)}>
          <div className="sidebar-modal" onClick={e => e.stopPropagation()}>
            <div className="sidebar-modal-header">
              <h3>创建新版区</h3>
              <button onClick={() => setShowCreateBoard(false)}><X size={14} /></button>
            </div>
            <div className="sidebar-modal-body">
              <input placeholder="版区名称" value={newBoardName} onChange={e => setNewBoardName(e.target.value)} />
              <input placeholder="版区简介（可选）" value={newBoardDesc} onChange={e => setNewBoardDesc(e.target.value)} />
            </div>
            <div className="sidebar-modal-footer">
              <button className="sidebar-modal-cancel" onClick={() => setShowCreateBoard(false)}>取消</button>
              <button className="sidebar-modal-submit" onClick={handleCreateBoard} disabled={!newBoardName.trim()}>创建</button>
            </div>
          </div>
        </div>
      )}
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
