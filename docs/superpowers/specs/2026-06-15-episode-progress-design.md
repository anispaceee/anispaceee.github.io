# 动画进度栏（点格子）功能设计文档

> 日期：2026-06-15
> 状态：待确认

## 1. 需求概述

在条目详情页新增「进度」Tab，用户可以点击格子标记每集的观看状态，并为每集单独写评论。

### 核心需求
- 格子点击切换「已看/未看」
- 每集可单独评论（默认公开，可选私密）
- 支持批量操作（一键标记全部已看、清除全部）
- 数据存后端 D1，登录后跨设备同步

### 适用范围
- 动画（type=2）和三次元（type=6）

## 2. 数据模型

### 2.1 新增表：`episode_progress`

```sql
CREATE TABLE IF NOT EXISTS episode_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER NOT NULL,
  episode_id INTEGER NOT NULL,
  episode_sort REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'watched',
  is_private INTEGER DEFAULT 0,
  comment TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_ep_progress_user_subject ON episode_progress(user_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_ep_progress_episode ON episode_progress(episode_id);
CREATE INDEX IF NOT EXISTS idx_ep_progress_subject_public ON episode_progress(subject_id, is_private);
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | INTEGER FK | 用户ID |
| subject_id | INTEGER | Bangumi 条目ID |
| episode_id | INTEGER | Bangumi 集数ID（唯一标识一集） |
| episode_sort | REAL | 集数序号（如 1, 2, 12.5），用于排序和显示 |
| status | TEXT | `watched`（已看）/ `dropped`（弃看） |
| is_private | INTEGER | 0=公开（默认），1=私密 |
| comment | TEXT | 每集评论内容 |

### 2.2 Migration 文件

`v015_episode_progress.sql`

## 3. API 设计

### 3.1 GET `/api/subjects/:id/progress`

获取当前用户在某条目的所有集数进度。

**请求头**：`Authorization: Bearer <token>`（可选，未登录返回空）

**响应**：
```json
{
  "progress": [
    {
      "episode_id": 12345,
      "episode_sort": 1,
      "status": "watched",
      "is_private": 0,
      "comment": "第一集好精彩！",
      "updated_at": "2026-06-15 10:00:00"
    }
  ]
}
```

### 3.2 POST `/api/subjects/:id/progress`

标记/更新单集进度（upsert 语义）。

**请求头**：`Authorization: Bearer <token>`（必须）

**请求体**：
```json
{
  "episode_id": 12345,
  "episode_sort": 1,
  "status": "watched",
  "comment": "第一集好精彩！",
  "is_private": false
}
```

**逻辑**：
- 如果 `user_id + episode_id` 已存在 → UPDATE
- 如果不存在 → INSERT
- 如果 `status` 为空/null → DELETE（取消标记）

**响应**：
```json
{
  "ok": true,
  "progress": { ... }
}
```

### 3.3 DELETE `/api/subjects/:id/progress/:episodeId`

取消单集标记。

**请求头**：`Authorization: Bearer <token>`（必须）

**响应**：
```json
{ "ok": true }
```

### 3.4 POST `/api/subjects/:id/progress/batch`

批量操作。

**请求头**：`Authorization: Bearer <token>`（必须）

**请求体**：
```json
{
  "action": "mark_all_watched",
  "episodes": [
    { "episode_id": 12345, "episode_sort": 1 },
    { "episode_id": 12346, "episode_sort": 2 }
  ]
}
```

`action` 可选值：
- `mark_all_watched`：批量标记已看
- `clear_all`：清除所有进度

**响应**：
```json
{ "ok": true, "affected": 12 }
```

### 3.5 GET `/api/subjects/:id/ep-comments`

获取某条目的公开集评（其他用户的）。

**查询参数**：
- `episode_id`（可选）：筛选特定集
- `limit`（默认 50）
- `offset`（默认 0）

**响应**：
```json
{
  "comments": [
    {
      "id": 1,
      "episode_id": 12345,
      "episode_sort": 1,
      "user_id": 42,
      "username": "Alice",
      "avatar": "https://...",
      "comment": "第一集好精彩！",
      "is_private": 0,
      "created_at": "2026-06-15 10:00:00"
    }
  ],
  "has_more": false
}
```

## 4. 前端设计

### 4.1 Tab 位置

在「评论区」之后插入「进度」tab，仅 type=2 或 type=6 显示：

```
条目介绍 | 详情 | 出场角色 | 评论区 | 进度 | 字幕组资源 | 站内观看 | ...
```

### 4.2 格子布局

```
┌──────────────────────────────────────────────────┐
│  进度                                    批量操作 ▼│
│  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐   │
│  │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │10 │11 │   │
│  │ ✓ │ ✓ │ ✓ │   │   │   │   │   │   │   │   │   │
│  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘   │
│  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐   │
│  │12 │13 │   │   │   │   │   │   │   │   │   │   │
│  │   │   │   │   │   │   │   │   │   │   │   │   │
│  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘   │
│                                                    │
│  已看 3/13 话                                      │
│                                                    │
│  ── 其他人的集评 ──                                 │
│  Alice · 第1话：第一集好精彩！                      │
│  Bob · 第2话：OP 好听                               │
└──────────────────────────────────────────────────┘
```

### 4.3 格子状态

| 状态 | 视觉 |
|------|------|
| 未看 | 半透明/浅色边框，集数编号 |
| 已看 | 主题色填充 + ✓ 标记 |
| 已看+有评论 | 主题色填充 + ✓ + 右上角💬小图标 |
| 弃看 | 灰色填充 + ✗ 标记 |

### 4.4 交互流程

1. **点击格子**：切换已看/未看（单次点击 toggle）
2. **点击评论图标 / 右键格子**：弹出评论弹窗
3. **评论弹窗内容**：
   - 集数标题（如「第1话 はじまり」）
   - 状态切换（已看/弃看/未看）
   - 评论输入框（textarea）
   - 私密开关（默认公开）
   - 保存/取消按钮
4. **批量操作**：右上角下拉菜单
   - 「标记全部已看」
   - 「清除全部进度」

### 4.5 进度统计

格子区域下方显示：
- 已看 X/Y 话
- 进度条（可选）

### 4.6 公开集评列表

格子区域下方展示其他用户的公开评论：
- 按集数排序
- 显示用户头像、用户名、集数、评论内容
- 可筛选特定集

## 5. 实现步骤

### Phase 1：后端
1. 创建 migration `v015_episode_progress.sql`
2. Worker 新增 5 个 API 端点
3. 部署 + 执行 migration

### Phase 2：前端
1. InfoDetail.jsx 新增「进度」tab
2. 实现格子组件（EpisodeGrid）
3. 实现评论弹窗（EpisodeCommentModal）
4. 实现批量操作
5. 实现公开集评列表
6. InfoDetail.css 新增样式

## 6. 与现有系统的关系

- **集数数据来源**：复用 `BangumiService.getSubjectEpisodes(id)`，返回的 episode 数据包含 `id`、`sort`、`name` 等字段
- **评论系统**：集评独立于条目评论（`subject_comments` 表），使用新的 `episode_progress` 表的 `comment` 字段
- **收藏标记**：进度与收藏标记（`collections` 表）独立，但可以联动——标记进度时如果未收藏，可以提示收藏
- **认证**：复用现有 JWT token 认证机制
