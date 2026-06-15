# PRD — 武藏也（创作者平台 V2）

> ANISpace 创作者子平台。综合借鉴 **米画师**（创作者主页/约稿）、**Pixiv**（排行榜/关注流/系列）、**成为小说家吧**（连载管理/读者感想）、**鲲galgame论坛**（讨论区/多维度评分）四大平台，打造一站式 ACG 创作与交流社区。

---

## 1. 产品定位

### 1.1 一句话定位

**ACG 创作者的 Pixiv + 小说家吧 + 米画师 + 鲲的综合社区** — 覆盖插画/小说/漫画/Galgame 四大内容类型，提供排行榜发现、关注动态流、创作者主页、约稿企划、作品讨论区等完整生态。

### 1.2 核心差异化

| 维度 | 说明 |
|------|------|
| **内容类型** | 插画 + 小说 + 漫画 + Galgame，一站覆盖 ACG 创作全形态 |
| **发现机制** | 排行榜（日/周/月）+ 关注动态流 + 标签检索 + 约稿广场 |
| **创作者生态** | 米画师式主页（作品集画廊 + 统计面板 + 约稿状态） |
| **社区互动** | 鲲式讨论区（分版块）+ Pixiv 式收藏/关注 + 小说家吧式读者感想 |

### 1.3 参考平台特征映射

| 功能 | 来源 | 武藏也实现 |
|------|------|-----------|
| 插画作品投稿 | 米画师 + Pixiv | 多图投稿、标签、画廊展示 |
| 排行榜 | Pixiv | 日/周/月榜，分类型独立榜单 |
| 创作者主页 | 米画师 | 横幅 + 作品集画廊 + 统计面板 + 约稿状态 |
| 关注动态流 | Pixiv | 关注创作者 → 首页动态流 |
| 系列/合集 | Pixiv | 多作品归入同一系列，连续阅读 |
| 约稿企划 | 米画师 | 发布约稿需求 → 响应/沟通 |
| 连载管理 | 成为小说家吧 | 章节连载、类型分类、读者感想 |
| 作品讨论区 | 鲲galgame论坛 | 分版块讨论（综合/攻略/感想/资源） |

---

## 2. 内容类型

### 2.1 插画（illustration）— 新增

- **投稿方式**：上传多张作品图（最多 20 张），支持拖拽排序
- **元数据**：标题、标签、创作说明（Markdown）、是否允许 AI 训练标记
- **展示**：作品详情页支持大图轮播，广场卡片 hover 多图预览
- **版权保护**：可选开启右键禁用/水印

### 2.2 小说（novel）— 升级

**原有保留**：
- 章节式发布、沉浸式阅读器、阅读进度保存

**小说家吧式升级**：
- **类型分类体系**：異世界 / 現代ファンタジー / SF / 恋愛 / ホラー / ミステリー / その他（日式分类）
- **读者感想**：不仅"评论"，增加感想类型选择（面白い / 感動 / 驚き / 考えさせられる / 続きが気になる）
- **连载追踪**：关注后新章节发布通知
- **字数统计**：总字数 + 每章字数展示
- **阅读历史**：最近阅读的作品列表

### 2.3 漫画（manga）— 升级

**原有保留**：
- 按话上传页面图片、条漫式阅读器

**Pixiv 式升级**：
- **系列/合集**：归入系列后，详情页显示"上一部/下一部"
- **排行榜**：日榜/周榜/月榜独立漫画榜单

### 2.4 Galgame（galgame）— 升级

**原有保留**：
- 预览图轮播 + 下载链接管理

**鲲论坛式升级**：
- **多维度评分**：剧情/音乐/CG/系统/综合（5 维度独立评分）
- **作品讨论区**：每个作品自带讨论版块（综合讨论 / 攻略 / 感想 / 资源分享）
- **发售日历**：创作者的 Galgame 可标记发售日期，首页展示近期发售列表

---

## 3. 核心功能设计

### 3.1 排行榜系统（Pixiv 式）

- **榜单类型**：日榜 / 周榜 / 月榜
- **分类型独立榜单**：插画榜 / 小说榜 / 漫画榜 / Galgame 榜 / 综合榜
- **热度计算公式**：`score = views×1 + likes×3 + favorites×5 + rating_avg×10`
- **计算方式**：Worker Cron 定时任务每小时计算一次，存入 `work_rankings` 表
- **展示**：首页侧边栏 Top 10 + 独立排行榜页面（分 Tab + 日期选择器）
- **历史快照**：每日 0 点归档昨日榜单

### 3.2 创作者主页升级（米画师式）

- **顶部横幅**：自定义封面图（可替换，类似 Twitter 横幅）
- **头像 + 基本信息**：昵称、个人简介（Markdown）
- **作品集画廊**：按类型 Tab 展示（插画 / 小说 / 漫画 / Galgame）
- **统计面板**：总作品数 / 总浏览量 / 总收藏数 / 平均评分
- **约稿状态标识**："接受约稿中" / "暂不接稿"
- **入口**：作品详情页点击作者头像跳转

### 3.3 关注 + 动态流（Pixiv 式）

- **关注机制**：复用现有 `user_follows` 表
- **动态流**：首页"关注"Tab + 独立 `/musashi/feed` 页面
- **动态内容**：新作发布、章节更新
- **缓存**：`user_feed` 表缓存动态，避免实时聚合
- **通知推送**：关注创作者发布新作时通过 Notification 系统推送

### 3.4 系列/合集（Pixiv 式）

- **创建系列**：创作者可将多篇作品归入同一系列
- **系列展示**：独立的系列详情页（封面 + 简介 + 作品列表按序排列）
- **系列导航**：作品详情页显示系列信息 + "上一部/下一部"
- **关联**：`works.series_id` 一对多，（未来支持一个作品属于多个合集时用 `series_works` 关联表）

### 3.5 约稿企划（米画师式）

- **企划发布**：标题、描述、预算范围（min-max）、截止日期、参考图（最多 5 张）、约稿类型
- **企划广场**：`/musashi/commissions` — 浏览所有公开企划，支持筛选（类型/预算/状态）
- **响应企划**：感兴趣的用户可提交响应（留言 + 作品集链接）
- **沟通**：企划发布者可在"我的企划"中查看响应列表，通过现有邮件/私信系统进一步沟通
- **状态**：open（募集中）/ closed（已关闭）/ completed（已完成）

### 3.6 作品讨论区（鲲式）

- **每个作品自带讨论区**：作品详情页增加"讨论"Tab
- **版块分类**：综合讨论 / 攻略 / 感想 / 资源分享
- **技术实现**：复用放課後（Forum）的 `posts` + `replies` 表，通过 `work_id` 外键 + `discussion_category` 字段区分
- **与放課後的差异**：作品讨论区的帖子不出现在放課後全局列表中（作用域隔离）

### 3.7 多维度评分（鲲式，Galgame 专有）

- **评分维度**：（仅 Galgame 类型）剧情 / 音乐 / CG / 系统 / 综合
- **UI**：Galgame 详情页展示五维度蜘蛛图 + 各维度平均分
- **存储**：`work_ratings` 表新增 `dimension_scores` JSON 字段存储多维度评分

### 3.8 UI 整体升级

- **字体**：日式风格字体（Zen Kaku Gothic New / Klee One / M PLUS Rounded 1c）
- **色彩**：延续现有萌系粉色主色调（`#ff6b9d`），柔和渐变背景
- **作品卡片**：瀑布流布局，hover 显示多图预览（插画）/ 简介摘要（小说）
- **标签系统**：标签点击跳转搜索
- **按钮统一**：Header 操作按钮（排行榜/约稿广场/发布作品）大小一致

---

## 4. 数据库设计

### 4.1 修改现有表

#### works 表修改

```sql
-- type CHECK 扩展
ALTER TABLE works DROP CONSTRAINT ... ; -- D1 不支持 DROP CONSTRAINT
-- 实际通过迁移脚本重建表或使用新的 CHECK
type TEXT NOT NULL CHECK(type IN ('illustration','novel','manga','galgame'))

-- 新增列
ALTER TABLE works ADD COLUMN series_id INTEGER REFERENCES work_series(id);
ALTER TABLE works ADD COLUMN illustration_count INTEGER DEFAULT 0;
ALTER TABLE works ADD COLUMN ai_allowed INTEGER DEFAULT 1;  -- AI 训练许可
```

#### users 表修改

```sql
ALTER TABLE users ADD COLUMN commission_status TEXT DEFAULT 'closed';  -- open/closed
ALTER TABLE users ADD COLUMN bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN banner_image TEXT DEFAULT '';
```

#### posts 表修改（复用为作品讨论区）

```sql
ALTER TABLE posts ADD COLUMN work_id INTEGER REFERENCES works(id);
ALTER TABLE posts ADD COLUMN discussion_category TEXT;
-- CHECK(work_id IS NULL AND discussion_category IS NULL OR work_id IS NOT NULL)
```

### 4.2 新增表

```sql
-- 插画多图
CREATE TABLE illustration_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  caption TEXT DEFAULT '',
  width INTEGER,
  height INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_illustration_work ON illustration_images(work_id, sort_order);

-- 排行榜缓存
CREATE TABLE work_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  rank_type TEXT NOT NULL CHECK(rank_type IN ('daily','weekly','monthly')),
  category TEXT NOT NULL CHECK(category IN ('illustration','novel','manga','galgame','all')),
  rank_position INTEGER NOT NULL,
  score REAL NOT NULL,
  calculated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_work_rankings_lookup ON work_rankings(rank_type, category, calculated_at);

-- 系列
CREATE TABLE work_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_series_creator ON work_series(creator_id);

-- 系列-作品关联（多对多，预留）
CREATE TABLE series_works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL REFERENCES work_series(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  sort_order INTEGER DEFAULT 0,
  UNIQUE(series_id, work_id)
);

-- 约稿企划
CREATE TABLE commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  commission_type TEXT DEFAULT 'illustration',
  budget_min REAL,
  budget_max REAL,
  deadline TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','completed')),
  reference_images TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_commissions_status ON commissions(status, created_at DESC);

-- 约稿响应
CREATE TABLE commission_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commission_id INTEGER NOT NULL REFERENCES commissions(id),
  responder_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  portfolio_links TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_comm_responses_comm ON commission_responses(commission_id);

-- 动态流缓存
CREATE TABLE user_feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  creator_id INTEGER NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('new_work','new_chapter')),
  created_at TEXT DEFAULT (datetime('now')),
  is_read INTEGER DEFAULT 0
);
CREATE INDEX idx_user_feed_user ON user_feed(user_id, created_at DESC);

-- 读者感想（小说家吧式）
CREATE TABLE reader_impressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  impression_type TEXT NOT NULL CHECK(impression_type IN ('interesting','moved','surprised','thoughtful','eager')),
  content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);
```

---

## 5. API 设计

### 5.1 新增 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| **排行榜** |||
| GET | `/api/works/rankings?type=daily&category=illustration` | 排行榜数据 | 无 |
| **系列** |||
| POST | `/api/series` | 创建系列 | 必须 |
| GET | `/api/series/:id` | 系列详情 | 无 |
| PUT/DELETE | `/api/series/:id` | 更新/删除系列 | 创作者 |
| POST | `/api/series/:id/works` | 添加作品到系列 | 创作者 |
| DELETE | `/api/series/:id/works/:workId` | 移除作品 | 创作者 |
| **关注流** |||
| GET | `/api/feed?page=&limit=` | 关注动态流 | 必须 |
| **创作者主页** |||
| GET | `/api/users/:id/portfolio` | 作品集+统计 | 无 |
| **约稿** |||
| GET | `/api/commissions?status=open&type=` | 约稿广场 | 无 |
| GET | `/api/commissions/:id` | 约稿详情 | 无 |
| POST | `/api/commissions` | 发布约稿 | 必须 |
| PUT/DELETE | `/api/commissions/:id` | 更新/删除 | 发布者 |
| POST | `/api/commissions/:id/respond` | 响应约稿 | 必须 |
| **插画图片** |||
| POST | `/api/works/:id/illustrations` | 上传插画 | 创作者 |
| DELETE | `/api/works/:id/illustrations/:iid` | 删除插画 | 创作者 |
| PUT | `/api/works/:id/illustrations/reorder` | 排序 | 创作者 |
| **读者感想** |||
| POST | `/api/works/:id/impression` | 提交感想 | 必须 |
| GET | `/api/works/:id/impressions` | 感想统计 | 无 |
| **作品讨论区** |||
| GET | `/api/works/:id/discussions?category=` | 讨论列表 | 无 |
| POST | `/api/works/:id/discussions` | 发帖（复用 Forum API） | 必须 |

### 5.2 修改现有 API

- `GET /api/works` 新增参数 `?category=illustration&series_id=`
- `GET /api/works/:id` 插画类型返回 `illustrations` 数组
- `POST /api/works` 接受 `type=illustration` + `illustrations` 数组
- `POST /api/works` 发布新作时自动写入 `user_feed`（关注者动态流）

### 5.3 Cron 定时任务

| 任务 | 频率 | 说明 |
|------|------|------|
| 排行榜计算 | 每小时 | 计算各类型热度，写入 `work_rankings` |
| 榜单归档 | 每日 0 点 | 归档昨日日榜快照 |

---

## 6. 路由设计

| 路径 | 组件 | 说明 |
|------|------|------|
| `/musashi` | `MusashiHome` | 作品广场（四大 Tab + 排行榜侧边栏） |
| `/musashi/rankings` | `RankingsPage` | 排行榜页面（分类型 + 日/周/月） |
| `/musashi/commissions` | `CommissionSquare` | 约稿广场 |
| `/musashi/commissions/:id` | `CommissionDetail` | 约稿详情 |
| `/musashi/feed` | `FollowingFeed` | 关注动态流 |
| `/musashi/series/:id` | `SeriesPage` | 系列详情页 |
| `/musashi/creator/:userId` | `CreatorProfile` | 创作者主页 |
| `/musashi/new` | `WorkCreate` | 创建作品（新增插画类型） |
| `/musashi/:workId` | `WorkDetail` | 作品详情（新增讨论区 Tab） |
| `/musashi/:workId/edit` | `WorkEdit` | 编辑作品 |
| `/musashi/:workId/read` | `NovelReader` | 小说阅读器 |
| `/musashi/:workId/read/:chapter` | `NovelReader` | 指定章节 |
| `/musashi/:workId/comic` | `MangaReader` | 漫画阅读器 |
| `/musashi/:workId/comic/:chapter` | `MangaReader` | 指定话数 |
| `/musashi/my` | `MyWorks` | 我的作品管理 |

---

## 7. 前端组件架构

```
src/components/Musashi/
├── MusashiHome.jsx/.css          # 作品广场（已有，需改造）
├── WorkCard.jsx/.css             # 作品卡片（已有，需改造：新增插画类型 + 评分显示）
├── WorkCreate.jsx/.css           # 创建作品（已有，需改造：新增插画类型）
├── WorkDetail.jsx/.css           # 作品详情（已有，需改造：讨论区Tab + 插画展示）
├── WorkEdit.jsx/.css             # 编辑作品（已有，需改造）
├── NovelReader.jsx/.css          # 小说阅读器（已有）
├── MangaReader.jsx/.css          # 漫画阅读器（已有）
├── MyWorks.jsx/.css              # 我的作品（已有）
├── ChapterManager.jsx            # 章节管理（已有）
├── MangaChapterManager.jsx       # 话数管理（已有）
├── GalgameDownloadManager.jsx    # 下载管理（已有）
├── MarkdownEditor.jsx/.css       # Markdown编辑器（已有）
├── ImageUploader.jsx/.css        # 图片上传（已有）
├── StarRating.jsx/.css           # 星级评分（已有）
├── ReaderSettings.jsx/.css       # 阅读设置（已有）
│
│   # ── 新增组件 ──
├── RankingsPage.jsx/.css         # 排行榜页面
├── CommissionSquare.jsx/.css     # 约稿广场
├── CommissionDetail.jsx/.css     # 约稿详情
├── SeriesPage.jsx/.css           # 系列详情页
├── CreatorProfile.jsx/.css       # 创作者主页
├── FollowingFeed.jsx/.css        # 关注动态流
├── WorkDiscussion.jsx/.css       # 作品讨论区
├── IllustrationUploader.jsx/.css # 多图上传（插画专用）
├── ImpressionPicker.jsx/.css     # 读者感想选择器
└── DimensionRating.jsx/.css      # 多维度评分（Galgame）
```

---

## 8. UI 设计规范

### 8.1 字体

| 用途 | 字体 | 备选 |
|------|------|------|
| 标题/展示 | Klee One | M PLUS Rounded 1c |
| 正文 | Zen Kaku Gothic New | M PLUS Rounded 1c |

### 8.2 色彩（延续现有萌系粉色）

| 变量 | 值 | 用途 |
|------|-----|------|
| `--primary` | `#ff6b9d` | 主色调 |
| `--primary-light` | `#ff8db5` | 浅主色 |
| `--primary-bg` | `#fff0f5` | 主色背景 |
| `--bg` | `#faf8f9` | 页面背景 |
| `--bg-card` | `#ffffff` | 卡片背景 |

### 8.3 按钮规范

- Header 操作按钮（排行榜/约稿广场/发布作品）统一大小：`padding: 10px 20px`，`border-radius: 24px`
- 发布作品按钮：实心粉色渐变
- 排行榜/约稿广场：白底粉色边框

---

## 9. 与 ANISpace 现有功能联动

| 联动点 | 说明 |
|--------|------|
| Header | 武藏也导航项更新入口（排行榜 + 约稿广场快捷入口） |
| DockBar | 武藏也应用图标（已有） |
| 放課後 | 作品讨论区复用 Forum 的 posts/replies 表 |
| 邮件/私信 | 约稿响应沟通 |
| 通知系统 | 新作发布 → 粉丝通知、约稿响应通知、关注动态 |
| 用户关注 | 武藏也与放課後/LeMU 共享 `user_follows` 表 |

---

## 10. 非功能性需求

| 需求 | 目标 |
|------|------|
| 排行榜计算 | Cron 异步计算，不阻塞 API 响应 |
| 图片加载 | 广场卡片缩略图 + 详情页原图懒加载 |
| 动态流性能 | `user_feed` 缓存表预写入，列表查询 < 100ms |
| 日式字体 | Google Fonts CDN 加载，fallback 到系统字体 |
| 响应式 | 广场卡片 2 列（手机）/ 4 列（平板）/ 6 列（桌面） |

---

## 11. 实施阶段

### Phase 1 — 基础设施 + 插画类型
**数据库**: 迁移脚本、新增表、修改现有表
**后端**: 插画 CRUD API、排行榜计算 Cron、排行榜 API
**前端**: 插画创作/详情、广场四 Tab 改造、Waterfall 布局
**验证**: 插画全流程（创建 → 广场展示 → 详情浏览）

### Phase 2 — 排行榜 + 创作者主页
**后端**: 排行榜归档 Cron、创作者主页数据 API、关注流缓存写入
**前端**: RankingsPage、CreatorProfile（作品集画廊 + 统计面板）
**验证**: 排行榜数据正确、创作者主页展示完整

### Phase 3 — 关注流 + 系列/合集
**后端**: 关注 API、动态流 API、系列 CRUD API
**前端**: FollowingFeed、SeriesPage、通知扩展、作品详情系列导航
**验证**: 关注 → 新作发布 → 动态流显示 → 通知推送

### Phase 4 — 约稿企划 + 作品讨论区
**后端**: 约稿 CRUD API、响应 API、讨论区 API
**前端**: CommissionSquare、CommissionDetail、WorkDiscussion Tab
**验证**: 约稿全流程（发布 → 响应 → 沟通）、讨论区正常

### Phase 5 — UI 打磨 + 多维度评分
**前端**: 日式字体应用、瀑布动画、hover 预览、DimensionRating
**验证**: 全平台 UI 一致性、性能优化

---

## 12. 迁移脚本命名

```
worker/migrations/
├── v016_musashi_v2.sql    # Phase 1: 所有新增表 + 现有表修改
```

---

*本文档版本：V2，最后更新：2026-06-14*
*取代原有 PRD-Musashi.md*