-- 邀请制系统迁移文件
-- 此文件只包含新增的邀请制相关表

-- 邀请码表
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  type TEXT DEFAULT 'social',
  status TEXT DEFAULT 'active',
  expires_at TEXT,
  permissions TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 邀请关系表
CREATE TABLE IF NOT EXISTS invite_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_id INTEGER NOT NULL REFERENCES invites(id),
  inviter_id INTEGER NOT NULL REFERENCES users(id),
  invitee_id INTEGER NOT NULL REFERENCES users(id),
  granted_permissions TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 用户权限表
CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  permission TEXT NOT NULL,
  granted_by INTEGER REFERENCES users(id),
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 邀请奖励表
CREATE TABLE IF NOT EXISTS invite_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_relation_id INTEGER NOT NULL REFERENCES invite_relations(id),
  reward_type TEXT NOT NULL,
  reward_value TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  claimed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
CREATE INDEX IF NOT EXISTS idx_invite_relations_invitee ON invite_relations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_invite_relations_inviter ON invite_relations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON user_permissions(permission);
CREATE INDEX IF NOT EXISTS idx_invite_rewards_relation ON invite_rewards(invite_relation_id);

-- 用户表扩展字段（需要手动检查是否已存在）
-- ALTER TABLE users ADD COLUMN invite_code TEXT;
-- ALTER TABLE users ADD COLUMN invite_count INTEGER DEFAULT 0;
-- ALTER TABLE users ADD COLUMN invite_quota INTEGER DEFAULT 0;
-- ALTER TABLE users ADD COLUMN total_points INTEGER DEFAULT 0;
-- ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 1;
