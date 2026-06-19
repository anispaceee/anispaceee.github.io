/**
 * ANISpace Worker - 打包版本
 * 用于手动部署到 Cloudflare Dashboard
 *
 * 此文件包含所有依赖模块，无需单独上传 lib 目录
 */

// ═══════════════════════════════════════════════════════════
// 模块定义
// ═══════════════════════════════════════════════════════════

// ─── bangumiSync 模块 ────────────────────────────────────────
const bangumiSync = {};
(function(module) {
/**
 * Bangumi 收藏同步模块
 * 实现双向同步：ANISpace → Bangumi 和 Bangumi → ANISpace
 */

const BANGUMI_API_URL = 'https://api.bgm.tv';
const BANGUMI_TOKEN_URL = 'https://bgm.tv/oauth/access_token';

/**
 * 刷新 Bangumi access token
 * @param {string} refreshToken - Bangumi refresh token
 * @param {object} env - Worker 环境变量（包含 BANGUMI_CLIENT_ID, BANGUMI_CLIENT_SECRET）
 * @returns {Promise<{ok: boolean, access_token?: string, refresh_token?: string, error?: string}>}
 */
async function refreshBangumiToken(refreshToken, env) {
  if (!refreshToken || !env.BANGUMI_CLIENT_ID || !env.BANGUMI_CLIENT_SECRET) {
    return { ok: false, error: '缺少 refresh token 或环境变量' };
  }

  try {
    const body = new URLSearchParams({
      client_id: env.BANGUMI_CLIENT_ID.trim(),
      client_secret: env.BANGUMI_CLIENT_SECRET.trim(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await fetch(BANGUMI_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ANISpace/1.0',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    const data = await res.json();
    if (!data.access_token) {
      return { ok: false, error: data.error_description || '刷新失败' };
    }

    return {
      ok: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_in: data.expires_in,
    };
  } catch (err) {
    return { ok: false, error: err.message || '网络错误' };
  }
}

/**
 * 同步单个条目收藏状态到 Bangumi
 * @param {string} accessToken - Bangumi access token
 * @param {number} subjectId - Bangumi 条目 ID
 * @param {string} status - ANISpace 状态 (wish/collect/done/on_hold/dropped)
 * @param {number} rating - 评分 (0-10)
 * @param {string} comment - 评论
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function syncToBangumi(accessToken, subjectId, status, rating = 0, comment = '') {
  if (!accessToken) {
    return { ok: false, error: '未绑定 Bangumi 账号' };
  }

  // 状态映射：ANISpace → Bangumi
  // ANISpace: wish, doing, done, dropped, on_hold
  // Bangumi: wish, collect, done, dropped, on_hold
  // 注意：ANISpace 的 "doing" 对应 Bangumi 的 "collect"
  const bangumiStatus = status === 'doing' ? 'collect' : status;

  try {
    // Bangumi API: PATCH /v0/users/-/collections/:subject_id
    const res = await fetch(`${BANGUMI_API_URL}/v0/users/-/collections/${subjectId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ANISpace/1.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        type: bangumiStatus,
        rate: rating > 0 ? rating : undefined,
        comment: comment || undefined,
        private: false, // 默认公开
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.error || `Bangumi API 错误: ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || '网络错误' };
  }
}

/**
 * 从 Bangumi 拉取用户所有收藏
 * @param {string} accessToken - Bangumi access token
 * @param {string} username - Bangumi 用户名
 * @param {number} limit - 每页数量
 * @returns {Promise<{collections: Array, error?: string}>}
 */
async function fetchBangumiCollections(accessToken, username, limit = 100) {
  if (!accessToken || !username) {
    return { collections: [], error: '缺少 Bangumi token 或用户名' };
  }

  try {
    const allCollections = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`${BANGUMI_API_URL}/v0/users/${username}/collections?limit=${limit}&offset=${offset}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'ANISpace/1.0',
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { collections: [], error: errData.error || `Bangumi API 错误: ${res.status}` };
      }

      const data = await res.json();
      const collections = data.data || [];

      allCollections.push(...collections);

      if (collections.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    return { collections: allCollections };
  } catch (err) {
    return { collections: [], error: err.message || '网络错误' };
  }
}

/**
 * 将 Bangumi 收藏数据导入到本地数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - ANISpace 用户 ID
 * @param {Array} bangumiCollections - Bangumi 收藏数据
 * @returns {Promise<{imported: number, skipped: number, error?: string}>}
 */
async function importBangumiCollections(env, userId, bangumiCollections) {
  if (!bangumiCollections || bangumiCollections.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;

  for (const item of bangumiCollections) {
    const subjectId = item.subject_id;
    const bangumiStatus = item.type; // wish, collect, done, dropped, on_hold
    const rating = item.rate || 0;
    const comment = item.comment || '';
    const hasEpisode = item.ep_status || 0; // 已看集数

    // 状态映射：Bangumi → ANISpace
    // Bangumi "collect" → ANISpace "doing"
    const anispaceStatus = bangumiStatus === 'collect' ? 'doing' : bangumiStatus;

    try {
      // 检查是否已存在
      const existing = await env.DB.prepare(
        'SELECT id FROM collections WHERE user_id = ? AND subject_id = ?'
      ).bind(userId, subjectId).first();

      if (existing) {
        // 更新
        await env.DB.prepare(
          `UPDATE collections SET status = ?, rating = ?, comment = ?, updated_at = datetime('now')
           WHERE user_id = ? AND subject_id = ?`
        ).bind(anispaceStatus, rating, comment, userId, subjectId).run();
        skipped++;
      } else {
        // 插入
        await env.DB.prepare(
          `INSERT INTO collections (user_id, subject_id, status, rating, comment, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(userId, subjectId, anispaceStatus, rating, comment).run();
        imported++;
      }
    } catch (err) {
      console.warn(`Import collection ${subjectId} failed:`, err);
      skipped++;
    }
  }

  return { imported, skipped };
}

// 导出函数到模块对象
module.refreshBangumiToken = refreshBangumiToken;
module.syncToBangumi = syncToBangumi;
module.fetchBangumiCollections = fetchBangumiCollections;
module.importBangumiCollections = importBangumiCollections;
module.refreshBangumiToken = refreshBangumiToken;
module.syncToBangumi = syncToBangumi;
module.fetchBangumiCollections = fetchBangumiCollections;
module.importBangumiCollections = importBangumiCollections;
module.BANGUMI_API_URL = BANGUMI_API_URL;
module.BANGUMI_TOKEN_URL = BANGUMI_TOKEN_URL;
module.body = body;
module.res = res;
module.data = data;
module.bangumiStatus = bangumiStatus;
module.res = res;
module.errData = errData;
module.allCollections = allCollections;
module.res = res;
module.errData = errData;
module.data = data;
module.collections = collections;
module.subjectId = subjectId;
module.bangumiStatus = bangumiStatus;
module.rating = rating;
module.comment = comment;
module.hasEpisode = hasEpisode;
module.anispaceStatus = anispaceStatus;
module.existing = existing;
})(bangumiSync);

// ─── bangumiSearch 模块 ────────────────────────────────────────
const bangumiSearch = {};
(function(module) {
/**
 * ANISpace Worker — Bangumi 搜索
 *
 * 策略（三层优先级）：
 *   1. bangumi_subjects（全量数据，用户标记过的条目）
 *   2. bangumi_index（轻量索引，覆盖 99% 全量条目）
 *   3. 官方 /v0/search/subjects 兜底 + 回写
 *
 * 不在 Worker 里做完整的 like-中文-模糊匹配；只做 SQL LIKE + 排序。
 * 真正模糊搜索留到前端用 fzf 风格二次过滤（见 BangumiSearchService.js）。
 */

const UA = 'ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace; search)';
const OFFICIAL_BASE = 'https://api.bgm.tv';
const FALLBACK_THRESHOLD = 5;   // 本地命中 < 此数时调官方
const OFFICIAL_MAX = 25;
const LOCAL_LIMIT = 30;

/**
 * 把 SQL LIKE 的元字符转义
 */
function escapeLike(s) {
  return s.replace(/[\\%_]/g, ch => '\\' + ch);
}

/**
 * bangumi_subjects 搜索（全量数据，优先级最高）
 * @returns Promise<{items, source}>
 */
async function subjectsSearch(env, q, type = 0, limit = LOCAL_LIMIT) {
  if (!q || !q.trim()) return { items: [], source: 'enriched' };
  const like = '%' + escapeLike(q.trim()) + '%';
  const params = [like, like];
  let where = `(name LIKE ? ESCAPE '\\' OR name_cn LIKE ? ESCAPE '\\')`;
  if (type && type > 0) {
    where += ' AND type = ?';
    params.push(Number(type));
  }
  const sql = `
    SELECT id, name AS title, name_cn AS title_cn, '' AS title_ja, type,
           air_date AS begin, '' AS end, score, rank, image
    FROM bangumi_subjects
    WHERE ${where}
    ORDER BY (CASE WHEN rank > 0 THEN 0 ELSE 1 END), rank ASC, score DESC
    LIMIT ?
  `;
  params.push(limit);
  const result = await env.DB.prepare(sql).bind(...params).all();
  return { items: result.results || [], source: 'enriched' };
}

/**
 * 本地索引搜（bangumi_index，轻量）
 * @param env
 * @param q 关键词
 * @param type bangumi type: 1/2/3/4/6/0(all)
 * @param limit
 * @returns Promise<{items, source}>
 */
async function localSearch(env, q, type = 0, limit = LOCAL_LIMIT) {
  if (!q || !q.trim()) return { items: [], source: 'local' };
  const like = '%' + escapeLike(q.trim()) + '%';
  const params = [like, like, like, like];
  let where = `(title LIKE ? ESCAPE '\\' OR title_cn LIKE ? ESCAPE '\\' OR title_ja LIKE ? ESCAPE '\\' OR aliases LIKE ? ESCAPE '\\')`;
  if (type && type > 0) {
    where += ' AND type = ?';
    params.push(Number(type));
  }
  const sql = `
    SELECT id, title, title_cn, title_ja, type, begin, end, score, rank, image
    FROM bangumi_index
    WHERE ${where}
    ORDER BY (CASE WHEN rank > 0 THEN 0 ELSE 1 END), rank ASC, score DESC
    LIMIT ?
  `;
  params.push(limit);
  const result = await env.DB.prepare(sql).bind(...params).all();
  return { items: result.results || [], source: 'local' };
}

/**
 * 官方 API 兜底（带限流退避）
 */
async function officialSearch(q, type = 0) {
  const filter = { type: type && type > 0 ? [Number(type)] : [1, 2, 3, 4, 6] };
  const body = JSON.stringify({ keyword: q, filter, sort: 'match' });
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${OFFICIAL_BASE}/v0/search/subjects?limit=${OFFICIAL_MAX}`, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body,
      });
      if (res.status === 429) {
        // 退避一次
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`bgm ${res.status}`);
      const data = await res.json();
      return (data.data || []).map(it => ({
        id: it.id,
        title: it.name || '',
        title_cn: it.name_cn || '',
        title_ja: '',
        type: it.type || 0,
        begin: it.date || '',
        end: '',
        score: it.rating?.score || 0,
        rank: it.rank || 0,
        image: (it.images && (it.images.large || it.images.common)) || '',
      }));
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn('[bangumi-search] official fallback failed:', lastErr?.message);
  return [];
}

/**
 * 把官方返回的少量关键字段回写本地索引（仅写已不存在的）
 */
async function backfillFromOfficial(env, officialItems) {
  if (!Array.isArray(officialItems) || officialItems.length === 0) return;
  const stmt = env.DB.prepare(`
    INSERT OR IGNORE INTO bangumi_index
      (id, title, title_cn, type, begin, score, rank, image, source_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'official-fallback', datetime('now'))
  `);
  const batch = officialItems.slice(0, 50).map(it => stmt.bind(
    it.id, it.title, it.title_cn || '', it.type || 0, it.begin || '',
    it.score || 0, it.rank || 0, it.image || ''
  ));
  if (batch.length > 0) {
    try {
      await env.DB.batch(batch);
    } catch (e) {
      console.warn('[bangumi-search] backfill failed:', e?.message);
    }
  }
}

/**
 * 主入口：搜索
 * 优先级：bangumi_subjects → bangumi_index → 官方 API
 */
async function search(env, q, type = 0, options = {}) {
  const { needFallback = true } = options;

  // 第一层：bangumi_subjects（全量数据）
  const enriched = await subjectsSearch(env, q, type);

  // 第二层：bangumi_index（轻量索引，补充 enriched 未覆盖的条目）
  const local = await localSearch(env, q, type);

  // 合并两层本地数据（enriched 优先，去重）
  const seen = new Set(enriched.items.map(it => it.id));
  const merged = [...enriched.items];
  for (const it of local.items) {
    if (!seen.has(it.id)) {
      merged.push(it);
      seen.add(it.id);
    }
  }

  if (merged.length >= FALLBACK_THRESHOLD || !needFallback) {
    const source = enriched.items.length > 0 ? 'enriched' : 'local';
    return { source, count: merged.length, items: merged.slice(0, LOCAL_LIMIT) };
  }

  // 第三层：官方 API 兜底
  const official = await officialSearch(q, type);
  if (official.length > 0) {
    // 异步回写（不阻塞响应）
    backfillFromOfficial(env, official).catch(() => {});
  }

  // 合并去重（本地优先）
  for (const it of official) {
    if (!seen.has(it.id)) {
      merged.push(it);
      seen.add(it.id);
    }
  }

  const finalSource = enriched.items.length > 0 ? 'enriched'
    : merged.length > local.items.length ? 'mixed'
    : 'local';
  return { source: finalSource, count: merged.length, items: merged.slice(0, LOCAL_LIMIT) };
}

/**
 * 主入口：详情
 * 优先级：bangumi_subjects（全量）→ bangumi_index（轻量）→ 官方 API
 */
async function getDetail(env, id) {
  if (!id) return null;

  // 第一层：bangumi_subjects（全量数据，优先）
  const enriched = await env.DB.prepare(
    'SELECT * FROM bangumi_subjects WHERE id = ?'
  ).bind(Number(id)).first();
  if (enriched) {
    return { source: 'enriched', data: enriched };
  }

  // 第二层：bangumi_index（轻量索引）
  const local = await env.DB.prepare(
    'SELECT * FROM bangumi_index WHERE id = ?'
  ).bind(Number(id)).first();
  if (local && local.summary) {
    return { source: 'local', data: local };
  }

  // 第三层：官方 API 兜底
  try {
    const res = await fetch(`${OFFICIAL_BASE}/v0/subjects/${Number(id)}`, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    if (!res.ok) return local ? { source: 'local', data: local } : null;
    const data = await res.json();
    return { source: 'official', data };
  } catch {
    return local ? { source: 'local', data: local } : null;
  }
}

const _internal = { FALLBACK_THRESHOLD, OFFICIAL_BASE };


// 导出函数到模块对象
module.subjectsSearch = subjectsSearch;
module.localSearch = localSearch;
module.officialSearch = officialSearch;
module.backfillFromOfficial = backfillFromOfficial;
module.search = search;
module.getDetail = getDetail;
module.escapeLike = escapeLike;
module.subjectsSearch = subjectsSearch;
module.localSearch = localSearch;
module.officialSearch = officialSearch;
module.backfillFromOfficial = backfillFromOfficial;
module.search = search;
module.getDetail = getDetail;
module.UA = UA;
module.OFFICIAL_BASE = OFFICIAL_BASE;
module.FALLBACK_THRESHOLD = FALLBACK_THRESHOLD;
module.OFFICIAL_MAX = OFFICIAL_MAX;
module.LOCAL_LIMIT = LOCAL_LIMIT;
module.like = like;
module.params = params;
module.sql = sql;
module.result = result;
module.like = like;
module.params = params;
module.sql = sql;
module.result = result;
module.filter = filter;
module.body = body;
module.res = res;
module.data = data;
module.stmt = stmt;
module.batch = batch;
module.enriched = enriched;
module.local = local;
module.seen = seen;
module.merged = merged;
module.source = source;
module.official = official;
module.finalSource = finalSource;
module.enriched = enriched;
module.local = local;
module.res = res;
module.data = data;
module._internal = _internal;
})(bangumiSearch);

// ─── newsScraper 模块 ────────────────────────────────────────
const newsScraper = {};
(function(module) {
/**
 * ANISpace 资讯爬虫模块
 *
 * 数据源：
 * 1. Bangumi Calendar API — 当季新番
 * 2. Bangumi 热门排行 — 高分动画
 * 3. Bangumi 游戏排行 — 高分游戏
 * 4. Bangumi 小说排行 — 高分小说/漫画
 * 5. 月幕 Galgame — Galgame 发行（OAuth2 API）
 * 6. HikariNagi — 光凪 Galgame 社区（HTML 爬取）
 * 7. CnGal — 中文 Gal 文章/新闻/每周速报（公开 API）
 * 8. Steam — Steam 精选/特惠/新品
 * 9. Steam — 精选/特惠游戏
 * 10. Jikan Season — MyAnimeList 当季新番（公开 API）
 * 11. Jikan Top — MyAnimeList 热门排行（公开 API）
 * 12. Kitsu Trending — Kitsu 热门动漫（公开 API）
 * 13. Kitsu Current — Kitsu 正在播出（公开 API）
 *
 * 注意：AniList 和 B站 API 在 Cloudflare Worker 环境中被封禁（403/412），不可用
 *
 * 所有爬取结果统一为 { source, source_id, title, link, summary, cover, category, extra }
 */

const BANGUMI_API = 'https://api.bgm.tv';
const BANGUMI_UA = 'Afterrainliu/ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace)';

// ─── Bangumi Calendar ──────────────────────────────────────

async function scrapeBangumiCalendar() {
  const res = await fetch(`${BANGUMI_API}/calendar`, {
    headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'application/json' },
  });
  if (!res.ok) return [];

  const days = await res.json();
  const items = [];

  for (const day of days) {
    const weekday = day.weekday?.cn || '';
    for (const item of (day.items || [])) {
      if (item.type !== 2) continue;
      const rating = item.rating?.score || 0;
      const doing = item.collection?.doing || 0;
      items.push({
        source: 'bangumi_calendar',
        source_id: `bgm_${item.id}`,
        title: item.name_cn || item.name || '',
        link: (item.url || `https://bgm.tv/subject/${item.id}`).replace('http://', 'https://'),
        summary: item.summary || `${weekday}放送 · 评分 ${rating} · ${doing}人在看`,
        cover: (item.images?.large || item.images?.common || '').replace('http://', 'https://'),
        category: '新番导视',
        extra: JSON.stringify({
          weekday,
          rating,
          doing,
          air_date: item.air_date || '',
          name_jp: item.name || '',
          bgm_id: item.id,
        }),
      });
    }
  }
  return items;
}

// ─── Bangumi Hot (browser rank) ────────────────────────────

async function scrapeBangumiHot() {
  const res = await fetch(`${BANGUMI_API}/v0/subjects?type=2&sort=rank&limit=20`, {
    headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'application/json' },
  });
  if (!res.ok) return [];

  try {
    const data = await res.json();
    const items = (data.data || []).map(item => ({
      source: 'bangumi_hot',
      source_id: `bgm_hot_${item.id}`,
      title: item.name_cn || item.name || '',
      link: `https://bgm.tv/subject/${item.id}`,
      summary: `评分 ${item.rating?.score || '-'} · 排名 #${item.rank || '-'}`,
      cover: (item.images?.large || item.images?.common || '').replace('http://', 'https://'),
      category: '热门推荐',
      extra: JSON.stringify({
        rating: item.rating?.score || 0,
        rank: item.rank || 0,
        name_jp: item.name || '',
        bgm_id: item.id,
      }),
    }));
    return items;
  } catch {
    return [];
  }
}

// ─── Bangumi 游戏排行 ─────────────────────────────────────

async function scrapeBangumiGame() {
  const res = await fetch(`${BANGUMI_API}/v0/subjects?type=4&sort=rank&limit=20`, {
    headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'application/json' },
  });
  if (!res.ok) return [];

  try {
    const data = await res.json();
    const items = (data.data || []).map(item => ({
      source: 'bangumi_game',
      source_id: `bgm_game_${item.id}`,
      title: item.name_cn || item.name || '',
      link: `https://bgm.tv/subject/${item.id}`,
      summary: `评分 ${item.rating?.score || '-'} · 排名 #${item.rank || '-'} · ${(item.tags || []).slice(0, 3).map(t => t.name).join('/')}`,
      cover: (item.images?.large || item.images?.common || '').replace('http://', 'https://'),
      category: '游戏推荐',
      extra: JSON.stringify({
        rating: item.rating?.score || 0,
        rank: item.rank || 0,
        name_jp: item.name || '',
        bgm_id: item.id,
        platform: item.platform || '',
        tags: (item.tags || []).slice(0, 5).map(t => t.name),
      }),
    }));
    return items;
  } catch {
    return [];
  }
}

// ─── Bangumi 小说/漫画排行 ────────────────────────────────

async function scrapeBangumiBook() {
  const items = [];

  // type=1 小说, type=3 音乐
  for (const [type, typeName] of [[1, '小说'], [3, '音乐']]) {
    try {
      const res = await fetch(`${BANGUMI_API}/v0/subjects?type=${type}&sort=rank&limit=10`, {
        headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'application/json' },
      });
      if (!res.ok) continue;

      const data = await res.json();
      for (const item of (data.data || [])) {
        items.push({
          source: 'bangumi_book',
          source_id: `bgm_book_${item.id}`,
          title: item.name_cn || item.name || '',
          link: `https://bgm.tv/subject/${item.id}`,
          summary: `${typeName} · 评分 ${item.rating?.score || '-'} · 排名 #${item.rank || '-'}`,
          cover: (item.images?.large || item.images?.common || '').replace('http://', 'https://'),
          category: typeName === '小说' ? '轻小说' : '音乐推荐',
          extra: JSON.stringify({
            rating: item.rating?.score || 0,
            rank: item.rank || 0,
            name_jp: item.name || '',
            bgm_id: item.id,
            type: typeName,
          }),
        });
      }
    } catch {}
  }

  return items;
}

// ─── 月幕 Galgame (OAuth2 API) ─────────────────────────────

const YMGAL_TOKEN_URL = 'https://www.ymgal.games/oauth/token';
const YMGAL_API = 'https://www.ymgal.games/open/archive';
const YMGAL_CLIENT_ID = 'ymgal';
const YMGAL_CLIENT_SECRET = 'luna0327';

let ymgalTokenCache = { token: '', expires: 0 };

async function getYmgalToken() {
  if (ymgalTokenCache.token && Date.now() < ymgalTokenCache.expires - 300000) {
    return ymgalTokenCache.token;
  }
  try {
    const res = await fetch(
      `${YMGAL_TOKEN_URL}?grant_type=client_credentials&client_id=${YMGAL_CLIENT_ID}&client_secret=${YMGAL_CLIENT_SECRET}&scope=public`,
      { headers: { 'Accept': 'application/json;charset=utf-8', 'version': '1' } }
    );
    if (!res.ok) return '';
    const data = await res.json();
    const token = data.access_token || '';
    const expiresIn = (data.expires_in || 3600) * 1000;
    ymgalTokenCache = { token, expires: Date.now() + expiresIn };
    return token;
  } catch {
    return '';
  }
}

async function scrapeYmgal() {
  const items = [];
  const token = await getYmgalToken();
  if (!token) return items;

  const headers = {
    'Accept': 'application/json;charset=utf-8',
    'Authorization': `Bearer ${token}`,
    'version': '1',
  };

  // 1. 按日期区间查询近期发行的游戏（正确端点：/open/archive/game）
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const releaseStartDate = thirtyDaysAgo.toISOString().split('T')[0];
    const releaseEndDate = now.toISOString().split('T')[0];

    const res = await fetch(
      `${YMGAL_API}/game?releaseStartDate=${releaseStartDate}&releaseEndDate=${releaseEndDate}`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      const games = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      for (const game of games) {
        const title = game.chineseName || game.mainName || game.name || '';
        if (!title) continue;
        const cover = game.mainImg || '';
        items.push({
          source: 'ymgal',
          source_id: `ymgal_${game.gid}`,
          title,
          link: `https://www.ymgal.games/ga${game.gid}`,
          summary: `${game.orgName || 'Galgame'} · ${game.releaseDate || '发售日期未知'}${game.haveChinese ? ' · 有中文' : ''}`,
          cover,
          category: '新作发售',
          extra: JSON.stringify({
            gid: game.gid,
            type: game.typeDesc || '',
            releaseDate: game.releaseDate || '',
            haveChinese: game.haveChinese || false,
            orgName: game.orgName || '',
            restricted: game.restricted || false,
          }),
        });
      }
    }
  } catch {}

  // 2. 获取随机游戏作为补充
  if (items.length < 5) {
    try {
      const res = await fetch(`${YMGAL_API}/random-game?num=5`, { headers });
      if (res.ok) {
        const data = await res.json();
        const games = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        for (const game of games) {
          const title = game.chineseName || game.mainName || game.name || '';
          if (!title) continue;
          if (items.find(i => i.source_id === `ymgal_${game.gid}`)) continue;
          const cover = game.mainImg
            ? (game.mainImg.startsWith('http') ? game.mainImg : `https://cdn.ymgal.games/${game.mainImg}`)
            : '';
          items.push({
            source: 'ymgal',
            source_id: `ymgal_${game.gid}`,
            title,
            link: `https://www.ymgal.games/ga${game.gid}`,
            summary: `${game.orgName || 'Galgame'} · ${game.releaseDate || ''}${game.haveChinese ? ' · 有中文' : ''}`,
            cover,
            category: 'Gal档案',
            extra: JSON.stringify({
              gid: game.gid,
              releaseDate: game.releaseDate || '',
              haveChinese: game.haveChinese || false,
            }),
          });
        }
      }
    } catch {}
  }

  return items.slice(0, 20);
}

// ─── HikariNagi (HTML 爬取) ────────────────────────────────

async function scrapeHikariNagi() {
  const items = [];

  try {
    const res = await fetch('https://www.hikarinagi.org/', {
      headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'text/html' },
    });
    if (!res.ok) return items;

    const html = await res.text();

    const articleRe = /href="https?:\/\/www\.hikarinagi\.org\/community\/article\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    const seen = new Set();

    while ((match = articleRe.exec(html)) !== null && items.length < 10) {
      const id = match[1];
      const titleRaw = match[2].replace(/<[^>]*>/g, '').trim();
      if (!titleRaw || titleRaw.length < 4 || seen.has(id)) continue;
      seen.add(id);
      items.push({
        source: 'hikarinagi',
        source_id: `hn_${id}`,
        title: titleRaw,
        link: `https://www.hikarinagi.org/community/article/${id}`,
        summary: '光凪 Galgame 社区',
        cover: '',
        category: 'Gal档案',
        extra: JSON.stringify({ id: Number(id), type: 'article' }),
      });
    }

    const weeklyRe = /href="(https?:\/\/www\.hikarinagi\.org\/community\/article\/(\d+))"[^>]*>[\s\S]*?Gal周报/gi;
    while ((match = weeklyRe.exec(html)) !== null && items.length < 15) {
      const url = match[1];
      const id = match[2];
      if (seen.has(id)) continue;
      seen.add(id);
      const titleMatch = match[0].match(/>([^<]*(?:Gal周报|周报)[^<]*)</);
      const title = titleMatch ? titleMatch[1].trim() : `Gal周报 #${id}`;
      items.push({
        source: 'hikarinagi',
        source_id: `hn_weekly_${id}`,
        title,
        link: url,
        summary: '光凪 Gal 周报',
        cover: '',
        category: '每周速报',
        extra: JSON.stringify({ id: Number(id), type: 'weekly' }),
      });
    }
  } catch {}

  return items.slice(0, 15);
}

// ─── CnGal (公开 API) ──────────────────────────────────────

const CNGAL_API = 'https://api.cngal.org/api';

async function scrapeCnGal() {
  const items = [];

  // 1. 获取最新文章（POST 请求）
  try {
    const res = await fetch(`${CNGAL_API}/articles/GetArticleHomeList`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 1, pageSize: 10 }),
    });
    if (res.ok) {
      const data = await res.json();
      const articles = Array.isArray(data) ? data : (data.data || data.result || []);
      for (const article of articles.slice(0, 10)) {
        const title = article.name || article.title || article.displayName || '';
        if (!title) continue;
        const articleLink = article.link || `https://www.cngal.org/articles/index/${article.id}`;
        items.push({
          source: 'cngal',
          source_id: `cngal_art_${article.id}`,
          title,
          link: articleLink,
          summary: (article.briefIntroduction || '').slice(0, 100),
          cover: article.mainImage || '',
          category: '业界动态',
          extra: JSON.stringify({
            id: article.id,
            type: 'article',
            author: article.createUserName || '',
            createTime: article.lastEditTime || '',
            originalLink: article.link || '',
            readerCount: article.readerCount || 0,
          }),
        });
      }
    }
  } catch {}

  // 2. 获取每周速报概览（GET 请求）
  try {
    const res = await fetch(`${CNGAL_API}/news/GetWeeklyNewsOverview`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const weeklyList = Array.isArray(data) ? data : (data.result || data.data || []);
      for (const weekly of weeklyList.slice(0, 5)) {
        const title = weekly.name || weekly.title || weekly.displayName || '';
        if (!title) continue;
        if (items.find(i => i.title === title)) continue;
        const weeklyLink = weekly.link || `https://www.cngal.org/news/weekly/${weekly.id}`;
        items.push({
          source: 'cngal',
          source_id: `cngal_weekly_${weekly.id}`,
          title,
          link: weeklyLink,
          summary: (weekly.briefIntroduction || '').slice(0, 100),
          cover: weekly.mainImage || '',
          category: '每周速报',
          extra: JSON.stringify({
            id: weekly.id,
            type: 'weekly',
            displayName: weekly.displayName || '',
          }),
        });
      }
    }
  } catch {}

  // 3. 获取近期发售游戏（GET 请求）
  try {
    const res = await fetch(`${CNGAL_API}/entries/GetPublishGamesByTime`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const games = Array.isArray(data) ? data : (data.result || data.data || []);
      for (const game of games.slice(0, 10)) {
        const title = game.name || '';
        if (!title) continue;
        if (items.find(i => i.source_id === `cngal_game_${game.id}`)) continue;
        items.push({
          source: 'cngal',
          source_id: `cngal_game_${game.id}`,
          title,
          link: `https://www.cngal.org/entries/index/${game.id}`,
          summary: (game.briefIntroduction || '').slice(0, 100) || `${game.publishTime || ''}`,
          cover: game.mainImage || '',
          category: 'Gal档案',
          extra: JSON.stringify({
            id: game.id,
            type: 'game',
            publishTime: game.publishTime || '',
          }),
        });
      }
    }
  } catch {}

  return items.slice(0, 25);
}



// ─── Steam 精选/特惠 ──────────────────────────────────────

async function scrapeSteam() {
  const items = [];

  try {
    const res = await fetch('https://store.steampowered.com/api/featuredcategories/', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return items;

    const data = await res.json();

    // 1. Spotlight 精选
    const spotlight = data.spotlight || [];
    for (const item of spotlight.slice(0, 5)) {
      const title = item.name || '';
      if (!title) continue;
      items.push({
        source: 'steam',
        source_id: `steam_spot_${item.id}`,
        title,
        link: `https://store.steampowered.com/app/${item.id}`,
        summary: `Steam 精选${item.discounted ? ` · -${item.discount_percent}%` : ''}`,
        cover: item.header_image?.replace('http://', 'https://') || item.large_capsule_image?.replace('http://', 'https://') || '',
        category: 'Steam精选',
        extra: JSON.stringify({
          appId: item.id,
          discounted: item.discounted || false,
          discountPercent: item.discount_percent || 0,
          finalPrice: item.final_price || 0,
        }),
      });
    }

    // 2. Daily Deal 每日特惠
    const deals = data.specials || data.daily_deals || [];
    for (const item of (deals.items || deals).slice(0, 10)) {
      const title = item.name || '';
      if (!title) continue;
      if (items.find(i => i.source_id === `steam_deal_${item.id}`)) continue;
      items.push({
        source: 'steam',
        source_id: `steam_deal_${item.id}`,
        title,
        link: `https://store.steampowered.com/app/${item.id}`,
        summary: `Steam 特惠 · -${item.discount_percent || 0}%`,
        cover: item.header_image?.replace('http://', 'https://') || item.large_capsule_image?.replace('http://', 'https://') || '',
        category: 'Steam特惠',
        extra: JSON.stringify({
          appId: item.id,
          discountPercent: item.discount_percent || 0,
          originalPrice: item.original_price || 0,
          finalPrice: item.final_price || 0,
        }),
      });
    }

    // 3. New Releases 新品
    const newReleases = data.new_releases || [];
    for (const item of (newReleases.items || newReleases).slice(0, 5)) {
      const title = item.name || '';
      if (!title) continue;
      if (items.find(i => i.source_id === `steam_new_${item.id}`)) continue;
      items.push({
        source: 'steam',
        source_id: `steam_new_${item.id}`,
        title,
        link: `https://store.steampowered.com/app/${item.id}`,
        summary: 'Steam 新品',
        cover: item.header_image?.replace('http://', 'https://') || item.large_capsule_image?.replace('http://', 'https://') || '',
        category: 'Steam新品',
        extra: JSON.stringify({
          appId: item.id,
        }),
      });
    }
  } catch {}

  return items.slice(0, 20);
}

// ─── Jikan (MyAnimeList) ──────────────────────────────────────
// 爬取当季新番和热门排行

const JIKAN_API = 'https://api.jikan.moe/v4';

async function scrapeJikanSeason() {
  const items = [];

  try {
    // 获取当季新番（5秒超时）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${JIKAN_API}/seasons/now?limit=25`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Afterrainliu/ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return items;

    const data = await res.json();
    const animeList = data.data || [];

    for (const anime of animeList) {
      const title = anime.title || anime.title_japanese || '';
      if (!title) continue;

      const genres = (anime.genres || []).map(g => g.name).join('、');
      const studios = (anime.studios || []).map(s => s.name).join('、');
      const score = anime.score || 0;
      const status = anime.status || '';

      items.push({
        source: 'jikan_season',
        source_id: `mal_${anime.mal_id}`,
        title,
        link: anime.url || `https://myanimelist.net/anime/${anime.mal_id}`,
        summary: `${anime.type || 'TV'} · ${anime.episodes || '?'}集 · 评分 ${score} · ${genres || '未知类型'}`,
        cover: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
        category: '新番导视',
        extra: JSON.stringify({
          malId: anime.mal_id,
          score,
          episodes: anime.episodes,
          type: anime.type,
          status,
          genres,
          studios,
          year: anime.year,
          season: anime.season,
          airing: anime.airing,
        }),
      });
    }
  } catch {}

  return items.slice(0, 25);
}

async function scrapeJikanTop() {
  const items = [];

  try {
    // 获取评分排行（5秒超时）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${JIKAN_API}/top/anime?filter=bypopularity&limit=25`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Afterrainliu/ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return items;

    const data = await res.json();
    const animeList = data.data || [];

    for (const anime of animeList) {
      const title = anime.title || anime.title_japanese || '';
      if (!title) continue;

      const genres = (anime.genres || []).map(g => g.name).join('、');
      const score = anime.score || 0;
      const rank = anime.rank || 0;
      const popularity = anime.popularity || 0;

      items.push({
        source: 'jikan_top',
        source_id: `mal_top_${anime.mal_id}`,
        title,
        link: anime.url || `https://myanimelist.net/anime/${anime.mal_id}`,
        summary: `排名 #${rank} · 评分 ${score} · ${popularity}人收藏`,
        cover: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
        category: '热门推荐',
        extra: JSON.stringify({
          malId: anime.mal_id,
          score,
          rank,
          popularity,
          genres,
          type: anime.type,
        }),
      });
    }
  } catch {}

  return items.slice(0, 25);
}

// ─── Kitsu (动漫数据库) ──────────────────────────────────────
// 爬取热门动漫和当季新番

const KITSU_API = 'https://kitsu.io/api/edge';

async function scrapeKitsuTrending() {
  const items = [];

  try {
    // 获取热门动漫（5秒超时）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${KITSU_API}/anime?page[limit]=20&sort=popularityRank`, {
      headers: {
        'Accept': 'application/vnd.api+json',
        'User-Agent': 'Afterrainliu/ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return items;

    const data = await res.json();
    const animeList = data.data || [];

    for (const anime of animeList) {
      const attrs = anime.attributes || {};
      const title = attrs.canonicalTitle || attrs.titles?.en_jp || attrs.titles?.ja || '';
      if (!title) continue;

      const score = attrs.averageRating || 0;
      const rank = attrs.popularityRank || 0;
      const ratingRank = attrs.ratingRank || 0;
      const status = attrs.status || '';
      const type = attrs.subtype || 'TV';

      items.push({
        source: 'kitsu_trending',
        source_id: `kitsu_${anime.id}`,
        title,
        link: `https://kitsu.io/anime/${anime.id}`,
        summary: `${type} · ${attrs.episodeCount || '?'}集 · 评分 ${score/10 || '?'} · 热门排名 #${rank}`,
        cover: attrs.posterImage?.large || attrs.posterImage?.medium || attrs.posterImage?.original || '',
        category: '热门推荐',
        extra: JSON.stringify({
          kitsuId: anime.id,
          slug: attrs.slug,
          score,
          popularityRank: rank,
          ratingRank,
          status,
          type,
          startDate: attrs.startDate,
          endDate: attrs.endDate,
        }),
      });
    }
  } catch {}

  return items.slice(0, 20);
}

async function scrapeKitsuCurrent() {
  const items = [];

  try {
    // 获取当前播出动漫（5秒超时）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${KITSU_API}/anime?page[limit]=20&filter[status]=current&sort=startDate`, {
      headers: {
        'Accept': 'application/vnd.api+json',
        'User-Agent': 'Afterrainliu/ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return items;

    const data = await res.json();
    const animeList = data.data || [];

    for (const anime of animeList) {
      const attrs = anime.attributes || {};
      const title = attrs.canonicalTitle || attrs.titles?.en_jp || attrs.titles?.ja || '';
      if (!title) continue;

      const score = attrs.averageRating || 0;
      const type = attrs.subtype || 'TV';

      items.push({
        source: 'kitsu_current',
        source_id: `kitsu_cur_${anime.id}`,
        title,
        link: `https://kitsu.io/anime/${anime.id}`,
        summary: `${type} · 正在播出 · 评分 ${score/10 || '?'}`,
        cover: attrs.posterImage?.large || attrs.posterImage?.medium || attrs.posterImage?.original || '',
        category: '新番导视',
        extra: JSON.stringify({
          kitsuId: anime.id,
          slug: attrs.slug,
          score,
          type,
          startDate: attrs.startDate,
          status: attrs.status,
        }),
      });
    }
  } catch {}

  return items.slice(0, 20);
}

// ─── 统一爬取入口 ──────────────────────────────────────────

async function runAllScrapers(db) {
  const scrapers = [
    { name: 'bangumi_calendar', fn: scrapeBangumiCalendar },
    { name: 'bangumi_hot', fn: scrapeBangumiHot },
    { name: 'bangumi_game', fn: scrapeBangumiGame },
    { name: 'bangumi_book', fn: scrapeBangumiBook },
    { name: 'ymgal', fn: scrapeYmgal },
    { name: 'hikarinagi', fn: scrapeHikariNagi },
    { name: 'cngal', fn: scrapeCnGal },
    { name: 'steam', fn: scrapeSteam },
    { name: 'jikan_season', fn: scrapeJikanSeason },
    { name: 'jikan_top', fn: scrapeJikanTop },
    { name: 'kitsu_trending', fn: scrapeKitsuTrending },
    { name: 'kitsu_current', fn: scrapeKitsuCurrent },
  ];

  const results = {};
  let total = 0;

  for (const scraper of scrapers) {
    try {
      const items = await scraper.fn();
      let inserted = 0;

      for (const item of items) {
        try {
          await db.prepare(
            `INSERT OR REPLACE INTO scraped_news (source, source_id, title, link, summary, cover, category, extra, scraped_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).bind(item.source, item.source_id, item.title, item.link, item.summary, item.cover, item.category, item.extra).run();
          inserted++;
        } catch {}
      }

      results[scraper.name] = inserted;
      total += inserted;
    } catch (err) {
      results[scraper.name] = `error: ${err.message}`;
    }
  }

  // 清理 30 天前的旧数据
  try {
    await db.prepare(
      "DELETE FROM scraped_news WHERE scraped_at < datetime('now', '-30 days')"
    ).run();
  } catch {}

  return { total, sources: results };
}

async function scrapeSingleSource(sourceName) {
  const scrapers = {
    bangumi_calendar: scrapeBangumiCalendar,
    bangumi_hot: scrapeBangumiHot,
    bangumi_game: scrapeBangumiGame,
    bangumi_book: scrapeBangumiBook,
    ymgal: scrapeYmgal,
    hikarinagi: scrapeHikariNagi,
    cngal: scrapeCnGal,
    steam: scrapeSteam,
    jikan_season: scrapeJikanSeason,
    jikan_top: scrapeJikanTop,
    kitsu_trending: scrapeKitsuTrending,
    kitsu_current: scrapeKitsuCurrent,
  };

  const fn = scrapers[sourceName];
  if (!fn) return [];

  try {
    return await fn();
  } catch {
    return [];
  }
}


// 导出函数到模块对象
module.scrapeBangumiCalendar = scrapeBangumiCalendar;
module.scrapeBangumiHot = scrapeBangumiHot;
module.scrapeBangumiGame = scrapeBangumiGame;
module.scrapeBangumiBook = scrapeBangumiBook;
module.getYmgalToken = getYmgalToken;
module.scrapeYmgal = scrapeYmgal;
module.scrapeHikariNagi = scrapeHikariNagi;
module.scrapeCnGal = scrapeCnGal;
module.scrapeSteam = scrapeSteam;
module.scrapeJikanSeason = scrapeJikanSeason;
module.scrapeJikanTop = scrapeJikanTop;
module.scrapeKitsuTrending = scrapeKitsuTrending;
module.scrapeKitsuCurrent = scrapeKitsuCurrent;
module.runAllScrapers = runAllScrapers;
module.scrapeSingleSource = scrapeSingleSource;
module.scrapeBangumiCalendar = scrapeBangumiCalendar;
module.scrapeBangumiHot = scrapeBangumiHot;
module.scrapeBangumiGame = scrapeBangumiGame;
module.scrapeBangumiBook = scrapeBangumiBook;
module.getYmgalToken = getYmgalToken;
module.scrapeYmgal = scrapeYmgal;
module.scrapeHikariNagi = scrapeHikariNagi;
module.scrapeCnGal = scrapeCnGal;
module.scrapeSteam = scrapeSteam;
module.scrapeJikanSeason = scrapeJikanSeason;
module.scrapeJikanTop = scrapeJikanTop;
module.scrapeKitsuTrending = scrapeKitsuTrending;
module.scrapeKitsuCurrent = scrapeKitsuCurrent;
module.runAllScrapers = runAllScrapers;
module.scrapeSingleSource = scrapeSingleSource;
module.BANGUMI_API = BANGUMI_API;
module.BANGUMI_UA = BANGUMI_UA;
module.res = res;
module.days = days;
module.items = items;
module.weekday = weekday;
module.rating = rating;
module.doing = doing;
module.res = res;
module.data = data;
module.items = items;
module.res = res;
module.data = data;
module.items = items;
module.items = items;
module.res = res;
module.data = data;
module.YMGAL_TOKEN_URL = YMGAL_TOKEN_URL;
module.YMGAL_API = YMGAL_API;
module.YMGAL_CLIENT_ID = YMGAL_CLIENT_ID;
module.YMGAL_CLIENT_SECRET = YMGAL_CLIENT_SECRET;
module.res = res;
module.data = data;
module.token = token;
module.expiresIn = expiresIn;
module.items = items;
module.token = token;
module.headers = headers;
module.now = now;
module.thirtyDaysAgo = thirtyDaysAgo;
module.releaseStartDate = releaseStartDate;
module.releaseEndDate = releaseEndDate;
module.res = res;
module.data = data;
module.games = games;
module.title = title;
module.cover = cover;
module.res = res;
module.data = data;
module.games = games;
module.title = title;
module.cover = cover;
module.items = items;
module.res = res;
module.html = html;
module.articleRe = articleRe;
module.seen = seen;
module.id = id;
module.titleRaw = titleRaw;
module.weeklyRe = weeklyRe;
module.url = url;
module.id = id;
module.titleMatch = titleMatch;
module.title = title;
module.CNGAL_API = CNGAL_API;
module.items = items;
module.res = res;
module.data = data;
module.articles = articles;
module.title = title;
module.articleLink = articleLink;
module.res = res;
module.data = data;
module.weeklyList = weeklyList;
module.title = title;
module.weeklyLink = weeklyLink;
module.res = res;
module.data = data;
module.games = games;
module.title = title;
module.items = items;
module.res = res;
module.data = data;
module.spotlight = spotlight;
module.title = title;
module.deals = deals;
module.title = title;
module.newReleases = newReleases;
module.title = title;
module.JIKAN_API = JIKAN_API;
module.items = items;
module.controller = controller;
module.timeoutId = timeoutId;
module.res = res;
module.data = data;
module.animeList = animeList;
module.title = title;
module.genres = genres;
module.studios = studios;
module.score = score;
module.status = status;
module.items = items;
module.controller = controller;
module.timeoutId = timeoutId;
module.res = res;
module.data = data;
module.animeList = animeList;
module.title = title;
module.genres = genres;
module.score = score;
module.rank = rank;
module.popularity = popularity;
module.KITSU_API = KITSU_API;
module.items = items;
module.controller = controller;
module.timeoutId = timeoutId;
module.res = res;
module.data = data;
module.animeList = animeList;
module.attrs = attrs;
module.title = title;
module.score = score;
module.rank = rank;
module.ratingRank = ratingRank;
module.status = status;
module.type = type;
module.items = items;
module.controller = controller;
module.timeoutId = timeoutId;
module.res = res;
module.data = data;
module.animeList = animeList;
module.attrs = attrs;
module.title = title;
module.score = score;
module.type = type;
module.scrapers = scrapers;
module.results = results;
module.items = items;
module.scrapers = scrapers;
module.fn = fn;
})(newsScraper);

// ─── bangumiEnrich 模块 ────────────────────────────────────────
const bangumiEnrich = {};
(function(module) {
/**
 * ANISpace Worker — Bangumi 条目全量入库
 *
 * 当用户首次标记一个条目时，从 Bangumi API 拉取全量数据存入 bangumi_subjects 表。
 * 后续搜索/详情获取优先使用此表数据，减少对官方 API 的依赖。
 */

const UA = 'ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace; enrich)';
const BANGUMI_API = 'https://api.bgm.tv';
const MAX_RETRIES = 2;
const RETRY_DELAYS = [500, 1000];

/**
 * 检查 bangumi_subjects 表是否已有该条目
 */
async function hasSubject(env, subjectId) {
  const row = await env.DB.prepare(
    'SELECT id FROM bangumi_subjects WHERE id = ?'
  ).bind(Number(subjectId)).first();
  return !!row;
}

/**
 * 从 Bangumi API 拉取条目全量数据并存入 D1
 * @param env
 * @param subjectId Bangumi subject ID
 * @returns {Promise<boolean>} 是否入库成功
 */
async function enrichSubject(env, subjectId) {
  if (!subjectId) return false;

  // 已存在则跳过
  if (await hasSubject(env, subjectId)) return true;

  // 从 Bangumi API 拉取全量数据
  const data = await fetchSubjectDetail(subjectId);
  if (!data || !data.id) return false;

  // 存入 D1
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO bangumi_subjects
        (id, type, name, name_cn, summary, image, images, score, rank,
         rating, tags, eps, air_date, air_weekday, platform,
         infobox, crt, staff, collection, source, enriched_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'enrich', datetime('now'), datetime('now'))
    `).bind(
      Number(data.id),
      data.type || 2,
      data.name || '',
      data.name_cn || '',
      data.summary || '',
      data.images?.large || data.images?.common || data.image || '',
      JSON.stringify(data.images || {}),
      data.rating?.score || 0,
      data.rank || 0,
      JSON.stringify(data.rating || {}),
      JSON.stringify(
        Array.isArray(data.tags)
          ? data.tags.map(t => typeof t === 'string' ? { name: t } : { name: t.name, count: t.count })
          : []
      ),
      data.eps || data.eps_count || 0,
      data.air_date || '',
      data.air_weekday || 0,
      data.platform || '',
      JSON.stringify(Array.isArray(data.infobox) ? data.infobox : []),
      JSON.stringify(Array.isArray(data.crt) ? data.crt : []),
      JSON.stringify(Array.isArray(data.staff) ? data.staff : []),
      JSON.stringify(data.collection || {}),
    ).run();

    return true;
  } catch (err) {
    console.warn('[bangumi-enrich] DB insert failed:', err?.message);
    return false;
  }
}

/**
 * 从 Bangumi API 拉取条目详情（带重试）
 */
async function fetchSubjectDetail(subjectId) {
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BANGUMI_API}/subject/${subjectId}?responseGroup=large`, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt] || 1000));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt] || 500));
      }
    }
  }
  console.warn('[bangumi-enrich] fetch failed:', lastErr?.message);
  return null;
}


// 导出函数到模块对象
module.hasSubject = hasSubject;
module.enrichSubject = enrichSubject;
module.fetchSubjectDetail = fetchSubjectDetail;
module.hasSubject = hasSubject;
module.enrichSubject = enrichSubject;
module.fetchSubjectDetail = fetchSubjectDetail;
module.UA = UA;
module.BANGUMI_API = BANGUMI_API;
module.MAX_RETRIES = MAX_RETRIES;
module.RETRY_DELAYS = RETRY_DELAYS;
module.row = row;
module.data = data;
module.res = res;
})(bangumiEnrich);

// ─── userProfile 模块 ────────────────────────────────────────
const userProfile = {};
(function(module) {
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
async function computeUserProfile(db, userId) {
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

  // 计算社交特征
  const socialFeatures = await computeSocialFeatures(db, userId);

  // 计算生命周期阶段
  const lifecycleStage = computeLifecycleStage(items, activityScore);

  // 计算偏好向量（tag_weights 截断为 top-64）
  const preferenceVector = computePreferenceVector(tagWeights);

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
    social_features: JSON.stringify(socialFeatures),
    preference_vector: JSON.stringify(preferenceVector),
    lifecycle_stage: lifecycleStage,
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
    social_features: '{}',
    preference_vector: '{}',
    lifecycle_stage: 'new',
    updated_at: new Date().toISOString(),
  };
}

/**
 * 计算当前用户与所有其他用户的余弦相似度，返回 top-20
 * similarity(A, B) = (Σ w_A(t) × w_B(t)) / (√Σ w_A² × √Σ w_B²)
 */
async function computeSimilarUsers(db, userId) {
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
async function cleanupBehaviorLog(db) {
  await db.prepare(
    "DELETE FROM behavior_log WHERE created_at < datetime('now', '-7 days')"
  ).run();
}

/**
 * 计算社交特征
 */
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

/**
 * 计算生命周期阶段
 */
function computeLifecycleStage(items, activityScore) {
  if (items.length < 5) return 'new';
  if (items.length < 20) return 'growing';
  if (activityScore >= 0.5) return 'active';
  return 'dormant';
}

/**
 * 计算偏好向量（tag_weights 截断为 top-64）
 */
function computePreferenceVector(tagWeights) {
  return Object.entries(tagWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 64)
    .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {});
}

// 导出函数到模块对象
module.computeUserProfile = computeUserProfile;
module.computeTagWeights = computeTagWeights;
module.computeSimilarUsers = computeSimilarUsers;
module.cleanupBehaviorLog = cleanupBehaviorLog;
module.computeSocialFeatures = computeSocialFeatures;
module.safeJson = safeJson;
module.computeUserProfile = computeUserProfile;
module.computeTagWeights = computeTagWeights;
module.computeTypeAffinity = computeTypeAffinity;
module.computeConsumptionStats = computeConsumptionStats;
module.computeRatingTendency = computeRatingTendency;
module.computeActivityScore = computeActivityScore;
module.buildEmptyProfile = buildEmptyProfile;
module.computeSimilarUsers = computeSimilarUsers;
module.cleanupBehaviorLog = cleanupBehaviorLog;
module.computeSocialFeatures = computeSocialFeatures;
module.computeLifecycleStage = computeLifecycleStage;
module.computePreferenceVector = computePreferenceVector;
module.collections = collections;
module.items = items;
module.totalCollections = totalCollections;
module.subjectIds = subjectIds;
module.placeholders = placeholders;
module.subjects = subjects;
module.subjectMap = subjectMap;
module.tagWeights = tagWeights;
module.typeAffinity = typeAffinity;
module.consumptionStats = consumptionStats;
module.ratingTendency = ratingTendency;
module.activityScore = activityScore;
module.socialFeatures = socialFeatures;
module.lifecycleStage = lifecycleStage;
module.preferenceVector = preferenceVector;
module.tagCount = tagCount;
module.subject = subject;
module.tags = tags;
module.name = name;
module.totalUsersResult = totalUsersResult;
module.totalUsers = totalUsers;
module.weights = weights;
module.tf = tf;
module.usersWithTag = usersWithTag;
module.userCount = userCount;
module.idf = idf;
module.typeCount = typeCount;
module.TYPE_MAP = TYPE_MAP;
module.subject = subject;
module.typeKey = typeKey;
module.total = total;
module.ratedItems = ratedItems;
module.avgRating = avgRating;
module.variance = variance;
module.statusCount = statusCount;
module.ratedItems = ratedItems;
module.avgRating = avgRating;
module.variance = variance;
module.currentProfile = currentProfile;
module.currentWeights = currentWeights;
module.currentTags = currentTags;
module.currentNorm = currentNorm;
module.allProfiles = allProfiles;
module.similarities = similarities;
module.otherWeights = otherWeights;
module.otherTags = otherTags;
module.commonTags = commonTags;
module.otherNorm = otherNorm;
module.similarity = similarity;
module.followCount = followCount;
module.followerCount = followerCount;
module.postCount = postCount;
module.avgLikes = avgLikes;
})(userProfile);

// ─── recommendEngine 模块 ────────────────────────────────────────
const recommendEngine = {};
(function(module) {
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
async function refreshUserRecommendCache(db, userId) {
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
async function refreshAllRecommendCaches(db) {
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
async function getHotRecommendations(db) {
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

// 导出函数到模块对象
module.recallLayer = recallLayer;
module.refreshUserRecommendCache = refreshUserRecommendCache;
module.refreshAllRecommendCaches = refreshAllRecommendCaches;
module.getHotRecommendations = getHotRecommendations;
module.safeJson = safeJson;
module.recallLayer = recallLayer;
module.coarseRankLayer = coarseRankLayer;
module.fineRankLayer = fineRankLayer;
module.rerankLayer = rerankLayer;
module.refreshUserRecommendCache = refreshUserRecommendCache;
module.computeForumPosts = computeForumPosts;
module.computeNewsFeed = computeNewsFeed;
module.refreshAllRecommendCaches = refreshAllRecommendCaches;
module.getHotRecommendations = getHotRecommendations;
module.tagWeights = tagWeights;
module.typeAffinity = typeAffinity;
module.similarUsers = similarUsers;
module.preferenceVector = preferenceVector;
module.candidates = candidates;
module.seenIds = seenIds;
module.similarIds = similarIds;
module.placeholders = placeholders;
module.cfItems = cfItems;
module.vectorTags = vectorTags;
module.tagConditions = tagConditions;
module.tagParams = tagParams;
module.vectorItems = vectorItems;
module.topTags = topTags;
module.tagConditions = tagConditions;
module.tagParams = tagParams;
module.tagItems = tagItems;
module.socialItems = socialItems;
module.hotItems = hotItems;
module.typeAffinity = typeAffinity;
module.typeKey = typeKey;
module.typeMatch = typeMatch;
module.popularity = popularity;
module.coarseScore = coarseScore;
module.profileObj = profileObj;
module.shortObj = shortObj;
module.features = features;
module.lrScore = lrScore;
module.promotions = promotions;
module.shownSubjects = shownSubjects;
module.shownSet = shownSet;
module.result = result;
module.typeCount = typeCount;
module.typeKey = typeKey;
module.hoursSince = hoursSince;
module.profile = profile;
module.promoResult = promoResult;
module.recalled = recalled;
module.coarseRanked = coarseRanked;
module.fineRanked = fineRanked;
module.homeRandom = homeRandom;
module.typeAffinity = typeAffinity;
module.forumPosts = forumPosts;
module.newsFeed = newsFeed;
module.scenes = scenes;
module.boardWeights = boardWeights;
module.weight = weight;
module.weight = weight;
module.weight = weight;
module.categoryWeights = categoryWeights;
module.weight = weight;
module.weight = weight;
module.weight = weight;
module.items = items;
})(recommendEngine);

// ─── behaviorCollector 模块 ────────────────────────────────────────
const behaviorCollector = {};
(function(module) {
/**
 * worker/lib/behavior-collector.js
 * 后端批量行为处理 + 短期画像计算
 */

/**
 * 批量写入行为日志
 */
async function batchInsertBehaviors(db, userId, actions) {
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
async function computeShortProfile(db, userId) {
  const sevenDaysAgo = "datetime('now', '-7 days')";

  const actionStats = await db.prepare(
    `SELECT action, target_type, COUNT(*) as cnt
     FROM behavior_log
     WHERE user_id = ? AND created_at > ${sevenDaysAgo}
     GROUP BY action, target_type`
  ).bind(userId).all();

  const recentSubjects = await db.prepare(
    `SELECT DISTINCT target_id
     FROM behavior_log
     WHERE user_id = ? AND target_type IN ('anime', 'game', 'novel')
       AND created_at > ${sevenDaysAgo}
     LIMIT 100`
  ).bind(userId).all();

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

  const recentTypes = {};
  for (const row of (actionStats.results || [])) {
    if (['anime', 'game', 'novel'].includes(row.target_type)) {
      recentTypes[row.target_type] = (recentTypes[row.target_type] || 0) + row.cnt;
    }
  }

  const totalActions = (actionStats.results || []).reduce((s, r) => s + r.cnt, 0);

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

// 导出函数到模块对象
module.batchInsertBehaviors = batchInsertBehaviors;
module.computeShortProfile = computeShortProfile;
module.batchInsertBehaviors = batchInsertBehaviors;
module.computeShortProfile = computeShortProfile;
module.stmt = stmt;
module.batch = batch;
module.sevenDaysAgo = sevenDaysAgo;
module.actionStats = actionStats;
module.recentSubjects = recentSubjects;
module.subjectIds = subjectIds;
module.placeholders = placeholders;
module.subjects = subjects;
module.tagCount = tagCount;
module.tags = tags;
module.name = name;
module.recentTypes = recentTypes;
module.totalActions = totalActions;
module.sessionResult = sessionResult;
module.shortProfile = shortProfile;
})(behaviorCollector);

// ─── exploreEngine 模块 ────────────────────────────────────────
const exploreEngine = {};
(function(module) {
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
async function generateExploreFeed(db, profile, category = '', page = 1, pageSize = 20) {
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

// 导出函数到模块对象
module.generateExploreFeed = generateExploreFeed;
module.safeJson = safeJson;
module.generateExploreFeed = generateExploreFeed;
module.personalizeExploreItems = personalizeExploreItems;
module.typeAffinity = typeAffinity;
module.tagWeights = tagWeights;
module.offset = offset;
module.items = items;
module.typeMap = typeMap;
module.typeFilter = typeFilter;
module.subjects = subjects;
module.posts = posts;
module.news = news;
module.works = works;
module.ranked = ranked;
module.typeKey = typeKey;
module.name = name;
module.daysSince = daysSince;
})(exploreEngine);

// ─── creativeNotes 模块 ────────────────────────────────────────
const creativeNotes = {};
(function(module) {
/**
 * 创作空间纯函数库
 * 提取自 oauth-proxy.js 的可测试逻辑：输入校验、序列化、所有权校验、时间线构建
 */

/** 安全 JSON 解析，失败返回 fallback */
function safeJsonParse(value, fallback) {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

/** 校验笔记新建/更新输入，返回 { valid, data, error } */
function validateNoteInput(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '请求体无效', data: null };
  }
  const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '';
  if (body.title && typeof body.title === 'string' && body.title.length > 200) {
    return { valid: false, error: '标题不能超过 200 字符', data: null };
  }
  let blocks = [];
  if (body.blocks !== undefined) {
    if (!Array.isArray(body.blocks)) {
      return { valid: false, error: 'blocks 必须是数组', data: null };
    }
    blocks = body.blocks;
  }
  let linked_subject_ids = [];
  if (body.linked_subject_ids !== undefined) {
    if (!Array.isArray(body.linked_subject_ids)) {
      return { valid: false, error: 'linked_subject_ids 必须是数组', data: null };
    }
    linked_subject_ids = body.linked_subject_ids;
  }
  let linked_subjects_snapshot = [];
  if (body.linked_subjects_snapshot !== undefined) {
    if (!Array.isArray(body.linked_subjects_snapshot)) {
      return { valid: false, error: 'linked_subjects_snapshot 必须是数组', data: null };
    }
    linked_subjects_snapshot = body.linked_subjects_snapshot;
  }
  let tags = [];
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return { valid: false, error: 'tags 必须是数组', data: null };
    }
    tags = body.tags;
  }
  const is_pinned = body.is_pinned ? 1 : 0;
  return {
    valid: true,
    error: null,
    data: { title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned },
  };
}

/** 把 blocks 数组序列化为 JSON 字符串（DB 存储） */
function serializeBlocks(blocks) {
  if (!Array.isArray(blocks)) return '[]';
  return JSON.stringify(blocks);
}

/** 把 DB 行的 JSON 字段反序列化为对象 */
function parseNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title || '',
    blocks: safeJsonParse(row.blocks, []),
    linked_subject_ids: safeJsonParse(row.linked_subject_ids, []),
    linked_subjects_snapshot: safeJsonParse(row.linked_subjects_snapshot, []),
    tags: safeJsonParse(row.tags, []),
    is_pinned: row.is_pinned || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 所有权校验：authUser.userId === note.user_id */
function checkOwnership(authUser, note) {
  if (!authUser || !note) return false;
  return authUser.userId === note.user_id;
}

/** 构建时间线条目 */
function buildTimelineEntry(type, row) {
  const entry = {
    type,
    id: row.id,
    subject_id: row.subject_id,
    subject_name: row.subject_name || '',
    subject_image: row.subject_image || '',
    subject_type: row.subject_type,
    content: row.content || '',
    created_at: row.created_at,
  };
  if (type === 'rating') {
    entry.score = row.score;
  }
  return entry;
}

/** 组装 Navi 上下文：笔记内容 + 关联条目历史短评 */
function buildNaviContext(note, insights) {
  const lines = [];
  lines.push('你是用户的创作助手 Navi。以下是用户的笔记内容和关联条目的历史短评，请基于这些上下文回答用户的问题。');
  lines.push('');
  lines.push('【当前笔记】');
  lines.push(`标题：${note.title || '（无标题）'}`);
  lines.push('内容：');
  for (const block of (note.blocks || [])) {
    if (block.type === 'text' || block.type === 'quote') {
      lines.push(block.content || '');
    } else if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
      lines.push(`${'#'.repeat(Number(block.type[1]))} ${block.content || ''}`);
    } else if (block.type === 'todo') {
      lines.push(`- [${block.checked ? 'x' : ' '}] ${block.content || ''}`);
    } else if (block.type === 'divider') {
      lines.push('---');
    } else if (block.type === 'image') {
      lines.push(`[图片: ${block.src || ''}]`);
    } else if (block.type === 'subject-link') {
      lines.push(`[条目: ${block.subject_name || ''}]`);
    }
  }
  lines.push('');
  lines.push('【关联条目历史短评】');
  if (insights && insights.length > 0) {
    insights.forEach((it, i) => {
      const score = it.score ? `（评分：${it.score}）` : '';
      lines.push(`${i + 1}. ${it.subject_name || '未知条目'}${score}："${it.content || ''}"`);
    });
  } else {
    lines.push('（暂无关联短评）');
  }
  return lines.join('\n');
}


// 导出函数到模块对象
module.safeJsonParse = safeJsonParse;
module.validateNoteInput = validateNoteInput;
module.serializeBlocks = serializeBlocks;
module.parseNote = parseNote;
module.checkOwnership = checkOwnership;
module.buildTimelineEntry = buildTimelineEntry;
module.buildNaviContext = buildNaviContext;
module.title = title;
module.is_pinned = is_pinned;
module.entry = entry;
module.lines = lines;
module.score = score;
})(creativeNotes);

// ─── lrRanker 模块 ────────────────────────────────────────
const lrRanker = {};
(function(module) {
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
function lrPredict(features) {
  let z = LR_BIAS;
  for (const [key, weight] of Object.entries(LR_WEIGHTS)) {
    z += weight * (features[key] || 0);
  }
  return 1 / (1 + Math.exp(-z));
}

/**
 * 为候选条目提取特征
 */
function extractFeatures(item, profile, shortProfile) {
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
function rankWithLR(candidates, profile, shortProfile) {
  return candidates
    .map(item => {
      const features = extractFeatures(item, profile, shortProfile);
      const lrScore = lrPredict(features);
      return { ...item, _lr_score: lrScore, _features: features };
    })
    .sort((a, b) => b._lr_score - a._lr_score);
}

// 导出函数到模块对象
module.lrPredict = lrPredict;
module.extractFeatures = extractFeatures;
module.rankWithLR = rankWithLR;
module.LR_WEIGHTS = LR_WEIGHTS;
module.LR_BIAS = LR_BIAS;
module.tagWeights = tagWeights;
module.typeAffinity = typeAffinity;
module.ratingTendency = ratingTendency;
module.recentTags = recentTags;
module.name = name;
module.uw = uw;
module.sw = sw;
module.combinedWeight = combinedWeight;
module.typeKey = typeKey;
module.typeMatch = typeMatch;
module.cfScore = cfScore;
module.popularity = popularity;
module.daysSince = daysSince;
module.social = social;
module.features = features;
module.lrScore = lrScore;
})(lrRanker);

// ═══════════════════════════════════════════════════════════
// 主 Worker 代码
// ═══════════════════════════════════════════════════════════

/**
 * ANISpace 代理 — Cloudflare Worker
 *
 * 功能：
 * 1. OAuth token 交换（Bangumi / GitHub）
 * 2. Bangumi API 代理 + 缓存（解决直连不稳定问题）
 * 3. Worker API 扩展（用户、帖子、收藏、关注、通知、世界消息、新闻）
 *
 * 环境变量（在 Cloudflare Dashboard 中配置）：
 *   BANGUMI_CLIENT_ID      - Bangumi OAuth Client ID
 *   BANGUMI_CLIENT_SECRET  - Bangumi OAuth Client Secret
 *   GITHUB_CLIENT_ID       - GitHub OAuth Client ID
 *   GITHUB_CLIENT_SECRET   - GitHub OAuth Client Secret
 *   ALLOWED_ORIGIN         - 允许的前端域名（如 https://afterrain-2005.github.io）
 *   JWT_SECRET             - JWT 签名密钥
 *   ADMIN_SYNC_TOKEN       - 手动触发 bangumi-data 同步的鉴权 token（任意随机字符串）
 *   GLM_API_KEY            - 智谱 AI API Key（Navi 默认 LLM，前端不暴露此 Key）
 */

// ─── ES Module 依赖 ────────────────────────────────────────

// ─── SSRF 防护 ───────────────────────────────────────────

/**
 * 校验目标 URL 是否安全，防止 SSRF 攻击
 * - 允许 http:// 和 https:// 协议（部分源站仅支持 HTTP）
 * - 禁止 IP 地址、loopback、内网段
 * - 禁止元数据地址
 */
function isSafeTargetUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    // 允许 HTTP 和 HTTPS（部分 RSS/Selector 源站仅支持 HTTP）
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;

    const hostname = u.hostname.toLowerCase();

    // 禁止 IP 地址（IPv4 和 IPv6）
    const ipRe = /^(?:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|\[?[0-9a-fA-F:]+\]?)$/;
    if (ipRe.test(hostname)) return false;

    // 禁止 loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return false;

    // 禁止内网段
    if (hostname.startsWith('10.') || hostname.startsWith('172.16.') ||
        hostname.startsWith('172.17.') || hostname.startsWith('172.18.') ||
        hostname === '172.16.0.0' || hostname.startsWith('172.19.') ||
        hostname.startsWith('172.20.') || hostname.startsWith('172.21.') ||
        hostname.startsWith('172.22.') || hostname.startsWith('172.23.') ||
        hostname.startsWith('172.24.') || hostname.startsWith('172.25.') ||
        hostname.startsWith('172.26.') || hostname.startsWith('172.27.') ||
        hostname.startsWith('172.28.') || hostname.startsWith('172.29.') ||
        hostname.startsWith('172.30.') || hostname.startsWith('172.31.') ||
        hostname.startsWith('192.168.')) return false;

    // 禁止云元数据地址和保留域名
    if (hostname === '169.254.169.254' ||
        hostname === 'metadata.google.internal' ||
        hostname === 'metadata.google.internal.') return false;

    return true;
  } catch {
    return false;
  }
}

// 安全解析 D1 文本列中的 JSON（tags/images 等），脏数据/空串不抛错
function safeJsonParse(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  if (value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ─── JWT 辅助函数 ───────────────────────────────────────────

const JWT_EXPIRY = 7 * 24 * 60 * 60; // 7 天，单位秒

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + JWT_EXPIRY };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const signatureB64 = arrayBufferToBase64(signature).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${signingInput}.${signatureB64}`;
}

async function verifyJWT(token, secret) {
  // M-3: 限制 token 长度防 DoS
  if (!token || token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  // M-3: 校验 base64url 字符集
  const base64UrlRe = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlRe.test(headerB64) || !base64UrlRe.test(payloadB64) || !base64UrlRe.test(signatureB64)) {
    return null;
  }

  const signingInput = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  let signatureStr = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
  while (signatureStr.length % 4) signatureStr += '=';
  // M-3: 捕获 atob 非法的 base64 字符异常
  let signatureBytes;
  try {
    signatureBytes = Uint8Array.from(atob(signatureStr), c => c.charCodeAt(0));
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(signingInput));
  if (!valid) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

async function getAuthUser(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const secret = env.JWT_SECRET || 'anispace-jwt-secret-change-me';
  return await verifyJWT(token, secret);
}

async function getAdminUser(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return null;
  const user = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(authUser.userId).first();
  if (!user || !user.is_admin) return null;
  return authUser;
}

async function hasSocialPermission(env, userId, permission) {
  // 管理员自动拥有所有权限
  const user = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(userId).first();
  if (user && user.is_admin) return true;
  // 检查权限表
  const perm = await env.DB.prepare(
    'SELECT expires_at FROM user_permissions WHERE user_id = ? AND permission = ?'
  ).bind(userId, permission).first();
  if (!perm) return false;
  if (perm.expires_at && new Date(perm.expires_at) < new Date()) return false;
  return true;
}

// ─── 原有常量 ───────────────────────────────────────────────

const BANGUMI_TOKEN_URL = 'https://bgm.tv/oauth/access_token';
const BANGUMI_API_URL = 'https://api.bgm.tv';
const ANIBT_API_URL = 'https://anibt.net';

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

// 缓存配置
const CACHE_TTL = 30 * 60; // 30 分钟，单位秒
const CACHE_TTL_SHORT = 5 * 60; // 5 分钟（搜索等实时性要求高的接口）

// 不缓存的路径（POST 请求、token 交换等）
const NO_CACHE_PATHS = ['/v0/search/'];

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/**
 * H-2: 判断 origin 是否被允许，精确匹配防止前缀绕过
 */
function isAllowedOrigin(origin, allowedOrigin) {
  if (!allowedOrigin || !origin) return true; // 无配置允许任何来源
  try {
    const o = new URL(origin);
    const a = new URL(allowedOrigin);
    return o.origin === a.origin;
  } catch {
    return false;
  }
}

/**
 * H-3: 校验 OAuth redirect_uri，仅允许白名单路径
 */
function validateRedirectUri(uri, allowedOrigin) {
  if (!uri) return false;
  try {
    const u = new URL(uri);
    // 检验 origin 部分必须匹配
    if (!isAllowedOrigin(u.origin, allowedOrigin)) return false;
    // 仅允许 /auth/bangumi 和 /auth/github 路径
    if (!['/auth/bangumi', '/auth/github'].includes(u.pathname)) return false;
    return u.toString();
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    ...CORS_HEADERS,
  };
}

function jsonResponse(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

// ─── 用户数据格式化 (M-5) ──────────────────────────────────

/**
 * M-5: 解析 preferences JSON 字段，确保前端收到对象而非字符串
 */
function formatUser(user) {
  if (!user) return user;
  if (user.preferences && typeof user.preferences === 'string') {
    try {
      user.preferences = JSON.parse(user.preferences);
    } catch {
      user.preferences = {};
    }
  }
  return user;
}

// ─── 密码哈希 (PBKDF2) ──────────────────────────────────────

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltB64 = arrayBufferToBase64(salt.buffer);
  const hashB64 = arrayBufferToBase64(derivedBits);
  return `${saltB64}:${hashB64}`;
}

async function verifyPassword(password, storedHash) {
  const [saltB64, hashB64] = storedHash.split(':');
  if (!saltB64 || !hashB64) return false;
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const computedB64 = arrayBufferToBase64(derivedBits);
  return computedB64 === hashB64;
}

// ─── Turnstile 验证 ─────────────────────────────────────────

async function verifyTurnstile(token, secret) {
  if (!token || !secret) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// ─── Bangumi API 代理 ────────────────────────────────────────

async function handleBangumiProxy(pathname, searchParams, request, env, origin) {
  // 构建目标 URL
  const targetUrl = `${BANGUMI_API_URL}${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;

  // 检查缓存（仅 GET 请求）
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, { method: 'GET' });
  if (request.method === 'GET') {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Cache', 'HIT');
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  // 转发请求
  const headers = {
    'User-Agent': 'ANISpace/1.0',
    'Accept': 'application/json',
  };

  // 透传 Authorization 头（如有）
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;

  const fetchOptions = {
    method: request.method,
    headers,
  };

  // POST 请求转发 body
  if (request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || 'application/json';
    headers['Content-Type'] = contentType;
    fetchOptions.body = await request.text();
  }

  const res = await fetch(targetUrl, fetchOptions);

  // 构建响应
  const resHeaders = new Headers();
  resHeaders.set('Content-Type', 'application/json');
  resHeaders.set('X-Cache', 'MISS');
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

  const responseBody = await res.text();

  // 缓存 GET 请求的响应
  if (request.method === 'GET' && res.ok) {
    const isNoCache = NO_CACHE_PATHS.some(p => pathname.startsWith(p));
    const ttl = isNoCache ? CACHE_TTL_SHORT : CACHE_TTL;

    const cacheResponse = new Response(responseBody, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    // 使用 waitUntil 异步写入缓存，不阻塞响应
    try { await cache.put(cacheKey, cacheResponse); } catch {}
  }

  return new Response(responseBody, {
    status: res.status,
    headers: resHeaders,
  });
}

// ─── AniBT API 代理 ────────────────────────────────────────

// ─── Hikarinagi API 代理 ────────────────────────────────────────

const HIKARINAGI_API_URL = 'https://www.hikarinagi.org/api/v2';

// ─── Jikan API 代理 (MyAnimeList) ────────────────────────────────────────

const JIKAN_API_URL = 'https://api.jikan.moe/v4';

// ─── trace.moe API 代理 (番剧识别) ────────────────────────────────────────

const TRACEMOE_API_URL = 'https://api.trace.moe';

// ─── Kitsu API 代理 ────────────────────────────────────────

const KITSU_API_URL = 'https://kitsu.io/api/edge';

// Jikan API 代理处理函数
async function handleJikanProxy(pathname, searchParams, request, env, origin) {
  const targetUrl = `${JIKAN_API_URL}${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;

  // 检查缓存（Jikan数据缓存24小时）
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, { method: 'GET' });
  if (request.method === 'GET') {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Cache', 'HIT');
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  const headers = {
    'User-Agent': 'ANISpace/1.0 (https://anispaceee.github.io)',
    'Accept': 'application/json',
  };

  const res = await fetch(targetUrl, { method: 'GET', headers });

  const resHeaders = new Headers();
  resHeaders.set('Content-Type', 'application/json');
  resHeaders.set('X-Cache', 'MISS');
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

  const responseBody = await res.text();

  // 缓存 GET 请求（24小时，与Jikan官方缓存一致）
  if (request.method === 'GET' && res.ok) {
    const cacheResponse = new Response(responseBody, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
    try { await cache.put(cacheKey, cacheResponse); } catch {}
  }

  return new Response(responseBody, {
    status: res.status,
    headers: resHeaders,
  });
}

// trace.moe API 代理处理函数
async function handleTraceMoeProxy(pathname, searchParams, request, env, origin) {
  const targetUrl = `${TRACEMOE_API_URL}${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;

  const headers = {
    'User-Agent': 'ANISpace/1.0 (https://anispaceee.github.io)',
    'Accept': 'application/json',
  };

  // 如果是POST请求（上传图片），需要透传body
  const fetchOptions = { method: request.method, headers };
  if (request.method === 'POST') {
    const contentType = request.headers.get('Content-Type');
    if (contentType) headers['Content-Type'] = contentType;
    fetchOptions.body = await request.arrayBuffer();
  }

  const res = await fetch(targetUrl, fetchOptions);

  const resHeaders = new Headers();
  resHeaders.set('Content-Type', 'application/json');
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

  return new Response(await res.text(), {
    status: res.status,
    headers: resHeaders,
  });
}

// Kitsu API 代理处理函数
async function handleKitsuProxy(pathname, searchParams, request, env, origin) {
  const targetUrl = `${KITSU_API_URL}${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;

  // 检查缓存
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, { method: 'GET' });
  if (request.method === 'GET') {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Cache', 'HIT');
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  const headers = {
    'User-Agent': 'ANISpace/1.0 (https://anispaceee.github.io)',
    'Accept': 'application/vnd.api+json',
  };

  const res = await fetch(targetUrl, { method: 'GET', headers });

  const resHeaders = new Headers();
  resHeaders.set('Content-Type', 'application/vnd.api+json');
  resHeaders.set('X-Cache', 'MISS');
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

  const responseBody = await res.text();

  // 缓存 GET 请求（1小时）
  if (request.method === 'GET' && res.ok) {
    const cacheResponse = new Response(responseBody, {
      status: res.status,
      headers: {
        'Content-Type': 'application/vnd.api+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
    try { await cache.put(cacheKey, cacheResponse); } catch {}
  }

  return new Response(responseBody, {
    status: res.status,
    headers: resHeaders,
  });
}

async function handleHikarinagiProxy(pathname, searchParams, request, env, origin) {
  const targetUrl = `${HIKARINAGI_API_URL}${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;

  // 检查缓存
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, { method: 'GET' });
  if (request.method === 'GET') {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Cache', 'HIT');
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  const headers = {
    'User-Agent': 'ANISpace/1.0',
    'Accept': 'application/json',
  };

  // 透传 Authorization 头（如有 hikari_access_token）
  const authHeader = request.headers.get('Authorization');
  if (authHeader) headers['Authorization'] = authHeader;

  const fetchOptions = { method: request.method, headers };

  if (request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || 'application/json';
    headers['Content-Type'] = contentType;
    fetchOptions.body = await request.text();
  }

  const res = await fetch(targetUrl, fetchOptions);

  const resHeaders = new Headers();
  resHeaders.set('Content-Type', 'application/json');
  resHeaders.set('X-Cache', 'MISS');
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

  const responseBody = await res.text();

  // 缓存 GET 请求（5分钟）
  if (request.method === 'GET' && res.ok) {
    const cacheResponse = new Response(responseBody, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
    try { await cache.put(cacheKey, cacheResponse); } catch {}
  }

  return new Response(responseBody, {
    status: res.status,
    headers: resHeaders,
  });
}

async function handleAnibtProxy(pathname, searchParams, request, env, origin) {
  const targetUrl = `${ANIBT_API_URL}${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;

  // 检查缓存
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('X-Cache', 'HIT');
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
    return new Response(cached.body, { status: cached.status, headers });
  }

  // 转发请求
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'ANISpace/1.0',
        'Accept': 'application/json',
      },
    });

    const responseBody = await res.text();
    const resHeaders = new Headers();
    resHeaders.set('Content-Type', 'application/json');
    resHeaders.set('X-Cache', 'MISS');
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

    // 缓存响应（seasons: 10分钟, groups: 5分钟）
    if (res.ok) {
      const ttl = pathname.includes('/seasons/') ? 600 : 300;
      const cacheResponse = new Response(responseBody, {
        status: res.status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${ttl}`,
        },
      });
      try { await cache.put(cacheKey, cacheResponse); } catch {}
    }

    return new Response(responseBody, {
      status: res.status,
      headers: resHeaders,
    });
  } catch (err) {
    return jsonResponse({ error: 'AniBT 代理失败: ' + err.message }, 502, origin);
  }
}

// ─── wenku8 轻小说代理 ──────────────────────────────────────

const WENKU8_CSV_URL = 'https://raw.githubusercontent.com/mojimoon/wenku8/main/out/merged.csv';

/**
 * 从 GBK 编码的 Response 中解码文本
 */
async function decodeGbk(response) {
  const buffer = await response.arrayBuffer();
  return new TextDecoder('gbk').decode(buffer);
}

/**
 * 解析 CSV 行（处理引号内的逗号）
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * 缓存辅助：检查并返回缓存响应，或执行 fetchFn 并缓存结果
 */
async function cachedFetch(cacheKey, ttl, fetchFn, origin) {
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('X-Cache', 'HIT');
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
    return new Response(cached.body, { status: cached.status, headers });
  }

  const result = await fetchFn();

  if (result.status >= 200 && result.status < 300) {
    const body = await result.text();
    const cacheResponse = new Response(body, {
      status: result.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    try { await cache.put(cacheKey, cacheResponse); } catch {}

    const resHeaders = new Headers();
    resHeaders.set('Content-Type', 'application/json; charset=utf-8');
    resHeaders.set('X-Cache', 'MISS');
    resHeaders.set('Cache-Control', `public, max-age=${ttl}`);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));
    return new Response(body, { status: result.status, headers: resHeaders });
  }

  return result;
}

async function handleWenku8Proxy(pathname, searchParams, request, env, origin) {
  try {
    // Route 1: /search?q=xxx — 搜索轻小说
    if (pathname === '/search') {
      const q = searchParams.get('q');
      if (!q) return jsonResponse({ error: '缺少 q 参数' }, 400, origin);

      const cacheKey = new Request(`wenku8:search:${q.toLowerCase()}`, { method: 'GET' });

      return cachedFetch(cacheKey, 600, async () => {
        // 获取 CSV（缓存 1 小时）
        const csvCacheKey = new Request(WENKU8_CSV_URL, { method: 'GET' });
        const cache = caches.default;
        let csvText;
        const csvCached = await cache.match(csvCacheKey);
        if (csvCached) {
          csvText = await csvCached.text();
        } else {
          const csvRes = await fetch(WENKU8_CSV_URL, {
            headers: { 'User-Agent': 'ANISpace/1.0' },
          });
          if (!csvRes.ok) {
            return jsonResponse({ error: '获取 wenku8 CSV 失败' }, 502, origin);
          }
          csvText = await csvRes.text();
          const csvCacheResponse = new Response(csvText, {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Cache-Control': 'public, max-age=3600',
            },
          });
          try { await cache.put(csvCacheKey, csvCacheResponse); } catch {}
        }

        // 解析 CSV
        const lines = csvText.split('\n').filter(l => l.trim());
        const header = parseCsvLine(lines[0]);
        const qLower = q.toLowerCase();
        const results = [];

        for (let i = 1; i < lines.length; i++) {
          const fields = parseCsvLine(lines[i]);
          if (fields.length < 10) continue;

          const main = fields[8] || '';
          const alt = fields[9] || '';

          if (main.toLowerCase().includes(qLower) || alt.toLowerCase().includes(qLower)) {
            results.push({
              author: fields[0] || '',
              downloadUrl: fields[1] || '',
              volume: fields[2] || '',
              dlLabel: fields[3] || '',
              dlPwd: fields[4] || '',
              dlRemark: fields[6] || '',
              novelLink: fields[7] || '',
              main,
              alt,
            });
          }
        }

        return jsonResponse(results, 200, origin);
      }, origin);
    }

    // Route 2: /chapters?bookId=xxx — 获取章节列表
    if (pathname === '/chapters') {
      const bookId = searchParams.get('bookId');
      if (!bookId) return jsonResponse({ error: '缺少 bookId 参数' }, 400, origin);

      const cacheKey = new Request(`wenku8:chapters:${bookId}`, { method: 'GET' });

      return cachedFetch(cacheKey, 1800, async () => {
        // 获取书籍页面以找到章节索引 URL
        const bookPageUrl = `https://www.wenku8.net/book/${bookId}.htm`;
        const bookPageRes = await fetch(bookPageUrl, {
          headers: { 'User-Agent': 'ANISpace/1.0' },
        });
        if (!bookPageRes.ok) {
          return jsonResponse({ error: '获取书籍页面失败' }, 502, origin);
        }
        const bookPageHtml = await decodeGbk(bookPageRes);

        // 提取标题和作者
        const titleMatch = bookPageHtml.match(/<title>([^<]+)<\/title>/);
        const title = titleMatch ? titleMatch[1].replace(/ - 文库轻小说$/, '').trim() : '';
        const authorMatch = bookPageHtml.match(/作者[：:]\s*<a[^>]*>([^<]+)<\/a>/);
        const author = authorMatch ? authorMatch[1].trim() : '';

        // 从书籍页面中提取章节索引 URL
        const indexUrlMatch = bookPageHtml.match(/href="(\/novel\/\d+\/\d+\/index\.htm)"/);
        if (!indexUrlMatch) {
          return jsonResponse({ error: '无法找到章节索引页面' }, 404, origin);
        }
        const indexUrl = `https://www.wenku8.net${indexUrlMatch[1]}`;

        // 获取章节索引页面
        const indexRes = await fetch(indexUrl, {
          headers: { 'User-Agent': 'ANISpace/1.0' },
        });
        if (!indexRes.ok) {
          return jsonResponse({ error: '获取章节索引页面失败' }, 502, origin);
        }
        const indexHtml = await decodeGbk(indexRes);

        // 解析章节表格
        const volumes = [];
        let currentVolume = null;
        // 匹配所有 <tr> 行
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
        let trMatch;

        while ((trMatch = trRegex.exec(indexHtml)) !== null) {
          const rowContent = trMatch[1];
          // 提取所有 <td> 中的内容
          const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
          let tdMatch;
          let hasChapterLinks = false;

          while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
            const cellContent = tdMatch[1].trim();
            const linkMatch = cellContent.match(/<a\s+href="([^"]*)"[^>]*>([^<]+)<\/a>/);

            if (linkMatch) {
              // 章节链接
              hasChapterLinks = true;
              const chapterUrl = linkMatch[1].startsWith('http')
                ? linkMatch[1]
                : `${indexUrl.replace(/index\.htm$/, '')}${linkMatch[1]}`;
              const chapterIdMatch = chapterUrl.match(/(\d+)\.htm$/);
              const chapterId = chapterIdMatch ? chapterIdMatch[1] : '';

              if (currentVolume) {
                currentVolume.chapters.push({
                  id: chapterId,
                  title: linkMatch[2].trim(),
                  url: chapterUrl,
                });
              }
            } else {
              // 可能是卷标题（没有链接的 td）
              const volName = cellContent.replace(/<[^>]+>/g, '').trim();
              if (volName && !hasChapterLinks) {
                currentVolume = { name: volName, chapters: [] };
                volumes.push(currentVolume);
              }
            }
          }
        }

        return jsonResponse({ bookId, title, author, volumes }, 200, origin);
      }, origin);
    }

    // Route 3: /content?chapterUrl=xxx — 获取章节内容
    if (pathname === '/content') {
      const chapterUrl = searchParams.get('chapterUrl');
      if (!chapterUrl) return jsonResponse({ error: '缺少 chapterUrl 参数' }, 400, origin);

      // 安全检查：只允许 wenku8.net 域名
      try {
        const parsed = new URL(chapterUrl);
        if (!parsed.hostname.endsWith('wenku8.net')) {
          return jsonResponse({ error: '不允许的域名' }, 403, origin);
        }
      } catch {
        return jsonResponse({ error: '无效的 chapterUrl' }, 400, origin);
      }

      const cacheKey = new Request(`wenku8:content:${chapterUrl}`, { method: 'GET' });

      return cachedFetch(cacheKey, 3600, async () => {
        const res = await fetch(chapterUrl, {
          headers: { 'User-Agent': 'ANISpace/1.0' },
        });
        if (!res.ok) {
          return jsonResponse({ error: '获取章节内容失败' }, 502, origin);
        }
        const html = await decodeGbk(res);

        // 提取标题
        const titleMatch = html.match(/<div\s+id="title"[^>]*>([^<]+)<\/div>/);
        const title = titleMatch ? titleMatch[1].trim() : '';

        // 提取内容：从 <div id="content"> 中获取
        const contentMatch = html.match(/<div\s+id="content"[^>]*>([\s\S]*?)<\/div>/);
        let content = '';
        if (contentMatch) {
          content = contentMatch[1]
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/gi, '<img src="$1" alt="" style="max-width:100%;border-radius:6px;margin:8px auto;display:block" />')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/gi, '$1')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
          // 将换行分隔的文本转为段落
          const paragraphs = content.split(/\n+/).filter(p => p.trim());
          content = paragraphs.map(p => {
            const trimmed = p.trim();
            if (trimmed.startsWith('<img')) return trimmed;
            return `<p>${trimmed}</p>`;
          }).join('');
        }

        return jsonResponse({ title, content }, 200, origin);
      }, origin);
    }

    return jsonResponse({ error: '未知的 wenku8 路由' }, 404, origin);
  } catch (err) {
    return jsonResponse({ error: 'wenku8 代理失败: ' + err.message }, 502, origin);
  }
}

// ─── Bangumi OAuth token 交换 ────────────────────────────────

async function handleBangumiToken(code, redirectUri, env) {
  if (!env.BANGUMI_CLIENT_ID || !env.BANGUMI_CLIENT_SECRET) {
    return { error: 'Bangumi OAuth 环境变量未配置' };
  }
  const clientId = env.BANGUMI_CLIENT_ID.trim();
  const clientSecret = env.BANGUMI_CLIENT_SECRET.trim();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(BANGUMI_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ANISpace/1.0',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return { error: tokenData.error_description || 'Bangumi 授权失败' };
  }

  // 获取用户信息
  const userRes = await fetch(`${BANGUMI_API_URL}/user/${tokenData.user_id}`, {
    headers: {
      'User-Agent': 'ANISpace/1.0',
      'Accept': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
  });

  const userData = await userRes.json();

  // 校验 Bangumi 用户 ID 是否存在
  const bangumiUserId = userData.id || tokenData.user_id;
  if (!bangumiUserId) {
    return { error: 'Bangumi 用户信息获取失败' };
  }

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    user_id: tokenData.user_id,
    user: {
      id: bangumiUserId,
      username: userData.username || '',
      nickname: userData.nickname || userData.username || '',
      avatar: userData.avatar?.large || userData.avatar?.medium || '',
      sign: userData.sign || '',
      bio: userData.bio || '',
    },
  };
}

// ─── GitHub OAuth token 交换 ─────────────────────────────────

async function handleGithubToken(code, redirectUri, env) {
  // 验证环境变量
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    console.error('Missing env vars:', {
      hasClientId: !!env.GITHUB_CLIENT_ID,
      hasClientSecret: !!env.GITHUB_CLIENT_SECRET,
      clientIdLen: env.GITHUB_CLIENT_ID?.length,
      clientSecretLen: env.GITHUB_CLIENT_SECRET?.length,
    });
    return { error: 'GitHub OAuth 环境变量未配置' };
  }

  // 清理环境变量值（去除可能的换行/空格）
  const clientId = env.GITHUB_CLIENT_ID.trim();
  const clientSecret = env.GITHUB_CLIENT_SECRET.trim();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  const tokenText = await tokenRes.text();
  let tokenData;
  try {
    tokenData = JSON.parse(tokenText);
  } catch {
    return { error: `GitHub 返回非 JSON 响应 (HTTP ${tokenRes.status}): ${tokenText.substring(0, 200)}` };
  }

  if (!tokenData.access_token) {
    return { error: tokenData.error_description || tokenData.error || 'GitHub 授权失败' };
  }

  // 获取用户信息（GitHub 要求 User-Agent 头，否则返回 403）
  const userRes = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
      'User-Agent': 'ANISpace/1.0',
    },
  });
  const userText = await userRes.text();
  let userData;
  try { userData = JSON.parse(userText); } catch { userData = {} }

  // 校验 GitHub 用户 ID 是否存在
  if (!userData.id) {
    return { error: `GitHub 用户信息获取失败 (HTTP ${userRes.status}): ${userText.substring(0, 200)}` };
  }

  // 获取用户邮箱
  let email = userData.email || '';
  if (!email) {
    try {
      const emailRes = await fetch(`${GITHUB_API_URL}/user/emails`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${tokenData.access_token}`,
          'User-Agent': 'ANISpace/1.0',
        },
      });
      const emailText = await emailRes.text();
      const emails = JSON.parse(emailText);
      if (Array.isArray(emails)) {
        const primary = emails.find(e => e.primary);
        if (primary) email = primary.email;
      }
    } catch {}
  }

  return {
    access_token: tokenData.access_token,
    user: {
      id: userData.id,
      username: userData.login || '',
      nickname: userData.name || userData.login || '',
      avatar: userData.avatar_url || '',
      bio: userData.bio || '',
      email,
    },
  };
}

// ─── Worker API 路由处理 ─────────────────────────────────────

async function handleApiRoutes(pathname, request, env, origin, context) {
  const method = request.method;
  const jwtSecret = env.JWT_SECRET || 'anispace-jwt-secret-change-me';

  // ─── 邀请制系统 API ───

  function generateInviteCode(length = 8) {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      code += charset[array[i] % charset.length];
    }
    return code;
  }

  // POST /api/invites — 管理员生成邀请码（需管理员权限）
  if (method === 'POST' && pathname === '/api/invites') {
    const adminUser = await getAdminUser(request, env);
    if (!adminUser) return jsonResponse({ error: '需要管理员权限' }, 403, origin);

    try {
      const body = await request.json();
      const { type = 'year', max_uses = 1, expires_at, permissions = ['social.post', 'social.comment', 'social.follow', 'social.message', 'social.world'] } = body;

      // 根据类型自动计算过期时间
      let finalExpiresAt = expires_at;
      if (type === 'year') {
        finalExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      } else if (type === 'permanent') {
        finalExpiresAt = null; // 永久不过期
      }

      let code;
      let retries = 10;
      do {
        code = generateInviteCode(8);
        const existing = await env.DB.prepare('SELECT id FROM invites WHERE code = ?').bind(code).first();
        if (!existing) break;
        retries--;
      } while (retries > 0);

      if (!code) {
        return jsonResponse({ error: '生成邀请码失败' }, 500, origin);
      }

      const result = await env.DB.prepare(
        'INSERT INTO invites (code, creator_id, max_uses, used_count, type, status, expires_at, permissions, created_at, updated_at) VALUES (?, ?, ?, 0, ?, "active", ?, ?, datetime("now"), datetime("now"))'
      ).bind(code, adminUser.userId, max_uses, type, finalExpiresAt, JSON.stringify(permissions)).run();

      const invite = await env.DB.prepare('SELECT * FROM invites WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(invite, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '生成邀请码失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/invites/claim — 用户使用邀请码（需认证）
  if (method === 'POST' && pathname === '/api/invites/claim') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { code } = body;
      if (!code) return jsonResponse({ error: '缺少邀请码' }, 400, origin);

      const invite = await env.DB.prepare('SELECT * FROM invites WHERE code = ? AND status = "active"').bind(code.toUpperCase()).first();
      if (!invite) return jsonResponse({ error: '邀请码无效或已过期' }, 404, origin);

      // 检查是否已过期
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        await env.DB.prepare("UPDATE invites SET status = 'expired', updated_at = datetime('now') WHERE id = ?").bind(invite.id).run();
        return jsonResponse({ error: '邀请码已过期' }, 400, origin);
      }

      // 检查使用次数
      if (invite.used_count >= invite.max_uses) {
        await env.DB.prepare("UPDATE invites SET status = 'used', updated_at = datetime('now') WHERE id = ?").bind(invite.id).run();
        return jsonResponse({ error: '邀请码已用完' }, 400, origin);
      }

      // 检查用户是否已使用过邀请码
      const existingRelation = await env.DB.prepare('SELECT id FROM invite_relations WHERE invitee_id = ?').bind(authUser.userId).first();
      if (existingRelation) {
        return jsonResponse({ error: '您已使用过邀请码' }, 400, origin);
      }

      // 解析权限列表
      const permissions = JSON.parse(invite.permissions || '[]');

      // 开始事务
      const batch = [];

      // 更新邀请码使用次数
      batch.push(env.DB.prepare('UPDATE invites SET used_count = used_count + 1, updated_at = datetime("now") WHERE id = ?').bind(invite.id));

      // 创建邀请关系记录
      batch.push(env.DB.prepare(
        'INSERT INTO invite_relations (invite_id, inviter_id, invitee_id, granted_permissions, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
      ).bind(invite.id, invite.creator_id, authUser.userId, JSON.stringify(permissions)));

      // 授予权限
      for (const permission of permissions) {
        batch.push(env.DB.prepare(
          'INSERT OR IGNORE INTO user_permissions (user_id, permission, granted_by, expires_at, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
        ).bind(authUser.userId, permission, invite.creator_id, invite.expires_at));
      }

      // 更新用户邀请计数
      if (invite.creator_id > 0) {
        batch.push(env.DB.prepare('UPDATE users SET invite_count = invite_count + 1 WHERE id = ?').bind(invite.creator_id));
      }

      // 获得邀请码即成为管理员
      batch.push(env.DB.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').bind(authUser.userId));

      await env.DB.batch(batch);

      // 如果使用次数已达上限，标记为已使用
      if (invite.used_count + 1 >= invite.max_uses) {
        await env.DB.prepare("UPDATE invites SET status = 'used', updated_at = datetime('now') WHERE id = ?").bind(invite.id).run();
      }

      return jsonResponse({
        success: true,
        message: '邀请码验证成功，已解锁社交功能',
        granted_permissions: permissions,
        invite_code: code,
        inviter_id: invite.creator_id,
        expires_at: invite.expires_at,
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '使用邀请码失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/permissions/check — 检查用户是否拥有指定权限（需认证）
  if (method === 'GET' && pathname === '/api/permissions/check') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const permission = new URL(request.url).searchParams.get('permission');
    if (!permission) return jsonResponse({ error: '缺少 permission 参数' }, 400, origin);

    const hasPermission = await hasSocialPermission(env, authUser.userId, permission);

    // 获取过期时间（管理员无过期时间，普通用户从权限表查）
    let expiresAt = null;
    let grantedBy = null;
    if (hasPermission) {
      const user = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(authUser.userId).first();
      if (!user?.is_admin) {
        const perm = await env.DB.prepare('SELECT expires_at, granted_by FROM user_permissions WHERE user_id = ? AND permission = ?').bind(authUser.userId, permission).first();
        expiresAt = perm?.expires_at || null;
        grantedBy = perm?.granted_by || null;
      }
    }

    return jsonResponse({
      has_permission: hasPermission,
      permission,
      expires_at: expiresAt,
      granted_by: grantedBy,
    }, 200, origin);
  }

  // GET /api/permissions — 获取当前用户的权限列表（需认证）
  if (method === 'GET' && pathname === '/api/permissions') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const user = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?').bind(authUser.userId).first();
    const isAdmin = user && user.is_admin;

    const permissions = await env.DB.prepare(
      'SELECT * FROM user_permissions WHERE user_id = ?'
    ).bind(authUser.userId).all();

    const validPermissions = permissions.results.filter(p => !p.expires_at || new Date(p.expires_at) > new Date());

    return jsonResponse({ permissions: validPermissions, is_admin: !!isAdmin }, 200, origin);
  }

  // POST /api/permissions/grant — 授予权限（需管理员权限）
  if (method === 'POST' && pathname === '/api/permissions/grant') {
    const adminUser = await getAdminUser(request, env);
    if (!adminUser) return jsonResponse({ error: '需要管理员权限' }, 403, origin);

    try {
      const body = await request.json();
      const { user_id, permission, expires_at } = body;
      if (!user_id || !permission) return jsonResponse({ error: '缺少 user_id 或 permission' }, 400, origin);

      await env.DB.prepare(
        'INSERT OR REPLACE INTO user_permissions (user_id, permission, granted_by, expires_at, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
      ).bind(user_id, permission, adminUser.userId, expires_at).run();

      return jsonResponse({ success: true, message: '权限已授予' }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '授予权限失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/permissions/revoke — 撤销权限（需管理员权限）
  if (method === 'DELETE' && pathname === '/api/permissions/revoke') {
    const adminUser = await getAdminUser(request, env);
    if (!adminUser) return jsonResponse({ error: '需要管理员权限' }, 403, origin);

    try {
      const body = await request.json();
      const { user_id, permission } = body;
      if (!user_id || !permission) return jsonResponse({ error: '缺少 user_id 或 permission' }, 400, origin);

      await env.DB.prepare('DELETE FROM user_permissions WHERE user_id = ? AND permission = ?').bind(user_id, permission).run();

      return jsonResponse({ success: true, message: '权限已撤销' }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '撤销权限失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/invites — 获取邀请码列表（需管理员权限）
  if (method === 'GET' && pathname === '/api/invites') {
    const adminUser = await getAdminUser(request, env);
    if (!adminUser) return jsonResponse({ error: '需要管理员权限' }, 403, origin);

    try {
      const invites = await env.DB.prepare(
        'SELECT * FROM invites ORDER BY created_at DESC'
      ).all();
      return jsonResponse(invites.results, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取邀请码列表失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/invites/:id — 获取邀请码详情（需管理员权限）
  const inviteDetailMatch = pathname.match(/^\/api\/invites\/(\d+)$/);
  if (inviteDetailMatch && method === 'GET') {
    const adminUser = await getAdminUser(request, env);
    if (!adminUser) return jsonResponse({ error: '需要管理员权限' }, 403, origin);

    const inviteId = Number(inviteDetailMatch[1]);
    const invite = await env.DB.prepare('SELECT * FROM invites WHERE id = ?').bind(inviteId).first();
    if (!invite) return jsonResponse({ error: '邀请码不存在' }, 404, origin);

    return jsonResponse(invite, 200, origin);
  }

  // PUT /api/invites/:id — 更新邀请码状态（需管理员权限）
  if (inviteDetailMatch && method === 'PUT') {
    const adminUser = await getAdminUser(request, env);
    if (!adminUser) return jsonResponse({ error: '需要管理员权限' }, 403, origin);

    try {
      const inviteId = Number(inviteDetailMatch[1]);
      const body = await request.json();
      const { status } = body;

      if (!status || !['active', 'revoked', 'used', 'expired'].includes(status)) {
        return jsonResponse({ error: '无效的状态值' }, 400, origin);
      }

      await env.DB.prepare(
        "UPDATE invites SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(status, inviteId).run();

      const updated = await env.DB.prepare('SELECT * FROM invites WHERE id = ?').bind(inviteId).first();
      return jsonResponse(updated, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新邀请码失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/auth/login — OAuth 登录（查找/创建用户，返回 JWT）
  if (method === 'POST' && pathname === '/api/auth/login') {
    try {
      const body = await request.json();
      const { provider, providerId, username, name, avatar, bio } = body;
      if (!provider || !providerId) {
        return jsonResponse({ error: '缺少 provider 或 providerId' }, 400, origin);
      }

      // 查找已有用户
      let user = await env.DB.prepare(
        'SELECT * FROM users WHERE provider = ? AND provider_id = ?'
      ).bind(provider, String(providerId)).first();

      if (user) {
        // 更新 last_login
        await env.DB.prepare(
          'UPDATE users SET last_login = datetime(\'now\'), username = ?, name = ?, avatar = ?, bio = ? WHERE id = ?'
        ).bind(username || user.username, name || user.name, avatar || user.avatar, bio || user.bio, user.id).run();
        user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
      } else {
        // 创建新用户（is_admin 默认为 0，非管理员）
        const result = await env.DB.prepare(
          'INSERT INTO users (provider, provider_id, username, name, avatar, bio, join_date, created_at, last_login, is_admin) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'), datetime(\'now\'), 0)'
        ).bind(provider, String(providerId), username || '', name || '', avatar || '', bio || '').run();
        user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(result.meta.last_row_id).first();
      }

      const token = await signJWT({ userId: user.id, provider: user.provider, providerId: user.provider_id }, jwtSecret);
      return jsonResponse({ token, user: formatUser(user) }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '登录失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/auth/register — 邮箱注册
  if (method === 'POST' && pathname === '/api/auth/register') {
    try {
      const body = await request.json();
      const { email, username, password, turnstileToken } = body;

      // 校验必填字段
      if (!email || !username || !password) {
        return jsonResponse({ error: '邮箱、用户名和密码不能为空' }, 400, origin);
      }

      // 校验邮箱格式
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(email) || email.length > 254) {
        return jsonResponse({ error: '邮箱格式不正确' }, 400, origin);
      }

      // 校验用户名：2-20 字符，字母/数字/下划线/中文
      const usernameRe = /^[\w\u4e00-\u9fff]{2,20}$/;
      if (!usernameRe.test(username)) {
        return jsonResponse({ error: '用户名需2-20字符，仅允许字母、数字、下划线、中文' }, 400, origin);
      }

      // 校验密码：8-64 字符，至少包含字母和数字
      if (password.length < 8 || password.length > 64 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
        return jsonResponse({ error: '密码需8-64字符，至少包含字母和数字' }, 400, origin);
      }

      // Turnstile 验证
      const turnstileValid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY);
      if (!turnstileValid) {
        return jsonResponse({ error: '人机验证失败，请重试' }, 400, origin);
      }

      // 检查邮箱是否已注册
      const existingEmail = await env.DB.prepare(
        'SELECT id FROM users WHERE provider = ? AND provider_id = ?'
      ).bind('email', email.toLowerCase()).first();
      if (existingEmail) {
        return jsonResponse({ error: '该邮箱已被注册' }, 400, origin);
      }

      // 检查用户名是否已占用
      const existingUsername = await env.DB.prepare(
        'SELECT id FROM users WHERE username = ?'
      ).bind(username).first();
      if (existingUsername) {
        return jsonResponse({ error: '该用户名已被占用' }, 400, origin);
      }

      // 哈希密码
      const passwordHash = await hashPassword(password);

      // 创建用户
      const result = await env.DB.prepare(
        'INSERT INTO users (provider, provider_id, username, name, avatar, bio, password_hash, email_verified, join_date, last_login, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime(\'now\'), datetime(\'now\'), 0)'
      ).bind('email', email.toLowerCase(), username, username, '', '', passwordHash).run();

      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(result.meta.last_row_id).first();

      const token = await signJWT({ userId: user.id, provider: 'email', providerId: email.toLowerCase() }, jwtSecret);
      return jsonResponse({ token, user: formatUser(user) }, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '注册失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/auth/login-email — 邮箱密码登录
  if (method === 'POST' && pathname === '/api/auth/login-email') {
    try {
      const body = await request.json();
      const { email, password, turnstileToken } = body;

      if (!email || !password) {
        return jsonResponse({ error: '邮箱和密码不能为空' }, 400, origin);
      }

      // Turnstile 验证
      const turnstileValid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY);
      if (!turnstileValid) {
        return jsonResponse({ error: '人机验证失败，请重试' }, 400, origin);
      }

      // 查找用户
      const user = await env.DB.prepare(
        'SELECT * FROM users WHERE provider = ? AND provider_id = ?'
      ).bind('email', email.toLowerCase()).first();

      if (!user || !user.password_hash) {
        return jsonResponse({ error: '邮箱或密码错误' }, 401, origin);
      }

      // 验证密码
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return jsonResponse({ error: '邮箱或密码错误' }, 401, origin);
      }

      // 更新 last_login
      await env.DB.prepare(
        'UPDATE users SET last_login = datetime(\'now\') WHERE id = ?'
      ).bind(user.id).run();

      const token = await signJWT({ userId: user.id, provider: 'email', providerId: user.provider_id }, jwtSecret);
      return jsonResponse({ token, user: formatUser(user) }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '登录失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/users/:id — 获取用户公开信息
  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch) {
    const userId = Number(userMatch[1]);
    if (method === 'GET') {
      const user = await env.DB.prepare('SELECT id, username, name, avatar, bio, sign, join_date, following_count, follower_count FROM users WHERE id = ?').bind(userId).first();
      if (!user) return jsonResponse({ error: '用户不存在' }, 404, origin);
      // 动态计算好友数
      const friendCount = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM friend_requests WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'accepted'"
      ).bind(userId, userId).first();
      user.friend_count = friendCount?.cnt || 0;
      return jsonResponse(user, 200, origin);
    }

    // PUT /api/users/:id — 更新用户信息（需认证，仅本人可编辑）
    if (method === 'PUT') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
      if (authUser.userId !== userId) return jsonResponse({ error: '无权编辑他人资料' }, 403, origin);

      try {
        const body = await request.json();
        const { name, avatar, bio, sign, gender, birthday, preferences } = body;
        await env.DB.prepare(
          'UPDATE users SET name = ?, avatar = ?, bio = ?, sign = ?, gender = ?, birthday = ?, preferences = ? WHERE id = ?'
        ).bind(
          name ?? null, avatar ?? null, bio ?? null, sign ?? null,
          gender ?? null, birthday ?? null,
          preferences ? JSON.stringify(preferences) : null,
          userId
        ).run();
        const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        return jsonResponse(updated, 200, origin);
      } catch (err) {
        return jsonResponse({ error: '更新失败: ' + err.message }, 500, origin);
      }
    }
  }

  // GET /api/users/:id/profile — 获取用户公开信息（受隐私设置控制）
  const userProfileMatch = pathname.match(/^\/api\/users\/(\d+)\/profile$/);
  if (userProfileMatch && method === 'GET') {
    const userId = Number(userProfileMatch[1]);
    const user = await env.DB.prepare('SELECT id, username, name, avatar, bio, sign, join_date, allow_profile_view, allow_comments_public, follower_count, following_count FROM users WHERE id = ?').bind(userId).first();
    if (!user) return jsonResponse({ error: '用户不存在' }, 404, origin);
    // auto_enrich 列可能尚未创建，单独查询以避免主查询失败
    try {
      const enrichRow = await env.DB.prepare('SELECT auto_enrich FROM users WHERE id = ?').bind(userId).first();
      user.auto_enrich = enrichRow?.auto_enrich ?? 1;
    } catch {
      user.auto_enrich = 1;
    }
    // filter_nsfw 列可能尚未创建，单独查询以避免主查询失败
    try {
      const nsfwRow = await env.DB.prepare('SELECT filter_nsfw FROM users WHERE id = ?').bind(userId).first();
      user.filter_nsfw = nsfwRow?.filter_nsfw ?? 1;
    } catch {
      user.filter_nsfw = 1;
    }
    // 动态计算好友数
    const friendCount = await env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM friend_requests WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'accepted'"
    ).bind(userId, userId).first();
    user.friend_count = friendCount?.cnt || 0;
    const authUser = await getAuthUser(request, env);
    if (!authUser || authUser.userId !== userId) {
      if (!user.allow_profile_view) {
        // 只返回基本信息，不返回标记等详细数据
        return jsonResponse({ id: user.id, name: user.name, avatar: user.avatar, friend_count: user.friend_count, private: true }, 200, origin);
      }
    }
    return jsonResponse(user, 200, origin);
  }

  // PUT /api/users/:id/settings — 更新用户隐私设置
  const userSettingsMatch = pathname.match(/^\/api\/users\/(\d+)\/settings$/);
  if (userSettingsMatch && method === 'PUT') {
    const userId = Number(userSettingsMatch[1]);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (authUser.userId !== userId) return jsonResponse({ error: '无权限' }, 403, origin);
    try {
      const body = await request.json();
      const { allow_profile_view, allow_comments_public, auto_enrich, filter_nsfw } = body;
      // auto_enrich / filter_nsfw 列可能尚未创建，先尝试更新，失败则只更新其他字段
      try {
        await env.DB.prepare('UPDATE users SET allow_profile_view = ?, allow_comments_public = ?, auto_enrich = ?, filter_nsfw = ? WHERE id = ?')
          .bind(allow_profile_view ?? 1, allow_comments_public ?? 1, auto_enrich ?? 1, filter_nsfw ?? 1, userId).run();
      } catch {
        await env.DB.prepare('UPDATE users SET allow_profile_view = ?, allow_comments_public = ? WHERE id = ?')
          .bind(allow_profile_view ?? 1, allow_comments_public ?? 1, userId).run();
      }
      return jsonResponse({ success: true }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/users/:id/comments — 获取用户对条目的评论
  const userCommentsMatch = pathname.match(/^\/api\/users\/(\d+)\/comments$/);
  if (userCommentsMatch && method === 'GET') {
    const userId = Number(userCommentsMatch[1]);
    const user = await env.DB.prepare('SELECT allow_comments_public FROM users WHERE id = ?').bind(userId).first();
    if (!user) return jsonResponse({ error: '用户不存在' }, 404, origin);
    const authUser = await getAuthUser(request, env);
    if (!authUser || authUser.userId !== userId) {
      if (!user.allow_comments_public) {
        return jsonResponse({ error: '该用户已设置评论不公开' }, 403, origin);
      }
    }
    const comments = await env.DB.prepare(
      'SELECT r.id, r.subject_id, r.subject_type, r.score, r.content, r.created_at, c.subject_name, c.subject_image FROM ratings r LEFT JOIN collections c ON r.subject_id = c.subject_id AND r.user_id = c.user_id WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 20'
    ).bind(userId).all();
    return jsonResponse(comments.results || [], 200, origin);
  }

  // ── 条目评论 API ──

  // GET /api/subjects/:id/comments — 获取条目评论列表
  const subjectCommentsMatch = pathname.match(/^\/api\/subjects\/(\d+)\/comments$/);
  if (subjectCommentsMatch && method === 'GET') {
    const subjectId = Number(subjectCommentsMatch[1]);
    const reqUrl = new URL(request.url);
    const sort = reqUrl.searchParams.get('sort') || 'latest';
    const limit = Math.min(parseInt(reqUrl.searchParams.get('limit') || '50'), 100);
    const orderClause = sort === 'hottest' ? 'ORDER BY sc.likes DESC, sc.created_at DESC' : 'ORDER BY sc.created_at DESC';
    const comments = await env.DB.prepare(
      `SELECT sc.id, sc.subject_id, sc.user_id, sc.content, sc.likes, sc.created_at, u.name AS username, u.avatar FROM subject_comments sc JOIN users u ON sc.user_id = u.id WHERE sc.subject_id = ? ${orderClause} LIMIT ?`
    ).bind(subjectId, limit).all();
    return jsonResponse(comments.results || [], 200, origin);
  }

  // POST /api/subjects/:id/comments — 发表条目评论（需认证）
  if (subjectCommentsMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未登录' }, 401, origin);
    const subjectId = Number(subjectCommentsMatch[1]);
    const body = await request.json();
    const content = (body.content || '').trim();
    if (!content) return jsonResponse({ error: '评论内容不能为空' }, 400, origin);
    if (content.length > 2000) return jsonResponse({ error: '评论内容过长' }, 400, origin);
    await env.DB.prepare(
      'INSERT INTO subject_comments (subject_id, user_id, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
    ).bind(subjectId, authUser.userId, content).run();
    const comment = await env.DB.prepare(
      'SELECT sc.id, sc.subject_id, sc.user_id, sc.content, sc.likes, sc.created_at, u.name AS username, u.avatar FROM subject_comments sc JOIN users u ON sc.user_id = u.id WHERE sc.subject_id = ? ORDER BY sc.created_at DESC LIMIT 1'
    ).bind(subjectId).first();
    return jsonResponse(comment, 201, origin);
  }

  // DELETE /api/subjects/:subjectId/comments/:commentId — 删除条目评论（需认证，仅本人）
  const subjectCommentDeleteMatch = pathname.match(/^\/api\/subjects\/(\d+)\/comments\/(\d+)$/);
  if (subjectCommentDeleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未登录' }, 401, origin);
    const commentId = Number(subjectCommentDeleteMatch[2]);
    const existing = await env.DB.prepare('SELECT user_id FROM subject_comments WHERE id = ?').bind(commentId).first();
    if (!existing) return jsonResponse({ error: '评论不存在' }, 404, origin);
    if (existing.user_id !== authUser.userId) return jsonResponse({ error: '无权删除' }, 403, origin);
    await env.DB.prepare('DELETE FROM subject_comments WHERE id = ?').bind(commentId).run();
    return jsonResponse({ success: true }, 200, origin);
  }

  // POST /api/subjects/:subjectId/comments/:commentId/like — 点赞条目评论
  const subjectCommentLikeMatch = pathname.match(/^\/api\/subjects\/(\d+)\/comments\/(\d+)\/like$/);
  if (subjectCommentLikeMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未登录' }, 401, origin);
    const commentId = Number(subjectCommentLikeMatch[2]);
    await env.DB.prepare('UPDATE subject_comments SET likes = likes + 1 WHERE id = ?').bind(commentId).run();
    return jsonResponse({ success: true }, 200, origin);
  }

  // ─── 集数进度 API ───

  // GET /api/subjects/:id/progress — 获取当前用户在某条目的所有集数进度
  const subjectProgressMatch = pathname.match(/^\/api\/subjects\/(\d+)\/progress$/);
  if (subjectProgressMatch && method === 'GET') {
    const subjectId = Number(subjectProgressMatch[1]);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ progress: [] }, 200, origin);
    try {
      const rows = await env.DB.prepare(
        'SELECT episode_id, episode_sort, status, is_private, comment, created_at, updated_at FROM episode_progress WHERE user_id = ? AND subject_id = ? ORDER BY episode_sort'
      ).bind(authUser.userId, subjectId).all();
      return jsonResponse({ progress: rows.results || [] }, 200, origin);
    } catch (err) {
      // 表可能尚未创建（migration 未执行）
      return jsonResponse({ progress: [] }, 200, origin);
    }
  }

  // POST /api/subjects/:id/progress — 标记/更新单集进度（upsert）
  if (subjectProgressMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未登录' }, 401, origin);
    const subjectId = Number(subjectProgressMatch[1]);
    try {
      const body = await request.json();
      const { episode_id, episode_sort, status, comment, is_private } = body;
      if (!episode_id) return jsonResponse({ error: '缺少 episode_id' }, 400, origin);

      // status 为空/null → 取消标记（删除）
      if (!status) {
        await env.DB.prepare(
          'DELETE FROM episode_progress WHERE user_id = ? AND episode_id = ?'
        ).bind(authUser.userId, episode_id).run();
        return jsonResponse({ ok: true, deleted: true }, 200, origin);
      }

      // upsert：INSERT OR REPLACE
      await env.DB.prepare(
        `INSERT INTO episode_progress (user_id, subject_id, episode_id, episode_sort, status, is_private, comment, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(user_id, episode_id) DO UPDATE SET
           status = excluded.status,
           episode_sort = excluded.episode_sort,
           is_private = excluded.is_private,
           comment = excluded.comment,
           updated_at = datetime('now')`
      ).bind(
        authUser.userId, subjectId, episode_id,
        episode_sort || 0, status || 'watched',
        is_private ? 1 : 0, comment || ''
      ).run();

      const row = await env.DB.prepare(
        'SELECT episode_id, episode_sort, status, is_private, comment, updated_at FROM episode_progress WHERE user_id = ? AND episode_id = ?'
      ).bind(authUser.userId, episode_id).first();

      return jsonResponse({ ok: true, progress: row }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '操作失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/subjects/:id/progress/:episodeId — 取消单集标记
  const subjectProgressDeleteMatch = pathname.match(/^\/api\/subjects\/(\d+)\/progress\/(\d+)$/);
  if (subjectProgressDeleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未登录' }, 401, origin);
    const episodeId = Number(subjectProgressDeleteMatch[2]);
    try {
      await env.DB.prepare(
        'DELETE FROM episode_progress WHERE user_id = ? AND episode_id = ?'
      ).bind(authUser.userId, episodeId).run();
      return jsonResponse({ ok: true }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '操作失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/subjects/:id/progress/batch — 批量操作
  const subjectProgressBatchMatch = pathname.match(/^\/api\/subjects\/(\d+)\/progress\/batch$/);
  if (subjectProgressBatchMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未登录' }, 401, origin);
    const subjectId = Number(subjectProgressBatchMatch[1]);
    try {
      const body = await request.json();
      const { action, episodes } = body;

      if (action === 'clear_all') {
        const result = await env.DB.prepare(
          'DELETE FROM episode_progress WHERE user_id = ? AND subject_id = ?'
        ).bind(authUser.userId, subjectId).run();
        return jsonResponse({ ok: true, affected: result.meta?.changes || 0 }, 200, origin);
      }

      if (action === 'mark_all_watched' && Array.isArray(episodes)) {
        let affected = 0;
        for (const ep of episodes) {
          if (!ep.episode_id) continue;
          await env.DB.prepare(
            `INSERT INTO episode_progress (user_id, subject_id, episode_id, episode_sort, status, is_private, comment, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'watched', 0, '', datetime('now'), datetime('now'))
             ON CONFLICT(user_id, episode_id) DO UPDATE SET
               status = 'watched',
               episode_sort = excluded.episode_sort,
               updated_at = datetime('now')`
          ).bind(authUser.userId, subjectId, ep.episode_id, ep.episode_sort || 0).run();
          affected++;
        }
        return jsonResponse({ ok: true, affected }, 200, origin);
      }

      return jsonResponse({ error: '无效的批量操作' }, 400, origin);
    } catch (err) {
      return jsonResponse({ error: '批量操作失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/subjects/:id/ep-comments — 获取某条目的公开集评
  const subjectEpCommentsMatch = pathname.match(/^\/api\/subjects\/(\d+)\/ep-comments$/);
  if (subjectEpCommentsMatch && method === 'GET') {
    const subjectId = Number(subjectEpCommentsMatch[1]);
    const reqUrl = new URL(request.url);
    const episodeIdFilter = reqUrl.searchParams.get('episode_id');
    const limit = Math.min(parseInt(reqUrl.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(reqUrl.searchParams.get('offset') || '0');
    try {
      let query, params;
      if (episodeIdFilter) {
        query = `SELECT ep.id, ep.episode_id, ep.episode_sort, ep.comment, ep.is_private, ep.created_at, ep.user_id, u.name AS username, u.avatar
                 FROM episode_progress ep JOIN users u ON ep.user_id = u.id
                 WHERE ep.subject_id = ? AND ep.episode_id = ? AND ep.is_private = 0 AND ep.comment != ''
                 ORDER BY ep.episode_sort ASC, ep.created_at DESC LIMIT ? OFFSET ?`;
        params = [subjectId, Number(episodeIdFilter), limit, offset];
      } else {
        query = `SELECT ep.id, ep.episode_id, ep.episode_sort, ep.comment, ep.is_private, ep.created_at, ep.user_id, u.name AS username, u.avatar
                 FROM episode_progress ep JOIN users u ON ep.user_id = u.id
                 WHERE ep.subject_id = ? AND ep.is_private = 0 AND ep.comment != ''
                 ORDER BY ep.episode_sort ASC, ep.created_at DESC LIMIT ? OFFSET ?`;
        params = [subjectId, limit, offset];
      }
      const rows = await env.DB.prepare(query).bind(...params).all();
      return jsonResponse({ comments: rows.results || [], has_more: (rows.results || []).length >= limit }, 200, origin);
    } catch (err) {
      return jsonResponse({ comments: [], has_more: false }, 200, origin);
    }
  }

  // GET /api/users/:id/activity — 获取用户活跃度数据（用于热力图）
  const userActivityMatch = pathname.match(/^\/api\/users\/(\d+)\/activity$/);
  if (userActivityMatch && method === 'GET') {
    const userId = Number(userActivityMatch[1]);
    const user = await env.DB.prepare('SELECT allow_profile_view FROM users WHERE id = ?').bind(userId).first();
    if (!user) return jsonResponse({ error: '用户不存在' }, 404, origin);
    const authUser = await getAuthUser(request, env);
    if (!authUser || authUser.userId !== userId) {
      if (!user.allow_profile_view) {
        return jsonResponse({ error: '该用户已设置隐私保护' }, 403, origin);
      }
    }
    // 获取过去一年的每日活跃度
    const rows = await env.DB.prepare(
      "SELECT DATE(created_at) as date, COUNT(*) as count FROM collections WHERE user_id = ? AND created_at >= DATE('now', '-1 year') GROUP BY DATE(created_at) ORDER BY date"
    ).bind(userId).all();
    return jsonResponse(rows.results || [], 200, origin);
  }

  // GET /api/users/search?q=keyword&limit=10 — 搜索用户
  if (method === 'GET' && pathname === '/api/users/search') {
    const q = new URL(request.url).searchParams.get('q') || '';
    const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 10));
    if (!q) return jsonResponse({ error: '缺少搜索关键词' }, 400, origin);

    const users = await env.DB.prepare(
      'SELECT id, username, name, avatar, bio, sign, join_date, following_count, follower_count FROM users WHERE username LIKE ? OR name LIKE ? LIMIT ?'
    ).bind(`%${q}%`, `%${q}%`, limit).all();

    return jsonResponse(users.results, 200, origin);
  }

  // POST /api/uploads — 图片上传代理（通过 ImgBB API，隐藏 API Key）
  if (method === 'POST' && pathname === '/api/uploads') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    if (!env.IMGBB_API_KEY) {
      return jsonResponse({ error: 'ImgBB API Key 未配置' }, 500, origin);
    }

    try {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) return jsonResponse({ error: '缺少 file 字段' }, 400, origin);

      // 转发到 ImgBB API
      const imgbbForm = new FormData();
      imgbbForm.append('image', file);

      const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_API_KEY}`, {
        method: 'POST',
        body: imgbbForm,
      });

      const imgbbData = await imgbbRes.json();
      if (!imgbbData.success) {
        return jsonResponse({ error: 'ImgBB 上传失败', detail: imgbbData.error?.message || '未知错误' }, 502, origin);
      }

      return jsonResponse({
        url: imgbbData.data.url,
        display_url: imgbbData.data.display_url,
        thumb: imgbbData.data.thumb?.url,
        delete_url: imgbbData.data.delete_url,
        width: imgbbData.data.width,
        height: imgbbData.data.height,
      }, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '上传失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/posts — 帖子列表（分页 + 板块筛选 + 排序）
  if (method === 'GET' && pathname === '/api/posts') {
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 20));
    const category = sp.get('category') || '';
    const sort = sp.get('sort') || 'latest';
    const offset = (page - 1) * limit;

    let whereClause = '';
    const bindParams = [];
    const authorId = sp.get('authorId');
    if (category) {
      whereClause = 'WHERE p.category = ?';
      bindParams.push(category);
    }
    if (authorId) {
      whereClause = whereClause ? whereClause + ' AND p.author_id = ?' : 'WHERE p.author_id = ?';
      bindParams.push(Number(authorId));
    }

    // 排序：latest=按时间, hot=综合热度, replies=按回复数
    let orderClause = 'ORDER BY p.created_at DESC';
    if (sort === 'hot') {
      // 综合热度 = views*1 + likes*3 + replies*5 + 时间衰减
      orderClause = 'ORDER BY (p.views + p.likes * 3 + p.replies_count * 5) DESC, p.created_at DESC';
    } else if (sort === 'replies') {
      orderClause = 'ORDER BY p.replies_count DESC, p.created_at DESC';
    }

    const posts = await env.DB.prepare(
      `SELECT p.*, u.name AS author_name, u.avatar AS author_avatar FROM posts p JOIN users u ON p.author_id = u.id ${whereClause} ${orderClause} LIMIT ? OFFSET ?`
    ).bind(...bindParams, limit, offset).all();

    // 解析 JSON 字段
    const parsedPosts = posts.results.map(p => ({
      ...p,
      tags: safeJsonParse(p.tags, []),
      images: safeJsonParse(p.images, []),
    }));

    const countSql = whereClause
      ? `SELECT COUNT(*) AS total FROM posts p ${whereClause}`
      : 'SELECT COUNT(*) AS total FROM posts';
    const countResult = await env.DB.prepare(countSql).bind(...bindParams).first();
    return jsonResponse({
      posts: parsedPosts,
      pagination: { page, limit, total: countResult.total },
    }, 200, origin);
  }

  // POST /api/posts — 创建帖子（需认证 + 社交权限）
  if (method === 'POST' && pathname === '/api/posts') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (!await hasSocialPermission(env, authUser.userId, 'social.post')) return jsonResponse({ error: '社交功能未解锁，请使用邀请码' }, 403, origin);

    try {
      const body = await request.json();
      const { title, content, category, tags, images } = body;
      if (!title || !content) return jsonResponse({ error: '标题和内容不能为空' }, 400, origin);

      const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : '[]';
      const imagesJson = images && images.length > 0 ? JSON.stringify(images) : '[]';

      const result = await env.DB.prepare(
        'INSERT INTO posts (author_id, title, content, category, tags, images, likes, replies_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, datetime(\'now\'), datetime(\'now\'))'
      ).bind(authUser.userId, title, content, category || null, tagsJson, imagesJson).run();

      const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse({
        ...post,
        tags: safeJsonParse(post.tags, []),
        images: safeJsonParse(post.images, []),
      }, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建帖子失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/posts/:id — 获取帖子详情及回复（浏览量+1）
  const postMatch = pathname.match(/^\/api\/posts\/(\d+)$/);
  if (postMatch && method === 'GET') {
    const postId = Number(postMatch[1]);
    const post = await env.DB.prepare(
      'SELECT p.*, u.name AS author_name, u.avatar AS author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?'
    ).bind(postId).first();
    if (!post) return jsonResponse({ error: '帖子不存在' }, 404, origin);

    // 浏览量递增
    await env.DB.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').bind(postId).run();

    // 回复排序
    const url = new URL(request.url);
    const replySort = url.searchParams.get('reply_sort') || 'oldest';
    let orderClause = 'r.created_at ASC';
    if (replySort === 'newest') orderClause = 'r.created_at DESC';
    if (replySort === 'hot') orderClause = 'like_count DESC, r.created_at ASC';

    const replies = await env.DB.prepare(
      `SELECT r.*, u.name AS author_name, u.avatar AS author_avatar, (SELECT COUNT(*) FROM likes l WHERE l.reply_id = r.id) AS like_count FROM replies r JOIN users u ON r.author_id = u.id WHERE r.post_id = ? ORDER BY ${orderClause}`
    ).bind(postId).all();

    // 查询当前用户对回复的点赞状态
    const authUser = await getAuthUser(request, env);
    const authUserId = authUser ? authUser.userId : null;
    let replyLikeMap = {};
    if (authUserId && replies.results.length > 0) {
      const replyIds = replies.results.map(r => r.id);
      const placeholders = replyIds.map(() => '?').join(',');
      const userLikes = await env.DB.prepare(
        `SELECT reply_id FROM likes WHERE user_id = ? AND reply_id IN (${placeholders})`
      ).bind(authUserId, ...replyIds).all();
      userLikes.results.forEach(l => { replyLikeMap[l.reply_id] = true; });
    }

    // 解析 JSON 字段
    const parsedPost = {
      ...post,
      tags: safeJsonParse(post.tags, []),
      images: safeJsonParse(post.images, []),
    };

    // 解析回复
    const parsedReplies = replies.results.map(r => ({
      ...r,
      likes: r.like_count || 0,
      is_liked: !!replyLikeMap[r.id],
    }));

    return jsonResponse({ ...parsedPost, views: (post.views || 0) + 1, replies: parsedReplies }, 200, origin);
  }

  // POST /api/posts/:id/replies — 添加回复（需认证 + 社交权限）
  const replyMatch = pathname.match(/^\/api\/posts\/(\d+)\/replies$/);
  if (replyMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (!await hasSocialPermission(env, authUser.userId, 'social.comment')) return jsonResponse({ error: '社交功能未解锁，请使用邀请码' }, 403, origin);
    const postId = Number(replyMatch[1]);

    try {
      const body = await request.json();
      const { content, parent_id } = body;
      if (!content) return jsonResponse({ error: '回复内容不能为空' }, 400, origin);

      // 校验 parent_id：如果提供了，验证它属于同一帖子
      if (parent_id) {
        const parentReply = await env.DB.prepare(
          'SELECT post_id FROM replies WHERE id = ?'
        ).bind(parent_id).first();
        if (!parentReply || parentReply.post_id !== postId) {
          return jsonResponse({ error: '无效的父回复' }, 400, origin);
        }
      }

      const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
      if (!post) return jsonResponse({ error: '帖子不存在' }, 404, origin);

      await env.DB.prepare(
        'INSERT INTO replies (post_id, author_id, content, parent_id, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
      ).bind(postId, authUser.userId, content, parent_id || null).run();

      await env.DB.prepare(
        'UPDATE posts SET replies_count = replies_count + 1, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(postId).run();

      return jsonResponse({ message: '回复成功' }, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '回复失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/posts/:id/like — 切换点赞（需认证 + 社交权限）
  const likeMatch = pathname.match(/^\/api\/posts\/(\d+)\/like$/);
  if (likeMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (!await hasSocialPermission(env, authUser.userId, 'social.post')) return jsonResponse({ error: '社交功能未解锁，请使用邀请码' }, 403, origin);
    const postId = Number(likeMatch[1]);

    const existing = await env.DB.prepare(
      'SELECT id FROM likes WHERE user_id = ? AND post_id = ?'
    ).bind(authUser.userId, postId).first();

    if (existing) {
      // 取消点赞
      await env.DB.prepare('DELETE FROM likes WHERE id = ?').bind(existing.id).run();
      await env.DB.prepare('UPDATE posts SET likes = MAX(likes - 1, 0) WHERE id = ?').bind(postId).run();
      return jsonResponse({ liked: false }, 200, origin);
    } else {
      // 点赞
      await env.DB.prepare(
        'INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, datetime(\'now\'))'
      ).bind(authUser.userId, postId).run();
      await env.DB.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').bind(postId).run();
      return jsonResponse({ liked: true }, 200, origin);
    }
  }

  // POST /api/replies/:id/like — 切换回复点赞（需认证）
  const replyLikeMatch = pathname.match(/^\/api\/replies\/(\d+)\/like$/);
  if (replyLikeMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const replyId = Number(replyLikeMatch[1]);

    const existing = await env.DB.prepare(
      'SELECT id FROM likes WHERE user_id = ? AND reply_id = ?'
    ).bind(authUser.userId, replyId).first();

    if (existing) {
      await env.DB.prepare('DELETE FROM likes WHERE id = ?').bind(existing.id).run();
      return jsonResponse({ liked: false }, 200, origin);
    } else {
      await env.DB.prepare(
        "INSERT INTO likes (user_id, reply_id, created_at) VALUES (?, ?, datetime('now'))"
      ).bind(authUser.userId, replyId).run();
      return jsonResponse({ liked: true }, 200, origin);
    }
  }

  // DELETE /api/posts/:id — 删除帖子（仅作者可删）
  const deleteMatch = pathname.match(/^\/api\/posts\/(\d+)$/);
  if (deleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const postId = Number(deleteMatch[1]);

    const post = await env.DB.prepare('SELECT author_id FROM posts WHERE id = ?').bind(postId).first();
    if (!post) return jsonResponse({ error: '帖子不存在' }, 404, origin);
    if (post.author_id !== authUser.userId) return jsonResponse({ error: '无权删除他人帖子' }, 403, origin);

    try {
      // 级联删除：先删回复和点赞，再删帖子
      await env.DB.prepare('DELETE FROM replies WHERE post_id = ?').bind(postId).run();
      await env.DB.prepare('DELETE FROM likes WHERE post_id = ?').bind(postId).run();
      await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(postId).run();
      return jsonResponse({ message: '已删除' }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '删除失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/collections — 获取用户收藏列表
  if (method === 'GET' && pathname === '/api/collections') {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return jsonResponse({ error: '缺少 userId 参数' }, 400, origin);

    const collections = await env.DB.prepare(
      'SELECT * FROM collections WHERE user_id = ? ORDER BY updated_at DESC'
    ).bind(Number(userId)).all();

    return jsonResponse(collections.results, 200, origin);
  }

  // POST /api/collections — 新增/更新收藏（需认证）
  if (method === 'POST' && pathname === '/api/collections') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { subjectId, subjectType, subjectName, subjectImage, status, rating, comment } = body;
      if (!subjectId) return jsonResponse({ error: '缺少 subjectId' }, 400, origin);

      await env.DB.prepare(
        'INSERT OR REPLACE INTO collections (user_id, subject_id, subject_type, subject_name, subject_image, status, rating, comment, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'
      ).bind(authUser.userId, subjectId, subjectType || null, subjectName || null, subjectImage || null, status || null, rating ?? null, comment || null).run();

      const collection = await env.DB.prepare(
        'SELECT * FROM collections WHERE user_id = ? AND subject_id = ?'
      ).bind(authUser.userId, subjectId).first();

      // 异步触发条目全量入库（不阻塞响应，受用户 auto_enrich 开关控制）
      try {
        const userRow = await env.DB.prepare('SELECT auto_enrich FROM users WHERE id = ?').bind(authUser.userId).first();
        if (userRow?.auto_enrich !== 0) {
          context.waitUntil(bangumiEnrich.enrichSubject(env, Number(subjectId)));
        }
      } catch {
        // auto_enrich 列可能尚未创建（migration 未执行），默认开启入库
        context.waitUntil(bangumiEnrich.enrichSubject(env, Number(subjectId)));
      }

      return jsonResponse(collection, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '收藏操作失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/collections/:subjectId — 删除收藏（需认证）
  const collectionDeleteMatch = pathname.match(/^\/api\/collections\/(\d+)$/);
  if (collectionDeleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const subjectId = Number(collectionDeleteMatch[1]);
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId || Number(userId) !== authUser.userId) {
      return jsonResponse({ error: '无权操作' }, 403, origin);
    }

    await env.DB.prepare(
      'DELETE FROM collections WHERE user_id = ? AND subject_id = ?'
    ).bind(authUser.userId, subjectId).run();

    return jsonResponse({ message: '已删除收藏' }, 200, origin);
  }

  // ─── Bangumi 收藏同步 API ───

  // POST /api/bangumi-sync/collection — 同步单个条目到 Bangumi
  if (pathname === '/api/bangumi-sync/collection' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    try {
      const body = await request.json();
      const { subjectId, status, rating, comment, bangumiToken } = body;
      if (!subjectId || !status || !bangumiToken) {
        return jsonResponse({ error: '缺少参数' }, 400, origin);
      }
      const result = await bangumiSync.syncToBangumi(bangumiToken, subjectId, status, rating, comment);
      return jsonResponse(result, result.ok ? 200 : 400, origin);
    } catch (err) {
      return jsonResponse({ error: '同步失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/bangumi-sync/import — 从 Bangumi 导入所有收藏
  if (pathname === '/api/bangumi-sync/import' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    try {
      const body = await request.json();
      const { bangumiToken, bangumiUsername } = body;
      if (!bangumiToken || !bangumiUsername) {
        return jsonResponse({ error: '缺少 Bangumi token 或用户名' }, 400, origin);
      }
      // 拉取 Bangumi 收藏
      const fetchResult = await bangumiSync.fetchBangumiCollections(bangumiToken, bangumiUsername);
      if (fetchResult.error) {
        return jsonResponse({ error: fetchResult.error }, 400, origin);
      }
      // 导入到本地数据库
      const importResult = await bangumiSync.importBangumiCollections(env, authUser.userId, fetchResult.collections);
      return jsonResponse({
        ok: true,
        imported: importResult.imported,
        skipped: importResult.skipped,
        total: fetchResult.collections.length,
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '导入失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/follows/:userId — 切换关注（需认证 + 社交权限）
  const followMatch = pathname.match(/^\/api\/follows\/(\d+)$/);
  if (followMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (!await hasSocialPermission(env, authUser.userId, 'social.follow')) return jsonResponse({ error: '社交功能未解锁，请使用邀请码' }, 403, origin);
    const targetUserId = Number(followMatch[1]);

    try {
      const body = await request.json();
      const fromUserId = body.fromUserId;
      if (!fromUserId || fromUserId !== authUser.userId) {
        return jsonResponse({ error: '无权操作' }, 403, origin);
      }

      const existing = await env.DB.prepare(
        'SELECT id FROM follows WHERE from_user_id = ? AND to_user_id = ?'
      ).bind(authUser.userId, targetUserId).first();

      if (existing) {
        // M-4: 批量原子操作 — 取消关注 + 更新计数
        const batch = [
          env.DB.prepare('DELETE FROM follows WHERE id = ?').bind(existing.id),
          env.DB.prepare('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?').bind(authUser.userId),
          env.DB.prepare('UPDATE users SET follower_count = MAX(0, follower_count - 1) WHERE id = ?').bind(targetUserId),
        ];
        await env.DB.batch(batch);
        return jsonResponse({ following: false }, 200, origin);
      } else {
        // M-4: 批量原子操作 — 关注 + 更新计数
        const batch = [
          env.DB.prepare(
            'INSERT INTO follows (from_user_id, to_user_id, created_at) VALUES (?, ?, datetime(\'now\'))'
          ).bind(authUser.userId, targetUserId),
          env.DB.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').bind(authUser.userId),
          env.DB.prepare('UPDATE users SET follower_count = follower_count + 1 WHERE id = ?').bind(targetUserId),
        ];
        await env.DB.batch(batch);
        return jsonResponse({ following: true }, 200, origin);
      }
    } catch (err) {
      return jsonResponse({ error: '关注操作失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/follows/:userId — 获取关注/粉丝列表
  if (followMatch && method === 'GET') {
    const userId = Number(followMatch[1]);

    const following = await env.DB.prepare(
      'SELECT u.id, u.username, u.name, u.avatar, u.sign FROM follows f JOIN users u ON f.to_user_id = u.id WHERE f.from_user_id = ?'
    ).bind(userId).all();

    const followers = await env.DB.prepare(
      'SELECT u.id, u.username, u.name, u.avatar, u.sign FROM follows f JOIN users u ON f.from_user_id = u.id WHERE f.to_user_id = ?'
    ).bind(userId).all();

    return jsonResponse({ following: following.results, followers: followers.results }, 200, origin);
  }

  // DELETE /api/follows/:userId — 取消关注（需认证）
  if (followMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const targetUserId = Number(followMatch[1]);

    const existing = await env.DB.prepare(
      'SELECT id FROM follows WHERE from_user_id = ? AND to_user_id = ?'
    ).bind(authUser.userId, targetUserId).first();

    if (!existing) return jsonResponse({ error: '未关注该用户' }, 404, origin);

    const batch = [
      env.DB.prepare('DELETE FROM follows WHERE id = ?').bind(existing.id),
      env.DB.prepare('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?').bind(authUser.userId),
      env.DB.prepare('UPDATE users SET follower_count = MAX(0, follower_count - 1) WHERE id = ?').bind(targetUserId),
    ];
    await env.DB.batch(batch);
    return jsonResponse({ message: '已取消关注' }, 200, origin);
  }

  // GET /api/follows/following — 获取我关注的人（需认证）
  if (method === 'GET' && pathname === '/api/follows/following') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const following = await env.DB.prepare(
      'SELECT u.id, u.username, u.name, u.avatar, u.bio, u.sign FROM follows f JOIN users u ON f.to_user_id = u.id WHERE f.from_user_id = ?'
    ).bind(authUser.userId).all();

    return jsonResponse(following.results, 200, origin);
  }

  // GET /api/follows/followers — 获取关注我的人（需认证）
  if (method === 'GET' && pathname === '/api/follows/followers') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const followers = await env.DB.prepare(
      'SELECT u.id, u.username, u.name, u.avatar, u.bio, u.sign FROM follows f JOIN users u ON f.from_user_id = u.id WHERE f.to_user_id = ?'
    ).bind(authUser.userId).all();

    return jsonResponse(followers.results, 200, origin);
  }

  // ── Friends API ──

  // POST /api/friends/request — 发送好友请求（需认证）
  if (method === 'POST' && pathname === '/api/friends/request') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { to_user_id, message } = body;
      if (!to_user_id) return jsonResponse({ error: '缺少 to_user_id' }, 400, origin);
      if (Number(to_user_id) === authUser.userId) return jsonResponse({ error: '不能向自己发送好友请求' }, 400, origin);

      // 检查目标用户是否存在
      const targetUser = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(Number(to_user_id)).first();
      if (!targetUser) return jsonResponse({ error: '目标用户不存在' }, 404, origin);

      // 检查是否已有好友请求（双向检查）
      const existing = await env.DB.prepare(
        'SELECT id, status FROM friend_requests WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)'
      ).bind(authUser.userId, Number(to_user_id), Number(to_user_id), authUser.userId).first();
      if (existing) {
        if (existing.status === 'pending') return jsonResponse({ error: '已有待处理的好友请求' }, 409, origin);
        if (existing.status === 'accepted') return jsonResponse({ error: '已经是好友' }, 409, origin);
        // rejected 状态可以重新发送，先删除旧记录
        await env.DB.prepare('DELETE FROM friend_requests WHERE id = ?').bind(existing.id).run();
      }

      const result = await env.DB.prepare(
        "INSERT INTO friend_requests (from_user_id, to_user_id, status, message, created_at, updated_at) VALUES (?, ?, 'pending', ?, datetime('now'), datetime('now'))"
      ).bind(authUser.userId, Number(to_user_id), message || '').run();

      const requestId = result.meta.last_row_id;

      // 创建通知
      await env.DB.prepare(
        "INSERT INTO notifications (user_id, type, from_user_id, target_type, target_id, content, is_read, created_at) VALUES (?, 'friend_request', ?, 'friend_request', ?, ?, 0, datetime('now'))"
      ).bind(Number(to_user_id), authUser.userId, requestId, message || '').run();

      const friendRequest = await env.DB.prepare('SELECT * FROM friend_requests WHERE id = ?').bind(requestId).first();
      return jsonResponse(friendRequest, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '发送好友请求失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/friends/requests/sent — 获取发出的好友请求（需认证，需在 /requests 之前匹配）
  if (method === 'GET' && pathname === '/api/friends/requests/sent') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const requests = await env.DB.prepare(
      "SELECT fr.*, u.name AS to_user_name, u.avatar AS to_user_avatar, u.username AS to_user_username FROM friend_requests fr JOIN users u ON fr.to_user_id = u.id WHERE fr.from_user_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC"
    ).bind(authUser.userId).all();

    return jsonResponse(requests.results, 200, origin);
  }

  // GET /api/friends/requests/received — 获取收到的好友请求（需认证，需在 /requests 之前匹配）
  if (method === 'GET' && pathname === '/api/friends/requests/received') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const requests = await env.DB.prepare(
      "SELECT fr.*, u.name AS from_user_name, u.avatar AS from_user_avatar, u.username AS from_user_username FROM friend_requests fr JOIN users u ON fr.from_user_id = u.id WHERE fr.to_user_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC"
    ).bind(authUser.userId).all();

    return jsonResponse(requests.results, 200, origin);
  }

  // GET /api/friends/requests — 获取收到的好友请求（需认证，兼容旧路径）
  if (method === 'GET' && pathname === '/api/friends/requests') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const requests = await env.DB.prepare(
      "SELECT fr.*, u.name AS from_user_name, u.avatar AS from_user_avatar, u.username AS from_user_username FROM friend_requests fr JOIN users u ON fr.from_user_id = u.id WHERE fr.to_user_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC"
    ).bind(authUser.userId).all();

    return jsonResponse(requests.results, 200, origin);
  }

  // PUT /api/friends/request/:id — 接受/拒绝好友请求（需认证）
  const friendRequestMatch = pathname.match(/^\/api\/friends\/request\/(\d+)$/);
  if (friendRequestMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const requestId = Number(friendRequestMatch[1]);

    try {
      const body = await request.json();
      const { status } = body;
      if (!['accepted', 'rejected'].includes(status)) return jsonResponse({ error: 'status 必须为 accepted 或 rejected' }, 400, origin);

      const friendRequest = await env.DB.prepare('SELECT * FROM friend_requests WHERE id = ?').bind(requestId).first();
      if (!friendRequest) return jsonResponse({ error: '好友请求不存在' }, 404, origin);
      if (friendRequest.to_user_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);
      if (friendRequest.status !== 'pending') return jsonResponse({ error: '该请求已处理' }, 400, origin);

      if (status === 'accepted') {
        // 检查双向关注是否已存在
        const existingFollow1 = await env.DB.prepare(
          'SELECT id FROM follows WHERE from_user_id = ? AND to_user_id = ?'
        ).bind(authUser.userId, friendRequest.from_user_id).first();

        const existingFollow2 = await env.DB.prepare(
          'SELECT id FROM follows WHERE from_user_id = ? AND to_user_id = ?'
        ).bind(friendRequest.from_user_id, authUser.userId).first();

        const batch = [
          env.DB.prepare("UPDATE friend_requests SET status = 'accepted', updated_at = datetime('now') WHERE id = ?").bind(requestId),
        ];

        // 我关注对方（如果尚未关注）
        if (!existingFollow1) {
          batch.push(
            env.DB.prepare("INSERT INTO follows (from_user_id, to_user_id, created_at) VALUES (?, ?, datetime('now'))").bind(authUser.userId, friendRequest.from_user_id),
            env.DB.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').bind(authUser.userId),
            env.DB.prepare('UPDATE users SET follower_count = follower_count + 1 WHERE id = ?').bind(friendRequest.from_user_id),
          );
        }

        // 对方关注我（如果尚未关注）
        if (!existingFollow2) {
          batch.push(
            env.DB.prepare("INSERT INTO follows (from_user_id, to_user_id, created_at) VALUES (?, ?, datetime('now'))").bind(friendRequest.from_user_id, authUser.userId),
            env.DB.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').bind(friendRequest.from_user_id),
            env.DB.prepare('UPDATE users SET follower_count = follower_count + 1 WHERE id = ?').bind(authUser.userId),
          );
        }

        await env.DB.batch(batch);
      } else {
        await env.DB.prepare("UPDATE friend_requests SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").bind(requestId).run();
      }

      const updated = await env.DB.prepare('SELECT * FROM friend_requests WHERE id = ?').bind(requestId).first();
      return jsonResponse(updated, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '处理好友请求失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/friends/status/:userId — 检查与某用户的关系（需认证，需在 DELETE /:userId 之前匹配）
  const friendStatusMatch = pathname.match(/^\/api\/friends\/status\/(\d+)$/);
  if (friendStatusMatch && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const targetUserId = Number(friendStatusMatch[1]);

    // 检查好友关系
    const friendRequest = await env.DB.prepare(
      'SELECT status, from_user_id FROM friend_requests WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)'
    ).bind(authUser.userId, targetUserId, targetUserId, authUser.userId).first();

    // 检查关注关系
    const isFollowing = !!(await env.DB.prepare(
      'SELECT id FROM follows WHERE from_user_id = ? AND to_user_id = ?'
    ).bind(authUser.userId, targetUserId).first());

    const isFollower = !!(await env.DB.prepare(
      'SELECT id FROM follows WHERE from_user_id = ? AND to_user_id = ?'
    ).bind(targetUserId, authUser.userId).first());

    let requestStatus = 'none';
    let isFriend = false;
    let requestId = null;
    if (friendRequest) {
      requestId = friendRequest.id;
      if (friendRequest.status === 'accepted') {
        isFriend = true;
        requestStatus = 'accepted';
      } else if (friendRequest.status === 'pending') {
        requestStatus = friendRequest.from_user_id === authUser.userId ? 'pending_sent' : 'pending_received';
      } else if (friendRequest.status === 'rejected') {
        requestStatus = 'rejected';
      }
    }

    return jsonResponse({ isFriend, isFollowing, isFollower, requestStatus, requestId }, 200, origin);
  }

  // DELETE /api/friends/:userId — 删除好友（需认证）
  const friendDeleteMatch = pathname.match(/^\/api\/friends\/(\d+)$/);
  if (friendDeleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const targetUserId = Number(friendDeleteMatch[1]);

    const friendRequest = await env.DB.prepare(
      "SELECT id FROM friend_requests WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)) AND status = 'accepted'"
    ).bind(authUser.userId, targetUserId, targetUserId, authUser.userId).first();

    if (!friendRequest) return jsonResponse({ error: '不是好友关系' }, 404, origin);

    // 删除好友请求记录 + 解除双向关注 + 更新计数
    const batch = [
      env.DB.prepare('DELETE FROM friend_requests WHERE id = ?').bind(friendRequest.id),
    ];

    // 检查并删除 我→对方 的关注
    const follow1 = await env.DB.prepare(
      'SELECT id FROM follows WHERE from_user_id = ? AND to_user_id = ?'
    ).bind(authUser.userId, targetUserId).first();
    if (follow1) {
      batch.push(
        env.DB.prepare('DELETE FROM follows WHERE id = ?').bind(follow1.id),
        env.DB.prepare('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?').bind(authUser.userId),
        env.DB.prepare('UPDATE users SET follower_count = MAX(0, follower_count - 1) WHERE id = ?').bind(targetUserId),
      );
    }

    // 检查并删除 对方→我 的关注
    const follow2 = await env.DB.prepare(
      'SELECT id FROM follows WHERE from_user_id = ? AND to_user_id = ?'
    ).bind(targetUserId, authUser.userId).first();
    if (follow2) {
      batch.push(
        env.DB.prepare('DELETE FROM follows WHERE id = ?').bind(follow2.id),
        env.DB.prepare('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?').bind(targetUserId),
        env.DB.prepare('UPDATE users SET follower_count = MAX(0, follower_count - 1) WHERE id = ?').bind(authUser.userId),
      );
    }

    await env.DB.batch(batch);
    return jsonResponse({ message: '已删除好友' }, 200, origin);
  }

  // GET /api/friends — 获取好友列表（需认证，分页）
  if (method === 'GET' && pathname === '/api/friends') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 20));
    const offset = (page - 1) * limit;

    const friends = await env.DB.prepare(
      "SELECT u.id, u.username, u.name, u.avatar, u.bio, u.sign, u.join_date, u.following_count, u.follower_count, fr.updated_at AS friend_since FROM friend_requests fr JOIN users u ON CASE WHEN fr.from_user_id = ? THEN fr.to_user_id ELSE fr.from_user_id END = u.id WHERE (fr.from_user_id = ? OR fr.to_user_id = ?) AND fr.status = 'accepted' ORDER BY fr.updated_at DESC LIMIT ? OFFSET ?"
    ).bind(authUser.userId, authUser.userId, authUser.userId, limit, offset).all();

    const countResult = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM friend_requests WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'accepted'"
    ).bind(authUser.userId, authUser.userId).first();

    return jsonResponse({
      friends: friends.results,
      pagination: { page, limit, total: countResult.total },
    }, 200, origin);
  }

  // ═══ 用户留言板 API ═══

  // GET /api/user-guestbook/:userId — 获取用户留言板
  const guestbookMatch = pathname.match(/^\/api\/user-guestbook\/(\d+)$/);
  if (guestbookMatch && method === 'GET') {
    const userId = Number(guestbookMatch[1]);
    const user = await env.DB.prepare('SELECT allow_guestbook FROM users WHERE id = ?').bind(userId).first();
    if (!user) return jsonResponse({ error: '用户不存在' }, 404, origin);
    if (!user.allow_guestbook) return jsonResponse({ error: '该用户已关闭留言板' }, 403, origin);

    const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 20));
    const offset = (page - 1) * limit;

    const messages = await env.DB.prepare(
      'SELECT g.id, g.content, g.reply_to_id, g.created_at, u.id AS author_id, u.name AS author_name, u.avatar AS author_avatar FROM user_guestbook g JOIN users u ON g.author_id = u.id WHERE g.user_id = ? ORDER BY g.created_at DESC LIMIT ? OFFSET ?'
    ).bind(userId, limit, offset).all();

    const countResult = await env.DB.prepare('SELECT COUNT(*) AS total FROM user_guestbook WHERE user_id = ?').bind(userId).first();
    return jsonResponse({
      messages: messages.results || [],
      pagination: { page, limit, total: countResult.total },
    }, 200, origin);
  }

  // POST /api/user-guestbook/:userId — 在用户留言板留言（需认证）
  if (guestbookMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = Number(guestbookMatch[1]);
    const user = await env.DB.prepare('SELECT allow_guestbook FROM users WHERE id = ?').bind(userId).first();
    if (!user) return jsonResponse({ error: '用户不存在' }, 404, origin);
    if (!user.allow_guestbook) return jsonResponse({ error: '该用户已关闭留言板' }, 403, origin);

    try {
      const body = await request.json();
      const { content, reply_to_id } = body;
      if (!content || !content.trim()) return jsonResponse({ error: '留言内容不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO user_guestbook (user_id, author_id, content, reply_to_id, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
      ).bind(userId, authUser.userId, content.trim(), reply_to_id || null).run();

      const message = await env.DB.prepare(
        'SELECT g.id, g.content, g.reply_to_id, g.created_at, u.id AS author_id, u.name AS author_name, u.avatar AS author_avatar FROM user_guestbook g JOIN users u ON g.author_id = u.id WHERE g.id = ?'
      ).bind(result.meta.last_row_id).first();
      return jsonResponse(message, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '留言失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/user-guestbook/:userId/:messageId — 删除留言（需认证，仅留言板主人或留言作者可删）
  const guestbookMsgMatch = pathname.match(/^\/api\/user-guestbook\/(\d+)\/(\d+)$/);
  if (guestbookMsgMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = Number(guestbookMsgMatch[1]);
    const messageId = Number(guestbookMsgMatch[2]);

    const message = await env.DB.prepare('SELECT * FROM user_guestbook WHERE id = ?').bind(messageId).first();
    if (!message) return jsonResponse({ error: '留言不存在' }, 404, origin);
    // 仅留言板主人或留言作者可删除
    if (authUser.userId !== message.user_id && authUser.userId !== message.author_id) {
      return jsonResponse({ error: '无权删除' }, 403, origin);
    }

    await env.DB.prepare('DELETE FROM user_guestbook WHERE id = ?').bind(messageId).run();
    return jsonResponse({ message: '已删除' }, 200, origin);
  }

  // PUT /api/users/:id/guestbook-settings — 更新留言板开关（需认证，仅本人）
  const guestbookSettingsMatch = pathname.match(/^\/api\/users\/(\d+)\/guestbook-settings$/);
  if (guestbookSettingsMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = Number(guestbookSettingsMatch[1]);
    if (authUser.userId !== userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    try {
      const body = await request.json();
      const { allow_guestbook } = body;
      if (typeof allow_guestbook !== 'number') return jsonResponse({ error: '参数错误' }, 400, origin);

      await env.DB.prepare('UPDATE users SET allow_guestbook = ? WHERE id = ?').bind(allow_guestbook, userId).run();
      return jsonResponse({ message: '已更新' }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新失败: ' + err.message }, 500, origin);
    }
  }

  // ─── 创作空间 API ───

  // GET /api/creative-notes — 获取当前用户所有笔记（需认证）
  if (method === 'GET' && pathname === '/api/creative-notes') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const result = await env.DB.prepare(
      'SELECT id, user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at FROM creative_notes WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC'
    ).bind(authUser.userId).all();

    const notes = (result.results || []).map(parseNote);
    return jsonResponse({ notes }, 200, origin);
  }

  // POST /api/creative-notes — 新建笔记（需认证）
  if (method === 'POST' && pathname === '/api/creative-notes') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    let body;
    try { body = await request.json(); } catch { return jsonResponse({ error: '请求体无效' }, 400, origin); }

    const { valid, data, error } = validateNoteInput(body);
    if (!valid) return jsonResponse({ error }, 400, origin);

    const result = await env.DB.prepare(
      'INSERT INTO creative_notes (user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
    ).bind(
      authUser.userId,
      data.title,
      serializeBlocks(data.blocks),
      JSON.stringify(data.linked_subject_ids),
      JSON.stringify(data.linked_subjects_snapshot),
      JSON.stringify(data.tags),
      data.is_pinned
    ).run();

    const note = await env.DB.prepare(
      'SELECT id, user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at FROM creative_notes WHERE id = ?'
    ).bind(result.meta.last_row_id).first();

    return jsonResponse(parseNote(note), 201, origin);
  }

  // GET /api/creative-notes/timeline — 感悟时间线（需认证）
  // 注意：此路由必须放在 /:id 路由之前，否则 timeline 会被当成 id 匹配
  if (method === 'GET' && pathname === '/api/creative-notes/timeline') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const ratings = await env.DB.prepare(
      `SELECT r.id, r.subject_id, r.subject_type, r.score, r.content, r.created_at,
              c.subject_name, c.subject_image
       FROM ratings r
       LEFT JOIN collections c ON c.user_id = r.user_id AND c.subject_id = r.subject_id
       WHERE r.user_id = ? AND r.content != ''
       ORDER BY r.created_at DESC
       LIMIT 100`
    ).bind(authUser.userId).all();

    const comments = await env.DB.prepare(
      `SELECT sc.id, sc.subject_id, sc.content, sc.created_at,
              c.subject_name, c.subject_image, c.subject_type
       FROM subject_comments sc
       LEFT JOIN collections c ON c.user_id = sc.user_id AND c.subject_id = sc.subject_id
       WHERE sc.user_id = ?
       ORDER BY sc.created_at DESC
       LIMIT 100`
    ).bind(authUser.userId).all();

    const timeline = [];
    for (const r of (ratings.results || [])) {
      timeline.push(buildTimelineEntry('rating', {
        id: r.id, subject_id: r.subject_id, subject_name: r.subject_name,
        subject_image: r.subject_image, subject_type: r.subject_type,
        score: r.score, content: r.content, created_at: r.created_at,
      }));
    }
    for (const c of (comments.results || [])) {
      timeline.push(buildTimelineEntry('comment', {
        id: c.id, subject_id: c.subject_id, subject_name: c.subject_name,
        subject_image: c.subject_image, subject_type: c.subject_type,
        content: c.content, created_at: c.created_at,
      }));
    }
    timeline.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    return jsonResponse({ timeline }, 200, origin);
  }

  // GET/PUT/DELETE /api/creative-notes/:id — 单条笔记操作（需认证 + 所有权）
  const creativeNoteMatch = pathname.match(/^\/api\/creative-notes\/(\d+)$/);
  if (creativeNoteMatch) {
    const noteId = Number(creativeNoteMatch[1]);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const row = await env.DB.prepare(
      'SELECT id, user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at FROM creative_notes WHERE id = ?'
    ).bind(noteId).first();

    if (!row) return jsonResponse({ error: '笔记不存在' }, 404, origin);
    if (!checkOwnership(authUser, row)) return jsonResponse({ error: '无权操作' }, 403, origin);

    // GET — 详情
    if (method === 'GET') {
      return jsonResponse(parseNote(row), 200, origin);
    }

    // PUT — 更新
    if (method === 'PUT') {
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: '请求体无效' }, 400, origin); }

      const { valid, data, error } = validateNoteInput(body);
      if (!valid) return jsonResponse({ error }, 400, origin);

      await env.DB.prepare(
        'UPDATE creative_notes SET title = ?, blocks = ?, linked_subject_ids = ?, linked_subjects_snapshot = ?, tags = ?, is_pinned = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(
        data.title,
        serializeBlocks(data.blocks),
        JSON.stringify(data.linked_subject_ids),
        JSON.stringify(data.linked_subjects_snapshot),
        JSON.stringify(data.tags),
        data.is_pinned,
        noteId
      ).run();

      const updated = await env.DB.prepare(
        'SELECT id, user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at FROM creative_notes WHERE id = ?'
      ).bind(noteId).first();
      return jsonResponse(parseNote(updated), 200, origin);
    }

    // DELETE — 删除
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM creative_notes WHERE id = ?').bind(noteId).run();
      return jsonResponse({ message: '已删除' }, 200, origin);
    }

    return jsonResponse({ error: '方法不允许' }, 405, origin);
  }

  // PUT /api/users/:id/profile-visibility — 更新发帖/资讯显示开关（需认证，仅本人）
  const profileVisMatch = pathname.match(/^\/api\/users\/(\d+)\/profile-visibility$/);
  if (profileVisMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = Number(profileVisMatch[1]);
    if (authUser.userId !== userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    try {
      const body = await request.json();
      const updates = {};
      if (typeof body.show_posts === 'number') updates.show_posts = body.show_posts;
      if (typeof body.show_news === 'number') updates.show_news = body.show_news;
      if (Object.keys(updates).length === 0) return jsonResponse({ error: '无更新参数' }, 400, origin);

      const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(updates), userId];
      await env.DB.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).bind(...values).run();
      return jsonResponse({ message: '已更新' }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/notifications — 创建通知
  if (method === 'POST' && pathname === '/api/notifications') {
    try {
      const body = await request.json();
      const { userId, type, fromUserId, targetType, targetId, content } = body;
      if (!userId || !type) return jsonResponse({ error: '缺少 userId 或 type' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO notifications (user_id, type, from_user_id, target_type, target_id, content, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, datetime(\'now\'))'
      ).bind(Number(userId), type, fromUserId || 0, targetType || '', targetId || 0, content || '').run();

      const notification = await env.DB.prepare('SELECT * FROM notifications WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(notification, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建通知失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/notifications — 获取用户通知
  if (method === 'GET' && pathname === '/api/notifications') {
    const userId = new URL(request.url).searchParams.get('userId');
    const unreadOnly = new URL(request.url).searchParams.get('unread') === 'true';
    if (!userId) return jsonResponse({ error: '缺少 userId 参数' }, 400, origin);

    let query, params;
    if (unreadOnly) {
      query = 'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC';
      params = [Number(userId)];
    } else {
      query = 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC';
      params = [Number(userId)];
    }
    const notifications = await env.DB.prepare(query).bind(...params).all();
    return jsonResponse(notifications.results, 200, origin);
  }

  // PUT /api/notifications/read — 标记通知已读（需认证）
  if (method === 'PUT' && pathname === '/api/notifications/read') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { userId, ids, all } = body;
      if (!userId || userId !== authUser.userId) {
        return jsonResponse({ error: '无权操作' }, 403, origin);
      }

      if (all) {
        await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').bind(authUser.userId).run();
      } else if (Array.isArray(ids) && ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        await env.DB.prepare(
          `UPDATE notifications SET is_read = 1 WHERE id IN (${placeholders}) AND user_id = ?`
        ).bind(...ids, authUser.userId).run();
      }

      return jsonResponse({ message: '已标记为已读' }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '标记已读失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/world-messages — 获取世界消息列表
  if (method === 'GET' && pathname === '/api/world-messages') {
    const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 20));
    const offset = (page - 1) * limit;

    const messages = await env.DB.prepare(
      'SELECT wm.*, u.name AS author_name, u.avatar AS author_avatar FROM world_messages wm JOIN users u ON wm.author_id = u.id ORDER BY wm.created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset).all();

    const countResult = await env.DB.prepare('SELECT COUNT(*) AS total FROM world_messages').first();
    return jsonResponse({
      messages: messages.results,
      pagination: { page, limit, total: countResult.total },
    }, 200, origin);
  }

  // POST /api/world-messages — 发送世界消息（需认证 + 社交权限）
  if (method === 'POST' && pathname === '/api/world-messages') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (!await hasSocialPermission(env, authUser.userId, 'social.world')) return jsonResponse({ error: '社交功能未解锁，请使用邀请码' }, 403, origin);

    try {
      const body = await request.json();
      const { content } = body;
      if (!content) return jsonResponse({ error: '内容不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO world_messages (author_id, content, created_at) VALUES (?, ?, datetime(\'now\'))'
      ).bind(authUser.userId, content).run();

      // 保留最近100条，删除更早的消息
      const countResult = await env.DB.prepare('SELECT COUNT(*) AS total FROM world_messages').first();
      if (countResult.total > 100) {
        await env.DB.prepare(
          'DELETE FROM world_messages WHERE id IN (SELECT id FROM world_messages ORDER BY created_at DESC LIMIT -1 OFFSET 100)'
        ).run();
      }

      const message = await env.DB.prepare(
        'SELECT wm.*, u.name AS author_name, u.avatar AS author_avatar FROM world_messages wm JOIN users u ON wm.author_id = u.id WHERE wm.id = ?'
      ).bind(result.meta.last_row_id).first();

      return jsonResponse(message, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '发送消息失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/news — 新闻列表
  if (method === 'GET' && pathname === '/api/news') {
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 20));
    const offset = (page - 1) * limit;
    const authorId = sp.get('authorId');

    let query, countQuery, params;
    if (authorId) {
      query = 'SELECT * FROM news WHERE author_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
      countQuery = 'SELECT COUNT(*) AS total FROM news WHERE author_id = ?';
      params = [Number(authorId), limit, offset];
    } else {
      query = 'SELECT * FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?';
      countQuery = 'SELECT COUNT(*) AS total FROM news';
      params = [limit, offset];
    }

    const news = await env.DB.prepare(query).bind(...params).all();
    const countResult = await env.DB.prepare(countQuery).bind(...(authorId ? [Number(authorId)] : [])).first();
    return jsonResponse({
      news: news.results,
      pagination: { page, limit, total: countResult.total },
    }, 200, origin);
  }

  // POST /api/news — 创建新闻（需认证）
  if (method === 'POST' && pathname === '/api/news') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { type, title, source, link, category, content, cover, images } = body;
      if (!title) return jsonResponse({ error: '标题不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO news (author_id, type, title, source, link, category, content, cover, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'
      ).bind(
        authUser.userId, type || 'article', title, source || null, link || null,
        category || null, content || null, cover || null,
        images ? JSON.stringify(images) : null
      ).run();

      const newsItem = await env.DB.prepare('SELECT * FROM news WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(newsItem, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建新闻失败: ' + err.message }, 500, origin);
    }
  }

  // PUT /api/news/:id — 编辑新闻（需认证，仅作者可编辑）
  const newsEditMatch = pathname.match(/^\/api\/news\/(\d+)$/);
  if (newsEditMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const newsId = Number(newsEditMatch[1]);
    const existing = await env.DB.prepare('SELECT * FROM news WHERE id = ?').bind(newsId).first();
    if (!existing) return jsonResponse({ error: '新闻不存在' }, 404, origin);
    if (existing.author_id !== authUser.userId) return jsonResponse({ error: '无权编辑' }, 403, origin);

    try {
      const body = await request.json();
      const { title, source, link, category, content, cover, images } = body;
      await env.DB.prepare(
        'UPDATE news SET title = ?, source = ?, link = ?, category = ?, content = ?, cover = ?, images = ? WHERE id = ?'
      ).bind(
        title || existing.title,
        source !== undefined ? source : existing.source,
        link !== undefined ? link : existing.link,
        category !== undefined ? category : existing.category,
        content !== undefined ? content : existing.content,
        cover !== undefined ? cover : existing.cover,
        images ? JSON.stringify(images) : existing.images,
        newsId
      ).run();

      const updated = await env.DB.prepare('SELECT * FROM news WHERE id = ?').bind(newsId).first();
      return jsonResponse(updated, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '编辑新闻失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/news/:id — 删除新闻（需认证，仅作者可删除）
  if (newsEditMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const newsId = Number(newsEditMatch[1]);
    const existing = await env.DB.prepare('SELECT * FROM news WHERE id = ?').bind(newsId).first();
    if (!existing) return jsonResponse({ error: '新闻不存在' }, 404, origin);
    if (existing.author_id !== authUser.userId) return jsonResponse({ error: '无权删除' }, 403, origin);

    await env.DB.prepare('DELETE FROM news WHERE id = ?').bind(newsId).run();
    return jsonResponse({ success: true }, 200, origin);
  }

  // GET /api/news/:id — 获取新闻详情
  const newsMatch = pathname.match(/^\/api\/news\/(\d+)$/);
  if (newsMatch && method === 'GET') {
    const newsId = Number(newsMatch[1]);
    const newsItem = await env.DB.prepare('SELECT * FROM news WHERE id = ?').bind(newsId).first();
    if (!newsItem) return jsonResponse({ error: '新闻不存在' }, 404, origin);
    return jsonResponse(newsItem, 200, origin);
  }

  // ── Scraped News Feed API ──

  // GET /api/news/feed — 聚合资讯流（多源交替排列，实现多元整合）
  if (method === 'GET' && pathname === '/api/news/feed') {
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit')) || 20));
    const source = sp.get('source') || '';
    const category = sp.get('category') || '';

    let whereClause = '';
    const bindParams = [];
    const conditions = [];

    if (source) {
      conditions.push('source = ?');
      bindParams.push(source);
    }
    if (category) {
      conditions.push('category = ?');
      bindParams.push(category);
    }
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // 查询总数
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM scraped_news ${whereClause}`
    ).bind(...bindParams).first();
    const total = countResult?.total || 0;

    // 多源交替排列：按来源分组，每组取最新数据，然后轮询交替
    // 全量获取所有数据（瀑布流一次性加载）
    const allNews = await env.DB.prepare(
      `SELECT id, source, title, link, summary, cover, category, extra, scraped_at AS created_at FROM scraped_news ${whereClause} ORDER BY scraped_at DESC`
    ).bind(...bindParams).all();

    // 按来源分组
    const sourceGroups = {};
    for (const item of allNews.results) {
      if (!sourceGroups[item.source]) sourceGroups[item.source] = [];
      sourceGroups[item.source].push(item);
    }

    // 轮询交替：从每个来源依次取一条，直到所有数据排完
    const interleaved = [];
    const sourceKeys = Object.keys(sourceGroups);
    const cursors = {};
    for (const key of sourceKeys) cursors[key] = 0;

    while (true) {
      let added = false;
      for (const key of sourceKeys) {
        if (cursors[key] < sourceGroups[key].length) {
          interleaved.push(sourceGroups[key][cursors[key]]);
          cursors[key]++;
          added = true;
        }
      }
      if (!added) break;
    }

    // 解析 extra JSON 字段（全量返回，不分页）
    const parsedItems = interleaved.map(item => {
      let extra = {};
      try { extra = JSON.parse(item.extra || '{}'); } catch {}
      return { ...item, extra };
    });

    return jsonResponse({
      news: parsedItems,
      pagination: { page: 1, limit: total, total },
    }, 200, origin);
  }

  // GET /api/news/refresh — 实时爬取指定源（有频率限制）
  if (method === 'GET' && pathname === '/api/news/refresh') {
    const sourceName = new URL(request.url).searchParams.get('source') || '';
    if (!sourceName) {
      return jsonResponse({ error: '缺少 source 参数' }, 400, origin);
    }

    // 频率限制：检查最近 5 分钟内是否已刷新
    const cache = caches.default;
    const cacheKey = new Request(`https://internal/news-refresh/${sourceName}`, { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) {
      return jsonResponse({ error: '刷新太频繁，请稍后再试', cooldown: 300 }, 429, origin);
    }

    const items = await newsScraper.scrapeSingleSource(sourceName);

    // 写入数据库
    let inserted = 0;
    for (const item of items) {
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO scraped_news (source, source_id, title, link, summary, cover, category, extra, scraped_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(item.source, item.source_id, item.title, item.link, item.summary, item.cover, item.category, item.extra).run();
        inserted++;
      } catch {}
    }

    // 设置 5 分钟缓存防止频繁刷新
    const refreshCache = new Response(JSON.stringify({ refreshed: true }), {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
    try { await cache.put(cacheKey, refreshCache); } catch {}

    return jsonResponse({ source: sourceName, items: items.length, inserted }, 200, origin);
  }

  // POST /api/news/admin/scrape — 手动触发全量爬取（需 ADMIN_SYNC_TOKEN）
  if (method === 'POST' && pathname === '/api/news/admin/scrape') {
    const authHeader = request.headers.get('X-Admin-Token') || '';
    const expected = env.ADMIN_SYNC_TOKEN || '';
    if (!expected || authHeader !== expected) {
      return jsonResponse({ error: '鉴权失败' }, 401, origin);
    }
    try {
      const result = await newsScraper.runAllScrapers(env.DB);
      return jsonResponse(result, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '爬取失败: ' + err.message }, 500, origin);
    }
  }

  // ── Ratings API ──

  // GET /api/ratings?subjectId=xxx — 获取某条目的所有评分
  if (method === 'GET' && pathname === '/api/ratings') {
    const subjectId = new URL(request.url).searchParams.get('subjectId');
    if (!subjectId) return jsonResponse({ error: '缺少 subjectId 参数' }, 400, origin);

    const ratings = await env.DB.prepare(
      'SELECT r.*, u.name AS user_name, u.avatar AS user_avatar FROM ratings r JOIN users u ON r.user_id = u.id WHERE r.subject_id = ? ORDER BY r.created_at DESC'
    ).bind(Number(subjectId)).all();

    return jsonResponse(ratings.results, 200, origin);
  }

  // GET /api/ratings/user?userId=xxx&subjectId=xxx — 获取用户对某条目的评分
  if (method === 'GET' && pathname === '/api/ratings/user') {
    const userId = new URL(request.url).searchParams.get('userId');
    const subjectId = new URL(request.url).searchParams.get('subjectId');
    if (!userId || !subjectId) return jsonResponse({ error: '缺少 userId 或 subjectId 参数' }, 400, origin);

    const rating = await env.DB.prepare(
      'SELECT * FROM ratings WHERE user_id = ? AND subject_id = ?'
    ).bind(Number(userId), Number(subjectId)).first();

    return jsonResponse(rating || null, 200, origin);
  }

  // POST /api/ratings — 新增/更新评分（需认证）
  if (method === 'POST' && pathname === '/api/ratings') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { subjectId, subjectType, score, content } = body;
      if (!subjectId || score === undefined) return jsonResponse({ error: '缺少 subjectId 或 score' }, 400, origin);

      await env.DB.prepare(
        'INSERT OR REPLACE INTO ratings (user_id, subject_id, subject_type, score, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
      ).bind(authUser.userId, subjectId, subjectType ?? 2, score, content || '').run();

      const rating = await env.DB.prepare(
        'SELECT * FROM ratings WHERE user_id = ? AND subject_id = ?'
      ).bind(authUser.userId, subjectId).first();

      return jsonResponse(rating, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '评分操作失败: ' + err.message }, 500, origin);
    }
  }

  // ── Favorites API ──

  // GET /api/favorites/check?userId=xxx&targetType=info&targetId=xxx — 检查是否已收藏
  if (method === 'GET' && pathname === '/api/favorites/check') {
    const userId = new URL(request.url).searchParams.get('userId');
    const targetType = new URL(request.url).searchParams.get('targetType');
    const targetId = new URL(request.url).searchParams.get('targetId');
    if (!userId || !targetType || !targetId) return jsonResponse({ error: '缺少参数' }, 400, origin);

    const existing = await env.DB.prepare(
      'SELECT id FROM favorites WHERE user_id = ? AND target_type = ? AND target_id = ?'
    ).bind(Number(userId), targetType, Number(targetId)).first();

    return jsonResponse({ favorited: !!existing }, 200, origin);
  }

  // GET /api/favorites?userId=xxx&targetType=info — 获取用户收藏列表
  if (method === 'GET' && pathname === '/api/favorites') {
    const userId = new URL(request.url).searchParams.get('userId');
    const targetType = new URL(request.url).searchParams.get('targetType') || 'info';
    if (!userId) return jsonResponse({ error: '缺少 userId 参数' }, 400, origin);

    const favorites = await env.DB.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND target_type = ? ORDER BY created_at DESC'
    ).bind(Number(userId), targetType).all();

    return jsonResponse(favorites.results, 200, origin);
  }

  // POST /api/favorites/toggle — 切换收藏状态（需认证）
  if (method === 'POST' && pathname === '/api/favorites/toggle') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { userId, targetType, targetId } = body;
      if (!targetType || !targetId) return jsonResponse({ error: '缺少 targetType 或 targetId' }, 400, origin);
      if (userId && Number(userId) !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

      const existing = await env.DB.prepare(
        'SELECT id FROM favorites WHERE user_id = ? AND target_type = ? AND target_id = ?'
      ).bind(authUser.userId, targetType, Number(targetId)).first();

      if (existing) {
        await env.DB.prepare('DELETE FROM favorites WHERE id = ?').bind(existing.id).run();
        return jsonResponse({ favorited: false }, 200, origin);
      } else {
        await env.DB.prepare(
          'INSERT INTO favorites (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
        ).bind(authUser.userId, targetType, Number(targetId)).run();
        return jsonResponse({ favorited: true }, 200, origin);
      }
    } catch (err) {
      return jsonResponse({ error: '收藏操作失败: ' + err.message }, 500, origin);
    }
  }

  // ── Mails API ──

  // GET /api/mails/unread?userId=xxx — 未读邮件数（需认证）
  if (method === 'GET' && pathname === '/api/mails/unread') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId || Number(userId) !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    const result = await env.DB.prepare(
      'SELECT COUNT(*) AS unread FROM mails WHERE to_user_id = ? AND read = 0 AND deleted_by_receiver = 0'
    ).bind(Number(userId)).first();

    return jsonResponse({ unread: result.unread }, 200, origin);
  }

  // GET /api/mails/inbox?userId=xxx — 收件箱（需认证）
  if (method === 'GET' && pathname === '/api/mails/inbox') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId || Number(userId) !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    const mails = await env.DB.prepare(
      'SELECT m.*, u.name AS from_user_name, u.avatar AS from_user_avatar FROM mails m JOIN users u ON m.from_user_id = u.id WHERE m.to_user_id = ? AND m.deleted_by_receiver = 0 ORDER BY m.created_at DESC'
    ).bind(Number(userId)).all();

    return jsonResponse(mails.results, 200, origin);
  }

  // GET /api/mails/sent?userId=xxx — 发件箱（需认证）
  if (method === 'GET' && pathname === '/api/mails/sent') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId || Number(userId) !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    const mails = await env.DB.prepare(
      'SELECT m.*, u.name AS to_user_name, u.avatar AS to_user_avatar FROM mails m JOIN users u ON m.to_user_id = u.id WHERE m.from_user_id = ? AND m.deleted_by_sender = 0 ORDER BY m.created_at DESC'
    ).bind(Number(userId)).all();

    return jsonResponse(mails.results, 200, origin);
  }

  // GET /api/mails/conversation?userId=xxx&otherUserId=yyy — 两人之间的邮件（需认证）
  if (method === 'GET' && pathname === '/api/mails/conversation') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = new URL(request.url).searchParams.get('userId');
    const otherUserId = new URL(request.url).searchParams.get('otherUserId');
    if (!userId || !otherUserId) return jsonResponse({ error: '缺少 userId 或 otherUserId 参数' }, 400, origin);
    if (Number(userId) !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    const mails = await env.DB.prepare(
      'SELECT m.*, u1.name AS from_user_name, u2.name AS to_user_name FROM mails m JOIN users u1 ON m.from_user_id = u1.id JOIN users u2 ON m.to_user_id = u2.id WHERE ((m.from_user_id = ? AND m.to_user_id = ? AND m.deleted_by_sender = 0) OR (m.from_user_id = ? AND m.to_user_id = ? AND m.deleted_by_receiver = 0)) ORDER BY m.created_at ASC'
    ).bind(Number(userId), Number(otherUserId), Number(otherUserId), Number(userId)).all();

    return jsonResponse(mails.results, 200, origin);
  }

  // PUT /api/mails/:id/read — 标记已读（需认证）
  const mailReadMatch = pathname.match(/^\/api\/mails\/(\d+)\/read$/);
  if (mailReadMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const mailId = Number(mailReadMatch[1]);

    await env.DB.prepare(
      'UPDATE mails SET read = 1 WHERE id = ? AND to_user_id = ?'
    ).bind(mailId, authUser.userId).run();

    return jsonResponse({ message: '已标记为已读' }, 200, origin);
  }

  // PUT /api/mails/:id/star — 切换星标（需认证）
  const mailStarMatch = pathname.match(/^\/api\/mails\/(\d+)\/star$/);
  if (mailStarMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const mailId = Number(mailStarMatch[1]);

    const mail = await env.DB.prepare('SELECT starred FROM mails WHERE id = ? AND (from_user_id = ? OR to_user_id = ?)').bind(mailId, authUser.userId, authUser.userId).first();
    if (!mail) return jsonResponse({ error: '邮件不存在' }, 404, origin);

    await env.DB.prepare('UPDATE mails SET starred = ? WHERE id = ?').bind(mail.starred ? 0 : 1, mailId).run();

    return jsonResponse({ starred: !mail.starred }, 200, origin);
  }

  // DELETE /api/mails/:id?userId=xxx — 删除邮件（软删除，需认证）
  const mailDeleteMatch = pathname.match(/^\/api\/mails\/(\d+)$/);
  if (mailDeleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const mailId = Number(mailDeleteMatch[1]);
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId || Number(userId) !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    const mail = await env.DB.prepare('SELECT from_user_id, to_user_id FROM mails WHERE id = ?').bind(mailId).first();
    if (!mail) return jsonResponse({ error: '邮件不存在' }, 404, origin);

    if (mail.from_user_id === authUser.userId) {
      await env.DB.prepare('UPDATE mails SET deleted_by_sender = 1 WHERE id = ?').bind(mailId).run();
    } else if (mail.to_user_id === authUser.userId) {
      await env.DB.prepare('UPDATE mails SET deleted_by_receiver = 1 WHERE id = ?').bind(mailId).run();
    } else {
      return jsonResponse({ error: '无权操作' }, 403, origin);
    }

    return jsonResponse({ message: '已删除邮件' }, 200, origin);
  }

  // POST /api/mails — 发送邮件（需认证）
  if (method === 'POST' && pathname === '/api/mails') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { toUserId, subject, content, attachments } = body;
      if (!toUserId || !content) return jsonResponse({ error: '缺少 toUserId 或 content' }, 400, origin);
      if (Number(toUserId) === authUser.userId) return jsonResponse({ error: '不能给自己发邮件' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO mails (from_user_id, to_user_id, subject, content, attachments, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
      ).bind(authUser.userId, Number(toUserId), subject || '', content, attachments ? JSON.stringify(attachments) : '[]').run();

      const mail = await env.DB.prepare('SELECT * FROM mails WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(mail, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '发送邮件失败: ' + err.message }, 500, origin);
    }
  }

  // ── Private Messages API ──

  // GET /api/private-messages/conversations?userId=xxx — 获取会话列表（需认证）
  if (method === 'GET' && pathname === '/api/private-messages/conversations') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId || Number(userId) !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    const conversations = await env.DB.prepare(
      'SELECT u.id AS other_user_id, u.name AS other_user_name, u.avatar AS other_user_avatar, pm.content AS last_message, pm.created_at AS last_message_at, (SELECT COUNT(*) FROM private_messages WHERE to_user_id = ? AND from_user_id = u.id AND read = 0) AS unread_count FROM private_messages pm JOIN users u ON (CASE WHEN pm.from_user_id = ? THEN pm.to_user_id ELSE pm.from_user_id END) = u.id WHERE pm.id IN (SELECT MAX(id) FROM private_messages WHERE from_user_id = ? OR to_user_id = ? GROUP BY CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END) ORDER BY pm.created_at DESC'
    ).bind(Number(userId), Number(userId), Number(userId), Number(userId), Number(userId)).all();

    return jsonResponse(conversations.results, 200, origin);
  }

  // GET /api/private-messages/conversation?userId=xxx&otherUserId=yyy — 获取两人之间的消息（需认证）
  if (method === 'GET' && pathname === '/api/private-messages/conversation') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const userId = new URL(request.url).searchParams.get('userId');
    const otherUserId = new URL(request.url).searchParams.get('otherUserId');
    if (!userId || !otherUserId) return jsonResponse({ error: '缺少 userId 或 otherUserId 参数' }, 400, origin);
    if (Number(userId) !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    const messages = await env.DB.prepare(
      'SELECT pm.*, u.name AS from_user_name, u.avatar AS from_user_avatar FROM private_messages pm JOIN users u ON pm.from_user_id = u.id WHERE (pm.from_user_id = ? AND pm.to_user_id = ?) OR (pm.from_user_id = ? AND pm.to_user_id = ?) ORDER BY pm.created_at ASC'
    ).bind(Number(userId), Number(otherUserId), Number(otherUserId), Number(userId)).all();

    return jsonResponse(messages.results, 200, origin);
  }

  // PUT /api/private-messages/read?userId=xxx&otherUserId=yyy — 标记已读（需认证）
  if (method === 'PUT' && pathname === '/api/private-messages/read') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const userId = new URL(request.url).searchParams.get('userId');
    const otherUserId = new URL(request.url).searchParams.get('otherUserId');
    if (!userId || !otherUserId) return jsonResponse({ error: '缺少 userId 或 otherUserId 参数' }, 400, origin);
    if (Number(userId) !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    await env.DB.prepare(
      'UPDATE private_messages SET read = 1 WHERE to_user_id = ? AND from_user_id = ? AND read = 0'
    ).bind(authUser.userId, Number(otherUserId)).run();

    return jsonResponse({ message: '已标记为已读' }, 200, origin);
  }

  // POST /api/private-messages — 发送私信（需认证 + 社交权限）
  if (method === 'POST' && pathname === '/api/private-messages') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (!await hasSocialPermission(env, authUser.userId, 'social.message')) return jsonResponse({ error: '社交功能未解锁，请使用邀请码' }, 403, origin);

    try {
      const body = await request.json();
      const { toUserId, content } = body;
      if (!toUserId || !content) return jsonResponse({ error: '缺少 toUserId 或 content' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO private_messages (from_user_id, to_user_id, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
      ).bind(authUser.userId, Number(toUserId), content).run();

      const message = await env.DB.prepare('SELECT * FROM private_messages WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(message, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '发送私信失败: ' + err.message }, 500, origin);
    }
  }

  // ── Follow check API ──

  // GET /api/follows/check?fromUserId=xxx&toUserId=yyy — 检查是否关注
  if (method === 'GET' && pathname === '/api/follows/check') {
    const fromUserId = new URL(request.url).searchParams.get('fromUserId');
    const toUserId = new URL(request.url).searchParams.get('toUserId');
    if (!fromUserId || !toUserId) return jsonResponse({ error: '缺少 fromUserId 或 toUserId 参数' }, 400, origin);

    const existing = await env.DB.prepare(
      'SELECT id FROM follows WHERE from_user_id = ? AND to_user_id = ?'
    ).bind(Number(fromUserId), Number(toUserId)).first();

    return jsonResponse({ following: !!existing }, 200, origin);
  }

  // ── Notification add API ──

  // POST /api/notifications — 创建通知（需认证）
  if (method === 'POST' && pathname === '/api/notifications') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { userId, type, fromUserId, targetType, targetId, content } = body;
      if (!userId || !type) return jsonResponse({ error: '缺少 userId 或 type' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO notifications (user_id, type, from_user_id, target_type, target_id, content, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, datetime(\'now\'))'
      ).bind(Number(userId), type, fromUserId || 0, targetType || '', targetId || 0, content || '').run();

      const notification = await env.DB.prepare('SELECT * FROM notifications WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(notification, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建通知失败: ' + err.message }, 500, origin);
    }
  }

  // ── Friend Posts API (好友空间动态) ──

  // GET /api/friend-posts — 获取好友动态 feed（需认证）
  if (method === 'GET' && pathname === '/api/friend-posts') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 20));
    const offset = (page - 1) * limit;

    try {
      // 获取好友 ID 列表
      const friends = await env.DB.prepare(
        "SELECT CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END AS friend_id FROM friend_requests WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'accepted'"
      ).bind(authUser.userId, authUser.userId, authUser.userId).all();
      const friendIds = friends.results.map(f => f.friend_id);

      let posts;
      if (friendIds.length > 0) {
        const placeholders = friendIds.map(() => '?').join(',');
        posts = await env.DB.prepare(
          `SELECT fp.*, u.name AS author_name, u.avatar AS author_avatar FROM friend_posts fp JOIN users u ON fp.user_id = u.id WHERE (fp.visibility = 'public') OR (fp.visibility = 'friends' AND fp.user_id IN (${placeholders})) OR (fp.user_id = ?) ORDER BY fp.created_at DESC LIMIT ? OFFSET ?`
        ).bind(...friendIds, authUser.userId, limit, offset).all();
      } else {
        posts = await env.DB.prepare(
          "SELECT fp.*, u.name AS author_name, u.avatar AS author_avatar FROM friend_posts fp JOIN users u ON fp.user_id = u.id WHERE fp.visibility = 'public' OR fp.user_id = ? ORDER BY fp.created_at DESC LIMIT ? OFFSET ?"
        ).bind(authUser.userId, limit, offset).all();
      }

      // 批量检查当前用户是否已点赞
      const postIds = posts.results.map(p => p.id);
      if (postIds.length > 0) {
        const likePlaceholders = postIds.map(() => '?').join(',');
        const likes = await env.DB.prepare(
          `SELECT post_id FROM friend_post_likes WHERE user_id = ? AND post_id IN (${likePlaceholders})`
        ).bind(authUser.userId, ...postIds).all();
        const likedSet = new Set(likes.results.map(l => l.post_id));
        posts.results.forEach(p => { p.liked_by_me = likedSet.has(p.id); });
      } else {
        posts.results.forEach(p => { p.liked_by_me = false; });
      }

      // 获取总数
      let countResult;
      if (friendIds.length > 0) {
        const placeholders = friendIds.map(() => '?').join(',');
        countResult = await env.DB.prepare(
          `SELECT COUNT(*) AS total FROM friend_posts WHERE (visibility = 'public') OR (visibility = 'friends' AND user_id IN (${placeholders})) OR (user_id = ?)`
        ).bind(...friendIds, authUser.userId).first();
      } else {
        countResult = await env.DB.prepare(
          "SELECT COUNT(*) AS total FROM friend_posts WHERE visibility = 'public' OR user_id = ?"
        ).bind(authUser.userId).first();
      }

      return jsonResponse({
        posts: posts.results,
        pagination: { page, limit, total: countResult.total },
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取好友动态失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/friend-posts — 创建好友动态（需认证 + 社交权限）
  if (method === 'POST' && pathname === '/api/friend-posts') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (!await hasSocialPermission(env, authUser.userId, 'social.post')) return jsonResponse({ error: '社交功能未解锁，请使用邀请码' }, 403, origin);

    try {
      const body = await request.json();
      const { content, images, visibility } = body;
      if (!content) return jsonResponse({ error: '内容不能为空' }, 400, origin);
      if (visibility && !['public', 'friends', 'private'].includes(visibility)) {
        return jsonResponse({ error: 'visibility 必须为 public、friends 或 private' }, 400, origin);
      }

      const result = await env.DB.prepare(
        "INSERT INTO friend_posts (user_id, content, images, visibility, likes_count, comments_count, views, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, 0, datetime('now'), datetime('now'))"
      ).bind(authUser.userId, content, images ? JSON.stringify(images) : '[]', visibility || 'friends').run();

      const post = await env.DB.prepare(
        'SELECT fp.*, u.name AS author_name, u.avatar AS author_avatar FROM friend_posts fp JOIN users u ON fp.user_id = u.id WHERE fp.id = ?'
      ).bind(result.meta.last_row_id).first();

      return jsonResponse(post, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建动态失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/friend-posts/:id/like — 切换点赞（需认证 + 社交权限）
  const fpLikeMatch = pathname.match(/^\/api\/friend-posts\/(\d+)\/like$/);
  if (fpLikeMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (!await hasSocialPermission(env, authUser.userId, 'social.post')) return jsonResponse({ error: '社交功能未解锁，请使用邀请码' }, 403, origin);
    const postId = Number(fpLikeMatch[1]);

    try {
      const post = await env.DB.prepare('SELECT id FROM friend_posts WHERE id = ?').bind(postId).first();
      if (!post) return jsonResponse({ error: '动态不存在' }, 404, origin);

      const existing = await env.DB.prepare(
        'SELECT id FROM friend_post_likes WHERE post_id = ? AND user_id = ?'
      ).bind(postId, authUser.userId).first();

      if (existing) {
        await env.DB.prepare('DELETE FROM friend_post_likes WHERE id = ?').bind(existing.id).run();
        await env.DB.prepare('UPDATE friend_posts SET likes_count = MAX(likes_count - 1, 0) WHERE id = ?').bind(postId).run();
        return jsonResponse({ liked: false }, 200, origin);
      } else {
        await env.DB.prepare(
          "INSERT INTO friend_post_likes (post_id, user_id, created_at) VALUES (?, ?, datetime('now'))"
        ).bind(postId, authUser.userId).run();
        await env.DB.prepare('UPDATE friend_posts SET likes_count = likes_count + 1 WHERE id = ?').bind(postId).run();
        return jsonResponse({ liked: true }, 200, origin);
      }
    } catch (err) {
      return jsonResponse({ error: '点赞操作失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/friend-posts/:id/comments — 添加评论（需认证 + 社交权限）
  const fpCommentMatch = pathname.match(/^\/api\/friend-posts\/(\d+)\/comments$/);
  if (fpCommentMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    if (!await hasSocialPermission(env, authUser.userId, 'social.comment')) return jsonResponse({ error: '社交功能未解锁，请使用邀请码' }, 403, origin);
    const postId = Number(fpCommentMatch[1]);

    try {
      const body = await request.json();
      const { content } = body;
      if (!content) return jsonResponse({ error: '评论内容不能为空' }, 400, origin);

      const post = await env.DB.prepare('SELECT id FROM friend_posts WHERE id = ?').bind(postId).first();
      if (!post) return jsonResponse({ error: '动态不存在' }, 404, origin);

      await env.DB.prepare(
        "INSERT INTO friend_post_comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(postId, authUser.userId, content).run();

      await env.DB.prepare('UPDATE friend_posts SET comments_count = comments_count + 1 WHERE id = ?').bind(postId).run();

      const comment = await env.DB.prepare(
        'SELECT fpc.*, u.name AS author_name, u.avatar AS author_avatar FROM friend_post_comments fpc JOIN users u ON fpc.user_id = u.id WHERE fpc.post_id = ? ORDER BY fpc.created_at DESC LIMIT 1'
      ).bind(postId).first();

      return jsonResponse(comment, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '评论失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/friend-posts/:id/comments — 获取动态评论
  if (fpCommentMatch && method === 'GET') {
    const postId = Number(fpCommentMatch[1]);

    const comments = await env.DB.prepare(
      'SELECT fpc.*, u.name AS author_name, u.avatar AS author_avatar FROM friend_post_comments fpc JOIN users u ON fpc.user_id = u.id WHERE fpc.post_id = ? ORDER BY fpc.created_at ASC'
    ).bind(postId).all();

    return jsonResponse(comments.results, 200, origin);
  }

  // DELETE /api/friend-posts/:id — 删除动态（需认证，仅本人）
  const fpDeleteMatch = pathname.match(/^\/api\/friend-posts\/(\d+)$/);
  if (fpDeleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const postId = Number(fpDeleteMatch[1]);

    try {
      const post = await env.DB.prepare('SELECT user_id FROM friend_posts WHERE id = ?').bind(postId).first();
      if (!post) return jsonResponse({ error: '动态不存在' }, 404, origin);
      if (post.user_id !== authUser.userId) return jsonResponse({ error: '无权删除他人动态' }, 403, origin);

      // 删除评论、点赞、动态
      const batch = [
        env.DB.prepare('DELETE FROM friend_post_comments WHERE post_id = ?').bind(postId),
        env.DB.prepare('DELETE FROM friend_post_likes WHERE post_id = ?').bind(postId),
        env.DB.prepare('DELETE FROM friend_posts WHERE id = ?').bind(postId),
      ];
      await env.DB.batch(batch);

      return jsonResponse({ message: '已删除动态' }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '删除动态失败: ' + err.message }, 500, origin);
    }
  }

  // ── Bangumi 本地索引搜索 API ──

  // GET /api/bangumi-search/search?q=xxx&type=2
  if (method === 'GET' && pathname === '/api/bangumi-search/search') {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const type = Number(url.searchParams.get('type')) || 0;
    if (!q) return jsonResponse({ error: '缺少 q 参数' }, 400, origin);
    if (q.length > 100) return jsonResponse({ error: 'q 太长' }, 400, origin);
    try {
      const result = await bangumiSearch.search(env, q, type);
      return jsonResponse(result, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '搜索失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/bangumi-search/detail/:id
  const detailMatch = pathname.match(/^\/api\/bangumi-search\/detail\/(\d+)$/);
  if (detailMatch && method === 'GET') {
    try {
      const result = await bangumiSearch.getDetail(env, Number(detailMatch[1]));
      if (!result) return jsonResponse({ error: '未找到条目' }, 404, origin);
      return jsonResponse(result, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取详情失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/bangumi-search/admin/sync — 手动触发同步（需 ADMIN_SYNC_TOKEN）
  if (method === 'POST' && pathname === '/api/bangumi-search/admin/sync') {
    const authHeader = request.headers.get('X-Admin-Token') || '';
    const expected = env.ADMIN_SYNC_TOKEN || '';
    if (!expected || authHeader !== expected) {
      return jsonResponse({ error: '鉴权失败' }, 401, origin);
    }
    const force = new URL(request.url).searchParams.get('force') === '1';
    try {
      const result = await bangumiSync.runSync(env, { force });
      return jsonResponse(result, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '同步失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/bangumi-search/admin/status — 查询同步元数据
  if (method === 'GET' && pathname === '/api/bangumi-search/admin/status') {
    try {
      const lastSync = await env.DB.prepare('SELECT value, updated_at FROM bangumi_index_meta WHERE key = ?').bind('last_sync_at').first();
      const sourceHash = await env.DB.prepare('SELECT value, updated_at FROM bangumi_index_meta WHERE key = ?').bind('source_hash').first();
      const itemCount = await env.DB.prepare('SELECT value FROM bangumi_index_meta WHERE key = ?').bind('item_count').first();
      const liveCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM bangumi_index').first();
      return jsonResponse({
        lastSyncAt: lastSync ? Number(lastSync.value) : null,
        lastSyncAtIso: lastSync?.updated_at || null,
        sourceHash: sourceHash?.value || null,
        itemCountRecorded: itemCount ? Number(itemCount.value) : 0,
        itemCountLive: liveCount?.n || 0,
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '查询失败: ' + err.message }, 500, origin);
    }
  }

  // ── 武藏也创作者平台 API ──

  // GET /api/works/my — 我的作品列表（需认证，需在 /api/works/:id 之前匹配）
  if (method === 'GET' && pathname === '/api/works/my') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 20));
    const offset = (page - 1) * limit;

    const works = await env.DB.prepare(
      'SELECT * FROM works WHERE author_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    ).bind(authUser.userId, limit, offset).all();

    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) AS total FROM works WHERE author_id = ?'
    ).bind(authUser.userId).first();

    return jsonResponse({
      works: works.results,
      pagination: { page, limit, total: countResult?.total || 0 },
    }, 200, origin);
  }

  // GET /api/works — 作品列表（支持 type/category/sort/page/limit/search/series_id 参数）
  if (method === 'GET' && pathname === '/api/works') {
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 20));
    const sort = sp.get('sort') || 'latest';
    const type = sp.get('type') || sp.get('category') || '';
    const search = sp.get('search') || '';
    const seriesId = sp.get('series_id') || '';
    const offset = (page - 1) * limit;

    const conditions = [];
    const bindParams = [];

    if (type) {
      conditions.push('type = ?');
      bindParams.push(type);
    }
    if (search) {
      conditions.push('(title LIKE ? OR description LIKE ?)');
      bindParams.push(`%${search}%`, `%${search}%`);
    }
    if (seriesId) {
      conditions.push('w.series_id = ?');
      bindParams.push(Number(seriesId));
    }
    // 只显示公开且可见的作品
    conditions.push('(is_visible = 1 OR is_visible IS NULL)');
    conditions.push("visibility != 'private'");

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    let orderClause = 'ORDER BY created_at DESC';
    if (sort === 'hot') {
      orderClause = 'ORDER BY (views_count + likes_count * 3 + comments_count * 5) DESC, created_at DESC';
    } else if (sort === 'views') {
      orderClause = 'ORDER BY views_count DESC, created_at DESC';
    } else if (sort === 'likes') {
      orderClause = 'ORDER BY likes_count DESC, created_at DESC';
    } else if (sort === 'rating') {
      orderClause = 'ORDER BY CASE WHEN rating_count > 0 THEN rating_sum * 1.0 / rating_count ELSE 0 END DESC, created_at DESC';
    }

    const works = await env.DB.prepare(
      `SELECT w.*, u.name AS author_name, u.avatar AS author_avatar FROM works w JOIN users u ON w.author_id = u.id ${whereClause} ${orderClause} LIMIT ? OFFSET ?`
    ).bind(...bindParams, limit, offset).all();

    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM works w ${whereClause}`
    ).bind(...bindParams).first();

    // 为已登录用户附加 is_liked / is_favorited
    const authUser = await getAuthUser(request, env);
    let worksWithFlags = works.results;
    if (authUser && worksWithFlags.length > 0) {
      const workIds = worksWithFlags.map(w => w.id);
      const likedRows = await env.DB.prepare(
        `SELECT work_id FROM work_likes WHERE user_id = ? AND work_id IN (${workIds.map(() => '?').join(',')})`
      ).bind(authUser.userId, ...workIds).all();
      const favRows = await env.DB.prepare(
        `SELECT work_id FROM work_favorites WHERE user_id = ? AND work_id IN (${workIds.map(() => '?').join(',')})`
      ).bind(authUser.userId, ...workIds).all();
      const likedSet = new Set(likedRows.results.map(r => r.work_id));
      const favSet = new Set(favRows.results.map(r => r.work_id));
      worksWithFlags = worksWithFlags.map(w => ({
        ...w,
        is_liked: likedSet.has(w.id) ? 1 : 0,
        is_favorited: favSet.has(w.id) ? 1 : 0,
      }));
    }

    return jsonResponse({
      works: worksWithFlags,
      pagination: { page, limit, total: countResult?.total || 0 },
    }, 200, origin);
  }

  // GET /api/works/my — 当前用户的作品列表
  if (method === 'GET' && pathname === '/api/works/my') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const works = await env.DB.prepare(
      'SELECT w.*, u.name AS author_name, u.avatar AS author_avatar FROM works w JOIN users u ON w.author_id = u.id WHERE w.author_id = ? ORDER BY w.created_at DESC'
    ).bind(authUser.userId).all();

    return jsonResponse({
      works: works.results.map(w => ({
        ...w,
        tags: safeJsonParse(w.tags, []),
      })),
    }, 200, origin);
  }

  // POST /api/works — 创建作品（需认证）
  if (method === 'POST' && pathname === '/api/works') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { type, title, description, coverUrl, cover, tags, status, visibility } = body;
      if (!title || !type) return jsonResponse({ error: '标题和类型不能为空' }, 400, origin);
      if (!['illustration', 'novel', 'manga', 'galgame'].includes(type)) return jsonResponse({ error: '类型必须为 illustration、novel、manga 或 galgame' }, 400, origin);

      const coverImage = coverUrl || cover || null;
      const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : '[]';
      const { illustrations } = body; // 插画类型的多图数组

      const result = await env.DB.prepare(
        "INSERT INTO works (author_id, type, title, description, cover_image, tags, status, visibility, illustration_count, views_count, likes_count, favorites_count, comments_count, rating_sum, rating_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, datetime('now'), datetime('now'))"
      ).bind(authUser.userId, type, title, description || null, coverImage, tagsJson, status || 'ongoing', visibility || 'public', illustrations ? illustrations.length : 0).run();

      // 插画类型：保存多图
      const workId = result.meta.last_row_id;
      if (type === 'illustration' && Array.isArray(illustrations) && illustrations.length > 0) {
        for (let i = 0; i < illustrations.length; i++) {
          await env.DB.prepare(
            'INSERT INTO illustration_images (work_id, image_url, sort_order, caption) VALUES (?, ?, ?, ?)'
          ).bind(workId, illustrations[i].url || illustrations[i], i, illustrations[i].caption || '').run();
        }
      }

      const work = await env.DB.prepare(
        'SELECT w.*, u.name AS author_name, u.avatar AS author_avatar FROM works w JOIN users u ON w.author_id = u.id WHERE w.id = ?'
      ).bind(workId).first();

      // 异步写入关注者动态流
      context.waitUntil((async () => {
        try {
          const followers = await env.DB.prepare(
            'SELECT follower_id FROM follows WHERE following_id = ?'
          ).bind(authUser.userId).all();
          for (const follower of followers.results) {
            await env.DB.prepare(
              'INSERT INTO user_feed (user_id, work_id, creator_id, event_type) VALUES (?, ?, ?, ?)'
            ).bind(follower.follower_id, workId, authUser.userId, 'new_work').run();
          }
        } catch (e) { /* feed写入失败不影响主流程 */ }
      })());

      return jsonResponse({
        ...work,
        tags: safeJsonParse(work.tags, []),
      }, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建作品失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/works/:id — 作品详情
  const workMatch = pathname.match(/^\/api\/works\/(\d+)$/);
  if (workMatch && method === 'GET') {
    const workId = Number(workMatch[1]);
    const work = await env.DB.prepare(
      'SELECT w.*, u.name AS author_name, u.avatar AS author_avatar FROM works w JOIN users u ON w.author_id = u.id WHERE w.id = ?'
    ).bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

    // 根据 type 查询关联数据
    let relatedData = {};
    if (work.type === 'novel') {
      const chapters = await env.DB.prepare(
        'SELECT id, title, chapter_number, word_count, created_at, updated_at FROM novel_chapters WHERE work_id = ? ORDER BY chapter_number ASC'
      ).bind(workId).all();
      relatedData.chapters = chapters.results;
    } else if (work.type === 'manga') {
      const chapters = await env.DB.prepare(
        'SELECT * FROM manga_chapters WHERE work_id = ? ORDER BY chapter_number ASC'
      ).bind(workId).all();
      // 为每话获取页面
      for (const ch of chapters.results) {
        const pages = await env.DB.prepare(
          'SELECT * FROM manga_pages WHERE chapter_id = ? ORDER BY page_number ASC'
        ).bind(ch.id).all();
        ch.pages = pages.results;
      }
      relatedData.chapters = chapters.results;
    } else if (work.type === 'illustration') {
      const images = await env.DB.prepare(
        'SELECT * FROM illustration_images WHERE work_id = ? ORDER BY sort_order ASC'
      ).bind(workId).all();
      relatedData.illustrations = images.results;
    } else if (work.type === 'galgame') {
      const downloads = await env.DB.prepare(
        'SELECT * FROM galgame_downloads WHERE work_id = ?'
      ).bind(workId).all();
      const previews = await env.DB.prepare(
        'SELECT * FROM galgame_previews WHERE work_id = ? ORDER BY sort_order ASC'
      ).bind(workId).all();
      relatedData.downloads = downloads.results;
      relatedData.previews = previews.results;
    }

    // 为已登录用户附加 is_liked / is_favorited
    const authUser = await getAuthUser(request, env);
    let likedFavData = {};
    if (authUser) {
      const liked = await env.DB.prepare(
        'SELECT id FROM work_likes WHERE user_id = ? AND work_id = ?'
      ).bind(authUser.userId, workId).first();
      const faved = await env.DB.prepare(
        'SELECT id FROM work_favorites WHERE user_id = ? AND work_id = ?'
      ).bind(authUser.userId, workId).first();
      likedFavData.is_liked = liked ? 1 : 0;
      likedFavData.is_favorited = faved ? 1 : 0;
    }

    return jsonResponse({
      ...work,
      tags: safeJsonParse(work.tags, []),
      ...relatedData,
      ...likedFavData,
    }, 200, origin);
  }

  // PUT /api/works/:id — 更新作品（仅作者本人）
  if (workMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(workMatch[1]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权编辑他人作品' }, 403, origin);

    try {
      const body = await request.json();
      const { title, description, coverUrl, cover, tags, status, visibility, is_visible } = body;
      const coverImage = coverUrl || cover || null;
      const tagsJson = tags ? JSON.stringify(tags) : undefined;
      const visibilityVal = visibility || null;
      const isVisible = is_visible !== undefined ? (is_visible ? 1 : 0) : null;

      await env.DB.prepare(
        "UPDATE works SET title = COALESCE(?, title), description = COALESCE(?, description), cover_image = COALESCE(?, cover_image), tags = COALESCE(?, tags), status = COALESCE(?, status), visibility = COALESCE(?, visibility), is_visible = COALESCE(?, is_visible), updated_at = datetime('now') WHERE id = ?"
      ).bind(title || null, description || null, coverImage, tagsJson || null, status || null, visibilityVal, isVisible, workId).run();

      const updated = await env.DB.prepare(
        'SELECT w.*, u.name AS author_name, u.avatar AS author_avatar FROM works w JOIN users u ON w.author_id = u.id WHERE w.id = ?'
      ).bind(workId).first();

      return jsonResponse({
        ...updated,
        tags: safeJsonParse(updated.tags, []),
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新作品失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/works/:id — 删除作品（仅作者本人/管理员）
  if (workMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(workMatch[1]);

    const work = await env.DB.prepare('SELECT author_id, type FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权删除他人作品' }, 403, origin);

    try {
      const batch = [];
      if (work.type === 'novel') {
        batch.push(env.DB.prepare('DELETE FROM novel_chapters WHERE work_id = ?').bind(workId));
      } else if (work.type === 'manga') {
        batch.push(env.DB.prepare('DELETE FROM manga_pages WHERE chapter_id IN (SELECT id FROM manga_chapters WHERE work_id = ?)').bind(workId));
        batch.push(env.DB.prepare('DELETE FROM manga_chapters WHERE work_id = ?').bind(workId));
      } else if (work.type === 'galgame') {
        batch.push(env.DB.prepare('DELETE FROM galgame_downloads WHERE work_id = ?').bind(workId));
        batch.push(env.DB.prepare('DELETE FROM galgame_previews WHERE work_id = ?').bind(workId));
      }
      batch.push(env.DB.prepare('DELETE FROM work_likes WHERE work_id = ?').bind(workId));
      batch.push(env.DB.prepare('DELETE FROM work_favorites WHERE work_id = ?').bind(workId));
      batch.push(env.DB.prepare('DELETE FROM work_comments WHERE work_id = ?').bind(workId));
      batch.push(env.DB.prepare('DELETE FROM work_reports WHERE work_id = ?').bind(workId));
      batch.push(env.DB.prepare('DELETE FROM work_ratings WHERE work_id = ?').bind(workId));
      batch.push(env.DB.prepare('DELETE FROM reading_progress WHERE work_id = ?').bind(workId));
      batch.push(env.DB.prepare('DELETE FROM works WHERE id = ?').bind(workId));
      await env.DB.batch(batch);

      return jsonResponse({ message: '已删除作品' }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '删除作品失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/works/:id/like — 点赞/取消点赞（toggle）
  const workLikeMatch = pathname.match(/^\/api\/works\/(\d+)\/like$/);
  if (workLikeMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(workLikeMatch[1]);

    const work = await env.DB.prepare('SELECT id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

    const existing = await env.DB.prepare(
      'SELECT id FROM work_likes WHERE user_id = ? AND work_id = ?'
    ).bind(authUser.userId, workId).first();

    if (existing) {
      await env.DB.prepare('DELETE FROM work_likes WHERE id = ?').bind(existing.id).run();
      await env.DB.prepare('UPDATE works SET likes_count = MAX(likes_count - 1, 0) WHERE id = ?').bind(workId).run();
      return jsonResponse({ liked: false }, 200, origin);
    } else {
      await env.DB.prepare(
        "INSERT INTO work_likes (user_id, work_id, created_at) VALUES (?, ?, datetime('now'))"
      ).bind(authUser.userId, workId).run();
      await env.DB.prepare('UPDATE works SET likes_count = likes_count + 1, updated_at = datetime(\'now\') WHERE id = ?').bind(workId).run();
      return jsonResponse({ liked: true }, 200, origin);
    }
  }

  // POST /api/works/:id/favorite — 收藏/取消收藏（toggle）
  const workFavMatch = pathname.match(/^\/api\/works\/(\d+)\/favorite$/);
  if (workFavMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(workFavMatch[1]);

    const work = await env.DB.prepare('SELECT id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

    const existing = await env.DB.prepare(
      'SELECT id FROM work_favorites WHERE user_id = ? AND work_id = ?'
    ).bind(authUser.userId, workId).first();

    if (existing) {
      await env.DB.prepare('DELETE FROM work_favorites WHERE id = ?').bind(existing.id).run();
      await env.DB.prepare('UPDATE works SET favorites_count = MAX(favorites_count - 1, 0) WHERE id = ?').bind(workId).run();
      return jsonResponse({ favorited: false }, 200, origin);
    } else {
      await env.DB.prepare(
        "INSERT INTO work_favorites (user_id, work_id, created_at) VALUES (?, ?, datetime('now'))"
      ).bind(authUser.userId, workId).run();
      await env.DB.prepare('UPDATE works SET favorites_count = favorites_count + 1, updated_at = datetime(\'now\') WHERE id = ?').bind(workId).run();
      return jsonResponse({ favorited: true }, 200, origin);
    }
  }

  // POST /api/works/:id/view — 记录浏览
  const workViewMatch = pathname.match(/^\/api\/works\/(\d+)\/view$/);
  if (workViewMatch && method === 'POST') {
    const workId = Number(workViewMatch[1]);
    const work = await env.DB.prepare('SELECT id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

    await env.DB.prepare('UPDATE works SET views_count = views_count + 1 WHERE id = ?').bind(workId).run();
    return jsonResponse({ viewed: true }, 200, origin);
  }

  // GET /api/works/:id/comments — 评论列表
  const workCommentsMatch = pathname.match(/^\/api\/works\/(\d+)\/comments$/);
  if (workCommentsMatch && method === 'GET') {
    const workId = Number(workCommentsMatch[1]);
    const work = await env.DB.prepare('SELECT id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

    const comments = await env.DB.prepare(
      'SELECT c.*, u.name AS author_name, u.avatar AS author_avatar FROM work_comments c JOIN users u ON c.user_id = u.id WHERE c.work_id = ? ORDER BY c.created_at ASC'
    ).bind(workId).all();

    return jsonResponse(comments.results, 200, origin);
  }

  // POST /api/works/:id/comments — 发表评论
  if (workCommentsMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(workCommentsMatch[1]);

    try {
      const body = await request.json();
      const { content, parent_id } = body;
      if (!content) return jsonResponse({ error: '评论内容不能为空' }, 400, origin);

      const work = await env.DB.prepare('SELECT id FROM works WHERE id = ?').bind(workId).first();
      if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

      await env.DB.prepare(
        "INSERT INTO work_comments (work_id, user_id, content, parent_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).bind(workId, authUser.userId, content, parent_id || null).run();

      await env.DB.prepare("UPDATE works SET comments_count = comments_count + 1, updated_at = datetime('now') WHERE id = ?").bind(workId).run();

      const comment = await env.DB.prepare(
        'SELECT c.*, u.name AS author_name, u.avatar AS author_avatar FROM work_comments c JOIN users u ON c.user_id = u.id WHERE c.work_id = ? ORDER BY c.created_at DESC LIMIT 1'
      ).bind(workId).first();

      return jsonResponse(comment, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '评论失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/works/:id/report — 举报作品
  const workReportMatch = pathname.match(/^\/api\/works\/(\d+)\/report$/);
  if (workReportMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(workReportMatch[1]);

    try {
      const body = await request.json();
      const { reason } = body;
      if (!reason) return jsonResponse({ error: '举报原因不能为空' }, 400, origin);

      const work = await env.DB.prepare('SELECT id FROM works WHERE id = ?').bind(workId).first();
      if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

      await env.DB.prepare(
        "INSERT INTO work_reports (work_id, user_id, reason, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(workId, authUser.userId, reason).run();

      return jsonResponse({ message: '举报已提交' }, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '举报失败: ' + err.message }, 500, origin);
    }
  }

  // ── 小说章节 API ──

  // PUT /api/works/:id/chapters/reorder — 章节排序（需在 /chapters/:cid 之前匹配）
  const chapterReorderMatch = pathname.match(/^\/api\/works\/(\d+)\/chapters\/reorder$/);
  if (chapterReorderMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(chapterReorderMatch[1]);

    const work = await env.DB.prepare('SELECT author_id, type FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);
    if (work.type !== 'novel') return jsonResponse({ error: '仅小说类型支持章节' }, 400, origin);

    try {
      const body = await request.json();
      const { order } = body; // [{ id: 1, chapter_number: 1 }, ...]
      if (!Array.isArray(order)) return jsonResponse({ error: 'order 必须为数组' }, 400, origin);

      const batch = order.map(item =>
        env.DB.prepare('UPDATE novel_chapters SET chapter_number = ? WHERE id = ? AND work_id = ?')
          .bind(item.chapter_number, item.id, workId)
      );
      batch.push(env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId));
      await env.DB.batch(batch);

      return jsonResponse({ message: '排序已更新' }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '排序失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/works/:id/chapters — 章节列表（不含 content）
  const chaptersMatch = pathname.match(/^\/api\/works\/(\d+)\/chapters$/);
  if (chaptersMatch && method === 'GET') {
    const workId = Number(chaptersMatch[1]);
    const work = await env.DB.prepare('SELECT id, type FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.type !== 'novel') return jsonResponse({ error: '仅小说类型支持章节' }, 400, origin);

    const chapters = await env.DB.prepare(
      'SELECT id, title, chapter_number, word_count, created_at, updated_at FROM novel_chapters WHERE work_id = ? ORDER BY chapter_number ASC'
    ).bind(workId).all();

    return jsonResponse(chapters.results, 200, origin);
  }

  // POST /api/works/:id/chapters — 添加章节
  if (chaptersMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(chaptersMatch[1]);

    const work = await env.DB.prepare('SELECT author_id, type FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);
    if (work.type !== 'novel') return jsonResponse({ error: '仅小说类型支持章节' }, 400, origin);

    try {
      const body = await request.json();
      const { title, content, chapter_number } = body;
      if (!title || !content) return jsonResponse({ error: '标题和内容不能为空' }, 400, origin);

      const wordCount = content.length;

      // 自动计算 chapter_number
      let chapterNum = chapter_number;
      if (!chapterNum) {
        const maxChapter = await env.DB.prepare(
          'SELECT MAX(chapter_number) AS max_num FROM novel_chapters WHERE work_id = ?'
        ).bind(workId).first();
        chapterNum = (maxChapter?.max_num || 0) + 1;
      }

      const result = await env.DB.prepare(
        "INSERT INTO novel_chapters (work_id, title, content, chapter_number, word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
      ).bind(workId, title, content, chapterNum, wordCount).run();

      await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

      const chapter = await env.DB.prepare('SELECT * FROM novel_chapters WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(chapter, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '添加章节失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/works/:id/chapters/:cid — 章节详情（含 content）
  const chapterDetailMatch = pathname.match(/^\/api\/works\/(\d+)\/chapters\/(\d+)$/);
  if (chapterDetailMatch && method === 'GET') {
    const workId = Number(chapterDetailMatch[1]);
    const chapterId = Number(chapterDetailMatch[2]);

    const chapter = await env.DB.prepare(
      'SELECT * FROM novel_chapters WHERE id = ? AND work_id = ?'
    ).bind(chapterId, workId).first();
    if (!chapter) return jsonResponse({ error: '章节不存在' }, 404, origin);

    return jsonResponse(chapter, 200, origin);
  }

  // PUT /api/works/:id/chapters/:cid — 更新章节
  if (chapterDetailMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(chapterDetailMatch[1]);
    const chapterId = Number(chapterDetailMatch[2]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    try {
      const body = await request.json();
      const { title, content, chapter_number } = body;

      const wordCount = content ? content.length : undefined;

      await env.DB.prepare(
        "UPDATE novel_chapters SET title = COALESCE(?, title), content = COALESCE(?, content), chapter_number = COALESCE(?, chapter_number), word_count = COALESCE(?, word_count), updated_at = datetime('now') WHERE id = ? AND work_id = ?"
      ).bind(title || null, content || null, chapter_number || null, wordCount || null, chapterId, workId).run();

      await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

      const updated = await env.DB.prepare('SELECT * FROM novel_chapters WHERE id = ?').bind(chapterId).first();
      return jsonResponse(updated, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新章节失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/works/:id/chapters/:cid — 删除章节
  if (chapterDetailMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(chapterDetailMatch[1]);
    const chapterId = Number(chapterDetailMatch[2]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    await env.DB.prepare('DELETE FROM novel_chapters WHERE id = ? AND work_id = ?').bind(chapterId, workId).run();
    await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

    return jsonResponse({ message: '已删除章节' }, 200, origin);
  }

  // ── 漫画话数与页面 API ──

  // GET /api/works/:id/manga-chapters — 话数列表（含页面）
  const mangaChaptersMatch = pathname.match(/^\/api\/works\/(\d+)\/manga-chapters$/);
  if (mangaChaptersMatch && method === 'GET') {
    const workId = Number(mangaChaptersMatch[1]);
    const work = await env.DB.prepare('SELECT id, type FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.type !== 'manga') return jsonResponse({ error: '仅漫画类型支持话数' }, 400, origin);

    const chapters = await env.DB.prepare(
      'SELECT * FROM manga_chapters WHERE work_id = ? ORDER BY chapter_number ASC'
    ).bind(workId).all();

    for (const ch of chapters.results) {
      const pages = await env.DB.prepare(
        'SELECT * FROM manga_pages WHERE chapter_id = ? ORDER BY page_number ASC'
      ).bind(ch.id).all();
      ch.pages = pages.results;
    }

    return jsonResponse(chapters.results, 200, origin);
  }

  // POST /api/works/:id/manga-chapters — 添加话
  if (mangaChaptersMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(mangaChaptersMatch[1]);

    const work = await env.DB.prepare('SELECT author_id, type FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);
    if (work.type !== 'manga') return jsonResponse({ error: '仅漫画类型支持话数' }, 400, origin);

    try {
      const body = await request.json();
      const { title, chapter_number } = body;
      if (!title) return jsonResponse({ error: '标题不能为空' }, 400, origin);

      let chapterNum = chapter_number;
      if (!chapterNum) {
        const maxChapter = await env.DB.prepare(
          'SELECT MAX(chapter_number) AS max_num FROM manga_chapters WHERE work_id = ?'
        ).bind(workId).first();
        chapterNum = (maxChapter?.max_num || 0) + 1;
      }

      const result = await env.DB.prepare(
        "INSERT INTO manga_chapters (work_id, title, chapter_number, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(workId, title, chapterNum).run();

      await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

      const chapter = await env.DB.prepare('SELECT * FROM manga_chapters WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(chapter, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '添加话数失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/works/:id/manga-chapters/:cid — 删除话
  const mangaChapterDeleteMatch = pathname.match(/^\/api\/works\/(\d+)\/manga-chapters\/(\d+)$/);
  if (mangaChapterDeleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(mangaChapterDeleteMatch[1]);
    const chapterId = Number(mangaChapterDeleteMatch[2]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    const batch = [
      env.DB.prepare('DELETE FROM manga_pages WHERE chapter_id = ?').bind(chapterId),
      env.DB.prepare('DELETE FROM manga_chapters WHERE id = ? AND work_id = ?').bind(chapterId, workId),
      env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId),
    ];
    await env.DB.batch(batch);

    return jsonResponse({ message: '已删除话数' }, 200, origin);
  }

  // POST /api/works/:id/manga-chapters/:cid/pages — 上传页面图片
  const mangaPagesMatch = pathname.match(/^\/api\/works\/(\d+)\/manga-chapters\/(\d+)\/pages$/);
  if (mangaPagesMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(mangaPagesMatch[1]);
    const chapterId = Number(mangaPagesMatch[2]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    // 校验该话确实属于此作品，防止越权写入他人章节
    const chapter = await env.DB.prepare('SELECT id FROM manga_chapters WHERE id = ? AND work_id = ?').bind(chapterId, workId).first();
    if (!chapter) return jsonResponse({ error: '话数不存在' }, 404, origin);

    try {
      const body = await request.json();
      const { pages } = body; // [{ image_url, page_number }]
      if (!Array.isArray(pages) || pages.length === 0) return jsonResponse({ error: 'pages 不能为空' }, 400, origin);

      const batch = pages.map(p => {
        const pageNum = p.page_number;
        return env.DB.prepare(
          "INSERT INTO manga_pages (chapter_id, image_url, page_number, created_at) VALUES (?, ?, ?, datetime('now'))"
        ).bind(chapterId, p.image_url, pageNum);
      });
      batch.push(env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId));
      await env.DB.batch(batch);

      const insertedPages = await env.DB.prepare(
        'SELECT * FROM manga_pages WHERE chapter_id = ? ORDER BY page_number ASC'
      ).bind(chapterId).all();

      return jsonResponse(insertedPages.results, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '上传页面失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/works/:id/manga-pages/:pid — 删除页面
  const mangaPageDeleteMatch = pathname.match(/^\/api\/works\/(\d+)\/manga-pages\/(\d+)$/);
  if (mangaPageDeleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(mangaPageDeleteMatch[1]);
    const pageId = Number(mangaPageDeleteMatch[2]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    // 仅允许删除属于本作品章节下的页面，防止越权删除他人页面
    await env.DB.prepare(
      'DELETE FROM manga_pages WHERE id = ? AND chapter_id IN (SELECT id FROM manga_chapters WHERE work_id = ?)'
    ).bind(pageId, workId).run();
    await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

    return jsonResponse({ message: '已删除页面' }, 200, origin);
  }

  // ── Galgame API ──

  // POST /api/works/:id/downloads — 添加下载链接
  const downloadsMatch = pathname.match(/^\/api\/works\/(\d+)\/downloads$/);
  if (downloadsMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(downloadsMatch[1]);

    const work = await env.DB.prepare('SELECT author_id, type FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);
    if (work.type !== 'galgame') return jsonResponse({ error: '仅 Galgame 类型支持下载链接' }, 400, origin);

    try {
      const body = await request.json();
      const { platform, url, label } = body;
      if (!platform || !url) return jsonResponse({ error: '平台和链接不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        "INSERT INTO galgame_downloads (work_id, platform, url, label, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).bind(workId, platform, url, label || null).run();

      await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

      const download = await env.DB.prepare('SELECT * FROM galgame_downloads WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(download, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '添加下载链接失败: ' + err.message }, 500, origin);
    }
  }

  // PUT /api/works/:id/downloads/:did — 更新下载链接
  const downloadDetailMatch = pathname.match(/^\/api\/works\/(\d+)\/downloads\/(\d+)$/);
  if (downloadDetailMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(downloadDetailMatch[1]);
    const downloadId = Number(downloadDetailMatch[2]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    try {
      const body = await request.json();
      const { platform, url, label } = body;

      await env.DB.prepare(
        "UPDATE galgame_downloads SET platform = COALESCE(?, platform), url = COALESCE(?, url), label = COALESCE(?, label) WHERE id = ? AND work_id = ?"
      ).bind(platform || null, url || null, label || null, downloadId, workId).run();

      await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

      const updated = await env.DB.prepare('SELECT * FROM galgame_downloads WHERE id = ?').bind(downloadId).first();
      return jsonResponse(updated, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新下载链接失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/works/:id/downloads/:did — 删除下载链接
  if (downloadDetailMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(downloadDetailMatch[1]);
    const downloadId = Number(downloadDetailMatch[2]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    await env.DB.prepare('DELETE FROM galgame_downloads WHERE id = ? AND work_id = ?').bind(downloadId, workId).run();
    await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

    return jsonResponse({ message: '已删除下载链接' }, 200, origin);
  }

  // POST /api/works/:id/previews — 上传预览图
  const previewsMatch = pathname.match(/^\/api\/works\/(\d+)\/previews$/);
  if (previewsMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(previewsMatch[1]);

    const work = await env.DB.prepare('SELECT author_id, type FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);
    if (work.type !== 'galgame') return jsonResponse({ error: '仅 Galgame 类型支持预览图' }, 400, origin);

    try {
      const body = await request.json();
      const { image_url, sort_order } = body;
      if (!image_url) return jsonResponse({ error: '图片链接不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        "INSERT INTO galgame_previews (work_id, image_url, sort_order, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(workId, image_url, sort_order || 0).run();

      await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

      const preview = await env.DB.prepare('SELECT * FROM galgame_previews WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(preview, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '上传预览图失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/works/:id/previews/:pid — 删除预览图
  const previewDeleteMatch = pathname.match(/^\/api\/works\/(\d+)\/previews\/(\d+)$/);
  if (previewDeleteMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(previewDeleteMatch[1]);
    const previewId = Number(previewDeleteMatch[2]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    await env.DB.prepare('DELETE FROM galgame_previews WHERE id = ? AND work_id = ?').bind(previewId, workId).run();
    await env.DB.prepare("UPDATE works SET updated_at = datetime('now') WHERE id = ?").bind(workId).run();

    return jsonResponse({ message: '已删除预览图' }, 200, origin);
  }

  // ── 阅读进度 API ──

  // GET /api/reading-progress — 用户所有进度（需认证）
  if (method === 'GET' && pathname === '/api/reading-progress') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const progress = await env.DB.prepare(
      'SELECT rp.*, w.title AS work_title, w.cover_image AS work_cover, w.type AS work_type FROM reading_progress rp JOIN works w ON rp.work_id = w.id WHERE rp.user_id = ? ORDER BY rp.updated_at DESC'
    ).bind(authUser.userId).all();

    return jsonResponse(progress.results, 200, origin);
  }

  // GET /api/reading-progress/:workId — 单作品进度
  const progressMatch = pathname.match(/^\/api\/reading-progress\/(\d+)$/);
  if (progressMatch && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(progressMatch[1]);

    const progress = await env.DB.prepare(
      'SELECT * FROM reading_progress WHERE user_id = ? AND work_id = ?'
    ).bind(authUser.userId, workId).first();

    return jsonResponse(progress || null, 200, origin);
  }

  // PUT /api/reading-progress/:workId — 更新进度（INSERT ON CONFLICT DO UPDATE）
  if (progressMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(progressMatch[1]);

    try {
      const body = await request.json();
      const { chapter_id, chapter_number, scroll_position, page_number, percentage } = body;

      const work = await env.DB.prepare('SELECT id FROM works WHERE id = ?').bind(workId).first();
      if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

      await env.DB.prepare(
        "INSERT INTO reading_progress (user_id, work_id, chapter_id, chapter_number, scroll_position, page_number, percentage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')) ON CONFLICT(user_id, work_id) DO UPDATE SET chapter_id = COALESCE(excluded.chapter_id, reading_progress.chapter_id), chapter_number = COALESCE(excluded.chapter_number, reading_progress.chapter_number), scroll_position = COALESCE(excluded.scroll_position, reading_progress.scroll_position), page_number = COALESCE(excluded.page_number, reading_progress.page_number), percentage = COALESCE(excluded.percentage, reading_progress.percentage), updated_at = datetime('now')"
      ).bind(authUser.userId, workId, chapter_id || null, chapter_number || null, scroll_position ?? null, page_number || null, percentage || null).run();

      const progress = await env.DB.prepare(
        'SELECT * FROM reading_progress WHERE user_id = ? AND work_id = ?'
      ).bind(authUser.userId, workId).first();

      return jsonResponse(progress, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新进度失败: ' + err.message }, 500, origin);
    }
  }

  // ── 评分 API ──

  // GET /api/works/:id/rating — 获取作品评分（含当前用户评分）
  const ratingMatch = pathname.match(/^\/api\/works\/(\d+)\/rating$/);
  if (ratingMatch && method === 'GET') {
    const workId = Number(ratingMatch[1]);
    const work = await env.DB.prepare('SELECT rating_sum, rating_count FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

    const avgRating = work.rating_count > 0 ? (work.rating_sum / work.rating_count) : 0;

    // 查询当前用户评分
    const authUser = await getAuthUser(request, env);
    let userRating = null;
    let userDimensionScores = null;
    if (authUser) {
      const row = await env.DB.prepare('SELECT rating, dimension_scores FROM work_ratings WHERE user_id = ? AND work_id = ?').bind(authUser.userId, workId).first();
      if (row) {
        userRating = row.rating;
        userDimensionScores = safeJsonParse(row.dimension_scores);
      }
    }

    // 平均多维度评分
    const avgDimensions = await env.DB.prepare(
      'SELECT dimension_scores FROM work_ratings WHERE work_id = ? AND dimension_scores IS NOT NULL'
    ).bind(workId).all();
    let avgDimensionScores = null;
    if (avgDimensions.results.length > 0) {
      const sums = {};
      let count = 0;
      for (const row of avgDimensions.results) {
        const dims = safeJsonParse(row.dimension_scores);
        if (dims) {
          count++;
          for (const [key, val] of Object.entries(dims)) {
            sums[key] = (sums[key] || 0) + val;
          }
        }
      }
      if (count > 0) {
        avgDimensionScores = {};
        for (const [key, sum] of Object.entries(sums)) {
          avgDimensionScores[key] = Math.round((sum / count) * 10) / 10;
        }
      }
    }

    return jsonResponse({
      average: Math.round(avgRating * 10) / 10,
      count: work.rating_count,
      userRating,
      userDimensionScores,
      avgDimensionScores,
    }, 200, origin);
  }

  // POST /api/works/:id/rating — 提交/更新评分（1-5 星）
  if (ratingMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(ratingMatch[1]);

    try {
      const body = await request.json();
      const rating = Number(body.rating);
      if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return jsonResponse({ error: '评分必须为 1-5 的整数' }, 400, origin);
      }
      const dimensionScores = body.dimension_scores ? JSON.stringify(body.dimension_scores) : null;

      // 检查作品是否存在
      const work = await env.DB.prepare('SELECT id FROM works WHERE id = ?').bind(workId).first();
      if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);

      // 获取旧评分（如果有）
      const existing = await env.DB.prepare('SELECT rating FROM work_ratings WHERE user_id = ? AND work_id = ?').bind(authUser.userId, workId).first();
      const oldRating = existing ? existing.rating : 0;

      // 插入或更新评分（含 dimension_scores）
      await env.DB.prepare(
        "INSERT INTO work_ratings (user_id, work_id, rating, dimension_scores, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now')) ON CONFLICT(user_id, work_id) DO UPDATE SET rating = excluded.rating, dimension_scores = excluded.dimension_scores, updated_at = datetime('now')"
      ).bind(authUser.userId, workId, rating, dimensionScores).run();

      // 更新 works 表的去规范化评分统计
      if (oldRating > 0) {
        // 更新评分：差值更新
        await env.DB.prepare(
          'UPDATE works SET rating_sum = rating_sum + ?, rating_count = rating_count WHERE id = ?'
        ).bind(rating - oldRating, workId).run();
      } else {
        // 新评分
        await env.DB.prepare(
          'UPDATE works SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?'
        ).bind(rating, workId).run();
      }

      // 返回最新统计
      const updated = await env.DB.prepare('SELECT rating_sum, rating_count FROM works WHERE id = ?').bind(workId).first();
      const avgRating = updated.rating_count > 0 ? (updated.rating_sum / updated.rating_count) : 0;

      return jsonResponse({
        average: Math.round(avgRating * 10) / 10,
        count: updated.rating_count,
        userRating: rating,
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '评分失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/works/:id/rating — 删除评分
  if (ratingMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(ratingMatch[1]);

    const existing = await env.DB.prepare('SELECT rating FROM work_ratings WHERE user_id = ? AND work_id = ?').bind(authUser.userId, workId).first();
    if (!existing) return jsonResponse({ error: '未评分' }, 404, origin);

    await env.DB.prepare('DELETE FROM work_ratings WHERE user_id = ? AND work_id = ?').bind(authUser.userId, workId).run();
    await env.DB.prepare(
      'UPDATE works SET rating_sum = rating_sum - ?, rating_count = rating_count - 1 WHERE id = ?'
    ).bind(existing.rating, workId).run();

    return jsonResponse({ success: true }, 200, origin);
  }

  // ─── 插画图片管理 ──────────────────────────────────

  // POST /api/works/:id/illustrations — 批量添加插画图片
  const illMatch = pathname.match(/^\/api\/works\/(\d+)\/illustrations$/);
  if (illMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(illMatch[1]);

    const work = await env.DB.prepare('SELECT author_id, type FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);
    if (work.type !== 'illustration') return jsonResponse({ error: '仅插画类型支持添加图片' }, 400, origin);

    try {
      const body = await request.json();
      const { images } = body; // [{ url, caption }]
      if (!Array.isArray(images) || images.length === 0) return jsonResponse({ error: '请提供图片数组' }, 400, origin);

      // 获取当前最大排序
      const maxOrder = await env.DB.prepare(
        'SELECT MAX(sort_order) AS max_order FROM illustration_images WHERE work_id = ?'
      ).bind(workId).first();
      let nextOrder = (maxOrder?.max_order ?? -1) + 1;

      for (const img of images) {
        await env.DB.prepare(
          'INSERT INTO illustration_images (work_id, image_url, sort_order, caption) VALUES (?, ?, ?, ?)'
        ).bind(workId, img.url, nextOrder, img.caption || '').run();
        nextOrder++;
      }

      // 更新 illustration_count
      const countResult = await env.DB.prepare(
        'SELECT COUNT(*) AS cnt FROM illustration_images WHERE work_id = ?'
      ).bind(workId).first();
      await env.DB.prepare('UPDATE works SET illustration_count = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(countResult.cnt, workId).run();

      // 返回更新后的图片列表
      const updatedImages = await env.DB.prepare(
        'SELECT * FROM illustration_images WHERE work_id = ? ORDER BY sort_order ASC'
      ).bind(workId).all();

      return jsonResponse({ illustrations: updatedImages.results }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '添加图片失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/works/:id/illustrations/:iid — 删除单张插画图片
  const illDelMatch = pathname.match(/^\/api\/works\/(\d+)\/illustrations\/(\d+)$/);
  if (illDelMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(illDelMatch[1]);
    const imageId = Number(illDelMatch[2]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    const image = await env.DB.prepare('SELECT id FROM illustration_images WHERE id = ? AND work_id = ?')
      .bind(imageId, workId).first();
    if (!image) return jsonResponse({ error: '图片不存在' }, 404, origin);

    await env.DB.prepare('DELETE FROM illustration_images WHERE id = ?').bind(imageId).run();

    // 更新 illustration_count
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM illustration_images WHERE work_id = ?'
    ).bind(workId).first();
    await env.DB.prepare('UPDATE works SET illustration_count = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(countResult.cnt, workId).run();

    return jsonResponse({ success: true, illustration_count: countResult.cnt }, 200, origin);
  }

  // PUT /api/works/:id/illustrations/reorder — 重新排序插画图片
  const illReorderMatch = pathname.match(/^\/api\/works\/(\d+)\/illustrations\/reorder$/);
  if (illReorderMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(illReorderMatch[1]);

    const work = await env.DB.prepare('SELECT author_id FROM works WHERE id = ?').bind(workId).first();
    if (!work) return jsonResponse({ error: '作品不存在' }, 404, origin);
    if (work.author_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    try {
      const body = await request.json();
      const { order } = body; // [imageId1, imageId2, ...]
      if (!Array.isArray(order)) return jsonResponse({ error: '请提供排序数组' }, 400, origin);

      for (let i = 0; i < order.length; i++) {
        await env.DB.prepare(
          'UPDATE illustration_images SET sort_order = ? WHERE id = ? AND work_id = ?'
        ).bind(i, order[i], workId).run();
      }

      const updatedImages = await env.DB.prepare(
        'SELECT * FROM illustration_images WHERE work_id = ? ORDER BY sort_order ASC'
      ).bind(workId).all();

      return jsonResponse({ illustrations: updatedImages.results }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '排序失败: ' + err.message }, 500, origin);
    }
  }

  // ─── 排行榜 API ──────────────────────────────────

  // GET /api/works/rankings — 排行榜数据
  const rankingsMatch = pathname.match(/^\/api\/works\/rankings$/);
  if (rankingsMatch && method === 'GET') {
    const sp = new URL(request.url).searchParams;
    const rankType = sp.get('type') || 'daily'; // daily / weekly / monthly
    const category = sp.get('category') || 'all'; // illustration / novel / manga / galgame / all
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit')) || 20));

    // 验证 type 参数
    if (!['daily', 'weekly', 'monthly'].includes(rankType)) {
      return jsonResponse({ error: 'type 必须为 daily、weekly 或 monthly' }, 400, origin);
    }

    let query = 'SELECT wr.*, w.title, w.type, w.cover_image, w.author_id, u.name AS author_name, u.avatar AS author_avatar FROM work_rankings wr JOIN works w ON wr.work_id = w.id JOIN users u ON w.author_id = u.id WHERE wr.rank_type = ?';
    const params = [rankType];

    if (category !== 'all') {
      query += ' AND wr.category = ?';
      params.push(category);
    }

    query += ' ORDER BY wr.rank_position ASC LIMIT ?';
    params.push(limit);

    try {
      const rankings = await env.DB.prepare(query).bind(...params).all();
      return jsonResponse({ rankings: rankings.results, type: rankType, category }, 200, origin);
    } catch (err) {
      // 表可能未创建（迁移未执行），返回空数据
      return jsonResponse({ rankings: [], type: rankType, category }, 200, origin);
    }
  }

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
        social_features: safeJsonParse(profile.social_features, {}),
        preference_vector: safeJsonParse(profile.preference_vector, {}),
        lifecycle_stage: profile.lifecycle_stage || 'new',
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
      // 补录用户收藏中缺失的条目数据到 bangumi_subjects 表
      const collections = await env.DB.prepare(
        'SELECT subject_id FROM collections WHERE user_id = ?'
      ).bind(authUser.userId).all();
      const enrichPromises = [];
      for (const c of (collections.results || [])) {
        enrichPromises.push(bangumiEnrich.enrichSubject(env, Number(c.subject_id)));
      }
      await Promise.allSettled(enrichPromises);

      const profile = await userProfile.computeUserProfile(env.DB, authUser.userId);

      await env.DB.prepare(
        `INSERT OR REPLACE INTO user_profiles
         (user_id, tag_weights, type_affinity, consumption_stats, rating_tendency,
          activity_score, last_action_at, version, similar_users,
          social_features, preference_vector, lifecycle_stage, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        profile.user_id, profile.tag_weights, profile.type_affinity,
        profile.consumption_stats, profile.rating_tendency,
        profile.activity_score, profile.last_action_at,
        profile.version, profile.similar_users,
        profile.social_features, profile.preference_vector, profile.lifecycle_stage,
        profile.updated_at
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
        return jsonResponse({ error: '单次最多上报50条行为' }, 400, origin);
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

      const feed = await exploreEngine.generateExploreFeed(env.DB, profile, category, page);
      return jsonResponse(feed, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '探索流获取失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/promotions — 获取推广位
  if (method === 'GET' && pathname === '/api/promotions') {
    const url = new URL(request.url);
    const slotName = url.searchParams.get('slot') || 'home';

    try {
      const promos = await env.DB.prepare(
        `SELECT * FROM promotion_slots
         WHERE slot_name = ? AND is_active = 1
           AND (start_at IS NULL OR start_at <= datetime('now'))
           AND (end_at IS NULL OR end_at >= datetime('now'))
         ORDER BY weight DESC`
      ).bind(slotName).all();

      return jsonResponse({ promotions: promos.results || [] }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '推广位获取失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/search/suggestions — 搜索建议
  if (method === 'GET' && pathname === '/api/search/suggestions') {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    if (!q || q.length < 2) return jsonResponse({ suggestions: [] }, 200, origin);

    try {
      const results = await bangumiSearch.search(env.DB, q, 0, { limit: 8 });
      const suggestions = (results || []).map(r => ({
        id: r.id, name: r.name, name_cn: r.name_cn,
        type: r.type, score: r.score,
      }));
      return jsonResponse({ suggestions }, 200, origin);
    } catch (err) {
      return jsonResponse({ suggestions: [] }, 200, origin);
    }
  }

  // GET /api/profile/short — 获取短期画像
  if (method === 'GET' && pathname === '/api/profile/short') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const shortProfile = await behaviorCollector.computeShortProfile(env.DB, authUser.userId);
      return jsonResponse(shortProfile, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '短期画像获取失败: ' + err.message }, 500, origin);
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

  // ─── 创作者主页 API ──────────────────────────────────

  // GET /api/users/:id/portfolio — 创作者主页（作品集+统计）
  const portfolioMatch = pathname.match(/^\/api\/users\/(\d+)\/portfolio$/);
  if (portfolioMatch && method === 'GET') {
    const userId = Number(portfolioMatch[1]);

    try {
      // 用户基本信息
      const user = await env.DB.prepare(
        'SELECT id, name, avatar, bio, banner_image, commission_status, created_at FROM users WHERE id = ?'
      ).bind(userId).first();
      if (!user) return jsonResponse({ error: '用户不存在' }, 404, origin);

      // 作品列表（公开可见）
      const works = await env.DB.prepare(
        `SELECT w.*, u.name AS author_name, u.avatar AS author_avatar
         FROM works w JOIN users u ON w.author_id = u.id
         WHERE w.author_id = ? AND w.is_visible = 1 AND w.visibility != 'private'
         ORDER BY w.created_at DESC LIMIT 50`
      ).bind(userId).all();

      // 统计计数
      const stats = await env.DB.prepare(
        `SELECT
           COUNT(*) AS total_works,
           SUM(views_count) AS total_views,
           SUM(likes_count) AS total_likes,
           SUM(favorites_count) AS total_favorites
         FROM works WHERE author_id = ? AND is_visible = 1`
      ).bind(userId).first();

      // 按类型分组作品
      const worksByType = { illustration: [], novel: [], manga: [], galgame: [] };
      for (const w of works.results) {
        if (worksByType[w.type]) worksByType[w.type].push(w);
      }

      return jsonResponse({
        user: {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          bio: user.bio,
          banner_image: user.banner_image,
          commission_status: user.commission_status,
          created_at: user.created_at,
        },
        stats: {
          total_works: stats.total_works || 0,
          total_views: stats.total_views || 0,
          total_likes: stats.total_likes || 0,
          total_favorites: stats.total_favorites || 0,
        },
        portfolio: worksByType,
      }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取创作者主页失败: ' + err.message }, 500, origin);
    }
  }

  // ─── 关注动态流 API ──────────────────────────────────

  // GET /api/feed — 关注创作者的动态流
  if (method === 'GET' && pathname === '/api/feed') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit')) || 20));
    const offset = (page - 1) * limit;

    try {
      const feed = await env.DB.prepare(
        `SELECT uf.*, w.title, w.type, w.cover_image,
                u.name AS creator_name, u.avatar AS creator_avatar
         FROM user_feed uf
         JOIN works w ON uf.work_id = w.id
         JOIN users u ON uf.creator_id = u.id
         WHERE uf.user_id = ?
         ORDER BY uf.created_at DESC
         LIMIT ? OFFSET ?`
      ).bind(authUser.userId, limit, offset).all();

      // 标记为已读
      context.waitUntil(
        env.DB.prepare(
          'UPDATE user_feed SET is_read = 1 WHERE user_id = ? AND is_read = 0'
        ).bind(authUser.userId).run()
      );

      return jsonResponse({ feed: feed.results, page, limit }, 200, origin);
    } catch (err) {
      return jsonResponse({ feed: [], page, limit }, 200, origin);
    }
  }

  // ─── 系列 API ──────────────────────────────────

  // POST /api/series — 创建系列
  if (method === 'POST' && pathname === '/api/series') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { title, description, cover_image } = body;
      if (!title) return jsonResponse({ error: '系列标题不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO work_series (creator_id, title, description, cover_image) VALUES (?, ?, ?, ?)'
      ).bind(authUser.userId, title, description || '', cover_image || '').run();

      const series = await env.DB.prepare('SELECT * FROM work_series WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(series, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建系列失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/series/:id — 系列详情
  const seriesMatch = pathname.match(/^\/api\/series\/(\d+)$/);
  if (seriesMatch && method === 'GET') {
    const seriesId = Number(seriesMatch[1]);

    try {
      const series = await env.DB.prepare(
        'SELECT s.*, u.name AS creator_name, u.avatar AS creator_avatar FROM work_series s JOIN users u ON s.creator_id = u.id WHERE s.id = ?'
      ).bind(seriesId).first();
      if (!series) return jsonResponse({ error: '系列不存在' }, 404, origin);

      // 获取系列中的作品
      const works = await env.DB.prepare(
        `SELECT w.*, sw.sort_order, u.name AS author_name, u.avatar AS author_avatar
         FROM series_works sw
         JOIN works w ON sw.work_id = w.id
         JOIN users u ON w.author_id = u.id
         WHERE sw.series_id = ?
         ORDER BY sw.sort_order ASC`
      ).bind(seriesId).all();

      return jsonResponse({ ...series, works: works.results }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '获取系列失败: ' + err.message }, 500, origin);
    }
  }

  // PUT /api/series/:id — 更新系列
  if (seriesMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const seriesId = Number(seriesMatch[1]);

    const series = await env.DB.prepare('SELECT creator_id FROM work_series WHERE id = ?').bind(seriesId).first();
    if (!series) return jsonResponse({ error: '系列不存在' }, 404, origin);
    if (series.creator_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    try {
      const body = await request.json();
      const { title, description, cover_image } = body;
      await env.DB.prepare(
        'UPDATE work_series SET title = ?, description = ?, cover_image = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(title, description || '', cover_image || '', seriesId).run();

      const updated = await env.DB.prepare('SELECT * FROM work_series WHERE id = ?').bind(seriesId).first();
      return jsonResponse(updated, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新系列失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/series/:id — 删除系列
  if (seriesMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const seriesId = Number(seriesMatch[1]);

    const series = await env.DB.prepare('SELECT creator_id FROM work_series WHERE id = ?').bind(seriesId).first();
    if (!series) return jsonResponse({ error: '系列不存在' }, 404, origin);
    if (series.creator_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    await env.DB.prepare('DELETE FROM series_works WHERE series_id = ?').bind(seriesId).run();
    await env.DB.prepare('DELETE FROM work_series WHERE id = ?').bind(seriesId).run();
    return jsonResponse({ success: true }, 200, origin);
  }

  // POST /api/series/:id/works — 添加作品到系列
  const seriesWorkMatch = pathname.match(/^\/api\/series\/(\d+)\/works$/);
  if (seriesWorkMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const seriesId = Number(seriesWorkMatch[1]);

    const series = await env.DB.prepare('SELECT creator_id FROM work_series WHERE id = ?').bind(seriesId).first();
    if (!series) return jsonResponse({ error: '系列不存在' }, 404, origin);
    if (series.creator_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    try {
      const body = await request.json();
      const { work_id } = body;
      if (!work_id) return jsonResponse({ error: '请提供作品ID' }, 400, origin);

      // 获取当前最大排序
      const maxOrder = await env.DB.prepare(
        'SELECT MAX(sort_order) AS max_order FROM series_works WHERE series_id = ?'
      ).bind(seriesId).first();
      const nextOrder = (maxOrder?.max_order ?? -1) + 1;

      await env.DB.prepare(
        'INSERT OR IGNORE INTO series_works (series_id, work_id, sort_order) VALUES (?, ?, ?)'
      ).bind(seriesId, work_id, nextOrder).run();

      // 更新作品的 series_id
      await env.DB.prepare('UPDATE works SET series_id = ? WHERE id = ?').bind(seriesId, work_id).run();

      const works = await env.DB.prepare(
        'SELECT sw.*, w.title, w.type FROM series_works sw JOIN works w ON sw.work_id = w.id WHERE sw.series_id = ? ORDER BY sw.sort_order ASC'
      ).bind(seriesId).all();

      return jsonResponse({ works: works.results }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '添加作品失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/series/:id/works/:workId — 从系列移除作品
  const seriesWorkDelMatch = pathname.match(/^\/api\/series\/(\d+)\/works\/(\d+)$/);
  if (seriesWorkDelMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const seriesId = Number(seriesWorkDelMatch[1]);
    const workId = Number(seriesWorkDelMatch[2]);

    const series = await env.DB.prepare('SELECT creator_id FROM work_series WHERE id = ?').bind(seriesId).first();
    if (!series) return jsonResponse({ error: '系列不存在' }, 404, origin);
    if (series.creator_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    await env.DB.prepare('DELETE FROM series_works WHERE series_id = ? AND work_id = ?').bind(seriesId, workId).run();
    await env.DB.prepare('UPDATE works SET series_id = NULL WHERE id = ? AND series_id = ?').bind(workId, seriesId).run();

    return jsonResponse({ success: true }, 200, origin);
  }

  // ─── 约稿企划 API ──────────────────────────────────

  // POST /api/commissions — 创建约稿企划
  if (method === 'POST' && pathname === '/api/commissions') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { title, description, budget_min, budget_max, deadline, category, requirements } = body;
      if (!title || !description) return jsonResponse({ error: '标题和描述不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        `INSERT INTO commissions (creator_id, title, description, budget_min, budget_max, deadline, category, requirements, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`
      ).bind(authUser.userId, title, description, budget_min || null, budget_max || null,
        deadline || null, category || 'illustration', requirements || '').run();

      const commission = await env.DB.prepare(
        'SELECT c.*, u.name AS creator_name, u.avatar AS creator_avatar FROM commissions c JOIN users u ON c.creator_id = u.id WHERE c.id = ?'
      ).bind(result.meta.last_row_id).first();

      return jsonResponse(commission, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建企划失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/commissions — 约稿列表
  if (method === 'GET' && pathname === '/api/commissions') {
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit')) || 20));
    const category = sp.get('category') || '';
    const status = sp.get('status') || 'open';
    const offset = (page - 1) * limit;

    const conditions = ['status = ?'];
    const bindParams = [status];
    if (category) { conditions.push('category = ?'); bindParams.push(category); }

    const where = conditions.join(' AND ');
    const commissions = await env.DB.prepare(
      `SELECT c.*, u.name AS creator_name, u.avatar AS creator_avatar
       FROM commissions c JOIN users u ON c.creator_id = u.id
       WHERE ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
    ).bind(...bindParams, limit, offset).all();

    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM commissions WHERE ${where}`
    ).bind(...bindParams).first();

    return jsonResponse({
      commissions: commissions.results,
      page, limit,
      total: countResult.cnt,
    }, 200, origin);
  }

  // GET /api/commissions/:id — 约稿详情
  const commMatch = pathname.match(/^\/api\/commissions\/(\d+)$/);
  if (commMatch && method === 'GET') {
    const commId = Number(commMatch[1]);
    const commission = await env.DB.prepare(
      `SELECT c.*, u.name AS creator_name, u.avatar AS creator_avatar
       FROM commissions c JOIN users u ON c.creator_id = u.id WHERE c.id = ?`
    ).bind(commId).first();
    if (!commission) return jsonResponse({ error: '企划不存在' }, 404, origin);

    // 获取响应列表
    const responses = await env.DB.prepare(
      `SELECT cr.*, u.name AS responder_name, u.avatar AS responder_avatar
       FROM commission_responses cr JOIN users u ON cr.responder_id = u.id
       WHERE cr.commission_id = ? ORDER BY cr.created_at DESC`
    ).bind(commId).all();

    return jsonResponse({ ...commission, responses: responses.results }, 200, origin);
  }

  // PUT /api/commissions/:id — 更新约稿
  if (commMatch && method === 'PUT') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const commId = Number(commMatch[1]);

    const comm = await env.DB.prepare('SELECT creator_id FROM commissions WHERE id = ?').bind(commId).first();
    if (!comm) return jsonResponse({ error: '企划不存在' }, 404, origin);
    if (comm.creator_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    try {
      const body = await request.json();
      const { title, description, budget_min, budget_max, deadline, status, category, requirements } = body;
      await env.DB.prepare(
        `UPDATE commissions SET title=?, description=?, budget_min=?, budget_max=?, deadline=?, status=?, category=?, requirements=?, updated_at=datetime('now') WHERE id=?`
      ).bind(title, description, budget_min || null, budget_max || null,
        deadline || null, status || 'open', category || 'illustration', requirements || '', commId).run();

      const updated = await env.DB.prepare('SELECT * FROM commissions WHERE id = ?').bind(commId).first();
      return jsonResponse(updated, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '更新失败: ' + err.message }, 500, origin);
    }
  }

  // DELETE /api/commissions/:id — 删除约稿
  if (commMatch && method === 'DELETE') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const commId = Number(commMatch[1]);

    const comm = await env.DB.prepare('SELECT creator_id FROM commissions WHERE id = ?').bind(commId).first();
    if (!comm) return jsonResponse({ error: '企划不存在' }, 404, origin);
    if (comm.creator_id !== authUser.userId) return jsonResponse({ error: '无权操作' }, 403, origin);

    await env.DB.prepare('DELETE FROM commission_responses WHERE commission_id = ?').bind(commId).run();
    await env.DB.prepare('DELETE FROM commissions WHERE id = ?').bind(commId).run();
    return jsonResponse({ success: true }, 200, origin);
  }

  // POST /api/commissions/:id/respond — 应征约稿
  const commRespondMatch = pathname.match(/^\/api\/commissions\/(\d+)\/respond$/);
  if (commRespondMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const commId = Number(commRespondMatch[1]);

    const comm = await env.DB.prepare('SELECT * FROM commissions WHERE id = ?').bind(commId).first();
    if (!comm) return jsonResponse({ error: '企划不存在' }, 404, origin);
    if (comm.status !== 'open') return jsonResponse({ error: '该企划已关闭' }, 400, origin);

    try {
      const body = await request.json();
      const { message, price, timeline } = body;
      if (!message) return jsonResponse({ error: '请填写应征说明' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO commission_responses (commission_id, responder_id, message, price, timeline) VALUES (?, ?, ?, ?, ?)'
      ).bind(commId, authUser.userId, message, price || null, timeline || '').run();

      const response = await env.DB.prepare(
        'SELECT cr.*, u.name AS responder_name, u.avatar AS responder_avatar FROM commission_responses cr JOIN users u ON cr.responder_id = u.id WHERE cr.id = ?'
      ).bind(result.meta.last_row_id).first();

      return jsonResponse(response, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '应征失败: ' + err.message }, 500, origin);
    }
  }

  // ─── 作品讨论区 API ──────────────────────────────────

  // GET /api/works/:id/discussions — 作品讨论帖列表
  const worksDiscussionsMatch = pathname.match(/^\/api\/works\/(\d+)\/discussions$/);
  if (worksDiscussionsMatch && method === 'GET') {
    const workId = Number(worksDiscussionsMatch[1]);
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit')) || 20));
    const offset = (page - 1) * limit;

    const posts = await env.DB.prepare(
      `SELECT p.*, u.name AS author_name, u.avatar AS author_avatar
       FROM posts p JOIN users u ON p.author_id = u.id
       WHERE p.work_id = ? AND p.is_visible = 1
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
    ).bind(workId, limit, offset).all();

    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM posts WHERE work_id = ? AND is_visible = 1'
    ).bind(workId).first();

    return jsonResponse({ posts: posts.results, total: countResult.cnt, page, limit }, 200, origin);
  }

  // ─── 读者感想 API ──────────────────────────────────

  // POST /api/works/:id/impressions — 提交读者感想
  const impressionsMatch = pathname.match(/^\/api\/works\/(\d+)\/impressions$/);
  if (impressionsMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const workId = Number(impressionsMatch[1]);

    try {
      const body = await request.json();
      const { content, is_spoiler } = body;
      if (!content) return jsonResponse({ error: '感想内容不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO reader_impressions (work_id, user_id, content, is_spoiler) VALUES (?, ?, ?, ?)'
      ).bind(workId, authUser.userId, content, is_spoiler ? 1 : 0).run();

      const impression = await env.DB.prepare(
        'SELECT ri.*, u.name AS user_name, u.avatar AS user_avatar FROM reader_impressions ri JOIN users u ON ri.user_id = u.id WHERE ri.id = ?'
      ).bind(result.meta.last_row_id).first();

      return jsonResponse(impression, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '提交感想失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/works/:id/impressions — 读者感想列表
  if (impressionsMatch && method === 'GET') {
    const workId = Number(impressionsMatch[1]);
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number(sp.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit')) || 20));
    const offset = (page - 1) * limit;

    const impressions = await env.DB.prepare(
      `SELECT ri.*, u.name AS user_name, u.avatar AS user_avatar
       FROM reader_impressions ri JOIN users u ON ri.user_id = u.id
       WHERE ri.work_id = ? ORDER BY ri.likes_count DESC, ri.created_at DESC LIMIT ? OFFSET ?`
    ).bind(workId, limit, offset).all();

    return jsonResponse({ impressions: impressions.results, page, limit }, 200, origin);
  }

  // 未匹配的 API 路由
  return null;
}

// ─── Rate Limiter (H-7) ──────────────────────────────────

const RL_WINDOW_MS = 60 * 1000; // 60 秒滑动窗口

// 各端点每分钟限制
const RL_LIMITS = {
  '/api/auth/login': 5,
  '/api/posts': 10,       // 创建帖子/回复
  '/api/uploads': 20,     // 图片上传
  '/api/world-messages': 20,
  '/api/private-messages': 20,
  '/api/mails': 10,
  '/api/users': 10,
  '/api/collections': 20,
  '/api/follows': 20,
  '/api/ratings': 20,
  '/api/favorites': 20,
  '/api/friends': 20,
  '/api/friend-posts': 20,
  '/api/works': 20,       // 作品创建/编辑/互动
  '/api/reading-progress': 30, // 阅读进度更新
  '/api/invites': 5,      // 邀请码相关操作
  '/api/permissions': 10, // 权限管理操作
};

const rlStore = new Map(); // key: `${ip}:${pathGroup}`, value: { count, resetAt }

function getRateLimitKey(ip, pathname) {
  // 将具体路径归并到组，返回 { key, limit }
  for (const prefix of Object.keys(RL_LIMITS)) {
    if (pathname.startsWith(prefix)) return { key: `${ip}:${prefix}`, limit: RL_LIMITS[prefix] };
  }
  return null;
}

function checkRateLimit(ip, pathname) {
  const result = getRateLimitKey(ip, pathname);
  if (!result) return true; // 不在限制列表，放行

  const { key, limit } = result;
  const now = Date.now();
  let entry = rlStore.get(key);

  // 清理过期条目
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RL_WINDOW_MS };
    rlStore.set(key, entry);
  }

  entry.count++;

  // 每 ~1% 请求时清理过期条目
  if (Math.random() < 0.01) {
    for (const [k, v] of rlStore) {
      if (v.resetAt < now) rlStore.delete(k);
    }
  }

  return entry.count <= limit;
}

// ─── 主入口 ──────────────────────────────────────────────────

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 验证来源（H-2：精确匹配）
    const allowedOrigin = env.ALLOWED_ORIGIN || '';
    if (!isAllowedOrigin(origin, allowedOrigin)) {
      return jsonResponse({ error: '来源不被允许' }, 403, origin);
    }

    // H-7: Rate Limit — 写操作限流
    if (request.method !== 'GET' && request.method !== 'OPTIONS') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (!checkRateLimit(ip, url.pathname)) {
        return new Response('Too Many Requests', { status: 429 });
      }
    }

    // ── Worker API 路由 ──
    if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/users/') || url.pathname.startsWith('/api/subjects/') || url.pathname.startsWith('/api/posts') || url.pathname.startsWith('/api/uploads') || url.pathname.startsWith('/api/collections') || url.pathname.startsWith('/api/follows') || url.pathname.startsWith('/api/notifications') || url.pathname.startsWith('/api/world-messages') || url.pathname.startsWith('/api/news') || url.pathname.startsWith('/api/ratings') || url.pathname.startsWith('/api/favorites') || url.pathname.startsWith('/api/mails') || url.pathname.startsWith('/api/private-messages') || url.pathname.startsWith('/api/friends') || url.pathname.startsWith('/api/friend-posts') || url.pathname.startsWith('/api/user-guestbook') || url.pathname.startsWith('/api/bangumi-search') || url.pathname.startsWith('/api/bangumi-sync') || url.pathname.startsWith('/api/works') || url.pathname.startsWith('/api/reading-progress') || url.pathname.startsWith('/api/invites') || url.pathname.startsWith('/api/permissions') || url.pathname.startsWith('/api/profile') || url.pathname.startsWith('/api/recommend') || url.pathname.startsWith('/api/behavior') || url.pathname.startsWith('/api/explore') || url.pathname.startsWith('/api/promotions') || url.pathname.startsWith('/api/search/suggestions')) {
      const result = await handleApiRoutes(url.pathname, request, env, origin, context);
      if (result) return result;
    }

    // Bangumi 图片代理：/api/bangumi/image?url=...
    if (url.pathname === '/api/bangumi/image') {
      const imageUrl = url.searchParams.get('url');
      if (!imageUrl) return jsonResponse({ error: '缺少 url 参数' }, 400, origin);
      // 只允许代理 Bangumi 图片域名
      const allowedHosts = ['lain.bgm.tv', 'bgm.tv', 'api.bgm.tv'];
      try {
        const parsedUrl = new URL(imageUrl);
        if (!allowedHosts.some(h => parsedUrl.hostname.endsWith(h))) {
          return jsonResponse({ error: '不允许的图片域名' }, 403, origin);
        }
      } catch {
        return jsonResponse({ error: '无效的 URL' }, 400, origin);
      }

      // 检查缓存
      const cache = caches.default;
      const cacheKey = new Request(imageUrl, { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-Cache', 'HIT');
        headers.set('Cache-Control', 'public, max-age=86400');
        Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
        return new Response(cached.body, { status: cached.status, headers });
      }

      try {
        const imgRes = await fetch(imageUrl, {
          headers: { 'User-Agent': 'ANISpace/1.0', 'Referer': 'https://bgm.tv/' },
        });
        const contentType = imgRes.headers.get('Content-Type') || 'image/jpeg';
        const body = await imgRes.arrayBuffer();
        const resHeaders = new Headers();
        resHeaders.set('Content-Type', contentType);
        resHeaders.set('Cache-Control', 'public, max-age=86400');
        resHeaders.set('X-Cache', 'MISS');
        Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

        // 缓存图片
        if (imgRes.ok) {
          const cacheResponse = new Response(body, {
            status: imgRes.status,
            headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' },
          });
          try { await cache.put(cacheKey, cacheResponse); } catch {}
        }

        return new Response(body, { status: imgRes.status, headers: resHeaders });
      } catch (err) {
        return jsonResponse({ error: '图片代理失败: ' + err.message }, 502, origin);
      }
    }

    // Bangumi API 代理：/api/bangumi/*
    if (url.pathname.startsWith('/api/bangumi/')) {
      const bangumiPath = url.pathname.replace('/api/bangumi', '');
      return handleBangumiProxy(bangumiPath, url.searchParams, request, env, origin);
    }

    // AniBT API 代理：/api/anibt/*
    if (url.pathname.startsWith('/api/anibt/')) {
      const anibtPath = url.pathname.replace('/api/anibt', '');
      return handleAnibtProxy(anibtPath, url.searchParams, request, env, origin);
    }

    // Hikarinagi API 代理：/api/hikarinagi/*
    if (url.pathname.startsWith('/api/hikarinagi/')) {
      const hikariPath = url.pathname.replace('/api/hikarinagi', '');
      return handleHikarinagiProxy(hikariPath, url.searchParams, request, env, origin);
    }

    // Jikan API 代理 (MyAnimeList)：/api/jikan/*
    if (url.pathname.startsWith('/api/jikan/')) {
      const jikanPath = url.pathname.replace('/api/jikan', '');
      return handleJikanProxy(jikanPath, url.searchParams, request, env, origin);
    }

    // trace.moe API 代理 (番剧识别)：/api/tracemoe/*
    if (url.pathname.startsWith('/api/tracemoe/')) {
      const tracemoePath = url.pathname.replace('/api/tracemoe', '');
      return handleTraceMoeProxy(tracemoePath, url.searchParams, request, env, origin);
    }

    // Kitsu API 代理：/api/kitsu/*
    if (url.pathname.startsWith('/api/kitsu/')) {
      const kitsuPath = url.pathname.replace('/api/kitsu', '');
      return handleKitsuProxy(kitsuPath, url.searchParams, request, env, origin);
    }

    // wenku8 轻小说代理：/api/wenku8/*
    if (url.pathname.startsWith('/api/wenku8/')) {
      return handleWenku8Proxy(url.pathname.replace('/api/wenku8', ''), url.searchParams, request, env, origin);
    }

    // DanDanPlay 弹幕代理：/api/danmaku/comment/:episodeId
    // Proxies DanDanPlay API to bypass CORS restrictions
    if (url.pathname.startsWith('/api/danmaku/comment/')) {
      const episodeId = url.pathname.replace('/api/danmaku/comment/', '');
      if (!episodeId) {
        return jsonResponse({ error: '缺少 episodeId' }, 400, origin);
      }

      try {
        const dandanUrl = `https://api.dandanplay.net/api/v2/comment/${encodeURIComponent(episodeId)}?withRelated=true&chConvert=1`;
        const res = await fetch(dandanUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'ANISpace-Proxy/1.0',
          },
        });

        const data = await res.text();
        return new Response(data, {
          status: res.status,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': origin || '*',
            'Cache-Control': 'public, max-age=300', // Cache 5 minutes
          },
        });
      } catch (err) {
        return jsonResponse({ error: '弹幕服务异常: ' + err.message }, 502, origin);
      }
    }

    // Bangumi token 交换
    if (url.pathname === '/oauth/bangumi/token') {
      const code = url.searchParams.get('code');
      if (!code) return jsonResponse({ error: '缺少 code 参数' }, 400, origin);

      // H-3: 校验 redirect_uri 仅允许白名单路径
      const redirectUri = validateRedirectUri(
        url.searchParams.get('redirect_uri'),
        allowedOrigin
      ) || `${allowedOrigin}/auth/bangumi`;

      try {
        const result = await handleBangumiToken(code, redirectUri, env);
        if (result.error) return jsonResponse(result, 400, origin);
        return jsonResponse(result, 200, origin);
      } catch (err) {
        return jsonResponse({ error: 'Bangumi 授权服务异常' }, 500, origin);
      }
    }

    // Bangumi token 刷新
    if (url.pathname === '/oauth/bangumi/refresh') {
      const refreshToken = url.searchParams.get('refresh_token');
      if (!refreshToken) return jsonResponse({ error: '缺少 refresh_token 参数' }, 400, origin);

      try {
        const result = await bangumiSync.refreshBangumiToken(refreshToken, env);
        if (result.error) return jsonResponse(result, 400, origin);
        return jsonResponse(result, 200, origin);
      } catch (err) {
        return jsonResponse({ error: 'Bangumi token 刷新异常' }, 500, origin);
      }
    }

    // GitHub token 交换
    if (url.pathname === '/oauth/github/token') {
      const code = url.searchParams.get('code');
      if (!code) return jsonResponse({ error: '缺少 code 参数' }, 400, origin);

      // H-3: 校验 redirect_uri 仅允许白名单路径
      const redirectUri = validateRedirectUri(
        url.searchParams.get('redirect_uri'),
        allowedOrigin
      ) || `${allowedOrigin}/auth/github`;

      try {
        const result = await handleGithubToken(code, redirectUri, env);
        if (result.error) return jsonResponse(result, 400, origin);
        return jsonResponse(result, 200, origin);
      } catch (err) {
        console.error('GitHub token exchange error:', err.message, err.stack);
        return jsonResponse({ error: `GitHub 授权服务异常: ${err.message}` }, 500, origin);
      }
    }

    // Video stream proxy: /api/video/stream?url=xxx&referer=xxx
    // Proxies video stream (m3u8/ts/mp4) to bypass CORS restrictions
    if (url.pathname === '/api/video/stream') {
      const streamUrl = url.searchParams.get('url');
      if (!streamUrl) {
        return jsonResponse({ error: '缺少 url 参数' }, 400, origin);
      }

      // SSRF protection (allow HTTP for video streams from CDNs)
      const streamUrlObj = new URL(streamUrl);
      const streamHost = streamUrlObj.hostname.toLowerCase();
      // 仅允许 http/https，禁止 file:、gopher: 等协议
      const okProtocol = streamUrlObj.protocol === 'http:' || streamUrlObj.protocol === 'https:';
      // Block internal/private IPs — use proper IP range checks, not hostname prefix matching
      // (hostname prefix like '172.2' would incorrectly block legitimate domains)
      const isPrivateIp = /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(streamHost)
        || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(streamHost)
        || streamHost === 'localhost'
        || streamHost === '[::1]';
      // Block internal/metadata hostnames (cloud metadata, *.internal, *.local)
      const isInternalHost = streamHost === 'metadata.google.internal'
        || streamHost === 'metadata.google.internal.'
        || streamHost === 'metadata'
        || streamHost.endsWith('.internal')
        || streamHost.endsWith('.local');
      if (!okProtocol || isPrivateIp || isInternalHost) {
        return jsonResponse({ error: '目标URL不安全，禁止访问' }, 403, origin);
      }

      // Use referer parameter if provided, otherwise derive from stream URL
      const referer = url.searchParams.get('referer') || streamUrlObj.origin + '/';

      try {
        const res = await fetch(streamUrl, {
          redirect: 'follow', // Follow 302/301 redirects from CDN
          headers: {
            'User-Agent': 'ANISpace/1.0',
            'Accept': '*/*',
            'Referer': referer,
            'Origin': streamUrlObj.origin,
          },
        });

        const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
        const resHeaders = new Headers();
        resHeaders.set('Content-Type', contentType);
        resHeaders.set('Access-Control-Allow-Origin', origin || '*');
        resHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        resHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        resHeaders.set('Cache-Control', 'public, max-age=3600');

        // For m3u8 playlists, rewrite relative URLs to go through proxy
        if (contentType.includes('mpegurl') || streamUrl.endsWith('.m3u8')) {
          const text = await res.text();
          const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
          const refererParam = referer ? `&referer=${encodeURIComponent(referer)}` : '';
          // Use full Worker URL prefix so HLS.js resolves ts segments correctly
          // (relative paths like /api/video/stream would resolve to the frontend domain, not the Worker)
          const workerOrigin = url.origin;
          const rewritten = text.replace(/^(?!https?:\/\/)([^\s#]+)/gm, (match) => {
            const absoluteUrl = baseUrl + match;
            return `${workerOrigin}/api/video/stream?url=${encodeURIComponent(absoluteUrl)}${refererParam}`;
          });
          return new Response(rewritten, { status: res.status, headers: resHeaders });
        }

        // For binary streams (ts, mp4, etc.), pass through directly
        return new Response(res.body, { status: res.status, headers: resHeaders });
      } catch (err) {
        return jsonResponse({ error: '视频流代理请求失败' }, 500, origin);
      }
    }

    // Video source proxy: /api/video/proxy
    // Proxies requests to MacCMS API sources to avoid CORS issues
    if (url.pathname === '/api/video/proxy') {
      const baseUrl = url.searchParams.get('baseUrl');
      const path = url.searchParams.get('path');
      if (!baseUrl || !path) {
        return jsonResponse({ error: '缺少 baseUrl 或 path 参数' }, 400, origin);
      }

      // Rebuild the remaining query params (ac, wd, ids, etc.)
      const params = new URLSearchParams(url.search);
      params.delete('baseUrl');
      params.delete('path');

      const targetUrl = `${baseUrl}${path}${params.toString() ? '?' + params.toString() : ''}`;

      // SSRF protection - allow HTTP for MacCMS API sources but block internal IPs
      try {
        const targetUrlObj = new URL(targetUrl);
        const targetHost = targetUrlObj.hostname.toLowerCase();
        // Block internal/private IPs
        if (targetHost === 'localhost' || targetHost === '127.0.0.1' || targetHost === '[::1]' ||
            targetHost.startsWith('192.168.') || targetHost.startsWith('10.') ||
            targetHost.startsWith('172.16.') || targetHost.startsWith('172.17.') ||
            targetHost.startsWith('172.18.') || targetHost.startsWith('172.19.') ||
            targetHost.startsWith('172.20.') || targetHost.startsWith('172.21.') ||
            targetHost.startsWith('172.22.') || targetHost.startsWith('172.23.') ||
            targetHost.startsWith('172.24.') || targetHost.startsWith('172.25.') ||
            targetHost.startsWith('172.26.') || targetHost.startsWith('172.27.') ||
            targetHost.startsWith('172.28.') || targetHost.startsWith('172.29.') ||
            targetHost.startsWith('172.30.') || targetHost.startsWith('172.31.') ||
            targetHost.startsWith('169.254.') || targetHost.endsWith('.internal')) {
          return jsonResponse({ error: '目标URL不安全，禁止访问' }, 403, origin);
        }
      } catch {
        return jsonResponse({ error: '无效的目标URL' }, 400, origin);
      }

      // Check cache first
      const cache = caches.default;
      const cacheKey = new Request(targetUrl, { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-Cache', 'HIT');
        Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
        return new Response(cached.body, { status: cached.status, headers });
      }

      try {
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'ANISpace/1.0',
            'Accept': 'application/json',
          },
        });
        const body = await res.text();

        // Validate that the response is valid JSON (not a Cloudflare error page)
        let isJson = false;
        try {
          JSON.parse(body);
          isJson = true;
        } catch {}

        if (!isJson) {
          // Return a structured error instead of passing through HTML error pages
          return jsonResponse({
            code: 500,
            msg: `源站返回非JSON响应 (HTTP ${res.status})`,
            list: [],
            total: 0,
          }, 200, origin);
        }

        const resHeaders = new Headers();
        resHeaders.set('Content-Type', 'application/json');
        resHeaders.set('X-Cache', 'MISS');
        Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

        // Cache successful responses for 5 minutes
        if (res.ok) {
          const cacheResponse = new Response(body, {
            status: res.status,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': `public, max-age=${CACHE_TTL_SHORT}`,
            },
          });
          try { await cache.put(cacheKey, cacheResponse); } catch {}
        }

        return new Response(body, { status: res.status, headers: resHeaders });
      } catch (err) {
        return jsonResponse({ code: 500, msg: '视频源代理请求失败', list: [], total: 0 }, 200, origin);
      }
    }

    // DMHY HTML proxy: /api/video/dmhy?keyword=xxx
    // Proxies DMHY search results to bypass CORS restrictions
    if (url.pathname === '/api/video/dmhy') {
      const keyword = url.searchParams.get('keyword');
      if (!keyword) {
        return jsonResponse({ error: '缺少 keyword 参数' }, 400, origin);
      }

      const targetUrl = `https://share.dmhy.org/topics/list?keyword=${encodeURIComponent(keyword)}`;

      // Check cache first
      const cache = caches.default;
      const cacheKey = new Request(targetUrl, { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-Cache', 'HIT');
        Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
        return new Response(cached.body, { status: cached.status, headers });
      }

      try {
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'ANISpace/1.0',
            'Accept': 'text/html',
          },
        });
        const body = await res.text();

        const resHeaders = new Headers();
        resHeaders.set('Content-Type', 'text/html; charset=utf-8');
        resHeaders.set('X-Cache', 'MISS');
        Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

        // Cache successful responses for 5 minutes
        if (res.ok) {
          const cacheResponse = new Response(body, {
            status: res.status,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': `public, max-age=${CACHE_TTL_SHORT}`,
            },
          });
          try { await cache.put(cacheKey, cacheResponse); } catch {}
        }

        return new Response(body, { status: res.status, headers: resHeaders });
      } catch (err) {
        return jsonResponse({ error: 'DMHY 代理请求失败' }, 500, origin);
      }
    }

    // Mikan RSS proxy: /api/video/mikan?searchstr=xxx
    // Proxies Mikan RSS search results to bypass CORS restrictions
    if (url.pathname === '/api/video/mikan') {
      const searchstr = url.searchParams.get('searchstr');
      if (!searchstr) {
        return jsonResponse({ error: '缺少 searchstr 参数' }, 400, origin);
      }

      const targetUrl = `https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(searchstr)}`;

      // Check cache first
      const cache = caches.default;
      const cacheKey = new Request(targetUrl, { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('X-Cache', 'HIT');
        Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
        return new Response(cached.body, { status: cached.status, headers });
      }

      try {
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'ANISpace/1.0',
            'Accept': 'application/xml',
          },
        });
        const body = await res.text();

        const resHeaders = new Headers();
        resHeaders.set('Content-Type', 'application/xml; charset=utf-8');
        resHeaders.set('X-Cache', 'MISS');
        Object.entries(corsHeaders(origin)).forEach(([k, v]) => resHeaders.set(k, v));

        // Cache successful responses for 5 minutes
        if (res.ok) {
          const cacheResponse = new Response(body, {
            status: res.status,
            headers: {
              'Content-Type': 'application/xml; charset=utf-8',
              'Cache-Control': `public, max-age=${CACHE_TTL_SHORT}`,
            },
          });
          try { await cache.put(cacheKey, cacheResponse); } catch {}
        }

        return new Response(body, { status: res.status, headers: resHeaders });
      } catch (err) {
        return jsonResponse({ error: 'Mikan 代理请求失败' }, 500, origin);
      }
    }

    // ─── Selector 源：通用 CSS Selector 搜索 ─────────────────
    // POST /api/selector/search
    // 请求体: { searchUrl, selectors, keyword, baseUrl }
    // 返回: { items: [{ title, url, cover }], total }
    if (request.method === 'POST' && url.pathname === '/api/selector/search') {
      try {
        let body;
        try {
          body = await request.json();
        } catch {
          const text = await request.text();
          try { body = JSON.parse(text); } catch { return jsonResponse({ error: '请求体不是有效的 JSON' }, 400, origin); }
        }
        const { searchUrl, selectors, keyword, baseUrl } = body;
        if (!searchUrl || !keyword || !selectors) {
          return jsonResponse({ error: '缺少必要参数' }, 400, origin);
        }

        const targetUrl = searchUrl.replace('{keyword}', encodeURIComponent(keyword));
        if (!isSafeTargetUrl(targetUrl)) {
          return jsonResponse({ error: '目标 URL 不安全' }, 400, origin);
        }

        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html',
          },
        });
        const html = await res.text();

        // 使用 HTMLRewriter 解析 HTML
        const items = [];
        let currentItem = null;
        let inList = false;

        // 简单的 HTML 解析（Worker 中 HTMLRewriter 不支持 CSS 选择器，使用正则提取）
        // 使用 try-catch 包裹正则构造，防止用户传入无效正则导致 500
        let listRegex, itemRegex, titleRegex, linkRegex, coverRegex;
        try {
          listRegex = new RegExp(selectors.list || '<body>', 'i');
          itemRegex = new RegExp(selectors.item || '<a[^>]*>', 'gi');
          titleRegex = selectors.title ? new RegExp(selectors.title, 'i') : null;
          linkRegex = selectors.link ? new RegExp(selectors.link, 'i') : /href=["']([^"']+)["']/i;
          coverRegex = selectors.cover ? new RegExp(selectors.cover, 'i') : null;
        } catch (regexErr) {
          return jsonResponse({ error: `选择器正则语法错误: ${regexErr.message}` }, 400, origin);
        }

        // 使用更健壮的解析方式：提取所有匹配项
        const itemMatches = html.match(itemRegex) || [];
        for (const itemHtml of itemMatches.slice(0, 50)) {
          const titleMatch = titleRegex ? itemHtml.match(titleRegex) : itemHtml.match(/>([^<]+)</);
          const linkMatch = itemHtml.match(linkRegex);
          const coverMatch = coverRegex ? itemHtml.match(coverRegex) : itemHtml.match(/src=["']([^"']+)["']/i);

          if (titleMatch || linkMatch) {
            const title = titleMatch ? (titleMatch[1] || titleMatch[0]).trim() : '';
            let link = linkMatch ? linkMatch[1] : '';
            const cover = coverMatch ? coverMatch[1] : '';

            // 相对 URL 转绝对 URL
            if (link && !link.startsWith('http')) {
              const base = baseUrl || new URL(targetUrl).origin;
              link = link.startsWith('/') ? `${base}${link}` : `${base}/${link}`;
            }
            if (cover && !cover.startsWith('http')) {
              const base = baseUrl || new URL(targetUrl).origin;
              const absCover = cover.startsWith('/') ? `${base}${cover}` : `${base}/${cover}`;
              currentItem = { title, url: link, cover: absCover };
            } else {
              currentItem = { title, url: link, cover };
            }

            if (currentItem.title || currentItem.url) {
              items.push(currentItem);
            }
          }
        }

        return jsonResponse({ items, total: items.length }, 200, origin);
      } catch (err) {
        return jsonResponse({ error: `Selector 搜索失败: ${err.message}` }, 500, origin);
      }
    }

    // ─── Selector 源：剧集提取 ─────────────────────────────
    // POST /api/selector/episode
    // 请求体: { url, baseUrl, selectors }
    // 返回: { episodes: [{ title, url }] }
    if (request.method === 'POST' && url.pathname === '/api/selector/episode') {
      try {
        let body;
        try {
          body = await request.json();
        } catch {
          const text = await request.text();
          try { body = JSON.parse(text); } catch { return jsonResponse({ error: '请求体不是有效的 JSON' }, 400, origin); }
        }
        const { url: pageUrl, baseUrl, selectors } = body;
        if (!pageUrl || !selectors) {
          return jsonResponse({ error: '缺少必要参数' }, 400, origin);
        }

        if (!isSafeTargetUrl(pageUrl)) {
          return jsonResponse({ error: '目标 URL 不安全' }, 400, origin);
        }

        const res = await fetch(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
        });
        const html = await res.text();

        const episodes = [];
        let episodeItemRegex, episodeTitleRegex, episodeUrlRegex;
        try {
          episodeItemRegex = new RegExp(selectors.episodeItem || '<a[^>]*>', 'gi');
          episodeTitleRegex = selectors.episodeTitle ? new RegExp(selectors.episodeTitle, 'i') : />([^<]+)</;
          episodeUrlRegex = selectors.episodeUrl ? new RegExp(selectors.episodeUrl, 'i') : /href=["']([^"']+)["']/i;
        } catch (regexErr) {
          return jsonResponse({ error: `选择器正则语法错误: ${regexErr.message}` }, 400, origin);
        }

        const episodeMatches = html.match(episodeItemRegex) || [];
        for (const epHtml of episodeMatches.slice(0, 200)) {
          const titleMatch = epHtml.match(episodeTitleRegex);
          const urlMatch = epHtml.match(episodeUrlRegex);

          if (titleMatch || urlMatch) {
            const title = titleMatch ? (titleMatch[1] || titleMatch[0]).trim() : '';
            let epUrl = urlMatch ? urlMatch[1] : '';

            if (epUrl && !epUrl.startsWith('http')) {
              const base = baseUrl || new URL(pageUrl).origin;
              epUrl = epUrl.startsWith('/') ? `${base}${epUrl}` : `${base}/${epUrl}`;
            }

            if (title || epUrl) {
              episodes.push({ title, url: epUrl });
            }
          }
        }

        // 如果有 playSelectors，尝试提取 m3u8 链接
        if (selectors.videoSource && episodes.length > 0) {
          let videoSourceRegex;
          try {
            videoSourceRegex = new RegExp(selectors.videoSource, 'gi');
          } catch (regexErr) {
            return jsonResponse({ error: `视频源选择器正则语法错误: ${regexErr.message}` }, 400, origin);
          }
          const m3u8Matches = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi) || [];
          const mp4Matches = html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi) || [];
          const videoUrls = [...m3u8Matches, ...mp4Matches];

          if (videoUrls.length > 0) {
            // 将视频 URL 附加到剧集信息中
            for (let i = 0; i < episodes.length && i < videoUrls.length; i++) {
              episodes[i].videoUrl = videoUrls[i];
            }
          }
        }

        return jsonResponse({ episodes }, 200, origin);
      } catch (err) {
        return jsonResponse({ error: `剧集提取失败: ${err.message}` }, 500, origin);
      }
    }

    // ─── RSS 源：通用 RSS 获取 ─────────────────────────────
    // GET /api/rss/fetch?url=xxx
    // 返回: { items: [{ title, link, pubDate, size, description }] }
    if (request.method === 'GET' && url.pathname === '/api/rss/fetch') {
      const rssUrl = url.searchParams.get('url');
      if (!rssUrl) {
        return jsonResponse({ error: '缺少 url 参数' }, 400, origin);
      }

      if (!isSafeTargetUrl(rssUrl)) {
        return jsonResponse({ error: '目标 URL 不安全' }, 400, origin);
      }

      // Check cache
      try {
        const cache = caches.default;
        const cacheKey = new Request(rssUrl, { method: 'GET' });
        const cached = await cache.match(cacheKey);
        if (cached) {
          const data = await cached.json();
          const headers = new Headers();
          headers.set('Content-Type', 'application/json');
          headers.set('X-Cache', 'HIT');
          Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
          return new Response(JSON.stringify(data), { status: 200, headers });
        }
      } catch {}

      try {
        const res = await fetch(rssUrl, {
          headers: {
            'User-Agent': 'ANISpace/1.0',
            'Accept': 'application/xml, application/rss+xml, text/xml',
          },
        });
        const xml = await res.text();

        // 解析 RSS XML
        const items = [];
        const itemRegex = /<item[\s>]*>([\s\S]*?)<\/item>/gi;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(xml)) !== null) {
          const itemXml = itemMatch[1];
          const title = (itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
                        itemXml.match(/<title>([\s\S]*?)<\/title>/i))?.[1]?.trim() || '';
          const link = (itemXml.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i) ||
                       itemXml.match(/<link>([\s\S]*?)<\/link>/i))?.[1]?.trim() || '';
          const pubDate = (itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i))?.[1]?.trim() || '';
          const description = (itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ||
                              itemXml.match(/<description>([\s\S]*?)<\/description>/i))?.[1]?.trim() || '';
          const enclosure = itemXml.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*length=["']([^"']*)["']/i);
          const size = enclosure ? enclosure[2] : '';

          if (title) {
            items.push({
              title,
              link: enclosure ? enclosure[1] : link,
              pubDate,
              size,
              description: description.replace(/<[^>]+>/g, ''),
            });
          }
        }

        const data = { items, total: items.length };

        // Cache for 5 minutes
        const cacheResponse = new Response(JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${CACHE_TTL_SHORT}`,
          },
        });
        try { await cache.put(cacheKey, cacheResponse); } catch {}

        return jsonResponse(data, 200, origin);
      } catch (err) {
        return jsonResponse({ error: `RSS 获取失败: ${err.message}` }, 500, origin);
      }
    }

    // ─── Mikan 索引：Bangumi ID → Mikan 番剧 ─────────────
    // GET /api/mikan/subject/:bgmId
    // 返回: { bgmId, mikanId, items: [{ title, link, pubDate, size }] }
    if (request.method === 'GET' && url.pathname.match(/^\/api\/mikan\/subject\/\d+$/)) {
      const bgmId = url.pathname.split('/').pop();
      if (!bgmId) {
        return jsonResponse({ error: '缺少 Bangumi ID' }, 400, origin);
      }

      // 先通过 Mikan 搜索 Bangumi ID
      const searchUrl = `https://mikanani.me/Home/Search?searchstr=${encodeURIComponent(`bgm:${bgmId}`)}`;
      try {
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'ANISpace/1.0',
            'Accept': 'text/html',
          },
        });
        const html = await res.text();

        // 从搜索结果中提取番剧链接
        const subjectRegex = /href="\/Home\/Bangumi\/(\d+)"[^>]*>([^<]*)</gi;
        let subjectMatch;
        const subjects = [];
        while ((subjectMatch = subjectRegex.exec(html)) !== null) {
          subjects.push({ mikanId: subjectMatch[1], title: subjectMatch[2].trim() });
        }

        if (subjects.length === 0) {
          // 回退：用普通关键词搜索
          return jsonResponse({ bgmId, mikanId: null, items: [], hint: '未找到关联番剧，请使用关键词搜索' }, 200, origin);
        }

        // 获取第一个匹配番剧的 RSS
        const mikanId = subjects[0].mikanId;
        const rssUrl = `https://mikanani.me/RSS/MyBangumi?bangumiId=${mikanId}`;
        const rssRes = await fetch(rssUrl, {
          headers: {
            'User-Agent': 'ANISpace/1.0',
            'Accept': 'application/xml',
          },
        });
        const rssXml = await rssRes.text();

        // 解析 RSS
        const items = [];
        const itemRegex = /<item[\s>]*>([\s\S]*?)<\/item>/gi;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(rssXml)) !== null) {
          const itemXml = itemMatch[1];
          const title = (itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
                        itemXml.match(/<title>([\s\S]*?)<\/title>/i))?.[1]?.trim() || '';
          const link = (itemXml.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i) ||
                       itemXml.match(/<link>([\s\S]*?)<\/link>/i))?.[1]?.trim() || '';
          const enclosure = itemXml.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*length=["']([^"']*)["']/i);
          const pubDate = (itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i))?.[1]?.trim() || '';
          const size = enclosure ? enclosure[2] : '';

          if (title) {
            items.push({
              title,
              link: enclosure ? enclosure[1] : link,
              pubDate,
              size,
            });
          }
        }

        return jsonResponse({ bgmId, mikanId, items, total: items.length }, 200, origin);
      } catch (err) {
        return jsonResponse({ error: `Mikan 索引查询失败: ${err.message}` }, 500, origin);
      }
    }

    // ── LLM API 代理：/api/llm/chat/completions ──
    // 解决浏览器直接调用 LLM API 的 CORS 限制
    // 当前端不传 api_key 时，使用 Worker 环境变量 GLM_API_KEY（内置默认 Key，不暴露到前端）
    if (request.method === 'POST' && url.pathname === '/api/llm/chat/completions') {
      try {
        const body = await request.json();
        let { api_key, api_base, model, messages, stream, max_tokens, temperature } = body;

        // 内置默认：当前端使用 glm4 provider 且未传 api_key 时，使用环境变量
        if (!api_key && env.GLM_API_KEY) {
          api_key = env.GLM_API_KEY;
        }
        if (!api_base) {
          api_base = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
        }

        if (!api_key) {
          return jsonResponse({ error: '缺少 api_key 且未配置 GLM_API_KEY 环境变量' }, 400, origin);
        }

        // 只允许已知的 LLM API 域名，防止 SSRF
        const allowedLLMHosts = [
          'open.bigmodel.cn',     // 智谱 AI
          'api.openai.com',       // OpenAI
          'api.deepseek.com',     // DeepSeek
          'dashscope.aliyuncs.com', // 阿里通义
        ];
        try {
          const targetUrl = new URL(api_base);
          if (!allowedLLMHosts.some(h => targetUrl.hostname.endsWith(h))) {
            return jsonResponse({ error: '不允许的 LLM API 域名' }, 403, origin);
          }
        } catch {
          return jsonResponse({ error: '无效的 api_base URL' }, 400, origin);
        }

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_key}`,
        };

        const requestBody = {
          model: model || 'glm-4-flash',
          messages,
          ...(stream !== undefined && { stream }),
          ...(max_tokens !== undefined && { max_tokens }),
          ...(temperature !== undefined && { temperature }),
        };

        if (stream) {
          // 流式响应：透传 SSE
          const upstream = await fetch(api_base, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
          });

          if (!upstream.ok) {
            const errText = await upstream.text();
            return jsonResponse({ error: `LLM API 错误: ${upstream.status}`, detail: errText }, upstream.status, origin);
          }

          const { readable, writable } = new TransformStream();
          upstream.body.pipeTo(writable);

          return new Response(readable, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              ...corsHeaders(origin),
            },
          });
        } else {
          // 非流式响应
          const upstream = await fetch(api_base, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
          });

          const data = await upstream.text();
          return new Response(data, {
            status: upstream.status,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(origin),
            },
          });
        }
      } catch (err) {
        return jsonResponse({ error: `LLM 代理错误: ${err.message}` }, 500, origin);
      }
    }

    // 健康检查
    if (url.pathname === '/') {
      return jsonResponse({ status: 'ok', service: 'ANISpace Proxy' }, 200, origin);
    }

    return jsonResponse({ error: 'Not Found' }, 404, origin);
  },

  // Cron Trigger — 定时任务
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      // 每 30 分钟：资讯爬取
      try {
        const result = await newsScraper.runAllScrapers(env.DB);
        console.log('News scrape result:', JSON.stringify(result));
      } catch (err) {
        console.error('News scrape error:', err.message);
      }

      // 周一/周三 03:00 UTC：bangumi-data 同步
      const cron = event.cron || '';
      if (cron === '0 3 * * 1' || cron === '0 3 * * 3') {
        try {
          const result = await bangumiSync.runSync(env, { force: false });
          console.log('Bangumi sync result:', JSON.stringify(result));
        } catch (err) {
          console.error('Bangumi sync error:', err.message);
        }
      }

      // 每小时：排行榜计算
      try {
        const categories = ['illustration', 'novel', 'manga', 'galgame', 'all'];
        const rankTypes = ['daily', 'weekly', 'monthly'];
        const now = new Date();
        const timeRanges = {
          daily: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          weekly: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          monthly: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        };

        // 清除旧排名
        await env.DB.prepare('DELETE FROM work_rankings').run();

        for (const rankType of rankTypes) {
          for (const category of categories) {
            const since = timeRanges[rankType];
            let query = `
              SELECT w.id, w.title, w.type, w.cover_image, w.author_id,
                     (w.views_count * 0.3 + w.likes_count * 3 + w.favorites_count * 5 + w.comments_count * 2) AS score
              FROM works w
              WHERE w.is_visible = 1 AND w.visibility != 'private'
                AND w.created_at >= ?
            `;
            const bindParams = [since];

            if (category !== 'all') {
              query += ' AND w.type = ?';
              bindParams.push(category);
            }

            query += ' ORDER BY score DESC LIMIT 50';

            try {
              const works = await env.DB.prepare(query).bind(...bindParams).all();
              for (let rank = 0; rank < works.results.length; rank++) {
                const w = works.results[rank];
                await env.DB.prepare(
                  'INSERT INTO work_rankings (work_id, rank_type, category, rank_position, score, calculated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
                ).bind(w.id, rankType, category, rank + 1, w.score).run();
              }
            } catch (err) {
              console.error(`Ranking calc error [${rankType}/${category}]:`, err.message);
            }
          }
        }
        console.log('Rankings calculation completed');
      } catch (err) {
        console.error('Rankings calculation error:', err.message);
      }

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

      // 每小时：刷新活跃用户短期画像
      try {
        const activeUsers = await env.DB.prepare(
          `SELECT DISTINCT user_id FROM behavior_log
           WHERE created_at > datetime('now', '-7 days')
           LIMIT 100`
        ).all();
        for (const u of (activeUsers.results || [])) {
          try {
            await behaviorCollector.computeShortProfile(env.DB, u.user_id);
          } catch {}
        }
        console.log('Short profile refresh completed, users:', (activeUsers.results || []).length);
      } catch (err) {
        console.error('Short profile refresh error:', err.message);
      }
    })());
  },
};

