# 标记触发式条目全量入库

**日期**：2026-06-11
**状态**：已确认

## 背景

当前 ANISpace 对 Bangumi 数据的获取存在两套系统：

1. **`bangumi_index`**（D1 轻量索引）：来自 bangumi-data 仓库，仅含 title/score/rank/image/summary 等基础字段，缺少 infobox/crt/staff/eps/tags 等详情
2. **官方 API 代理**：前端通过 Worker 代理直接调 Bangumi API，每次请求都走外网

问题：每次查看条目详情都依赖官方 API，在国内网络环境下不稳定，且无法利用已有数据。

## 目标

当任意用户首次标记一个条目（看过/在看/想看/搁置/抛弃）时，将该条目的全量数据存入后端 D1 数据库。后续搜索和详情获取优先使用后端数据，减少对 Bangumi 官方 API 的依赖。

## 设计

### 1. 新建 `bangumi_subjects` 表

存储全量条目数据，与 `bangumi_index`（轻量索引）独立：

```sql
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
```

**设计要点**：
- 主键为 Bangumi subject ID，与 `bangumi_index` 一致
- 大字段（infobox/crt/staff/tags/rating/images/collection）用 JSON 存储
- `source` 字段区分数据来源（enrich=标记入库, sync=批量同步）
- `enriched_at` 记录入库时间，可用于数据新鲜度判断

### 2. 入库触发：修改 `POST /api/collections`

在现有 `POST /api/collections` 端点中，异步触发条目入库：

```
用户标记 → INSERT/UPDATE collections
  → 检查 bangumi_subjects 是否有该 subject_id
    → 无：调 Bangumi API /subject/{id}?responseGroup=large → 存入 bangumi_subjects
    → 有：跳过
```

**关键**：入库操作用 `waitUntil` 异步执行，不阻塞标记响应。用户标记操作零延迟。

### 3. 搜索优先级调整

修改 Worker 端 `bangumi-search.js` 的搜索流程：

```
搜索请求 → bangumi_subjects（全量数据，优先）
         → bangumi_index（轻量索引，补充）
         → 官方 API 兜底
```

具体逻辑：
1. 先查 `bangumi_subjects`（LIKE 匹配 name/name_cn），命中则直接返回
2. 再查 `bangumi_index`，补充 `bangumi_subjects` 未覆盖的条目
3. 合并去重后仍不足阈值时，调官方 API 兜底
4. 兜底结果回写 `bangumi_index`（现有逻辑不变）

### 4. 详情获取调整

修改 `getDetail` 函数：

```
详情请求 → bangumi_subjects（全量，优先）
         → bangumi_index（轻量，补充）
         → 官方 API 兜底
```

`bangumi_subjects` 命中时可直接返回完整数据，无需再调官方 API。

### 5. 前端影响

- **搜索**：`BangumiSearchService.search()` 无需修改，Worker 端透明升级
- **详情**：`BangumiSearchService.getDetail()` 无需修改
- **标记**：`CollectionMarkService.upsert()` 无需修改，Worker 端透明触发入库
- **图片**：入库时存储原始 Bangumi 图片 URL，前端 `normalizeSubject` 的图片代理逻辑不变

### 6. 数据新鲜度

- 入库后不自动更新（标记触发的是一次性入库）
- 可后续增加定时任务刷新热门条目数据
- `updated_at` 字段可用于判断数据是否过期

## 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `worker/migrations/v009_bangumi_subjects.sql` | 新建表 + 索引 |
| `worker/lib/bangumi-search.js` | 搜索/详情优先查 bangumi_subjects |
| `worker/oauth-proxy.js` | POST /api/collections 中异步触发入库 |
| `worker/lib/bangumi-enrich.js` | 新建：入库逻辑（调 API + 存 D1） |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Bangumi API 不可用时入库失败 | 异步执行不阻塞标记，失败静默跳过 |
| D1 存储增长 | 按需入库（仅被标记的条目），增长可控 |
| 数据过时 | 后续可加定时刷新，当前优先保证可用性 |
| 入库 API 调用被限流 | Worker 端复用已有代理逻辑，429 时退避重试 |
