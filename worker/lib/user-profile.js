/**
 * ANISpace 用户画像计算引擎
 * 功能：标签权重(TF-IDF)、类型亲和度、消费统计、评分倾向、相似用户
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
  const collections = await db.prepare(
    'SELECT subject_id, status, rating FROM collections WHERE user_id = ?'
  ).bind(userId).all();

  if (!collections.results || collections.results.length === 0) {
    return buildEmptyProfile(userId);
  }

  const items = collections.results;
  const totalCollections = items.length;

  // 批量获取条目标签和类型
  const subjectIds = items.map(c => c.subject_id);
  const placeholders = subjectIds.map(() => '?').join(',');
  const subjects = await db.prepare(
    `SELECT id, type, tags FROM bangumi_subjects WHERE id IN (${placeholders})`
  ).bind(...subjectIds).all();

  const subjectMap = {};
  for (const s of (subjects.results || [])) {
    subjectMap[s.id] = {
      type: s.type,
      tags: safeJson(s.tags, []),
    };
  }

  // 计算标签权重 (TF-IDF)
  const tagWeights = await computeTagWeights(db, items, subjectMap, userId);

  // 计算类型亲和度
  const typeAffinity = computeTypeAffinity(items, subjectMap);

  // 计算消费统计
  const consumptionStats = computeConsumptionStats(items);

  // 计算评分倾向
  const ratingTendency = computeRatingTendency(items);

  // 计算活跃度
  const activityScore = computeActivityScore(items);

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

  const totalUsersResult = await db.prepare(
    'SELECT COUNT(DISTINCT user_id) as cnt FROM collections'
  ).first();
  const totalUsers = totalUsersResult?.cnt || 1;

  const weights = {};
  for (const [tag, count] of Object.entries(tagCount)) {
    const tf = count / totalTagged;
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

  let ratingStd = 0;
  if (ratedItems.length > 1) {
    const variance = ratedItems.reduce((s, c) => s + Math.pow(c.rating - avgRating, 2), 0) / ratedItems.length;
    ratingStd = Math.round(Math.sqrt(variance) * 10) / 10;
  }

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
 * 活跃度
 */
function computeActivityScore(items) {
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

  const currentNorm = Math.sqrt(
    Object.values(currentWeights).reduce((sum, w) => sum + w * w, 0)
  );
  if (currentNorm === 0) return [];

  const allProfiles = await db.prepare(
    'SELECT user_id, tag_weights FROM user_profiles WHERE user_id != ? AND tag_weights != ?'
  ).bind(userId, '{}').all();

  const similarities = [];
  for (const p of (allProfiles.results || [])) {
    const otherWeights = safeJson(p.tag_weights, {});
    const otherTags = Object.keys(otherWeights);
    if (otherTags.length === 0) continue;

    const commonTags = currentTags.filter(t => otherWeights[t] !== undefined);
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