# 用户画像与个性化推荐系统 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建用户画像体系（标签向量+TF-IDF+User-based CF），优化 Navi AI、随心斩、放课后、毒电波三个场景的个性化推荐。

**Architecture:** Worker 端新增 `lib/user-profile.js`（画像计算）和 `lib/recommend-engine.js`（推荐引擎），通过 D1 三张新表（`user_profiles`、`behavior_log`、`recommend_cache`）存储数据。前端通过新 API 获取画像和推荐缓存，Cron 每小时预计算活跃用户推荐。

**Tech Stack:** Cloudflare Worker (ES Module), D1 (SQLite), React 19, Vite 8

---

### Task 1: 数据库迁移

**Files:**
- Create: `worker/migrations/v016_user_profile.sql`

- [ ] **Step 1: 创建迁移文件**

```sql
-- v016: 用户画像与个性化推荐系统
-- 新增 user_profiles、behavior_log、recommend_cache 三张表

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  tag_weights TEXT DEFAULT '{}',
  type_affinity TEXT DEFAULT '{}',
  consumption_stats TEXT DEFAULT '{}',
  rating_tendency TEXT DEFAULT 'normal',
  activity_score REAL DEFAULT 0,
  last_action_at TEXT,
  version INTEGER DEFAULT 1,
  similar_users TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS behavior_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT DEFAULT '',
  target_id INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_behavior_user ON behavior_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_target ON behavior_log(target_type, target_id);

CREATE TABLE IF NOT EXISTS recommend_cache (
  user_id INTEGER NOT NULL,
  scene TEXT NOT NULL,
  items TEXT NOT NULL,
  generated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, scene)
);
```

- [ ] **Step 2: 更新 schema.sql**

在 `worker/schema.sql` 末尾追加三张新表定义（同上 SQL）。

- [ ] **Step 3: 执行迁移**

Run: `npx wrangler d1 execute anispace-db --file=worker/migrations/v016_user_profile.sql`
Expected: 三张表创建成功，无报错。

- [ ] **Step 4: Commit**

```bash
git add worker/migrations/v016_user_profile.sql worker/schema.sql
git commit -m "feat: add user_profiles, behavior_log, recommend_cache tables for recommendation system"
```

---

### Task 2: 用户画像计算引擎

**Files:**
- Create: `worker/lib/user-profile.js`

- [ ] **Step 1: 创建画像引擎文件**

```js
/**
 * ANISpace 用户画像计算引擎
 * 功能：标签权重(TF-IDF)、类型亲和度、消费统计、评分倾向、相似用户
 */

/**
 * 安全解析 JSON 字段（D1 文本列可能为 null/空字符串）
 */
function safeJson(value, fallback) {
  if (typeof value === 'string' && value) {
    try { return JSON.parse(value); } catch {}
  }
  return value ?? fallback;
}

/**
 * 计算单个用户的完整画像
 * @param {object} db - D1 数据库绑定
 * @param {number} userId - 用户 ID
 * @returns {object} 画像对象
 */
export async function computeUserProfile(db, userId) {
  // 1. 获取用户所有收藏
  const collections = await db.prepare(
    'SELECT subject_id, status, rating FROM collections WHERE user_id = ?'
  ).bind(userId).all();

  if (!collections.results || collections.results.length === 0) {
    return buildEmptyProfile(userId);
  }

  const items = collections.results;
  const totalCollections = items.length;

  // 2. 批量获取条目标签和类型
  const subjectIds = items.map(c => c.subject_id);
  const placeholders = subjectIds.map(() => '?').join(',');
  const subjects = await db.prepare(
    `SELECT id, type, tags FROM bangumi_subjects WHERE id IN (${placeholders})`
  ).bind(...subjectIds).all();

  // 构建 subject_id -> { type, tags } 映射
  const subjectMap = {};
  for (const s of (subjects.results || [])) {
    subjectMap[s.id] = {
      type: s.type,
      tags: safeJson(s.tags, []),
    };
  }

  // 3. 计算标签权重 (TF-IDF)
  const tagWeights = await computeTagWeights(db, items, subjectMap, userId);

  // 4. 计算类型亲和度
  const typeAffinity = computeTypeAffinity(items, subjectMap);

  // 5. 计算消费统计
  const consumptionStats = computeConsumptionStats(items);

  // 6. 计算评分倾向
  const ratingTendency = computeRatingTendency(items);

  // 7. 计算活跃度
  const activityScore = computeActivityScore(items, userId);

  return {
    user_id: userId,
    tag_weights: JSON.stringify(tagWeights),
    type_affinity: JSON.stringify(typeAffinity),
    consumption_stats: JSON.stringify(consumptionStats),
    rating_tendency: ratingTendency,
    activity_score: activityScore,
    last_action_at: new Date().toISOString(),
    version: 1,
    similar_users: '[]',
    updated_at: new Date().toISOString(),
  };
}

/**
 * 标签权重 (类 TF-IDF)
 * TF(t) = 用户含标签t的收藏数 / 总收藏数
 * IDF(t) = log(总用户数 / 含标签t的用户数)
 */
async function computeTagWeights(db, items, subjectMap, userId) {
  const tagCount = {};
  let totalTagged = 0;

  for (const item of items) {
    const subject = subjectMap[item.subject_id];
    if (!subject) continue;
    const tags = subject.tags;
    if (!Array.isArray(tags)) continue;
    for (const tag of tags) {
      const name = typeof tag === 'string' ? tag : tag.name;
      if (!name) continue;
      tagCount[name] = (tagCount[name] || 0) + 1;
      totalTagged++;
    }
  }

  if (totalTagged === 0) return {};

  // 计算总用户数（有收藏的用户）
  const totalUsersResult = await db.prepare(
    'SELECT COUNT(DISTINCT user_id) as cnt FROM collections'
  ).first();
  const totalUsers = totalUsersResult?.cnt || 1;

  const weights = {};
  for (const [tag, count] of Object.entries(tagCount)) {
    const tf = count / totalTagged;
    // 计算含该标签的用户数
    // 通过 collections 关联 bangumi_subjects 找含此标签的用户
    const usersWithTag = await db.prepare(
      `SELECT COUNT(DISTINCT c.user_id) as cnt
       FROM collections c
       JOIN bangumi_subjects bs ON c.subject_id = bs.id
       WHERE bs.tags LIKE ?`
    ).bind(`%${tag}%`).first();
    const userCount = usersWithTag?.cnt || 1;
    const idf = Math.log(totalUsers / Math.max(userCount, 1));
    weights[tag] = Math.round(tf * idf * 1000) / 1000;
  }

  return weights;
}

/**
 * 类型亲和度：按 anime(2)/game(4)/novel(1)/real(6) 归一化
 */
function computeTypeAffinity(items, subjectMap) {
  const typeCount = { anime: 0, game: 0, novel: 0, real: 0 };
  const TYPE_MAP = { 1: 'novel', 2: 'anime', 4: 'game', 6: 'real' };

  for (const item of items) {
    const subject = subjectMap[item.subject_id];
    const typeKey = TYPE_MAP[subject?.type] || null;
    if (typeKey) typeCount[typeKey]++;
  }

  const total = Object.values(typeCount).reduce((a, b) => a + b, 0);
  if (total === 0) return { anime: 0, game: 0, novel: 0, real: 0 };

  return {
    anime: Math.round((typeCount.anime / total) * 100) / 100,
    game: Math.round((typeCount.game / total) * 100) / 100,
    novel: Math.round((typeCount.novel / total) * 100) / 100,
    real: Math.round((typeCount.real / total) * 100) / 100,
  };
}

/**
 * 消费统计
 */
function computeConsumptionStats(items) {
  const ratedItems = items.filter(c => c.rating > 0);
  const avgRating = ratedItems.length > 0
    ? Math.round(ratedItems.reduce((s, c) => s + c.rating, 0) / ratedItems.length * 10) / 10
    : 0;

  // 评分标准差
  let ratingStd = 0;
  if (ratedItems.length > 1) {
    const variance = ratedItems.reduce((s, c) => s + Math.pow(c.rating - avgRating, 2), 0) / ratedItems.length;
    ratingStd = Math.round(Math.sqrt(variance) * 10) / 10;
  }

  // 状态分布
  const statusCount = {};
  for (const item of items) {
    statusCount[item.status] = (statusCount[item.status] || 0) + 1;
  }

  return {
    total_collections: items.length,
    avg_rating: avgRating,
    rating_std: ratingStd,
    collection_by_status: statusCount,
  };
}

/**
 * 评分倾向
 */
function computeRatingTendency(items) {
  const ratedItems = items.filter(c => c.rating > 0);
  if (ratedItems.length === 0) return 'normal';

  const avgRating = ratedItems.reduce((s, c) => s + c.rating, 0) / ratedItems.length;
  let ratingStd = 0;
  if (ratedItems.length > 1) {
    const variance = ratedItems.reduce((s, c) => s + Math.pow(c.rating - avgRating, 2), 0) / ratedItems.length;
    ratingStd = Math.sqrt(variance);
  }

  if (avgRating >= 8.5 && ratingStd < 1.0) return 'generous';
  if (avgRating <= 5.0 || ratingStd > 2.5) return 'strict';
  return 'normal';
}

/**
 * 活跃度：基于最近 7 天行为日志
 */
function computeActivityScore(items, userId) {
  // 简化：收藏数 > 30 为高活跃
  if (items.length >= 30) return 0.9;
  if (items.length >= 10) return 0.5;
  if (items.length >= 1) return 0.2;
  return 0;
}

/**
 * 空画像（新用户/冷启动）
 */
function buildEmptyProfile(userId) {
  return {
    user_id: userId,
    tag_weights: '{}',
    type_affinity: '{}',
    consumption_stats: JSON.stringify({
      total_collections: 0, avg_rating: 0, rating_std: 0, collection_by_status: {}
    }),
    rating_tendency: 'normal',
    activity_score: 0,
    last_action_at: new Date().toISOString(),
    version: 1,
    similar_users: '[]',
    updated_at: new Date().toISOString(),
  };
}

/**
 * 计算当前用户与所有其他用户的余弦相似度，返回 top-20
 * similarity(A, B) = (Σ w_A(t) × w_B(t)) / (√Σ w_A² × √Σ w_B²)
 */
export async function computeSimilarUsers(db, userId) {
  const currentProfile = await db.prepare(
    'SELECT tag_weights FROM user_profiles WHERE user_id = ?'
  ).bind(userId).first();

  if (!currentProfile) return [];

  const currentWeights = safeJson(currentProfile.tag_weights, {});
  const currentTags = Object.keys(currentWeights);
  if (currentTags.length === 0) return [];

  // 计算当前用户的 L2 范数
  const currentNorm = Math.sqrt(
    Object.values(currentWeights).reduce((sum, w) => sum + w * w, 0)
  );
  if (currentNorm === 0) return [];

  // 获取所有其他用户的画像
  const allProfiles = await db.prepare(
    'SELECT user_id, tag_weights FROM user_profiles WHERE user_id != ? AND tag_weights != ?'
  ).bind(userId, '{}').all();

  const similarities = [];
  for (const p of (allProfiles.results || [])) {
    const otherWeights = safeJson(p.tag_weights, {});
    const otherTags = Object.keys(otherWeights);
    if (otherTags.length === 0) continue;

    // 只计算同时出现在两个用户中的标签
    const commonTags = currentTags.filter(t => otherTags[t] !== undefined);
    if (commonTags.length === 0) continue;

    let dotProduct = 0;
    let otherNormSq = 0;
    for (const tag of commonTags) {
      dotProduct += currentWeights[tag] * otherWeights[tag];
    }
    for (const w of Object.values(otherWeights)) {
      otherNormSq += w * w;
    }
    const otherNorm = Math.sqrt(otherNormSq);
    if (otherNorm === 0) continue;

    const similarity = dotProduct / (currentNorm * otherNorm);
    similarities.push({ user_id: p.user_id, similarity: Math.round(similarity * 1000) / 1000 });
  }

  // 排序取 top-20
  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, 20);
}

/**
 * 清理 7 天前的 behavior_log
 */
export async function cleanupBehaviorLog(db) {
  await db.prepare(
    "DELETE FROM behavior_log WHERE created_at < datetime('now', '-7 days')"
  ).run();
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/lib/user-profile.js
git commit -m "feat: add user profile computation engine (TF-IDF, CF similarity)"
```

---

### Task 3: 推荐引擎

**Files:**
- Create: `worker/lib/recommend-engine.js`

- [ ] **Step 1: 创建推荐引擎文件**

```js
/**
 * ANISpace 推荐引擎
 * 功能：协同过滤推荐、标签匹配推荐、热门兜底、缓存管理
 */

import * as userProfile from './user-profile.js';

/**
 * 安全解析 JSON
 */
function safeJson(value, fallback) {
  if (typeof value === 'string' && value) {
    try { return JSON.parse(value); } catch {}
  }
  return value ?? fallback;
}

/**
 * 为单个用户计算所有场景的推荐结果并写入缓存
 * @param {object} db - D1 绑定
 * @param {number} userId - 用户 ID
 */
export async function refreshUserRecommendCache(db, userId) {
  const profile = await db.prepare(
    'SELECT * FROM user_profiles WHERE user_id = ?'
  ).bind(userId).first();

  if (!profile) return;

  const tagWeights = safeJson(profile.tag_weights, {});
  const typeAffinity = safeJson(profile.type_affinity, {});
  const similarUsers = safeJson(profile.similar_users, []);

  // 场景1: 随心斩
  const homeRandom = await computeHomeRandom(db, userId, tagWeights, similarUsers);

  // 场景2: 放课后帖子
  const forumPosts = await computeForumPosts(db, typeAffinity);

  // 场景3: 毒电波资讯
  const newsFeed = await computeNewsFeed(db, typeAffinity);

  // 写入缓存
  const scenes = [
    { scene: 'home_random', items: homeRandom },
    { scene: 'forum_posts', items: forumPosts },
    { scene: 'news_feed', items: newsFeed },
  ];

  for (const s of scenes) {
    await db.prepare(
      `INSERT OR REPLACE INTO recommend_cache (user_id, scene, items, generated_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind(userId, s.scene, JSON.stringify(s.items)).run();
  }
}

/**
 * 随心斩推荐：CF + 标签匹配 + 热门兜底
 * 返回 [{subject_id, score, reason}, ...]
 */
async function computeHomeRandom(db, userId, tagWeights, similarUsers) {
  const candidates = [];
  const seenIds = new Set();

  // 1. 协同过滤推荐（权重 0.5）
  if (similarUsers.length > 0) {
    const similarIds = similarUsers.map(u => u.user_id);
    const placeholders = similarIds.map(() => '?').join(',');
    const cfItems = await db.prepare(
      `SELECT c.subject_id, COUNT(*) as cnt
       FROM collections c
       WHERE c.user_id IN (${placeholders})
         AND c.subject_id NOT IN (SELECT subject_id FROM collections WHERE user_id = ?)
       GROUP BY c.subject_id
       ORDER BY cnt DESC
       LIMIT 30`
    ).bind(...similarIds, userId).all();

    for (const item of (cfItems.results || [])) {
      if (!seenIds.has(item.subject_id)) {
        candidates.push({ subject_id: item.subject_id, score: item.cnt * 0.5, reason: 'cf' });
        seenIds.add(item.subject_id);
      }
    }
  }

  // 2. 标签匹配推荐（权重 0.3）
  const topTags = Object.entries(tagWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  if (topTags.length > 0) {
    const tagConditions = topTags.map(() => `bs.tags LIKE ?`).join(' OR ');
    const tagParams = topTags.map(t => `%${t}%`);

    const tagItems = await db.prepare(
      `SELECT bs.id, bs.score, bs.rank
       FROM bangumi_subjects bs
       WHERE (${tagConditions})
         AND bs.id NOT IN (SELECT subject_id FROM collections WHERE user_id = ?)
         AND bs.score >= 6.5
       ORDER BY bs.score DESC
       LIMIT 30`
    ).bind(...tagParams, userId).all();

    for (const item of (tagItems.results || [])) {
      if (!seenIds.has(item.id)) {
        candidates.push({ subject_id: item.id, score: (item.score || 7) * 0.03, reason: 'tag' });
        seenIds.add(item.id);
      }
    }
  }

  // 3. 热门兜底（权重 0.2）
  const hotItems = await db.prepare(
    `SELECT bs.id, bs.score
     FROM bangumi_subjects bs
     WHERE bs.id NOT IN (SELECT subject_id FROM collections WHERE user_id = ?)
     ORDER BY bs.score DESC
     LIMIT 30`
  ).bind(userId).all();

  for (const item of (hotItems.results || [])) {
    if (!seenIds.has(item.id)) {
      candidates.push({ subject_id: item.id, score: (item.score || 7) * 0.02, reason: 'hot' });
      seenIds.add(item.id);
    }
  }

  // 按 score 排序，返回 top-20
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 20);
}

/**
 * 放课后帖子推荐：基于 type_affinity 对板区加权
 * 返回 [{board_key, weight}, ...] 供前端排序使用
 */
async function computeForumPosts(db, typeAffinity) {
  const boardWeights = [];

  // 动画部：匹配 anime 亲和度
  if (typeAffinity.anime > 0.3) {
    const weight = typeAffinity.anime > 0.5 ? 1.3 : 1.15;
    boardWeights.push({ board: 'newanime', weight });
    boardWeights.push({ board: 'oldanime', weight });
  }

  // 游戏部：匹配 game 亲和度
  if (typeAffinity.game > 0.3) {
    const weight = typeAffinity.game > 0.5 ? 1.3 : 1.15;
    boardWeights.push({ board: 'galgame', weight });
    boardWeights.push({ board: 'game', weight });
  }

  // 图书室：匹配 novel 亲和度
  if (typeAffinity.novel > 0.3) {
    const weight = typeAffinity.novel > 0.5 ? 1.3 : 1.15;
    boardWeights.push({ board: 'novel', weight });
  }

  return boardWeights;
}

/**
 * 毒电波资讯推荐：基于 type_affinity 对资讯分类加权
 * 返回 [{category, weight}, ...] 供前端排序使用
 */
async function computeNewsFeed(db, typeAffinity) {
  const categoryWeights = [];

  // 动画相关分类
  if (typeAffinity.anime > 0.3) {
    const weight = typeAffinity.anime > 0.5 ? 1.3 : 1.15;
    categoryWeights.push({ category: '新番导视', weight });
    categoryWeights.push({ category: '热门推荐', weight });
    categoryWeights.push({ category: '每周速报', weight });
  }

  // 游戏相关分类
  if (typeAffinity.game > 0.3) {
    const weight = typeAffinity.game > 0.5 ? 1.3 : 1.15;
    categoryWeights.push({ category: '游戏推荐', weight });
    categoryWeights.push({ category: 'VN推荐', weight });
    categoryWeights.push({ category: 'Steam精选', weight });
    categoryWeights.push({ category: 'Steam特惠', weight });
    categoryWeights.push({ category: 'Steam新品', weight });
  }

  // 小说相关分类
  if (typeAffinity.novel > 0.3) {
    const weight = typeAffinity.novel > 0.5 ? 1.3 : 1.15;
    categoryWeights.push({ category: '轻小说', weight });
  }

  return categoryWeights;
}

/**
 * 为所有活跃用户刷新推荐缓存
 * @param {object} db - D1 绑定
 */
export async function refreshAllRecommendCaches(db) {
  // 查找 7 天内有行为的活跃用户
  const activeUsers = await db.prepare(
    `SELECT DISTINCT user_id FROM behavior_log
     WHERE created_at > datetime('now', '-7 days')`
  ).all();

  for (const row of (activeUsers.results || [])) {
    try {
      await refreshUserRecommendCache(db, row.user_id);
    } catch (err) {
      console.error(`Failed to refresh cache for user ${row.user_id}:`, err.message);
    }
  }
}

/**
 * 获取热门推荐（冷启动/缓存未命中时使用）
 */
export async function getHotRecommendations(db) {
  const items = await db.prepare(
    `SELECT id, name, name_cn, type, score, images
     FROM bangumi_subjects
     ORDER BY score DESC
     LIMIT 20`
  ).all();

  return (items.results || []).map(item => ({
    subject_id: item.id,
    name: item.name,
    name_cn: item.name_cn,
    type: item.type,
    score: item.score,
    images: safeJson(item.images, {}),
    reason: 'hot',
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/lib/recommend-engine.js
git commit -m "feat: add recommendation engine (CF, tag matching, cache management)"
```

---

### Task 4: Worker API 路由

**Files:**
- Modify: `worker/oauth-proxy.js`

**Part A: 添加 import**

- [ ] **Step 1: 在文件顶部 import 区域添加新依赖**

在 `worker/oauth-proxy.js` 第 24 行（`import * as bangumiEnrich` 之后）添加：

```js
import * as userProfile from './lib/user-profile.js';
import * as recommendEngine from './lib/recommend-engine.js';
```

- [ ] **Step 2: 在 handleApiRoutes 函数末尾（return null 之前）添加 5 个新路由**

在 `handleApiRoutes` 函数中，`return null;` 之前添加以下路由处理：

```js
  // ─── 用户画像 API ───

  // GET /api/profile — 获取当前用户画像
  if (method === 'GET' && pathname === '/api/profile') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const profile = await env.DB.prepare(
        'SELECT * FROM user_profiles WHERE user_id = ?'
      ).bind(authUser.userId).first();

      if (!profile) {
        return jsonResponse({ error: '画像未生成' }, 404, origin);
      }

      // 解析 JSON 字段
      return jsonResponse({
        user_id: profile.user_id,
        tag_weights: safeJsonParse(profile.tag_weights, {}),
        type_affinity: safeJsonParse(profile.type_affinity, {}),
        consumption_stats: safeJsonParse(profile.consumption_stats, {}),
        rating_tendency: profile.rating_tendency,
        activity_score: profile.activity_score,
        last_action_at: profile.last_action_at,
        version: profile.version,
        similar_users: safeJsonParse(profile.similar_users, []),
        updated_at: profile.updated_at,
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取画像失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/profile/refresh — 触发画像重算
  if (method === 'POST' && pathname === '/api/profile/refresh') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const profile = await userProfile.computeUserProfile(env.DB, authUser.userId);

      // UPSERT
      await env.DB.prepare(
        `INSERT OR REPLACE INTO user_profiles
         (user_id, tag_weights, type_affinity, consumption_stats, rating_tendency,
          activity_score, last_action_at, version, similar_users, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        profile.user_id, profile.tag_weights, profile.type_affinity,
        profile.consumption_stats, profile.rating_tendency,
        profile.activity_score, profile.last_action_at,
        profile.version, profile.similar_users, profile.updated_at
      ).run();

      // 异步计算相似用户并更新推荐缓存
      context.waitUntil((async () => {
        const similar = await userProfile.computeSimilarUsers(env.DB, authUser.userId);
        await env.DB.prepare(
          'UPDATE user_profiles SET similar_users = ? WHERE user_id = ?'
        ).bind(JSON.stringify(similar), authUser.userId).run();
        await recommendEngine.refreshUserRecommendCache(env.DB, authUser.userId);
      })());

      return jsonResponse({
        user_id: profile.user_id,
        tag_weights: safeJsonParse(profile.tag_weights, {}),
        type_affinity: safeJsonParse(profile.type_affinity, {}),
        consumption_stats: safeJsonParse(profile.consumption_stats, {}),
        rating_tendency: profile.rating_tendency,
        activity_score: profile.activity_score,
        updated_at: profile.updated_at,
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '画像刷新失败: ' + err.message }, 500, origin);
    }
  }

  // ─── 推荐 API ───

  // GET /api/recommend?scene= — 获取推荐缓存
  if (method === 'GET' && pathname === '/api/recommend') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const url = new URL(request.url);
    const scene = url.searchParams.get('scene') || 'home_random';

    try {
      const cache = await env.DB.prepare(
        'SELECT * FROM recommend_cache WHERE user_id = ? AND scene = ?'
      ).bind(authUser.userId, scene).first();

      if (cache) {
        return jsonResponse({
          user_id: cache.user_id,
          scene: cache.scene,
          items: safeJsonParse(cache.items, []),
          generated_at: cache.generated_at,
        }, 200, origin);
      }

      // 缓存未命中 → 返回热门推荐
      const hot = await recommendEngine.getHotRecommendations(env.DB);
      return jsonResponse({
        user_id: authUser.userId,
        scene,
        items: hot,
        generated_at: new Date().toISOString(),
        fallback: true,
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取推荐失败: ' + err.message }, 500, origin);
    }
  }

  // ─── 行为上报 API ───

  // POST /api/behavior — 上报用户行为
  if (method === 'POST' && pathname === '/api/behavior') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { action, target_type, target_id, metadata } = body;

      if (!action) {
        return jsonResponse({ error: '缺少 action 字段' }, 400, origin);
      }

      const result = await env.DB.prepare(
        'INSERT INTO behavior_log (user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        authUser.userId, action,
        target_type || '', target_id || 0,
        JSON.stringify(metadata || {})
      ).run();

      // 更新 user_profiles.last_action_at
      await env.DB.prepare(
        "UPDATE user_profiles SET last_action_at = datetime('now') WHERE user_id = ?"
      ).bind(authUser.userId).run();

      return jsonResponse({ id: result.meta.last_row_id, success: true }, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '行为上报失败: ' + err.message }, 500, origin);
    }
  }

  // ─── 管理员推荐刷新 ───

  // GET /api/recommend/refresh — 管理员手动刷新全局缓存
  if (method === 'GET' && pathname === '/api/recommend/refresh') {
    const adminUser = await getAdminUser(request, env);
    if (!adminUser) return jsonResponse({ error: '需要管理员权限' }, 403, origin);

    context.waitUntil(recommendEngine.refreshAllRecommendCaches(env.DB));

    return jsonResponse({ success: true, message: '全局推荐缓存刷新已触发' }, 200, origin);
  }
```

- [ ] **Step 3: 在路由前缀匹配中添加新路径**

在 `worker/oauth-proxy.js` 第 4608 行的 `url.pathname.startsWith` 长链中添加：

```js
// 在现有 pathname.startsWith 链中添加（约第 4608 行，在 '/api/permissions' 之后）
 || url.pathname.startsWith('/api/profile')
 || url.pathname.startsWith('/api/recommend')
 || url.pathname.startsWith('/api/behavior')
```

- [ ] **Step 4: Commit**

```bash
git add worker/oauth-proxy.js
git commit -m "feat: add profile, recommend, behavior API routes to Worker"
```

---

### Task 5: Worker Cron 定时任务

**Files:**
- Modify: `worker/oauth-proxy.js` (scheduled handler)

- [ ] **Step 1: 在 scheduled handler 中添加推荐缓存刷新和日志清理**

在 `worker/oauth-proxy.js` 第 5489 行的 `scheduled` 函数中，在现有逻辑之后添加：

```js
  // 在 scheduled handler 中，现有逻辑之后添加：
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      // 现有资讯爬取 + bangumi-data 同步逻辑保持不变...
      // （此处省略已有代码）

      // 每小时：清理过期行为日志 + 刷新推荐缓存
      try {
        await userProfile.cleanupBehaviorLog(env.DB);
        console.log('Behavior log cleanup completed');
      } catch (err) {
        console.error('Behavior log cleanup error:', err.message);
      }

      try {
        await recommendEngine.refreshAllRecommendCaches(env.DB);
        console.log('Recommend cache refresh completed');
      } catch (err) {
        console.error('Recommend cache refresh error:', err.message);
      }
    })());
  },
```

- [ ] **Step 2: 更新 wrangler.toml 添加每小时 cron**

在 `worker/wrangler.toml` 的 crons 数组中添加：

```toml
crons = ["0 3 * * 1", "0 3 * * 3", "*/30 * * * *", "0 * * * *"]
```

- [ ] **Step 3: Commit**

```bash
git add worker/oauth-proxy.js worker/wrangler.toml
git commit -m "feat: add hourly recommend cache refresh and behavior log cleanup to cron"
```

---

### Task 6: 前端 API 服务层

**Files:**
- Modify: `src/services/api.js`

- [ ] **Step 1: 在 api.js 末尾添加三个新 Service**

```js
// ─── ProfileService ───
// 用户画像获取与刷新
export const ProfileService = {
  async getProfile() {
    return apiRequest('/api/profile');
  },

  async refreshProfile() {
    return apiRequest('/api/profile/refresh', {
      method: 'POST',
    });
  },
};

// ─── BehaviorService ───
// 用户行为上报
export const BehaviorService = {
  async report(action, targetType = '', targetId = 0, metadata = {}) {
    return apiRequest('/api/behavior', {
      method: 'POST',
      body: JSON.stringify({
        action,
        target_type: targetType,
        target_id: targetId,
        metadata,
      }),
    });
  },
};

// ─── RecommendService ───
// 推荐结果获取
export const RecommendService = {
  async getRecommend(scene = 'home_random') {
    return apiRequest(`/api/recommend?scene=${scene}`);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/services/api.js
git commit -m "feat: add ProfileService, BehaviorService, RecommendService to api layer"
```

---

### Task 7: Navi AI System Prompt 增强

**Files:**
- Modify: `src/components/Amadeus/personas.js`

- [ ] **Step 1: 修改 buildSystemPrompt 函数**

修改 `personas.js` 中的 `buildSystemPrompt` 函数，将 `userTags` 参数替换为 `profile` 参数：

```js
/** 根据画像生成用户偏好文本片段 */
function buildUserProfileFragment(profile) {
  if (!profile) return '';
  const tagWeights = profile.tag_weights || {};
  const typeAffinity = profile.type_affinity || {};
  const stats = profile.consumption_stats || {};

  const topTags = Object.entries(tagWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}(${(v * 100).toFixed(0)}%)`)
    .join('、');

  const typeParts = [];
  if (typeAffinity.anime > 0) typeParts.push(`动画类${(typeAffinity.anime * 100).toFixed(0)}%`);
  if (typeAffinity.game > 0) typeParts.push(`游戏类${(typeAffinity.game * 100).toFixed(0)}%`);
  if (typeAffinity.novel > 0) typeParts.push(`小说类${(typeAffinity.novel * 100).toFixed(0)}%`);

  const ratingStyle = profile.rating_tendency === 'strict'
    ? '严格（不轻易给高分）'
    : profile.rating_tendency === 'generous'
    ? '宽松（容易给高分）'
    : '正常';

  return `【用户画像】
- 偏好标签（权重越高越喜欢）：${topTags || '暂无数据'}
- 类型偏好：${typeParts.join('、') || '暂无数据'}
- 收藏总数：${stats.total_collections || 0}，平均评分：${stats.avg_rating || '暂无'}
- 评分风格：${ratingStyle}
当用户请求推荐时，优先推荐与以上偏好匹配的作品。`;
}

/** 根据人格生成 system prompt（含站内动作指令说明 + 网站介绍 + 用户画像） */
export function buildSystemPrompt(persona, profile = null) {
  const cp = (persona.catchphrases || []).filter(Boolean).join('、');
  const preference = buildUserProfileFragment(profile);
  const parts = [
    `你是「${persona.name}」，ACG 社区 ANISpace 的站内 AI 助手。请始终保持以下角色设定，用中文回答。`,
    persona.personality ? `【人设】${persona.personality}` : '',
    persona.speechStyle ? `【说话风格】${persona.speechStyle}` : '',
    cp ? `【口头禅】${cp}` : '',
    '【推荐规则】当用户想要番剧/游戏/音乐等作品推荐时，用本角色的口吻点评，但不要在正文里编造作品 ID 或链接；改用下面的 recommend 指令给出搜索关键词，由系统检索真实条目展示。',
    '',
    DIRECTIVE_GUIDE,
    '',
    SITE_GUIDE,
    preference,
  ];
  return parts.filter(Boolean).join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Amadeus/personas.js
git commit -m "feat: integrate user profile into Navi AI system prompt"
```

---

### Task 8: Navi AI 组件集成

**Files:**
- Modify: `src/components/Amadeus/Amadeus.jsx`

- [ ] **Step 1: 修改 Amadeus.jsx**

1. 在 import 中添加 `ProfileService`：
```js
import { StorageService, BangumiService, CollectionMarkService, ProfileService } from '../../services/api';
```

2. 替换 `userTags` state 为 `userProfile` state：
```js
// 将第 233 行的
const [userTags, setUserTags] = useState([]);
// 替换为
const [userProfile, setUserProfile] = useState(null);
```

3. 替换 `useEffect`（第 257-288 行）中的标签获取逻辑为画像获取逻辑：
```js
  // 获取用户画像，用于个性化
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        // 获取画像
        let profile = await ProfileService.getProfile();
        if (cancelled) return;

        // 检查是否需要懒更新（> 24h 未更新）
        if (profile && profile.updated_at) {
          const hoursSinceUpdate = (Date.now() - new Date(profile.updated_at).getTime()) / (1000 * 60 * 60);
          if (hoursSinceUpdate > 24) {
            // 后台触发刷新
            ProfileService.refreshProfile().then(refreshed => {
              if (!cancelled && refreshed) setUserProfile(refreshed);
            }).catch(() => {});
          }
        }

        if (!cancelled) setUserProfile(profile);
      } catch {
        // 画像未生成（新用户），尝试刷新
        try {
          const refreshed = await ProfileService.refreshProfile();
          if (!cancelled && refreshed) setUserProfile(refreshed);
        } catch { /* 静默失败 */ }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);
```

4. 修改 `sendMessage` 中 `buildSystemPrompt` 调用（第 377 行），将 `userTags` 替换为 `userProfile`：
```js
// 将
const full = await streamLLM(llmConfig, buildSystemPrompt(activePersona, userTags), apiMessages, {
// 改为
const full = await streamLLM(llmConfig, buildSystemPrompt(activePersona, userProfile), apiMessages, {
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Amadeus/Amadeus.jsx
git commit -m "feat: integrate user profile fetching into Navi AI component"
```

---

### Task 9: 首页随心斩推荐集成

**Files:**
- Modify: `src/pages/HomePage.jsx`

- [ ] **Step 1: 修改 fetchRandom 函数**

在 `HomePage.jsx` 中：

1. 添加 import：
```js
import { RecommendService } from '../services/api';
```
（`RecommendService` 已在 `api.js` 中导出，确保 import 正确）

2. 修改 `fetchRandom` 函数（第 408-419 行）：
```js
  const fetchRandom = useCallback(async (type) => {
    setRandomLoading(true);
    try {
      const data = await RecommendService.getRecommend('home_random');
      const items = data?.items || [];
      if (items.length > 0) {
        // 加权随机选择一条
        const totalWeight = items.reduce((s, i) => s + (i.score || 1), 0);
        let rand = Math.random() * totalWeight;
        let selected = items[0];
        for (const item of items) {
          rand -= (item.score || 1);
          if (rand <= 0) { selected = item; break; }
        }
        // 从 bangumi_subjects 获取完整条目信息
        const subject = await BangumiService.getSubject(selected.subject_id);
        setRandomSubject(subject);
      } else {
        // 降级到原有逻辑
        const typeCode = TYPE_OPTIONS.find(o => o.key === (type || randomType))?.typeCode || 0;
        const subject = await BangumiService.getRandomSubject(typeCode);
        setRandomSubject(subject);
      }
    } catch {
      // 降级：使用原有随机逻辑
      try {
        const typeCode = TYPE_OPTIONS.find(o => o.key === (type || randomType))?.typeCode || 0;
        const subject = await BangumiService.getRandomSubject(typeCode);
        setRandomSubject(subject);
      } catch {
        setRandomSubject(null);
      }
    } finally {
      setRandomLoading(false);
    }
  }, [randomType]);
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/HomePage.jsx
git commit -m "feat: integrate personalized recommendation into homepage random card"
```

---

### Task 10: 放课后帖子加权排序

**Files:**
- Modify: `src/components/Forum/Forum.jsx`

- [ ] **Step 1: 添加画像获取和板区加权排序**

在 `Forum.jsx` 中：

1. 添加 import：
```js
import { ProfileService } from '../../services/api';
```

2. 在组件内添加画像状态和获取逻辑（在 `loadPosts` 之前）：
```js
  const [typeAffinity, setTypeAffinity] = useState({});

  // 获取用户画像用于帖子加权
  useEffect(() => {
    if (!currentUser?.id) return;
    ProfileService.getProfile()
      .then(p => setTypeAffinity(p?.type_affinity || {}))
      .catch(() => setTypeAffinity({}));
  }, [currentUser?.id]);
```

3. 修改 `filteredPosts` useMemo（第 150-158 行），添加加权排序：
```js
  const filteredPosts = useMemo(() => {
    let result = posts;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        (p.tags && Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q)))
      );
    }
    // 类型亲和度加权排序
    const boardWeightMap = {};
    if (typeAffinity.anime > 0.3) {
      const w = typeAffinity.anime > 0.5 ? 1.3 : 1.15;
      boardWeightMap.newanime = w; boardWeightMap.oldanime = w;
    }
    if (typeAffinity.game > 0.3) {
      const w = typeAffinity.game > 0.5 ? 1.3 : 1.15;
      boardWeightMap.galgame = w; boardWeightMap.game = w;
    }
    if (typeAffinity.novel > 0.3) {
      const w = typeAffinity.novel > 0.5 ? 1.3 : 1.15;
      boardWeightMap.novel = w;
    }
    return result.map(p => ({
      ...p,
      _weight: boardWeightMap[p.category] || 1.0,
    })).sort((a, b) => b._weight - a._weight);
  }, [searchQuery, posts, typeAffinity]);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Forum/Forum.jsx
git commit -m "feat: add type affinity weighted sorting to forum posts"
```

---

### Task 11: 毒电波资讯加权排序

**Files:**
- Modify: `src/components/NewsZone/NewsZone.jsx`

- [ ] **Step 1: 添加画像获取和资讯加权排序**

在 `NewsZone.jsx` 中：

1. 添加 import：
```js
import { ProfileService } from '../../services/api';
```

2. 在组件内添加画像状态：
```js
  const [typeAffinity, setTypeAffinity] = useState({});

  useEffect(() => {
    if (!currentUser?.id) return;
    ProfileService.getProfile()
      .then(p => setTypeAffinity(p?.type_affinity || {}))
      .catch(() => setTypeAffinity({}));
  }, [currentUser?.id]);
```

3. 修改 `filteredNews` 过滤逻辑（第 58-62 行），添加加权：
```js
  const filteredNews = useMemo(() => {
    let result = allNews.filter(n => {
      if (activeSource && n.source !== activeSource) return false;
      if (activeCategory !== '全部' && n.category !== activeCategory) return false;
      return true;
    });

    // 类型亲和度加权
    const categoryWeightMap = {};
    if (typeAffinity.anime > 0.3) {
      const w = typeAffinity.anime > 0.5 ? 1.3 : 1.15;
      categoryWeightMap['新番导视'] = w;
      categoryWeightMap['热门推荐'] = w;
      categoryWeightMap['每周速报'] = w;
    }
    if (typeAffinity.game > 0.3) {
      const w = typeAffinity.game > 0.5 ? 1.3 : 1.15;
      categoryWeightMap['游戏推荐'] = w;
      categoryWeightMap['VN推荐'] = w;
      categoryWeightMap['Steam精选'] = w;
      categoryWeightMap['Steam特惠'] = w;
      categoryWeightMap['Steam新品'] = w;
    }
    if (typeAffinity.novel > 0.3) {
      const w = typeAffinity.novel > 0.5 ? 1.3 : 1.15;
      categoryWeightMap['轻小说'] = w;
    }

    return result.map(n => ({
      ...n,
      _weight: categoryWeightMap[n.category] || 1.0,
    })).sort((a, b) => b._weight - a._weight);
  }, [allNews, activeSource, activeCategory, typeAffinity]);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/NewsZone/NewsZone.jsx
git commit -m "feat: add type affinity weighted sorting to news feed"
```

---

### Task 12: 验证与测试

- [ ] **Step 1: 部署 Worker 并执行迁移**

```bash
npx wrangler d1 execute anispace-db --file=worker/migrations/v016_user_profile.sql
npx wrangler deploy
```

- [ ] **Step 2: 验证 API 端点**

```bash
# 测试画像获取（需 JWT token）
curl -H "Authorization: Bearer <token>" https://anispace-oauth-proxy.afterrainliu.workers.dev/api/profile

# 测试画像刷新
curl -X POST -H "Authorization: Bearer <token>" https://anispace-oauth-proxy.afterrainliu.workers.dev/api/profile/refresh

# 测试推荐获取
curl -H "Authorization: Bearer <token>" "https://anispace-oauth-proxy.afterrainliu.workers.dev/api/recommend?scene=home_random"

# 测试行为上报
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"action":"view_subject","target_type":"anime","target_id":1}' https://anispace-oauth-proxy.afterrainliu.workers.dev/api/behavior
```

- [ ] **Step 3: 前端构建验证**

```bash
npm run build
```
Expected: 无编译错误。

- [ ] **Step 4: 功能测试检查清单**

- [ ] 新用户首次打开 Navi AI → 触发画像生成，注入 system prompt
- [ ] 有收藏的用户打开 Navi AI → 画像注入包含正确的标签偏好
- [ ] 首页随心斩 → 推荐与用户偏好匹配的条目
- [ ] 放课后帖子 → 匹配用户类型的板区帖子排在前面
- [ ] 毒电波资讯 → 匹配用户类型的资讯排在前面
- [ ] 冷启动用户 → 推荐热门内容
- [ ] 行为上报 → behavior_log 正确记录
- [ ] Cron 定时清理 → 7 天前日志被删除

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: verify profile and recommendation system end-to-end"
```

---

### 文件变更汇总

| 操作 | 文件 |
|------|------|
| 新增 | `worker/migrations/v016_user_profile.sql` |
| 新增 | `worker/lib/user-profile.js` |
| 新增 | `worker/lib/recommend-engine.js` |
| 修改 | `worker/oauth-proxy.js` |
| 修改 | `worker/schema.sql` |
| 修改 | `worker/wrangler.toml` |
| 修改 | `src/services/api.js` |
| 修改 | `src/components/Amadeus/personas.js` |
| 修改 | `src/components/Amadeus/Amadeus.jsx` |
| 修改 | `src/pages/HomePage.jsx` |
| 修改 | `src/components/Forum/Forum.jsx` |
| 修改 | `src/components/NewsZone/NewsZone.jsx` |