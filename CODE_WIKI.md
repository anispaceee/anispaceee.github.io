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
8. [影视区 V2 多源架构](#8-影视区-v2-多源架构)
9. [组件模块详解](#9-组件模块详解)
10. [后端架构 (Cloudflare Worker)](#10-后端架构-cloudflare-worker)
11. [数据库设计 (D1)](#11-数据库设计-d1)
12. [OAuth 认证流程](#12-oauth-认证流程)
13. [样式系统](#13-样式系统)
14. [外部 API 集成](#14-外部-api-集成)
15. [部署与 CI/CD](#15-部署与-cicd)
16. [项目运行方式](#16-项目运行方式)
17. [关键设计决策](#17-关键设计决策)
18. [后续功能奇思妙想](#18-后续功能奇思妙想)

---

## 1. 项目概览

ANISpace 是一个面向 ACG（动画、漫画、游戏）爱好者的社区平台，提供番剧资讯、论坛讨论、多源视频聚合播放、弹幕互动、音乐播放、Live2D 看板娘、好友系统、邮箱等丰富功能。

**核心特性：**
- Bangumi API 集成的番剧搜索与评分系统
- Cloudflare Worker + D1 数据库驱动的后端 API
- GitHub / Bangumi OAuth 双渠道登录
- 类桌面操作系统的窗口管理器（可拖拽、缩放、最小化、最大化）
- 影视区 V2：Animeko 风格多源资源聚合 + DPlayer 弹幕播放
- Live2D 看板娘（pixi.js v6 + pixi-live2d-display）
- 网易云音乐 / QQ音乐集成播放器
- 多主题支持（浅色 / 深色 / 高对比度）
- Bangumi 本地索引搜索（bangumi-data 定时同步 + 官方 API 兜底）

---

## 2. 技术栈与依赖

### 运行时依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `react` | ^19.2.5 | UI 框架 |
| `react-dom` | ^19.2.5 | React DOM 渲染 |
| `react-router-dom` | ^7.15.0 | 客户端路由 |
| `lucide-react` | ^1.14.0 | 图标库 |
| `pixi.js` | ^6.5.10 | WebGL 渲染引擎（Live2D，v6 兼容 pixi-live2d-display） |
| `@pixi/utils` | ^6.5.10 | Pixi.js 工具库 |
| `pixi-live2d-display` | ^0.4.0 | Live2D 模型展示 |
| `dplayer` | ^1.27.1 | 视频播放器（含弹幕） |
| `hls.js` | ^1.6.16 | HLS 流媒体支持 |
| `webtorrent` | ^3.0.16 | BitTorrent 种子下载 |
| `idb` | ^8.0.3 | IndexedDB 封装（Bangumi API 缓存） |
| `mouse-firework` | ^0.2.0 | 鼠标烟花特效 |

### 开发依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `vite` | ^8.0.10 | 构建工具 |
| `@vitejs/plugin-react` | ^6.0.1 | Vite React 插件 |
| `eslint` | ^10.2.1 | 代码检查 |
| `eslint-plugin-jsx-a11y` | ^6.10.2 | 无障碍规则 |
| `eslint-plugin-react-hooks` | ^7.1.1 | Hooks 规则检查 |
| `eslint-plugin-react-refresh` | ^0.5.2 | React Refresh 支持 |

### 后端技术栈

| 技术 | 用途 |
|------|------|
| Cloudflare Workers | Serverless API 后端 |
| Cloudflare D1 | SQLite 数据库 |
| Cloudflare Cache API | API 响应缓存 |
| Cloudflare Cron Triggers | 定时任务（bangumi-data 同步） |
| JWT (HS256) | 用户认证令牌 |

---

## 3. 项目结构

```
ANISpace/
├── .github/workflows/
│   └── deploy.yml                # GitHub Actions 自动部署
├── docs/                         # 项目文档
│   ├── PRD.md                    # 产品需求文档
│   ├── PRD-Video-V2.md           # 影视区 V2 需求文档
│   ├── API_INTEGRATION.md        # API 集成说明
│   ├── AUDIT_REPORT.md           # 安全审计报告
│   ├── AUDIT_REPORT_ANIMEKO.md   # Animeko 架构审计
│   ├── BANGUMI_SEARCH_OPS.md     # Bangumi 搜索运维文档
│   ├── REPAIR_PLAN.md            # 修复计划
│   ├── hikarinagi-ui-analysis.md # UI 设计分析
│   └── superpowers/              # 设计稿与规划
│       ├── plans/                # 实施计划
│       └── specs/                # 设计规范
├── public/
│   ├── 404.html                  # SPA 路由恢复（GitHub Pages）
│   ├── favicon.svg
│   ├── live2d.min.js             # Live2D SDK
│   └── .nojekyll
├── scripts/
│   ├── crawl-bangumi.js          # Bangumi 数据爬取脚本
│   └── import-bangumi-data.mjs   # Bangumi 数据导入脚本
├── src/
│   ├── assets/                   # 静态资源
│   ├── components/               # 组件目录
│   │   ├── Amadeus/              # AI 导航助手
│   │   ├── Club/                 # Tea Time！社团
│   │   ├── Common/               # 公共组件
│   │   │   ├── MarkdownEditor/   # Markdown 编辑器
│   │   │   ├── AuthModal.jsx     # 登录弹窗
│   │   │   ├── CommonComponents.jsx # 通用 UI 组件
│   │   │   ├── EmojiPicker.jsx   # 表情选择器
│   │   │   ├── FireworkEffect.jsx # 烟花特效
│   │   │   ├── GlobalSearch.jsx  # 全局搜索
│   │   │   ├── Live2DViewer.jsx  # Live2D 展示页
│   │   │   ├── Live2DWidget.jsx  # Live2D 悬浮看板娘
│   │   │   └── UserAvatar.jsx    # 用户头像组件
│   │   ├── Forum/                # 放課後论坛
│   │   ├── FriendLinks/          # 友情链接
│   │   ├── FriendSpace/          # 好友空间（LeMU）
│   │   ├── Guestbook/            # 留言板
│   │   ├── Info/                 # 番剧资讯详情
│   │   ├── Layout/               # 布局组件
│   │   │   ├── AppWindow.jsx     # 浮动窗口容器
│   │   │   ├── DockBar.jsx       # 底部任务栏
│   │   │   ├── Header.jsx        # 顶部导航栏
│   │   │   └── Layout.jsx        # 页面布局
│   │   ├── Mailbox/              # D-Mail 邮箱
│   │   ├── Music/                # 音乐播放器
│   │   │   ├── MusicPlayer.jsx   # 完整播放器
│   │   │   └── MiniPlayer.jsx    # 迷你播放条
│   │   ├── NewsZone/             # 新闻区
│   │   ├── Notification/         # 通知中心
│   │   ├── Profile/              # 用户中心
│   │   │   ├── ActivityHeatmap.jsx # 活跃热力图
│   │   │   ├── ProfileSettings.jsx # 隐私设置
│   │   │   ├── ProfileStats.jsx  # 数据统计
│   │   │   └── UserProfilePage.jsx # 用户主页
│   │   ├── TouchGal/             # TouchGal 交互画廊
│   │   ├── Video/                # 影视区 V2
│   │   │   ├── VideoHome.jsx     # 视频首页（Bangumi 搜索）
│   │   │   ├── SubjectDetail.jsx # 番剧详情页
│   │   │   ├── VideoPlayer.jsx   # DPlayer 播放器
│   │   │   ├── SourceManager.jsx # 源管理器
│   │   │   └── MediaMatchList.jsx # 资源匹配列表
│   │   ├── Wiki/                 # インデックスIndex 百科
│   │   └── WorldChannel/         # 世界频道
│   ├── context/                  # React Context 状态管理
│   │   ├── AppContext.jsx        # 应用全局状态（用户/认证/通知）
│   │   ├── MusicContext.jsx      # 音乐播放器状态
│   │   └── WindowManager.jsx     # 窗口管理器状态
│   ├── pages/
│   │   ├── HomePage.jsx          # 首页
│   │   └── OAuthCallback.jsx     # OAuth 回调页
│   ├── services/                 # 服务层
│   │   ├── api.js                # 核心业务 API（15+ Service）
│   │   ├── storage.js            # localStorage 封装
│   │   ├── BangumiSearchService.js # Bangumi 搜索前端逻辑
│   │   ├── media/                # 影视区 V2 多源架构
│   │   │   ├── types.ts          # 核心类型定义
│   │   │   ├── MediaSourceManager.ts # 源注册与管理
│   │   │   ├── MatchEngine.ts    # 资源匹配引擎
│   │   │   ├── MediaSelector.ts  # 资源选择器
│   │   │   ├── DanmakuService.ts # 弹幕服务
│   │   │   ├── initSources.ts    # 源初始化
│   │   │   └── sources/          # 具体源实现
│   │   │       ├── MacCMSSource.ts  # 苹果 CMS 源
│   │   │       ├── DmhySource.ts    # 动漫花园源
│   │   │       ├── MikanSource.ts   # 蜜柑计划源
│   │   │       └── LocalCacheSource.ts # 本地缓存源
│   │   └── utils/
│   │       ├── renderMarkdown.js # Markdown 渲染
│   │       └── sanitize.js       # 内容净化
│   ├── styles/
│   │   └── hikari-styles.css     # Hikari 主题样式
│   ├── App.jsx                   # 应用根组件 + 路由配置
│   ├── index.css                 # 全局样式
│   └── main.jsx                  # 入口文件
├── worker/                       # Cloudflare Worker 后端
│   ├── oauth-proxy.js            # Worker 主入口（API 路由 + 代理）
│   ├── lib/
│   │   ├── bangumi-search.js     # Bangumi 本地索引搜索
│   │   └── bangumi-sync.js       # bangumi-data 定时同步
│   ├── migrations/
│   │   └── v008_bangumi_index.sql # Bangumi 索引表迁移
│   ├── schema.sql                # D1 数据库完整 Schema
│   ├── add-tables.sql            # 增量建表脚本
│   ├── drop-all.sql              # 清库脚本
│   └── wrangler.toml             # Worker 配置
├── index.html                    # HTML 模板（含 CSP + SPA 路由恢复）
├── oauth.config.js               # OAuth 配置（Bangumi + GitHub）
├── vite-plugin-oauth.js          # Vite 开发环境 OAuth 代理插件
├── vite.config.js                # Vite 构建配置
├── package.json
└── eslint.config.js
```

---

## 4. 整体架构

### 架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                        浏览器 (SPA)                               │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     main.jsx                                │  │
│  │          BrowserRouter > AppProvider > App                  │  │
│  └───────────────────────────┬────────────────────────────────┘  │
│                              │                                    │
│  ┌───────────────────────────▼────────────────────────────────┐  │
│  │                      App.jsx                                │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌───────────────────┐  │  │
│  │  │  Routes     │  │  WindowLayer │  │  DockBar          │  │  │
│  │  │  (页面路由)  │  │  (浮动窗口)   │  │  (底部任务栏)     │  │  │
│  │  └──────┬─────┘  └──────┬───────┘  └─────────┬─────────┘  │  │
│  │         │               │                     │            │  │
│  │  ┌──────▼─────┐  ┌──────▼───────┐            │            │  │
│  │  │ Layout      │  │ AppWindow[]  │            │            │  │
│  │  │ Header+Outlet│ │ (可拖拽窗口)  │            │            │  │
│  │  └──────┬─────┘  └──────────────┘            │            │  │
│  │         │                                     │            │  │
│  │  ┌──────▼─────────────────────────────────────▼────────┐   │  │
│  │  │               页面组件 / 功能组件                      │   │  │
│  │  │  HomePage Forum Video Wiki Profile FriendLinks ...  │   │  │
│  │  └───────────────────────┬─────────────────────────────┘   │  │
│  │                          │                                  │  │
│  │  ┌───────────────────────▼─────────────────────────────┐   │  │
│  │  │            Context 层 (全局状态)                      │   │  │
│  │  │  AppContext  MusicContext  WindowManager              │   │  │
│  │  └───────────────────────┬─────────────────────────────┘   │  │
│  │                          │                                  │  │
│  │  ┌───────────────────────▼─────────────────────────────┐   │  │
│  │  │              Services 层 (业务逻辑)                    │   │  │
│  │  │  AuthService  BangumiService  MediaSourceManager     │   │  │
│  │  │  ForumService  FriendService  MailService  ...       │   │  │
│  │  └───────┬───────────────────────────────┬──────────────┘   │  │
│  │          │                               │                  │  │
│  │  ┌───────▼───────┐  ┌───────────────────▼──────────────┐   │  │
│  │  │ StorageService │  │  CacheManager (IndexedDB)        │   │  │
│  │  │ (localStorage) │  │  Bangumi API 缓存 (LRU, 200条)   │   │  │
│  │  └───────────────┘  └──────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                     HTTP / HTTPS                                 │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────────┐
│              Cloudflare Worker (oauth-proxy.js)                    │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ OAuth Token 交换  │  │ Bangumi API 代理  │  │ Worker API 路由  │  │
│  │ (Bangumi/GitHub) │  │ (缓存 30min)      │  │ (用户/帖子/...)  │  │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬────────┘  │
│           │                    │                      │           │
│  ┌────────▼────────────────────▼──────────────────────▼────────┐  │
│  │                    Cloudflare D1 (SQLite)                    │  │
│  │  users posts replies collections follows likes notifications │  │
│  │  news ratings favorites mails friend_requests friend_posts   │  │
│  │  bangumi_index bangumi_index_meta ...                       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Cron Triggers: 每周一/三 03:00 UTC → bangumi-data 同步     │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### 架构特点

1. **前后端分离 SPA**：前端 React SPA 部署于 GitHub Pages，后端 Cloudflare Worker 提供 API
2. **双渲染模式**：路由页面（传统 SPA 页面）+ 浮动窗口（类桌面 OS 窗口）
3. **服务层抽象**：业务逻辑集中在 `services/` 目录，组件通过 Service 对象交互
4. **Context 状态管理**：不使用 Redux 等第三方状态库，仅用 React Context + useState
5. **多源资源聚合**：影视区 V2 采用 Animeko 风格 MediaSource 架构
6. **本地优先搜索**：Bangumi 搜索走 D1 本地索引，不足时官方 API 兜底

---

## 5. 路由系统

路由定义在 [App.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/App.jsx) 中，使用 React Router DOM v7。

### 路由表

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `HomePage` | 首页（Banner、每日放送、搜索、热门帖子） |
| `/auth/bangumi` | `OAuthCallback` | Bangumi OAuth 回调 |
| `/auth/github` | `OAuthCallback` | GitHub OAuth 回调 |
| `/forum` | `Forum` | 放課後论坛 |
| `/forum/post/:id` | `PostDetail` | 帖子详情 |
| `/info/:type/:id` | `InfoDetail` | 番剧资讯详情 |
| `/club` | `Club` | Tea Time！社团 |
| `/wiki` | `Wiki` | インデックスIndex 百科 |
| `/links` | `FriendLinks` | 友情链接 |
| `/news/:id` | `NewsDetail` | 新闻详情 |
| `/profile` | `UserProfilePage` | 当前用户主页 |
| `/user/:userId` | `UserProfilePage` | 指定用户主页 |
| `/video` | `VideoHome` | 视频首页（Bangumi 搜索） |
| `/video/subject/:subjectId` | `SubjectDetail` | 番剧详情（角色/制作/剧集/资源匹配） |
| `/video/play/:subjectId/:episodeId` | `VideoPlayer` | DPlayer 播放器（ErrorBoundary 包裹） |
| `/video/sources` | `SourceManager` | 源管理器 |
| `/mailbox` | `Mailbox` | D-Mail 邮箱 |
| `/guestbook` | `Guestbook` | 留言板 |
| `/music` | `MusicPlayer` | 音乐播放器 |
| `/friends` | `FriendSpace` | 好友空间 |
| `/navi` | `Amadeus` | AI 导航助手 |
| `/live2d` | `Live2DViewer` | Live2D 展示页（懒加载） |

### 路由结构

所有路由嵌套在 `Layout` 组件下，Layout 提供 Header 导航和 `<Outlet />` 内容区。此外，`AuthModal`、`FireworkEffect`、`Live2DWidget`、`WindowLayer`（浮动窗口层）、`MiniPlayer` 和 `DockBar`（底部任务栏）作为全局组件渲染在路由之外。

### 导航栏项目

| 路径 | 显示名 |
|------|--------|
| `/` | 首页 |
| `/forum` | 放課後 |
| `/club` | Tea Time！ |
| `/video` | 视频 |
| `/wiki` | 禁書目錄 |
| `/links` | 友情链接 |

---

## 6. 全局状态管理

### 6.1 AppContext

**文件**: [AppContext.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/context/AppContext.jsx)

**职责**: 管理用户认证状态、通知数据、邮件未读数

**提供的 Context 值：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `currentUser` | `object \| null` | 当前登录用户对象 |
| `isAuthenticated` | `boolean` | 是否已登录 |
| `notifications` | `array` | 未读通知列表 |
| `mailUnreadCount` | `number` | 邮件未读数 |
| `showAuthModal` | `boolean` | 认证弹窗是否显示 |
| `oauthLogin(user)` | `function` | OAuth 登录回调 |
| `logout()` | `function` | 退出登录 |
| `updateProfile(updates)` | `function` | 更新用户资料 |
| `openAuth()` | `function` | 打开认证弹窗 |
| `closeAuth()` | `function` | 关闭认证弹窗 |
| `refreshUser()` | `function` | 刷新当前用户数据 |

**使用方式**: `const { currentUser, isAuthenticated, ... } = useApp();`

### 6.2 WindowManager

**文件**: [WindowManager.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/context/WindowManager.jsx)

**职责**: 管理浮动窗口的生命周期（打开、关闭、拖拽、缩放、层级）

**预定义窗口配置 (`DEFAULT_WINDOW_CONFIG`)：**

| 窗口 ID | 标题 | 默认尺寸 | 最小尺寸 |
|---------|------|---------|---------|
| `music` | 音乐 | 420x560 | 300x400 |
| `friends` | LeMU | 480x600 | 300x400 |
| `amadeus` | Navi | 680x520 | 400x400 |
| `world` | 世界线 | 450x550 | 300x400 |
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

### 6.3 MusicContext

**文件**: [MusicContext.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/context/MusicContext.jsx)

**职责**: 管理音乐播放器全局状态

**提供的 Context 值：**

| 字段/方法 | 说明 |
|-----------|------|
| `currentSong` | 当前播放歌曲 |
| `playing` | 是否正在播放 |
| `playlist` | 播放列表 |
| `volume / muted` | 音量 / 静音 |
| `currentTime / duration` | 当前时间 / 总时长 |
| `mode` | 音乐源模式（`netease` / `qq`） |
| `savedPlaylists` | 已保存歌单 |
| `history` | 播放历史 |
| `playSong(song)` | 播放指定歌曲 |
| `togglePlay()` | 播放/暂停 |
| `playNext() / playPrev()` | 下一首 / 上一首 |
| `importPlaylist(id, server)` | 导入歌单 |
| `search(query)` | 搜索歌曲 |

**默认歌单**: 首次加载自动导入网易云歌单 `8464409595`

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
| `USERS` | `acg_users` | 用户缓存 |
| `POSTS` | `acg_posts` | 帖子缓存 |
| `FOLLOWS` | `acg_follows` | 关注关系缓存 |
| `LIKES` | `acg_likes` | 点赞记录 |
| `FAVORITES` | `acg_favorites` | 收藏记录 |
| `RATINGS` | `acg_ratings` | 评分 |
| `NOTIFICATIONS` | `acg_notifications` | 通知缓存 |
| `COLLECTION_MARKS` | `acg_collection_marks` | 收藏标记 |
| `PRIVATE_MESSAGES` | `acg_private_messages` | 私信缓存 |
| `MAILBOX` | `acg_mailbox` | 邮箱缓存 |
| `GITHUB_TOKEN` | `acg_github_token` | GitHub OAuth 令牌 |
| `GITHUB_USER` | `acg_github_user` | GitHub 用户信息 |

### 7.2 CacheManager (IndexedDB)

**文件**: [api.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/api.js) 内

Bangumi API 响应缓存管理器，使用 IndexedDB 替代 localStorage 缓存，支持 LRU 淘汰。

| 配置 | 值 |
|------|------|
| 数据库名 | `anispace-cache` |
| Store 名 | `bangumi-cache` |
| TTL | 30 分钟 |
| 最大条目 | 200 |

| 方法 | 说明 |
|------|------|
| `get(key)` | 获取缓存（过期返回 null） |
| `set(key, data)` | 写入缓存（超限 LRU 淘汰） |
| `clear()` | 清除缓存 |

### 7.3 核心业务服务

**文件**: [api.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/api.js)

#### ApiError

自定义错误类，扩展 `Error`，增加 `status`（HTTP 状态码）和 `code`（错误类型码）属性。

| 属性/方法 | 说明 |
|-----------|------|
| `status` | HTTP 状态码 |
| `code` | 错误类型：`OFFLINE` / `NETWORK_ERROR` / `TIMEOUT` / `RATE_LIMITED` / `NOT_FOUND` / `FORBIDDEN` / `SERVER_ERROR` / `INVALID_DATA` |
| `isRetryable` | 是否可重试 |
| `userMessage` | 用户友好的错误消息 |

#### AuthService — 用户认证

| 方法 | 说明 |
|------|------|
| `loginWithOAuth(provider, oauthUser)` | OAuth 登录（Bangumi/GitHub），调后端 `/api/auth/login` |
| `logout()` | 退出登录（清除 JWT + 本地缓存） |
| `getCurrentUser()` | 获取当前用户（从 localStorage） |
| `isAuthenticated()` | 是否已认证（检查 JWT） |
| `updateProfile(userId, updates)` | 更新资料（调后端 PUT） |

#### UserService — 用户管理

| 方法 | 说明 |
|------|------|
| `getById(id)` | 同步获取用户（本地缓存） |
| `fetchById(id)` | 异步获取用户（后端 API） |
| `search(query)` | 搜索用户（本地缓存） |
| `getProfile(userId)` | 获取用户公开信息（受隐私设置控制） |
| `updateSettings(userId, settings)` | 更新隐私设置 |
| `getUserComments(userId)` | 获取用户评论 |
| `getUserActivity(userId)` | 获取活跃度数据（热力图） |

#### FollowService — 关注系统

| 方法 | 说明 |
|------|------|
| `toggleFollow(fromUserId, toUserId)` | 关注/取消关注 |
| `getFollowers(userId)` | 获取粉丝列表 |
| `getFollowing(userId)` | 获取关注列表 |
| `isFollowingAsync(fromUserId, toUserId)` | 异步检查关注状态 |

#### FriendService — 好友系统

| 方法 | 说明 |
|------|------|
| `sendFriendRequest(toUserId, message)` | 发送好友请求 |
| `getReceivedRequests()` | 获取收到的好友请求 |
| `getSentRequests()` | 获取发出的好友请求 |
| `handleFriendRequest(requestId, status)` | 接受/拒绝请求 |
| `removeFriend(userId)` | 删除好友 |
| `getFriendList(page, limit)` | 获取好友列表 |
| `getFriendStatus(userId)` | 检查与某用户的关系 |

#### FriendPostService — 好友空间动态

| 方法 | 说明 |
|------|------|
| `getFeed(page, limit)` | 获取好友动态 feed |
| `createPost(content, visibility, images)` | 创建动态 |
| `toggleLike(postId)` | 点赞/取消点赞 |
| `addComment(postId, content)` | 添加评论 |
| `getComments(postId)` | 获取评论 |
| `deletePost(postId)` | 删除动态 |

#### ForumService — 论坛

| 方法 | 说明 |
|------|------|
| `getPosts(page, limit, category, sort)` | 获取帖子列表 |
| `getPostById(id)` | 获取帖子详情 |
| `createPost(data)` | 创建帖子 |
| `addReply(postId, content)` | 添加回复 |
| `toggleLike(postId)` | 点赞/取消点赞 |
| `deletePost(postId)` | 删除帖子 |
| `uploadImage(file)` | 上传图片（ImgBB 代理） |

#### CollectionMarkService — 收藏标记

| 标记 | 值 | 标签 | 颜色 |
|------|------|------|------|
| 想看 | `wish` | 想看 | `--secondary` |
| 看过 | `collect` | 看过 | `--success` |
| 在看 | `doing` | 在看 | `--accent-warm` |
| 搁置 | `on_hold` | 搁置 | `--tag-novel` |
| 抛弃 | `dropped` | 抛弃 | `--error` |

| 方法 | 说明 |
|------|------|
| `getByUserId(userId)` | 获取用户收藏（后端 API） |
| `upsert(data)` | 新增/更新收藏 |
| `remove(userId, subjectId)` | 删除收藏 |

#### BangumiService — Bangumi API 客户端

| 方法 | 说明 |
|------|------|
| `searchSubjects(keyword, type, limit, offset)` | 搜索条目 |
| `getSubject(id)` | 获取条目基本信息（v0 API） |
| `getSubjectDetail(id)` | 获取条目详细信息 |
| `getCalendar()` | 获取番剧日历 |
| `getPopular(type, limit, offset)` | 获取热门条目（从 calendar 提取） |
| `getSubjectCharacters(id)` | 获取条目角色 |
| `getSubjectPersons(id)` | 获取条目制作人员 |
| `getSubjectEpisodes(id)` | 获取条目剧集 |
| `getRelatedSubjects(id)` | 获取关联条目 |
| `getSubjectComments(id, limit, offset)` | 获取条目评论 |
| `getRandomSubject(excludeIds)` | 随机推荐 |
| `checkAccessibility(items)` | 批量检查条目可访问性 |

**请求特性**: 请求去重（`_inFlight` Map）、超时 10s、最大重试 3 次（指数退避 1s/2s/4s）、IndexedDB 缓存、离线检测、Bangumi 代理自动替换。

#### NotificationService — 通知

| 方法 | 说明 |
|------|------|
| `getByUserId(userId)` | 获取用户通知（后端 API） |
| `markAsRead(userId, ids)` | 标记已读 |
| `markAllAsRead(userId)` | 全部标记已读 |
| `addAsync(userId, type, ...)` | 创建持久化通知 |

#### MailService — 邮箱

| 方法 | 说明 |
|------|------|
| `fetchInbox(userId)` | 获取收件箱（后端 API） |
| `fetchSent(userId)` | 获取已发送 |
| `sendAsync(...)` | 发送邮件 |
| `markAsReadAsync(mailId)` | 标记已读 |
| `toggleStarAsync(mailId)` | 切换星标 |
| `deleteMailAsync(mailId, userId)` | 删除邮件（软删除） |
| `getUnreadCountAsync(userId)` | 获取未读数 |

#### PrivateMessageService — 私信

| 方法 | 说明 |
|------|------|
| `fetchConversations(userId)` | 获取会话列表（后端 API） |
| `fetchConversation(userId, otherUserId)` | 获取两人消息 |
| `sendAsync(fromUserId, toUserId, content)` | 发送私信 |
| `markAsReadAsync(userId, otherUserId)` | 标记已读 |

#### RatingService / FavoriteService — 评分与收藏

均提供同步（localStorage）和异步（后端 API）两套方法，异步方法以 `Async` 后缀命名。

#### BangumiAuthService / GitHubAuthService — OAuth 认证

| 方法 | 说明 |
|------|------|
| `buildAuthUrl()` | 构建授权 URL（含 CSRF state） |
| `initiateLogin()` | 跳转授权页 |
| `handleOAuthCallback(code)` | 处理授权回调 |
| `loginWithBangumi(code) / loginWithGitHub(code)` | 完整登录流程 |

#### NetEaseMusicService / QQMusicService — 音乐

通过 Meting API（`api.i-meto.com/meting/api`）代理请求，提供 `search`、`getSongUrl`、`getPlaylistDetail`、`getLyric` 方法。

---

## 8. 影视区 V2 多源架构

影视区 V2 参考 Animeko 的 MediaSource 架构，实现了多源资源聚合和在线播放。

### 核心类型 ([types.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/types.ts))

| 类型 | 说明 |
|------|------|
| `MediaSourceKind` | 源类型枚举：`web` / `bittorrent` / `local_cache` |
| `MatchKind` | 匹配度枚举：`exact` / `fuzzy` |
| `ConnectionStatus` | 连接状态：`available` / `unavailable` / `timeout` |
| `MediaSource` | 源接口：`sourceId`、`kind`、`info`、`checkConnection()`、`fetch()` |
| `MediaSourceFactory` | 源工厂接口：`factoryId`、`allowMultipleInstances`、`parameters`、`create()` |
| `MediaFetchRequest` | 搜索请求：`subjectId`、`subjectNames`、`episodeSort` |
| `MediaMatch` | 匹配结果：`media` + `matchKind` |
| `Media` | 媒体资源：`mediaId`、`title`、`episodeRange`、`download` |
| `MediaDownload` | 下载信息：`kind`（http/magnet/torrent/local）+ `url` |

### MediaSourceManager ([MediaSourceManager.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/MediaSourceManager.ts))

源注册与管理单例，负责：
- 注册/注销源工厂和源实例
- 获取已启用的源列表
- 并行查询所有源 (`fetchAll`)
- 源启用/禁用状态持久化（localStorage `acg_v2_sources` / `acg_v2_sources_disabled`）

### MatchEngine ([MatchEngine.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/MatchEngine.ts))

资源匹配引擎：
- `matchSubject(title, request)` — 标题是否匹配番剧名
- `matchEpisode(title, episodeSort)` — 集数是否精确匹配（支持"第X集"、"EPXX"等格式）
- `computeMatchKind(title, request)` — 计算匹配度（EXACT / FUZZY）
- `sortMatches(matches)` — 排序：EXACT 优先，然后按 tier

### MediaSelector ([MediaSelector.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/MediaSelector.ts))

资源选择器：
- `selectBest(matches)` — 选出最佳资源
- `groupBySource(matches)` — 按源分组
- `filterByMatchKind(matches, kind)` — 按匹配度过滤

### 已实现的源

| 源 | Factory ID | 类型 | 说明 |
|------|-----------|------|------|
| 苹果 CMS | `maccms` | `web` | MacCMS V10 API 标准，预设 4 个源（蓝资源/非凡/酷看/番茄） |
| 动漫花园 | `dmhy` | `web` | DMHY HTML 搜索解析 |
| 蜜柑计划 | `mikan` | `bittorrent` | Mikan RSS 搜索 |
| 本地缓存 | `local_cache` | `local_cache` | IndexedDB 本地缓存 |

### 源初始化 ([initSources.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/initSources.ts))

App 启动时调用 `initMediaSources()`，自动：
1. 注册所有源工厂
2. 清理已废弃的源（`kuapi`、`guangsu`、`sdzy`）
3. 注册默认源（如 localStorage 中不存在）

---

## 9. 组件模块详解

### 9.1 布局组件 (Layout/)

#### Layout

**文件**: [Layout.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Layout/Layout.jsx)

应用布局容器，包含 `Header` 和 `<Outlet />`。

#### Header

**文件**: [Header.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Layout/Header.jsx)

顶部导航栏，包含 Logo、导航链接、全局搜索（⌘K）、通知铃铛、D-Mail 入口、用户头像/登录按钮。

#### DockBar

**文件**: [DockBar.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Layout/DockBar.jsx)

底部任务栏（类 macOS Dock），含应用启动器、设置面板、迷你音乐控制。

#### AppWindow

**文件**: [AppWindow.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Layout/AppWindow.jsx)

浮动窗口组件，实现标题栏拖拽、四边/四角缩放、最小化/最大化/关闭、z-index 层级管理、位置尺寸持久化。

### 9.2 首页 (HomePage)

**文件**: [HomePage.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/pages/HomePage.jsx)

首页聚合展示：全宽 Banner（21:9，5秒自动轮播）、搜索栏、每日放送、分类浏览、热门帖子。

### 9.3 影视区 (Video/)

| 组件 | 文件 | 说明 |
|------|------|------|
| VideoHome | [VideoHome.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/VideoHome.jsx) | 视频首页（Bangumi 搜索） |
| SubjectDetail | [SubjectDetail.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/SubjectDetail.jsx) | 番剧详情（角色/制作/剧集/资源匹配/评论） |
| VideoPlayer | [VideoPlayer.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/VideoPlayer.jsx) | DPlayer 播放器（HLS + 弹幕 + 资源切换） |
| SourceManager | [SourceManager.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/SourceManager.jsx) | 源管理器（添加/删除/启禁源） |
| MediaMatchList | [MediaMatchList.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/MediaMatchList.jsx) | 资源匹配列表 |

### 9.4 其他功能组件

| 组件 | 文件 | 说明 |
|------|------|------|
| Forum / PostDetail | [Forum.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Forum/Forum.jsx) | 放課後论坛 + 帖子详情 |
| InfoDetail | [InfoDetail.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Info/InfoDetail.jsx) | 番剧资讯详情 |
| UserProfilePage | [UserProfilePage.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/UserProfilePage.jsx) | 用户主页 |
| ActivityHeatmap | [ActivityHeatmap.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/ActivityHeatmap.jsx) | 活跃热力图 |
| ProfileSettings | [ProfileSettings.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/ProfileSettings.jsx) | 隐私设置 |
| ProfileStats | [ProfileStats.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/ProfileStats.jsx) | 数据统计 |
| Wiki | [Wiki.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Wiki/Wiki.jsx) | インデックスIndex 百科 |
| Club | [Club.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Club/Club.jsx) | Tea Time！社团 |
| FriendLinks | [FriendLinks.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/FriendLinks/FriendLinks.jsx) | 友情链接（bgm.tv、TouchGal、Shinnku、文庫8、光凪） |
| FriendSpace | [FriendSpace.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/FriendSpace/FriendSpace.jsx) | 好友空间（LeMU） |
| Mailbox | [Mailbox.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Mailbox/Mailbox.jsx) | D-Mail 邮箱 |
| Guestbook | [Guestbook.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Guestbook/Guestbook.jsx) | 留言板 |
| MusicPlayer / MiniPlayer | [MusicPlayer.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Music/MusicPlayer.jsx) | 音乐播放器 |
| Amadeus | [Amadeus.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Amadeus/Amadeus.jsx) | AI 导航助手 |
| WorldChannel | [WorldChannel.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/WorldChannel/WorldChannel.jsx) | 世界频道 |
| Notifications | [Notifications.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Notification/Notifications.jsx) | 通知中心 |
| NewsZone / NewsDetail | [NewsZone.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/NewsZone/NewsZone.jsx) | 新闻区 |
| TouchGalApp | [TouchGalApp.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/TouchGal/TouchGalApp.jsx) | TouchGal 交互画廊 |
| Live2DWidget | [Live2DWidget.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/Live2DWidget.jsx) | Live2D 悬浮看板娘 |
| Live2DViewer | [Live2DViewer.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/Live2DViewer.jsx) | Live2D 完整展示页（懒加载） |
| AuthModal | [AuthModal.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/AuthModal.jsx) | 登录弹窗（Bangumi + GitHub OAuth） |
| GlobalSearch | [GlobalSearch.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/GlobalSearch.jsx) | 全局搜索（⌘K 触发） |
| MarkdownEditor | [MarkdownEditor.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/MarkdownEditor/MarkdownEditor.jsx) | Markdown 编辑器 |
| EmojiPicker | [EmojiPicker.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/EmojiPicker.jsx) | 表情选择器 |
| FireworkEffect | [FireworkEffect.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/FireworkEffect.jsx) | 鼠标烟花特效 |
| UserAvatar | [UserAvatar.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/UserAvatar.jsx) | 用户头像组件 |
| OAuthCallback | [OAuthCallback.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/pages/OAuthCallback.jsx) | OAuth 回调页 |

---

## 10. 后端架构 (Cloudflare Worker)

### Worker 主入口

**文件**: [oauth-proxy.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js)（约 2500 行）

### 功能模块

| 模块 | 说明 |
|------|------|
| OAuth Token 交换 | Bangumi / GitHub OAuth code→token 交换 |
| Bangumi API 代理 | 透传 Bangumi API 请求 + Cloudflare Cache 缓存 |
| Bangumi 图片代理 | `/api/bangumi/image?url=...`，仅允许 bgm.tv 域名 |
| Worker API 路由 | 完整 CRUD API（用户/帖子/收藏/关注/通知/世界消息/新闻/评分/收藏/邮件/私信/好友/好友动态） |
| 视频流代理 | `/api/video/stream`，m3u8 重写 + ts/mp4 透传 |
| 视频源代理 | `/api/video/proxy`，MacCMS API 代理 + 缓存 |
| DMHY 代理 | `/api/video/dmhy`，HTML 代理 |
| Mikan 代理 | `/api/video/mikan`，RSS 代理 |
| 弹幕代理 | `/api/danmaku/comment/:episodeId`，DanDanPlay API 代理 |
| Bangumi 本地搜索 | `/api/bangumi-search/search` + `/detail/:id` |
| Bangumi 数据同步 | `/api/bangumi-search/admin/sync`（手动触发）+ Cron 定时 |
| 图片上传代理 | `/api/uploads`，ImgBB API 代理 |

### 安全措施

| 措施 | 说明 |
|------|------|
| CORS 精确匹配 | `isAllowedOrigin()` 精确匹配 origin，防前缀绕过 |
| OAuth redirect_uri 白名单 | 仅允许 `/auth/bangumi` 和 `/auth/github` |
| SSRF 防护 | `isSafeTargetUrl()` 禁止内网 IP / localhost / 元数据地址 |
| JWT 长度限制 | Token 最大 4096 字符防 DoS |
| Rate Limiting | 写操作按 IP + 路径组限流（60s 滑动窗口） |
| Base64url 字符集校验 | JWT 签名验证前校验字符集 |
| 视频源响应验证 | 非 JSON 响应返回结构化错误 |

### Rate Limit 配置

| 端点 | 每分钟限制 |
|------|-----------|
| `/api/auth/login` | 5 |
| `/api/posts` | 10 |
| `/api/uploads` | 20 |
| `/api/world-messages` | 20 |
| `/api/private-messages` | 20 |
| `/api/mails` | 10 |
| `/api/collections` | 20 |
| `/api/follows` | 20 |
| `/api/friends` | 20 |
| `/api/friend-posts` | 20 |

### Bangumi 搜索模块

**文件**: [bangumi-search.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/lib/bangumi-search.js)

策略：本地 D1 索引优先 → 命中数 < 5 时调官方 API 兜底 → 兜底结果回写本地（self-healing）。

### Bangumi 同步模块

**文件**: [bangumi-sync.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/lib/bangumi-sync.js)

数据源：`bangumi-data/bangumi-data` 仓库的 `data/items/latest.json`。
- 频率门控：最少 6 天间隔
- Hash 门控：数据未变则跳过
- 分批写入：每批 5 条（D1 batch 参数限制）
- Cron：每周一/三 03:00 UTC

---

## 11. 数据库设计 (D1)

**文件**: [schema.sql](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/schema.sql)

### 数据表

| 表名 | 说明 | 主要字段 |
|------|------|---------|
| `users` | 用户表 | id, provider, provider_id, username, name, avatar, bio, sign, level, gender, birthday, following_count, follower_count, post_count, preferences, allow_profile_view, allow_comments_public |
| `posts` | 帖子表 | id, author_id, title, content, category, tags(JSON), images(JSON), likes, views, replies_count |
| `replies` | 回复表 | id, post_id, author_id, content |
| `collections` | 收藏标记表 | id, user_id, subject_id, subject_type, subject_name, subject_image, status, rating, comment |
| `follows` | 关注关系表 | id, from_user_id, to_user_id |
| `likes` | 点赞表 | id, user_id, post_id |
| `notifications` | 通知表 | id, user_id, type, from_user_id, target_type, target_id, content, is_read |
| `world_messages` | 世界频道消息 | id, author_id, content |
| `news` | 新闻表 | id, author_id, type, title, source, link, category, content, images(JSON) |
| `ratings` | 评分表 | id, user_id, subject_id, subject_type, score, content |
| `favorites` | 收藏表 | id, user_id, target_type, target_id |
| `mails` | 邮件表 | id, from_user_id, to_user_id, subject, content, attachments(JSON), read, starred, deleted_by_sender, deleted_by_receiver |
| `private_messages` | 私信表 | id, from_user_id, to_user_id, content, read |
| `friend_requests` | 好友请求表 | id, from_user_id, to_user_id, status, message |
| `friend_posts` | 好友动态表 | id, user_id, content, images(JSON), visibility, likes_count, comments_count, views |
| `friend_post_comments` | 好友动态评论 | id, post_id, user_id, content |
| `friend_post_likes` | 好友动态点赞 | id, post_id, user_id |
| `bangumi_index` | Bangumi 本地索引 | id, title, title_cn, title_ja, aliases(JSON), type, begin, end, score, rank, summary, image, sites(JSON), week(JSON), source_hash |
| `bangumi_index_meta` | 索引元数据 | key, value, updated_at |

### 索引

共 20+ 个索引，覆盖用户查询、帖子排序、收藏查询、关注查询、通知查询、邮件查询、好友查询、Bangumi 搜索等高频场景。

---

## 12. OAuth 认证流程

### 配置

**文件**: [oauth.config.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/oauth.config.js)

| 配置项 | 说明 |
|--------|------|
| `bangumi.clientId` | Bangumi OAuth Client ID（`VITE_BANGUMI_CLIENT_ID`） |
| `github.clientId` | GitHub OAuth Client ID（`VITE_GITHUB_CLIENT_ID`） |
| `proxyUrl` | Worker URL（生产环境）或空（开发环境用 Vite 插件） |
| `tokenBase` | Token 交换路径前缀：生产 `/oauth`，开发 `/api/oauth` |

### 流程

```
1. 用户点击"Bangumi 登录" / "GitHub 登录"
2. 前端生成 CSRF state → sessionStorage
3. 跳转 Bangumi/GitHub 授权页
4. 授权页回调到 /auth/bangumi 或 /auth/github
5. 404.html (GitHub Pages) → sessionStorage 存 spa_redirect → 重定向到 /
6. index.html 读取 spa_redirect → replaceState 恢复原始 URL
7. OAuthCallback 组件读取 code + state
8. 前端调 Worker /oauth/{provider}/token 交换 access_token
9. 前端调 AuthService.loginWithOAuth() → Worker /api/auth/login
10. Worker 在 D1 中查找/创建用户 → 返回 JWT
11. 前端存储 JWT (sessionStorage) + 用户信息 (localStorage)
```

### 开发环境 OAuth

**文件**: [vite-plugin-oauth.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/vite-plugin-oauth.js)

Vite 插件在开发环境拦截 `/api/oauth/*` 请求，代理到 Worker，避免配置 CORS。

---

## 13. 样式系统

### CSS 变量体系

项目使用 CSS 自定义属性实现主题化，主要定义在 `index.css` 中。

**核心色彩变量：**

| 变量 | 值 | 用途 |
|------|------|------|
| `--primary` | `#fb7299` | 主色（B站粉） |
| `--secondary` | `#00a1d6` | 辅助色（B站蓝） |
| `--tag-anime` | `#fb7299` | 动画标签 |
| `--tag-novel` | `#9b59b6` | 小说标签 |
| `--tag-game` | `#00a1d6` | 游戏标签 |

### 主题支持

通过 `data-theme` 属性切换主题，DockBar 设置面板提供切换入口：

| 主题 | data-theme 值 |
|------|--------------|
| 浅色 | `""` (空) |
| 深色 | `"dark"` |
| 高对比度 | `"high-contrast"` |

### UI 统一风格

- 药丸形标签（border-radius: 20px）
- 粉色主色调
- 悬浮提升效果
- 圆角卡片
- 平滑过渡动画
- Bangumi 图片优先使用 `large` 尺寸（850-1395px 宽度）

---

## 14. 外部 API 集成

| API | 基础 URL | 用途 | 认证 |
|-----|---------|------|------|
| Bangumi API | `https://api.bgm.tv` | 番剧搜索/详情/日历/评论 | User-Agent + OAuth |
| DanDanPlay | `https://api.dandanplay.net` | 弹幕数据 | 无 |
| Meting (网易云) | `https://api.i-meto.com/meting/api` | 网易云音乐代理 | 无 |
| Meting (QQ) | `https://api.i-meto.com/meting/api` | QQ音乐代理 | 无 |
| ImgBB | `https://api.imgbb.com/1/upload` | 图片上传 | API Key (Worker 侧) |
| bangumi-data | `https://raw.githubusercontent.com/bangumi-data/bangumi-data/master/data/items/latest.json` | 番剧元数据同步 | 无 |
| MacCMS 源 | 各源 baseUrl | 视频资源搜索 | 无 |

### 请求通用机制（前端 BangumiService）

- **请求去重**: 同一 cacheKey 复用进行中的请求
- **超时**: 10 秒
- **重试**: 最多 3 次，退避间隔 1s → 2s → 4s
- **缓存**: IndexedDB（CacheManager, LRU, 200 条, 30min TTL）
- **离线检测**: `navigator.onLine`
- **不可重试状态码**: 400, 401, 403, 404, 405, 410

### 请求通用机制（Worker 侧）

- **缓存**: Cloudflare Cache API（Bangumi API 30min / 搜索 5min / 图片 24h / 视频源 5min）
- **SSRF 防护**: 所有代理端点均校验目标 URL

---

## 15. 部署与 CI/CD

### GitHub Actions

**文件**: [deploy.yml](file:///d:/Desktop/Ideas/ANISpace/ANISpace/.github/workflows/deploy.yml)

**流程**: push to main → npm ci → vite build（注入 VITE_* 环境变量）→ GitHub Pages 部署

**必需的 GitHub Secrets：**

| Secret | 说明 |
|--------|------|
| `VITE_BANGUMI_CLIENT_ID` | Bangumi OAuth Client ID |
| `VITE_BANGUMI_CLIENT_SECRET` | Bangumi OAuth Client Secret |
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth Client ID |
| `VITE_GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret |
| `VITE_OAUTH_PROXY_URL` | Worker URL |

### Cloudflare Worker 部署

**配置**: [wrangler.toml](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/wrangler.toml)

**Worker 环境变量（Dashboard 配置）：**

| 变量 | 说明 |
|------|------|
| `BANGUMI_CLIENT_ID` | Bangumi OAuth Client ID |
| `BANGUMI_CLIENT_SECRET` | Bangumi OAuth Client Secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret |
| `ALLOWED_ORIGIN` | 允许的前端域名 |
| `JWT_SECRET` | JWT 签名密钥 |
| `ADMIN_SYNC_TOKEN` | 手动触发同步的鉴权 token |
| `IMGBB_API_KEY` | ImgBB 图片上传 API Key |

### GitHub Pages SPA 路由恢复

**文件**: [404.html](file:///d:/Desktop/Ideas/ANISpace/ANISpace/public/404.html)

GitHub Pages 不支持 SPA 路由，404.html 将原始 URL 存入 `sessionStorage('spa_redirect')` 并重定向到 `/`。[index.html](file:///d:/Desktop/Ideas/ANISpace/ANISpace/index.html) 读取 `spa_redirect` 并用 `replaceState` 恢复原始 URL（不删除，让 OAuthCallback 读取后再删除）。

---

## 16. 项目运行方式

### 环境要求

- Node.js 20+
- npm

### 前端开发

```bash
# 安装依赖
npm install

# 创建 .env 文件
# VITE_BANGUMI_CLIENT_ID=xxx
# VITE_GITHUB_CLIENT_ID=xxx
# VITE_OAUTH_PROXY_URL=  (留空则使用 Vite 插件代理)

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 代码检查
npm run lint
```

### Worker 开发

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录
wrangler login

# 本地开发
cd worker
wrangler dev

# 部署
wrangler deploy

# 初始化 D1 数据库
wrangler d1 execute anispace-db --file=schema.sql

# 运行迁移
wrangler d1 execute anispace-db --file=migrations/v008_bangumi_index.sql
```

### Bangumi 数据脚本

```bash
# 爬取 Bangumi 数据
npm run crawl
```

---

## 17. 关键设计决策

### 17.1 前后端分离 + Serverless

前端部署于 GitHub Pages（免费静态托管），后端使用 Cloudflare Worker + D1（Serverless，按请求计费）。这使部署成本极低，同时获得了真正的后端能力（用户认证、数据持久化、API 代理）。

### 17.2 双渲染模式

项目同时支持两种内容展示模式：
- **路由页面模式**: 传统 SPA 页面切换（React Router）
- **浮动窗口模式**: 类桌面 OS 窗口系统（WindowManager + AppWindow）

浮动窗口用于音乐播放器、好友空间、世界频道等需要"常驻"的功能。

### 17.3 服务层模式 + 渐进式后端迁移

所有业务逻辑封装在 Service 对象中。项目从纯 localStorage 架构渐进迁移到后端 API：每个 Service 同时保留同步方法（localStorage，标记 `@deprecated`）和异步方法（后端 API，`Async` 后缀），确保迁移过程中不破坏现有功能。

### 17.4 Bangumi API 代理 + 本地索引

Bangumi API 在中国大陆直连不稳定，Worker 代理解决 CORS 和可达性问题。同时，bangumi-data 定时同步到 D1 本地索引，搜索走本地优先 + 官方 API 兜底 + 结果回写，兼顾速度和完整性。

### 17.5 影视区 V2 多源架构

参考 Animeko 的 MediaSource/MediaSourceFactory 模式，实现了可扩展的多源资源聚合。每个源实现统一接口（`fetch`、`checkConnection`），由 MediaSourceManager 统一管理，MatchEngine 负责匹配排序。

### 17.6 DPlayer + HLS.js

视频播放使用 DPlayer（内置弹幕支持）+ HLS.js（流媒体解析），通过 Worker 代理视频流解决 CORS 问题。m3u8 播放列表中的相对 URL 在 Worker 侧重写为代理 URL。

### 17.7 Live2D 集成

使用 pixi.js v6（非 v7/v8，因 pixi-live2d-display 仅兼容 v6）+ pixi-live2d-display 实现 Live2D 看板娘。Live2DViewer 页面采用懒加载（`React.lazy`）减小首屏体积。

### 17.8 GitHub Pages SPA 路由恢复

GitHub Pages 不支持 SPA 路由，通过 404.html → sessionStorage → index.html replaceState 的方式恢复原始 URL。特别注意不立即删除 `spa_redirect`，让 OAuthCallback 组件能读取 OAuth 参数。

---

## 18. 后续功能奇思妙想

> 以下创意围绕 ANISpace 的独特特性（窗口系统、Live2D、D-Mail、多源聚合、桌面 OS 隐喻）展开，追求现有 ACG 平台没有的差异化体验。

### 窗口生态联动

1. **窗口化学反应** — 利用 ANISpace 独有的多窗口系统，让不同窗口之间产生"化学反应"。视频窗口播放番剧时，音乐窗口自动切换到该番 OST；番剧详情窗口标记"在看"时，好友空间窗口自动浮现也在看同一番的好友动态；世界频道窗口检测到某番讨论热度飙升时，自动弹出"世界线变动"提示。窗口不再是孤岛，而是会互相感知的生态。

2. **窗口布局预设** — 保存和分享窗口布局方案。比如"追番模式"（视频窗口最大化 + 弹幕窗口侧栏 + 好友空间浮窗），"考古模式"（Wiki 窗口 + 搜索窗口 + 笔记窗口三联屏）。用户可以一键切换布局，也可以把自己的布局分享到 Tea Time！。

### Live2D 深度交互

3. **追番伴侣** — 让 Live2D 看板娘根据当前浏览的番剧变换角色和服装：看《魔法少女小圆》变成小圆，看《Fate》变成 Saber。她会在关键剧情节点给出反应（惊讶、哭泣、害羞），成为追番时的"情绪共鸣者"。不同角色的看板娘还有独特的待机动作和语音。

4. **ANISpace 电台** — 24/7 运行的虚拟电台，自动播放用户收藏番剧的 BGM/OP/ED，Live2D 看板娘化身 DJ。用户可以点歌，看板娘会做出反应（听到悲伤的曲子会低头，听到热血曲子会挥拳）。电台有"节目表"——早晨放轻松的 OP，深夜放抒情的 ED，深夜 2 点还有"深夜动画特别节目"。

### 弹幕创作新形态

5. **弹幕绘卷** — 将一部番所有集的弹幕按时间轴绘制成一幅"绘卷"（江户时代画卷风格），每条弹幕是一个小字符，颜色反映情感倾向。用户可以像展开古卷一样水平滚动浏览，感受一部番从开播到完结的"弹幕文化变迁"。完结番的绘卷可以导出为长图纪念。

6. **弹幕剧场** — 用户选择一部番的某个片段，只用弹幕来"重演"这个场景——弹幕的内容、颜色、位置、出现时机都由创作者精心编排，形成一种全新的"弹幕叙事"形式。其他用户可以观看这些"弹幕剧场"作品并投币，优秀作品在首页展示。

7. **弹幕共鸣** — 当某时刻弹幕密度突然飙升（名场面），系统自动触发"共鸣"效果：所有弹幕统一为金色，屏幕边缘泛光，Live2D 看板娘做出惊叹表情。这不是预设的，而是由观众的真实热情自然触发的"集体仪式"。

### 世界观与叙事

8. **D-Mail 世界线变动率** — 借用《命运石之门》D-Mail 概念，好友间的私信附带"世界线变动率"——当两人对话涉及某部番时，系统计算两人对该番评分的差异作为变动率。变动率越大说明分歧越大，触发不同的视觉特效（微小时屏幕轻微抖动，巨大时整个窗口色调偏移）。好友空间展示"与你的世界线距离"。

9. **番剧考古学** — 用户可以"挖掘"某个年份的番剧，模拟考古发掘体验：从表层（热门番）到深层（冷门番），越深越冷门。每"挖掘"一部番获得一个"文物卡片"（和风设计），集齐某个时期的卡片解锁该时期的番剧文化综述。不同用户挖掘同一时期可能发现不同的"文物"，促进交换和讨论。

10. **番剧炼金术** — 用户选择两部番剧，系统基于 Bangumi 标签和评分数据"炼金"生成一部虚拟番剧——混合两者的标签、风格、声优，生成标题和简介。社区投票评选最想看的"炼金番"，得票最高的可以由社区协作撰写"同人企划书"。

### 禁書目錄 知识体系

11. **知识图谱** — 将番剧之间的关系（续作、前传、同人、同一世界观、同一原作、制作公司传承）绘制为交互式知识图谱。用户从任意番剧出发，沿关系链探索整个 ACG 宇宙。支持"六度分隔"挑战——任意两部番之间最少经过几部番能建立联系？图谱用星空风格渲染，每部番是一颗星，关系是星座连线。

12. **声优星座图** — 以声优为节点，共同出演的番剧为连线，绘制动态"星座图"。点击任意声优看到 TA 的"星座"——合作最多的声优形成最亮的星座。支持时间轴播放：拖动时间轴看星座如何随季度演化，发现"这对声优居然从 2015 年就开始频繁合作了"。

### 追番仪式感

13. **番剧天气预报** — 基于当季番剧的评分趋势和讨论热度，每日生成"番剧天气预报"：晴天=高分番，多云=争议番，暴雨=崩坏番，彩虹=黑马番。配合天气图标和看板娘播报文案（"今天东京地区有 80% 概率出现神作，请准备好纸巾"）。预报准确度由社区事后评分验证。

14. **追番手账** — 自动为用户生成精美的"追番手账"——按月份排列，每月番剧用和风插画风格卡片展示，标注评分、心情、追番状态。手账中的留白区域用户可以手写（触摸屏）或贴"贴纸"（番剧名场面截图）。可以导出为 PDF 或长图分享。

15. **番剧纸芝居** — 纸芝居（纸画剧）是日本传统讲故事形式。用户用番剧截图+文字创作"纸芝居"——类似幻灯片的叙事作品，讲述自己对番剧的理解或创作衍生故事。其他用户可以"围观"并投币，优秀的纸芝居在禁書目錄展示。

### 技术与体验

16. **PWA 离线追番** — 将 ANISpace 改造为 PWA，离线时仍可浏览已缓存的番剧信息、帖子、好友动态。Service Worker 预缓存关键资源，IndexedDB 存储离线数据。地铁上也能查追番列表和写评论，联网后自动同步。

17. **Durable Objects 实时世界线** — 使用 Cloudflare Durable Objects 实现 WebSocket 实时通信，世界频道消息即时到达，好友在线状态实时显示，弹幕共鸣效果同步触发。让 ANISpace 从"刷新式"进化为"实时式"体验。

18. **端到端加密 D-Mail** — 使用 Web Crypto API 实现端到端加密的 D-Mail，Worker 只转发密文，即使 D1 数据库泄露也无法读取内容。加密密钥由用户密码派生，完美契合《命运石之门》中 D-Mail 的"只有发送者和接收者知道内容"的设定。

---

*本文档最后更新：2026-06-12*
