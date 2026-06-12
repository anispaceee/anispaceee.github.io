-- v009 — musashi：武藏也创作者平台
-- 用途：支持 galgame / novel / manga 三类原创作品的发布、阅读、下载与互动

-- 作品主表
CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('galgame', 'novel', 'manga')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  status TEXT DEFAULT 'ongoing' CHECK(status IN ('ongoing', 'completed', 'hiatus')),
  visibility TEXT DEFAULT 'public' CHECK(visibility IN ('public', 'unlisted', 'private')),
  is_paid INTEGER DEFAULT 0,
  price REAL DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  is_flagged INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 小说章节表
CREATE TABLE IF NOT EXISTS novel_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  is_paid INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(work_id, chapter_number)
);

-- 漫画章节表
CREATE TABLE IF NOT EXISTS manga_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(work_id, chapter_number)
);

-- 漫画页面表
CREATE TABLE IF NOT EXISTS manga_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES manga_chapters(id),
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chapter_id, page_number)
);

-- Galgame 下载表
CREATE TABLE IF NOT EXISTS galgame_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  platform TEXT NOT NULL CHECK(platform IN ('windows', 'mac', 'linux', 'android')),
  version TEXT DEFAULT '',
  download_url TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  password TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Galgame 预览图表
CREATE TABLE IF NOT EXISTS galgame_previews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  caption TEXT DEFAULT ''
);

-- 作品评论表
CREATE TABLE IF NOT EXISTS work_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 作品收藏表
CREATE TABLE IF NOT EXISTS work_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- 作品点赞表
CREATE TABLE IF NOT EXISTS work_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- 阅读进度表
CREATE TABLE IF NOT EXISTS reading_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  chapter_number INTEGER DEFAULT 0,
  scroll_position REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- 作品举报表
CREATE TABLE IF NOT EXISTS work_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'resolved', 'dismissed')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_works_author ON works(author_id);
CREATE INDEX IF NOT EXISTS idx_works_type ON works(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_visibility ON works(visibility);
CREATE INDEX IF NOT EXISTS idx_works_created ON works(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_likes ON works(likes_count DESC);
CREATE INDEX IF NOT EXISTS idx_works_views ON works(views_count DESC);
CREATE INDEX IF NOT EXISTS idx_novel_chapters_work ON novel_chapters(work_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_manga_chapters_work ON manga_chapters(work_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_manga_pages_chapter ON manga_pages(chapter_id, page_number);
CREATE INDEX IF NOT EXISTS idx_galgame_downloads_work ON galgame_downloads(work_id, platform);
CREATE INDEX IF NOT EXISTS idx_galgame_previews_work ON galgame_previews(work_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_work_comments_work ON work_comments(work_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_favorites_user ON work_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_work_favorites_work ON work_favorites(work_id);
CREATE INDEX IF NOT EXISTS idx_work_likes_user ON work_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_work_likes_work ON work_likes(work_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_user ON reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_work_reports_status ON work_reports(status, created_at DESC);
