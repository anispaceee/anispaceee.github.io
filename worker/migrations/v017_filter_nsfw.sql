-- v017_filter_nsfw: 用户限制级内容过滤开关
-- 默认 1 = 开启屏蔽限制级内容
ALTER TABLE users ADD COLUMN filter_nsfw INTEGER DEFAULT 1;