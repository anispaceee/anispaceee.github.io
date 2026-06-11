-- v008 — bangumi_index：本地番剧元数据索引
-- 来源：bangumi/data 仓库，每周自动同步
-- 用途：补全官方 /search/subjects 覆盖不到的长尾 / 冷数据条目

CREATE TABLE IF NOT EXISTS bangumi_index (
  id          INTEGER PRIMARY KEY,           -- 官方 bangumi subject id
  title       TEXT NOT NULL,                 -- 原名
  title_cn    TEXT DEFAULT '',               -- 中文/简体中文译名
  title_ja    TEXT DEFAULT '',               -- 日文原名
  aliases     TEXT DEFAULT '[]',             -- 别名数组 JSON
  type        INTEGER DEFAULT 2,             -- 1=book 2=anime 3=music 4=game 6=real
  begin       TEXT DEFAULT '',               -- 开播日 YYYY-MM-DD
  end         TEXT DEFAULT '',               -- 完结日
  score       REAL DEFAULT 0,                -- 官方评分
  rank        INTEGER DEFAULT 0,             -- 官方排名
  summary     TEXT DEFAULT '',               -- 简介
  image       TEXT DEFAULT '',               -- 海报
  sites       TEXT DEFAULT '{}',             -- 外部链接 JSON {mal, anilist, ...}
  week        TEXT DEFAULT '[]',             -- 放送日数组
  source_hash TEXT NOT NULL,                 -- 同步时 bangumi-data 仓库 commit hash
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- 搜索用的覆盖索引（覆盖 name / name_cn / alias 的 LIKE）
CREATE INDEX IF NOT EXISTS idx_bangumi_index_title  ON bangumi_index(title);
CREATE INDEX IF NOT EXISTS idx_bangumi_index_title_cn ON bangumi_index(title_cn);
CREATE INDEX IF NOT EXISTS idx_bangumi_index_type   ON bangumi_index(type, score DESC);
CREATE INDEX IF NOT EXISTS idx_bangumi_index_rank   ON bangumi_index(rank);
CREATE INDEX IF NOT EXISTS idx_bangumi_index_updated ON bangumi_index(updated_at);

-- 元数据表：记录每次同步状态
CREATE TABLE IF NOT EXISTS bangumi_index_meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);
