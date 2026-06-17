/**
 * ANISpace 推荐引擎
 * 功能：协同过滤推荐、标签匹配推荐、热门兜底、缓存管理
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

  const homeRandom = await computeHomeRandom(db, userId, tagWeights, similarUsers);
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
        candidates.push({
          subject_id: item.subject_id,
          score: item.cnt * 0.5,
          reason: 'cf',
        });
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
        candidates.push({
          subject_id: item.id,
          score: (item.score || 7) * 0.03,
          reason: 'tag',
        });
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
      candidates.push({
        subject_id: item.id,
        score: (item.score || 7) * 0.02,
        reason: 'hot',
      });
      seenIds.add(item.id);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 20);
}

/**
 * 放课后帖子推荐：基于 type_affinity 对板区加权
 * 返回 [{board, weight}, ...]
 */
function computeForumPosts(typeAffinity) {
  const boardWeights = [];

  if (typeAffinity.anime > 0.3) {
    const weight = typeAffinity.anime > 0.5 ? 1.3 : 1.15;
    boardWeights.push({ board: 'newanime', weight });
    boardWeights.push({ board: 'oldanime', weight });
  }

  if (typeAffinity.game > 0.3) {
    const weight = typeAffinity.game > 0.5 ? 1.3 : 1.15;
    boardWeights.push({ board: 'galgame', weight });
    boardWeights.push({ board: 'game', weight });
  }

  if (typeAffinity.novel > 0.3) {
    const weight = typeAffinity.novel > 0.5 ? 1.3 : 1.15;
    boardWeights.push({ board: 'novel', weight });
  }

  return boardWeights;
}

/**
 * 毒电波资讯推荐：基于 type_affinity 对资讯分类加权
 * 返回 [{category, weight}, ...]
 */
function computeNewsFeed(typeAffinity) {
  const categoryWeights = [];

  if (typeAffinity.anime > 0.3) {
    const weight = typeAffinity.anime > 0.5 ? 1.3 : 1.15;
    categoryWeights.push({ category: '新番导视', weight });
    categoryWeights.push({ category: '热门推荐', weight });
    categoryWeights.push({ category: '每周速报', weight });
  }

  if (typeAffinity.game > 0.3) {
    const weight = typeAffinity.game > 0.5 ? 1.3 : 1.15;
    categoryWeights.push({ category: '游戏推荐', weight });
    categoryWeights.push({ category: 'VN推荐', weight });
    categoryWeights.push({ category: 'Steam精选', weight });
    categoryWeights.push({ category: 'Steam特惠', weight });
    categoryWeights.push({ category: 'Steam新品', weight });
  }

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