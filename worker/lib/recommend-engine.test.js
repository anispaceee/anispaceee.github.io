/**
 * recommend-engine.js 单元测试
 * 测试纯函数逻辑：论坛帖子加权、资讯加权、热门推荐
 */
import { describe, it, expect } from 'vitest';

function safeJson(value, fallback) {
  if (typeof value === 'string' && value) {
    try { return JSON.parse(value); } catch {}
  }
  return value ?? fallback;
}

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

// ─── Tests ───

describe('computeForumPosts', () => {
  it('空亲和度返回空数组', () => {
    const result = computeForumPosts({});
    expect(result).toEqual([]);
  });

  it('anime 亲和度高 → 动画板区 1.3 权重', () => {
    const result = computeForumPosts({ anime: 0.8, game: 0, novel: 0 });
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ board: 'newanime', weight: 1.3 });
    expect(result).toContainEqual({ board: 'oldanime', weight: 1.3 });
  });

  it('anime 亲和度中等 → 动画板区 1.15 权重', () => {
    const result = computeForumPosts({ anime: 0.4, game: 0, novel: 0 });
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ board: 'newanime', weight: 1.15 });
  });

  it('anime 亲和度 ≤ 0.3 → 不添加', () => {
    const result = computeForumPosts({ anime: 0.3, game: 0, novel: 0 });
    expect(result).toEqual([]);
  });

  it('game 亲和度高 → 游戏板区 1.3 权重', () => {
    const result = computeForumPosts({ anime: 0, game: 0.7, novel: 0 });
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ board: 'galgame', weight: 1.3 });
    expect(result).toContainEqual({ board: 'game', weight: 1.3 });
  });

  it('novel 亲和度高 → 小説板区 1.3 权重', () => {
    const result = computeForumPosts({ anime: 0, game: 0, novel: 0.8 });
    expect(result).toHaveLength(1);
    expect(result).toContainEqual({ board: 'novel', weight: 1.3 });
  });

  it('多种亲和度同时匹配', () => {
    const result = computeForumPosts({ anime: 0.6, game: 0.4, novel: 0.8 });
    expect(result).toHaveLength(5);
    expect(result.filter(r => r.weight === 1.3)).toHaveLength(3);
    expect(result.filter(r => r.weight === 1.15)).toHaveLength(2);
  });

  it('亲和度恰好 0.5 → 1.15 权重（>0.5 才触发 1.3）', () => {
    const result = computeForumPosts({ anime: 0.5, game: 0, novel: 0 });
    expect(result[0].weight).toBe(1.15);
  });

  it('亲和度 0.31 → 1.15 权重', () => {
    const result = computeForumPosts({ anime: 0.31, game: 0, novel: 0 });
    expect(result[0].weight).toBe(1.15);
  });
});

describe('computeNewsFeed', () => {
  it('空亲和度返回空数组', () => {
    const result = computeNewsFeed({});
    expect(result).toEqual([]);
  });

  it('anime 亲和度高 → 3 个动画分类 1.3 权重', () => {
    const result = computeNewsFeed({ anime: 0.8, game: 0, novel: 0 });
    expect(result).toHaveLength(3);
    const categories = result.map(r => r.category);
    expect(categories).toContain('新番导视');
    expect(categories).toContain('热门推荐');
    expect(categories).toContain('每周速报');
    expect(result.every(r => r.weight === 1.3)).toBe(true);
  });

  it('game 亲和度高 → 5 个游戏分类 1.3 权重', () => {
    const result = computeNewsFeed({ anime: 0, game: 0.7, novel: 0 });
    expect(result).toHaveLength(5);
    const categories = result.map(r => r.category);
    expect(categories).toContain('游戏推荐');
    expect(categories).toContain('VN推荐');
    expect(categories).toContain('Steam精选');
    expect(categories).toContain('Steam特惠');
    expect(categories).toContain('Steam新品');
    expect(result.every(r => r.weight === 1.3)).toBe(true);
  });

  it('novel 亲和度高 → 1 个小说分类', () => {
    const result = computeNewsFeed({ anime: 0, game: 0, novel: 0.9 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ category: '轻小说', weight: 1.3 });
  });

  it('anime 亲和度 0.35 → 1.15 权重', () => {
    const result = computeNewsFeed({ anime: 0.35, game: 0, novel: 0 });
    expect(result).toHaveLength(3);
    expect(result.every(r => r.weight === 1.15)).toBe(true);
  });

  it('所有类型亲和度中等 → 3+5+1=9 个分类', () => {
    const result = computeNewsFeed({ anime: 0.4, game: 0.35, novel: 0.45 });
    expect(result).toHaveLength(9);
    expect(result.every(r => r.weight === 1.15)).toBe(true);
  });
});

describe('safeJson', () => {
  it('解析 images JSON', () => {
    const images = '{"large":"http://example.com/img.jpg","small":"http://example.com/s.jpg"}';
    expect(safeJson(images, {})).toEqual({
      large: 'http://example.com/img.jpg',
      small: 'http://example.com/s.jpg',
    });
  });

  it('无效 JSON 返回原值', () => {
    expect(safeJson('not-json', {})).toBe('not-json');
  });
});