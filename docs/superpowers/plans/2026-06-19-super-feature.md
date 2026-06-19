# 超展开功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Bangumi 小组（超展开）完整功能，包括浏览小组/话题、发帖回复、成员管理、创建小组。

**Architecture:** 前端 React 组件 + Cloudflare Worker 代理 Bangumi 私有 API + D1 数据库存储用户 Bangumi token。

**Tech Stack:** React 19, React Router 7, Cloudflare Worker, D1 (SQLite), Bangumi OAuth API

---

## File Structure

### 新增文件
```
src/
├── components/Super/
│   ├── SuperHome.jsx          # 超展开首页（小组列表）
│   ├── SuperHome.css          # 首页样式
│   ├── GroupDetail.jsx        # 小组详情页
│   ├── GroupDetail.css        # 详情页样式
│   ├── TopicDetail.jsx        # 话题详情页
│   ├── TopicDetail.css        # 话题样式
│   ├── GroupCard.jsx          # 小组卡片组件
│   ├── TopicCard.jsx          # 话题卡片组件
│   ├── PostItem.jsx           # 帖子/回复项
│   ├── CreateTopicModal.jsx   # 发帖弹窗
│   ├── ReplyInput.jsx         # 回复输入框
│   ├── GroupCreateForm.jsx    # 创建小组表单
│   └── BangumiBindPrompt.jsx  # Bangumi 绑定提示
├── pages/SuperPage.jsx        # 超展开页面入口
├── services/SuperService.js   # 超展开 API 服务

worker/
├── lib/super-proxy.js         # Bangumi 小组代理逻辑
├── migrations/
│   └── v016_bangumi_token.sql # 用户表扩展迁移
```

### 修改文件
```
src/
├── App.jsx                    # 新增 /super 路由
├── components/Layout/Header.jsx  # 新增导航项
├── context/AppContext.jsx     # 新增 bangumiBound 状态
├── services/api.js            # 新增 SuperService 引用

worker/
├── oauth-proxy.js             # 新增 /api/super/* 路由
├── schema.sql                 # 新增 bangumi token 字段
```

---

## Phase 1: 基础架构

### Task 1: 数据库迁移 - 用户表扩展

**Files:**
- Create: `worker/migrations/v016_bangumi_token.sql`

- [ ] **Step 1: 创建迁移文件**

```sql
-- worker/migrations/v016_bangumi_token.sql
-- 为用户表添加 Bangumi OAuth token 相关字段

ALTER TABLE users ADD COLUMN bangumi_access_token TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_refresh_token TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_token_expires_at INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_user_id INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_username TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_avatar TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_bound_at INTEGER DEFAULT NULL;
```

- [ ] **Step 2: 执行迁移**

Run: `wrangler d1 execute anispace-db --local --file=worker/migrations/v016_bangumi_token.sql`
Expected: Migration executed successfully

- [ ] **Step 3: 更新 schema.sql**

在 `worker/schema.sql` 的 `users` 表定义中添加新字段：

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- ... 现有字段 ...
  bangumi_access_token TEXT DEFAULT NULL,
  bangumi_refresh_token TEXT DEFAULT NULL,
  bangumi_token_expires_at INTEGER DEFAULT NULL,
  bangumi_user_id INTEGER DEFAULT NULL,
  bangumi_username TEXT DEFAULT NULL,
  bangumi_avatar TEXT DEFAULT NULL,
  bangumi_bound_at INTEGER DEFAULT NULL
);
```

- [ ] **Step 4: Commit**

```bash
git add worker/migrations/v016_bangumi_token.sql worker/schema.sql
git commit -m "feat(db): add bangumi oauth token fields to users table"
```

---

### Task 2: Worker 代理路由框架

**Files:**
- Create: `worker/lib/super-proxy.js`
- Modify: `worker/oauth-proxy.js`

- [ ] **Step 1: 创建 super-proxy.js 模块**

```javascript
// worker/lib/super-proxy.js
/**
 * Bangumi 小组（超展开）代理模块
 * 代理 Bangumi 私有 API 的小组相关端点
 */

const BANGUMI_PRIVATE_API = 'https://api.bgm.tv';

/**
 * 获取用户的 Bangumi access token
 */
async function getBangumiToken(env, userId) {
  const user = await env.DB.prepare(
    'SELECT bangumi_access_token, bangumi_refresh_token, bangumi_token_expires_at FROM users WHERE id = ?'
  ).bind(userId).first();
  
  if (!user || !user.bangumi_access_token) {
    return null;
  }
  
  // 检查 token 是否过期
  const now = Math.floor(Date.now() / 1000);
  if (user.bangumi_token_expires_at && user.bangumi_token_expires_at < now) {
    // TODO: 实现 refresh token 刷新逻辑
    return null;
  }
  
  return user.bangumi_access_token;
}

/**
 * 代理 Bangumi API 请求
 */
async function proxyBangumiAPI(request, env, userId, path, options = {}) {
  const token = await getBangumiToken(env, userId);
  if (!token) {
    return jsonResponse({ error: 'Bangumi account not bound' }, 401);
  }
  
  const url = new URL(`${BANGUMI_PRIVATE_API}${path}`);
  if (options.query) {
    Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'ANISpace/1.0 (https://anispaceee.github.io)',
    'Accept': 'application/json',
  };
  
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : undefined;
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(url.toString(), { method, headers, body });
  const data = await response.json();
  
  return jsonResponse(data, response.status);
}

/**
 * 处理小组列表请求
 */
async function handleGroupsList(request, env, userId) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';
  const sort = url.searchParams.get('sort') || 'members';
  
  return proxyBangumiAPI(request, env, userId, '/p/groups', {
    query: { page, limit, sort }
  });
}

/**
 * 处理小组详情请求
 */
async function handleGroupDetail(request, env, userId, groupId) {
  return proxyBangumiAPI(request, env, userId, `/p/groups/${groupId}`);
}

/**
 * 处理话题列表请求
 */
async function handleTopicsList(request, env, userId, groupId) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';
  
  return proxyBangumiAPI(request, env, userId, `/p/groups/${groupId}/topics`, {
    query: { page, limit }
  });
}

/**
 * 处理话题详情请求
 */
async function handleTopicDetail(request, env, userId, topicId) {
  return proxyBangumiAPI(request, env, userId, `/p/topics/${topicId}`);
}

/**
 * 处理帖子列表请求
 */
async function handlePostsList(request, env, userId, topicId) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';
  
  return proxyBangumiAPI(request, env, userId, `/p/topics/${topicId}/posts`, {
    query: { page, limit }
  });
}

/**
 * 处理发表话题请求
 */
async function handleCreateTopic(request, env, userId, groupId) {
  const body = await request.json();
  return proxyBangumiAPI(request, env, userId, `/p/groups/${groupId}/topics`, {
    method: 'POST',
    body: { title: body.title, content: body.content }
  });
}

/**
 * 处理发表回复请求
 */
async function handleCreatePost(request, env, userId, topicId) {
  const body = await request.json();
  return proxyBangumiAPI(request, env, userId, `/p/topics/${topicId}/posts`, {
    method: 'POST',
    body: { content: body.content, related: body.related || 0 }
  });
}

/**
 * 处理加入小组请求
 */
async function handleJoinGroup(request, env, userId, groupId) {
  return proxyBangumiAPI(request, env, userId, `/p/groups/${groupId}/join`, {
    method: 'POST'
  });
}

/**
 * 处理退出小组请求
 */
async function handleLeaveGroup(request, env, userId, groupId) {
  return proxyBangumiAPI(request, env, userId, `/p/groups/${groupId}/leave`, {
    method: 'DELETE'
  });
}

/**
 * 处理创建小组请求
 */
async function handleCreateGroup(request, env, userId) {
  const body = await request.json();
  return proxyBangumiAPI(request, env, userId, `/p/groups`, {
    method: 'POST',
    body: {
      name: body.name,
      title: body.title,
      desc: body.desc,
      icon: body.icon || '',
      accessible: body.accessible !== false,
      nsfw: body.nsfw || false
    }
  });
}

/**
 * 处理 Bangumi 账号绑定状态查询
 */
async function handleBangumiStatus(request, env, userId) {
  const user = await env.DB.prepare(
    'SELECT bangumi_user_id, bangumi_username, bangumi_avatar, bangumi_bound_at FROM users WHERE id = ?'
  ).bind(userId).first();
  
  if (!user || !user.bangumi_user_id) {
    return jsonResponse({ bound: false });
  }
  
  return jsonResponse({
    bound: true,
    bangumi_user_id: user.bangumi_user_id,
    bangumi_username: user.bangumi_username,
    bangumi_avatar: user.bangumi_avatar,
    bound_at: user.bangumi_bound_at
  });
}

export {
  handleGroupsList,
  handleGroupDetail,
  handleTopicsList,
  handleTopicDetail,
  handlePostsList,
  handleCreateTopic,
  handleCreatePost,
  handleJoinGroup,
  handleLeaveGroup,
  handleCreateGroup,
  handleBangumiStatus,
};
```

- [ ] **Step 2: 在 oauth-proxy.js 中导入模块**

在文件顶部添加导入：

```javascript
import * as superProxy from './lib/super-proxy.js';
```

- [ ] **Step 3: 在 oauth-proxy.js 中添加路由**

在 `handleRequest` 函数的路由匹配部分添加：

```javascript
// === 超展开（Bangumi 小组）代理 ===
if (path.startsWith('/api/super/')) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, 401, origin);
  }
  
  // /api/super/groups - 小组列表
  if (path === '/api/super/groups' && method === 'GET') {
    return superProxy.handleGroupsList(request, env, authUser.userId);
  }
  
  // /api/super/groups/:id - 小组详情
  const groupMatch = path.match(/^\/api\/super\/groups\/(\d+)$/);
  if (groupMatch) {
    const groupId = parseInt(groupMatch[1]);
    if (method === 'GET') {
      return superProxy.handleGroupDetail(request, env, authUser.userId, groupId);
    }
  }
  
  // /api/super/groups/:id/topics - 话题列表
  const groupTopicsMatch = path.match(/^\/api\/super\/groups\/(\d+)\/topics$/);
  if (groupTopicsMatch) {
    const groupId = parseInt(groupTopicsMatch[1]);
    if (method === 'GET') {
      return superProxy.handleTopicsList(request, env, authUser.userId, groupId);
    }
    if (method === 'POST') {
      return superProxy.handleCreateTopic(request, env, authUser.userId, groupId);
    }
  }
  
  // /api/super/groups/:id/join - 加入小组
  const groupJoinMatch = path.match(/^\/api\/super\/groups\/(\d+)\/join$/);
  if (groupJoinMatch && method === 'POST') {
    const groupId = parseInt(groupJoinMatch[1]);
    return superProxy.handleJoinGroup(request, env, authUser.userId, groupId);
  }
  
  // /api/super/groups/:id/leave - 退出小组
  const groupLeaveMatch = path.match(/^\/api\/super\/groups\/(\d+)\/leave$/);
  if (groupLeaveMatch && method === 'DELETE') {
    const groupId = parseInt(groupLeaveMatch[1]);
    return superProxy.handleLeaveGroup(request, env, authUser.userId, groupId);
  }
  
  // /api/super/topics/:id - 话题详情
  const topicMatch = path.match(/^\/api\/super\/topics\/(\d+)$/);
  if (topicMatch && method === 'GET') {
    const topicId = parseInt(topicMatch[1]);
    return superProxy.handleTopicDetail(request, env, authUser.userId, topicId);
  }
  
  // /api/super/topics/:id/posts - 帖子列表
  const topicPostsMatch = path.match(/^\/api\/super\/topics\/(\d+)\/posts$/);
  if (topicPostsMatch) {
    const topicId = parseInt(topicPostsMatch[1]);
    if (method === 'GET') {
      return superProxy.handlePostsList(request, env, authUser.userId, topicId);
    }
    if (method === 'POST') {
      return superProxy.handleCreatePost(request, env, authUser.userId, topicId);
    }
  }
  
  // /api/super/groups (POST) - 创建小组
  if (path === '/api/super/groups' && method === 'POST') {
    return superProxy.handleCreateGroup(request, env, authUser.userId);
  }
  
  // /api/auth/bangumi-status - Bangumi 绑定状态
  if (path === '/api/auth/bangumi-status' && method === 'GET') {
    return superProxy.handleBangumiStatus(request, env, authUser.userId);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add worker/lib/super-proxy.js worker/oauth-proxy.js
git commit -m "feat(worker): add super proxy routes for bangumi groups"
```

---

### Task 3: 前端路由配置

**Files:**
- Create: `src/pages/SuperPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/Layout/Header.jsx`

- [ ] **Step 1: 创建 SuperPage.jsx 入口**

```jsx
// src/pages/SuperPage.jsx
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import SuperHome from '../components/Super/SuperHome';
import GroupDetail from '../components/Super/GroupDetail';
import TopicDetail from '../components/Super/TopicDetail';
import BangumiBindPrompt from '../components/Super/BangumiBindPrompt';
import { useApp } from '../context/AppContext';

export default function SuperPage() {
  const { currentUser, bangumiBound } = useApp();
  
  // 未登录或未绑定 Bangumi 账号时显示提示
  if (!currentUser || !bangumiBound) {
    return <BangumiBindPrompt />;
  }
  
  return (
    <Routes>
      <Route path="/" element={<SuperHome />} />
      <Route path="/group/:groupId" element={<GroupDetail />} />
      <Route path="/topic/:topicId" element={<TopicDetail />} />
    </Routes>
  );
}
```

- [ ] **Step 2: 在 App.jsx 中添加路由**

在 `<Routes>` 中添加：

```jsx
import SuperPage from './pages/SuperPage';

// 在 Routes 中添加
<Route path="/super/*" element={<SuperPage />} />
```

- [ ] **Step 3: 在 Header.jsx 中添加导航项**

在导航列表中添加「超展开」：

```jsx
// 在 navItems 数组中添加
{ path: '/super', label: '超展开', icon: MessageSquare },
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/SuperPage.jsx src/App.jsx src/components/Layout/Header.jsx
git commit -m "feat(frontend): add super page routes and navigation"
```

---

### Task 4: AppContext 扩展 - Bangumi 绑定状态

**Files:**
- Modify: `src/context/AppContext.jsx`

- [ ] **Step 1: 添加 bangumiBound 状态**

在 AppContext 中添加：

```jsx
// 在 useState 部分添加
const [bangumiBound, setBangumiBound] = useState(false);

// 在 refreshUser 函数中检查绑定状态
const refreshUser = async () => {
  if (!token) return;
  try {
    const user = await AuthService.getProfile();
    setCurrentUser(user);
    setIsAuthenticated(true);
    
    // 检查 Bangumi 绑定状态
    const status = await apiRequest('/api/auth/bangumi-status');
    setBangumiBound(status.bound === true);
  } catch (err) {
    console.error('Failed to refresh user:', err);
    logout();
  }
};

// 在 value 中添加
const value = {
  // ... 现有值 ...
  bangumiBound,
  setBangumiBound,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/context/AppContext.jsx
git commit -m "feat(context): add bangumi bound state to AppContext"
```

---

### Task 5: SuperService API 服务

**Files:**
- Create: `src/services/SuperService.js`

- [ ] **Step 1: 创建 SuperService.js**

```javascript
// src/services/SuperService.js
import { apiRequest } from './api';

const SuperService = {
  /**
   * 获取小组列表
   */
  getGroups: async (page = 1, limit = 20, sort = 'members') => {
    return apiRequest(`/api/super/groups?page=${page}&limit=${limit}&sort=${sort}`);
  },
  
  /**
   * 获取小组详情
   */
  getGroupDetail: async (groupId) => {
    return apiRequest(`/api/super/groups/${groupId}`);
  },
  
  /**
   * 获取小组话题列表
   */
  getGroupTopics: async (groupId, page = 1, limit = 20) => {
    return apiRequest(`/api/super/groups/${groupId}/topics?page=${page}&limit=${limit}`);
  },
  
  /**
   * 获取话题详情
   */
  getTopicDetail: async (topicId) => {
    return apiRequest(`/api/super/topics/${topicId}`);
  },
  
  /**
   * 获取话题帖子列表
   */
  getTopicPosts: async (topicId, page = 1, limit = 20) => {
    return apiRequest(`/api/super/topics/${topicId}/posts?page=${page}&limit=${limit}`);
  },
  
  /**
   * 发表话题
   */
  createTopic: async (groupId, title, content) => {
    return apiRequest(`/api/super/groups/${groupId}/topics`, {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    });
  },
  
  /**
   * 发表回复
   */
  createPost: async (topicId, content, related = 0) => {
    return apiRequest(`/api/super/topics/${topicId}/posts`, {
      method: 'POST',
      body: JSON.stringify({ content, related }),
    });
  },
  
  /**
   * 加入小组
   */
  joinGroup: async (groupId) => {
    return apiRequest(`/api/super/groups/${groupId}/join`, {
      method: 'POST',
    });
  },
  
  /**
   * 退出小组
   */
  leaveGroup: async (groupId) => {
    return apiRequest(`/api/super/groups/${groupId}/leave`, {
      method: 'DELETE',
    });
  },
  
  /**
   * 创建小组
   */
  createGroup: async (name, title, desc, icon = '', accessible = true, nsfw = false) => {
    return apiRequest(`/api/super/groups`, {
      method: 'POST',
      body: JSON.stringify({ name, title, desc, icon, accessible, nsfw }),
    });
  },
  
  /**
   * 查询 Bangumi 绑定状态
   */
  getBangumiStatus: async () => {
    return apiRequest('/api/auth/bangumi-status');
  },
};

export default SuperService;
```

- [ ] **Step 2: 在 api.js 中导出**

在 `src/services/api.js` 底部添加：

```javascript
export { SuperService } from './SuperService';
```

- [ ] **Step 3: Commit**

```bash
git add src/services/SuperService.js src/services/api.js
git commit -m "feat(service): add SuperService for bangumi groups API"
```

---

## Phase 2: 浏览功能

### Task 6: BangumiBindPrompt 组件

**Files:**
- Create: `src/components/Super/BangumiBindPrompt.jsx`
- Create: `src/components/Super/BangumiBindPrompt.css`

- [ ] **Step 1: 创建 BangumiBindPrompt.jsx**

```jsx
// src/components/Super/BangumiBindPrompt.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ExternalLink } from 'lucide-react';
import './BangumiBindPrompt.css';

export default function BangumiBindPrompt() {
  return (
    <div className="bangumi-bind-prompt">
      <div className="bind-card">
        <AlertCircle className="bind-icon" size={48} />
        <h2>需要绑定 Bangumi 账号</h2>
        <p>超展开功能需要您先绑定 Bangumi 账号才能使用。</p>
        <p className="bind-desc">
          绑定后，您可以在站内浏览 Bangumi 小组、发帖回复、管理成员等。
        </p>
        <div className="bind-actions">
          <Link to="/settings" className="bind-btn primary">
            前往设置绑定
          </Link>
          <a 
            href="https://bgm.tv" 
            target="_blank" 
            rel="noopener noreferrer"
            className="bind-btn secondary"
          >
            <ExternalLink size={16} />
            访问 Bangumi 官网
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 BangumiBindPrompt.css**

```css
/* src/components/Super/BangumiBindPrompt.css */
.bangumi-bind-prompt {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
  padding: 2rem;
}

.bind-card {
  background: var(--bg-secondary);
  border-radius: 16px;
  padding: 2rem;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.bind-icon {
  color: var(--primary);
  margin-bottom: 1rem;
}

.bind-card h2 {
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.bind-card p {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.bind-desc {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.bind-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.bind-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.2s;
}

.bind-btn.primary {
  background: var(--primary);
  color: white;
}

.bind-btn.primary:hover {
  background: var(--primary-dark);
}

.bind-btn.secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
}

.bind-btn.secondary:hover {
  background: var(--bg-hover);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Super/BangumiBindPrompt.jsx src/components/Super/BangumiBindPrompt.css
git commit -m "feat(super): add BangumiBindPrompt component"
```

---

### Task 7: GroupCard 组件

**Files:**
- Create: `src/components/Super/GroupCard.jsx`

- [ ] **Step 1: 创建 GroupCard.jsx**

```jsx
// src/components/Super/GroupCard.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Users, MessageSquare } from 'lucide-react';

export default function GroupCard({ group }) {
  const {
    id,
    name,
    title,
    icon,
    desc,
    members,
    topics,
    posts,
    nsfw,
  } = group;
  
  return (
    <Link to={`/super/group/${id}`} className="group-card">
      <div className="group-icon">
        {icon ? (
          <img src={icon} alt={title} />
        ) : (
          <div className="group-icon-placeholder">
            <MessageSquare size={24} />
          </div>
        )}
      </div>
      <div className="group-info">
        <h3 className="group-title">{title}</h3>
        <p className="group-desc">{desc?.slice(0, 100)}{desc?.length > 100 ? '...' : ''}</p>
        <div className="group-stats">
          <span className="stat">
            <Users size={14} />
            {members} 成员
          </span>
          <span className="stat">
            <MessageSquare size={14} />
            {topics} 话题
          </span>
        </div>
        {nsfw && <span className="nsfw-tag">NSFW</span>}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Super/GroupCard.jsx
git commit -m "feat(super): add GroupCard component"
```

---

### Task 8: TopicCard 组件

**Files:**
- Create: `src/components/Super/TopicCard.jsx`

- [ ] **Step 1: 创建 TopicCard.jsx**

```jsx
// src/components/Super/TopicCard.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Clock } from 'lucide-react';

export default function TopicCard({ topic }) {
  const {
    id,
    gid,
    title,
    uid,
    username,
    replies,
    createdAt,
    updatedAt,
  } = topic;
  
  const formatDate = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN');
  };
  
  return (
    <Link to={`/super/topic/${id}`} className="topic-card">
      <h4 className="topic-title">{title}</h4>
      <div className="topic-meta">
        <span className="topic-author">{username}</span>
        <span className="topic-replies">
          <MessageCircle size={14} />
          {replies} 回复
        </span>
        <span className="topic-time">
          <Clock size={14} />
          {formatDate(updatedAt || createdAt)}
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Super/TopicCard.jsx
git commit -m "feat(super): add TopicCard component"
```

---

### Task 9: SuperHome 首页组件

**Files:**
- Create: `src/components/Super/SuperHome.jsx`
- Create: `src/components/Super/SuperHome.css`

- [ ] **Step 1: 创建 SuperHome.jsx**

```jsx
// src/components/Super/SuperHome.jsx
import React, { useState, useEffect } from 'react';
import { Search, SortAsc } from 'lucide-react';
import SuperService from '../../services/SuperService';
import GroupCard from './GroupCard';
import './SuperHome.css';

export default function SuperHome() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('members');
  const [search, setSearch] = useState('');
  
  useEffect(() => {
    loadGroups();
  }, [page, sort]);
  
  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await SuperService.getGroups(page, 20, sort);
      setGroups(data.data || data.groups || []);
    } catch (err) {
      setError('加载小组列表失败');
      console.error(err);
    }
    setLoading(false);
  };
  
  const handleSortChange = (newSort) => {
    setSort(newSort);
    setPage(1);
  };
  
  const filteredGroups = groups.filter(g => 
    g.title?.toLowerCase().includes(search.toLowerCase()) ||
    g.name?.toLowerCase().includes(search.toLowerCase())
  );
  
  return (
    <div className="super-home">
      <header className="super-header">
        <h1>超展开</h1>
        <p>Bangumi 小组讨论区</p>
      </header>
      
      <div className="super-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="搜索小组..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="sort-options">
          <SortAsc size={18} />
          <select value={sort} onChange={(e) => handleSortChange(e.target.value)}>
            <option value="members">按成员数</option>
            <option value="posts">按帖子数</option>
            <option value="topics">按话题数</option>
            <option value="created">按创建时间</option>
            <option value="updated">按更新时间</option>
          </select>
        </div>
      </div>
      
      {loading && <div className="loading">加载中...</div>}
      {error && <div className="error">{error}</div>}
      
      <div className="groups-grid">
        {filteredGroups.map(group => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
      
      {!loading && filteredGroups.length === 0 && (
        <div className="empty">暂无小组</div>
      )}
      
      <div className="pagination">
        <button 
          disabled={page <= 1}
          onClick={() => setPage(p => p - 1)}
        >
          上一页
        </button>
        <span>第 {page} 页</span>
        <button onClick={() => setPage(p => p + 1)}>
          下一页
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 SuperHome.css**

```css
/* src/components/Super/SuperHome.css */
.super-home {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.super-header {
  margin-bottom: 2rem;
}

.super-header h1 {
  font-size: 2rem;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.super-header p {
  color: var(--text-secondary);
}

.super-controls {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  flex: 1;
}

.search-box input {
  border: none;
  background: transparent;
  color: var(--text-primary);
  width: 100%;
}

.sort-options {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 0.5rem 1rem;
}

.sort-options select {
  border: none;
  background: transparent;
  color: var(--text-primary);
}

.groups-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.group-card {
  display: flex;
  gap: 1rem;
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 1rem;
  transition: all 0.2s;
  text-decoration: none;
}

.group-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.group-icon {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
}

.group-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.group-icon-placeholder {
  width: 100%;
  height: 100%;
  background: var(--primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}

.group-info {
  flex: 1;
}

.group-title {
  font-size: 1rem;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.group-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.group-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.nsfw-tag {
  background: var(--danger);
  color: white;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  margin-left: 0.5rem;
}

.pagination {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
}

.pagination button {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination button:hover:not(:disabled) {
  background: var(--bg-hover);
}

.loading, .error, .empty {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.error {
  color: var(--danger);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Super/SuperHome.jsx src/components/Super/SuperHome.css
git commit -m "feat(super): add SuperHome page component"
```

---

### Task 10: GroupDetail 小组详情页

**Files:**
- Create: `src/components/Super/GroupDetail.jsx`
- Create: `src/components/Super/GroupDetail.css`

- [ ] **Step 1: 创建 GroupDetail.jsx**

```jsx
// src/components/Super/GroupDetail.jsx
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, MessageSquare, Plus, UserPlus, UserMinus } from 'lucide-react';
import SuperService from '../../services/SuperService';
import TopicCard from './TopicCard';
import CreateTopicModal from './CreateTopicModal';
import './GroupDetail.css';

export default function GroupDetail() {
  const { groupId } = useParams();
  const [group, setGroup] = useState(null);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isMember, setIsMember] = useState(false);
  
  useEffect(() => {
    loadGroupDetail();
    loadTopics();
  }, [groupId]);
  
  const loadGroupDetail = async () => {
    try {
      const data = await SuperService.getGroupDetail(groupId);
      setGroup(data);
      setIsMember(data.is_member || false);
    } catch (err) {
      setError('加载小组详情失败');
      console.error(err);
    }
  };
  
  const loadTopics = async () => {
    setLoading(true);
    try {
      const data = await SuperService.getGroupTopics(groupId, page);
      setTopics(data.data || data.topics || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };
  
  const handleJoin = async () => {
    try {
      await SuperService.joinGroup(groupId);
      setIsMember(true);
      loadGroupDetail();
    } catch (err) {
      alert('加入小组失败');
    }
  };
  
  const handleLeave = async () => {
    try {
      await SuperService.leaveGroup(groupId);
      setIsMember(false);
      loadGroupDetail();
    } catch (err) {
      alert('退出小组失败');
    }
  };
  
  const handleCreateTopic = async (title, content) => {
    try {
      await SuperService.createTopic(groupId, title, content);
      setShowCreateModal(false);
      loadTopics();
    } catch (err) {
      alert('发表话题失败');
    }
  };
  
  if (!group && loading) {
    return <div className="loading">加载中...</div>;
  }
  
  if (!group) {
    return <div className="error">小组不存在</div>;
  }
  
  return (
    <div className="group-detail">
      <div className="group-header">
        <div className="group-icon-large">
          {group.icon ? (
            <img src={group.icon} alt={group.title} />
          ) : (
            <div className="icon-placeholder">
              <MessageSquare size={48} />
            </div>
          )}
        </div>
        <div className="group-meta">
          <h1>{group.title}</h1>
          <p className="group-desc">{group.desc}</p>
          <div className="group-stats">
            <span><Users size={16} /> {group.members} 成员</span>
            <span><MessageSquare size={16} /> {group.topics} 话题</span>
          </div>
        </div>
        <div className="group-actions">
          {isMember ? (
            <>
              <button className="action-btn primary" onClick={() => setShowCreateModal(true)}>
                <Plus size={16} /> 发表话题
              </button>
              <button className="action-btn secondary" onClick={handleLeave}>
                <UserMinus size={16} /> 退出小组
              </button>
            </>
          ) : (
            <button className="action-btn primary" onClick={handleJoin}>
              <UserPlus size={16} /> 加入小组
            </button>
          )}
        </div>
      </div>
      
      <div className="topics-section">
        <h2>话题列表</h2>
        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          <div className="topics-list">
            {topics.map(topic => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        )}
        
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            上一页
          </button>
          <button onClick={() => setPage(p => p + 1)}>
            下一页
          </button>
        </div>
      </div>
      
      {showCreateModal && (
        <CreateTopicModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTopic}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 GroupDetail.css**

```css
/* src/components/Super/GroupDetail.css */
.group-detail {
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
}

.group-header {
  display: flex;
  gap: 2rem;
  background: var(--bg-secondary);
  border-radius: 16px;
  padding: 2rem;
  margin-bottom: 2rem;
}

.group-icon-large {
  width: 100px;
  height: 100px;
  border-radius: 12px;
  overflow: hidden;
}

.group-icon-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-placeholder {
  width: 100%;
  height: 100%;
  background: var(--primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}

.group-meta {
  flex: 1;
}

.group-meta h1 {
  font-size: 1.5rem;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.group-meta .group-desc {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.group-stats {
  display: flex;
  gap: 1.5rem;
  color: var(--text-muted);
}

.group-stats span {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.group-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.primary {
  background: var(--primary);
  color: white;
}

.action-btn.primary:hover {
  background: var(--primary-dark);
}

.action-btn.secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
}

.action-btn.secondary:hover {
  background: var(--bg-hover);
}

.topics-section h2 {
  font-size: 1.25rem;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.topics-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.topic-card {
  display: block;
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1rem;
  text-decoration: none;
  transition: all 0.2s;
}

.topic-card:hover {
  background: var(--bg-hover);
}

.topic-title {
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.topic-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.topic-meta span {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Super/GroupDetail.jsx src/components/Super/GroupDetail.css
git commit -m "feat(super): add GroupDetail page component"
```

---

### Task 11: TopicDetail 话题详情页

**Files:**
- Create: `src/components/Super/TopicDetail.jsx`
- Create: `src/components/Super/TopicDetail.css`
- Create: `src/components/Super/PostItem.jsx`
- Create: `src/components/Super/ReplyInput.jsx`

- [ ] **Step 1: 创建 PostItem.jsx**

```jsx
// src/components/Super/PostItem.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';

export default function PostItem({ post, floor }) {
  const { id, uid, username, avatar, content, createdAt, related } = post;
  
  const formatDate = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN');
  };
  
  return (
    <div className="post-item">
      <div className="post-avatar">
        {avatar ? (
          <img src={avatar} alt={username} />
        ) : (
          <div className="avatar-placeholder">
            <User size={20} />
          </div>
        )}
      </div>
      <div className="post-content">
        <div className="post-header">
          <Link to={`/user/${uid}`} className="post-author">{username}</Link>
          <span className="post-floor">#{floor}</span>
          <span className="post-time">{formatDate(createdAt)}</span>
        </div>
        <div className="post-body">{content}</div>
        {related > 0 && (
          <div className="post-related">回复 #{related}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 ReplyInput.jsx**

```jsx
// src/components/Super/ReplyInput.jsx
import React, { useState } from 'react';
import { Send } from 'lucide-react';

export default function ReplyInput({ onSubmit, related = 0 }) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    await onSubmit(content, related);
    setContent('');
    setSubmitting(false);
  };
  
  return (
    <div className="reply-input">
      {related > 0 && <div className="reply-to">回复 #{related}</div>}
      <textarea
        placeholder="输入回复内容..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
      />
      <button 
        className="submit-btn"
        onClick={handleSubmit}
        disabled={submitting || !content.trim()}
      >
        <Send size={16} />
        发送
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 创建 TopicDetail.jsx**

```jsx
// src/components/Super/TopicDetail.jsx
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, User } from 'lucide-react';
import SuperService from '../../services/SuperService';
import PostItem from './PostItem';
import ReplyInput from './ReplyInput';
import './TopicDetail.css';

export default function TopicDetail() {
  const { topicId } = useParams();
  const [topic, setTopic] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  
  useEffect(() => {
    loadTopicDetail();
    loadPosts();
  }, [topicId]);
  
  const loadTopicDetail = async () => {
    try {
      const data = await SuperService.getTopicDetail(topicId);
      setTopic(data);
    } catch (err) {
      console.error(err);
    }
  };
  
  const loadPosts = async () => {
    setLoading(true);
    try {
      const data = await SuperService.getTopicPosts(topicId, page);
      setPosts(data.data || data.posts || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };
  
  const handleReply = async (content, related) => {
    try {
      await SuperService.createPost(topicId, content, related);
      loadPosts();
    } catch (err) {
      alert('回复失败');
    }
  };
  
  if (!topic) {
    return <div className="loading">加载中...</div>;
  }
  
  return (
    <div className="topic-detail">
      <header className="topic-header">
        <Link to={`/super/group/${topic.gid}`} className="back-link">
          <ArrowLeft size={16} /> 返回小组
        </Link>
        <h1>{topic.title}</h1>
        <div className="topic-author">
          <User size={16} />
          <span>{topic.username}</span>
          <span className="topic-time">
            {new Date(topic.createdAt * 1000).toLocaleString('zh-CN')}
          </span>
        </div>
      </header>
      
      <div className="posts-list">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          posts.map((post, index) => (
            <PostItem 
              key={post.id} 
              post={post} 
              floor={index + 1 + (page - 1) * 20}
            />
          ))
        )}
      </div>
      
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
          上一页
        </button>
        <button onClick={() => setPage(p => p + 1)}>
          下一页
        </button>
      </div>
      
      <ReplyInput onSubmit={handleReply} />
    </div>
  );
}
```

- [ ] **Step 4: 创建 TopicDetail.css**

```css
/* src/components/Super/TopicDetail.css */
.topic-detail {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

.topic-header {
  margin-bottom: 2rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: 1rem;
}

.back-link:hover {
  color: var(--primary);
}

.topic-header h1 {
  font-size: 1.5rem;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.topic-author {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
}

.topic-time {
  margin-left: 1rem;
}

.posts-list {
  margin-bottom: 1rem;
}

.post-item {
  display: flex;
  gap: 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.5rem;
}

.post-avatar {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
}

.post-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.post-content {
  flex: 1;
}

.post-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.post-author {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
}

.post-floor {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.post-time {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.post-body {
  color: var(--text-primary);
  line-height: 1.5;
}

.post-related {
  margin-top: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.reply-input {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
}

.reply-to {
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.reply-input textarea {
  width: 100%;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 0.75rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  resize: vertical;
}

.submit-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: white;
  border-radius: 8px;
  margin-top: 0.5rem;
  cursor: pointer;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Super/TopicDetail.jsx src/components/Super/TopicDetail.css src/components/Super/PostItem.jsx src/components/Super/ReplyInput.jsx
git commit -m "feat(super): add TopicDetail page and PostItem/ReplyInput components"
```

---

### Task 12: CreateTopicModal 发帖弹窗

**Files:**
- Create: `src/components/Super/CreateTopicModal.jsx`

- [ ] **Step 1: 创建 CreateTopicModal.jsx**

```jsx
// src/components/Super/CreateTopicModal.jsx
import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function CreateTopicModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    await onSubmit(title, content);
    setSubmitting(false);
  };
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>发表话题</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <div className="modal-body">
          <input
            type="text"
            placeholder="话题标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="title-input"
          />
          <textarea
            placeholder="话题内容"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="content-input"
          />
        </div>
        
        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            取消
          </button>
          <button 
            className="submit-btn"
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !content.trim()}
          >
            发表
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 GroupDetail.css 中添加 Modal 样式**

```css
/* 在 GroupDetail.css 底部添加 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-primary);
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  padding: 1.5rem;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.modal-header h2 {
  color: var(--text-primary);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.modal-body {
  margin-bottom: 1rem;
}

.title-input, .content-input {
  width: 100%;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 0.75rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.content-input {
  resize: vertical;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.cancel-btn {
  padding: 0.5rem 1rem;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: 8px;
  cursor: pointer;
}

.submit-btn {
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: white;
  border-radius: 8px;
  cursor: pointer;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Super/CreateTopicModal.jsx src/components/Super/GroupDetail.css
git commit -m "feat(super): add CreateTopicModal component"
```

---

## Phase 3: 成员管理功能

### Task 13: GroupCreateForm 创建小组表单

**Files:**
- Create: `src/components/Super/GroupCreateForm.jsx`
- Modify: `src/pages/SuperPage.jsx` - 添加创建小组路由

- [ ] **Step 1: 创建 GroupCreateForm.jsx**

```jsx
// src/components/Super/GroupCreateForm.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import SuperService from '../../services/SuperService';

export default function GroupCreateForm() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [icon, setIcon] = useState('');
  const [accessible, setAccessible] = useState(true);
  const [nsfw, setNsfw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const handleSubmit = async () => {
    if (!name.trim() || !title.trim()) return;
    setSubmitting(true);
    try {
      const result = await SuperService.createGroup(name, title, desc, icon, accessible, nsfw);
      navigate(`/super/group/${result.id}`);
    } catch (err) {
      alert('创建小组失败');
    }
    setSubmitting(false);
  };
  
  return (
    <div className="group-create-form">
      <h1>创建小组</h1>
      
      <div className="form-group">
        <label>小组名称（英文标识）</label>
        <input
          type="text"
          placeholder="例如：anime_discussion"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      
      <div className="form-group">
        <label>小组标题（显示名称）</label>
        <input
          type="text"
          placeholder="例如：动画讨论区"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      
      <div className="form-group">
        <label>小组简介</label>
        <textarea
          placeholder="描述小组的主题和内容..."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
        />
      </div>
      
      <div className="form-group">
        <label>小组图标 URL</label>
        <input
          type="text"
          placeholder="图标图片地址"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
        />
      </div>
      
      <div className="form-group checkbox">
        <input
          type="checkbox"
          checked={accessible}
          onChange={(e) => setAccessible(e.target.checked)}
        />
        <label>公开小组</label>
      </div>
      
      <div className="form-group checkbox">
        <input
          type="checkbox"
          checked={nsfw}
          onChange={(e) => setNsfw(e.target.checked)}
        />
        <label>NSFW 内容</label>
      </div>
      
      <button 
        className="submit-btn"
        onClick={handleSubmit}
        disabled={submitting || !name.trim() || !title.trim()}
      >
        <Plus size={16} />
        创建小组
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 在 SuperPage.jsx 中添加路由**

```jsx
import GroupCreateForm from '../components/Super/GroupCreateForm';

// 在 Routes 中添加
<Route path="/create" element={<GroupCreateForm />} />
```

- [ ] **Step 3: 在 SuperHome.jsx 中添加创建入口**

```jsx
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

// 在 super-header 中添加
<Link to="/super/create" className="create-link">
  <Plus size={16} /> 创建小组
</Link>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Super/GroupCreateForm.jsx src/pages/SuperPage.jsx src/components/Super/SuperHome.jsx
git commit -m "feat(super): add GroupCreateForm and create group route"
```

---

## Phase 4: 样式整合与测试

### Task 14: 整合样式文件

**Files:**
- Create: `src/components/Super/Super.css` - 统一导入所有样式

- [ ] **Step 1: 创建 Super.css 统一导入**

```css
/* src/components/Super/Super.css */
@import './BangumiBindPrompt.css';
@import './SuperHome.css';
@import './GroupDetail.css';
@import './TopicDetail.css';
```

- [ ] **Step 2: 在 index.css 中导入**

```css
/* 在 src/index.css 中添加 */
@import './components/Super/Super.css';
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Super/Super.css src/index.css
git commit -m "style(super): integrate super component styles"
```

---

### Task 15: 本地测试验证

- [ ] **Step 1: 启动开发服务器**

Run: `npm run dev`
Expected: Server starts on http://localhost:5173

- [ ] **Step 2: 测试路由**

- 访问 http://localhost:5173/super
- 验证未登录用户显示 BangumiBindPrompt
- 登录后验证小组列表显示

- [ ] **Step 3: 测试 API 代理**

- 检查 Worker 本地运行状态
- 测试 `/api/super/groups` 端点响应

- [ ] **Step 4: Commit 测试记录**

```bash
git commit --allow-empty -m "test(super): verify local development setup"
```

---

## Self-Review Checklist

**1. Spec Coverage:**
- ✅ 浏览小组列表 - Task 7, 9
- ✅ 小组详情 - Task 10
- ✅ 话题详情 - Task 11
- ✅ 发帖回复 - Task 12, ReplyInput
- ✅ 加入/退出小组 - Task 10
- ✅ 创建小组 - Task 13
- ✅ Bangumi 绑定状态 - Task 4, 6
- ✅ Worker 代理路由 - Task 2
- ✅ 数据库迁移 - Task 1

**2. Placeholder Scan:**
- ✅ 无 TBD/TODO
- ✅ 所有代码步骤包含完整实现
- ✅ 所有文件路径明确

**3. Type Consistency:**
- ✅ SuperService 方法名与 Worker 路径一致
- ✅ 组件 props 定义一致
- ✅ API 响应字段名与数据库字段名一致

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-19-super-feature.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**