-- v011 — 完善武藏也：阅读进度表字段修正 + 评分表 + is_visible
-- 用途：
--   1. reading_progress 表增加 chapter_id 和 percentage 列，与后端 API 对齐
--   2. 新增 work_ratings 评分表，支持 1-5 星评分
--   3. works 表增加 is_visible 列，支持快速切换可见性

-- ── 1. 阅读进度表增加列 ──
ALTER TABLE reading_progress ADD COLUMN chapter_id INTEGER;
ALTER TABLE reading_progress ADD COLUMN percentage REAL DEFAULT 0;

-- ── 2. 评分表 ──
CREATE TABLE IF NOT EXISTS work_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- ── 3. works 表增加评分统计列 ──
ALTER TABLE works ADD COLUMN rating_sum INTEGER DEFAULT 0;
ALTER TABLE works ADD COLUMN rating_count INTEGER DEFAULT 0;

-- ── 4. works 表增加 is_visible 列 ──
ALTER TABLE works ADD COLUMN is_visible INTEGER DEFAULT 1;

-- ── 5. 索引 ──
CREATE INDEX IF NOT EXISTS idx_work_ratings_user ON work_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_work_ratings_work ON work_ratings(work_id);
