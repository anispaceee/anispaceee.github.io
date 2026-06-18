/**
 * worker/lib/lr-ranker.js
 * LR (Logistic Regression) 精排器
 * 特征加权 + sigmoid 输出 [0, 1] 概率
 */

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
 */
export function extractFeatures(item, profile, shortProfile) {
  const tagWeights = profile?.tag_weights || {};
  const typeAffinity = profile?.type_affinity || {};
  const ratingTendency = profile?.rating_tendency || 'normal';
  const recentTags = shortProfile?.recent_tags || {};

  // 1. 标签匹配度
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

  // 5. 新鲜度
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