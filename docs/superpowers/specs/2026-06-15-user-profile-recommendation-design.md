# ANISpace 用户画像与个性化推荐系统 — 设计文档

> 版本：v1.0 | 日期：2026-06-15 | 状态：已确认

---

## 一、项目概述

为 ANISpace 构建用户画像体系，并基于画像优化三个核心场景的个性化体验：
1. **Navi AI**：注入用户画像，使回答更贴合用户喜好
2. **毒电波资讯流**：类型亲和度加权排序
3. **放课后帖子推送**：板区偏好加权排序
4. **首页随心斩**：协同过滤 + 标签匹配 + 热门兜底

---

## 二、架构总览

```
┌─────────────────────────────────────────────────────┐
│                     前端 (React)                     │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Amadeus │ │HomePage  │ │ Forum    │ │NewsZone │ │
│  │ (Navi)  │ │(随心斩)  │ │(放课后)  │ │(毒电波) │ │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       │   画像注入  │  推荐缓存   │  推荐缓存  │ 推荐缓存│
│       ▼           ▼           ▼           ▼        │
│  ┌─────────────────────────────────────────────┐    │
│  │          api.js (统一 API 层)                │    │
│  └────────────────────┬────────────────────────┘    │
└───────────────────────┼─────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────┐
│              Cloudflare Worker                       │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │/api/   │ │/api/     │ │/api/     │ │/api/     │ │
│  │profile │ │recommend │ │behavior  │ │llm/chat  │ │
│  │ 画像CRUD│ │ 推荐结果  │ │ 行为上报  │ │ (增强)   │ │
│  └───┬────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│      │           │           │           │         │
│  ┌───┴───────────┴───────────┴───────────┴─────┐   │
│  │        Profile Engine (lib/user-profile.js)  │   │
│  │  - 画像计算  - 相似度  - CF推荐  - 缓存管理  │   │
│  └─────────────────────┬───────────────────────┘   │
│                        │                            │
│  ┌─────────────────────┴───────────────────────┐   │
│  │              D1 Database                     │   │
│  │  user_profiles | behavior_log | recommend_cache│  │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Cron: 每小时刷新活跃用户推荐缓存                     │
└─────────────────────────────────────────────────────┘
```

---

## 三、数据库设计

### 3.1 `user_profiles` — 用户画像主表

```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  tag_weights TEXT DEFAULT '{}',          -- JSON: {"科幻": 0.8, "恋爱": 0.5, ...}
  type_affinity TEXT DEFAULT '{}',        -- JSON: {"anime": 0.7, "game": 0.3, ...}
  consumption_stats TEXT DEFAULT '{}',    -- JSON: {total_collections, avg_rating, ...}
  rating_tendency TEXT DEFAULT 'normal',  -- "strict" | "normal" | "generous"
  activity_score REAL DEFAULT 0,          -- 0-1 活跃度
  last_action_at TEXT,
  version INTEGER DEFAULT 1,              -- 画像版本号
  similar_users TEXT DEFAULT '[]',        -- JSON: [{user_id, similarity}, ...]
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 3.2 `behavior_log` — 行为日志（7天保留）

```sql
CREATE TABLE IF NOT EXISTS behavior_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,                   -- 'view_subject' | 'mark_collection' | 'rate' | 'post_view' | 'news_click'
  target_type TEXT DEFAULT '',            -- 'anime' | 'game' | 'novel' | 'post' | 'news'
  target_id INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',             -- {duration_ms, source, ...}
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_behavior_user ON behavior_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_target ON behavior_log(target_type, target_id);
```

### 3.3 `recommend_cache` — 推荐结果缓存

```sql
CREATE TABLE IF NOT EXISTS recommend_cache (
  user_id INTEGER NOT NULL,
  scene TEXT NOT NULL,                    -- 'home_random' | 'forum_posts' | 'news_feed'
  items TEXT NOT NULL,                    -- JSON: [{subject_id, score, reason}, ...]
  generated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, scene)
);
```

### 3.4 数据经济性

| 资源 | 估算（1000用户） | 说明 |
|------|-----------------|------|
| `user_profiles` | ~2MB | 每条 ~2KB |
| `behavior_log`(7d) | ~2.8MB | 100人×20条/天×200B |
| `recommend_cache` | ~3MB | 1000人×3场景×1KB |
| **总计** | **< 10MB** | D1 免费额度 5GB，充裕 |

---

## 四、用户画像引擎

### 4.1 标签权重（类 TF-IDF）

```
tag_weight(t) = TF(t) × IDF(t)

TF(t)  = 用户含标签t的收藏数 / 用户总收藏数
IDF(t) = log(总用户数 / 含标签t的用户数)
```

数据源：`collections` 表 + `bangumi_subjects.tags` 字段。

### 4.2 类型亲和度

```
type_affinity("anime") = 用户收藏中 type=2 的条目数 / 总收藏数
```

按 anime(2)、game(4)、novel(1)、real(6) 四类归一化。

### 4.3 消费统计

```json
{
  "total_collections": 50,
  "avg_rating": 7.2,
  "rating_std": 1.5,
  "collection_by_status": {
    "collect": 20, "wish": 15, "do": 8, "on_hold": 5, "dropped": 2
  },
  "top_genres": ["科幻", "恋爱", "日常"]
}
```

### 4.4 评分倾向

- `avg_rating ≥ 8.5` 且 `rating_std < 1.0` → `"generous"`
- `avg_rating ≤ 5.0` 或 `rating_std > 2.5` → `"strict"`
- 其他 → `"normal"`

### 4.5 相似用户（余弦相似度）

```
similarity(A, B) = (Σ tag_weight_A(t) × tag_weight_B(t))
                 / (√Σ tag_weight_A² × √Σ tag_weight_B²)
```

取 top-20 存入 `similar_users`。

### 4.6 按需懒更新

- 用户打开 Navi AI 时，检查 `updated_at` 距现在 > 24h → 触发 `POST /api/profile/refresh`
- 用户收藏数变化 > 5（距上次更新）→ 下次访问时触发
- 计算在 Worker 端执行，通过 API 触发

---

## 五、推荐引擎

### 5.1 随心斩 `scene: home_random`

```
候选池 = 协同过滤推荐 ∪ 标签匹配推荐 ∪ 热门兜底
         ↓
      去重（排除已收藏 + 近期展示历史）
         ↓
      加权随机采样（CF权重 0.5，标签匹配 0.3，热门 0.2）
         ↓
      返回 1 条结果
```

- **CF推荐**：从 `similar_users` top-20 中取相似用户收藏（排除已收藏），按被收藏次数排序
- **标签匹配**：从 `bangumi_subjects` 按 top-3 标签搜索，评分 ≥ 6.5
- **热门兜底**：`bangumi_subjects` 按评分排序 top-100

### 5.2 放课后帖子 `scene: forum_posts`

```
帖子得分 = 基础排序分 × 类型匹配加权
          ↓
type_affinity > 0.5 且匹配板区 → ×1.3
type_affinity > 0.3 且匹配板区 → ×1.15
无匹配 → ×1.0
```

### 5.3 毒电波资讯 `scene: news_feed`

```
资讯得分 = 基础热度分 × 类型匹配加权
          ↓
资讯分类与 type_affinity > 0.5 的类型匹配 → ×1.3
资讯分类与 type_affinity > 0.3 的类型匹配 → ×1.15
无匹配 → ×1.0
```

### 5.4 预计算缓存

- **Cron**：每小时执行 `refreshRecommendCache`
- **范围**：`behavior_log` 中 7 天内有行为的活跃用户
- **写入**：`recommend_cache` UPSERT
- **降级**：缓存未命中 → 热门推荐；缓存过期(>24h) → 返回缓存 + 后台标记刷新

---

## 六、Navi AI 集成

### 6.1 画像注入格式

`buildSystemPrompt` 新增画像片段，替代简单 `userTags`：

```
【用户画像】
- 偏好标签（权重越高越喜欢）：科幻(80%)、恋爱(50%)、日常(40%)...
- 类型偏好：动画类70%、游戏类30%
- 收藏总数：50，平均评分：7.2
- 评分风格：正常
当用户请求推荐时，优先推荐与以上偏好匹配的作品。
```

### 6.2 触发流程

1. 用户打开 `Amadeus` 组件
2. 调用 `GET /api/profile` 获取画像
3. 检查 `updated_at` 是否 > 24h，若是则触发 `POST /api/profile/refresh`
4. 将画像 JSON 传入 `buildSystemPrompt(persona, profile)`
5. 后续对话中 LLM 始终感知用户偏好

---

## 七、API 路由

| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| `GET` | `/api/profile` | 获取当前用户画像 | JWT |
| `POST` | `/api/profile/refresh` | 触发画像重算 | JWT |
| `GET` | `/api/recommend?scene=` | 获取推荐缓存 | JWT |
| `POST` | `/api/behavior` | 上报用户行为 | JWT |
| `GET` | `/api/recommend/refresh` | 管理员手动刷新全局缓存 | Admin |

---

## 八、文件改动清单

### 8.1 Worker 新增

| 文件 | 说明 |
|------|------|
| `lib/user-profile.js` | 画像计算引擎（TF-IDF、相似度、消费统计） |
| `lib/recommend-engine.js` | 推荐引擎（CF、标签匹配、缓存管理） |
| `migrations/v016_user_profile.sql` | 三张新表 DDL |

### 8.2 Worker 修改

| 文件 | 改动 |
|------|------|
| `oauth-proxy.js` | 新增 5 个路由处理 + scheduled handler 中增加推荐缓存刷新 |
| `schema.sql` | 追加三张新表定义 |

### 8.3 前端修改

| 文件 | 改动 |
|------|------|
| `personas.js` | `buildSystemPrompt` 新增 `profile` 参数 |
| `Amadeus.jsx` | 打开时获取画像 + 懒更新检查 |
| `HomePage.jsx` | `fetchRandom` 改为调用 `/api/recommend?scene=home_random` |
| `Forum.jsx` | `loadPosts` 增加 `type_affinity` 加权排序 |
| `NewsZone.jsx` | 资讯列表增加类型匹配加权排序 |
| `api.js` | 新增 `ProfileService`、`BehaviorService`、`RecommendService` |

---

## 九、关键决策记录

1. **方案选择**：标签向量 + User-based CF（方案A），而非 Item-based CF（方案B），因为用户数 < 条目数，User-based CF 在 D1 上更高效
2. **行为存储**：后端 D1 短期存储（7天），而非前端 localStorage，确保跨设备一致性
3. **画像计算**：后端 Worker 计算 + 前端 API 触发，而非 Cron 批量，减少无效计算
4. **推荐刷新**：Cron 预计算缓存，而非实时计算，降低 API 延迟
5. **Navi 集成**：System prompt 注入，而非 function calling，实现简单且 LLM 可直接使用
6. **画像更新**：按需懒更新（24h 或收藏增量 > 5），而非实时增量，减少 Worker 计算开销

---

## 十、测试要点

1. **画像计算**：验证 TF-IDF 权重、类型亲和度、评分倾向的正确性
2. **相似用户**：验证余弦相似度 top-20 的合理性
3. **推荐去重**：确保已收藏和近期展示条目不出现在推荐中
4. **冷启动**：新用户（无收藏）是否正确降级为热门推荐
5. **Navi 集成**：画像 JSON 是否正确注入 system prompt
6. **行为上报**：behavior_log 正确记录且 7 天自动清理
7. **缓存降级**：缓存未命中时是否返回热门兜底