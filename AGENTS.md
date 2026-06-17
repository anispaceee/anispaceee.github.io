# ANISpace — 完整项目构建指南

> 如果你是人类，你会给 AI 怎样的 agents.md？
>
> 答案是：你需要一份从零到一的、精确到字段级别的构建手册。不是模糊的需求描述，而是每一层架构、每一个表结构、每一条路由、每一个组件都有明确规格的执行蓝图。AI 不需要"创造力"，它需要"确定性"。下面就是这份确定性文档。

---

## 一、项目概述

构建一个名为 **ANISpace** 的 ACG（动画/漫画/游戏）社区平台。它是一个桌面操作系统风格的 SPA 应用，拥有 macOS 风格 Dock 栏、可拖拽窗口系统、多模块社交功能，后端基于 Cloudflare Worker + D1 数据库。

**核心定位**：Bangumi 番组计划的增强型社区前端，聚合多源视频/资讯，提供创作者平台和社交功能。

**部署架构**：
- 前端：React + Vite → GitHub Pages（SPA，404.html 回退路由）
- 后端：Cloudflare Worker（单文件入口 `oauth-proxy.js`）+ D1 数据库
- CI/CD：GitHub Actions 自动构建部署

---

## 二、技术栈（严格遵循）

### 前端
- **React 19** + **React Router 7**（BrowserRouter + Routes）
- **Vite 8** 构建
- **framer-motion** 页面切换动画
- **lucide-react** 图标库
- **idb** IndexedDB 封装（LRU 缓存）
- **DPlayer** + **hls.js** 视频播放
- **pixi.js** + **pixi-live2d-display** Live2D 模型展示
- **mouse-firework** 点击烟花效果
- **webtorrent** BT 种子下载

### 后端
- **Cloudflare Worker**（ES Module 格式）
- **D1** 数据库（SQLite 兼容）
- **JWT** 认证（HMAC-SHA256，7 天过期）
- **Cron Triggers**：周一/三 03:00 UTC 同步 bangumi-data，每 30 分钟爬取资讯

### 外部 API
- **Bangumi API**（`api.bgm.tv`）— 条目搜索、详情、每日放送
- **GitHub OAuth** — 用户登录
- **AniBT API**（`anibt.net`）— 视频源
- **Hikarinagi API** — 视频源匹配
- **Jikan API**（MAL）— MyAnimeList 数据
- **Kitsu API** — Kitsu 动漫数据
- **TraceMoe API** — 以图搜番
- **文库8 API** — 轻小说数据
- **智谱 AI GLM-4-Flash**（`open.bigmodel.cn`）— Navi AI 助手

---

## 三、构建顺序（严格按此顺序执行）

### Phase 1：基础设施搭建

#### 1.1 项目初始化
```
npm create vite@latest ANISpace -- --template react
```
安装所有依赖：
```json
{
  "dependencies": {
    "@pixi/utils": "^6.5.10",
    "@tauri-apps/api": "^2.11.0",
    "dplayer": "^1.27.1",
    "framer-motion": "^12.40.0",
    "hls.js": "^1.6.16",
    "idb": "^8.0.3",
    "lucide-react": "^1.14.0",
    "mouse-firework": "^0.2.0",
    "pixi-live2d-display": "^0.4.0",
    "pixi.js": "^6.5.10",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "react-router-dom": "^7.15.0",
    "webtorrent": "^3.0.16"
  }
}
```

#### 1.2 Vite 配置
- 使用 `@vitejs/plugin-react`
- 自定义 Vite 插件 `vite-plugin-oauth.js`：在开发时注入 OAuth 环境变量到 `import.meta.env`
- `base: '/'`，`outDir: 'dist'`
- rollupOptions.external 排除 `@pixi/*`

#### 1.3 GitHub Pages SPA 回退
创建 `public/404.html`：
- 将当前路径存入 `sessionStorage('spa_redirect', pathname + search + hash)`
- `window.location.replace(origin + '/')`
- **关键**：Vite 不处理 public/ 下的文件，所以不能用 JSX/模块语法

#### 1.4 GitHub Actions 部署
`.github/workflows/deploy.yml`：
- 触发：push to main + workflow_dispatch
- 构建：`npm ci --legacy-peer-deps` → `npm run build`
- 注入环境变量：`VITE_BANGUMI_CLIENT_ID/SECRET`、`VITE_GITHUB_CLIENT_ID/SECRET`、`VITE_OAUTH_PROXY_URL`（从 GitHub Secrets 读取）
- 部署：`actions/deploy-pages@v4`

---

### Phase 2：后端 Worker 搭建

#### 2.1 Worker 项目结构
```
worker/
├── oauth-proxy.js          # 主入口，所有路由处理
├── wrangler.toml           # Worker 配置
├── schema.sql              # 完整数据库 Schema
├── lib/
│   ├── bangumi-sync.js     # bangumi-data 定时同步
│   ├── bangumi-search.js   # Bangumi 搜索（优先 D1 → bangumi_index → API）
│   ├── bangumi-enrich.js   # 条目数据增强（异步写入 bangumi_subjects）
│   └── news-scraper.js     # 多源资讯爬取
└── migrations/
    ├── v008_bangumi_index.sql
    ├── v009_musashi.sql
    ├── v010_works_favorites_count.sql
    ├── v011_musashi_rating_progress.sql
    ├── v012_invite_system.sql
    ├── v013_bangumi_subjects.sql
    ├── v014_auto_enrich.sql
    └── v015_episode_progress.sql
```

#### 2.2 wrangler.toml 配置
```toml
name = "anispace-oauth-proxy"
main = "oauth-proxy.js"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGIN = "https://anispaceee.github.io"

[[d1_databases]]
binding = "DB"
database_name = "anispace-db"

[triggers]
crons = ["0 3 * * 1", "0 3 * * 3", "*/30 * * * *"]
```

环境变量（在 Cloudflare Dashboard 配置为 Secrets）：
- `BANGUMI_CLIENT_ID`、`BANGUMI_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`
- `JWT_SECRET`、`ADMIN_SYNC_TOKEN`
- `GLM_API_KEY`

#### 2.3 数据库 Schema（完整表清单）

**核心表**：
| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `users` | 用户 | provider, provider_id, username, name, avatar, is_admin, invite_code, auto_enrich |
| `collections` | 收藏标记 | user_id, subject_id, status, rating, comment |
| `ratings` | 评分 | user_id, subject_id, score |
| `favorites` | 喜欢 | user_id, target_type, target_id |
| `posts` | 帖子 | author_id, title, content, category, tags |
| `replies` | 回复 | post_id, author_id, content, parent_id |
| `likes` | 点赞 | user_id, post_id/reply_id |
| `notifications` | 通知 | user_id, type, from_user_id, target_type/id |
| `world_messages` | 世界频道 | author_id, content |
| `news` | 新闻 | author_id, type, title, source, link, category |
| `scraped_news` | 爬取资讯 | source, source_id, title, link, summary |
| `mails` | 邮件 | from/to_user_id, subject, content, read, starred |
| `private_messages` | 私信 | from/to_user_id, content |
| `follows` | 关注 | from/to_user_id |
| `friend_requests` | 好友请求 | from/to_user_id, status |
| `friend_posts` | 好友动态 | user_id, content, images, visibility |
| `friend_post_comments` | 动态评论 | post_id, user_id, content |
| `friend_post_likes` | 动态点赞 | post_id, user_id |
| `user_guestbook` | 留言板 | user_id, author_id, content, reply_to_id |
| `subject_comments` | 条目评论 | subject_id, user_id, content |
| `bangumi_index` | Bangumi 索引 | id(=bgm_id), title, title_cn, title_ja, aliases, type, begin, end, score, rank, summary, image, sites, week, source_hash |
| `bangumi_index_meta` | 同步元数据 | key, value, updated_at |
| `bangumi_subjects` | 条目完整数据 | id(=bgm_id), type, name, name_cn, summary, image, images, score, rank, rating, tags, eps, air_date, air_weekday, platform, infobox, crt, staff, collection, source, enriched_at |
| `episode_progress` | 剧集进度 | user_id, subject_id, episode_id, episode_sort, status, is_private, comment |

**Musashi 创作者平台表**：
| 表名 | 用途 |
|------|------|
| `works` | 作品（galgame/novel/manga） |
| `novel_chapters` | 小说章节 |
| `manga_chapters` + `manga_pages` | 漫画章节+页面 |
| `galgame_downloads` | Galgame 下载链接 |
| `galgame_previews` | Galgame 预览图 |
| `work_comments` | 作品评论 |
| `work_favorites` / `work_likes` | 收藏/点赞 |
| `reading_progress` | 阅读进度 |
| `work_ratings` | 作品评分 |
| `work_reports` | 举报 |

**邀请制表**：
| 表名 | 用途 |
|------|------|
| `invites` | 邀请码 |
| `invite_relations` | 邀请关系 |
| `user_permissions` | 用户权限 |
| `invite_rewards` | 邀请奖励 |

#### 2.4 Worker API 路由清单

**OAuth 认证**：
- `GET /oauth/bangumi/token` → Bangumi OAuth token 交换
- `GET /oauth/github/token` → GitHub OAuth token 交换
- `POST /api/auth/login` → 用户登录/注册

**Bangumi 代理**：
- `GET /api/bangumi/*` → 代理 Bangumi API（带缓存 30min）
- `GET /api/bangumi/image?url=` → Bangumi 图片代理（解决防盗链，仅允许 lain.bgm.tv 等域名）
- `GET /api/bangumi-search/search` → 搜索（优先 D1 → bangumi_index → API）
- `POST /api/bangumi-search/admin/sync` → 手动触发 bangumi-data 同步
- `GET /api/bangumi-search/admin/status` → 同步状态查询

**外部 API 代理**（统一解决 CORS）：
- `GET /api/anibt/*` → AniBT API 代理
- `GET /api/hikarinagi/*` → Hikarinagi API 代理
- `GET /api/jikan/*` → Jikan (MAL) API 代理
- `GET /api/tracemoe/*` → TraceMoe 以图搜番代理
- `GET /api/kitsu/*` → Kitsu API 代理
- `GET /api/wenku8/*` → 文库8 API 代理
- `GET /api/danmaku/comment/*` → 弹幕代理

**视频源路由**：
- `GET /api/video/stream` → 视频流代理
- `GET /api/video/proxy` → 视频代理
- `GET /api/video/dmhy` → DMHY 搜索
- `GET /api/video/mikan` → Mikan 搜索
- `POST /api/selector/search` → Selector 搜索
- `POST /api/selector/episode` → Selector 剧集
- `GET /api/rss/fetch` → RSS 抓取

**用户系统**：
- `GET /api/users/:id/profile` → 用户资料（含 auto_enrich 状态）
- `PUT /api/users/:id/profile` → 更新资料
- `PUT /api/users/:id/settings` → 更新设置（含 auto_enrich 开关）
- `GET /api/users/search` → 用户搜索
- `POST /api/uploads` → 文件上传

**权限系统**：
- `GET /api/permissions/check` → 权限检查
- `GET /api/permissions` → 权限列表
- `POST /api/permissions/grant` → 授权（管理员）
- `DELETE /api/permissions/revoke` → 撤销权限（管理员）

**收藏/评分/喜欢**：
- `POST /api/collections` → 标记收藏（条件触发 enrichSubject）
- `GET /api/collections?user_id=` → 用户收藏列表
- `DELETE /api/collections/:id` → 删除收藏
- `GET /api/ratings` → 评分列表
- `GET /api/ratings/user` → 用户评分
- `POST /api/ratings` → 评分
- `GET /api/favorites/check` → 检查是否喜欢
- `GET /api/favorites` → 喜欢列表
- `POST /api/favorites/toggle` → 喜欢/取消

**关注/好友**：
- `GET /api/follows/check` → 检查关注关系
- `GET /api/follows/following` → 关注列表
- `GET /api/follows/followers` → 粉丝列表
- `POST /api/friends/request` → 发送好友请求
- `GET /api/friends/requests/sent` → 已发送请求
- `GET /api/friends/requests/received` → 已收到请求
- `GET /api/friends/requests` → 所有请求
- `GET /api/friends` → 好友列表

**社交功能**：
- `GET/POST /api/posts` → 帖子列表/创建
- `GET/PUT/DELETE /api/posts/:id` → 帖子详情/更新/删除
- `POST /api/posts/:id/replies` → 回复
- `POST /api/posts/:id/like` → 点赞
- `GET/POST /api/world-messages` → 世界频道
- `GET/POST /api/friend-posts` → 好友动态
- `GET/POST /api/user-guestbook` → 留言板
- `GET/POST /api/subject-comments` → 条目评论

**邮件/私信**：
- `GET /api/mails/unread` → 未读邮件数
- `GET /api/mails/inbox` → 收件箱
- `GET /api/mails/sent` → 发件箱
- `GET /api/mails/conversation` → 邮件对话
- `POST /api/mails` → 发送邮件
- `GET /api/private-messages/conversations` → 私信对话列表
- `GET /api/private-messages/conversation` → 私信对话详情
- `PUT /api/private-messages/read` → 标记已读
- `POST /api/private-messages` → 发送私信

**通知**：
- `GET/POST /api/notifications` → 通知列表/创建
- `PUT /api/notifications/read` → 标记已读

**资讯**：
- `GET /api/news` → 新闻列表
- `POST /api/news` → 创建新闻
- `GET /api/news/feed` → 新闻 Feed
- `GET /api/news/refresh` → 刷新新闻
- `POST /api/news/admin/scrape` → 管理员触发爬取

**Musashi 创作者平台**：
- `GET/POST /api/works` → 作品列表/创建
- `GET/PUT/DELETE /api/works/:id` → 作品详情/更新/删除
- `GET /api/works/my` → 我的作品
- `POST /api/works/:id/chapters` → 章节管理
- `POST /api/works/:id/like` / `/favorite` → 点赞/收藏
- `POST /api/works/:id/rate` → 评分
- `GET /api/reading-progress` → 阅读进度

**邀请制**：
- `POST /api/invites` → 创建邀请码
- `POST /api/invites/claim` → 使用邀请码
- `GET /api/invites` → 邀请码列表（管理员）

**AI 助手**：
- `POST /api/llm/chat/completions` → Navi AI 聊天（代理智谱 API，Key 不暴露给前端）

**Bangumi 搜索内部路由**（由 `handleBangumiProxy` 处理）：
- `GET /search` → Bangumi 搜索
- `GET /chapters` → 章节获取
- `GET /content` → 内容获取

#### 2.5 Worker 安全措施
- **CORS**：精确匹配 ALLOWED_ORIGIN，防止前缀绕过
- **SSRF 防护**：禁止 IP 地址、内网段、元数据地址
- **JWT**：HMAC-SHA256 签名，7 天过期，长度限制 4096 字节
- **OAuth redirect_uri 校验**：白名单路径 `/auth/bangumi`、`/auth/github`
- **GET 端点认证**：Authorization header 携带 Bearer token
- **auto_enrich 查询 try-catch**：兼容未执行迁移的数据库
- **Rate Limiting**：写操作按 IP + 路径前缀分组限流（`checkRateLimit`）
- **图片代理域名白名单**：仅允许 `lain.bgm.tv`、`bgm.tv`、`api.bgm.tv`

#### 2.6 Worker Cron 处理（scheduled handler）
- 周一/三 03:00 UTC：执行 `bangumiSync.sync()` 同步 bangumi-data 仓库数据到 `bangumi_index` 表
- 每 30 分钟：执行 `newsScraper.scrape()` 爬取多源资讯到 `scraped_news` 表

---

### Phase 3：前端核心架构

#### 3.1 全局状态管理（Context 体系）

**AppContext**（`src/context/AppContext.jsx`）：
- `currentUser` / `isAuthenticated` — 当前用户
- `notifications` / `mailUnreadCount` — 通知/未读邮件数
- `socialMode` — 社交功能开关（邀请制，默认关闭）
- `oauthLogin` / `logout` / `updateProfile` / `refreshUser`
- `openAuth` / `closeAuth` — 登录弹窗控制
- `toggleSocialMode` — 社交模式切换

**WindowManager**（`src/context/WindowManager.jsx`）：
- 管理所有窗口的 open/minimized/focused 状态
- `openWindow(id)` / `closeWindow(id)` / `focusWindow(id)` / `minimizeWindow(id)`

**MusicContext**（`src/context/MusicContext.jsx`）：
- `currentSong` / `playing` / `volume` / `muted`
- `playSong` / `togglePlay` / `playNext` / `playPrev`
- `savedPlaylists` / `loadSavedPlaylist`

Provider 嵌套顺序：`WindowManagerProvider > MusicProvider > AppProvider`

#### 3.2 路由结构

```
/                       → HomePage（首页：每日放送 + 随机推荐 + 搜索）
/auth/bangumi           → OAuthCallback
/auth/github            → OAuthCallback
/info/:type/:id         → InfoDetail（条目详情：评分/收藏/评论/视频源）
/wiki                   → Wiki（禁書目錄）
/news                   → NewsZone（毒电波！！）
/news/editor            → NewsEditor
/news/:id               → NewsDetail
/forum                  → Forum（放課後）[SocialGuard]
/forum/post/:id         → PostDetail [SocialGuard]
/musashi                → MusashiHome [SocialGuard]
/musashi/new            → WorkCreate [SocialGuard]
/musashi/:workId        → WorkDetail [SocialGuard]
/musashi/:workId/edit   → WorkEdit [SocialGuard]
/musashi/:workId/read   → NovelReader [SocialGuard]
/musashi/:workId/comic  → MangaReader [SocialGuard]
/musashi/my-works       → MyWorks [SocialGuard]
/profile                → UserProfilePage
/user/:userId           → UserProfilePage
/video/play/:subjectId/:episodeId → VideoPlayer
/guestbook              → Guestbook [SocialGuard]
/friends                → FriendSpace [SocialGuard]
/music                  → MusicPlayer
/navi                   → Amadeus
/live2d                 → Live2DViewer
```

**SocialGuard**：社交功能关闭时显示"社交功能未解锁"提示，需邀请码解锁。

#### 3.3 桌面操作系统式 UI

**Layout**（`Layout.jsx`）：
- Header + `<Outlet />` + Footer
- framer-motion 页面切换动画（fade + slide）

**Header**（`Header.jsx`）：
- 导航项：首页 / 放課後 / 毒电波！！ / 禁書目錄 / 武藏也（社交项按 socialMode 过滤）
- 全局搜索触发器（⌘K 快捷键）
- 用户头像 + 登录/退出按钮

**DockBar**（`DockBar.jsx`）— macOS 风格底部 Dock：
- **放大效果**：hover 时当前图标 scale 1.3，相邻 1.12，次相邻 1.03
- **自动隐藏**：可配置延迟（3-30s），鼠标悬停触发条时显示
- **Dock 图标**：应用启动器 / Tea Time! / 世界线 / Navi / 音乐 / LeMU / 站点导航 / D-Mail（带未读 badge）/ 设置 / 通知（带未读 badge）
- **设置面板**：主题切换（浅色/深色/高对比）/ Dock 自动隐藏 / 烟花效果 / 社交功能开关 / 邀请码输入 / 账户
- **音乐面板**：封面 + 歌曲信息 + 播放控制 + 音量

**AppWindow**（`AppWindow.jsx`）：
- 可拖拽、可调整大小的窗口
- z-index 焦点管理（点击置顶）
- 最小化到 MinimizedBar

**MinimizedBar**（`MinimizedBar.jsx`）：
- 窗口最小化后显示在屏幕左侧的横条
- 每个横条有定制内容（音乐播放控制、Navi 输入框、D-Mail 未读数等）

#### 3.4 前端服务层

**api.js** — 核心服务层：
- `apiRequest(path, options)` — 自动携带 JWT Authorization header
- `CacheManager` — IndexedDB 缓存（LRU，200 条上限，30min TTL）
- `_request()` / `_doRequest()` — 请求去重（`_inFlight` Map）+ 重试（3 次）+ 超时（10s）+ 离线检测
- `ApiError` — 统一错误处理（OFFLINE/TIMEOUT/RATE_LIMITED 等）
- `validateSubject()` — Bangumi API 响应字段映射

**服务类**：
- `BangumiService` — 搜索/详情/每日放送
- `AuthService` — 登录/登出/用户资料
- `UserService` — 用户操作
- `ForumService` — 帖子/回复
- `WorldChannelService` — 世界频道
- `NewsService` — 新闻
- `CollectionMarkService` — 收藏标记（含本地备份 saveToLocalBackup/removeFromLocalBackup/getLocalBackup）
- `RatingService` — 评分
- `FavoriteService` — 喜欢
- `NotificationService` — 通知
- `MailService` — 邮件
- `FriendPostService` — 好友动态
- `MusashiApi` — 创作者平台

**BangumiDataService**（`BangumiDataService.js`）：
- 条目详情获取（优先 bangumi_subjects → Bangumi API）

**BangumiSearchService**（`BangumiSearchService.js`）：
- 搜索逻辑封装

**HikarinagiService**（`HikarinagiService.js`）：
- Hikarinagi 视频源匹配

**媒体源系统**（`services/media/`）：
- `MediaSourceManager.ts` — 媒体源管理器
- `MatchEngine.ts` — 标题匹配引擎
- `MediaFetcher.ts` — 媒体获取
- `MediaSelector.ts` — 媒体选择
- `RawTitleParser.ts` — 原始标题解析
- `TorrentAdapter.ts` — BT 种子适配
- `DanmakuService.ts` — 弹幕服务
- `sources/` — 各源实现：MikanSource / DmhySource / MacCMSSource / RSSSource / SelectorSource / LocalCacheSource
- `initSources.ts` — 初始化所有源

---

### Phase 4：核心页面实现

#### 4.1 首页（HomePage）
- **顶部横幅**：全宽 21:9 比例，占据整个顶部区域
- **每日放送**：按周几分组显示当日番剧，卡片网格布局
- **随机推荐**：单张卡片 + 刷新按钮，支持按类型筛选（全部/动画/小说/游戏/三次元）
- **搜索功能**：沉浸式搜索主页，无图标，标题 ANISpace，显示搜索历史而非热门话题
- **分页**：完整的页码导航组件
- **用户档案区**：编辑/设置/导出数据按钮（粉色背景，hover 变实色粉）

#### 4.2 条目详情页（InfoDetail）
- **背景模糊**：容器使用条目封面图做背景模糊效果（非乳白色背景）
- **封面 + 基本信息**：标题/中文名/类型/日期/评分
- **评分分布**：竖向柱状图（10→1分），支持按分数筛选评论
- **收藏标记**：想看/看过/想玩/玩过/抛弃/搁置（游戏类型用"玩过/想玩"而非"看过/想看"）
- **评论系统**：条目评论列表 + 发表评论
- **视频源匹配**：多源聚合（Mikan/Dmhy/MacCMS/Hikarinagi），显示字幕组信息
- **NSFW 处理**：与正常页面相同布局，受限内容替换为 NSFW 提示
- **收录功能**：标记时自动收录到后端（auto_enrich 开关控制）

#### 4.3 视频播放页（VideoPlayer）
- DPlayer + hls.js 播放器
- 剧集列表切换
- 弹幕支持
- Error Boundary 防崩溃

#### 4.4 Navi AI 助手（Amadeus）
- 聊天界面，流式响应
- 后端代理智谱 API（`POST /api/navi/chat`），API Key 不暴露给前端
- 模型：`glm-4-flash`
- 最小化时显示输入框（"问 Navi..."）

#### 4.5 音乐播放器（MusicPlayer）
- 播放列表管理
- 播放控制（播放/暂停/上下首/音量）
- 歌单保存/加载
- MiniPlayer 组件

#### 4.6 创作者平台（Musashi）
- 作品列表（galgame/novel/manga 分类）
- 作品创建/编辑（Markdown 编辑器、图片上传、章节管理）
- 小说阅读器（滚动/翻页模式、阅读进度保存）
- 漫画阅读器（图片列表、章节切换）
- Galgame 下载管理
- 评分/收藏/评论

#### 4.7 社交模块
- **放課後（Forum）**：帖子列表 + 详情 + 回复 + 点赞
- **世界频道（WorldChannel）**：实时消息流
- **LeMU（FriendSpace）**：好友动态 + 评论 + 点赞
- **Tea Time!（Club）**：社团聊天
- **D-Mail（Mailbox）**：邮件系统（收件箱/发件箱/草稿/已删除）
- **留言板（Guestbook）**：用户留言
- **通知（Notifications）**：系统通知列表

#### 4.8 其他模块
- **禁書目錄（Wiki）**：百科浏览
- **毒电波！！（NewsZone）**：新闻资讯 + 编辑器
- **站点导航（FriendLinks）**：友情链接
- **Live2D 查看器**：3D 模型展示
- **TouchGal**：触摸 Galgame
- **邀请系统（AdminPanel）**：邀请码管理

---

### Phase 5：设计系统

#### 5.1 CSS 变量体系
- 主题支持：浅色（默认）/ 深色 / 高对比
- `data-theme` 属性切换
- 萌系配色方案（粉色系为主色调，非微信灰色调）
- CSS 变量命名：`--primary` / `--bg-primary` / `--text-primary` / `--border-primary` 等

#### 5.2 关键 UI 规范
- 按钮统一：`border: none`，默认 background/color，hover 变色
- 用户操作按钮（编辑/设置/导出数据）：粉色背景 + 粉色文字 + hover 变实色粉
- 通知红点：`.notification-dot` CSS 类
- 卡片组件：统一 `SubjectCard` / `SkeletonCard` / `ErrorState`
- 每日放送和搜索结果网格：一致的组件尺寸
- 条目详情页：背景图模糊效果
- 评论文字颜色：根据主题自动调整（深色主题白色文字，浅色主题深色文字）
- 游戏相关状态标签：用"玩过/想玩"而非"看过/想看"
- 首页档案分类统一：想读/想玩、读过/玩过、抛弃、搁置

---

### Phase 6：数据流与特殊逻辑

#### 6.1 搜索优先级
`bangumi_subjects`（完整数据）→ `bangumi_index`（轻量索引）→ Bangumi API（回退）

#### 6.2 条目增强流程
1. 用户标记收藏 → `POST /api/collections`
2. 检查 `auto_enrich` 开关（默认开启）
3. 若开启，`context.waitUntil(enrichSubject(subjectId))` 异步执行
4. `enrichSubject` 检查 `bangumi_subjects` 表是否已有数据
5. 若无，调用 Bangumi API `/subject/{id}?responseGroup=large` 获取完整数据
6. 写入 `bangumi_subjects` 表

#### 6.3 本地备份机制
- `saveToLocalBackup` / `removeFromLocalBackup` / `getLocalBackup` — localStorage 操作
- 数据格式与后端 collections 一致（subject_id/subject_name/status/rating/comment）
- 用户设置中"标记时保存到本地"开关控制

#### 6.4 CSV 数据导出
- 格式：条目ID, 条目名称, 状态, 评分, 评论, 标记时间
- UTF-8 BOM 头（`\uFEFF`）确保 Excel 兼容
- 前端 Blob + URL.createObjectURL 下载

#### 6.5 社交模式控制
- 默认关闭（邀请制）
- 管理员可自由开关
- 普通用户通过邀请码解锁
- `SocialGuard` 组件包裹社交路由
- Dock 中社交相关图标按 socialMode 显示/隐藏

---

### Phase 7：实现检查清单

每个 Phase 完成后需验证：

- [ ] Worker 部署成功，所有 API 端点可访问
- [ ] D1 迁移全部执行
- [ ] GitHub Pages 部署成功，SPA 路由正常
- [ ] OAuth 登录流程完整（Bangumi + GitHub）
- [ ] 搜索功能正常（三优先级）
- [ ] 条目详情页完整（评分/收藏/评论/视频源）
- [ ] Dock 栏放大效果和自动隐藏正常
- [ ] 窗口系统（拖拽/调整大小/最小化/焦点）正常
- [ ] Navi AI 聊天正常
- [ ] 音乐播放器正常
- [ ] Musashi 创作者平台完整
- [ ] 社交模块（论坛/世界频道/好友/邮件/社团）正常
- [ ] 邀请制系统正常
- [ ] 主题切换正常（浅色/深色/高对比）
- [ ] NSFW 页面布局与正常页面一致
- [ ] CSV 导出正常
- [ ] 本地备份正常
- [ ] 移动端适配

---

## 四、命名约定

| 概念 | 命名 |
|------|------|
| 项目名 | ANISpace |
| 导航-百科 | 禁書目錄 |
| 导航-论坛 | 放課後 |
| 导航-新闻 | 毒电波！！ |
| 导航-创作者 | 武藏也 |
| 社团 | Tea Time！ |
| 好友空间 | LeMU |
| 世界频道 | 世界线 |
| AI 助手 | Navi |
| 邮件 | D-Mail |
| Wiki 标题 | インデックスIndex |
| 设置页标题 | 设置 |

---

## 五、禁止事项

1. **禁止用户上传视频功能**
2. **禁止在 public/404.html 中使用 JSX/模块语法**（Vite 不处理 public/ 文件）
3. **禁止将 API Key 暴露给前端**（GLM_API_KEY 仅在 Worker 中使用）
4. **禁止使用 ProfileSettings.jsx**（已被 UserProfilePage.jsx 替代，不再引用）
5. **禁止社交功能默认开启**（邀请制，默认关闭）
6. **禁止在顶部右侧显示邮箱入口**（已移除）

---

## 六、文件清单参考

### 前端组件（src/components/）
```
Layout/          → Layout.jsx, Header.jsx, DockBar.jsx, AppWindow.jsx, MinimizedBar.jsx, LoginNotificationBar.jsx
Home/            → HomeTerminal.jsx
Info/            → InfoDetail.jsx, HikarinagiDetail.jsx, FansubGroups.jsx
Video/           → VideoHome.jsx, VideoPlayer.jsx, SubjectDetail.jsx, SourceManager.jsx, MediaMatchList.jsx
Amadeus/         → Amadeus.jsx
Music/           → MusicPlayer.jsx, MiniPlayer.jsx
Forum/           → Forum.jsx, PostDetail.jsx, ForumSidebar.jsx
Wiki/            → Wiki.jsx
NewsZone/        → NewsZone.jsx, NewsDetail.jsx, NewsEditor.jsx, AnimeSchedule.jsx
Musashi/         → MusashiHome.jsx, WorkDetail.jsx, WorkCreate.jsx, WorkEdit.jsx, MyWorks.jsx,
                   NovelReader.jsx, MangaReader.jsx, WorkCard.jsx, StarRating.jsx, ReaderSettings.jsx,
                   MarkdownEditor.jsx, MangaChapterManager.jsx, ImageUploader.jsx,
                   GalgameDownloadManager.jsx, ChapterManager.jsx
Club/            → Club.jsx
Mailbox/         → Mailbox.jsx
FriendSpace/     → FriendSpace.jsx
FriendLinks/     → FriendLinks.jsx
Guestbook/       → Guestbook.jsx
WorldChannel/    → WorldChannel.jsx
Notification/    → Notifications.jsx
TouchGal/        → TouchGalApp.jsx
Profile/         → UserProfilePage.jsx, ProfileStats.jsx, ActivityHeatmap.jsx
InviteSystem/    → AdminPanel.jsx, InviteCodeForm.jsx, PermissionGuard.jsx
Common/          → AuthModal.jsx, UserAvatar.jsx, Live2DViewer.jsx, Live2DWidget.jsx,
                   CommonComponents.jsx, GlobalSearch.jsx, RichTextEditor.jsx,
                   MarkdownEditor/MarkdownEditor.jsx, EmojiPicker.jsx, FireworkEffect.jsx
```

### 前端服务（src/services/）
```
api.js                    → 核心服务层（apiRequest, CacheManager, 所有 Service 类）
storage.js                → StorageService（localStorage 封装）
BangumiSearchService.js   → Bangumi 搜索
BangumiDataService.js     → Bangumi 数据
AniListService.js         → AniList 集成
KitsuService.js           → Kitsu 集成
HikarinagiService.js      → Hikarinagi 视频源
SourceMerger.js           → 源合并
musashiApi.js             → Musashi API
media/                    → 媒体源系统（TypeScript）
  MediaSourceManager.ts, MatchEngine.ts, MediaFetcher.ts, MediaSelector.ts,
  RawTitleParser.ts, TorrentAdapter.ts, DanmakuService.ts, initSources.ts
  sources/ → MikanSource.ts, DmhySource.ts, MacCMSSource.ts, RSSSource.ts,
             SelectorSource.ts, LocalCacheSource.ts
```

### 前端上下文（src/context/）
```
AppContext.jsx       → 全局应用状态
WindowManager.jsx    → 窗口管理
MusicContext.jsx     → 音乐播放状态
```

### 前端页面（src/pages/）
```
HomePage.jsx         → 首页
OAuthCallback.jsx    → OAuth 回调
```

### 样式文件
```
src/index.css                    → 全局样式
src/styles/hikari-styles.css     → 设计系统变量
src/pages/HomePage.css           → 首页样式
src/pages/OAuthCallback.css      → OAuth 样式
src/components/Layout/           → Layout.css, Header.css, DockBar.css, AppWindow.css,
                                   MinimizedBar.css, LoginNotificationBar.css
src/components/Video/            → VideoPlayer.css, VideoHome.css, SubjectDetail.css,
                                   SourceManager.css, MediaMatchList.css
src/components/Profile/          → UserProfilePage.css, ProfileStats.css,
                                   ProfileSettings.css, ActivityHeatmap.css
src/components/WorldChannel/     → WorldChannel.css
src/components/Wiki/             → Wiki.css
src/components/FriendLinks/      → FriendLinks.css
src/components/TouchGal/         → TouchGalApp.css
src/components/Notification/     → Notifications.css
```
