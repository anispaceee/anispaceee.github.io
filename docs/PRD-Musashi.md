# PRD — 武藏也（创作者平台）

> ANISpace 创作者子平台，供用户发布和体验 Galgame、小说、连载漫画等 ACG 原创内容。

---

## 1. 产品概述

### 1.1 定位

**发布与体验平台** — 创作者发布原创 ACG 内容（Galgame / 小说 / 漫画），用户在线阅读/浏览/下载，重点在"读"和"玩"的体验。

### 1.2 命名

**武藏也** — 沿用 ANISpace 世界观命名体系（放課後、Tea Time！、禁書目錄、D-Mail、LeMU）。

### 1.3 核心价值

- 为 ACG 创作者提供一个有归属感的发布渠道
- 为用户提供沉浸式的阅读/浏览体验
- 与 ANISpace 社区（放課後、好友空间等）深度联动

### 1.4 参考项目

| 项目 | Stars | 参考价值 |
|------|-------|---------|
| [WebGAL](https://github.com/OpenWebGAL/WebGAL) | 3.8k | Web 端视觉小说引擎 + 图形化编辑器，Galgame 在线运行参考 |
| [Ren'Py](https://github.com/renpy/renpy) | 6.5k | 成熟 VN 功能设计标准（脚本语言、资源管理、发布打包） |
| [Kavita](https://github.com/Kareadita/Kavita) | 10.9k | Web 阅读器 UI/UX（沉浸式阅读、进度同步、书架管理） |
| [Komga](https://github.com/gotson/komga) | 6.3k | 条漫模式阅读器 + 元数据管理 |
| [novel-plus](https://github.com/201206030/novel-plus) | 4.6k | 完整小说 CMS + 作家专区 + 充值订阅 |
| [Suwayomi-Server](https://github.com/Suwayomi/Suwayomi-Server) | 7.1k | 漫画聚合阅读 + 扩展源/插件市场机制 |
| [Misskey](https://github.com/misskey-dev/misskey) | 11.2k | 图库/Drive/频道 + ACG 社区联邦协议 |
| [Pixelfed](https://github.com/pixelfed/pixelfed) | 7.0k | 创作者主页 + 标签系统 + 图片展示 |

---

## 2. 内容类型

### 2.1 Galgame（视觉小说）

- **发布方式**：创作者上传预览图（截图/CG）+ 下载链接（按平台分类）
- **不支持**在线游玩（第一期）
- **预览**：轮播展示预览图，类似 itch.io 的作品页
- **下载**：按平台（Windows/Mac/Linux/Android）分组展示下载链接，可选填解压密码
- **未来扩展**：集成 [WebGAL](https://github.com/OpenWebGAL/WebGAL) 引擎支持在线运行

### 2.2 小说（轻小说/原创小说）

- **发布方式**：章节式发布，Markdown 编辑器撰写正文
- **阅读体验**：沉浸式阅读器（参考 [Kavita](https://github.com/Kareadita/Kavita) / [Novelia](https://n.novelia.cc/)）
  - 左侧可折叠章节目录
  - 正文区 Markdown 渲染，支持插图
  - 底部上一章/下一章 + 进度条
  - 设置面板：字号/行距/夜间模式/主题色
  - 阅读进度自动保存
  - 键盘快捷键：← → 翻章，Esc 退出沉浸模式
- **状态**：连载中 / 已完结 / 搁置

### 2.3 漫画（连载漫画/短篇漫画）

- **发布方式**：按"话"上传页面图片，支持批量上传和拖拽排序
- **阅读体验**：条漫式阅读器（参考 [Komga](https://github.com/gotson/komga) 条漫模式）
  - 图片纵向排列，自然滚动
  - 话数切换
  - 设置面板：图片宽度/夜间模式
  - 阅读进度自动保存
- **状态**：连载中 / 已完结 / 搁置

---

## 3. 用户角色与权限

### 3.1 角色

| 角色 | 说明 |
|------|------|
| 游客 | 浏览作品广场、查看作品详情、阅读免费内容 |
| 登录用户 | 游客能力 + 收藏/点赞/评论/举报、管理阅读进度 |
| 创作者 | 登录用户能力 + 发布/编辑/删除自己的作品 |
| 管理员 | 全部能力 + 下架违规作品、处理举报 |

### 3.2 创作者资格

- 所有登录用户自动成为创作者（无需额外申请）
- 创作者可发布任意类型的作品

---

## 4. 功能需求

### 4.1 作品广场（MusashiHome）

**P0 — 必须实现**

- 类型切换 Tab：全部 / Galgame / 小说 / 漫画
- 排序：最新 / 最热 / 评分最高
- 搜索：标题/标签关键词搜索
- 瀑布流卡片展示：封面 + 标题 + 类型标签 + 作者 + 评分 + 状态标签
- 分页加载

**P1 — 延后实现**

- 标签云导航
- 编辑推荐位
- 每周精选

### 4.2 作品详情（WorkDetail）

**P0 — 必须实现**

- 通用区：封面大图 + 标题 + 作者信息 + 标签 + 简介 + 评分 + 收藏按钮 + 浏览量
- Galgame 特有：预览图轮播 + 下载链接列表（按平台分组）+ 解压密码展示
- 小说特有：章节目录 + "开始阅读"按钮 + 总字数 + 章节数
- 漫画特有：话数列表 + "开始阅读"按钮 + 总页数
- 评论区：复用现有评论组件
- 举报按钮

**P1 — 延后实现**

- 相关推荐（同标签作品）
- 作者其他作品
- 分享到放課後

### 4.3 小说阅读器（NovelReader）

**P0 — 必须实现**

- 全屏沉浸模式（隐藏 Header 和 DockBar）
- 左侧可折叠章节目录（高亮当前章节）
- 正文 Markdown 渲染（支持插图、粗体、斜体、引用、代码块）
- 底部导航：上一章 / 下一章 + 进度条
- 设置面板：字号（14-24px）/ 行距（1.5-2.5）/ 夜间模式 / 主题色
- 阅读进度自动保存（章节 + 滚动位置）
- 键盘快捷键：← → 翻章，Esc 退出

**P1 — 延后实现**

- 书签功能
- 划线/笔记
- 目录搜索
- 阅读时间统计

### 4.4 漫画阅读器（MangaReader）

**P0 — 必须实现**

- 全屏沉浸模式
- 图片纵向排列，自然滚动（条漫式）
- 话数切换（底部/顶部导航）
- 设置面板：图片宽度（自适应/原始）/ 夜间模式
- 阅读进度自动保存（话数 + 滚动位置）

**P1 — 延后实现**

- 单页翻页模式
- 双页模式
- 左右阅读方向切换

### 4.5 作品创建与编辑

**P0 — 必须实现**

- 创建流程：选择类型 → 填写基础信息（标题/简介/封面/标签/状态）→ 类型特有内容
- Galgame：上传预览图（最多 20 张，拖拽排序）+ 添加下载链接（平台/版本/URL/密码）
- 小说：章节管理 → 添加章节 → Markdown 编辑器写正文 → 章节排序
- 漫画：话数管理 → 添加话 → 上传页面图片（批量上传，拖拽排序）
- 可见性选择：公开 / 不列出 / 私密
- 编辑已有作品的基础信息和内容

**P1 — 延后实现**

- 封面图裁剪
- Markdown 实时预览
- 章节定时发布
- 批量导入（EPUB/CBZ）

### 4.6 我的作品管理（MyWorks）

**P0 — 必须实现**

- 作品列表：封面 + 标题 + 类型 + 状态 + 浏览/收藏/点赞数
- 快捷操作：编辑 / 删除 / 切换可见性
- 数据概览：总浏览量 / 总收藏数 / 总点赞数

**P1 — 延后实现**

- 详细数据分析（浏览趋势图、读者画像）
- 读者留言管理

### 4.7 阅读进度

**P0 — 必须实现**

- 自动保存阅读位置（章节 + 滚动位置/页码）
- 作品详情页显示"继续阅读"按钮（有进度时）
- 我的主页显示"最近阅读"列表

---

## 5. 数据模型

### 5.1 核心表

#### works（作品表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 作品 ID |
| author_id | INTEGER | FK → users.id, NOT NULL | 创作者 |
| type | TEXT | NOT NULL, CHECK IN ('galgame','novel','manga') | 作品类型 |
| title | TEXT | NOT NULL | 标题 |
| description | TEXT | DEFAULT '' | 简介 |
| cover_image | TEXT | DEFAULT '' | 封面图 URL |
| tags | TEXT | DEFAULT '[]' | 标签 JSON 数组 |
| status | TEXT | DEFAULT 'ongoing', CHECK IN ('ongoing','completed','hiatus') | 状态 |
| visibility | TEXT | DEFAULT 'public', CHECK IN ('public','unlisted','private') | 可见性 |
| is_paid | INTEGER | DEFAULT 0 | 是否付费（预留） |
| price | INTEGER | DEFAULT 0 | 价格（预留） |
| likes_count | INTEGER | DEFAULT 0 | 点赞数 |
| views_count | INTEGER | DEFAULT 0 | 浏览数 |
| comments_count | INTEGER | DEFAULT 0 | 评论数 |
| is_flagged | INTEGER | DEFAULT 0 | 是否被举报 |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |
| updated_at | TEXT | DEFAULT (datetime('now')) | 更新时间 |

**索引**：
- `idx_works_type` ON (type)
- `idx_works_author` ON (author_id)
- `idx_works_status` ON (status)
- `idx_works_created` ON (created_at DESC)
- `idx_works_views` ON (views_count DESC)
- `idx_works_likes` ON (likes_count DESC)

#### novel_chapters（小说章节表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 章节 ID |
| work_id | INTEGER | FK → works.id, NOT NULL | 所属作品 |
| chapter_number | INTEGER | NOT NULL | 章节序号 |
| title | TEXT | NOT NULL | 章节标题 |
| content | TEXT | DEFAULT '' | 正文（Markdown） |
| word_count | INTEGER | DEFAULT 0 | 字数 |
| is_paid | INTEGER | DEFAULT 0 | 是否付费章节（预留） |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |
| updated_at | TEXT | DEFAULT (datetime('now')) | 更新时间 |

**索引**：
- `idx_novel_chapters_work` ON (work_id, chapter_number)
- UNIQUE (work_id, chapter_number)

#### manga_chapters（漫画话数表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 话 ID |
| work_id | INTEGER | FK → works.id, NOT NULL | 所属作品 |
| chapter_number | INTEGER | NOT NULL | 话数序号 |
| title | TEXT | DEFAULT '' | 话标题 |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |

**索引**：
- `idx_manga_chapters_work` ON (work_id, chapter_number)
- UNIQUE (work_id, chapter_number)

#### manga_pages（漫画页面表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 页面 ID |
| chapter_id | INTEGER | FK → manga_chapters.id, NOT NULL | 所属话 |
| page_number | INTEGER | NOT NULL | 页码 |
| image_url | TEXT | NOT NULL | 图片 URL |
| alt_text | TEXT | DEFAULT '' | 图片描述（无障碍） |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |

**索引**：
- `idx_manga_pages_chapter` ON (chapter_id, page_number)
- UNIQUE (chapter_id, page_number)

#### galgame_downloads（Galgame 下载表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 下载 ID |
| work_id | INTEGER | FK → works.id, NOT NULL | 所属作品 |
| platform | TEXT | NOT NULL, CHECK IN ('windows','mac','linux','android') | 平台 |
| version | TEXT | DEFAULT '' | 版本号 |
| download_url | TEXT | NOT NULL | 下载链接 |
| file_size | TEXT | DEFAULT '' | 文件大小 |
| password | TEXT | DEFAULT '' | 解压密码 |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |

**索引**：
- `idx_galgame_downloads_work` ON (work_id)

#### galgame_previews（Galgame 预览图表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 预览 ID |
| work_id | INTEGER | FK → works.id, NOT NULL | 所属作品 |
| image_url | TEXT | NOT NULL | 图片 URL |
| sort_order | INTEGER | DEFAULT 0 | 排序 |
| caption | TEXT | DEFAULT '' | 图片说明 |

**索引**：
- `idx_galgame_previews_work` ON (work_id, sort_order)

#### work_comments（作品评论表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 评论 ID |
| work_id | INTEGER | FK → works.id, NOT NULL | 所属作品 |
| author_id | INTEGER | FK → users.id, NOT NULL | 评论者 |
| content | TEXT | NOT NULL | 评论内容 |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |

**索引**：
- `idx_work_comments_work` ON (work_id, created_at DESC)

#### work_favorites（作品收藏表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 收藏 ID |
| user_id | INTEGER | FK → users.id, NOT NULL | 用户 |
| work_id | INTEGER | FK → works.id, NOT NULL | 作品 |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |

**索引**：
- UNIQUE (user_id, work_id)
- `idx_work_favorites_user` ON (user_id)

#### work_likes（作品点赞表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 点赞 ID |
| user_id | INTEGER | FK → users.id, NOT NULL | 用户 |
| work_id | INTEGER | FK → works.id, NOT NULL | 作品 |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |

**索引**：
- UNIQUE (user_id, work_id)

#### reading_progress（阅读进度表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 进度 ID |
| user_id | INTEGER | FK → users.id, NOT NULL | 用户 |
| work_id | INTEGER | FK → works.id, NOT NULL | 作品 |
| chapter_number | INTEGER | DEFAULT 1 | 当前章节/话数 |
| scroll_position | REAL | DEFAULT 0 | 滚动位置（小说用） |
| updated_at | TEXT | DEFAULT (datetime('now')) | 更新时间 |

**索引**：
- UNIQUE (user_id, work_id)

#### work_reports（作品举报表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | 举报 ID |
| reporter_id | INTEGER | FK → users.id, NOT NULL | 举报人 |
| work_id | INTEGER | FK → works.id, NOT NULL | 被举报作品 |
| reason | TEXT | NOT NULL | 举报原因 |
| status | TEXT | DEFAULT 'pending', CHECK IN ('pending','resolved','dismissed') | 处理状态 |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |

**索引**：
- `idx_work_reports_status` ON (status)

---

## 6. API 设计

### 6.1 作品 CRUD

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/works` | 作品列表（?type=&sort=&page=&limit=&search=） | 无 |
| GET | `/api/works/:id` | 作品详情（含类型特有数据） | 无 |
| POST | `/api/works` | 创建作品 | 必须 |
| PUT | `/api/works/:id` | 更新作品基础信息 | 创作者本人 |
| DELETE | `/api/works/:id` | 删除作品 | 创作者本人/管理员 |

### 6.2 互动

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/works/:id/like` | 点赞/取消点赞 | 必须 |
| POST | `/api/works/:id/favorite` | 收藏/取消收藏 | 必须 |
| GET | `/api/works/:id/comments` | 评论列表 | 无 |
| POST | `/api/works/:id/comments` | 发表评论 | 必须 |
| POST | `/api/works/:id/view` | 记录浏览 | 无 |
| POST | `/api/works/:id/report` | 举报作品 | 必须 |

### 6.3 小说章节

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/works/:id/chapters` | 章节列表 | 无 |
| GET | `/api/works/:id/chapters/:cid` | 章节详情（含正文） | 无 |
| POST | `/api/works/:id/chapters` | 添加章节 | 创作者本人 |
| PUT | `/api/works/:id/chapters/:cid` | 更新章节 | 创作者本人 |
| DELETE | `/api/works/:id/chapters/:cid` | 删除章节 | 创作者本人 |
| PUT | `/api/works/:id/chapters/reorder` | 章节排序 | 创作者本人 |

### 6.4 漫画话数与页面

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/works/:id/manga-chapters` | 话数列表（含页面） | 无 |
| POST | `/api/works/:id/manga-chapters` | 添加话 | 创作者本人 |
| PUT | `/api/works/:id/manga-chapters/:cid` | 更新话 | 创作者本人 |
| DELETE | `/api/works/:id/manga-chapters/:cid` | 删除话 | 创作者本人 |
| POST | `/api/works/:id/manga-chapters/:cid/pages` | 上传页面图片 | 创作者本人 |
| DELETE | `/api/works/:id/manga-pages/:pid` | 删除页面 | 创作者本人 |
| PUT | `/api/works/:id/manga-chapters/reorder` | 话数排序 | 创作者本人 |

### 6.5 Galgame 下载与预览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/works/:id/downloads` | 添加下载链接 | 创作者本人 |
| PUT | `/api/works/:id/downloads/:did` | 更新下载链接 | 创作者本人 |
| DELETE | `/api/works/:id/downloads/:did` | 删除下载链接 | 创作者本人 |
| POST | `/api/works/:id/previews` | 上传预览图 | 创作者本人 |
| DELETE | `/api/works/:id/previews/:pid` | 删除预览图 | 创作者本人 |

### 6.6 阅读进度

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/reading-progress` | 用户所有阅读进度 | 必须 |
| GET | `/api/reading-progress/:workId` | 单作品阅读进度 | 必须 |
| PUT | `/api/reading-progress/:workId` | 更新阅读进度 | 必须 |

### 6.7 我的作品

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/works/my` | 我的作品列表 | 必须 |

---

## 7. 路由设计

| 路径 | 组件 | 说明 |
|------|------|------|
| `/musashi` | `MusashiHome` | 作品广场首页 |
| `/musashi/new` | `WorkCreate` | 创建新作品 |
| `/musashi/:workId` | `WorkDetail` | 作品详情页 |
| `/musashi/:workId/edit` | `WorkEdit` | 编辑作品 |
| `/musashi/:workId/read` | `NovelReader` | 小说阅读器 |
| `/musashi/:workId/read/:chapter` | `NovelReader` | 指定章节阅读 |
| `/musashi/:workId/comic` | `MangaReader` | 漫画阅读器 |
| `/musashi/:workId/comic/:chapter` | `MangaReader` | 指定话数阅读 |
| `/musashi/my` | `MyWorks` | 我的作品管理 |

---

## 8. 前端组件架构

```
src/components/Musashi/
├── MusashiHome.jsx           # 作品广场首页
├── MusashiHome.css
├── WorkCreate.jsx            # 创建作品（类型选择 + 基础信息表单）
├── WorkCreate.css
├── WorkDetail.jsx            # 作品详情（根据 type 渲染不同内容）
├── WorkDetail.css
├── WorkEdit.jsx              # 编辑作品
├── ChapterManager.jsx        # 章节管理（小说）
├── MangaChapterManager.jsx   # 话数管理（漫画）
├── GalgameDownloadManager.jsx # 下载链接管理（Galgame）
├── NovelReader.jsx           # 沉浸式小说阅读器
├── NovelReader.css
├── MangaReader.jsx           # 条漫式漫画阅读器
├── MangaReader.css
├── MyWorks.jsx               # 我的作品管理
├── MyWorks.css
├── WorkCard.jsx              # 作品卡片组件（广场用）
├── WorkCard.css
├── ReaderSettings.jsx        # 阅读器设置面板（共用）
└── ReaderSettings.css
```

---

## 9. 图片存储方案

沿用现有 ImgBB 代理模式（Worker `/api/uploads` → ImgBB API）。

**限制**：
- 单张图片大小：5MB
- 单部漫画每话页数：200 页
- Galgame 预览图：最多 20 张
- 封面图：1 张

**漫画图片优化**：
- 使用 Worker 代理缓存，减少 ImgBB 配额消耗
- 图片懒加载（Intersection Observer）
- 缩略图用于卡片展示，原图用于阅读器

---

## 10. 内容审核策略

**先发后审**：
1. 作品发布后立即公开可见
2. 用户可举报违规作品（选择原因：色情/暴力/侵权/其他）
3. 管理员在后台查看举报列表，可下架违规作品（设置 `is_flagged = 1`）
4. 被下架作品对普通用户不可见，创作者可在"我的作品"中看到标记

---

## 11. 付费能力预留

第一期不实现付费功能，但数据模型预留以下字段：

- `works.is_paid` — 是否为付费作品
- `works.price` — 价格（虚拟币单位）
- `novel_chapters.is_paid` — 是否为付费章节

后续实现时需要：
- 虚拟币充值系统
- 购买记录表
- 创作者收益提现
- 平台抽成机制

---

## 12. 与 ANISpace 现有功能联动

| 联动点 | 说明 |
|--------|------|
| 导航栏 | Header 添加"武藏也"导航项 |
| DockBar | 已登录用户显示快速发布按钮 |
| 放課後 | 作品发布自动生成帖子到放課後（P1） |
| 好友空间 | 好友发布新作时推送通知 |
| 用户主页 | 展示用户创作的作品列表 |
| 通知 | 收到评论/收藏/点赞时推送通知 |
| 全局搜索 | 搜索结果包含武藏也作品 |

---

## 13. 非功能性需求

| 需求 | 目标 |
|------|------|
| 阅读器性能 | 小说正文渲染 < 100ms，漫画图片懒加载无卡顿 |
| 图片加载 | 首屏图片 < 2s，后续图片预加载 |
| SEO | 作品详情页可被搜索引擎索引（SSR 暂不实现，靠 meta 标签） |
| 无障碍 | 阅读器支持键盘导航，漫画页面有 alt_text |
| 响应式 | 阅读器适配桌面和移动端 |
| 数据安全 | 创作者只能编辑/删除自己的作品 |

---

## 14. 里程碑

### Phase 1 — MVP（第一期）

- [ ] 数据库建表 + Worker API 实现
- [ ] 作品广场（列表/搜索/排序）
- [ ] 作品创建（三种类型）
- [ ] 作品详情页
- [ ] 小说沉浸式阅读器
- [ ] 漫画条漫式阅读器
- [ ] 阅读进度保存
- [ ] 收藏/点赞/评论
- [ ] 我的作品管理
- [ ] 导航栏集成

### Phase 2 — 增强（第二期）

- [ ] 举报与审核后台
- [ ] 编辑推荐位
- [ ] 标签云导航
- [ ] 阅读器增强（书签/笔记）
- [ ] 作品发布自动同步到放課後
- [ ] 用户主页展示创作作品
- [ ] 全局搜索集成

### Phase 3 — 商业化（第三期）

- [ ] 付费作品/付费章节
- [ ] 虚拟币系统
- [ ] 创作者收益
- [ ] WebGAL 集成（Galgame 在线运行）

---

*本文档最后更新：2026-06-12*
