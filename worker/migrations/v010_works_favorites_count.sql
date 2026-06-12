-- v010 — 为 works 增加 favorites_count 去规范化计数列
-- 用途：works 收藏接口（POST /api/works/:id/favorite）会维护该计数，
-- 但 v009 漏建此列，导致收藏相关 SQL 报 "no such column: favorites_count"。
-- 与 likes_count / comments_count 保持一致的去规范化计数模式。

ALTER TABLE works ADD COLUMN favorites_count INTEGER DEFAULT 0;
