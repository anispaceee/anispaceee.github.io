-- ANISpace D1 Database Schema
-- Cloudflare D1 (SQLite) 初始化脚本
-- 列名/表名与 Worker 代码 (oauth-proxy.js) 保持一致

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  username TEXT NOT NULL,
  name TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  level INTEGER DEFAULT 1,
  sign TEXT DEFAULT '',
  gender TEXT DEFAULT 'other',
  birthday TEXT DEFAULT '',
  following_count INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  join_date TEXT NOT NULL,
  last_login TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  preferences TEXT DEFAULT '{}',
  allow_profile_view INTEGER DEFAULT 1,
  allow_comments_public INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provider, provider_id)
);

-- 帖子表
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT '',
  likes INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 回复表
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 收藏标记表（表名 collections，与 Worker 一致）
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER NOT NULL,
  subject_type TEXT DEFAULT '',
  subject_name TEXT DEFAULT '',
  subject_image TEXT DEFAULT '',
  status TEXT NOT NULL,
  rating INTEGER DEFAULT 0,
  comment TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, subject_id)
);

-- 关注关系表
CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(from_user_id, to_user_id)
);

-- 点赞表（与 Worker 一致：user_id + post_id）
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  post_id INTEGER NOT NULL REFERENCES posts(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, post_id)
);

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  from_user_id INTEGER DEFAULT 0,
  target_type TEXT DEFAULT '',
  target_id INTEGER DEFAULT 0,
  content TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 世界频道消息表
CREATE TABLE IF NOT EXISTS world_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 新闻/资讯表
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT DEFAULT '',
  link TEXT DEFAULT '',
  category TEXT DEFAULT '',
  content TEXT DEFAULT '',
  images TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 评分表
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

-- 收藏表（"喜欢"按钮，与 collections 不同）
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL DEFAULT 'info',
  target_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, target_type, target_id)
);

-- 邮件表
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

-- 私信表
CREATE TABLE IF NOT EXISTS private_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id);
CREATE INDEX IF NOT EXISTS idx_collection_user ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_subject ON collections(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_follows_from ON follows(from_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_to ON follows(to_user_id);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_world_messages_created ON world_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_created ON news(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_subject ON ratings(subject_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_mails_to ON mails(to_user_id, read);
CREATE INDEX IF NOT EXISTS idx_mails_to_created ON mails(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mails_from ON mails(from_user_id);
CREATE INDEX IF NOT EXISTS idx_pm_conversation ON private_messages(from_user_id, to_user_id);
CREATE INDEX IF NOT EXISTS idx_pm_to_read ON private_messages(to_user_id, from_user_id, read);

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

-- 好友空间动态表
CREATE TABLE IF NOT EXISTS friend_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  images TEXT DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'friends' CHECK(visibility IN ('public', 'friends', 'private')),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 好友动态评论表
CREATE TABLE IF NOT EXISTS friend_post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES friend_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 好友动态点赞表
CREATE TABLE IF NOT EXISTS friend_post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES friend_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);

-- 好友相关索引
CREATE INDEX IF NOT EXISTS idx_fr_from ON friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_fr_to ON friend_requests(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_fp_user ON friend_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_fp_visibility ON friend_posts(visibility);
CREATE INDEX IF NOT EXISTS idx_fpc_post ON friend_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_fpl_post ON friend_post_likes(post_id);
