-- v015: 动画进度栏（点格子）功能
-- 每集观看进度 + 评论

CREATE TABLE IF NOT EXISTS episode_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER NOT NULL,
  episode_id INTEGER NOT NULL,
  episode_sort REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'watched',
  is_private INTEGER DEFAULT 0,
  comment TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_ep_progress_user_subject ON episode_progress(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_ep_progress_episode ON episode_progress(episode_id);
CREATE INDEX IF NOT EXISTS idx_ep_progress_subject_public ON episode_progress(subject_id, is_private);
