# 产品级搜广推系统 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 v1.0 基础推荐系统升级为产品级搜广推系统，覆盖推荐四层架构、搜索个性化、探索页、推广位、全量行为上报。

**Architecture:** 渐进式升级现有代码，新增 LR 精排器、探索引擎、行为采集器、会话画像管理器。四层推荐（召回→粗排→精排→重排）替换简单加权。前端全量接入 BehaviorService。

**Tech Stack:** Cloudflare Worker (ES Module), D1 (SQLite), React 19, Vite 8, Vitest

---

## 阶段一：基础设施（行为上报 + 画像扩展）

### Task 1: 数据库迁移 v017

**Files:**
- Create: `worker/migrations/v017_search_promote.sql`

- [ ] **Step 1: 创建迁移文件**

```sql
-- v017: 产品级搜广推系统
-- 新增 user_profile_short、promotion_slots 表
-- 扩展 user_profiles 表

-- 短期画像表（7天行为聚合）
CREATE TABLE IF NOT EXISTS user_profile_short (
  user_id INTEGER PRIMARY KEY,
  recent_tags TEXT DEFAULT '{}',
  recent_types TEXT DEFAULT '{}',
  recent_actions INTEGER DEFAULT 0,
  recent_subjects TEXT DEFAULT '[]',
  session_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 推广位表
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
CREATE INDEX IF NOT EXISTS idx_promo_slot ON promotion_slots(slot_name, is_active);

-- 扩展 user_profiles 表
ALTER TABLE user_profiles ADD COLUMN social_features TEXT DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN preference_vector TEXT DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN lifecycle_stage TEXT DEFAULT 'new';
```

- [ ] **Step 2: 更新 schema.sql**

在 `worker/schema.sql` 的 `user_profiles` 定义中追加三个新字段，并追加 `user_profile_short` 和 `promotion_slots` 表定义。

- [ ] **Step 3: Commit**

```bash
git add worker/migrations/v017_search_promote.sql worker/schema.sql
git commit -m "feat: add user_profile_short, promotion_slots tables and extend user_profiles"
```

---

### Task 2: 前端行为采集器

**Files:**
- Create: `src/lib/BehaviorCollector.js`

- [ ] **Step 1: 创建行为采集器**

```js
/**
 * ANISpace 前端行为采集器
 * 批量上报用户行为，10秒窗口合并请求
 */
import { apiRequest } from '../services/api';

class BehaviorCollector {
  constructor() {
    this.queue = [];
    this.flushInterval = 10000;
    this.timer = null;
    this.pageEnterTime = Date.now();
    this.currentPage = '';
  }

  /** 记录行为 */
  track(action, targetType = '', targetId = 0, metadata = {}) {
    this.queue.push({
      action,
      target_type: targetType,
      target_id: targetId,
      metadata: { ...metadata, _ts: Date.now() },
    });
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.flushInterval);
    }
    // 队列超过 20 条立即刷新
    if (this.queue.length >= 20) this.flush();
  }

  /** 批量上报 */
  async flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    try {
      await apiRequest('/api/behavior/batch', {
        method: 'POST',
        body: JSON.stringify({ actions: batch }),
      });
    } catch {
      // 上报失败，丢弃不重试（避免堆积）
    }
    if (this.queue.length === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 页面进入追踪 */
  trackPageEnter(pageName) {
    this.currentPage = pageName;
    this.pageEnterTime = Date.now();
  }

  /** 页面离开追踪（计算停留时长） */
  trackPageLeave() {
    const duration = Date.now() - this.pageEnterTime;
    if (duration > 2000 && this.currentPage) {
      this.track('page_stay', 'page', 0, {
        page: this.currentPage,
        duration_ms: duration,
      });
    }
  }

  /** 条目浏览 */
  trackViewSubject(subjectId, type, source = '') {
    this.track('view_subject', type, subjectId, { source });
  }

  /** 搜索点击 */
  trackSearchClick(query, subjectId, position, type = '') {
    this.track('search_click', type, subjectId, { query, position });
  }

  /** 收藏操作 */
  trackMarkCollection(subjectId, status, type = '') {
    this.track('mark_collection', type, subjectId, { status, subject_id: subjectId });
  }

  /** 评分操作 */
  trackRate(subjectId, rating, type = '') {
    this.track('rate', type, subjectId, { rating });
  }

  /** 帖子浏览 */
  trackViewPost(postId, board = '') {
    this.track('view_post', 'post', postId, { board });
  }

  /** 资讯点击 */
  trackNewsClick(newsId, source = '', category = '') {
    this.track('news_click', 'news', newsId, { source, category });
  }

  /** 推荐点击 */
  trackRecommendClick(targetId, scene, position, reason, type = '') {
    this.track('recommend_click', type, targetId, { scene, position, reason });
  }

  /** Navi 对话 */
  trackNaviChat(turnCount, hasRecommend) {
    this.track('navi_chat', 'ai', 0, { turn_count: turnCount, has_recommend: hasRecommend });
  }

  /** 滚动深度 */
  trackScrollDepth(page, depthPct) {
    this.track('scroll_depth', 'page', 0, { page, depth_pct: depthPct });
  }
}

// 单例导出
export const behaviorCollector = new BehaviorCollector();

// 页面卸载时刷新
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    behaviorCollector.trackPageLeave();
    behaviorCollector.flush();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/BehaviorCollector.js
git commit -m "feat: add frontend BehaviorCollector with batch reporting"
```

---

### Task 3: 前端实时会话画像

**Files:**
- Create: `src/lib/SessionProfile.js`

- [ ] **Step 1: 创建会话画像管理器**

```js
/**
 * ANISpace 实时会话画像
 * 管理当前会话的用户行为上下文，30分钟无活动自动过期
 */
const STORAGE_KEY = 'anispace_session_profile';
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30分钟

class SessionProfile {
  constructor() {
    this.profile = this._load();
    this._checkExpiry();
  }

  /** 记录行为到会话画像 */
  trackAction(type, targetId, metadata = {}) {
    this._checkExpiry();
    this.profile.actions.push({
      type,
      target_id: targetId,
      ts: Date.now(),
      ...metadata,
    });
    // 保留最近 100 条
    if (this.profile.actions.length > 100) {
      this.profile.actions = this.profile.actions.slice(-100);
    }
    this._updateInterests();
    this.profile.session_duration_ms = Date.now() - this.profile.session_start;
    this._save();
  }

  /** 获取当前兴趣标签 */
  getCurrentInterests() {
    this._checkExpiry();
    return this.profile.current_interests || [];
  }

  /** 获取最近浏览的 subject_id 列表 */
  getRecentViewSubjects() {
    this._checkExpiry();
    return this.profile.actions
      .filter(a => a.type === 'view_subject' || a.type === 'search_click')
      .map(a => a.target_id)
      .filter(Boolean)
      .slice(-20);
  }

  /** 获取会话摘要（用于传递给推荐 API） */
  getSessionSummary() {
    this._checkExpiry();
    return {
      current_interests: this.profile.current_interests,
      recent_views: this.getRecentViewSubjects(),
      session_duration_ms: this.profile.session_duration_ms,
    };
  }

  /** 获取 HTTP header 值 */
  getHeader() {
    const summary = this.getSessionSummary();
    if (summary.current_interests.length === 0 && summary.recent_views.length === 0) {
      return '';
    }
    return JSON.stringify(summary);
  }

  /** 清除过期会话 */
  _checkExpiry() {
    if (this.profile.session_start && Date.now() - this.profile.session_start > SESSION_TIMEOUT) {
      this.profile = this._createNew();
      this._save();
    }
  }

  /** 从当前行为中提取兴趣标签 */
  _updateInterests() {
    const tagCount = {};
    for (const action of this.profile.actions) {
      if (action.tags && Array.isArray(action.tags)) {
        for (const tag of action.tags) {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
      }
      if (action.type) {
        tagCount[action.type] = (tagCount[action.type] || 0) + 1;
      }
    }
    this.profile.current_interests = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
  }

  _createNew() {
    return {
      session_id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      session_start: Date.now(),
      actions: [],
      current_interests: [],
      session_duration_ms: 0,
    };
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return this._createNew();
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {}
  }
}

export const sessionProfile = new SessionProfile();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/SessionProfile.js
git commit -m "feat: add frontend SessionProfile manager"
```

---

### Task 4: 后端批量行为上报 + 短期画像计算

**Files:**
- Create: `worker/lib/behavior-collector.js`
- Modify: `worker/lib/user-profile.js`
- Modify: `worker/oauth-proxy.js`

- [ ] **Step 1: 创建后端批量行为处理**

```js
/**
 * worker/lib/behavior-collector.js
 * 后端批量行为处理 + 短期画像计算
 */

/**
 * 批量写入行为日志
 */
export async function batchInsertBehaviors(db, userId, actions) {
  const stmt = db.prepare(
    'INSERT INTO behavior_log (user_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)'
  );
  const batch = actions.map(a =>
    stmt.bind(userId, a.action, a.target_type || '', a.target_id || 0, JSON.stringify(a.metadata || {}))
  );
  await db.batch(batch);
}

/**
 * 计算用户短期画像（7天行为聚合）
 */
export async function computeShortProfile(db, userId) {
  const sevenDaysAgo = "datetime('now', '-7 days')";

  // 近7天行为统计
  const actionStats = await db.prepare(
    `SELECT action, target_type, COUNT(*) as cnt
     FROM behavior_log
     WHERE user_id = ? AND created_at > ${sevenDaysAgo}
     GROUP BY action, target_type`
  ).bind(userId).all();

  // 近7天交互的条目
  const recentSubjects = await db.prepare(
    `SELECT DISTINCT target_id
     FROM behavior_log
     WHERE user_id = ? AND target_type IN ('anime', 'game', 'novel')
       AND created_at > ${sevenDaysAgo}
     LIMIT 100`
  ).bind(userId).all();

  // 近7天交互的标签
  const subjectIds = (recentSubjects.results || []).map(r => r.target_id);
  let recentTags = {};
  if (subjectIds.length > 0) {
    const placeholders = subjectIds.map(() => '?').join(',');
    const subjects = await db.prepare(
      `SELECT tags FROM bangumi_subjects WHERE id IN (${placeholders})`
    ).bind(...subjectIds).all();

    const tagCount = {};
    for (const s of (subjects.results || [])) {
      try {
        const tags = JSON.parse(s.tags || '[]');
        for (const tag of tags) {
          const name = typeof tag === 'string' ? tag : tag.name;
          if (name) tagCount[name] = (tagCount[name] || 0) + 1;
        }
      } catch {}
    }
    recentTags = tagCount;
  }

  // 近7天类型分布
  const recentTypes = {};
  for (const row of (actionStats.results || [])) {
    if (['anime', 'game', 'novel'].includes(row.target_type)) {
      recentTypes[row.target_type] = (recentTypes[row.target_type] || 0) + row.cnt;
    }
  }

  // 总行为数
  const totalActions = (actionStats.results || []).reduce((s, r) => s + r.cnt, 0);

  // 会话数估算（page_stay 行为数）
  const sessionResult = await db.prepare(
    `SELECT COUNT(*) as cnt FROM behavior_log
     WHERE user_id = ? AND action = 'page_stay'
       AND created_at > ${sevenDaysAgo}`
  ).bind(userId).first();

  const shortProfile = {
    recent_tags: JSON.stringify(recentTags),
    recent_types: JSON.stringify(recentTypes),
    recent_actions: totalActions,
    recent_subjects: JSON.stringify(subjectIds),
    session_count: sessionResult?.cnt || 0,
    updated_at: new Date().toISOString(),
  };

  // UPSERT
  await db.prepare(
    `INSERT OR REPLACE INTO user_profile_short
     (user_id, recent_tags, recent_types, recent_actions, recent_subjects, session_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    userId, shortProfile.recent_tags, shortProfile.recent_types,
    shortProfile.recent_actions, shortProfile.recent_subjects,
    shortProfile.session_count, shortProfile.updated_at
  ).run();

  return shortProfile;
}
```

- [ ] **Step 2: 扩展 user-profile.js — 新增社交特征、生命周期、向量**

在 `worker/lib/user-profile.js` 的 `computeUserProfile` 函数中，在 `return` 之前添加：

```js
  // 计算社交特征
  const socialFeatures = await computeSocialFeatures(db, userId);

  // 计算生命周期阶段
  const lifecycleStage = computeLifecycleStage(items, activityScore);

  // 计算偏好向量（tag_weights 截断为 top-64）
  const preferenceVector = computePreferenceVector(tagWeights);
```

并在 return 对象中添加：

```js
    social_features: JSON.stringify(socialFeatures),
    preference_vector: JSON.stringify(preferenceVector),
    lifecycle_stage: lifecycleStage,
```

新增三个函数：

```js
async function computeSocialFeatures(db, userId) {
  const followCount = await db.prepare(
    'SELECT COUNT(*) as cnt FROM follows WHERE follower_id = ?'
  ).bind(userId).first();
  const followerCount = await db.prepare(
    'SELECT COUNT(*) as cnt FROM follows WHERE following_id = ?'
  ).bind(userId).first();
  const postCount = await db.prepare(
    'SELECT COUNT(*) as cnt FROM posts WHERE user_id = ?'
  ).bind(userId).first();
  const avgLikes = await db.prepare(
    'SELECT AVG(like_count) as avg FROM posts WHERE user_id = ?'
  ).bind(userId).first();

  return {
    follow_count: followCount?.cnt || 0,
    follower_count: followerCount?.cnt || 0,
    post_count: postCount?.cnt || 0,
    avg_post_likes: Math.round((avgLikes?.avg || 0) * 10) / 10,
  };
}

function computeLifecycleStage(items, activityScore) {
  if (items.length < 5) return 'new';
  if (items.length < 20) return 'growing';
  if (activityScore >= 0.5) return 'active';
  return 'dormant';
}

function computePreferenceVector(tagWeights) {
  return Object.entries(tagWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 64)
    .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {});
}
```

同时更新 `buildEmptyProfile` 添加新字段：

```js
    social_features: '{}',
    preference_vector: '{}',
    lifecycle_stage: 'new',
```

- [ ] **Step 3: 在 oauth-proxy.js 中添加批量行为上报路由**

在 `handleApiRoutes` 函数中，`POST /api/behavior` 路由之后添加：

```js
  // POST /api/behavior/batch — 批量行为上报
  if (method === 'POST' && pathname === '/api/behavior/batch') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const actions = body.actions;
      if (!Array.isArray(actions) || actions.length === 0) {
        return jsonResponse({ error: 'actions 必须为非空数组' }, 400, origin);
      }
      if (actions.length > 50) {
        return jsonResponse({ error: '单次最多上报 50 条行为' }, 400, origin);
      }

      await behaviorCollector.batchInsertBehaviors(env.DB, authUser.userId, actions);

      // 更新 last_action_at
      await env.DB.prepare(
        "UPDATE user_profiles SET last_action_at = datetime('now') WHERE user_id = ?"
      ).bind(authUser.userId).run();

      return jsonResponse({ success: true, count: actions.length }, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '批量上报失败: ' + err.message }, 500, origin);
    }
  }
```

在文件顶部 import 区域添加：

```js
import * as behaviorCollector from './lib/behavior-collector.js';
```

在路由前缀匹配链中添加 `/api/behavior/batch`（已有 `/api/behavior` 前缀匹配，无需额外添加）。

- [ ] **Step 4: 在 Cron scheduled handler 中添加短期画像刷新**

在 `scheduled` handler 中，现有 `recommendEngine.refreshAllRecommendCaches` 之后添加：

```js
      // 每日：刷新活跃用户短期画像
      try {
        const activeUsers = await env.DB.prepare(
          `SELECT DISTINCT user_id FROM behavior_log
           WHERE created_at > datetime('now', '-7 days')`
        ).all();
        for (const row of (activeUsers.results || [])) {
          try {
            await behaviorCollector.computeShortProfile(env.DB, row.user_id);
          } catch (err) {
            console.error(`Short profile error for user ${row.user_id}:`, err.message);
          }
        }
        console.log('Short profile refresh completed');
      } catch (err) {
        console.error('Short profile refresh error:', err.message);
      }
```

- [ ] **Step 5: 添加 GET /api/profile/short 路由**

```js
  // GET /api/profile/short — 获取短期画像
  if (method === 'GET' && pathname === '/api/profile/short') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const short = await env.DB.prepare(
        'SELECT * FROM user_profile_short WHERE user_id = ?'
      ).bind(authUser.userId).first();

      if (!short) {
        return jsonResponse({ error: '短期画像未生成' }, 404, origin);
      }

      return jsonResponse({
        user_id: short.user_id,
        recent_tags: safeJsonParse(short.recent_tags, {}),
        recent_types: safeJsonParse(short.recent_types, {}),
        recent_actions: short.recent_actions,
        recent_subjects: safeJsonParse(short.recent_subjects, []),
        session_count: short.session_count,
        updated_at: short.updated_at,
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取短期画像失败: ' + err.message }, 500, origin);
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add worker/lib/behavior-collector.js worker/lib/user-profile.js worker/oauth-proxy.js
git commit -m "feat: add batch behavior reporting, short profile computation, social features"
```

---

## 阶段二：推荐四层架构

### Task 5: LR 精排器

**Files:**
- Create: `worker/lib/lr-ranker.js`

- [ ] **Step 1: 创建 LR 精排器**

```js
/**
 * worker/lib/lr-ranker.js
 * LR (Logistic Regression) 精排器
 * 特征加权 + sigmoid 输出 [0, 1] 概率
 */

// 特征权重（可通过后台调整）
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

/**
 * LR 预测
 * @param {object} features - 特征字典
 * @returns {number} [0, 1] 概率值
 */
export function lrPredict(features) {
  let z = LR_BIAS;
  for (const [key, weight] of Object.entries(LR_WEIGHTS)) {
    z += weight * (features[key] || 0);
  }
  return 1 / (1 + Math.exp(-z));
}

/**
 * 为候选条目提取特征
 * @param {object} item - 候选条目 {subject_id, type, tags, score, cf_score, ...}
 * @param {object} profile - 用户画像 {tag_weights, type_affinity, rating_tendency, ...}
 * @param {object} shortProfile - 短期画像 {recent_tags, recent_types, ...}
 * @returns {object} 特征字典
 */
export function extractFeatures(item, profile, shortProfile) {
  const tagWeights = profile?.tag_weights || {};
  const typeAffinity = profile?.type_affinity || {};
  const ratingTendency = profile?.rating_tendency || 'normal';
  const recentTags = shortProfile?.recent_tags || {};

  // 1. 标签匹配度：条目标签与用户标签权重的余弦相似度
  let tagMatch = 0;
  if (item.tags && Array.isArray(item.tags)) {
    let dotProduct = 0;
    let userNorm = 0;
    let itemNorm = 0;
    for (const tag of item.tags) {
      const name = typeof tag === 'string' ? tag : tag.name;
      if (!name) continue;
      const uw = tagWeights[name] || 0;
      const sw = recentTags[name] || 0;
      const combinedWeight = uw * 0.7 + sw * 0.3;
      dotProduct += combinedWeight;
      userNorm += combinedWeight * combinedWeight;
      itemNorm += 1;
    }
    tagMatch = itemNorm > 0 ? dotProduct / (Math.sqrt(userNorm) * Math.sqrt(itemNorm)) : 0;
  }

  // 2. 类型匹配度
  const typeKey = { 1: 'novel', 2: 'anime', 4: 'game', 6: 'real' }[item.type] || '';
  const typeMatch = typeAffinity[typeKey] || 0;

  // 3. 协同过滤分
  const cfScore = item.cf_score || 0;

  // 4. 全局热度
  const popularity = Math.min((item.score || 0) / 10, 1.0);

  // 5. 新鲜度（入库时间距今天数）
  let recency = 0;
  if (item.created_at) {
    const daysSince = (Date.now() - new Date(item.created_at).getTime()) / 86400000;
    recency = Math.max(0, 1 - daysSince / 365);
  }

  // 6. 评分倾向匹配
  let ratingMatch = 0.5;
  if (ratingTendency === 'strict' && (item.score || 0) >= 8) ratingMatch = 1.0;
  if (ratingTendency === 'generous') ratingMatch = 0.7;

  // 7. 社交信号
  const social = item.social_count ? Math.min(item.social_count / 10, 1.0) : 0;

  return {
    tag_match: tagMatch,
    type_match: typeMatch,
    cf_score: cfScore,
    popularity: popularity,
    recency: recency,
    rating_match: ratingMatch,
    social: social,
  };
}

/**
 * 对候选集进行精排
 * @param {Array} candidates - 候选条目数组
 * @param {object} profile - 用户画像
 * @param {object} shortProfile - 短期画像
 * @returns {Array} 排序后的条目数组（带 _lr_score）
 */
export function rankWithLR(candidates, profile, shortProfile) {
  return candidates
    .map(item => {
      const features = extractFeatures(item, profile, shortProfile);
      const lrScore = lrPredict(features);
      return { ...item, _lr_score: lrScore, _features: features };
    })
    .sort((a, b) => b._lr_score - a._lr_score);
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/lib/lr-ranker.js
git commit -m "feat: add LR ranker for recommendation fine ranking"
```

---

### Task 6: 推荐引擎四层架构重构

**Files:**
- Modify: `worker/lib/recommend-engine.js`

- [ ] **Step 1: 重构推荐引擎为四层架构**

替换 `worker/lib/recommend-engine.js` 全部内容：

```js
/**
 * ANISpace 推荐引擎 v2
 * 四层架构：召回 → 粗排 → 精排 → 重排
 */

import { lrPredict, extractFeatures } from './lr-ranker.js';

function safeJson(value, fallback) {
  if (typeof value === 'string' && value) {
    try { return JSON.parse(value); } catch {}
  }
  return value ?? fallback;
}

// ═══════════════════════════════════════
// 第一层：多路召回
// ═══════════════════════════════════════

async function recallLayer(db, userId, profile, shortProfile) {
  const tagWeights = safeJson(profile.tag_weights, {});
  const typeAffinity = safeJson(profile.type_affinity, {});
  const similarUsers = safeJson(profile.similar_users, []);
  const preferenceVector = safeJson(profile.preference_vector, {});

  const candidates = [];
  const seenIds = new Set();

  // 1. 协同过滤召回
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
       LIMIT 50`
    ).bind(...similarIds, userId).all();

    for (const item of (cfItems.results || [])) {
      if (!seenIds.has(item.subject_id)) {
        candidates.push({ subject_id: item.subject_id, cf_score: item.cnt / 20, recall_source: 'cf' });
        seenIds.add(item.subject_id);
      }
    }
  }

  // 2. 标签向量召回
  const vectorTags = Object.entries(preferenceVector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  if (vectorTags.length > 0) {
    const tagConditions = vectorTags.map(() => `bs.tags LIKE ?`).join(' OR ');
    const tagParams = vectorTags.map(t => `%${t}%`);
    const vectorItems = await db.prepare(
      `SELECT bs.id, bs.type, bs.score, bs.tags
       FROM bangumi_subjects bs
       WHERE (${tagConditions})
         AND bs.id NOT IN (SELECT subject_id FROM collections WHERE user_id = ?)
         AND bs.score >= 7.0
       ORDER BY bs.score DESC
       LIMIT 50`
    ).bind(...tagParams, userId).all();

    for (const item of (vectorItems.results || [])) {
      if (!seenIds.has(item.id)) {
        candidates.push({
          subject_id: item.id, type: item.type, score: item.score,
          tags: safeJson(item.tags, []), cf_score: 0, recall_source: 'vector',
        });
        seenIds.add(item.id);
      }
    }
  }

  // 3. 内容匹配召回（保留 v1 逻辑）
  const topTags = Object.entries(tagWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  if (topTags.length > 0) {
    const tagConditions = topTags.map(() => `bs.tags LIKE ?`).join(' OR ');
    const tagParams = topTags.map(t => `%${t}%`);
    const tagItems = await db.prepare(
      `SELECT bs.id, bs.type, bs.score, bs.tags
       FROM bangumi_subjects bs
       WHERE (${tagConditions})
         AND bs.id NOT IN (SELECT subject_id FROM collections WHERE user_id = ?)
         AND bs.score >= 6.5
       ORDER BY bs.score DESC
       LIMIT 30`
    ).bind(...tagParams, userId).all();

    for (const item of (tagItems.results || [])) {
      if (!seenIds.has(item.id)) {
        candidates.push({
          subject_id: item.id, type: item.type, score: item.score,
          tags: safeJson(item.tags, []), cf_score: 0, recall_source: 'content',
        });
        seenIds.add(item.id);
      }
    }
  }

  // 4. 社交召回
  const socialItems = await db.prepare(
    `SELECT c.subject_id, COUNT(*) as cnt
     FROM collections c
     JOIN follows f ON f.following_id = c.user_id
     WHERE f.follower_id = ?
       AND c.subject_id NOT IN (SELECT subject_id FROM collections WHERE user_id = ?)
     GROUP BY c.subject_id
     ORDER BY cnt DESC
     LIMIT 30`
  ).bind(userId, userId).all();

  for (const item of (socialItems.results || [])) {
    if (!seenIds.has(item.subject_id)) {
      candidates.push({
        subject_id: item.subject_id, cf_score: 0,
        social_count: item.cnt, recall_source: 'social',
      });
      seenIds.add(item.subject_id);
    }
  }

  // 5. 热门兜底
  const hotItems = await db.prepare(
    `SELECT bs.id, bs.type, bs.score, bs.tags
     FROM bangumi_subjects bs
     WHERE bs.id NOT IN (SELECT subject_id FROM collections WHERE user_id = ?)
     ORDER BY bs.score DESC
     LIMIT 30`
  ).bind(userId).all();

  for (const item of (hotItems.results || [])) {
    if (!seenIds.has(item.id)) {
      candidates.push({
        subject_id: item.id, type: item.type, score: item.score,
        tags: safeJson(item.tags, []), cf_score: 0, recall_source: 'hot',
      });
      seenIds.add(item.id);
    }
  }

  return candidates;
}

// ═══════════════════════════════════════
// 第二层：粗排
// ═══════════════════════════════════════

function coarseRankLayer(candidates, profile) {
  const typeAffinity = safeJson(profile.type_affinity, {});

  return candidates
    .map(item => {
      const typeKey = { 1: 'novel', 2: 'anime', 4: 'game', 6: 'real' }[item.type] || '';
      const typeMatch = (typeAffinity[typeKey] || 0) > 0.3 ? 1.0 : 0.5;
      const popularity = Math.min((item.score || 0) / 10, 1.0);
      const coarseScore = typeMatch * 0.6 + popularity * 0.4;
      return { ...item, _coarse_score: coarseScore };
    })
    .sort((a, b) => b._coarse_score - a._coarse_score)
    .slice(0, 50);
}

// ═══════════════════════════════════════
// 第三层：精排 (LR)
// ═══════════════════════════════════════

function fineRankLayer(candidates, profile, shortProfile) {
  const profileObj = {
    tag_weights: safeJson(profile.tag_weights, {}),
    type_affinity: safeJson(profile.type_affinity, {}),
    rating_tendency: profile.rating_tendency,
  };
  const shortObj = shortProfile ? {
    recent_tags: safeJson(shortProfile.recent_tags, {}),
    recent_types: safeJson(shortProfile.recent_types, {}),
  } : {};

  return candidates
    .map(item => {
      const features = extractFeatures(item, profileObj, shortObj);
      const lrScore = lrPredict(features);
      return { ...item, _lr_score: lrScore };
    })
    .sort((a, b) => b._lr_score - a._lr_score)
    .slice(0, 20);
}

// ═══════════════════════════════════════
// 第四层：重排
// ═══════════════════════════════════════

function rerankLayer(candidates, options = {}) {
  const promotions = options.promotions || [];
  const shownSubjects = options.shownSubjects || [];
  const shownSet = new Set(shownSubjects);
  const result = [];
  const typeCount = {};
  let promoIndex = 0;

  for (const item of candidates) {
    // 已展示去重
    if (shownSet.has(item.subject_id)) continue;

    // 类型多样性约束
    const typeKey = item.type || 'unknown';
    typeCount[typeKey] = (typeCount[typeKey] || 0) + 1;
    if (result.length > 3 && typeCount[typeKey] > Math.ceil(result.length * 0.4 + 1)) continue;

    // 新鲜度 boost
    let finalScore = item._lr_score || 0;
    if (item.created_at) {
      const hoursSince = (Date.now() - new Date(item.created_at).getTime()) / 3600000;
      if (hoursSince < 24) finalScore *= 1.1;
    }

    result.push({ ...item, _final_score: finalScore });

    // 推广位插入
    if (result.length % 5 === 0 && promoIndex < promotions.length) {
      result.push({ ...promotions[promoIndex++], is_promotion: true });
    }
  }

  return result;
}

// ═══════════════════════════════════════
// 主入口
// ═══════════════════════════════════════

/**
 * 为单个用户计算推荐并写入缓存
 */
export async function refreshUserRecommendCache(db, userId) {
  const profile = await db.prepare(
    'SELECT * FROM user_profiles WHERE user_id = ?'
  ).bind(userId).first();
  if (!profile) return;

  const shortProfile = await db.prepare(
    'SELECT * FROM user_profile_short WHERE user_id = ?'
  ).bind(userId).first();

  // 获取推广位
  const promotions = await db.prepare(
    `SELECT * FROM promotion_slots
     WHERE is_active = 1
       AND (start_at IS NULL OR start_at <= datetime('now'))
       AND (end_at IS NULL OR end_at >= datetime('now'))
     ORDER BY weight DESC`
  ).all();

  // 四层推荐
  const recalled = await recallLayer(db, userId, profile, shortProfile);
  const coarseRanked = coarseRankLayer(recalled, profile);
  const fineRanked = fineRankLayer(coarseRanked, profile, shortProfile);
  const homeRandom = rerankLayer(fineRanked, {
    promotions: (promotions.results || []).filter(p => p.slot_name === 'home_random'),
  });

  // 放课后帖子加权
  const typeAffinity = safeJson(profile.type_affinity, {});
  const forumPosts = computeForumPosts(typeAffinity);

  // 毒电波资讯加权
  const newsFeed = computeNewsFeed(typeAffinity);

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
 * 放课后帖子加权
 */
function computeForumPosts(typeAffinity) {
  const boardWeights = [];
  if (typeAffinity.anime > 0.3) {
    const weight = typeAffinity.anime > 0.5 ? 1.3 : 1.15;
    boardWeights.push({ board: 'newanime', weight }, { board: 'oldanime', weight });
  }
  if (typeAffinity.game > 0.3) {
    const weight = typeAffinity.game > 0.5 ? 1.3 : 1.15;
    boardWeights.push({ board: 'galgame', weight }, { board: 'game', weight });
  }
  if (typeAffinity.novel > 0.3) {
    const weight = typeAffinity.novel > 0.5 ? 1.3 : 1.15;
    boardWeights.push({ board: 'novel', weight });
  }
  return boardWeights;
}

/**
 * 毒电波资讯加权
 */
function computeNewsFeed(typeAffinity) {
  const categoryWeights = [];
  if (typeAffinity.anime > 0.3) {
    const weight = typeAffinity.anime > 0.5 ? 1.3 : 1.15;
    categoryWeights.push(
      { category: '新番导视', weight },
      { category: '热门推荐', weight },
      { category: '每周速报', weight },
    );
  }
  if (typeAffinity.game > 0.3) {
    const weight = typeAffinity.game > 0.5 ? 1.3 : 1.15;
    categoryWeights.push(
      { category: '游戏推荐', weight },
      { category: 'VN推荐', weight },
      { category: 'Steam精选', weight },
      { category: 'Steam特惠', weight },
      { category: 'Steam新品', weight },
    );
  }
  if (typeAffinity.novel > 0.3) {
    const weight = typeAffinity.novel > 0.5 ? 1.3 : 1.15;
    categoryWeights.push({ category: '轻小说', weight });
  }
  return categoryWeights;
}

/**
 * 为所有活跃用户刷新推荐缓存
 */
export async function refreshAllRecommendCaches(db) {
  const activeUsers = await db.prepare(
    `SELECT DISTINCT user_id FROM behavior_log
     WHERE created_at > datetime('now', '-7 days')
     UNION
     SELECT user_id FROM user_profiles WHERE activity_score >= 0.5`
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
 * 获取热门推荐（冷启动）
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
git commit -m "feat: refactor recommendation engine to 4-layer architecture (recall→coarse→fine→rerank)"
```

---

## 阶段三：搜索升级 + 探索页 + 推广位

### Task 7: 探索引擎

**Files:**
- Create: `worker/lib/explore-engine.js`

- [ ] **Step 1: 创建探索流聚合引擎**

```js
/**
 * worker/lib/explore-engine.js
 * 探索流聚合引擎：多源内容聚合 + 个性化排序
 */

function safeJson(value, fallback) {
  if (typeof value === 'string' && value) {
    try { return JSON.parse(value); } catch {}
  }
  return value ?? fallback;
}

/**
 * 生成探索流
 * @param {object} db - D1 绑定
 * @param {object} profile - 用户画像
 * @param {string} category - 分类过滤
 * @param {number} page - 页码
 * @param {number} pageSize - 每页条数
 */
export async function generateExploreFeed(db, profile, category = '', page = 1, pageSize = 20) {
  const typeAffinity = safeJson(profile?.type_affinity, {});
  const tagWeights = safeJson(profile?.tag_weights, {});
  const offset = (page - 1) * pageSize;

  const items = [];

  // 1. 推荐条目 (40%)
  if (!category || ['anime', 'game', 'novel', '全部'].includes(category)) {
    const typeFilter = category && category !== '全部'
      ? `AND bs.type = ${{'anime':2,'game':4,'novel':1}[category] || 0}`
      : '';
    const subjects = await db.prepare(
      `SELECT bs.id, bs.name, bs.name_cn, bs.type, bs.score, bs.images, bs.tags
       FROM bangumi_subjects bs
       WHERE bs.score >= 7.0 ${typeFilter}
       ORDER BY bs.score DESC
       LIMIT ? OFFSET ?`
    ).bind(Math.ceil(pageSize * 0.4), offset).all();

    for (const s of (subjects.results || [])) {
      items.push({
        item_type: 'subject',
        subject_id: s.id, name: s.name, name_cn: s.name_cn,
        type: s.type, score: s.score,
        images: safeJson(s.images, {}),
        tags: safeJson(s.tags, []),
        created_at: null,
      });
    }
  }

  // 2. 热门帖子 (20%)
  if (!category || category === 'post' || category === '全部') {
    const posts = await db.prepare(
      `SELECT p.id, p.title, p.content, p.category, p.created_at,
              u.username, u.avatar_url,
              (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count
       FROM posts p
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY like_count DESC, p.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(Math.ceil(pageSize * 0.2), offset).all();

    for (const p of (posts.results || [])) {
      items.push({
        item_type: 'post',
        post_id: p.id, title: p.title, content: p.content?.slice(0, 100),
        category: p.category, like_count: p.like_count,
        author: p.username, author_avatar: p.avatar_url,
        created_at: p.created_at,
      });
    }
  }

  // 3. 资讯 (20%)
  if (!category || category === 'news' || category === '全部') {
    const news = await db.prepare(
      `SELECT id, title, summary, source, category, cover_url, created_at
       FROM scraped_news
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(Math.ceil(pageSize * 0.2), offset).all();

    for (const n of (news.results || [])) {
      items.push({
        item_type: 'news',
        news_id: n.id, title: n.title, summary: n.summary,
        source: n.source, category: n.category,
        cover_url: n.cover_url, created_at: n.created_at,
      });
    }
  }

  // 4. 创作者作品 (20%)
  if (!category || category === 'work' || category === '全部') {
    const works = await db.prepare(
      `SELECT w.id, w.title, w.work_type, w.cover_url, w.created_at,
              u.username as author_name
       FROM works w
       LEFT JOIN users u ON w.user_id = u.id
       ORDER BY w.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(Math.ceil(pageSize * 0.2), offset).all();

    for (const w of (works.results || [])) {
      items.push({
        item_type: 'work',
        work_id: w.id, title: w.title, work_type: w.work_type,
        cover_url: w.cover_url, author_name: w.author_name,
        created_at: w.created_at,
      });
    }
  }

  // 个性化排序
  const ranked = personalizeExploreItems(items, typeAffinity, tagWeights);

  return {
    items: ranked.slice(0, pageSize),
    page,
    has_more: ranked.length >= pageSize,
  };
}

function personalizeExploreItems(items, typeAffinity, tagWeights) {
  return items.map(item => {
    let boost = 1.0;

    // 类型匹配
    if (item.item_type === 'subject') {
      const typeKey = { 2: 'anime', 4: 'game', 1: 'novel', 6: 'real' }[item.type] || '';
      if (typeKey && typeAffinity[typeKey] > 0.3) boost *= 1.2;
    }

    // 标签匹配
    if (item.tags && Array.isArray(item.tags)) {
      for (const tag of item.tags) {
        const name = typeof tag === 'string' ? tag : tag.name;
        if (name && tagWeights[name]) boost *= 1.05;
      }
    }

    // 新鲜度
    if (item.created_at) {
      const daysSince = (Date.now() - new Date(item.created_at).getTime()) / 86400000;
      if (daysSince < 1) boost *= 1.3;
      else if (daysSince < 7) boost *= 1.1;
    }

    return { ...item, _explore_score: (item.score || item.like_count || 0) * boost };
  }).sort((a, b) => b._explore_score - a._explore_score);
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/lib/explore-engine.js
git commit -m "feat: add explore engine for multi-source content aggregation"
```

---

### Task 8: Worker 新增路由（探索 + 推广 + 搜索建议）

**Files:**
- Modify: `worker/oauth-proxy.js`

- [ ] **Step 1: 添加 import**

```js
import * as exploreEngine from './lib/explore-engine.js';
```

- [ ] **Step 2: 添加 3 个新路由**

在 `handleApiRoutes` 函数中，`GET /api/recommend/refresh` 之后添加：

```js
  // GET /api/explore — 探索流
  if (method === 'GET' && pathname === '/api/explore') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const url = new URL(request.url);
    const category = url.searchParams.get('category') || '';
    const page = parseInt(url.searchParams.get('page') || '1', 10);

    try {
      const profile = await env.DB.prepare(
        'SELECT * FROM user_profiles WHERE user_id = ?'
      ).bind(authUser.userId).first();

      const result = await exploreEngine.generateExploreFeed(env.DB, profile, category, page);
      return jsonResponse(result, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取探索流失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/promotions — 获取推广位
  if (method === 'GET' && pathname === '/api/promotions') {
    const url = new URL(request.url);
    const slot = url.searchParams.get('slot') || '';

    try {
      let query = `SELECT * FROM promotion_slots
                   WHERE is_active = 1
                     AND (start_at IS NULL OR start_at <= datetime('now'))
                     AND (end_at IS NULL OR end_at >= datetime('now'))`;
      const params = [];
      if (slot) {
        query += ' AND slot_name = ?';
        params.push(slot);
      }
      query += ' ORDER BY weight DESC';

      const result = params.length > 0
        ? await env.DB.prepare(query).bind(...params).all()
        : await env.DB.prepare(query).all();

      return jsonResponse({ promotions: result.results || [] }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取推广位失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/search/suggestions — 搜索建议
  if (method === 'GET' && pathname === '/api/search/suggestions') {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';

    if (q.length < 1) return jsonResponse({ suggestions: [] }, 200, origin);

    try {
      // 从 bangumi_subjects 和 bangumi_index 搜索
      const subjects = await env.DB.prepare(
        `SELECT name, name_cn FROM bangumi_subjects
         WHERE name LIKE ? OR name_cn LIKE ?
         LIMIT 5`
      ).bind(`${q}%`, `${q}%`).all();

      const suggestions = (subjects.results || []).map(s => ({
        text: s.name_cn || s.name,
        type: 'subject',
      }));

      return jsonResponse({ suggestions }, 200, origin);
    } catch (err) {
      return jsonResponse({ suggestions: [] }, 200, origin);
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add worker/oauth-proxy.js
git commit -m "feat: add explore, promotions, search suggestions API routes"
```

---

### Task 9: 前端 API 服务层扩展

**Files:**
- Modify: `src/services/api.js`

- [ ] **Step 1: 添加新 Service**

在 `api.js` 末尾 `RecommendService` 之后添加：

```js
// ─── ExploreService ───
// 探索流
export const ExploreService = {
  async getExplore(category = '', page = 1) {
    return apiRequest(`/api/explore?category=${category}&page=${page}`);
  },
};

// ─── PromotionService ───
// 推广位
export const PromotionService = {
  async getPromotions(slot = '') {
    return apiRequest(`/api/promotions?slot=${slot}`);
  },
};

// ─── SearchSuggestionService ───
// 搜索建议
export const SearchSuggestionService = {
  async getSuggestions(q) {
    if (!q || q.length < 1) return { suggestions: [] };
    return apiRequest(`/api/search/suggestions?q=${encodeURIComponent(q)}`);
  },
};

// ─── ShortProfileService ───
// 短期画像
export const ShortProfileService = {
  async getShortProfile() {
    return apiRequest('/api/profile/short');
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/services/api.js
git commit -m "feat: add ExploreService, PromotionService, SearchSuggestionService, ShortProfileService"
```

---

### Task 10: 探索页前端

**Files:**
- Create: `src/pages/ExplorePage.jsx`
- Create: `src/pages/ExplorePage.css`

- [ ] **Step 1: 创建探索页组件**

```jsx
// src/pages/ExplorePage.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { ExploreService } from '../services/api';
import { useApp } from '../context/AppContext';
import { behaviorCollector } from '../lib/BehaviorCollector';

const CATEGORIES = [
  { key: '', label: '全部' },
  { key: 'anime', label: '番剧' },
  { key: 'game', label: '游戏' },
  { key: 'novel', label: '小说' },
  { key: 'post', label: '帖子' },
  { key: 'news', label: '资讯' },
  { key: 'work', label: '作品' },
];

export default function ExplorePage() {
  const { isAuthenticated, openAuth } = useApp();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const observerRef = useRef(null);

  const loadItems = useCallback(async (cat, pg) => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const result = await ExploreService.getExplore(cat, pg);
      if (pg === 1) {
        setItems(result.items || []);
      } else {
        setItems(prev => [...prev, ...(result.items || [])]);
      }
      setHasMore(result.has_more);
    } catch {
      if (pg === 1) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    setPage(1);
    loadItems(category, 1);
    behaviorCollector.trackPageEnter('explore');
    return () => behaviorCollector.trackPageLeave();
  }, [category, loadItems]);

  // 无限滚动
  const lastItemRef = useCallback(node => {
    if (loading) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        const nextPage = page + 1;
        setPage(nextPage);
        loadItems(category, nextPage);
      }
    });
    if (node) observerRef.current.observe(node);
  }, [loading, hasMore, page, category, loadItems]);

  if (!isAuthenticated) {
    return (
      <div className="explore-auth-prompt">
        <p>请先登录以获取个性化探索内容</p>
        <button onClick={openAuth}>登录</button>
      </div>
    );
  }

  return (
    <div className="explore-page">
      <div className="explore-header">
        <h1>探索</h1>
        <div className="explore-tabs">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              className={`explore-tab ${category === cat.key ? 'active' : ''}`}
              onClick={() => setCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="explore-grid">
        {items.map((item, index) => (
          <ExploreCard
            key={`${item.item_type}-${item.item_id || item.subject_id || item.post_id || item.news_id || item.work_id}`}
            item={item}
            ref={index === items.length - 1 ? lastItemRef : null}
          />
        ))}
      </div>

      {loading && <div className="explore-loading">加载中...</div>}
      {!hasMore && items.length > 0 && <div className="explore-end">没有更多了</div>}
    </div>
  );
}

const ExploreCard = React.forwardRef(({ item }, ref) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (item.is_promotion) {
      behaviorCollector.track('promo_click', item.target_type, item.target_id);
    }
    switch (item.item_type) {
      case 'subject':
        behaviorCollector.trackRecommendClick(item.subject_id, 'explore', 0, 'explore');
        navigate(`/info/${item.subject_id}`);
        break;
      case 'post':
        behaviorCollector.trackViewPost(item.post_id);
        navigate(`/forum?post=${item.post_id}`);
        break;
      case 'news':
        behaviorCollector.trackNewsClick(item.news_id, item.source, item.category);
        navigate(`/news/${item.news_id}`);
        break;
      case 'work':
        behaviorCollector.track('view_work', 'work', item.work_id);
        navigate(`/musashi/work/${item.work_id}`);
        break;
    }
  };

  return (
    <div className={`explore-card ${item.is_promotion ? 'promotion' : ''}`} ref={ref} onClick={handleClick}>
      {item.is_promotion && <span className="promo-badge">推广</span>}
      {item.cover_url && <img className="explore-card-cover" src={item.cover_url} alt="" />}
      {item.images?.large && <img className="explore-card-cover" src={item.images.large} alt="" />}
      <div className="explore-card-info">
        <span className="explore-card-type">{item.item_type}</span>
        <h3>{item.name_cn || item.title || item.name}</h3>
        {item.score && <span className="explore-card-score">{item.score}</span>}
      </div>
    </div>
  );
});
```

注意：实际实现时需添加 `import React from 'react'` 和 `import { useNavigate } from 'react-router-dom'`。

- [ ] **Step 2: 创建探索页样式**

```css
/* src/pages/ExplorePage.css */
.explore-page { max-width: 1200px; margin: 0 auto; padding: 20px; }
.explore-header { margin-bottom: 24px; }
.explore-header h1 { font-size: 24px; margin-bottom: 16px; }
.explore-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.explore-tab {
  padding: 6px 16px; border-radius: 20px; border: 1px solid var(--border-color, #e0e0e0);
  background: transparent; cursor: pointer; font-size: 14px; transition: all 0.2s;
}
.explore-tab.active { background: var(--primary-color, #ff6b9d); color: white; border-color: var(--primary-color, #ff6b9d); }
.explore-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.explore-card {
  border-radius: 12px; overflow: hidden; cursor: pointer;
  background: var(--card-bg, #fff); box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  transition: transform 0.2s; position: relative;
}
.explore-card:hover { transform: translateY(-4px); }
.explore-card.promotion { border: 2px solid var(--primary-color, #ff6b9d); }
.promo-badge {
  position: absolute; top: 8px; right: 8px; background: var(--primary-color, #ff6b9d);
  color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; z-index: 1;
}
.explore-card-cover { width: 100%; height: 180px; object-fit: cover; }
.explore-card-info { padding: 12px; }
.explore-card-type { font-size: 11px; color: var(--text-secondary, #888); text-transform: uppercase; }
.explore-card-info h3 { font-size: 14px; margin: 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.explore-card-score { font-size: 13px; color: var(--primary-color, #ff6b9d); font-weight: 600; }
.explore-auth-prompt { text-align: center; padding: 60px 20px; }
.explore-auth-prompt button { padding: 10px 24px; border-radius: 20px; background: var(--primary-color, #ff6b9d); color: white; border: none; cursor: pointer; }
.explore-loading, .explore-end { text-align: center; padding: 20px; color: var(--text-secondary, #888); }
```

- [ ] **Step 3: 在路由中注册探索页**

在 `src/App.jsx` 中添加路由：

```jsx
import ExplorePage from './pages/ExplorePage';
// 在路由配置中添加：
<Route path="/explore" element={<ExplorePage />} />
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/ExplorePage.jsx src/pages/ExplorePage.css src/App.jsx
git commit -m "feat: add ExplorePage with infinite scroll and multi-source feed"
```

---

### Task 11: 搜索升级 — GlobalSearch 接入新服务

**Files:**
- Modify: `src/components/Common/GlobalSearch.jsx`

- [ ] **Step 1: 替换搜索调用**

在 `GlobalSearch.jsx` 中：

1. 添加 import：
```js
import { BangumiSearchService } from '../../services/BangumiSearchService';
import { ProfileService } from '../../services/api';
import { SearchSuggestionService } from '../../services/api';
import { behaviorCollector } from '../../lib/BehaviorCollector';
```

2. 在组件内添加画像状态：
```js
const [userProfile, setUserProfile] = useState(null);

useEffect(() => {
  if (currentUser?.id) {
    ProfileService.getProfile().then(p => setUserProfile(p)).catch(() => {});
  }
}, [currentUser?.id]);
```

3. 替换搜索逻辑：将 `BangumiService.searchSubjects(q, type, limit, offset)` 替换为 `BangumiSearchService.search(q, type)`，并对结果做个性化重排。

4. 添加搜索建议：在输入时调用 `SearchSuggestionService.getSuggestions(q)`。

5. 添加行为上报：搜索结果点击时调用 `behaviorCollector.trackSearchClick(query, subjectId, position, type)`。

- [ ] **Step 2: Commit**

```bash
git add src/components/Common/GlobalSearch.jsx
git commit -m "feat: upgrade GlobalSearch with BangumiSearchService, personalization, suggestions"
```

---

## 阶段四：行为上报全量接入

### Task 12: 核心交互行为上报

**Files:**
- Modify: `src/components/Info/InfoDetail.jsx`
- Modify: `src/pages/HomePage.jsx`
- Modify: `src/components/Amadeus/Amadeus.jsx`

- [ ] **Step 1: InfoDetail.jsx 行为上报**

在 `InfoDetail.jsx` 中添加：

```js
import { behaviorCollector } from '../../lib/BehaviorCollector';
```

在组件挂载时：
```js
useEffect(() => {
  if (subjectId) {
    behaviorCollector.trackPageEnter('subject_detail');
    behaviorCollector.trackViewSubject(parseInt(subjectId), subjectType || 'anime', 'detail');
  }
  return () => behaviorCollector.trackPageLeave();
}, [subjectId]);
```

在收藏操作回调中：
```js
behaviorCollector.trackMarkCollection(subjectId, status, subjectType);
```

在评分操作回调中：
```js
behaviorCollector.trackRate(subjectId, rating, subjectType);
```

- [ ] **Step 2: HomePage.jsx 行为上报**

在 `HomePage.jsx` 中添加：

```js
import { behaviorCollector } from '../lib/BehaviorCollector';
```

在组件挂载时：
```js
useEffect(() => {
  behaviorCollector.trackPageEnter('home');
  return () => behaviorCollector.trackPageLeave();
}, []);
```

在随心斩点击时：
```js
behaviorCollector.trackRecommendClick(subjectId, 'home_random', 0, 'random');
```

- [ ] **Step 3: Amadeus.jsx 行为上报**

在 `Amadeus.jsx` 中添加：

```js
import { behaviorCollector } from '../../lib/BehaviorCollector';
```

在对话结束时（关闭 Amadeus 时）：
```js
behaviorCollector.trackNaviChat(messages.length, messages.some(m => m.action === 'recommend'));
```

- [ ] **Step 4: Forum.jsx 行为上报**

在 `Forum.jsx` 中添加：

```js
import { behaviorCollector } from '../../lib/BehaviorCollector';
```

在帖子浏览时：
```js
behaviorCollector.trackViewPost(postId, board);
```

在帖子点赞时：
```js
behaviorCollector.track('like_post', 'post', postId);
```

- [ ] **Step 5: NewsZone.jsx 行为上报**

在 `NewsZone.jsx` 中添加：

```js
import { behaviorCollector } from '../../lib/BehaviorCollector';
```

在资讯点击时：
```js
behaviorCollector.trackNewsClick(newsId, source, category);
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Info/InfoDetail.jsx src/pages/HomePage.jsx src/components/Amadeus/Amadeus.jsx src/components/Forum/Forum.jsx src/components/NewsZone/NewsZone.jsx
git commit -m "feat: integrate BehaviorCollector across all key interaction points"
```

---

## 阶段五：验证与部署

### Task 13: 构建验证 + 测试

- [ ] **Step 1: 运行现有测试**

```bash
npx vitest run
```
Expected: 所有测试通过。

- [ ] **Step 2: 新增 LR 精排器测试**

创建 `worker/lib/lr-ranker.test.js`，测试 `lrPredict` 和 `extractFeatures`。

- [ ] **Step 3: 前端构建**

```bash
npm run build
```
Expected: 无编译错误。

- [ ] **Step 4: 执行数据库迁移**

```bash
npx wrangler d1 execute anispace-db --remote --file=worker/migrations/v017_search_promote.sql
```

- [ ] **Step 5: 部署 Worker**

```bash
cd worker && npx wrangler deploy
```

- [ ] **Step 6: 部署前端**

```bash
npm run build && npx gh-pages -d dist
```

- [ ] **Step 7: 功能验证清单**

- [ ] 行为上报：浏览条目后 `behavior_log` 有数据
- [ ] 短期画像：Cron 刷新后 `user_profile_short` 有数据
- [ ] 长期画像扩展：`social_features`、`lifecycle_stage`、`preference_vector` 有值
- [ ] 四层推荐：推荐结果带 `_lr_score`
- [ ] 搜索个性化：搜索结果按画像重排
- [ ] 探索页：多源内容聚合显示
- [ ] 推广位：`promotion_slots` 有数据时显示推广标记
- [ ] 批量上报：`POST /api/behavior/batch` 正常工作

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: verify product-level search-recommend system end-to-end"
```

---

### 文件变更汇总

| 操作 | 文件 |
|------|------|
| 新增 | `worker/migrations/v017_search_promote.sql` |
| 新增 | `worker/lib/lr-ranker.js` |
| 新增 | `worker/lib/behavior-collector.js` |
| 新增 | `worker/lib/explore-engine.js` |
| 新增 | `src/lib/BehaviorCollector.js` |
| 新增 | `src/lib/SessionProfile.js` |
| 新增 | `src/pages/ExplorePage.jsx` |
| 新增 | `src/pages/ExplorePage.css` |
| 修改 | `worker/lib/user-profile.js` |
| 修改 | `worker/lib/recommend-engine.js` |
| 修改 | `worker/oauth-proxy.js` |
| 修改 | `worker/schema.sql` |
| 修改 | `src/services/api.js` |
| 修改 | `src/components/Common/GlobalSearch.jsx` |
| 修改 | `src/components/Info/InfoDetail.jsx` |
| 修改 | `src/pages/HomePage.jsx` |
| 修改 | `src/components/Amadeus/Amadeus.jsx` |
| 修改 | `src/components/Forum/Forum.jsx` |
| 修改 | `src/components/NewsZone/NewsZone.jsx` |
| 修改 | `src/App.jsx` |