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

  // 3. 内容匹配召回
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
  try {
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
  } catch {
    // follows 表可能不存在，静默跳过
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
    if (shownSet.has(item.subject_id)) continue;

    const typeKey = item.type || 'unknown';
    typeCount[typeKey] = (typeCount[typeKey] || 0) + 1;
    if (result.length > 3 && typeCount[typeKey] > Math.ceil(result.length * 0.4 + 1)) continue;

    let finalScore = item._lr_score || 0;
    if (item.created_at) {
      const hoursSince = (Date.now() - new Date(item.created_at).getTime()) / 3600000;
      if (hoursSince < 24) finalScore *= 1.1;
    }

    result.push({ ...item, _final_score: finalScore });

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

  let shortProfile = null;
  try {
    shortProfile = await db.prepare(
      'SELECT * FROM user_profile_short WHERE user_id = ?'
    ).bind(userId).first();
  } catch {}

  let promotions = [];
  try {
    const promoResult = await db.prepare(
      `SELECT * FROM promotion_slots
       WHERE is_active = 1
         AND (start_at IS NULL OR start_at <= datetime('now'))
         AND (end_at IS NULL OR end_at >= datetime('now'))
       ORDER BY weight DESC`
    ).all();
    promotions = promoResult.results || [];
  } catch {}

  const recalled = await recallLayer(db, userId, profile, shortProfile);
  const coarseRanked = coarseRankLayer(recalled, profile);
  const fineRanked = fineRankLayer(coarseRanked, profile, shortProfile);
  const homeRandom = rerankLayer(fineRanked, {
    promotions: promotions.filter(p => p.slot_name === 'home_random'),
  });

  const typeAffinity = safeJson(profile.type_affinity, {});
  const forumPosts = computeForumPosts(typeAffinity);
  const newsFeed = computeNewsFeed(typeAffinity);

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
  let activeUsers;
  try {
    activeUsers = await db.prepare(
      `SELECT DISTINCT user_id FROM behavior_log
       WHERE created_at > datetime('now', '-7 days')
       UNION
       SELECT user_id FROM user_profiles WHERE activity_score >= 0.5`
    ).all();
  } catch {
    activeUsers = await db.prepare(
      'SELECT user_id FROM user_profiles WHERE activity_score >= 0.5'
    ).all();
  }

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