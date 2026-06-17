-- v016: 用户画像与个性化推荐系统
-- 新增 user_profiles、behavior_log、recommend_cache 三张表

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  tag_weights TEXT DEFAULT '{}',
  type_affinity TEXT DEFAULT '{}',
  consumption_stats TEXT DEFAULT '{}',
  rating_tendency TEXT DEFAULT 'normal',
  activity_score REAL DEFAULT 0,
  last_action_at TEXT,
  version INTEGER DEFAULT 1,
  similar_users TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS behavior_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT DEFAULT '',
  target_id INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_behavior_user ON behavior_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_target ON behavior_log(target_type, target_id);

CREATE TABLE IF NOT EXISTS recommend_cache (
  user_id INTEGER NOT NULL,
  scene TEXT NOT NULL,
  items TEXT NOT NULL,
  generated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, scene)
);