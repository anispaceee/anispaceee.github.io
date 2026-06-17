/**
 * user-profile.js 单元测试
 * 测试纯函数逻辑：类型亲和度、消费统计、评分倾向、活跃度、余弦相似度
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock D1 Database ───
function createMockDB(responses = {}) {
  const db = {
    prepare() { return db; },
    bind() { return db; },
    async first() { return responses.first || null; },
    async all() { return responses.all || { results: [] }; },
    async run() { return { success: true }; },
  };
  return db;
}

// ─── 手动实现纯函数用于测试（提取自 user-profile.js 的内部逻辑）───

function safeJson(value, fallback) {
  if (typeof value === 'string' && value) {
    try { return JSON.parse(value); } catch {}
  }
  return value ?? fallback;
}

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

function computeActivityScore(items) {
  if (items.length >= 30) return 0.9;
  if (items.length >= 10) return 0.5;
  if (items.length >= 1) return 0.2;
  return 0;
}

function cosineSimilarity(weightsA, weightsB) {
  const keysA = Object.keys(weightsA);
  const commonKeys = keysA.filter(k => weightsB[k] !== undefined);
  if (commonKeys.length === 0) return 0;

  let dotProduct = 0;
  for (const k of commonKeys) {
    dotProduct += weightsA[k] * weightsB[k];
  }

  const normA = Math.sqrt(Object.values(weightsA).reduce((s, w) => s + w * w, 0));
  const normB = Math.sqrt(Object.values(weightsB).reduce((s, w) => s + w * w, 0));
  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (normA * normB);
}

// ─── Tests ───

describe('safeJson', () => {
  it('解析有效 JSON 字符串', () => {
    expect(safeJson('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('解析无效 JSON 返回原值', () => {
    expect(safeJson('invalid', {})).toBe('invalid');
  });

  it('数组 JSON 正确解析', () => {
    expect(safeJson('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it('null 值返回 fallback', () => {
    expect(safeJson(null, 'default')).toBe('default');
  });

  it('undefined 返回 fallback', () => {
    expect(safeJson(undefined, 'default')).toBe('default');
  });

  it('空字符串返回原值', () => {
    expect(safeJson('', 'default')).toBe('');
  });
});

describe('computeTypeAffinity', () => {
  it('全部为动画时返回 anime=1', () => {
    const items = [
      { subject_id: 1, status: 'collect', rating: 8 },
      { subject_id: 2, status: 'collect', rating: 7 },
    ];
    const subjectMap = {
      1: { type: 2, tags: [] },
      2: { type: 2, tags: [] },
    };
    const result = computeTypeAffinity(items, subjectMap);
    expect(result.anime).toBe(1);
    expect(result.game).toBe(0);
    expect(result.novel).toBe(0);
    expect(result.real).toBe(0);
  });

  it('各类型均匀分布', () => {
    const items = [
      { subject_id: 1, status: 'collect', rating: 0 },
      { subject_id: 2, status: 'collect', rating: 0 },
      { subject_id: 3, status: 'collect', rating: 0 },
      { subject_id: 4, status: 'collect', rating: 0 },
    ];
    const subjectMap = {
      1: { type: 2, tags: [] },
      2: { type: 4, tags: [] },
      3: { type: 1, tags: [] },
      4: { type: 6, tags: [] },
    };
    const result = computeTypeAffinity(items, subjectMap);
    expect(result.anime).toBe(0.25);
    expect(result.game).toBe(0.25);
    expect(result.novel).toBe(0.25);
    expect(result.real).toBe(0.25);
  });

  it('空收藏返回全零', () => {
    const result = computeTypeAffinity([], {});
    expect(result).toEqual({ anime: 0, game: 0, novel: 0, real: 0 });
  });

  it('未知类型不计入', () => {
    const items = [{ subject_id: 1, status: 'collect', rating: 0 }];
    const subjectMap = { 1: { type: 99, tags: [] } };
    const result = computeTypeAffinity(items, subjectMap);
    expect(result).toEqual({ anime: 0, game: 0, novel: 0, real: 0 });
  });
});

describe('computeConsumptionStats', () => {
  it('计算收藏总数和平均评分', () => {
    const items = [
      { subject_id: 1, status: 'collect', rating: 8 },
      { subject_id: 2, status: 'collect', rating: 6 },
      { subject_id: 3, status: 'wish', rating: 0 },
    ];
    const stats = computeConsumptionStats(items);
    expect(stats.total_collections).toBe(3);
    expect(stats.avg_rating).toBe(7);
    expect(stats.collection_by_status).toEqual({ collect: 2, wish: 1 });
  });

  it('无评分时 avg_rating=0', () => {
    const items = [
      { subject_id: 1, status: 'wish', rating: 0 },
      { subject_id: 2, status: 'wish', rating: 0 },
    ];
    const stats = computeConsumptionStats(items);
    expect(stats.avg_rating).toBe(0);
    expect(stats.rating_std).toBe(0);
  });

  it('评分完全一致时 std=0', () => {
    const items = [
      { subject_id: 1, status: 'collect', rating: 7 },
      { subject_id: 2, status: 'collect', rating: 7 },
      { subject_id: 3, status: 'collect', rating: 7 },
    ];
    const stats = computeConsumptionStats(items);
    expect(stats.rating_std).toBe(0);
  });

  it('评分分散时 std>0', () => {
    const items = [
      { subject_id: 1, status: 'collect', rating: 10 },
      { subject_id: 2, status: 'collect', rating: 2 },
    ];
    const stats = computeConsumptionStats(items);
    expect(stats.rating_std).toBe(4);
    expect(stats.avg_rating).toBe(6);
  });

  it('空收藏', () => {
    const stats = computeConsumptionStats([]);
    expect(stats.total_collections).toBe(0);
    expect(stats.avg_rating).toBe(0);
    expect(stats.rating_std).toBe(0);
    expect(stats.collection_by_status).toEqual({});
  });
});

describe('computeRatingTendency', () => {
  it('无评分返回 normal', () => {
    expect(computeRatingTendency([])).toBe('normal');
    expect(computeRatingTendency([{ rating: 0 }])).toBe('normal');
  });

  it('高分低标准差 → generous', () => {
    const items = [
      { rating: 9 }, { rating: 8 }, { rating: 9 },
      { rating: 8 }, { rating: 9 },
    ];
    expect(computeRatingTendency(items)).toBe('generous');
  });

  it('低分 → strict', () => {
    const items = [
      { rating: 4 }, { rating: 5 }, { rating: 3 },
    ];
    expect(computeRatingTendency(items)).toBe('strict');
  });

  it('高标准差 → strict', () => {
    const items = [
      { rating: 10 }, { rating: 1 }, { rating: 10 },
      { rating: 1 }, { rating: 10 },
    ];
    expect(computeRatingTendency(items)).toBe('strict');
  });

  it('正常评分 → normal', () => {
    const items = [
      { rating: 7 }, { rating: 6 }, { rating: 8 },
      { rating: 7 }, { rating: 5 },
    ];
    expect(computeRatingTendency(items)).toBe('normal');
  });

  it('边界：avg=8.5, std=0.9 → generous', () => {
    const items = [
      { rating: 8.5 }, { rating: 9 }, { rating: 8 },
      { rating: 8.5 }, { rating: 8.5 },
    ];
    expect(computeRatingTendency(items)).toBe('generous');
  });

  it('边界：avg=8.5, std=1.0 → 不是 generous', () => {
    const items = [
      { rating: 10 }, { rating: 7 },
    ];
    const result = computeRatingTendency(items);
    expect(result).not.toBe('generous');
  });
});

describe('computeActivityScore', () => {
  it('>=30 收藏 → 0.9', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ subject_id: i, rating: 0 }));
    expect(computeActivityScore(items)).toBe(0.9);
  });

  it('>=10 收藏 → 0.5', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ subject_id: i, rating: 0 }));
    expect(computeActivityScore(items)).toBe(0.5);
  });

  it('>=1 收藏 → 0.2', () => {
    expect(computeActivityScore([{ subject_id: 1 }])).toBe(0.2);
  });

  it('0 收藏 → 0', () => {
    expect(computeActivityScore([])).toBe(0);
  });
});

describe('cosineSimilarity', () => {
  it('完全相同 → 1', () => {
    const a = { '科幻': 0.8, '恋爱': 0.5 };
    const b = { '科幻': 0.8, '恋爱': 0.5 };
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('完全不同 → 0', () => {
    const a = { '科幻': 0.8 };
    const b = { '日常': 0.5 };
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('部分重叠 → 0~1 之间', () => {
    const a = { '科幻': 0.8, '恋爱': 0.5, '日常': 0.3 };
    const b = { '科幻': 0.9, '机甲': 0.7 };
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it('空向量 → 0', () => {
    expect(cosineSimilarity({}, { '科幻': 0.8 })).toBe(0);
    expect(cosineSimilarity({ '科幻': 0.8 }, {})).toBe(0);
  });

  it('零向量 → 0', () => {
    const a = { '科幻': 0 };
    const b = { '科幻': 0.8 };
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('权重为负值 → 余弦值为负', () => {
    const a = { '科幻': -0.5 };
    const b = { '科幻': 0.8 };
    const result = cosineSimilarity(a, b);
    expect(result).toBeLessThan(0);
  });

  it('极多标签', () => {
    const a = {};
    const b = {};
    for (let i = 0; i < 100; i++) {
      a[`tag_${i}`] = Math.random();
      b[`tag_${i}`] = Math.random();
    }
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });
});