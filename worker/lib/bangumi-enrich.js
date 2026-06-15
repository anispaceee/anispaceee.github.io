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
export async function hasSubject(env, subjectId) {
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
export async function enrichSubject(env, subjectId) {
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
