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
 */
export async function generateExploreFeed(db, profile, category = '', page = 1, pageSize = 20) {
  const typeAffinity = safeJson(profile?.type_affinity, {});
  const tagWeights = safeJson(profile?.tag_weights, {});
  const offset = (page - 1) * pageSize;

  const items = [];

  // 1. 推荐条目 (40%)
  if (!category || ['anime', 'game', 'novel', '全部'].includes(category)) {
    const typeMap = { anime: 2, game: 4, novel: 1 };
    const typeFilter = category && category !== '全部' && typeMap[category]
      ? `AND bs.type = ${typeMap[category]}`
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
              u.name, u.avatar,
              (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count
       FROM posts p
       LEFT JOIN users u ON p.author_id = u.id
       ORDER BY like_count DESC, p.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(Math.ceil(pageSize * 0.2), offset).all();

    for (const p of (posts.results || [])) {
      items.push({
        item_type: 'post',
        post_id: p.id, title: p.title, content: p.content?.slice(0, 100),
        category: p.category, like_count: p.like_count,
        author: p.name, author_avatar: p.avatar,
        created_at: p.created_at,
      });
    }
  }

  // 3. 资讯 (20%)
  if (!category || category === 'news' || category === '全部') {
    const news = await db.prepare(
      `SELECT id, title, summary, source, category, cover, created_at
       FROM scraped_news
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(Math.ceil(pageSize * 0.2), offset).all();

    for (const n of (news.results || [])) {
      items.push({
        item_type: 'news',
        news_id: n.id, title: n.title, summary: n.summary,
        source: n.source, category: n.category,
        cover_url: n.cover, created_at: n.created_at,
      });
    }
  }

  // 4. 创作者作品 (20%)
  if (!category || category === 'work' || category === '全部') {
    const works = await db.prepare(
      `SELECT w.id, w.title, w.type, w.cover_image, w.created_at,
              u.name as author_name
       FROM works w
       LEFT JOIN users u ON w.author_id = u.id
       WHERE w.is_visible = 1 AND w.visibility != 'private'
       ORDER BY w.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(Math.ceil(pageSize * 0.2), offset).all();

    for (const w of (works.results || [])) {
      items.push({
        item_type: 'work',
        work_id: w.id, title: w.title, work_type: w.type,
        cover_url: w.cover_image, author_name: w.author_name,
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

    if (item.item_type === 'subject') {
      const typeKey = { 2: 'anime', 4: 'game', 1: 'novel', 6: 'real' }[item.type] || '';
      if (typeKey && typeAffinity[typeKey] > 0.3) boost *= 1.2;
    }

    if (item.tags && Array.isArray(item.tags)) {
      for (const tag of item.tags) {
        const name = typeof tag === 'string' ? tag : tag.name;
        if (name && tagWeights[name]) boost *= 1.05;
      }
    }

    if (item.created_at) {
      const daysSince = (Date.now() - new Date(item.created_at).getTime()) / 86400000;
      if (daysSince < 1) boost *= 1.3;
      else if (daysSince < 7) boost *= 1.1;
    }

    return { ...item, _explore_score: (item.score || item.like_count || 0) * boost };
  }).sort((a, b) => b._explore_score - a._explore_score);
}