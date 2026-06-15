-- v014 — users 表增加 auto_enrich 列
-- 控制标记条目时是否自动从 Bangumi API 拉取全量数据入库
-- 默认开启 (1)，用户可在设置中关闭

ALTER TABLE users ADD COLUMN auto_enrich INTEGER DEFAULT 1;
