-- v017: 产品级搜广推系统
-- 新增 user_profile_short、promotion_slots 表
-- 扩展 user_profiles 表

-- 短期画像表（7天行为聚合）
CREATE TABLE IF NOT EXISTS user_profile_short (
  user_id INTEGER PRIMARY KEY,
  recent_tags TEXT DEFAULT '{}',
  recent_types TEXT DEFAULT '{}',
  recent_actions INTEGER DEFAULT 0,
  recent_subjects TEXT DEFAULT '[]',
  session_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 推广位表
CREATE TABLE IF NOT EXISTS promotion_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  title TEXT,
  cover_url TEXT,
  weight INTEGER DEFAULT 1,
  start_at TEXT,
  end_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_promo_slot ON promotion_slots(slot_name, is_active);

-- 扩展 user_profiles 表
ALTER TABLE user_profiles ADD COLUMN social_features TEXT DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN preference_vector TEXT DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN lifecycle_stage TEXT DEFAULT 'new';