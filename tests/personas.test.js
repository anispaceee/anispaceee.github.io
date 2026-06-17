/**
 * personas.js 用户画像片段生成测试
 */
import { describe, it, expect } from 'vitest';

// 手动提取 buildUserProfileFragment 用于测试
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

describe('buildUserProfileFragment', () => {
  it('null profile 返回空字符串', () => {
    expect(buildUserProfileFragment(null)).toBe('');
  });

  it('undefined profile 返回空字符串', () => {
    expect(buildUserProfileFragment(undefined)).toBe('');
  });

  it('完整画像生成正确文本', () => {
    const profile = {
      tag_weights: { '科幻': 0.8, '恋爱': 0.5, '日常': 0.3, '机甲': 0.1 },
      type_affinity: { anime: 0.7, game: 0.2, novel: 0.1, real: 0 },
      consumption_stats: { total_collections: 50, avg_rating: 7.5 },
      rating_tendency: 'normal',
    };
    const result = buildUserProfileFragment(profile);
    expect(result).toContain('【用户画像】');
    expect(result).toContain('科幻(80%)');
    expect(result).toContain('恋爱(50%)');
    expect(result).toContain('动画类70%');
    expect(result).toContain('游戏类20%');
    expect(result).toContain('小说类10%');
    expect(result).toContain('收藏总数：50');
    expect(result).toContain('平均评分：7.5');
    expect(result).toContain('评分风格：正常');
  });

  it('strict 评分风格', () => {
    const profile = {
      tag_weights: {},
      type_affinity: {},
      consumption_stats: { total_collections: 0, avg_rating: 0 },
      rating_tendency: 'strict',
    };
    const result = buildUserProfileFragment(profile);
    expect(result).toContain('严格（不轻易给高分）');
  });

  it('generous 评分风格', () => {
    const profile = {
      tag_weights: {},
      type_affinity: {},
      consumption_stats: { total_collections: 0, avg_rating: 0 },
      rating_tendency: 'generous',
    };
    const result = buildUserProfileFragment(profile);
    expect(result).toContain('宽松（容易给高分）');
  });

  it('只显示 top-8 标签', () => {
    const tagWeights = {};
    for (let i = 0; i < 15; i++) {
      tagWeights[`tag_${i}`] = (15 - i) / 15;
    }
    const profile = {
      tag_weights: tagWeights,
      type_affinity: {},
      consumption_stats: { total_collections: 0, avg_rating: 0 },
      rating_tendency: 'normal',
    };
    const result = buildUserProfileFragment(profile);
    // 标签部分应只包含 8 个标签
    const tagPart = result.split('- 偏好标签')[1]?.split('\n')[0] || '';
    const tagItems = tagPart.replace('（权重越高越喜欢）：', '').split('、');
    expect(tagItems.length).toBeLessThanOrEqual(8);
  });

  it('空标签时显示暂无数据', () => {
    const profile = {
      tag_weights: {},
      type_affinity: {},
      consumption_stats: { total_collections: 0 },
      rating_tendency: 'normal',
    };
    const result = buildUserProfileFragment(profile);
    expect(result).toContain('暂无数据');
  });

  it('real 类型不计入输出', () => {
    const profile = {
      tag_weights: {},
      type_affinity: { anime: 0, game: 0, novel: 0, real: 0.5 },
      consumption_stats: { total_collections: 0 },
      rating_tendency: 'normal',
    };
    const result = buildUserProfileFragment(profile);
    expect(result).not.toContain('real');
    expect(result).toContain('暂无数据'); // typeParts 为空
  });

  it('标签按权重降序排列', () => {
    const profile = {
      tag_weights: { 'C': 0.3, 'A': 0.9, 'B': 0.6 },
      type_affinity: {},
      consumption_stats: { total_collections: 0 },
      rating_tendency: 'normal',
    };
    const result = buildUserProfileFragment(profile);
    const idxA = result.indexOf('A(90%)');
    const idxB = result.indexOf('B(60%)');
    const idxC = result.indexOf('C(30%)');
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });
});