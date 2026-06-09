-- 新增表（ratings, favorites, mails, private_messages）
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER NOT NULL,
  subject_type INTEGER DEFAULT 2,
  score INTEGER NOT NULL,
  content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, subject_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL DEFAULT 'info',
  target_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS mails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  subject TEXT DEFAULT '',
  content TEXT NOT NULL,
  attachments TEXT DEFAULT '[]',
  read INTEGER DEFAULT 0,
  starred INTEGER DEFAULT 0,
  deleted_by_sender INTEGER DEFAULT 0,
  deleted_by_receiver INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS private_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_subject ON ratings(subject_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_mails_to ON mails(to_user_id, read);
CREATE INDEX IF NOT EXISTS idx_mails_from ON mails(from_user_id);
CREATE INDEX IF NOT EXISTS idx_pm_conversation ON private_messages(from_user_id, to_user_id);

-- 好友请求表
CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(from_user_id, to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_fr_from ON friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_fr_to ON friend_requests(to_user_id, status);
