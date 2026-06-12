# 放課後社区功能深入改良设计

> 日期：2026-06-13
> 状态：待实现
> 方案：渐进式迭代（3 阶段）

## 背景

当前放課後（论坛）功能基础可用，但评论区体验与商业社交软件差距较大：
- 回复仅支持一级平铺，无嵌套/楼中楼
- 仅帖子级点赞，无回复点赞
- 回复无排序选项
- 回复输入框无 Markdown 工具栏
- 无收藏、关注、@提及、通知、表情包、举报等社交功能
- 数据库已有 `follows`、`notifications`、`favorites` 表但前端未启用

## 方案：渐进式迭代

按功能依赖关系分 3 阶段交付，每阶段可独立部署运行。

---

## P1：评论区改良

### 1.1 楼中楼回复

**数据库**：`replies` 表新增 `parent_id INTEGER DEFAULT NULL`，指向另一条 reply 的 id，最多 2 层嵌套。

**API**：
- `POST /api/posts/:id/replies` 新增可选 `parent_id` 字段
- `GET /api/posts/:id` 返回的 replies 按 `parent_id` 组织为树状结构：
  - 一级回复：`parent_id IS NULL`
  - 二级回复（楼中楼）：`parent_id` 指向一级回复的 id
  - 第 3 层回复自动归到第 2 层的父级下

**前端**：
- PostDetail 中回复列表改为树状渲染
- 一级回复正常显示，二级回复缩进显示在父回复下方
- 每条回复增加"回复"按钮，点击后回复框自动填充 `@用户名` 并设置 `parent_id`
- 楼中楼区域默认显示前 3 条，超出部分"展开更多"折叠

**渲染逻辑**：
```
回复 A（一级）
  └─ 回复 B → @A（二级，parent_id = A.id）
  └─ 回复 C → @A（二级，parent_id = A.id）
回复 D（一级）
```

### 1.2 回复点赞

**数据库**：`likes` 表新增 `reply_id INTEGER DEFAULT NULL`，与 `post_id` 互斥。

**API**：
- `POST /api/posts/:id/like` 扩展为支持 `reply_id` 参数
- `GET /api/posts/:id` 返回的每条 reply 包含 `likes` 计数和 `is_liked` 状态

**前端**：
- 每条回复右侧增加点赞按钮（心形图标 + 计数）
- 已赞状态显示实心心形 + 粉色

### 1.3 回复排序

**API**：`GET /api/posts/:id` 新增 `reply_sort` 查询参数：
- `newest`（默认）：按时间倒序
- `oldest`：按时间正序
- `hot`：按点赞数倒序

**前端**：评论区顶部增加排序切换按钮组（最新 / 最早 / 最热）

### 1.4 回复 Markdown 工具栏

**前端**：
- 回复输入框复用已有的 `RichTextEditor` 组件
- 支持粗体、斜体、链接、引用、列表
- 预览模式

---

## P2：社交互动

### 2.1 收藏帖子

**数据库**：已有 `favorites` 表（`user_id, post_id, created_at`），直接启用。

**API**：
- `POST /api/posts/:id/favorite` — 收藏/取消收藏（toggle）
- `GET /api/users/:id/favorites` — 获取用户收藏列表
- 帖子详情返回 `is_favorited` 和 `favorites_count`

**前端**：
- 帖子详情页增加收藏按钮（星形图标）
- 左侧个人信息栏增加"我的收藏"入口

### 2.2 关注用户

**数据库**：已有 `follows` 表（`follower_id, following_id, created_at`），直接启用。

**API**：
- `POST /api/users/:id/follow` — 关注/取消关注（toggle）
- `GET /api/users/:id/followers` — 获取粉丝列表
- `GET /api/users/:id/following` — 获取关注列表
- 用户信息返回 `followers_count` / `following_count` / `is_followed`

**前端**：
- 帖子详情页作者区域增加关注按钮
- 左侧个人信息栏增加"关注/粉丝"计数

### 2.3 @提及

**数据库**：`notifications` 表存储提及通知（`type = 'mention'`，`from_user_id`，`related_id`）。

**API**：
- 创建回复时解析 `@username` 模式，自动创建 mention 通知
- `GET /api/notifications` — 获取通知列表

**前端**：
- 回复输入时输入 `@` 弹出用户名补全列表（从已参与该帖子的用户中搜索）
- 渲染回复时 `@username` 自动转为可点击链接

### 2.4 自定义表情包

**数据库**：新增 `emoji_packs` 表和 `emojis` 表：

```sql
CREATE TABLE emoji_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  cover_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE emojis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id INTEGER NOT NULL,
  shortcode TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (pack_id) REFERENCES emoji_packs(id)
);
```

**API**：
- `GET /api/emoji-packs` — 获取表情包列表（含表情）
- `POST /api/emoji-packs` — 创建表情包（管理员）
- `POST /api/emoji-packs/:id/emojis` — 添加表情到包（管理员）
- 表情图片通过 ImgBB 上传（复用已有上传代理）

**前端**：
- 回复/发帖输入框旁增加表情按钮，点击弹出表情选择器
- 选择器按表情包分组（Tab 切换），支持搜索 shortcode
- 渲染时 `:shortcode:` 替换为 `<img class="emoji" src="..." />`

### 2.5 举报

**数据库**：新增 `reports` 表：

```sql
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,  -- 'post' | 'reply'
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending | reviewed | dismissed
  created_at TEXT DEFAULT (datetime('now'))
);
```

**API**：
- `POST /api/reports` — 提交举报
- `GET /api/reports` — 管理员查看举报列表（仅 admin 角色）

**前端**：
- 帖子和回复增加"举报"按钮（更多菜单中）
- 弹出举报原因选择（垃圾内容 / 骚扰 / 不当内容 / 其他）

---

## P3：通知系统

### 3.1 通知类型

复用已有 `notifications` 表，支持以下类型：

| 类型 | 触发条件 | 通知内容 |
|------|----------|----------|
| `reply` | 有人回复你的帖子 | "xxx 回复了你的帖子《标题》" |
| `reply_mention` | 回复中 @了你 | "xxx 在回复中提到了你" |
| `like_post` | 有人赞了你的帖子 | "xxx 赞了你的帖子《标题》" |
| `like_reply` | 有人赞了你的回复 | "xxx 赞了你的回复" |
| `follow` | 有人关注了你 | "xxx 关注了你" |
| `favorite` | 有人收藏了你的帖子 | "xxx 收藏了你的帖子《标题》" |

### 3.2 API

- `GET /api/notifications` — 获取通知列表（分页，按时间倒序）
- `GET /api/notifications/unread-count` — 获取未读数
- `PUT /api/notifications/read` — 标记全部已读
- `PUT /api/notifications/:id/read` — 标记单条已读

**数据库**：`notifications` 表已有 `is_read INTEGER DEFAULT 0`，直接使用。

### 3.3 前端

- 顶部导航栏增加铃铛图标 + 未读数红色角标
- 点击展开通知下拉面板，显示最近通知列表
- 每条通知可点击跳转到对应帖子/回复
- "全部已读"按钮
- 左侧个人信息栏增加通知入口

---

## 技术约束

- 后端：Cloudflare Worker + D1 数据库，所有 API 在 `oauth-proxy.js` 中
- 前端：React + React Router，CSS 变量体系
- 图片托管：ImgBB（已集成）
- 认证：JWT + GitHub OAuth
- 数据库迁移：D1 不支持 ALTER TABLE ADD COLUMN 的所有场景，需在 schema.sql 中维护完整建表语句，新表直接 CREATE，已有表的新字段通过 `ALTER TABLE` 添加

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| D1 ALTER TABLE 限制 | 新增字段用 `ALTER TABLE ... ADD COLUMN`，新表用 `CREATE TABLE IF NOT EXISTS` |
| 表情包图片存储 | 复用 ImgBB 上传代理，无需额外存储 |
| 通知性能 | D1 查询量小，无需缓存；未读数接口轻量 |
| @提及补全性能 | 仅搜索当前帖子参与者，数据量有限 |
