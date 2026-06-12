# P1 评论区改良 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将放課後评论区从一级平铺回复升级为楼中楼嵌套回复，增加回复点赞、回复排序、回复 Markdown 工具栏。

**Architecture:** 后端（Cloudflare Worker + D1）扩展 replies 表支持 parent_id，likes 表支持 reply_id，新增回复排序参数；前端 PostDetail 组件重构为树状回复渲染，复用 RichTextEditor 组件。

**Tech Stack:** Cloudflare Worker, D1 (SQLite), React, Lucide Icons

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `worker/schema.sql` | 新增 replies.parent_id、likes.reply_id 字段 |
| 修改 | `worker/oauth-proxy.js` | 扩展回复 API（parent_id）、回复点赞 API、回复排序 |
| 修改 | `src/services/api.js` | ForumService 新增 toggleReplyLike、addReply 支持 parentId |
| 修改 | `src/components/Forum/PostDetail.jsx` | 树状回复渲染、回复点赞、回复排序、RichTextEditor |
| 修改 | `src/components/Forum/PostDetail.css` | 楼中楼样式、回复点赞样式、排序按钮样式 |

---

### Task 1: 数据库 Schema 扩展

**Files:**
- Modify: `worker/schema.sql:52-58` (replies 表)
- Modify: `worker/schema.sql:86-92` (likes 表)

- [ ] **Step 1: 在 schema.sql 的 replies 表中添加 parent_id 字段**

在 `replies` 表定义中，`content TEXT NOT NULL,` 之后添加 `parent_id INTEGER DEFAULT NULL REFERENCES replies(id),`：

```sql
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  parent_id INTEGER DEFAULT NULL REFERENCES replies(id),
  created_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: 在 schema.sql 的 likes 表中添加 reply_id 字段**

在 `likes` 表定义中，`post_id INTEGER NOT NULL REFERENCES posts(id),` 之后添加 `reply_id INTEGER DEFAULT NULL REFERENCES replies(id),`，并修改 UNIQUE 约束：

```sql
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  post_id INTEGER DEFAULT NULL REFERENCES posts(id),
  reply_id INTEGER DEFAULT NULL REFERENCES replies(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, COALESCE(post_id, 0), COALESCE(reply_id, 0))
);
```

- [ ] **Step 3: 添加索引**

在索引区域添加：

```sql
CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_id);
CREATE INDEX IF NOT EXISTS idx_likes_reply ON likes(reply_id);
```

- [ ] **Step 4: 在 D1 数据库上执行 ALTER TABLE**

通过 wrangler d1 execute 对线上数据库执行迁移：

```bash
wrangler d1 execute anispace-db --remote --command="ALTER TABLE replies ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES replies(id)"
wrangler d1 execute anispace-db --remote --command="ALTER TABLE likes ADD COLUMN reply_id INTEGER DEFAULT NULL REFERENCES replies(id)"
wrangler d1 execute anispace-db --remote --command="CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_id)"
wrangler d1 execute anispace-db --remote --command="CREATE INDEX IF NOT EXISTS idx_likes_reply ON likes(reply_id)"
```

注意：需要使用 afterrainliu 账户的 wrangler.toml 配置（当前已配置）。

- [ ] **Step 5: Commit**

```bash
git add worker/schema.sql
git commit -m "feat: schema 扩展 replies.parent_id 和 likes.reply_id"
```

---

### Task 2: 后端 API — 回复支持 parent_id

**Files:**
- Modify: `worker/oauth-proxy.js:820-843` (POST /api/posts/:id/replies)
- Modify: `worker/oauth-proxy.js:794-818` (GET /api/posts/:id)

- [ ] **Step 1: 修改 POST /api/posts/:id/replies 路由，支持 parent_id**

在 `worker/oauth-proxy.js` 中找到 `POST /api/posts/:id/replies` 路由（约 L820），修改请求体解析部分：

将：
```javascript
const { content } = body;
```
改为：
```javascript
const { content, parent_id } = body;
```

将 INSERT 语句从：
```javascript
'INSERT INTO replies (post_id, author_id, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
```
改为：
```javascript
'INSERT INTO replies (post_id, author_id, content, parent_id, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
```

将 bind 从：
```javascript
.bind(postId, authUser.userId, content)
```
改为：
```javascript
.bind(postId, authUser.userId, content, parent_id || null)
```

同时在插入前添加 parent_id 校验（如果提供了 parent_id，验证它属于同一帖子）：

```javascript
if (parent_id) {
  const parentReply = await env.DB.prepare(
    'SELECT post_id FROM replies WHERE id = ?'
  ).bind(parent_id).first();
  if (!parentReply || parentReply.post_id !== postId) {
    return jsonResponse({ error: '无效的父回复' }, 400, origin);
  }
}
```

- [ ] **Step 2: 修改 GET /api/posts/:id 路由，支持回复排序和树状结构**

在 `worker/oauth-proxy.js` 中找到 `GET /api/posts/:id` 路由（约 L794），修改回复查询部分：

将回复查询从：
```javascript
const replies = await env.DB.prepare(
  'SELECT r.*, u.name AS author_name, u.avatar AS author_avatar FROM replies r JOIN users u ON r.author_id = u.id WHERE r.post_id = ? ORDER BY r.created_at ASC'
).bind(postId).all();
```

改为支持排序参数：
```javascript
const url = new URL(request.url);
const replySort = url.searchParams.get('reply_sort') || 'oldest';
let orderClause = 'r.created_at ASC';
if (replySort === 'newest') orderClause = 'r.created_at DESC';
if (replySort === 'hot') orderClause = 'r.likes DESC, r.created_at ASC';

const replies = await env.DB.prepare(
  `SELECT r.*, u.name AS author_name, u.avatar AS author_avatar FROM replies r JOIN users u ON r.author_id = u.id WHERE r.post_id = ? ORDER BY ${orderClause}`
).bind(postId).all();
```

注意：replies 表还没有 `likes` 字段，hot 排序需要子查询。改为：

```javascript
const url = new URL(request.url);
const replySort = url.searchParams.get('reply_sort') || 'oldest';
let orderClause = 'r.created_at ASC';
if (replySort === 'newest') orderClause = 'r.created_at DESC';
if (replySort === 'hot') orderClause = 'like_count DESC, r.created_at ASC';

const replies = await env.DB.prepare(
  `SELECT r.*, u.name AS author_name, u.avatar AS author_avatar, (SELECT COUNT(*) FROM likes l WHERE l.reply_id = r.id) AS like_count FROM replies r JOIN users u ON r.author_id = u.id WHERE r.post_id = ? ORDER BY ${orderClause}`
).bind(postId).all();
```

- [ ] **Step 3: 在 GET /api/posts/:id 返回中添加每条回复的点赞状态**

在返回数据前，查询当前用户对各回复的点赞状态。在 `const parsedPost = {` 之前添加：

```javascript
// 查询当前用户对回复的点赞状态
let replyLikeMap = {};
if (authUserId) {
  const replyIds = replies.results.map(r => r.id);
  if (replyIds.length > 0) {
    const placeholders = replyIds.map(() => '?').join(',');
    const userLikes = await env.DB.prepare(
      `SELECT reply_id FROM likes WHERE user_id = ? AND reply_id IN (${placeholders})`
    ).bind(authUserId, ...replyIds).all();
    userLikes.results.forEach(l => { replyLikeMap[l.reply_id] = true; });
  }
}
```

注意：`GET /api/posts/:id` 当前不验证用户身份（公开访问）。需要尝试获取可选的认证用户：

```javascript
const authUser = await getAuthUser(request, env);
const authUserId = authUser ? authUser.userId : null;
```

然后在返回的 replies 中添加 `is_liked` 和 `likes` 字段：

```javascript
const parsedReplies = replies.results.map(r => ({
  ...r,
  likes: r.like_count || 0,
  is_liked: !!replyLikeMap[r.id],
}));
```

修改最终返回为：
```javascript
return jsonResponse({ ...parsedPost, views: (post.views || 0) + 1, replies: parsedReplies }, 200, origin);
```

- [ ] **Step 4: Commit**

```bash
git add worker/oauth-proxy.js
git commit -m "feat: 后端支持回复 parent_id、回复排序、回复点赞状态"
```

---

### Task 3: 后端 API — 回复点赞

**Files:**
- Modify: `worker/oauth-proxy.js:849-873` (POST /api/posts/:id/like)

- [ ] **Step 1: 新增 POST /api/replies/:id/like 路由**

在 `worker/oauth-proxy.js` 的 like 路由之后（约 L873），添加回复点赞路由：

```javascript
// POST /api/replies/:id/like — 切换回复点赞（需认证）
const replyLikeMatch = pathname.match(/^\/api\/replies\/(\d+)\/like$/);
if (replyLikeMatch && method === 'POST') {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
  const replyId = Number(replyLikeMatch[1]);

  const existing = await env.DB.prepare(
    'SELECT id FROM likes WHERE user_id = ? AND reply_id = ?'
  ).bind(authUser.userId, replyId).first();

  if (existing) {
    await env.DB.prepare('DELETE FROM likes WHERE id = ?').bind(existing.id).run();
    return jsonResponse({ liked: false }, 200, origin);
  } else {
    await env.DB.prepare(
      "INSERT INTO likes (user_id, reply_id, created_at) VALUES (?, ?, datetime('now'))"
    ).bind(authUser.userId, replyId).run();
    return jsonResponse({ liked: true }, 200, origin);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/oauth-proxy.js
git commit -m "feat: 后端回复点赞 API"
```

---

### Task 4: 前端 API Service 扩展

**Files:**
- Modify: `src/services/api.js:468-508` (ForumService)

- [ ] **Step 1: 修改 addReply 方法支持 parentId**

将：
```javascript
async addReply(postId, content) {
  return await apiRequest(`/api/posts/${postId}/replies`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
},
```

改为：
```javascript
async addReply(postId, content, parentId = null) {
  const body = { content };
  if (parentId) body.parent_id = parentId;
  return await apiRequest(`/api/posts/${postId}/replies`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
},
```

- [ ] **Step 2: 修改 getPostById 方法支持 replySort**

将：
```javascript
async getPostById(id) {
  return await apiRequest(`/api/posts/${id}`);
},
```

改为：
```javascript
async getPostById(id, replySort = 'oldest') {
  return await apiRequest(`/api/posts/${id}?reply_sort=${replySort}`);
},
```

- [ ] **Step 3: 新增 toggleReplyLike 方法**

在 ForumService 末尾（`deletePost` 之后）添加：

```javascript
async toggleReplyLike(replyId) {
  return await apiRequest(`/api/replies/${replyId}/like`, {
    method: 'POST',
  });
},
```

- [ ] **Step 4: Commit**

```bash
git add src/services/api.js
git commit -m "feat: ForumService 支持回复 parent_id、回复排序、回复点赞"
```

---

### Task 5: 前端 PostDetail 组件重构

**Files:**
- Modify: `src/components/Forum/PostDetail.jsx`
- Modify: `src/components/Forum/PostDetail.css`

这是最大的改动，将 PostDetail 从平铺回复改为树状楼中楼。

- [ ] **Step 1: 重写 PostDetail.jsx**

完整替换 PostDetail.jsx 内容：

```jsx
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
  const [replyLikes, setReplyLikes] = useState({}); // { replyId: { liked, count } }
  const [expandedReplies, setExpandedReplies] = useState({}); // { parentId: true }
  const replyInputRef = useRef(null);

  const loadPost = async () => {
    try {
      const data = await ForumService.getPostById(id, replySort);
      setPost(data);
      // 组织回复为树状结构
      const treeReplies = buildReplyTree(data.replies || []);
      setReplies(treeReplies);
      setLikeCount(data.likes || 0);
      // 初始化回复点赞状态
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

  // 将平铺回复组织为树状结构
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
    setReplyParentId(reply.parent_id || reply.id); // 如果回复的是二级回复，parent_id 指向其父级（一级）
    setReplyMention(`@${reply.author_name || '未知用户'} `);
    setNewReply(`@${reply.author_name || '未知用户'} `);
    replyInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // 聚焦到输入框 - RichTextEditor 内的 textarea
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
          count: (prev[replyId]?.count || 0) + (result.liked ? 1 : -1),
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
              const isExpanded = expandedReplies[reply.id] !== false; // 默认展开

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

                  {/* 楼中楼 */}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Forum/PostDetail.jsx
git commit -m "feat: PostDetail 楼中楼回复、回复点赞、回复排序、RichTextEditor"
```

---

### Task 6: PostDetail CSS 样式

**Files:**
- Modify: `src/components/Forum/PostDetail.css`

- [ ] **Step 1: 在 PostDetail.css 末尾追加新样式**

追加以下样式：

```css
/* ─── 回复排序 ─── */
.replies-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.replies-header .replies-title {
  margin-bottom: 0;
}
.reply-sort-pills {
  display: flex;
  gap: 4px;
}
.reply-sort-pill {
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  background: var(--bg-input);
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}
.reply-sort-pill.active {
  background: var(--primary);
  color: #fff;
}
.reply-sort-pill:hover:not(.active) {
  background: var(--primary-bg);
  color: var(--primary);
}

/* ─── 回复操作按钮 ─── */
.reply-actions {
  display: flex;
  gap: 12px;
  margin-top: 6px;
}
.reply-action-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-quaternary);
  transition: all var(--transition-fast);
  padding: 2px 0;
}
.reply-action-btn:hover {
  color: var(--primary);
}
.reply-action-btn.like.liked {
  color: var(--primary);
}
.reply-action-btn.like.liked svg {
  fill: var(--primary);
}

/* ─── 楼中楼 ─── */
.reply-nested {
  margin-left: 44px;
  padding-left: 12px;
  border-left: 2px solid var(--primary-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.reply-nested-item {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
}
.reply-avatar.small {
  width: 24px;
  height: 24px;
}
.reply-nested-item .reply-content {
  font-size: 13px;
}
.reply-nested-item .reply-name {
  font-size: 12px;
}
.reply-nested-item .reply-time {
  font-size: 10px;
}
.reply-nested-item .reply-actions {
  margin-top: 4px;
  gap: 8px;
}

/* 展开更多回复 */
.reply-expand-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--primary);
  background: var(--primary-bg);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}
.reply-expand-btn:hover {
  background: var(--primary);
  color: #fff;
}

/* ─── 回复指示器（回复某人时显示） ─── */
.reply-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--primary-bg);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--primary);
  font-weight: 500;
}
.reply-indicator-clear {
  margin-left: auto;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  background: rgba(0,0,0,0.1);
  color: var(--primary);
  transition: all var(--transition-fast);
}
.reply-indicator-clear:hover {
  background: var(--primary);
  color: #fff;
}

/* ─── 回复表单底部 ─── */
.reply-form-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

/* ─── 响应式 ─── */
@media (max-width: 768px) {
  .replies-header {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  .reply-nested {
    margin-left: 24px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Forum/PostDetail.css
git commit -m "feat: PostDetail 楼中楼、回复点赞、排序样式"
```

---

### Task 7: 构建验证与部署

- [ ] **Step 1: 运行构建**

```bash
cd d:\Desktop\Ideas\ANISpace\ANISpace && npm run build
```

Expected: 构建成功，无错误

- [ ] **Step 2: 部署 Worker**

```bash
cd d:\Desktop\Ideas\ANISpace\ANISpace\worker && npx wrangler deploy
```

Expected: 部署成功

- [ ] **Step 3: 执行数据库迁移**

```bash
cd d:\Desktop\Ideas\ANISpace\ANISpace\worker
npx wrangler d1 execute anispace-db --remote --command="ALTER TABLE replies ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES replies(id)"
npx wrangler d1 execute anispace-db --remote --command="ALTER TABLE likes ADD COLUMN reply_id INTEGER DEFAULT NULL REFERENCES replies(id)"
npx wrangler d1 execute anispace-db --remote --command="CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_id)"
npx wrangler d1 execute anispace-db --remote --command="CREATE INDEX IF NOT EXISTS idx_likes_reply ON likes(reply_id)"
```

Expected: 每条命令返回 `ok`

- [ ] **Step 4: 推送到 GitHub**

```bash
git push
```

Expected: GitHub Actions 自动构建部署

- [ ] **Step 5: 验证线上功能**

访问 https://afterrain-2005.github.io/forum，打开一个帖子详情页，验证：
1. 回复排序按钮（最早/最新/最热）可切换
2. 回复下方有"回复"和"点赞"按钮
3. 点击"回复"后输入框显示回复指示器
4. 回复提交后楼中楼正确显示
5. 回复点赞可切换

---

## 自审清单

1. **Spec 覆盖**：P1 四个子功能（楼中楼、回复点赞、回复排序、Markdown 工具栏）均有对应 Task
2. **Placeholder 扫描**：无 TBD/TODO
3. **类型一致性**：`parent_id`、`reply_id`、`is_liked`、`likes` 在前后端命名一致
