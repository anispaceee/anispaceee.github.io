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
export async function subjectsSearch(env, q, type = 0, limit = LOCAL_LIMIT) {
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
export async function localSearch(env, q, type = 0, limit = LOCAL_LIMIT) {
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
export async function officialSearch(q, type = 0) {
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
export async function backfillFromOfficial(env, officialItems) {
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
export async function search(env, q, type = 0, options = {}) {
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
export async function getDetail(env, id) {
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

export const _internal = { FALLBACK_THRESHOLD, OFFICIAL_BASE };
