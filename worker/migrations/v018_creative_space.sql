-- v018: 创作空间（Creative Space）
-- 新增 creative_notes 表，存储 Notion 式私人笔记

CREATE TABLE IF NOT EXISTS creative_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT DEFAULT '',
  blocks TEXT DEFAULT '[]',
  linked_subject_ids TEXT DEFAULT '[]',
  linked_subjects_snapshot TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  is_pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_creative_notes_user ON creative_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_creative_notes_updated ON creative_notes(user_id, updated_at DESC);
