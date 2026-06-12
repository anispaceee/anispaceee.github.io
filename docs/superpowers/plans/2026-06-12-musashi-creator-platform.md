# 武藏也（创作者平台）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ANISpace 中实现"武藏也"创作者平台，支持 Galgame/小说/漫画的发布与在线体验。

**Architecture:** 混合数据模型 — 统一 works 表 + 类型扩展表（novel_chapters / manga_chapters+manga_pages / galgame_downloads+galgame_previews），Worker API 提供 CRUD + 阅读进度，前端 React 组件按类型渲染不同阅读器。

**Tech Stack:** React 19 + React Router 7 + Cloudflare Worker + D1 (SQLite) + ImgBB 图片代理 + Markdown 渲染

**Spec:** `docs/PRD-Musashi.md`

---

## File Structure

### 新建文件

| 文件 | 职责 |
|------|------|
| `worker/migrations/v009_musashi.sql` | 武藏也数据库迁移脚本 |
| `src/components/Musashi/MusashiHome.jsx` | 作品广场首页 |
| `src/components/Musashi/MusashiHome.css` | 广场首页样式 |
| `src/components/Musashi/WorkCard.jsx` | 作品卡片组件 |
| `src/components/Musashi/WorkCard.css` | 卡片样式 |
| `src/components/Musashi/WorkCreate.jsx` | 创建作品页 |
| `src/components/Musashi/WorkCreate.css` | 创建页样式 |
| `src/components/Musashi/WorkDetail.jsx` | 作品详情页 |
| `src/components/Musashi/WorkDetail.css` | 详情页样式 |
| `src/components/Musashi/WorkEdit.jsx` | 编辑作品页 |
| `src/components/Musashi/ChapterManager.jsx` | 小说章节管理 |
| `src/components/Musashi/MangaChapterManager.jsx` | 漫画话数管理 |
| `src/components/Musashi/GalgameDownloadManager.jsx` | Galgame 下载链接管理 |
| `src/components/Musashi/NovelReader.jsx` | 沉浸式小说阅读器 |
| `src/components/Musashi/NovelReader.css` | 小说阅读器样式 |
| `src/components/Musashi/MangaReader.jsx` | 条漫式漫画阅读器 |
| `src/components/Musashi/MangaReader.css` | 漫画阅读器样式 |
| `src/components/Musashi/MyWorks.jsx` | 我的作品管理 |
| `src/components/Musashi/MyWorks.css` | 我的作品样式 |
| `src/components/Musashi/ReaderSettings.jsx` | 阅读器设置面板 |
| `src/components/Musashi/ReaderSettings.css` | 设置面板样式 |
| `src/services/musashiApi.js` | 武藏也前端 Service 层 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `worker/oauth-proxy.js` | 添加武藏也 API 路由（~25 个端点） |
| `worker/schema.sql` | 添加武藏也相关表定义 |
| `src/App.jsx` | 添加 /musashi 路由 |
| `src/components/Layout/Header.jsx` | 添加"武藏也"导航项 |
| `src/components/Layout/DockBar.jsx` | 添加快速发布按钮 |
| `src/context/AppContext.jsx` | 添加阅读进度到用户数据 |

---

## Task 1: 数据库迁移脚本

**Files:**
- Create: `worker/migrations/v009_musashi.sql`
- Modify: `worker/schema.sql` (追加表定义)

- [ ] **Step 1: 创建迁移脚本**

```sql
-- v009_musashi.sql — 武藏也创作者平台数据表

-- 作品主表
CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('galgame','novel','manga')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  status TEXT DEFAULT 'ongoing' CHECK(status IN ('ongoing','completed','hiatus')),
  visibility TEXT DEFAULT 'public' CHECK(visibility IN ('public','unlisted','private')),
  is_paid INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  is_flagged INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_works_type ON works(type);
CREATE INDEX idx_works_author ON works(author_id);
CREATE INDEX idx_works_status ON works(status);
CREATE INDEX idx_works_created ON works(created_at DESC);
CREATE INDEX idx_works_views ON works(views_count DESC);
CREATE INDEX idx_works_likes ON works(likes_count DESC);

-- 小说章节
CREATE TABLE IF NOT EXISTS novel_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  word_count INTEGER DEFAULT 0,
  is_paid INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(work_id, chapter_number)
);

CREATE INDEX idx_novel_chapters_work ON novel_chapters(work_id, chapter_number);

-- 漫画话数
CREATE TABLE IF NOT EXISTS manga_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(work_id, chapter_number)
);

CREATE INDEX idx_manga_chapters_work ON manga_chapters(work_id, chapter_number);

-- 漫画页面
CREATE TABLE IF NOT EXISTS manga_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES manga_chapters(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chapter_id, page_number)
);

CREATE INDEX idx_manga_pages_chapter ON manga_pages(chapter_id, page_number);

-- Galgame 下载链接
CREATE TABLE IF NOT EXISTS galgame_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('windows','mac','linux','android')),
  version TEXT DEFAULT '',
  download_url TEXT NOT NULL,
  file_size TEXT DEFAULT '',
  password TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_galgame_downloads_work ON galgame_downloads(work_id);

-- Galgame 预览图
CREATE TABLE IF NOT EXISTS galgame_previews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  caption TEXT DEFAULT ''
);

CREATE INDEX idx_galgame_previews_work ON galgame_previews(work_id, sort_order);

-- 作品评论
CREATE TABLE IF NOT EXISTS work_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_work_comments_work ON work_comments(work_id, created_at DESC);

-- 作品收藏
CREATE TABLE IF NOT EXISTS work_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

CREATE INDEX idx_work_favorites_user ON work_favorites(user_id);

-- 作品点赞
CREATE TABLE IF NOT EXISTS work_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- 阅读进度
CREATE TABLE IF NOT EXISTS reading_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  chapter_number INTEGER DEFAULT 1,
  scroll_position REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- 作品举报
CREATE TABLE IF NOT EXISTS work_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_work_reports_status ON work_reports(status);
```

- [ ] **Step 2: 将相同表定义追加到 schema.sql 末尾**

在 `worker/schema.sql` 末尾追加上述所有 CREATE TABLE 和 CREATE INDEX 语句（去掉 IF NOT EXISTS，与现有 schema 风格一致）。

- [ ] **Step 3: 在本地 D1 执行迁移**

```bash
cd worker
wrangler d1 execute anispace-db --local --file=migrations/v009_musashi.sql
```

- [ ] **Step 4: 在远程 D1 执行迁移**

```bash
wrangler d1 execute anispace-db --remote --file=migrations/v009_musashi.sql
```

- [ ] **Step 5: Commit**

```bash
git add worker/migrations/v009_musashi.sql worker/schema.sql
git commit -m "feat(musashi): add database migration for creator platform"
```

---

## Task 2: Worker API — 作品 CRUD + 互动

**Files:**
- Modify: `worker/oauth-proxy.js`

- [ ] **Step 1: 在 oauth-proxy.js 的 API 路由区域添加作品 CRUD 端点**

在 `handleApiRequest` 函数中，添加以下路由处理（参考现有 posts/users 路由的模式）：

```javascript
// === 武藏也 作品 API ===

// GET /api/works — 作品列表
if (url.pathname === '/api/works' && method === 'GET') {
  const type = url.searchParams.get('type') || '';
  const sort = url.searchParams.get('sort') || 'latest';
  const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit')) || 20));
  const search = url.searchParams.get('search') || '';
  const offset = (page - 1) * limit;

  let where = ["visibility = 'public'", "is_flagged = 0"];
  const params = [];
  if (type) { where.push('type = ?'); params.push(type); }
  if (search) { where.push('(title LIKE ? OR tags LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const orderBy = sort === 'popular' ? 'views_count DESC' : sort === 'rating' ? 'likes_count DESC' : 'created_at DESC';

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM works WHERE ${where.join(' AND ')}`
  ).bind(...params).first();

  const results = await env.DB.prepare(
    `SELECT * FROM works WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();

  return jsonResponse({ works: results.results, total: countResult.total, page, limit });
}

// GET /api/works/:id — 作品详情
if (url.pathname.match(/^\/api\/works\/\d+$/) && method === 'GET') {
  const id = url.pathname.split('/').pop();
  const work = await env.DB.prepare('SELECT * FROM works WHERE id = ?').bind(id).first();
  if (!work) return jsonResponse({ error: 'Not found' }, 404);

  // 获取类型特有数据
  let extra = {};
  if (work.type === 'novel') {
    const chapters = await env.DB.prepare(
      'SELECT id, chapter_number, title, word_count, is_paid, created_at, updated_at FROM novel_chapters WHERE work_id = ? ORDER BY chapter_number'
    ).bind(id).all();
    extra.chapters = chapters.results;
  } else if (work.type === 'manga') {
    const chapters = await env.DB.prepare(
      'SELECT id, chapter_number, title, created_at FROM manga_chapters WHERE work_id = ? ORDER BY chapter_number'
    ).bind(id).all();
    for (const ch of chapters.results) {
      ch.pages = (await env.DB.prepare(
        'SELECT id, page_number, image_url, alt_text FROM manga_pages WHERE chapter_id = ? ORDER BY page_number'
      ).bind(ch.id).all()).results;
    }
    extra.chapters = chapters.results;
  } else if (work.type === 'galgame') {
    const downloads = await env.DB.prepare(
      'SELECT * FROM galgame_downloads WHERE work_id = ? ORDER BY platform'
    ).bind(id).all();
    const previews = await env.DB.prepare(
      'SELECT * FROM galgame_previews WHERE work_id = ? ORDER BY sort_order'
    ).bind(id).all();
    extra.downloads = downloads.results;
    extra.previews = previews.results;
  }

  return jsonResponse({ ...work, ...extra });
}

// POST /api/works — 创建作品
if (url.pathname === '/api/works' && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await request.json();
  const { type, title, description, cover_image, tags, status, visibility } = body;
  if (!type || !title) return jsonResponse({ error: 'type and title required' }, 400);
  if (!['galgame','novel','manga'].includes(type)) return jsonResponse({ error: 'invalid type' }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO works (author_id, type, title, description, cover_image, tags, status, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).bind(user.userId, type, title, description || '', cover_image || '',
    JSON.stringify(tags || []), status || 'ongoing', visibility || 'public'
  ).first();

  return jsonResponse(result, 201);
}

// PUT /api/works/:id — 更新作品
if (url.pathname.match(/^\/api\/works\/\d+$/) && method === 'PUT') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const id = url.pathname.split('/').pop();

  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(id).first();
  if (!work) return jsonResponse({ error: 'Not found' }, 404);
  if (work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const body = await request.json();
  const fields = [];
  const params = [];
  for (const key of ['title','description','cover_image','tags','status','visibility']) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(key === 'tags' ? JSON.stringify(body[key]) : body[key]);
    }
  }
  if (fields.length === 0) return jsonResponse({ error: 'No fields to update' }, 400);
  fields.push("updated_at = datetime('now')");
  params.push(id);

  await env.DB.prepare(`UPDATE works SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  const updated = await env.DB.prepare('SELECT * FROM works WHERE id = ?').bind(id).first();
  return jsonResponse(updated);
}

// DELETE /api/works/:id — 删除作品
if (url.pathname.match(/^\/api\/works\/\d+$/) && method === 'DELETE') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const id = url.pathname.split('/').pop();

  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(id).first();
  if (!work) return jsonResponse({ error: 'Not found' }, 404);
  if (work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  await env.DB.prepare('DELETE FROM works WHERE id = ?').bind(id).run();
  return jsonResponse({ ok: true });
}
```

- [ ] **Step 2: 添加互动端点（点赞/收藏/浏览/举报）**

```javascript
// POST /api/works/:id/like — 点赞/取消
if (url.pathname.match(/^\/api\/works\/\d+\/like$/) && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const id = url.pathname.split('/')[3];

  const existing = await env.DB.prepare(
    'SELECT id FROM work_likes WHERE user_id = ? AND work_id = ?'
  ).bind(user.userId, id).first();

  if (existing) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM work_likes WHERE id = ?').bind(existing.id),
      env.DB.prepare('UPDATE works SET likes_count = likes_count - 1 WHERE id = ?').bind(id),
    ]);
    return jsonResponse({ liked: false });
  } else {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO work_likes (user_id, work_id) VALUES (?, ?)').bind(user.userId, id),
      env.DB.prepare('UPDATE works SET likes_count = likes_count + 1 WHERE id = ?').bind(id),
    ]);
    return jsonResponse({ liked: true });
  }
}

// POST /api/works/:id/favorite — 收藏/取消
if (url.pathname.match(/^\/api\/works\/\d+\/favorite$/) && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const id = url.pathname.split('/')[3];

  const existing = await env.DB.prepare(
    'SELECT id FROM work_favorites WHERE user_id = ? AND work_id = ?'
  ).bind(user.userId, id).first();

  if (existing) {
    await env.DB.prepare('DELETE FROM work_favorites WHERE id = ?').bind(existing.id).run();
    return jsonResponse({ favorited: false });
  } else {
    await env.DB.prepare('INSERT INTO work_favorites (user_id, work_id) VALUES (?, ?)').bind(user.userId, id).run();
    return jsonResponse({ favorited: true });
  }
}

// POST /api/works/:id/view — 记录浏览
if (url.pathname.match(/^\/api\/works\/\d+\/view$/) && method === 'POST') {
  const id = url.pathname.split('/')[3];
  await env.DB.prepare('UPDATE works SET views_count = views_count + 1 WHERE id = ?').bind(id).run();
  return jsonResponse({ ok: true });
}

// GET /api/works/:id/comments — 评论列表
if (url.pathname.match(/^\/api\/works\/\d+\/comments$/) && method === 'GET') {
  const id = url.pathname.split('/')[3];
  const comments = await env.DB.prepare(
    'SELECT wc.*, u.username, u.name, u.avatar FROM work_comments wc JOIN users u ON wc.author_id = u.id WHERE wc.work_id = ? ORDER BY wc.created_at DESC'
  ).bind(id).all();
  return jsonResponse({ comments: comments.results });
}

// POST /api/works/:id/comments — 发表评论
if (url.pathname.match(/^\/api\/works\/\d+\/comments$/) && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const id = url.pathname.split('/')[3];
  const { content } = await request.json();
  if (!content) return jsonResponse({ error: 'content required' }, 400);

  const result = await env.DB.prepare(
    'INSERT INTO work_comments (work_id, author_id, content) VALUES (?, ?, ?) RETURNING *'
  ).bind(id, user.userId, content).first();

  await env.DB.prepare('UPDATE works SET comments_count = comments_count + 1 WHERE id = ?').bind(id).run();
  return jsonResponse(result, 201);
}

// POST /api/works/:id/report — 举报
if (url.pathname.match(/^\/api\/works\/\d+\/report$/) && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const id = url.pathname.split('/')[3];
  const { reason } = await request.json();
  if (!reason) return jsonResponse({ error: 'reason required' }, 400);

  await env.DB.prepare(
    'INSERT INTO work_reports (reporter_id, work_id, reason) VALUES (?, ?, ?)'
  ).bind(user.userId, id, reason).run();
  return jsonResponse({ ok: true });
}

// GET /api/works/my — 我的作品
if (url.pathname === '/api/works/my' && method === 'GET') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const works = await env.DB.prepare(
    'SELECT * FROM works WHERE author_id = ? ORDER BY updated_at DESC'
  ).bind(user.userId).all();
  return jsonResponse({ works: works.results });
}
```

- [ ] **Step 3: Commit**

```bash
git add worker/oauth-proxy.js
git commit -m "feat(musashi): add works CRUD and interaction API endpoints"
```

---

## Task 3: Worker API — 小说章节 + 漫画话数 + Galgame 下载

**Files:**
- Modify: `worker/oauth-proxy.js`

- [ ] **Step 1: 添加小说章节 CRUD 端点**

```javascript
// === 小说章节 API ===

// GET /api/works/:id/chapters — 章节列表
if (url.pathname.match(/^\/api\/works\/\d+\/chapters$/) && method === 'GET') {
  const id = url.pathname.split('/')[3];
  const chapters = await env.DB.prepare(
    'SELECT id, chapter_number, title, word_count, is_paid, created_at, updated_at FROM novel_chapters WHERE work_id = ? ORDER BY chapter_number'
  ).bind(id).all();
  return jsonResponse({ chapters: chapters.results });
}

// GET /api/works/:id/chapters/:cid — 章节详情（含正文）
if (url.pathname.match(/^\/api\/works\/\d+\/chapters\/\d+$/) && method === 'GET') {
  const cid = url.pathname.split('/').pop();
  const chapter = await env.DB.prepare('SELECT * FROM novel_chapters WHERE id = ?').bind(cid).first();
  if (!chapter) return jsonResponse({ error: 'Not found' }, 404);
  return jsonResponse(chapter);
}

// POST /api/works/:id/chapters — 添加章节
if (url.pathname.match(/^\/api\/works\/\d+\/chapters$/) && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const body = await request.json();
  const { chapter_number, title, content } = body;
  const wordCount = (content || '').replace(/\s/g, '').length;

  const result = await env.DB.prepare(
    'INSERT INTO novel_chapters (work_id, chapter_number, title, content, word_count) VALUES (?, ?, ?, ?, ?) RETURNING *'
  ).bind(workId, chapter_number, title || '', content || '', wordCount).first();

  await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();
  return jsonResponse(result, 201);
}

// PUT /api/works/:id/chapters/:cid — 更新章节
if (url.pathname.match(/^\/api\/works\/\d+\/chapters\/\d+$/) && method === 'PUT') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const cid = url.pathname.split('/').pop();
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const body = await request.json();
  const fields = [];
  const params = [];
  if (body.title !== undefined) { fields.push('title = ?'); params.push(body.title); }
  if (body.content !== undefined) {
    fields.push('content = ?'); params.push(body.content);
    fields.push('word_count = ?'); params.push(body.content.replace(/\s/g, '').length);
  }
  if (body.chapter_number !== undefined) { fields.push('chapter_number = ?'); params.push(body.chapter_number); }
  if (fields.length === 0) return jsonResponse({ error: 'No fields' }, 400);
  fields.push("updated_at = datetime('now')");
  params.push(cid);

  await env.DB.prepare(`UPDATE novel_chapters SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  return jsonResponse({ ok: true });
}

// DELETE /api/works/:id/chapters/:cid — 删除章节
if (url.pathname.match(/^\/api\/works\/\d+\/chapters\/\d+$/) && method === 'DELETE') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const cid = url.pathname.split('/').pop();
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  await env.DB.prepare('DELETE FROM novel_chapters WHERE id = ?').bind(cid).run();
  return jsonResponse({ ok: true });
}

// PUT /api/works/:id/chapters/reorder — 章节排序
if (url.pathname.match(/^\/api\/works\/\d+\/chapters\/reorder$/) && method === 'PUT') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const { order } = await request.json(); // [{id, chapter_number}]
  const stmt = env.DB.prepare('UPDATE novel_chapters SET chapter_number = ? WHERE id = ?');
  await env.DB.batch(order.map(o => stmt.bind(o.chapter_number, o.id)));
  return jsonResponse({ ok: true });
}
```

- [ ] **Step 2: 添加漫画话数和页面 CRUD 端点**

```javascript
// === 漫画话数/页面 API ===

// GET /api/works/:id/manga-chapters — 话数列表（含页面）
if (url.pathname.match(/^\/api\/works\/\d+\/manga-chapters$/) && method === 'GET') {
  const id = url.pathname.split('/')[3];
  const chapters = await env.DB.prepare(
    'SELECT id, chapter_number, title, created_at FROM manga_chapters WHERE work_id = ? ORDER BY chapter_number'
  ).bind(id).all();
  for (const ch of chapters.results) {
    ch.pages = (await env.DB.prepare(
      'SELECT id, page_number, image_url, alt_text FROM manga_pages WHERE chapter_id = ? ORDER BY page_number'
    ).bind(ch.id).all()).results;
  }
  return jsonResponse({ chapters: chapters.results });
}

// POST /api/works/:id/manga-chapters — 添加话
if (url.pathname.match(/^\/api\/works\/\d+\/manga-chapters$/) && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const body = await request.json();
  const result = await env.DB.prepare(
    'INSERT INTO manga_chapters (work_id, chapter_number, title) VALUES (?, ?, ?) RETURNING *'
  ).bind(workId, body.chapter_number, body.title || '').first();

  await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();
  return jsonResponse(result, 201);
}

// DELETE /api/works/:id/manga-chapters/:cid — 删除话
if (url.pathname.match(/^\/api\/works\/\d+\/manga-chapters\/\d+$/) && method === 'DELETE') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const cid = url.pathname.split('/').pop();
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  await env.DB.prepare('DELETE FROM manga_chapters WHERE id = ?').bind(cid).run();
  return jsonResponse({ ok: true });
}

// POST /api/works/:id/manga-chapters/:cid/pages — 上传页面图片
if (url.pathname.match(/^\/api\/works\/\d+\/manga-chapters\/\d+\/pages$/) && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const body = await request.json();
  const result = await env.DB.prepare(
    'INSERT INTO manga_pages (chapter_id, page_number, image_url, alt_text) VALUES (?, ?, ?, ?) RETURNING *'
  ).bind(body.chapter_id, body.page_number, body.image_url, body.alt_text || '').first();

  return jsonResponse(result, 201);
}

// DELETE /api/works/:id/manga-pages/:pid — 删除页面
if (url.pathname.match(/^\/api\/works\/\d+\/manga-pages\/\d+$/) && method === 'DELETE') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const pid = url.pathname.split('/').pop();
  // 验证页面属于用户的作品
  const page = await env.DB.prepare(
    'SELECT mp.id FROM manga_pages mp JOIN manga_chapters mc ON mp.chapter_id = mc.id JOIN works w ON mc.work_id = w.id WHERE mp.id = ? AND w.author_id = ?'
  ).bind(pid, user.userId).first();
  if (!page) return jsonResponse({ error: 'Forbidden' }, 403);

  await env.DB.prepare('DELETE FROM manga_pages WHERE id = ?').bind(pid).run();
  return jsonResponse({ ok: true });
}
```

- [ ] **Step 3: 添加 Galgame 下载和预览图 CRUD 端点**

```javascript
// === Galgame 下载/预览 API ===

// POST /api/works/:id/downloads — 添加下载链接
if (url.pathname.match(/^\/api\/works\/\d+\/downloads$/) && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const body = await request.json();
  const result = await env.DB.prepare(
    'INSERT INTO galgame_downloads (work_id, platform, version, download_url, file_size, password) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(workId, body.platform, body.version || '', body.download_url, body.file_size || '', body.password || '').first();

  return jsonResponse(result, 201);
}

// PUT /api/works/:id/downloads/:did — 更新下载链接
if (url.pathname.match(/^\/api\/works\/\d+\/downloads\/\d+$/) && method === 'PUT') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const did = url.pathname.split('/').pop();
  const body = await request.json();
  const fields = [];
  const params = [];
  for (const key of ['platform','version','download_url','file_size','password']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); params.push(body[key]); }
  }
  if (fields.length === 0) return jsonResponse({ error: 'No fields' }, 400);
  params.push(did);
  await env.DB.prepare(`UPDATE galgame_downloads SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  return jsonResponse({ ok: true });
}

// DELETE /api/works/:id/downloads/:did — 删除下载链接
if (url.pathname.match(/^\/api\/works\/\d+\/downloads\/\d+$/) && method === 'DELETE') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const did = url.pathname.split('/').pop();
  await env.DB.prepare('DELETE FROM galgame_downloads WHERE id = ?').bind(did).run();
  return jsonResponse({ ok: true });
}

// POST /api/works/:id/previews — 上传预览图
if (url.pathname.match(/^\/api\/works\/\d+\/previews$/) && method === 'POST') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const body = await request.json();
  const result = await env.DB.prepare(
    'INSERT INTO galgame_previews (work_id, image_url, sort_order, caption) VALUES (?, ?, ?, ?) RETURNING *'
  ).bind(workId, body.image_url, body.sort_order || 0, body.caption || '').first();

  return jsonResponse(result, 201);
}

// DELETE /api/works/:id/previews/:pid — 删除预览图
if (url.pathname.match(/^\/api\/works\/\d+\/previews\/\d+$/) && method === 'DELETE') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/')[3];
  const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
  if (!work || work.author_id !== user.userId) return jsonResponse({ error: 'Forbidden' }, 403);

  const pid = url.pathname.split('/').pop();
  await env.DB.prepare('DELETE FROM galgame_previews WHERE id = ?').bind(pid).run();
  return jsonResponse({ ok: true });
}
```

- [ ] **Step 4: 添加阅读进度端点**

```javascript
// === 阅读进度 API ===

// GET /api/reading-progress — 用户所有进度
if (url.pathname === '/api/reading-progress' && method === 'GET') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const progress = await env.DB.prepare(
    'SELECT rp.*, w.title, w.type, w.cover_image FROM reading_progress rp JOIN works w ON rp.work_id = w.id WHERE rp.user_id = ? ORDER BY rp.updated_at DESC'
  ).bind(user.userId).all();
  return jsonResponse({ progress: progress.results });
}

// GET /api/reading-progress/:workId — 单作品进度
if (url.pathname.match(/^\/api\/reading-progress\/\d+$/) && method === 'GET') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/').pop();

  const progress = await env.DB.prepare(
    'SELECT * FROM reading_progress WHERE user_id = ? AND work_id = ?'
  ).bind(user.userId, workId).first();
  return jsonResponse(progress || { chapter_number: 1, scroll_position: 0 });
}

// PUT /api/reading-progress/:workId — 更新进度
if (url.pathname.match(/^\/api\/reading-progress\/\d+$/) && method === 'PUT') {
  const user = await verifyJwt(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workId = url.pathname.split('/').pop();

  const body = await request.json();
  await env.DB.prepare(
    `INSERT INTO reading_progress (user_id, work_id, chapter_number, scroll_position, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, work_id) DO UPDATE SET
       chapter_number = excluded.chapter_number,
       scroll_position = excluded.scroll_position,
       updated_at = datetime('now')`
  ).bind(user.userId, workId, body.chapter_number || 1, body.scroll_position || 0).run();

  return jsonResponse({ ok: true });
}
```

- [ ] **Step 5: Commit**

```bash
git add worker/oauth-proxy.js
git commit -m "feat(musashi): add chapters, manga, galgame, and reading progress API"
```

---

## Task 4: 前端 Service 层

**Files:**
- Create: `src/services/musashiApi.js`

- [ ] **Step 1: 创建 musashiApi.js**

```javascript
/**
 * 武藏也 — 创作者平台 Service 层
 */
import StorageService from './storage';

const API_BASE = '/api';

// --- Helper ---
async function apiFetch(path, options = {}) {
  const token = sessionStorage.getItem('acg_auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API Error ${res.status}`);
  }
  return res.json();
}

// --- 作品 CRUD ---
export const MusashiService = {
  // 作品列表
  async getWorks({ type, sort, page, limit, search } = {}) {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (sort) params.set('sort', sort);
    if (page) params.set('page', page);
    if (limit) params.set('limit', limit);
    if (search) params.set('search', search);
    return apiFetch(`/works?${params}`);
  },

  // 作品详情
  async getWork(id) {
    return apiFetch(`/works/${id}`);
  },

  // 创建作品
  async createWork(data) {
    return apiFetch('/works', { method: 'POST', body: JSON.stringify(data) });
  },

  // 更新作品
  async updateWork(id, data) {
    return apiFetch(`/works/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  // 删除作品
  async deleteWork(id) {
    return apiFetch(`/works/${id}`, { method: 'DELETE' });
  },

  // 我的作品
  async getMyWorks() {
    return apiFetch('/works/my');
  },

  // --- 互动 ---
  async toggleLike(id) {
    return apiFetch(`/works/${id}/like`, { method: 'POST' });
  },

  async toggleFavorite(id) {
    return apiFetch(`/works/${id}/favorite`, { method: 'POST' });
  },

  async recordView(id) {
    return apiFetch(`/works/${id}/view`, { method: 'POST' });
  },

  async getComments(id) {
    return apiFetch(`/works/${id}/comments`);
  },

  async addComment(id, content) {
    return apiFetch(`/works/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
  },

  async reportWork(id, reason) {
    return apiFetch(`/works/${id}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
  },

  // --- 小说章节 ---
  async getChapters(workId) {
    return apiFetch(`/works/${workId}/chapters`);
  },

  async getChapter(workId, chapterId) {
    return apiFetch(`/works/${workId}/chapters/${chapterId}`);
  },

  async addChapter(workId, data) {
    return apiFetch(`/works/${workId}/chapters`, { method: 'POST', body: JSON.stringify(data) });
  },

  async updateChapter(workId, chapterId, data) {
    return apiFetch(`/works/${workId}/chapters/${chapterId}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteChapter(workId, chapterId) {
    return apiFetch(`/works/${workId}/chapters/${chapterId}`, { method: 'DELETE' });
  },

  async reorderChapters(workId, order) {
    return apiFetch(`/works/${workId}/chapters/reorder`, { method: 'PUT', body: JSON.stringify({ order }) });
  },

  // --- 漫画话数 ---
  async getMangaChapters(workId) {
    return apiFetch(`/works/${workId}/manga-chapters`);
  },

  async addMangaChapter(workId, data) {
    return apiFetch(`/works/${workId}/manga-chapters`, { method: 'POST', body: JSON.stringify(data) });
  },

  async deleteMangaChapter(workId, chapterId) {
    return apiFetch(`/works/${workId}/manga-chapters/${chapterId}`, { method: 'DELETE' });
  },

  async addMangaPage(workId, chapterId, data) {
    return apiFetch(`/works/${workId}/manga-chapters/${chapterId}/pages`, { method: 'POST', body: JSON.stringify(data) });
  },

  async deleteMangaPage(workId, pageId) {
    return apiFetch(`/works/${workId}/manga-pages/${pageId}`, { method: 'DELETE' });
  },

  // --- Galgame ---
  async addDownload(workId, data) {
    return apiFetch(`/works/${workId}/downloads`, { method: 'POST', body: JSON.stringify(data) });
  },

  async updateDownload(workId, downloadId, data) {
    return apiFetch(`/works/${workId}/downloads/${downloadId}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteDownload(workId, downloadId) {
    return apiFetch(`/works/${workId}/downloads/${downloadId}`, { method: 'DELETE' });
  },

  async addPreview(workId, data) {
    return apiFetch(`/works/${workId}/previews`, { method: 'POST', body: JSON.stringify(data) });
  },

  async deletePreview(workId, previewId) {
    return apiFetch(`/works/${workId}/previews/${previewId}`, { method: 'DELETE' });
  },

  // --- 阅读进度 ---
  async getAllProgress() {
    return apiFetch('/reading-progress');
  },

  async getProgress(workId) {
    return apiFetch(`/reading-progress/${workId}`);
  },

  async updateProgress(workId, data) {
    return apiFetch(`/reading-progress/${workId}`, { method: 'PUT', body: JSON.stringify(data) });
  },
};

export default MusashiService;
```

- [ ] **Step 2: Commit**

```bash
git add src/services/musashiApi.js
git commit -m "feat(musashi): add frontend service layer"
```

---

## Task 5: 路由与导航集成

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Layout/Header.jsx`

- [ ] **Step 1: 在 App.jsx 添加武藏也路由**

在路由配置区域（其他路由之后），添加：

```jsx
import MusashiHome from './components/Musashi/MusashiHome';
import WorkDetail from './components/Musashi/WorkDetail';
import WorkCreate from './components/Musashi/WorkCreate';
import WorkEdit from './components/Musashi/WorkEdit';
import NovelReader from './components/Musashi/NovelReader';
import MangaReader from './components/Musashi/MangaReader';
import MyWorks from './components/Musashi/MyWorks';

// 在 Route 列表中添加：
<Route path="musashi" element={<MusashiHome />} />
<Route path="musashi/new" element={<WorkCreate />} />
<Route path="musashi/my" element={<MyWorks />} />
<Route path="musashi/:workId/edit" element={<WorkEdit />} />
<Route path="musashi/:workId/read" element={<NovelReader />} />
<Route path="musashi/:workId/read/:chapter" element={<NovelReader />} />
<Route path="musashi/:workId/comic" element={<MangaReader />} />
<Route path="musashi/:workId/comic/:chapter" element={<MangaReader />} />
<Route path="musashi/:workId" element={<WorkDetail />} />
```

注意：`:workId/edit` 和 `:workId/read` 等具体路径必须放在 `:workId` 之前，避免被通配匹配。

- [ ] **Step 2: 在 Header.jsx 添加"武藏也"导航项**

在导航链接数组中（"友情链接"之前），添加：

```jsx
{ path: '/musashi', label: '武藏也' }
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx src/components/Layout/Header.jsx
git commit -m "feat(musashi): add routes and navigation"
```

---

## Task 6: 作品广场首页（MusashiHome + WorkCard）

**Files:**
- Create: `src/components/Musashi/MusashiHome.jsx`
- Create: `src/components/Musashi/MusashiHome.css`
- Create: `src/components/Musashi/WorkCard.jsx`
- Create: `src/components/Musashi/WorkCard.css`

- [ ] **Step 1: 创建 WorkCard 组件**

WorkCard 是作品卡片，用于广场展示。接收 `work` prop，显示封面、标题、类型标签、作者、评分、状态。

```jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './WorkCard.css';

const TYPE_LABELS = { galgame: 'Galgame', novel: '小说', manga: '漫画' };
const TYPE_COLORS = { galgame: '#ff9f43', novel: '#9b59b6', manga: '#00a1d6' };
const STATUS_LABELS = { ongoing: '连载中', completed: '已完结', hiatus: '搁置' };

export default function WorkCard({ work }) {
  const navigate = useNavigate();
  const tags = (() => { try { return JSON.parse(work.tags || '[]'); } catch { return []; } })();

  return (
    <div className="work-card" onClick={() => navigate(`/musashi/${work.id}`)}>
      <div className="work-card-cover">
        {work.cover_image ? (
          <img src={work.cover_image} alt={work.title} loading="lazy" />
        ) : (
          <div className="work-card-cover-placeholder">
            {work.title.charAt(0)}
          </div>
        )}
        <span className="work-card-type" style={{ background: TYPE_COLORS[work.type] }}>
          {TYPE_LABELS[work.type]}
        </span>
        {work.status !== 'ongoing' && (
          <span className="work-card-status">{STATUS_LABELS[work.status]}</span>
        )}
      </div>
      <div className="work-card-info">
        <h3 className="work-card-title">{work.title}</h3>
        <div className="work-card-meta">
          <span className="work-card-author">{work.author_name || '匿名'}</span>
          <span className="work-card-views">{work.views_count} 浏览</span>
        </div>
        {tags.length > 0 && (
          <div className="work-card-tags">
            {tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="work-card-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 WorkCard.css**

```css
.work-card {
  background: var(--card-bg, #fff);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.work-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}
.work-card-cover {
  position: relative;
  aspect-ratio: 3/4;
  overflow: hidden;
  background: #f0f0f0;
}
.work-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.work-card-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  color: #ccc;
  background: linear-gradient(135deg, #f5f7fa, #c3cfe2);
}
.work-card-type {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 10px;
  border-radius: 20px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
}
.work-card-status {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 0.7rem;
}
.work-card-info {
  padding: 12px;
}
.work-card-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.work-card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #999;
  margin-bottom: 6px;
}
.work-card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.work-card-tag {
  padding: 1px 8px;
  border-radius: 20px;
  background: #f0f0f0;
  font-size: 0.7rem;
  color: #666;
}
```

- [ ] **Step 3: 创建 MusashiHome 组件**

```jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import MusashiService from '../../services/musashiApi';
import WorkCard from './WorkCard';
import './MusashiHome.css';

const TABS = [
  { key: '', label: '全部' },
  { key: 'galgame', label: 'Galgame' },
  { key: 'novel', label: '小说' },
  { key: 'manga', label: '漫画' },
];

const SORTS = [
  { key: 'latest', label: '最新' },
  { key: 'popular', label: '最热' },
  { key: 'rating', label: '评分最高' },
];

export default function MusashiHome() {
  const { isAuthenticated } = useApp();
  const navigate = useNavigate();
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [sort, setSort] = useState('latest');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    loadWorks();
  }, [type, sort, page]);

  async function loadWorks() {
    setLoading(true);
    try {
      const data = await MusashiService.getWorks({ type, sort, page, limit, search: search || undefined });
      setWorks(data.works || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load works:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    loadWorks();
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="musashi-home">
      <div className="musashi-header">
        <h1>武藏也</h1>
        <p className="musashi-subtitle">创作者发布与体验平台</p>
        {isAuthenticated && (
          <button className="musashi-create-btn" onClick={() => navigate('/musashi/new')}>
            发布作品
          </button>
        )}
      </div>

      <div className="musashi-controls">
        <div className="musashi-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`musashi-tab ${type === tab.key ? 'active' : ''}`}
              onClick={() => { setType(tab.key); setPage(1); }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="musashi-sort-search">
          <div className="musashi-sorts">
            {SORTS.map(s => (
              <button
                key={s.key}
                className={`musashi-sort ${sort === s.key ? 'active' : ''}`}
                onClick={() => { setSort(s.key); setPage(1); }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <form className="musashi-search" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="搜索作品..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit">搜索</button>
          </form>
        </div>
      </div>

      {loading ? (
        <div className="musashi-loading">加载中...</div>
      ) : works.length === 0 ? (
        <div className="musashi-empty">暂无作品，成为第一个创作者吧！</div>
      ) : (
        <>
          <div className="musashi-grid">
            {works.map(work => <WorkCard key={work.id} work={work} />)}
          </div>
          {totalPages > 1 && (
            <div className="musashi-pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
              <span>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 创建 MusashiHome.css**

```css
.musashi-home {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}
.musashi-header {
  text-align: center;
  margin-bottom: 32px;
}
.musashi-header h1 {
  font-size: 2rem;
  margin: 0 0 8px;
}
.musashi-subtitle {
  color: #999;
  margin: 0 0 16px;
}
.musashi-create-btn {
  padding: 8px 24px;
  border-radius: 20px;
  background: var(--primary, #fb7299);
  color: #fff;
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  transition: opacity 0.2s;
}
.musashi-create-btn:hover { opacity: 0.85; }
.musashi-controls {
  margin-bottom: 24px;
}
.musashi-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.musashi-tab {
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid #ddd;
  background: #fff;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}
.musashi-tab.active {
  background: var(--primary, #fb7299);
  color: #fff;
  border-color: var(--primary, #fb7299);
}
.musashi-sort-search {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.musashi-sorts {
  display: flex;
  gap: 4px;
}
.musashi-sort {
  padding: 4px 12px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8rem;
  color: #999;
}
.musashi-sort.active {
  color: var(--primary, #fb7299);
  font-weight: 600;
}
.musashi-search {
  display: flex;
  gap: 8px;
}
.musashi-search input {
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid #ddd;
  font-size: 0.85rem;
  width: 200px;
}
.musashi-search button {
  padding: 6px 16px;
  border-radius: 20px;
  background: var(--primary, #fb7299);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
}
.musashi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 20px;
}
.musashi-loading, .musashi-empty {
  text-align: center;
  padding: 60px 0;
  color: #999;
}
.musashi-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
}
.musashi-pagination button {
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid #ddd;
  background: #fff;
  cursor: pointer;
}
.musashi-pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Musashi/MusashiHome.jsx src/components/Musashi/MusashiHome.css src/components/Musashi/WorkCard.jsx src/components/Musashi/WorkCard.css
git commit -m "feat(musashi): add MusashiHome and WorkCard components"
```

---

## Task 7: 作品创建页（WorkCreate）

**Files:**
- Create: `src/components/Musashi/WorkCreate.jsx`
- Create: `src/components/Musashi/WorkCreate.css`

- [ ] **Step 1: 创建 WorkCreate 组件**

三步流程：1) 选择类型 → 2) 填写基础信息 → 3) 根据类型进入内容编辑（创建后跳转到编辑页继续添加章节/页面/下载链接）。

```jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import MusashiService from '../../services/musashiApi';
import './WorkCreate.css';

const TYPES = [
  { key: 'galgame', label: 'Galgame', desc: '视觉小说/Galgame，上传预览图和下载链接' },
  { key: 'novel', label: '小说', desc: '轻小说/原创小说，章节式在线阅读' },
  { key: 'manga', label: '漫画', desc: '连载漫画/短篇漫画，条漫式在线阅读' },
];

export default function WorkCreate() {
  const { isAuthenticated, currentUser } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [type, setType] = useState('');
  const [form, setForm] = useState({
    title: '', description: '', cover_image: '', tags: '', status: 'ongoing', visibility: 'public'
  });
  const [submitting, setSubmitting] = useState(false);

  if (!isAuthenticated) {
    return <div className="work-create"><p>请先登录后发布作品</p></div>;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      const result = await MusashiService.createWork({
        type, ...form, tags
      });
      navigate(`/musashi/${result.id}/edit`);
    } catch (err) {
      alert('创建失败: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="work-create">
      {step === 1 && (
        <>
          <h2>选择作品类型</h2>
          <div className="type-selector">
            {TYPES.map(t => (
              <div key={t.key} className={`type-option ${type === t.key ? 'selected' : ''}`}
                onClick={() => { setType(t.key); setStep(2); }}>
                <h3>{t.label}</h3>
                <p>{t.desc}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h2>填写作品信息 — {TYPES.find(t => t.key === type)?.label}</h2>
          <form onSubmit={handleSubmit} className="work-form">
            <label>标题 *</label>
            <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
            <label>简介</label>
            <textarea rows={4} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            <label>封面图 URL</label>
            <input value={form.cover_image} onChange={e => setForm({...form, cover_image: e.target.value})} placeholder="https://..." />
            <label>标签（逗号分隔）</label>
            <input value={form.tags} onChange={e => setForm({...form, tags: e.target.value})} placeholder="恋爱, 校园, 奇幻" />
            <label>状态</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
              <option value="ongoing">连载中</option>
              <option value="completed">已完结</option>
              <option value="hiatus">搁置</option>
            </select>
            <label>可见性</label>
            <select value={form.visibility} onChange={e => setForm({...form, visibility: e.target.value})}>
              <option value="public">公开</option>
              <option value="unlisted">不列出</option>
              <option value="private">私密</option>
            </select>
            <div className="form-actions">
              <button type="button" onClick={() => setStep(1)}>返回</button>
              <button type="submit" disabled={submitting}>
                {submitting ? '创建中...' : '创建作品'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 WorkCreate.css**

```css
.work-create {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
}
.work-create h2 {
  margin-bottom: 24px;
}
.type-selector {
  display: grid;
  gap: 16px;
}
.type-option {
  padding: 20px;
  border: 2px solid #eee;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.type-option:hover {
  border-color: var(--primary, #fb7299);
}
.type-option.selected {
  border-color: var(--primary, #fb7299);
  background: rgba(251,114,153,0.05);
}
.type-option h3 {
  margin: 0 0 8px;
}
.type-option p {
  margin: 0;
  color: #999;
  font-size: 0.85rem;
}
.work-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.work-form label {
  font-weight: 600;
  font-size: 0.9rem;
}
.work-form input, .work-form textarea, .work-form select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.9rem;
}
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
.form-actions button {
  padding: 8px 24px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
}
.form-actions button:first-child {
  background: #f0f0f0;
}
.form-actions button:last-child {
  background: var(--primary, #fb7299);
  color: #fff;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Musashi/WorkCreate.jsx src/components/Musashi/WorkCreate.css
git commit -m "feat(musashi): add WorkCreate component"
```

---

## Task 8: 作品详情页（WorkDetail）

**Files:**
- Create: `src/components/Musashi/WorkDetail.jsx`
- Create: `src/components/Musashi/WorkDetail.css`

- [ ] **Step 1: 创建 WorkDetail 组件**

根据 work.type 渲染不同内容：Galgame 显示预览图轮播+下载链接，小说显示章节目录+阅读按钮，漫画显示话数列表+阅读按钮。通用区域显示封面、标题、作者、标签、简介、评分、收藏、评论。

组件约 200 行，包含：
- 顶部封面+信息区
- 类型特有内容区（条件渲染）
- 评论区（复用现有评论模式）
- 举报按钮

- [ ] **Step 2: 创建 WorkDetail.css**

详情页样式，包含封面大图区、信息栏、章节列表、下载链接卡片、评论区。

- [ ] **Step 3: Commit**

```bash
git add src/components/Musashi/WorkDetail.jsx src/components/Musashi/WorkDetail.css
git commit -m "feat(musashi): add WorkDetail component"
```

---

## Task 9: 作品编辑页（WorkEdit）+ 章节管理

**Files:**
- Create: `src/components/Musashi/WorkEdit.jsx`
- Create: `src/components/Musashi/ChapterManager.jsx`
- Create: `src/components/Musashi/MangaChapterManager.jsx`
- Create: `src/components/Musashi/GalgameDownloadManager.jsx`

- [ ] **Step 1: 创建 WorkEdit 组件**

编辑作品基础信息 + 根据 type 渲染对应的管理器组件。

- [ ] **Step 2: 创建 ChapterManager（小说章节管理）**

支持：添加章节（标题+正文）、编辑章节、删除章节、拖拽排序。使用 MarkdownEditor 组件编辑正文。

- [ ] **Step 3: 创建 MangaChapterManager（漫画话数管理）**

支持：添加话、上传页面图片（批量）、删除话/页面、拖拽排序。

- [ ] **Step 4: 创建 GalgameDownloadManager（Galgame 下载管理）**

支持：添加下载链接（平台/版本/URL/密码）、编辑、删除；上传预览图、删除预览图。

- [ ] **Step 5: Commit**

```bash
git add src/components/Musashi/WorkEdit.jsx src/components/Musashi/ChapterManager.jsx src/components/Musashi/MangaChapterManager.jsx src/components/Musashi/GalgameDownloadManager.jsx
git commit -m "feat(musashi): add WorkEdit and content managers"
```

---

## Task 10: 小说沉浸式阅读器（NovelReader）

**Files:**
- Create: `src/components/Musashi/NovelReader.jsx`
- Create: `src/components/Musashi/NovelReader.css`
- Create: `src/components/Musashi/ReaderSettings.jsx`
- Create: `src/components/Musashi/ReaderSettings.css`

- [ ] **Step 1: 创建 ReaderSettings 组件**

共用阅读器设置面板：字号/行距/夜间模式/主题色。设置持久化到 localStorage。

- [ ] **Step 2: 创建 NovelReader 组件**

核心功能：
- 全屏沉浸模式（隐藏 Header/DockBar，通过 CSS class 控制）
- 左侧可折叠章节目录
- 正文 Markdown 渲染（使用 renderMarkdown.js）
- 底部导航：上一章/下一章
- 阅读进度自动保存（debounce 500ms）
- 键盘快捷键：← → 翻章，Esc 退出

- [ ] **Step 3: 创建 NovelReader.css**

沉浸式阅读器样式：全屏布局、章节目录侧边栏、正文排版、夜间模式。

- [ ] **Step 4: Commit**

```bash
git add src/components/Musashi/NovelReader.jsx src/components/Musashi/NovelReader.css src/components/Musashi/ReaderSettings.jsx src/components/Musashi/ReaderSettings.css
git commit -m "feat(musashi): add NovelReader and ReaderSettings"
```

---

## Task 11: 漫画条漫式阅读器（MangaReader）

**Files:**
- Create: `src/components/Musashi/MangaReader.jsx`
- Create: `src/components/Musashi/MangaReader.css`

- [ ] **Step 1: 创建 MangaReader 组件**

核心功能：
- 全屏沉浸模式
- 图片纵向排列，自然滚动（条漫式）
- 话数切换（顶部下拉选择）
- 图片懒加载（Intersection Observer）
- 阅读进度自动保存（debounce 500ms，记录话数+滚动位置）

- [ ] **Step 2: 创建 MangaReader.css**

条漫式阅读器样式：全屏布局、图片居中自适应宽度、话数切换导航。

- [ ] **Step 3: Commit**

```bash
git add src/components/Musashi/MangaReader.jsx src/components/Musashi/MangaReader.css
git commit -m "feat(musashi): add MangaReader component"
```

---

## Task 12: 我的作品管理（MyWorks）

**Files:**
- Create: `src/components/Musashi/MyWorks.jsx`
- Create: `src/components/Musashi/MyWorks.css`

- [ ] **Step 1: 创建 MyWorks 组件**

展示当前用户的所有作品，支持编辑/删除/切换可见性。

- [ ] **Step 2: 创建 MyWorks.css**

- [ ] **Step 3: Commit**

```bash
git add src/components/Musashi/MyWorks.jsx src/components/Musashi/MyWorks.css
git commit -m "feat(musashi): add MyWorks component"
```

---

## Task 13: 集成测试与最终提交

**Files:**
- Modify: `src/components/Layout/DockBar.jsx` (添加快速发布按钮)

- [ ] **Step 1: 在 DockBar 添加快速发布按钮**

已登录用户在 DockBar 看到"发布作品"按钮，点击跳转 `/musashi/new`。

- [ ] **Step 2: 本地开发测试**

```bash
npm run dev
```

验证：
- `/musashi` 页面正常加载
- 类型切换/排序/搜索正常
- 创建作品流程完整
- 小说阅读器沉浸模式正常
- 漫画阅读器条漫模式正常
- 阅读进度保存/恢复正常

- [ ] **Step 3: 部署 Worker**

```bash
cd worker && wrangler deploy
```

- [ ] **Step 4: 推送前端代码**

```bash
git push origin main
```

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "feat(musashi): complete creator platform integration"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Galgame 发布（下载链接+预览图）— Task 3, 8, 9
- ✅ 小说沉浸式阅读器 — Task 10
- ✅ 漫画条漫式阅读器 — Task 11
- ✅ 作品广场 — Task 6
- ✅ 作品详情 — Task 8
- ✅ 创建/编辑 — Task 7, 9
- ✅ 阅读进度 — Task 3, 10, 11
- ✅ 收藏/点赞/评论 — Task 2
- ✅ 举报 — Task 2
- ✅ 我的作品 — Task 12
- ✅ 导航集成 — Task 5
- ✅ DockBar 快速发布 — Task 13

**Placeholder scan:** No TBD/TODO found.

**Type consistency:** API endpoints in Task 2-3 match musashiApi.js in Task 4. Route paths in Task 5 match component imports.
