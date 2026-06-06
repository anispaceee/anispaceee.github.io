# ANISpace Code Wiki

> ACG Community — 二次元社区平台，融合 bgm.tv 简洁专业风格与 bilibili 活泼视觉元素。

---

## 目录

1. [项目概览](#1-项目概览)
2. [技术栈与依赖](#2-技术栈与依赖)
3. [项目结构](#3-项目结构)
4. [整体架构](#4-整体架构)
5. [路由系统](#5-路由系统)
6. [全局状态管理](#6-全局状态管理)
7. [服务层 (Services)](#7-服务层-services)
8. [组件模块详解](#8-组件模块详解)
9. [数据层](#9-数据层)
10. [样式系统](#10-样式系统)
11. [外部 API 集成](#11-外部-api-集成)
12. [项目运行方式](#12-项目运行方式)
13. [关键设计决策](#13-关键设计决策)

---

## 1. 项目概览

ANISpace 是一个面向 ACG（动画、漫画、游戏）爱好者的社区平台，提供番剧资讯、论坛讨论、创作分享、视频弹幕、音乐播放、Live2D 互动等丰富功能。项目采用纯前端架构，使用 localStorage 模拟后端数据持久化，同时集成 Bangumi API 等外部数据源。

**核心特性：**
- Bangumi API 集成的番剧搜索与评分系统
- 类桌面操作系统的窗口管理器（可拖拽、缩放、最小化、最大化）
- 实时弹幕引擎
- Live2D 看板娘
- 网易云音乐 / QQ音乐集成播放器
- 多主题支持（浅色 / 深色 / 高对比度）

---

## 2. 技术栈与依赖

### 运行时依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `react` | ^19.2.5 | UI 框架 |
| `react-dom` | ^19.2.5 | React DOM 渲染 |
| `react-router-dom` | ^7.15.0 | 客户端路由 |
| `lucide-react` | ^1.14.0 | 图标库 |
| `pixi.js` | ^7.4.3 | WebGL 渲染引擎（Live2D） |
| `pixi-live2d-display` | ^0.4.0 | Live2D 模型展示 |

### 开发依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `vite` | ^8.0.10 | 构建工具 |
| `@vitejs/plugin-react` | ^6.0.1 | Vite React 插件 |
| `eslint` | ^10.2.1 | 代码检查 |
| `eslint-plugin-react-hooks` | ^7.1.1 | Hooks 规则检查 |
| `eslint-plugin-react-refresh` | ^0.5.2 | React Refresh 支持 |

---

## 3. 项目结构

```
ANISpace/
├── docs/                          # 项目文档
│   ├── API_INTEGRATION.md         # API 集成说明
│   └── hikarinagi-ui-analysis.md  # UI 设计分析
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/                    # 静态资源（图片）
│   ├── components/                # 组件目录
│   │   ├── Amadeus/               # AI 助手模块
│   │   ├── Club/                  # 社团模块
│   │   ├── Common/                # 公共组件
│   │   │   └── MarkdownEditor/    # Markdown 编辑器
│   │   ├── Creation/              # 创作区
│   │   ├── Forum/                 # 论坛/交流区
│   │   ├── FriendSpace/           # 好友空间
│   │   ├── Guestbook/             # 留言板
│   │   ├── Info/                  # 资讯区
│   │   ├── Layout/                # 布局组件
│   │   ├── Mailbox/               # 邮箱系统
│   │   ├── Music/                 # 音乐播放器
│   │   ├── NewsZone/              # 新闻区
│   │   ├── Notification/          # 通知中心
│   │   ├── Profile/               # 用户中心
│   │   ├── TouchGal/              # 触控画廊
│   │   ├── Video/                 # 视频区
│   │   ├── Wiki/                  # 百科模块
│   │   └── WorldChannel/          # 世界频道
│   ├── context/                   # React Context 状态管理
│   │   ├── AppContext.jsx         # 应用全局状态
│   │   └── WindowManager.jsx      # 窗口管理器状态
│   ├── data/
│   │   └── mockData.js            # Mock 数据
│   ├── pages/
│   │   └── HomePage.jsx           # 首页
│   ├── services/                  # 服务层
│   │   ├── api.js                 # 核心业务 API
│   │   ├── externalAPI.js         # 外部 API 集成
│   │   └── storage.js             # localStorage 封装
│   ├── styles/
│   │   └── hikari-styles.css      # Hikari 主题样式
│   ├── App.jsx                    # 应用根组件 + 路由配置
│   ├── index.css                  # 全局样式
│   └── main.jsx                   # 入口文件
├── index.html                     # HTML 模板
├── package.json
├── vite.config.js
└── eslint.config.js
```

---

## 4. 整体架构

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        main.jsx                             │
│              BrowserRouter > AppProvider > App               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                         App.jsx                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Routes      │  │  WindowLayer │  │  DockBar          │  │
│  │  (页面路由)   │  │  (浮动窗口)   │  │  (底部任务栏)     │  │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘  │
│         │                 │                     │            │
│  ┌──────▼───────┐  ┌──────▼───────┐            │            │
│  │ Layout       │  │ AppWindow[]  │            │            │
│  │ Header+Outlet│  │ (可拖拽窗口)  │            │            │
│  └──────┬───────┘  └──────────────┘            │            │
│         │                                      │            │
│  ┌──────▼───────────────────────────────────────▼────────┐  │
│  │                   页面组件 / 功能组件                    │  │
│  │  HomePage Forum Info Creation Video Profile ...       │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │              Context 层 (全局状态)                      │  │
│  │  AppContext (用户/认证/通知)  WindowManager (窗口状态)   │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │                 Services 层 (业务逻辑)                  │  │
│  │  AuthService  BangumiService  VideoService  ...       │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │              StorageService (localStorage)              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 架构特点

1. **纯前端 SPA**：无后端服务，所有数据持久化依赖 localStorage
2. **双渲染模式**：路由页面（传统 SPA 页面）+ 浮动窗口（类桌面 OS 窗口）
3. **服务层抽象**：业务逻辑集中在 `services/` 目录，组件通过 Service 对象交互
4. **Context 状态管理**：不使用 Redux 等第三方状态库，仅用 React Context + useState

---

## 5. 路由系统

路由定义在 [App.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/App.jsx) 中，使用 React Router DOM v7。

### 路由表

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `HomePage` | 首页（随机推荐、搜索、每日放送、热门帖子） |
| `/world` | `WorldChannel` | 世界频道 |
| `/forum` | `Forum` | 交流区（论坛） |
| `/forum/post/:id` | `PostDetail` | 帖子详情 |
| `/info/:type/:id` | `InfoDetail` | 资讯详情（type: anime/novel/game） |
| `/creation` | `Creation` | 创作区 |
| `/creation/work/:id` | `CreationDetail` | 作品详情 |
| `/club` | `Club` | 社团 |
| `/wiki` | `Wiki` | 百科 |
| `/profile` | `Profile` | 当前用户个人中心 |
| `/profile/:id` | `Profile` | 指定用户个人中心 |
| `/video` | `VideoZone` | 视频区 |
| `/video/:id` | `VideoDetail` | 视频详情 |
| `/video/upload` | `VideoUpload` | 视频投稿 |
| `/mailbox` | `Mailbox` | 邮箱 |
| `/guestbook` | `Guestbook` | 留言板 |
| `/music` | `MusicPlayer` | 音乐播放器 |
| `/friends` | `FriendSpace` | 好友空间 |
| `/amadeus` | `Amadeus` | AI 助手 |
| `/live2d` | `Live2DViewer` | Live2D 展示页（懒加载） |

### 路由结构

所有路由嵌套在 `Layout` 组件下，Layout 提供 Header 导航和 `<Outlet />` 内容区。此外，`AuthModal`、`Live2DWidget`、`WindowLayer`（浮动窗口层）和 `DockBar`（底部任务栏）作为全局组件渲染在路由之外。

---

## 6. 全局状态管理

### 6.1 AppContext

**文件**: [AppContext.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/context/AppContext.jsx)

**职责**: 管理用户认证状态、通知数据

**提供的 Context 值：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `currentUser` | `object \| null` | 当前登录用户对象 |
| `isAuthenticated` | `boolean` | 是否已登录 |
| `notifications` | `array` | 未读通知列表 |
| `showAuthModal` | `boolean` | 认证弹窗是否显示 |
| `authModalTab` | `'login' \| 'register'` | 认证弹窗当前标签页 |
| `login(identifier, password)` | `function` | 登录 |
| `register(data)` | `function` | 注册 |
| `logout()` | `function` | 退出登录 |
| `updateProfile(updates)` | `function` | 更新用户资料 |
| `openAuth(tab?)` | `function` | 打开认证弹窗 |
| `closeAuth()` | `function` | 关闭认证弹窗 |
| `refreshUser()` | `function` | 刷新当前用户数据 |
| `setNotifications` | `function` | 设置通知列表 |

**使用方式**: `const { currentUser, isAuthenticated, ... } = useApp();`

### 6.2 WindowManager

**文件**: [WindowManager.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/context/WindowManager.jsx)

**职责**: 管理浮动窗口的生命周期（打开、关闭、拖拽、缩放、层级）

**预定义窗口配置 (`DEFAULT_WINDOW_CONFIG`)：**

| 窗口 ID | 标题 | 默认尺寸 | 最小尺寸 |
|---------|------|---------|---------|
| `music` | 音乐 | 420x560 | 300x400 |
| `friends` | 好友空间 | 480x600 | 300x400 |
| `amadeus` | Amadeus | 680x520 | 400x400 |
| `world` | 世界频道 | 450x550 | 300x400 |
| `notifications` | 通知 | 800x600 | 400x400 |
| `touchgal` | TouchGal | 1000x700 | 600x500 |

**提供的 Context 值：**

| 方法 | 说明 |
|------|------|
| `openWindow(id, data?)` | 打开窗口（如已打开则聚焦） |
| `closeWindow(id)` | 关闭窗口 |
| `minimizeWindow(id)` | 最小化窗口 |
| `maximizeWindow(id)` | 切换最大化 |
| `focusWindow(id)` | 聚焦窗口（提升 z-index） |
| `updateWindowPos(id, pos)` | 更新窗口位置 |
| `updateWindowSize(id, size)` | 更新窗口尺寸 |
| `bringToFront(id)` | 将窗口提升到最前 |
| `getWindowData(id)` | 获取窗口附加数据 |
| `clearWindowData(id)` | 清除窗口附加数据 |

**持久化**: 窗口位置和尺寸保存在 localStorage（`wm_pos_{id}` / `wm_size_{id}`）

---

## 7. 服务层 (Services)

### 7.1 StorageService

**文件**: [storage.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/storage.js)

localStorage 的简单封装，提供 `get`、`set`、`remove` 三个方法。

**存储键常量 (`STORAGE_KEYS`)：**

| 键名 | 值 | 用途 |
|------|------|------|
| `AUTH_TOKEN` | `acg_auth_token` | 认证令牌 |
| `CURRENT_USER` | `acg_current_user` | 当前用户 |
| `USERS` | `acg_users` | 用户列表 |
| `POSTS` | `acg_posts` | 论坛帖子 |
| `WORLD_MESSAGES` | `acg_world_messages` | 世界频道消息 |
| `FOLLOWS` | `acg_follows` | 关注关系 |
| `LIKES` | `acg_likes` | 点赞记录 |
| `FAVORITES` | `acg_favorites` | 收藏记录 |
| `COMMENTS` | `acg_comments` | 评论 |
| `RATINGS` | `acg_ratings` | 评分 |
| `NOTIFICATIONS` | `acg_notifications` | 通知 |
| `CREATIONS` | `acg_creations` | 创作作品 |
| `COMMISSIONS` | `acg_commissions` | 约稿 |
| `BANGUMI_CACHE` | `acg_bangumi_cache` | Bangumi API 缓存 |
| `COLLECTION_MARKS` | `acg_collection_marks` | 收藏标记（想看/在看/等） |
| `PRIVATE_MESSAGES` | `acg_private_messages` | 私信 |
| `VIDEOS` | `acg_videos` | 视频 |
| `DANMAKUS` | `acg_danmakus` | 弹幕 |
| `VIDEO_COMMENTS` | `acg_video_comments` | 视频评论 |
| `MAILBOX` | `acg_mailbox` | 邮箱 |

### 7.2 核心业务服务

**文件**: [api.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/api.js)

#### ApiError

自定义错误类，扩展 `Error`，增加 `status`（HTTP 状态码）和 `code`（错误类型码）属性。

| 属性/方法 | 说明 |
|-----------|------|
| `status` | HTTP 状态码 |
| `code` | 错误类型：`OFFLINE` / `NETWORK_ERROR` / `TIMEOUT` / `RATE_LIMITED` / `NOT_FOUND` / `FORBIDDEN` / `SERVER_ERROR` / `INVALID_DATA` |
| `isRetryable` | 是否可重试 |
| `userMessage` | 用户友好的错误消息 |

#### CacheManager

Bangumi API 响应缓存管理器，TTL = 30 分钟。

| 方法 | 说明 |
|------|------|
| `get(key)` | 获取缓存（过期返回 null） |
| `set(key, data)` | 写入缓存 |
| `clear()` | 清除缓存 |
| `clearAll()` | 删除缓存存储 |

#### AuthService

用户认证服务，基于 localStorage 模拟。

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `register(data)` | `{ username, email, password }` | `{ user, token }` 或 `{ error }` | 注册新用户 |
| `login(identifier, password)` | 用户名/邮箱, 密码 | `{ user, token }` 或 `{ error }` | 登录 |
| `logout()` | — | — | 退出登录 |
| `getCurrentUser()` | — | `user \| null` | 获取当前用户 |
| `isAuthenticated()` | — | `boolean` | 是否已认证 |
| `updateProfile(userId, updates)` | 用户ID, 更新字段 | `{ user }` 或 `{ error }` | 更新资料 |

**默认用户**: 预置 8 个模拟用户（id 1-8），含官方账号 `official_helper`。

#### UserService

| 方法 | 说明 |
|------|------|
| `getById(id)` | 按 ID 获取用户 |
| `search(query)` | 按名称搜索用户 |
| `follow(currentUserId, targetUserId)` | 关注/取消关注（toggle） |
| `isFollowing(currentUserId, targetUserId)` | 是否已关注 |

#### BangumiService

Bangumi API 客户端，基础 URL: `https://api.bgm.tv`

| 方法 | 说明 |
|------|------|
| `searchSubjects(keyword, type, limit, offset)` | 搜索条目（POST `/v0/search/subjects`） |
| `getSubject(id)` | 获取条目基本信息 |
| `getSubjectDetail(id)` | 获取条目详细信息（`responseGroup=large`） |
| `getCalendar()` | 获取番剧日历 |
| `getPopular(type, limit, offset)` | 获取热门条目 |
| `getSubjectsByTag(tag, type, limit, offset)` | 按标签搜索 |
| `getSubjectCharacters(id)` | 获取条目角色 |
| `getSubjectPersons(id)` | 获取条目制作人员 |
| `getRelatedSubjects(id)` | 获取关联条目 |
| `getSubjectComments(id, limit, offset)` | 获取条目评论 |
| `getSubjectBlog(id, limit, offset)` | 获取条目日志 |
| `getSubjectReviews(id)` | 获取条目评论 |
| `getRandomSubject(excludeIds, weights)` | 随机推荐（加权算法） |
| `getTypeByCode(code)` | 类型码转字符串 |
| `getTypeLabel(code)` | 类型码转中文标签 |
| `buildBangumiUrl(id)` | 构建 Bangumi 链接 |
| `clearCache()` | 清除缓存 |

**请求特性**: 超时 10s、最大重试 3 次（指数退避 1s/2s/4s）、自动缓存、离线检测。

#### RatingService

| 方法 | 说明 |
|------|------|
| `addRating(userId, subjectId, subjectType, score, content)` | 添加/更新评分（1-10分） |
| `getRatings(subjectId)` | 获取条目所有评分 |
| `getAverageScore(subjectId)` | 获取平均分 |
| `getUserRating(userId, subjectId)` | 获取用户评分 |

#### LikeService

| 方法 | 说明 |
|------|------|
| `toggle(userId, targetType, targetId)` | 点赞/取消点赞 |
| `isLiked(userId, targetType, targetId)` | 是否已点赞 |
| `getCount(targetType, targetId)` | 获取点赞数 |

#### FavoriteService

| 方法 | 说明 |
|------|------|
| `toggle(userId, targetType, targetId)` | 收藏/取消收藏 |
| `isFavorited(userId, targetType, targetId)` | 是否已收藏 |
| `getUserFavorites(userId, targetType?)` | 获取用户收藏列表 |

#### CollectionMarkService

收藏标记服务（想看/看过/在看/搁置/抛弃）。

| 标记 | 值 | 标签 | 颜色 |
|------|------|------|------|
| 想看 | `wish` | 想看 | `--secondary` |
| 看过 | `collect` | 看过 | `--success` |
| 在看 | `doing` | 在看 | `--accent-warm` |
| 搁置 | `on_hold` | 搁置 | `--tag-novel` |
| 抛弃 | `dropped` | 抛弃 | `--error` |

| 方法 | 说明 |
|------|------|
| `setMark(userId, subjectId, subjectType, mark, ...)` | 设置/切换标记 |
| `getMark(userId, subjectId)` | 获取标记 |
| `getUserMarks(userId, markType?)` | 获取用户所有标记 |
| `getMarkCounts(userId)` | 获取各标记数量统计 |
| `removeMark(userId, subjectId)` | 移除标记 |

#### NotificationService

| 方法 | 说明 |
|------|------|
| `add(userId, type, title, content, link?)` | 添加通知 |
| `getUnread(userId)` | 获取未读通知 |
| `getAll(userId)` | 获取所有通知 |
| `markRead(id)` | 标记已读 |
| `markAllRead(userId)` | 全部标记已读 |

#### PrivateMessageService

| 方法 | 说明 |
|------|------|
| `send(fromUserId, toUserId, content)` | 发送私信 |
| `getConversation(userId1, userId2)` | 获取两人对话 |
| `getConversations(userId)` | 获取用户所有会话 |
| `markAsRead(userId, otherUserId)` | 标记已读 |
| `getUnreadCount(userId)` | 获取未读数 |

#### MailService

完整的邮箱系统，支持附件、星标、搜索。

| 方法 | 说明 |
|------|------|
| `send(fromUserId, toUserId, subject, content, attachments?)` | 发送邮件 |
| `getInbox(userId)` | 获取收件箱 |
| `getSent(userId)` | 获取已发送 |
| `getMail(mailId)` | 获取邮件详情 |
| `markAsRead(mailId)` | 标记已读 |
| `toggleStar(mailId)` | 切换星标 |
| `deleteMail(mailId, userId)` | 删除邮件（双方删除才真正移除） |
| `getUnreadCount(userId)` | 获取未读数 |
| `getConversationMails(userId1, userId2)` | 获取两人往来邮件 |
| `searchMails(userId, query)` | 搜索邮件 |

#### VideoService

| 方法 | 说明 |
|------|------|
| `getAll()` | 获取所有视频 |
| `getById(id)` | 按 ID 获取视频 |
| `add(video)` | 添加视频 |
| `delete(id)` | 删除视频 |
| `incrementViews(id)` | 增加播放量 |
| `toggleLike(id, userId)` | 点赞 |
| `getByCategory(category)` | 按分类获取 |
| `getHot(limit)` | 获取热门视频 |
| `getLatest(limit)` | 获取最新视频 |
| `search(keyword)` | 搜索视频 |

#### DanmakuService

| 方法 | 说明 |
|------|------|
| `getByVideoId(videoId)` | 获取视频弹幕 |
| `add(videoId, danmaku)` | 添加弹幕 |
| `getCount(videoId)` | 获取弹幕数 |
| `getRecent(videoId, limit)` | 获取最近弹幕 |

#### VideoCommentService

| 方法 | 说明 |
|------|------|
| `getByVideoId(videoId)` | 获取视频评论 |
| `add(videoId, comment)` | 添加评论 |
| `addReply(commentId, reply)` | 添加回复 |
| `likeComment(commentId)` | 点赞评论 |
| `getCount(videoId)` | 获取评论数（含回复） |

#### AnimeApiService

第三方动漫 API 客户端（`api.animedb.com.br`），提供 `searchAnime` 和 `getAnimeDetail`。

#### NetEaseMusicService

网易云音乐服务，通过 Meting API（`api.injahow.cn/meting/`）代理请求。

| 方法 | 说明 |
|------|------|
| `search(keyword, limit)` | 搜索歌曲 |
| `getSongUrl(id)` | 获取播放链接 |
| `getPlaylistDetail(id)` | 获取歌单详情 |
| `getLyric(id)` | 获取歌词 |

#### QQMusicService

QQ音乐服务，同样通过 Meting API 代理，接口与 NetEaseMusicService 对称。

#### BangumiAuthService

Bangumi OAuth 授权服务。

| 方法 | 说明 |
|------|------|
| `buildAuthUrl()` | 构建授权 URL |
| `initiateLogin()` | 跳转 Bangumi 授权页 |
| `handleCallback(code)` | 处理授权回调 |
| `getBoundAccount()` | 获取已绑定的 Bangumi 账户 |
| `isBound()` | 是否已绑定 |
| `unbind()` | 解绑 |

### 7.3 外部 API 服务

**文件**: [externalAPI.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/externalAPI.js)

#### BaseExternalAPI

所有外部 API 的基类，封装了带超时和缓存的 `request` 方法。

#### AniListService

AniList GraphQL API 客户端（`graphql.anilist.co`）。

| 方法 | 说明 |
|------|------|
| `query(graphqlQuery, variables)` | 执行 GraphQL 查询 |
| `searchAnime(keyword, page, perPage)` | 搜索动画 |
| `searchManga(keyword, page, perPage)` | 搜索漫画 |
| `getAiringSchedule(page, perPage)` | 获取放送时间表 |
| `getTrendingAnime(page, perPage)` | 获取趋势动画 |
| `normalizeMedia(media)` | 数据标准化（静态方法） |

#### KitsuService

Kitsu API 客户端（`kitsu.io/api/edge`），提供动画/漫画搜索和趋势获取。

#### AcgClubService

ACGClub 图库 API 客户端（`rabtman.com/api/v2/acgclub`），提供图片搜索和分类浏览。

#### MoegirlService

萌娘百科 API 客户端（`mzh.moegirl.org.cn/api.php`），提供搜索和页面内容获取。

#### AnimeAPIService

本地 AnimeAPI 服务客户端（默认 `localhost:6001`），提供视频/小说/音乐搜索。

#### ExternalAPIRegistry

统一注册表，将所有外部 API 实例导出：

```js
ExternalAPIRegistry = {
  anilist: AniListService实例,
  kitsu: KitsuService实例,
  acgclub: AcgClubService实例,
  moegirl: MoegirlService实例,
  animeapi: AnimeAPIService实例,
}
```

---

## 8. 组件模块详解

### 8.1 布局组件 (Layout/)

#### Layout

**文件**: [Layout.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Layout/Layout.jsx)

应用布局容器，包含 `Header` 和 `<Outlet />`（路由内容区）。

#### Header

**文件**: [Header.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Layout/Header.jsx)

顶部导航栏，包含：
- Logo（ANISpace）
- 导航链接：首页、讨论、社团、视频、百科
- 全局搜索触发器（支持 `⌘K` 快捷键）
- 用户区域：通知铃铛、邮箱入口、头像、登出按钮
- 未登录时显示登录/注册按钮
- 移动端汉堡菜单

#### DockBar

**文件**: [DockBar.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Layout/DockBar.jsx)

底部任务栏（类 macOS Dock），功能包括：
- 应用启动器（TouchGal、好友空间、音乐、Amadeus、世界频道、通知）
- 快捷按钮：世界频道、Amadeus、音乐、好友空间、Live2D、设置、通知
- 设置面板：主题切换（浅色/深色/高对比度）、Live2D 显示控制、账户信息
- 音乐迷你控制面板
- 通知未读数角标
- 键盘导航支持（上下箭头 + Enter）

#### AppWindow

**文件**: [AppWindow.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Layout/AppWindow.jsx)

浮动窗口组件，实现类桌面 OS 窗口行为：
- 标题栏拖拽移动
- 四边/四角缩放调整尺寸
- 最小化 / 最大化 / 关闭按钮
- z-index 层级管理（点击提升）
- 关闭动画（300ms）
- 位置和尺寸持久化到 localStorage

### 8.2 首页 (HomePage)

**文件**: [HomePage.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/pages/HomePage.jsx)

首页聚合展示，包含以下区块：
- **随机推荐** (`RandomRecommendCard`)：Bangumi 随机推荐，支持刷新
- **新闻区** (`NewsZone`)：新闻动态
- **搜索栏**：Bangumi 条目搜索，支持分页
- **每日放送**：Bangumi 番剧日历，按星期切换
- **分类浏览**：动画/小说/游戏热门列表，分页
- **热门帖子**：论坛热门帖子预览
- **最新创作**：创作区最新作品
- **世界频道**：实时聊天预览

**关键子组件**：
- `Pagination` — 通用分页器
- `RandomRecommendCard` — 随机推荐卡片
- `AvatarWithFallback` — 带降级的头像组件

### 8.3 论坛 (Forum/)

#### Forum

**文件**: [Forum.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Forum/Forum.jsx)

交流区主页面，功能：
- 四个分区：游戏 / 动画 / 小说 / 吹水
- 发帖功能（含分类、标题、内容、标签）
- 搜索（按内容或用户名）
- 排序：最新 / 最热 / 回复最多
- 参考 Bangumi "超展开" 小组交互逻辑

#### PostDetail

**文件**: [PostDetail.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Forum/PostDetail.jsx)

帖子详情页，展示标题、作者、内容、图片、标签和评论回复，支持回复功能。

### 8.4 资讯区 (Info/)

#### Info

**文件**: [Info.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Info/Info.jsx)

资讯区主页面，集成 Bangumi API：
- 搜索功能
- 每日放送展示
- 内容分类浏览（动画、小说、游戏）及分页
- 评分、收藏、评论功能

#### InfoDetail

**文件**: [InfoDetail.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Info/InfoDetail.jsx)

条目详情页，展示：
- 封面图、评分、标签、简介
- 角色和制作人员信息
- 收藏标记（想看/看过/在看/搁置/抛弃）
- 评论和吐槽功能
- Bangumi 评论集成
- Bangumi 页面跳转链接

### 8.5 创作区 (Creation/)

#### Creation

**文件**: [Creation.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Creation/Creation.jsx)

创作区主页面：
- 三个分区：绘画 / 小说 / 游戏
- 筛选：全部作品 / 作品展示 / 约稿
- 作品发布功能（图片上传、文字描述、标签分类）
- 约稿功能（类型、价格、名额、工期）

#### CreationDetail

**文件**: [CreationDetail.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Creation/CreationDetail.jsx)

作品详情页，展示图片、描述、标签、作者信息和约稿信息。

### 8.6 视频区 (Video/)

#### VideoZone

**文件**: [VideoZone.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/VideoZone.jsx)

视频区主页，包含分类导航、热门推荐、最新投稿、搜索功能。

#### VideoPlayer

**文件**: [VideoPlayer.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/VideoPlayer.jsx)

视频播放器组件：
- 播放控制（播放/暂停/进度条/音量）
- 全屏切换
- 弹幕发送和渲染
- 播放设置

#### VideoDetail

**文件**: [VideoDetail.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/VideoDetail.jsx)

视频详情页，展示标题、作者、播放量、评论，集成弹幕交互。

#### VideoUpload

**文件**: [VideoUpload.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/VideoUpload.jsx)

视频投稿界面，提供上传视频、填写信息、选择类别功能。

#### DanmakuEngine

**文件**: [DanmakuEngine.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/DanmakuEngine.js)

弹幕引擎核心模块，封装弹幕绘制、缓存、颜色和字体处理逻辑，在 VideoPlayer 中被引用实现弹幕实时渲染。

### 8.7 用户中心 (Profile/)

#### Profile

**文件**: [Profile.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/Profile.jsx)

用户个人主页：
- 用户信息展示与编辑
- 登录活跃度
- 标记统计（想看/看过/在看/搁置/抛弃）
- 收藏列表
- 关注/粉丝管理
- 背景图修改
- 隐私设置
- Bangumi 账户绑定

#### ProfileStats

**文件**: [ProfileStats.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/ProfileStats.jsx)

用户数据统计面板，以图表展示：
- 已看/玩/读数量
- 总耗时
- 评分分布
- 活动趋势

### 8.8 世界频道 (WorldChannel/)

#### WorldChannel

**文件**: [WorldChannel.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/WorldChannel/WorldChannel.jsx)

公共内容发布频道，支持所有用户浏览和发言，含公告和活动信息展示。

#### WorldModal

**文件**: [WorldModal.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/WorldChannel/WorldModal.jsx)

世界频道弹窗，提供信息编辑或活动参与功能。

### 8.9 公共组件 (Common/)

#### AuthModal

**文件**: [AuthModal.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/AuthModal.jsx)

认证弹窗，处理登录/注册操作，提供第三方登录入口（QQ、微信）。

#### CommonComponents

**文件**: [CommonComponents.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/CommonComponents.jsx)

通用 UI 组件库，包含：
- `SubjectCard` — 条目卡片
- `SkeletonCard` — 骨架屏卡片
- `ErrorState` — 错误状态展示
- 其他表格、标签等复用组件

#### GlobalSearch

**文件**: [GlobalSearch.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/GlobalSearch.jsx)

全局搜索入口，提供统一搜索界面和结果展示，由 Header 的 `⌘K` 快捷键触发。

#### Live2DWidget

**文件**: [Live2DWidget.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/Live2DWidget.jsx)

Live2D 看板娘浮动组件，在页面右下角展示 Live2D 模型，支持交互。

#### Live2DViewer

**文件**: [Live2DViewer.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/Live2DViewer.jsx)

Live2D 完整展示页（懒加载），负责模型加载、渲染、事件绑定和交互。

#### EmojiPicker

**文件**: [EmojiPicker.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/EmojiPicker.jsx)

表情选择器，用于评论或发布内容时选择表情符号。

#### MarkdownEditor

**文件**: [MarkdownEditor.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/MarkdownEditor/MarkdownEditor.jsx)

Markdown 富文本编辑器，支持 Markdown 语法输入、渲染和预览。

### 8.10 其他功能组件

| 组件 | 文件 | 说明 |
|------|------|------|
| MusicPlayer | [MusicPlayer.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Music/MusicPlayer.jsx) | 音乐播放器，支持网易云/QQ音乐，含播放控制、列表管理、音量调节 |
| Amadeus | [Amadeus.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Amadeus/Amadeus.jsx) | AI 助手模块 |
| AmadeusModal | [AmadeusModal.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Amadeus/AmadeusModal.jsx) | AI 助手弹窗 |
| Club | [Club.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Club/Club.jsx) | 社团页面，展示社团信息及成员动态 |
| Wiki | [Wiki.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Wiki/Wiki.jsx) | 百科模块，展示知识库或文档 |
| Mailbox | [Mailbox.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Mailbox/Mailbox.jsx) | 邮箱系统，管理私人邮件 |
| Guestbook | [Guestbook.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Guestbook/Guestbook.jsx) | 留言板，用户互动留言 |
| FriendSpace | [FriendSpace.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/FriendSpace/FriendSpace.jsx) | 好友空间，展示好友动态 |
| Notifications | [Notifications.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Notification/Notifications.jsx) | 通知中心，查看系统通知和互动通知 |
| NewsZone | [NewsZone.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/NewsZone/NewsZone.jsx) | 新闻区，新闻动态展示和分类浏览 |
| TouchGalApp | [TouchGalApp.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/TouchGal/TouchGalApp.jsx) | 触控画廊应用，交互式画廊展示 |

---

## 9. 数据层

### 9.1 Mock 数据

**文件**: [mockData.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/data/mockData.js)

提供开发阶段的模拟数据，包括：
- `mockForumPosts` — 论坛帖子
- `mockCreations` — 创作作品
- `mockWorldMessages` — 世界频道消息
- `mockUsers` — 用户列表

### 9.2 默认数据

在 [api.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/api.js) 中还定义了以下默认数据，首次运行时自动初始化到 localStorage：

- `defaultUsers` — 8 个预置用户
- `DEFAULT_VIDEOS` — 12 个示例视频
- `DEFAULT_DANMAKUS` — 16 条示例弹幕
- `DEFAULT_VIDEO_COMMENTS` — 4 条示例视频评论

### 9.3 数据初始化

`initDB()` 函数在模块加载时自动执行，检查 localStorage 中是否存在用户数据，若不存在则写入默认用户列表。

---

## 10. 样式系统

### 10.1 CSS 变量体系

项目使用 CSS 自定义属性实现主题化，主要定义在 `index.css` 中。

**核心色彩变量：**

| 变量 | 值 | 用途 |
|------|------|------|
| `--primary` | `#fb7299` | 主色（B站粉） |
| `--secondary` | `#00a1d6` | 辅助色（B站蓝） |
| `--tag-anime` | `#fb7299` | 动画标签 |
| `--tag-novel` | `#9b59b6` | 小说标签 |
| `--tag-game` | `#00a1d6` | 游戏标签 |
| `--tag-chat` | `#2ecc71` | 吹水标签 |
| `--tag-art` | `#ff9f43` | 绘画标签 |

### 10.2 主题支持

通过 `data-theme` 属性切换主题，DockBar 设置面板提供切换入口：

| 主题 | data-theme 值 | 说明 |
|------|--------------|------|
| 浅色 | `""` (空) | 默认主题 |
| 深色 | `"dark"` | 深色模式 |
| 高对比度 | `"high-contrast"` | 高对比度模式 |

主题偏好保存在 localStorage（`acg_theme`），启动时从存储恢复。

### 10.3 样式文件组织

- `index.css` — 全局样式入口，定义 CSS 变量和基础样式
- `hikari-styles.css` — Hikari 主题补充样式
- 每个组件目录下有对应的 `.css` 文件（如 `Forum.css`、`Header.css`）

### 10.4 设计特点

- 渐变色按钮和徽章
- 毛玻璃效果头部导航
- 浮动光球首页动画
- 卡片悬浮阴影和缩放效果
- 统一的圆角和间距规范
- 响应式设计（桌面端 > 768px，移动端 ≤ 768px，小屏 ≤ 480px）

---

## 11. 外部 API 集成

### 已集成的外部 API

| API | 基础 URL | 用途 | 认证 |
|-----|---------|------|------|
| Bangumi API | `https://api.bgm.tv` | 番剧搜索/详情/日历/评论 | User-Agent + OAuth |
| AniList | `https://graphql.anilist.co` | 动画/漫画搜索、放送表 | 无 |
| Kitsu | `https://kitsu.io/api/edge` | 动画/漫画搜索 | 无 |
| ACGClub | `https://rabtman.com/api/v2/acgclub` | 图库浏览 | 无 |
| 萌娘百科 | `https://mzh.moegirl.org.cn/api.php` | 百科搜索 | 无 |
| AnimeDB | `https://api.animedb.com.br/v1` | 动画搜索 | 无 |
| Meting (网易云) | `https://api.injahow.cn/meting/` | 网易云音乐代理 | 无 |
| Meting (QQ) | `https://api.injahow.cn/meting/` | QQ音乐代理 | 无 |
| 本地 AnimeAPI | `http://localhost:6001` | 视频/小说/音乐搜索 | 无 |

### 请求通用机制

- **超时**: 10 秒
- **重试**: 最多 3 次，退避间隔 1s → 2s → 4s
- **缓存**: Bangumi API 响应缓存 30 分钟（CacheManager）
- **离线检测**: `navigator.onLine`
- **不可重试状态码**: 400, 401, 403, 404, 405, 410

---

## 12. 项目运行方式

### 环境要求

- Node.js（建议 18+）
- npm

### 命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 代码检查
npm run lint
```

### 开发服务器

Vite 开发服务器默认运行在 `http://localhost:5173`，支持 HMR 热更新。

### 构建产物

`npm run build` 输出到 `dist/` 目录，为纯静态文件，可部署到任意静态托管服务。

---

## 13. 关键设计决策

### 13.1 纯前端架构

项目选择不依赖后端服务，所有数据持久化通过 localStorage 实现。这使得部署极其简单（纯静态文件），但也带来了数据容量限制（localStorage 通常 5-10MB）和多设备数据无法同步的局限。

### 13.2 双渲染模式

项目同时支持两种内容展示模式：
- **路由页面模式**: 传统 SPA 页面切换（通过 React Router）
- **浮动窗口模式**: 类桌面 OS 窗口系统（通过 WindowManager + AppWindow）

浮动窗口模式用于音乐播放器、好友空间、世界频道等需要"常驻"的功能，用户可以在浏览页面的同时使用这些功能。

### 13.3 服务层模式

所有业务逻辑封装在 Service 对象中（如 `AuthService`、`BangumiService`），而非使用类 Redux 的全局状态。组件通过直接调用 Service 方法进行数据操作，Service 内部处理 localStorage 读写和 API 请求。

### 13.4 Bangumi API 作为核心数据源

资讯区的数据完全来自 Bangumi API，项目实现了完善的请求重试、缓存和错误处理机制。随机推荐功能使用加权算法（人气 40% + 评分 35% + 随机性 25%）从搜索结果中选取。

### 13.5 Live2D 集成

使用 `pixi-live2d-display` + `pixi.js` 实现 Live2D 看板娘功能，Live2DViewer 页面采用懒加载（`React.lazy`）以减小首屏包体积。
