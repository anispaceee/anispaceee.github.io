-- v016 — 武藏也 V2：插画类型 + 排行榜 + 系列 + 约稿 + 关注流 + 讨论区
-- 参考：米画师 / Pixiv / 成为小说家吧 / 鲲galgame论坛
-- 
-- 注意：works.type 的 CHECK 约束在 SQLite 中无法通过 ALTER TABLE 修改，
-- 约束变更在 API 层处理（POST/PUT 时校验 illustration 类型）

-- ============================================================
-- 1. 修改现有表 - works
-- ============================================================
ALTER TABLE works ADD COLUMN series_id INTEGER REFERENCES work_series(id);
ALTER TABLE works ADD COLUMN illustration_count INTEGER DEFAULT 0;
ALTER TABLE works ADD COLUMN ai_allowed INTEGER DEFAULT 1;

-- ============================================================
-- 2. 修改现有表 - users
-- ============================================================
ALTER TABLE users ADD COLUMN commission_status TEXT DEFAULT 'closed';
ALTER TABLE users ADD COLUMN bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN banner_image TEXT DEFAULT '';

-- ============================================================
-- 3. 修改现有表 - posts（复用为作品讨论区）
-- ============================================================
ALTER TABLE posts ADD COLUMN work_id INTEGER REFERENCES works(id);
ALTER TABLE posts ADD COLUMN discussion_category TEXT;

-- ============================================================
-- 4. 新增表 - 插画多图
-- ============================================================
CREATE TABLE IF NOT EXISTS illustration_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  caption TEXT DEFAULT '',
  width INTEGER,
  height INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_illustration_work ON illustration_images(work_id, sort_order);

-- ============================================================
-- 5. 新增表 - 排行榜缓存
-- ============================================================
CREATE TABLE IF NOT EXISTS work_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  rank_type TEXT NOT NULL CHECK(rank_type IN ('daily','weekly','monthly')),
  category TEXT NOT NULL CHECK(category IN ('illustration','novel','manga','galgame','all')),
  rank_position INTEGER NOT NULL,
  score REAL NOT NULL,
  calculated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_work_rankings_lookup ON work_rankings(rank_type, category, calculated_at);

-- ============================================================
-- 6. 新增表 - 系列
-- ============================================================
CREATE TABLE IF NOT EXISTS work_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_series_creator ON work_series(creator_id);

-- ============================================================
-- 7. 新增表 - 系列-作品关联
-- ============================================================
CREATE TABLE IF NOT EXISTS series_works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL REFERENCES work_series(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  sort_order INTEGER DEFAULT 0,
  UNIQUE(series_id, work_id)
);

-- ============================================================
-- 8. 新增表 - 约稿企划
-- ============================================================
CREATE TABLE IF NOT EXISTS commissions (
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
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status, created_at DESC);

-- ============================================================
-- 9. 新增表 - 约稿响应
-- ============================================================
CREATE TABLE IF NOT EXISTS commission_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commission_id INTEGER NOT NULL REFERENCES commissions(id),
  responder_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  portfolio_links TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_responses_comm ON commission_responses(commission_id);

-- ============================================================
-- 10. 新增表 - 关注动态流缓存
-- ============================================================
CREATE TABLE IF NOT EXISTS user_feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  creator_id INTEGER NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('new_work','new_chapter')),
  created_at TEXT DEFAULT (datetime('now')),
  is_read INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_feed_user ON user_feed(user_id, created_at DESC);

-- ============================================================
-- 11. 新增表 - 读者感想
-- ============================================================
CREATE TABLE IF NOT EXISTS reader_impressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  impression_type TEXT NOT NULL CHECK(impression_type IN ('interesting','moved','surprised','thoughtful','eager')),
  content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- ============================================================
-- 12. 扩展 work_ratings — 支持多维度评分（Galgame）
-- ============================================================
ALTER TABLE work_ratings ADD COLUMN dimension_scores TEXT DEFAULT NULL;