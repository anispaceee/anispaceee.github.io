# 第一批功能实现计划：用户头像点击 + 个人主页重构

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现用户头像可点击进入个人主页（含隐私控制）+ 个人主页 UI 重构为侧边栏+分类标记布局

**Architecture:** 前端 React 组件重构 + Cloudflare Worker API 扩展 + D1 数据库字段新增。UserAvatar 统一头像点击行为，Profile 组件重构为左右两栏布局。

**Tech Stack:** React 19, React Router, Cloudflare Worker, D1 (SQLite), CSS Variables

---

## File Structure

### 新建文件
- `src/components/Common/UserAvatar.jsx` - 可点击头像组件
- `src/components/Common/UserAvatar.css` - 头像样式
- `src/components/Profile/ProfileSettings.jsx` - 设置弹窗组件
- `src/components/Profile/ProfileSettings.css` - 设置弹窗样式
- `src/components/Profile/ActivityHeatmap.jsx` - 活跃度热力图组件
- `src/components/Profile/ActivityHeatmap.css` - 热力图样式

### 修改文件
- `worker/oauth-proxy.js` - 新增 API 端点 + users 表字段
- `worker/schema.sql` - 新增字段定义
- `src/components/Profile/Profile.jsx` - 重构为左右两栏布局
- `src/components/Profile/Profile.css` - 重构样式
- `src/components/Profile/ProfileStats.jsx` - 精简为侧边栏统计
- `src/components/Profile/ProfileStats.css` - 精简样式
- `src/components/WorldChannel/WorldChannel.jsx` - 替换头像为 UserAvatar
- `src/components/Forum/Forum.jsx` - 替换头像为 UserAvatar
- `src/components/Forum/PostDetail.jsx` - 替换头像为 UserAvatar
- `src/pages/HomePage.jsx` - 替换头像为 UserAvatar
- `src/components/Notification/Notifications.jsx` - 替换头像为 UserAvatar
- `src/components/Mailbox/Mailbox.jsx` - 替换头像为 UserAvatar
- `src/services/api.js` - 新增 UserService.getProfile / updateSettings

---

### Task 1: 后端 - D1 新增字段 + Worker API

**Files:**
- Modify: `worker/oauth-proxy.js`
- Modify: `worker/schema.sql`

- [ ] **Step 1: 更新 schema.sql**

在 users 表定义中新增两个字段：

```sql
-- 在 users 表的 CREATE TABLE 中添加
allow_profile_view INTEGER DEFAULT 1,
allow_comments_public INTEGER DEFAULT 1,
```

- [ ] **Step 2: Worker 新增 ALTER TABLE 逻辑**

在 Worker 的路由中添加初始化检查（如果字段不存在则 ALTER TABLE）。更安全的做法是通过 wrangler d1 execute 手动执行：

```sql
ALTER TABLE users ADD COLUMN allow_profile_view INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN allow_comments_public INTEGER DEFAULT 1;
```

- [ ] **Step 3: Worker 新增 GET /api/users/:id/profile 端点**

在 oauth-proxy.js 的路由匹配中添加：

```javascript
// 获取用户公开信息（受隐私设置控制）
if (url.pathname.match(/^\/api\/users\/\d+\/profile$/)) {
  const userId = url.pathname.split('/')[3];
  const user = await db.prepare('SELECT id, username, name, avatar, bio, join_date, allow_profile_view, allow_comments_public FROM users WHERE id = ?').bind(userId).first();
  if (!user) return jsonResp({ error: '用户不存在' }, 404);
  // 如果请求者不是本人，且用户关闭了主页查看
  const requesterId = getUserIdFromRequest(request);
  if (requesterId !== userId && !user.allow_profile_view) {
    return jsonResp({ error: '该用户已设置隐私保护', private: true }, 403);
  }
  return jsonResp(user);
}
```

- [ ] **Step 4: Worker 新增 PUT /api/users/:id/settings 端点**

```javascript
if (url.pathname.match(/^\/api\/users\/\d+\/settings$/) && request.method === 'PUT') {
  const userId = url.pathname.split('/')[3];
  const requesterId = getUserIdFromRequest(request);
  if (requesterId !== userId) return jsonResp({ error: '无权限' }, 403);
  const body = await request.json();
  const { allow_profile_view, allow_comments_public } = body;
  await db.prepare('UPDATE users SET allow_profile_view = ?, allow_comments_public = ? WHERE id = ?')
    .bind(allow_profile_view ?? 1, allow_comments_public ?? 1, userId).run();
  return jsonResp({ success: true });
}
```

- [ ] **Step 5: Worker 新增 GET /api/users/:id/comments 端点**

```javascript
if (url.pathname.match(/^\/api\/users\/\d+\/comments$/)) {
  const userId = url.pathname.split('/')[3];
  // 检查隐私设置
  const user = await db.prepare('SELECT allow_comments_public FROM users WHERE id = ?').bind(userId).first();
  if (!user) return jsonResp({ error: '用户不存在' }, 404);
  const requesterId = getUserIdFromRequest(request);
  if (requesterId !== userId && !user.allow_comments_public) {
    return jsonResp({ error: '该用户已设置评论不公开' }, 403);
  }
  const comments = await db.prepare('SELECT r.*, c.subject_name, c.subject_image FROM ratings r LEFT JOIN collections c ON r.subject_id = c.subject_id AND r.user_id = c.user_id WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 10').bind(userId).all();
  return jsonResp(comments.results);
}
```

- [ ] **Step 6: 部署 Worker 并执行 D1 ALTER TABLE**

```bash
$env:CLOUDFLARE_API_TOKEN="xxx"; npx wrangler deploy
$env:CLOUDFLARE_API_TOKEN="xxx"; npx wrangler d1 execute anispace-db --remote --command "ALTER TABLE users ADD COLUMN allow_profile_view INTEGER DEFAULT 1"
$env:CLOUDFLARE_API_TOKEN="xxx"; npx wrangler d1 execute anispace-db --remote --command "ALTER TABLE users ADD COLUMN allow_comments_public INTEGER DEFAULT 1"
```

- [ ] **Step 7: 验证 API**

用 curl 测试新端点是否正常响应。

- [ ] **Step 8: Commit**

```bash
git add worker/oauth-proxy.js worker/schema.sql
git commit -m "feat: add user profile privacy settings API and DB fields"
```

---

### Task 2: 前端 - UserAvatar 组件

**Files:**
- Create: `src/components/Common/UserAvatar.jsx`
- Create: `src/components/Common/UserAvatar.css`

- [ ] **Step 1: 创建 UserAvatar 组件**

```jsx
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { UserService } from '../../services/api';
import './UserAvatar.css';

const FALLBACK_AVATAR = 'data:image/svg+xml,...'; // 复用现有 FALLBACK

export default function UserAvatar({ userId, src, alt, size = 40, className = '' }) {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const isSelf = currentUser && userId === currentUser.id;

  const handleClick = useCallback(async () => {
    if (!userId) return;
    if (isSelf) {
      navigate('/profile');
      return;
    }
    // 检查目标用户隐私设置
    setLoading(true);
    try {
      const profile = await UserService.getProfile(userId);
      navigate(`/profile/${userId}`);
    } catch (err) {
      if (err.private) {
        // 显示提示
        showToast('该用户已设置隐私保护');
      } else {
        navigate(`/profile/${userId}`);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, isSelf, navigate]);

  return (
    <img
      src={failed ? FALLBACK_AVATAR : src}
      alt={alt}
      className={`user-avatar ${className}`}
      style={{ width: size, height: size }}
      loading="lazy"
      onError={() => setFailed(true)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
    />
  );
}
```

- [ ] **Step 2: 创建 UserAvatar.css**

```css
.user-avatar {
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}
.user-avatar:hover {
  opacity: 0.85;
  transform: scale(1.05);
}
.user-avatar:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

- [ ] **Step 3: 在 api.js 中添加 UserService.getProfile 和 updateSettings**

```javascript
async getProfile(userId) {
  return apiRequest(`/api/users/${userId}/profile`);
}

async updateSettings(userId, settings) {
  return apiRequest(`/api/users/${userId}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

async getUserComments(userId) {
  return apiRequest(`/api/users/${userId}/comments`);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Common/UserAvatar.jsx src/components/Common/UserAvatar.css src/services/api.js
git commit -m "feat: add UserAvatar component with privacy check and UserService methods"
```

---

### Task 3: 前端 - 替换所有头像为 UserAvatar

**Files:**
- Modify: `src/components/WorldChannel/WorldChannel.jsx`
- Modify: `src/components/Forum/Forum.jsx`
- Modify: `src/components/Forum/PostDetail.jsx`
- Modify: `src/pages/HomePage.jsx`
- Modify: `src/components/Notification/Notifications.jsx`
- Modify: `src/components/Mailbox/Mailbox.jsx`

- [ ] **Step 1: 替换 WorldChannel.jsx 中的 Avatar 组件**

删除内部 Avatar 组件，导入 UserAvatar，将所有 `<Avatar src={...} alt={...} size={40} />` 替换为 `<UserAvatar userId={msg.author_id} src={user?.avatar} alt={user?.name} size={40} />`

- [ ] **Step 2: 替换 Forum.jsx 中的头像**

- [ ] **Step 3: 替换 PostDetail.jsx 中的头像**

- [ ] **Step 4: 替换 HomePage.jsx 中的头像**

- [ ] **Step 5: 替换 Notifications.jsx 中的头像**

- [ ] **Step 6: 替换 Mailbox.jsx 中的头像**

- [ ] **Step 7: 构建验证**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: replace all avatar instances with UserAvatar component"
```

---

### Task 4: 前端 - 活跃度热力图组件

**Files:**
- Create: `src/components/Profile/ActivityHeatmap.jsx`
- Create: `src/components/Profile/ActivityHeatmap.css`

- [ ] **Step 1: 创建 ActivityHeatmap 组件**

接收 `data` 属性（格式：`[{ date: '2026-01-15', count: 3 }, ...]`），渲染类似 GitHub 贡献图的年度热力图。

- 52 列（周）x 7 行（天）
- 颜色等级：0=#ebedf0, 1-2=#9be9a8, 3-5=#40c463, 6-8=#30a14e, 9+=#216e39
- 月份标签
- 图例

- [ ] **Step 2: 创建 ActivityHeatmap.css**

- [ ] **Step 3: Commit**

```bash
git add src/components/Profile/ActivityHeatmap.jsx src/components/Profile/ActivityHeatmap.css
git commit -m "feat: add ActivityHeatmap component for profile sidebar"
```

---

### Task 5: 前端 - ProfileSettings 设置弹窗

**Files:**
- Create: `src/components/Profile/ProfileSettings.jsx`
- Create: `src/components/Profile/ProfileSettings.css`

- [ ] **Step 1: 创建 ProfileSettings 弹窗组件**

包含：
- "允许其他人查看主页" 开关
- "公开我的评论" 开关
- 保存按钮 → 调用 `UserService.updateSettings`

- [ ] **Step 2: 创建 ProfileSettings.css**

- [ ] **Step 3: Commit**

```bash
git add src/components/Profile/ProfileSettings.jsx src/components/Profile/ProfileSettings.css
git commit -m "feat: add ProfileSettings modal with privacy toggles"
```

---

### Task 6: 前端 - Profile 主页重构

**Files:**
- Modify: `src/components/Profile/Profile.jsx`
- Modify: `src/components/Profile/Profile.css`
- Modify: `src/components/Profile/ProfileStats.jsx`
- Modify: `src/components/Profile/ProfileStats.css`

- [ ] **Step 1: 重构 Profile.jsx 为左右两栏布局**

左侧边栏（220px）：
1. 头像 + 编辑/设置按钮（仅自己主页显示）
2. 统计数字（竖排）
3. 标记进度条
4. 活跃度热力图

右侧主内容：
1. 想看 - 单行横滑 + "更多→"
2. 在看 - 单行横滑 + "更多→"
3. 看过 - 单行横滑 + "更多→" + 最近评论
4. 搁置 - 折叠
5. 抛弃 - 折叠

- [ ] **Step 2: 重构 Profile.css**

```css
.profile-layout {
  display: flex;
  gap: 24px;
}
.profile-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 80px;
}
.profile-main {
  flex: 1;
  min-width: 0;
}
@media (max-width: 900px) {
  .profile-layout {
    flex-direction: column;
  }
  .profile-sidebar {
    width: 100%;
    position: static;
  }
}
```

- [ ] **Step 3: 精简 ProfileStats.jsx**

移除 Tab 切换、饼图、折线图等，只保留竖排统计数字和标记进度条。

- [ ] **Step 4: 实现分类标记区域**

每个分类（想看/在看/看过/搁置/抛弃）渲染为：
- 标题行（色条 + 分类名 + 数量 + "更多→"）
- 单行横滑封面（使用 SubjectCard compact 模式）
- 看过分类额外渲染最近评论

- [ ] **Step 5: 实现最近评论区域**

从 `UserService.getUserComments(userId)` 获取数据，渲染评论列表。

- [ ] **Step 6: 实现编辑/设置入口**

头像右上角两个小圆形按钮，点击分别打开编辑资料弹窗和设置弹窗。

- [ ] **Step 7: 构建验证**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/components/Profile/
git commit -m "feat: redesign profile page with sidebar layout and categorized marks"
```

---

### Task 7: 集成验证 + 部署

- [ ] **Step 1: 完整构建**

```bash
npm run build
```

- [ ] **Step 2: 部署 Worker**

```bash
$env:CLOUDFLARE_API_TOKEN="xxx"; npx wrangler deploy
```

- [ ] **Step 3: 执行 D1 ALTER TABLE**

```bash
$env:CLOUDFLARE_API_TOKEN="xxx"; npx wrangler d1 execute anispace-db --remote --command "ALTER TABLE users ADD COLUMN allow_profile_view INTEGER DEFAULT 1"
$env:CLOUDFLARE_API_TOKEN="xxx"; npx wrangler d1 execute anispace-db --remote --command "ALTER TABLE users ADD COLUMN allow_comments_public INTEGER DEFAULT 1"
```

- [ ] **Step 4: 推送前端**

```bash
git push
```

- [ ] **Step 5: 验证**

访问 https://afterrain-2005.github.io 测试：
1. 点击任意用户头像 → 跳转个人主页
2. 个人主页侧边栏布局正确
3. 分类标记展示正确
4. 设置弹窗隐私开关可用
5. 活跃度热力图显示正确
