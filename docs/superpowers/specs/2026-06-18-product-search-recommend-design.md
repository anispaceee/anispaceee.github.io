# ANISpace 产品级搜广推系统 — 设计文档

> 版本：v2.0 | 日期：2026-06-18 | 状态：已确认
> 基于 v1.0 用户画像与推荐系统，升级为产品级搜广推架构

---

## 一、项目概述

在 v1.0 基础推荐系统（标签TF-IDF + User-based CF + 热门兜底）上，升级为产品级搜广推系统，覆盖四个子系统：

1. **推荐升级**：召回→粗排→精排→重排 四层架构 + LR精排模型
2. **搜索升级**：接入三层搜索 + 个性化排序 + 搜索建议
3. **探索页**：多源聚合探索流 + 瀑布流UI
4. **推广位**：运营推广位插入推荐流/搜索结果

### v1.0 致命缺口

| 缺口 | 现状 | 影响 |
|------|------|------|
| 行为上报断裂 | `BehaviorService` 已定义但前端从未调用 | `behavior_log` 空表，活跃用户判定失效 |
| 搜索未接入新服务 | `GlobalSearch.jsx` 仍走旧接口 | 搜索无个性化排序 |
| 无探索页 | 完全不存在 | 缺少"广" |
| 画像维度单一 | 仅标签TF-IDF | 缺少实时行为、社交特征 |
| 推荐无排序模型 | 简单加权求和 | 推荐质量低 |

---

## 二、三层画像体系

### 2.1 长期画像（D1 `user_profiles` 表，扩展）

在现有字段基础上新增：

```sql
ALTER TABLE user_profiles ADD COLUMN social_features TEXT DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN preference_vector TEXT DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN lifecycle_stage TEXT DEFAULT 'new';
```

| 新字段 | 内容 | 计算来源 |
|--------|------|----------|
| `social_features` | `{follow_count, follower_count, post_count, avg_post_likes}` | `follows` + `posts` + `likes` 表 |
| `preference_vector` | 64维标签向量（降维后的标签权重） | `tag_weights` 截断 |
| `lifecycle_stage` | `new`/`growing`/`active`/`dormant` | 基于收藏数+活跃度+注册天数 |

生命周期判定规则：
- `new`：收藏数 < 5
- `growing`：收藏数 5-20
- `active`：收藏数 > 20 且 7天内有行为
- `dormant`：收藏数 > 20 但 30天内无行为

### 2.2 短期画像（D1 新表 `user_profile_short`，7天行为聚合）

```sql
CREATE TABLE IF NOT EXISTS user_profile_short (
  user_id INTEGER PRIMARY KEY,
  recent_tags TEXT DEFAULT '{}',
  recent_types TEXT DEFAULT '{}',
  recent_actions INTEGER DEFAULT 0,
  recent_subjects TEXT DEFAULT '[]',
  session_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

计算来源：`behavior_log` 表 7 天数据聚合，由 Cron 每日刷新。

### 2.3 实时会话画像（前端 localStorage）

```js
// localStorage['anispace_session_profile']
{
  session_id: "uuid",
  session_start: timestamp,
  actions: [
    { type: 'view_subject', target_id: 123, ts: timestamp, duration_ms: 5000 },
    { type: 'search_click', query: '科幻', target_id: 456, ts: timestamp },
  ],
  current_interests: ['科幻', '机甲'],
  session_duration_ms: 0
}
```

会话结束条件：30分钟无活动。传递方式：推荐 API 请求 header `X-Session-Profile`。

---

## 三、四层推荐架构

### 3.1 整体流程

```
用户请求推荐
      ↓
┌─────────────────────────────────────────┐
│ 1. 召回层 (多路召回, 合并去重)             │
│    ├─ 协同过滤召回 (相似用户收藏)          │
│    ├─ 标签向量召回 (preference_vector)     │
│    ├─ 内容匹配召回 (tag_weights top-N)    │
│    ├─ 社交召回 (关注用户的收藏)            │
│    └─ 热门召回 (全局高分兜底)              │
│         → 候选集 ~200条                   │
├─────────────────────────────────────────┤
│ 2. 粗排层 (轻量打分, 快速过滤)             │
│    score = type_match + popularity       │
│         → 精排集 ~50条                    │
├─────────────────────────────────────────┤
│ 3. 精排层 (LR模型, 特征加权)              │
│    LR: sigmoid(w·x + b)                  │
│         → 排序集 ~20条                   │
├─────────────────────────────────────────┤
│ 4. 重排层 (业务规则 + 多样性)             │
│    - 类型多样性约束 (同类型≤40%)          │
│    - 已展示去重 (前端反馈)                │
│    - 推广位插入 (每5条插1条推广)          │
│    - 新鲜度boost (24h内条目×1.1)         │
│         → 最终结果 10-20条               │
└─────────────────────────────────────────┘
```

### 3.2 召回层

| 召回通道 | 数据源 | SQL | 上限 |
|----------|--------|-----|------|
| 协同过滤 | `similar_users` + `collections` | 相似用户收藏去重 | 50 |
| 标签向量 | `preference_vector` + `bangumi_subjects` | top-10标签 LIKE 匹配 | 50 |
| 内容匹配 | `tag_weights` + `bangumi_subjects` | top-3标签 LIKE + score≥6.5 | 30 |
| 社交召回 | `follows` + `collections` | 关注用户收藏去重 | 30 |
| 热门兜底 | `bangumi_subjects` | score DESC | 30 |

### 3.3 粗排层

```js
function coarseRank(item, profile) {
  const typeAffinity = profile?.type_affinity || {};
  const typeKey = { 2:'anime', 4:'game', 1:'novel', 6:'real' }[item.type];
  const typeMatch = (typeAffinity[typeKey] || 0) > 0.3 ? 1.0 : 0.5;
  const popularity = Math.min((item.score || 0) / 10, 1.0);
  return typeMatch * 0.6 + popularity * 0.4;
}
```

### 3.4 精排层 (LR)

```js
const LR_WEIGHTS = {
  tag_match:      2.0,
  type_match:     1.5,
  cf_score:       1.8,
  popularity:     0.8,
  recency:        0.5,
  rating_match:   1.0,
  social:         1.2,
};
const LR_BIAS = -1.5;

function lrPredict(features) {
  let z = LR_BIAS;
  for (const [key, weight] of Object.entries(LR_WEIGHTS)) {
    z += weight * (features[key] || 0);
  }
  return 1 / (1 + Math.exp(-z));
}
```

特征提取：
- `tag_match`：条目标签与用户 `tag_weights` 的余弦相似度
- `type_match`：条目类型与 `type_affinity` 的匹配度
- `cf_score`：协同过滤召回时的归一化分数
- `popularity`：条目全局评分 / 10
- `recency`：条目入库时间距今天数，越新越高
- `rating_match`：条目评分与用户评分倾向的匹配度
- `social`：关注用户中收藏此条目的比例

### 3.5 重排层

```js
function rerank(items, options = {}) {
  let result = [];
  const typeCount = {};
  const shownSubjects = options.shownSubjects || new Set();

  for (const item of items) {
    // 已展示去重
    if (shownSubjects.has(item.subject_id)) continue;

    // 类型多样性约束
    const typeKey = item.type;
    typeCount[typeKey] = (typeCount[typeKey] || 0) + 1;
    if (typeCount[typeKey] > Math.ceil(result.length * 0.4 + 1)) continue;

    // 新鲜度 boost
    if (item.created_at) {
      const hoursSince = (Date.now() - new Date(item.created_at).getTime()) / 3600000;
      if (hoursSince < 24) item._final_score *= 1.1;
    }

    result.push(item);

    // 推广位插入
    if (result.length % 5 === 0 && options.promotions?.length > 0) {
      const promo = options.promotions.shift();
      result.push({ ...promo, is_promotion: true });
    }
  }

  return result;
}
```

---

## 四、搜索升级

### 4.1 接入三层搜索

`GlobalSearch.jsx` 改用 `BangumiSearchService.search()`（后端三层优先级搜索）。

### 4.2 搜索结果个性化重排

```js
function personalizeSearchResults(items, profile) {
  const tagWeights = profile?.tag_weights || {};
  const typeAffinity = profile?.type_affinity || {};
  return items.map(item => {
    let boost = 1.0;
    const typeKey = { 2:'anime', 4:'game', 1:'novel', 6:'real' }[item.type];
    if (typeKey && typeAffinity[typeKey] > 0.3) boost *= 1.2;
    if (item.tags) {
      for (const tag of item.tags) {
        if (tagWeights[tag.name || tag]) boost *= 1.1;
      }
    }
    return { ...item, _personal_score: (item.score || 0) * boost };
  }).sort((a, b) => b._personal_score - a._personal_score);
}
```

### 4.3 搜索建议

`GET /api/search/suggestions?q=` — 基于 `behavior_log` 热门搜索词 + 用户历史搜索。

---

## 五、探索页

### 5.1 端点

`GET /api/explore?category=&page=`

### 5.2 探索流聚合

```
探索流 = 推荐条目(40%) + 热门帖子(20%) + 资讯(20%) + 创作者作品(20%)
         ↓
      个性化排序
         ↓
      分页返回 (每页20条)
```

### 5.3 前端组件

`ExplorePage.jsx`：瀑布流布局 + 分类 Tab + 无限滚动加载。

---

## 六、推广位

### 6.1 数据表

```sql
CREATE TABLE IF NOT EXISTS promotion_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  title TEXT,
  cover_url TEXT,
  weight INTEGER DEFAULT 1,
  start_at TEXT,
  end_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 6.2 投放逻辑

在推荐流和搜索结果中，每 5 条自然结果插入 1 条推广内容。推广内容带 `is_promotion: true` 标记。

---

## 七、行为上报全量接入

### 7.1 上报点清单

| 交互点 | action | target_type | metadata |
|--------|--------|-------------|----------|
| 条目详情浏览 | `view_subject` | `anime/game/novel` | `{duration_ms, source}` |
| 搜索点击 | `search_click` | `anime/game/novel` | `{query, position}` |
| 收藏操作 | `mark_collection` | `anime/game/novel` | `{status, subject_id}` |
| 评分操作 | `rate` | `anime/game/novel` | `{rating}` |
| 评论操作 | `comment` | `subject/post/work` | `{comment_id}` |
| 帖子浏览 | `view_post` | `post` | `{duration_ms, board}` |
| 帖子点赞 | `like_post` | `post` | `{post_id}` |
| 资讯点击 | `news_click` | `news` | `{source, category}` |
| 作品浏览 | `view_work` | `work` | `{duration_ms, work_type}` |
| 作品收藏 | `favorite_work` | `work` | `{work_id}` |
| 页面停留 | `page_stay` | `page` | `{page, duration_ms}` |
| 滚动深度 | `scroll_depth` | `page` | `{page, depth_pct}` |
| Navi对话 | `navi_chat` | `ai` | `{turn_count, has_recommend}` |
| 推荐点击 | `recommend_click` | `subject/post/news` | `{scene, position, reason}` |

### 7.2 批量上报

隐式行为采用 10 秒批量上报，减少 80% API 调用。

```js
class BehaviorCollector {
  track(action, targetType, targetId, metadata) { /* 入队 */ }
  flush() { /* POST /api/behavior/batch */ }
}
```

### 7.3 新增 API 路由

| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| `POST` | `/api/behavior/batch` | 批量行为上报 | JWT |
| `GET` | `/api/explore?category=&page=` | 探索流 | JWT |
| `GET` | `/api/promotions?slot=` | 获取推广位 | JWT |
| `GET` | `/api/search/suggestions?q=` | 搜索建议 | JWT |
| `GET` | `/api/profile/short` | 获取短期画像 | JWT |

---

## 八、文件改动清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `worker/lib/lr-ranker.js` | LR 精排器 |
| 新增 | `worker/lib/behavior-collector.js` | 后端批量行为处理 |
| 新增 | `worker/lib/explore-engine.js` | 探索流聚合引擎 |
| 新增 | `worker/migrations/v017_search_promote.sql` | 新增表 DDL |
| 修改 | `worker/lib/user-profile.js` | 扩展画像计算 |
| 修改 | `worker/lib/recommend-engine.js` | 四层架构重构 |
| 修改 | `worker/oauth-proxy.js` | 新增 5 个路由 |
| 修改 | `worker/schema.sql` | 追加新表 |
| 新增 | `src/lib/BehaviorCollector.js` | 前端行为采集器 |
| 新增 | `src/lib/SessionProfile.js` | 实时会话画像管理 |
| 新增 | `src/pages/ExplorePage.jsx` | 探索页 |
| 修改 | `src/services/api.js` | 新增 Service |
| 修改 | `src/components/Common/GlobalSearch.jsx` | 接入新搜索 |
| 修改 | `src/components/Info/InfoDetail.jsx` | 行为上报 |
| 修改 | `src/components/Forum/Forum.jsx` | 行为上报 |
| 修改 | `src/components/NewsZone/NewsZone.jsx` | 行为上报 |
| 修改 | `src/components/Amadeus/Amadeus.jsx` | 行为上报+会话画像 |
| 修改 | `src/pages/HomePage.jsx` | 推广位+行为上报 |

---

## 九、数据经济性

| 资源 | 估算（1000用户） | 说明 |
|------|-----------------|------|
| `user_profile_short` | ~1MB | 每用户 ~1KB |
| `promotion_slots` | <10KB | 运营手动维护 |
| `behavior_log` 增量 | ~5MB/7天 | 批量上报后减少 80% API 调用 |
| Worker CPU | Cron 每日 ~5s | 短期画像刷新 + 推荐缓存 |
| 新增 API 调用 | ~0.5次/分钟/用户 | 批量上报合并 |

---

## 十、关键决策记录

1. **方案选择**：渐进式升级（方案A），复用已有表结构和 API
2. **画像分层**：长期(D1) + 短期(D1, 7天) + 实时(localStorage)，三层覆盖多时间尺度
3. **排序模型**：LR精排器（Worker内JS实现），轻量且可解释
4. **行为上报**：批量上报（10秒窗口），减少 API 调用
5. **搜索升级**：接入已有三层搜索 + 个性化重排
6. **探索页**：多源聚合流，40%推荐+20%帖子+20%资讯+20%作品
7. **推广位**：每5条自然结果插1条推广，带 `is_promotion` 标记
8. **会话画像传递**：通过 HTTP header `X-Session-Profile` 传递

---

## 十一、测试要点

1. **画像计算**：长期画像扩展字段（社交特征、生命周期、向量）正确性
2. **短期画像**：7天行为聚合正确，Cron 刷新正常
3. **实时会话画像**：前端采集、存储、传递、过期清理
4. **四层推荐**：召回→粗排→精排→重排各层输出正确
5. **LR精排**：特征提取正确，sigmoid 输出在 [0,1] 范围
6. **重排多样性**：同类型≤40%约束生效
7. **搜索个性化**：个性化重排后结果与画像匹配
8. **探索流**：多源聚合比例正确，分页正常
9. **推广位**：每5条插1条，`is_promotion` 标记正确
10. **行为上报**：批量上报正常，`behavior_log` 有数据
11. **冷启动**：新用户降级为热门推荐
12. **性能**：推荐 API 响应时间 < 500ms