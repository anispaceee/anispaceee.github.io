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
  allow_guestbook INTEGER DEFAULT 1,
  show_posts INTEGER DEFAULT 1,
  show_news INTEGER DEFAULT 1,
  -- 邀请制相关字段
  invite_code TEXT,
  invite_count INTEGER DEFAULT 0,
  invite_quota INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 1,
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
  tags TEXT DEFAULT '[]',
  images TEXT DEFAULT '[]',
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
  parent_id INTEGER DEFAULT NULL REFERENCES replies(id),
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

-- 点赞表（与 Worker 一致：user_id + post_id / reply_id）
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  post_id INTEGER DEFAULT NULL REFERENCES posts(id),
  reply_id INTEGER DEFAULT NULL REFERENCES replies(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, COALESCE(post_id, 0), COALESCE(reply_id, 0))
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
  cover TEXT DEFAULT '',
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
CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_id);
CREATE INDEX IF NOT EXISTS idx_collection_user ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_subject ON collections(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_follows_from ON follows(from_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_to ON follows(to_user_id);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_reply ON likes(reply_id);
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

-- 爬取资讯表（多源聚合）
CREATE TABLE IF NOT EXISTS scraped_news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT DEFAULT '',
  title TEXT NOT NULL,
  link TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  cover TEXT DEFAULT '',
  category TEXT DEFAULT '',
  extra TEXT DEFAULT '{}',
  scraped_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source, source_id)
);

-- 好友相关索引
CREATE INDEX IF NOT EXISTS idx_fr_from ON friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_fr_to ON friend_requests(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_fp_user ON friend_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_fp_visibility ON friend_posts(visibility);
CREATE INDEX IF NOT EXISTS idx_fpc_post ON friend_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_fpl_post ON friend_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_scraped_news_source ON scraped_news(source, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_news_category ON scraped_news(category, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_news_scraped ON scraped_news(scraped_at DESC);

-- ============================================================
-- 武藏也创作者平台（musashi）
-- ============================================================

-- 作品主表
CREATE TABLE works (
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
  favorites_count INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  is_flagged INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 小说章节表
CREATE TABLE novel_chapters (
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
CREATE TABLE manga_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(work_id, chapter_number)
);

-- 漫画页面表
CREATE TABLE manga_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES manga_chapters(id),
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chapter_id, page_number)
);

-- Galgame 下载表
CREATE TABLE galgame_downloads (
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
CREATE TABLE galgame_previews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  caption TEXT DEFAULT ''
);

-- 作品评论表
CREATE TABLE work_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 作品收藏表
CREATE TABLE work_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- 作品点赞表
CREATE TABLE work_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- 阅读进度表
CREATE TABLE reading_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  chapter_number INTEGER DEFAULT 0,
  chapter_id INTEGER,
  scroll_position REAL DEFAULT 0,
  percentage REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- 作品评分表
CREATE TABLE work_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, work_id)
);

-- 作品举报表
CREATE TABLE work_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'resolved', 'dismissed')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- 武藏也相关索引
CREATE INDEX idx_works_author ON works(author_id);
CREATE INDEX idx_works_type ON works(type, created_at DESC);
CREATE INDEX idx_works_status ON works(status, created_at DESC);
CREATE INDEX idx_works_visibility ON works(visibility);
CREATE INDEX idx_works_created ON works(created_at DESC);
CREATE INDEX idx_works_likes ON works(likes_count DESC);
CREATE INDEX idx_works_views ON works(views_count DESC);
CREATE INDEX idx_novel_chapters_work ON novel_chapters(work_id, chapter_number);
CREATE INDEX idx_manga_chapters_work ON manga_chapters(work_id, chapter_number);
CREATE INDEX idx_manga_pages_chapter ON manga_pages(chapter_id, page_number);
CREATE INDEX idx_galgame_downloads_work ON galgame_downloads(work_id, platform);
CREATE INDEX idx_galgame_previews_work ON galgame_previews(work_id, sort_order);
CREATE INDEX idx_work_comments_work ON work_comments(work_id, created_at DESC);
CREATE INDEX idx_work_favorites_user ON work_favorites(user_id);
CREATE INDEX idx_work_favorites_work ON work_favorites(work_id);
CREATE INDEX idx_work_likes_user ON work_likes(user_id);
CREATE INDEX idx_work_likes_work ON work_likes(work_id);
CREATE INDEX idx_reading_progress_user ON reading_progress(user_id);
CREATE INDEX idx_work_ratings_user ON work_ratings(user_id);
CREATE INDEX idx_work_ratings_work ON work_ratings(work_id);
CREATE INDEX idx_work_reports_status ON work_reports(status, created_at DESC);

-- 用户留言板表
CREATE TABLE IF NOT EXISTS user_guestbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  reply_to_id INTEGER DEFAULT NULL REFERENCES user_guestbook(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guestbook_user ON user_guestbook(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_author ON user_guestbook(author_id);
CREATE INDEX IF NOT EXISTS idx_guestbook_reply ON user_guestbook(reply_to_id);

-- 条目评论表
CREATE TABLE IF NOT EXISTS subject_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subject_comments_subject ON subject_comments(subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subject_comments_user ON subject_comments(user_id);

-- ============================================================
-- 邀请制系统
-- ============================================================

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
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, permission)
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

-- 邀请制相关索引
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
CREATE INDEX IF NOT EXISTS idx_invite_relations_invitee ON invite_relations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_invite_relations_inviter ON invite_relations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON user_permissions(permission);
CREATE INDEX IF NOT EXISTS idx_invite_rewards_relation ON invite_rewards(invite_relation_id);
