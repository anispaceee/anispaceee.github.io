-- v013 — bangumi_subjects：标记触发式全量条目数据
-- 当用户首次标记一个条目时，从 Bangumi API 拉取全量数据存入此表
-- 搜索/详情获取时优先查此表，减少对官方 API 的依赖

CREATE TABLE IF NOT EXISTS bangumi_subjects (
  id            INTEGER PRIMARY KEY,       -- Bangumi subject ID
  type          INTEGER DEFAULT 2,         -- 1=book 2=anime 3=music 4=game 6=real
  name          TEXT NOT NULL DEFAULT '',   -- 原名
  name_cn       TEXT DEFAULT '',            -- 中文名
  summary       TEXT DEFAULT '',            -- 简介
  image         TEXT DEFAULT '',            -- 海报图（large URL）
  images        TEXT DEFAULT '{}',          -- 全部图片尺寸 JSON
  score         REAL DEFAULT 0,             -- 评分
  rank          INTEGER DEFAULT 0,          -- 排名
  rating        TEXT DEFAULT '{}',          -- 完整评分数据 JSON {score, total, count}
  tags          TEXT DEFAULT '[]',          -- 标签 JSON [{name,count},...]
  eps           INTEGER DEFAULT 0,          -- 集数
  air_date      TEXT DEFAULT '',            -- 开播日
  air_weekday   INTEGER DEFAULT 0,          -- 放送星期
  platform      TEXT DEFAULT '',            -- 平台
  infobox       TEXT DEFAULT '[]',          -- 详细信息 JSON
  crt           TEXT DEFAULT '[]',          -- 角色 JSON
  staff         TEXT DEFAULT '[]',          -- 制作人员 JSON
  collection    TEXT DEFAULT '{}',          -- 收藏统计 JSON
  source        TEXT DEFAULT 'enrich',      -- 数据来源: enrich=标记入库, sync=批量同步
  enriched_at   TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bs_type ON bangumi_subjects(type, score DESC);
CREATE INDEX IF NOT EXISTS idx_bs_rank ON bangumi_subjects(rank);
CREATE INDEX IF NOT EXISTS idx_bs_name ON bangumi_subjects(name);
CREATE INDEX IF NOT EXISTS idx_bs_name_cn ON bangumi_subjects(name_cn);
