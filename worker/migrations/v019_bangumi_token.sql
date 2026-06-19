-- worker/migrations/v019_bangumi_token.sql
-- 为用户表添加 Bangumi OAuth token 相关字段

ALTER TABLE users ADD COLUMN bangumi_access_token TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_refresh_token TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_token_expires_at INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_user_id INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_username TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_avatar TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN bangumi_bound_at INTEGER DEFAULT NULL;