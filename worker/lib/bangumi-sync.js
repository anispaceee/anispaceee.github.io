/**
 * ANISpace Worker — Bangumi 元数据同步逻辑
 *
 * 数据源：https://github.com/bangumi-data/bangumi-data
 *        文件：data/items/latest.json
 * 协议：CC BY-NC-SA 4.0（attribution 需保留）
 *
 * 用法：
 *   1. Worker 内定时任务（scheduled handler）调用 `runSync(env)`
 *   2. 也可以在路由 `/api/bangumi-search/admin/sync` 手动触发（需鉴权）
 *
 * 注意：Cloudflare Worker 10ms CPU 限制 + D1 单次 batch 1000 行，
 *       全量同步需分批。本函数会自动分批。
 */

const SOURCE_URL = 'https://raw.githubusercontent.com/bangumi-data/bangumi-data/master/data/items/latest.json';
const SOURCE_REPO = 'https://github.com/bangumi-data/bangumi-data';
const UA = 'ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace; sync)';
const BATCH_SIZE = 5; // D1 batch: 每条 INSERT 16 参数，100 参数限制 → 最多 6 条；保守取 5
const SYNC_MIN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // 6 天
const META_LAST_SYNC = 'last_sync_at';
const META_SOURCE_HASH = 'source_hash';
const META_ITEM_COUNT = 'item_count';

function extractAliases(item) {
  const set = new Set();
  // title_translate 是 BTreeMap<Language, Vec<String>>，即 { "zh-Hans": ["译名1", "译名2"], "en": ["English"] }
  const tt = item.title_translate || item.titleTranslate || {};
  for (const langs of Object.values(tt)) {
    if (Array.isArray(langs)) {
      for (const name of langs) {
        if (typeof name === 'string' && name.trim()) set.add(name.trim());
      }
    }
  }
  if (typeof item.title === 'string') set.add(item.title);
  return Array.from(set).slice(0, 30);
}

function inferWeek(item) {
  // bangumi-data 没有 weekday 字段，从 begin 推断
  if (!item.begin) return [];
  const d = new Date(item.begin);
  if (isNaN(d.getTime())) return [];
  return [((d.getUTCDay() + 6) % 7) + 1]; // 1=Mon ... 7=Sun
}

function pickImage(item) {
  return (
    item.image ||
    (item.images && (item.images.large || item.images.common || item.images.medium)) ||
    ''
  );
}

function pickSummary(item) {
  if (!item) return '';
  if (typeof item.summary === 'string') return item.summary;
  if (item.description) return String(item.description);
  return '';
}

function normalizeRow(item, sourceHash) {
  const aliases = extractAliases(item);
  const week = inferWeek(item);
  const tt = item.title_translate || item.titleTranslate || {};
  return {
    id: Number(item.id),
    title: String(item.title || ''),
    title_cn: (() => {
      // 优先简体中文译名（title_translate 是 Map<Language, Vec<String>>）
      const zhHans = tt['zh-Hans'] || tt['zh-CN'] || [];
      if (Array.isArray(zhHans) && zhHans.length > 0) return zhHans[0];
      const zhHant = tt['zh-Hant'] || tt['zh-TW'] || [];
      if (Array.isArray(zhHant) && zhHant.length > 0) return zhHant[0];
      // 任何中文
      for (const [lang, names] of Object.entries(tt)) {
        if (/^zh/i.test(lang) && Array.isArray(names) && names.length > 0) return names[0];
      }
      return '';
    })(),
    title_ja: item.title || '',
    aliases: JSON.stringify(aliases),
    type: Number(item.type) || 2,
    begin: item.begin || '',
    end: item.end || '',
    score: Number(item.rating?.score) || 0,
    rank: Number(item.rating?.rank) || 0,
    summary: pickSummary(item),
    image: pickImage(item),
    sites: JSON.stringify(item.sites || {}),
    week: JSON.stringify(week),
    source_hash: sourceHash,
  };
}

async function getMeta(env, key) {
  const row = await env.DB.prepare(
    'SELECT value FROM bangumi_index_meta WHERE key = ?'
  ).bind(key).first();
  return row?.value || null;
}

async function setMeta(env, key, value) {
  await env.DB.prepare(
    `INSERT INTO bangumi_index_meta (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, String(value)).run();
}

/**
 * 拉取远端 JSON；带重试 + UA
 */
async function fetchSource(retry = 2) {
  const lastErr = { err: null };
  for (let i = 0; i <= retry; i++) {
    try {
      const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('data is not an array');
      return data;
    } catch (err) {
      lastErr.err = err;
      if (i < retry) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr.err || new Error('fetchSource failed');
}

/**
 * 计算 source hash（用 items[0..9].id + .begin 拼接做个轻量 hash）
 * 仅用于"是否变了"的判断，不是密码学 hash
 */
function quickHash(items) {
  const head = items.slice(0, 20).map(it => `${it.id}:${it.begin || ''}`).join('|');
  const len = items.length;
  let h = 5381;
  const s = `${head}|${len}`;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

/**
 * 分批写入 D1
 */
async function batchUpsert(env, rows) {
  const stmt = env.DB.prepare(`
    INSERT OR REPLACE INTO bangumi_index
      (id, title, title_cn, title_ja, aliases, type, begin, end, score, rank, summary, image, sites, week, source_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    await env.DB.batch(slice.map(r => stmt.bind(
      r.id, r.title, r.title_cn, r.title_ja, r.aliases, r.type,
      r.begin, r.end, r.score, r.rank, r.summary, r.image,
      r.sites, r.week, r.source_hash
    )));
  }
}

/**
 * 同步主函数
 * @param env Worker env
 * @param options.force=true 跳过 hash / 频率判断
 * @returns { ok, total, durationMs, sourceHash, skipped }
 */
export async function runSync(env, options = {}) {
  const t0 = Date.now();

  // 1. 频率门控
  if (!options.force) {
    const last = await getMeta(env, META_LAST_SYNC);
    if (last && Date.now() - Number(last) < SYNC_MIN_INTERVAL_MS) {
      return { ok: true, skipped: 'too_soon', lastSyncAt: Number(last) };
    }
  }

  // 2. 拉取
  const items = await fetchSource();
  const sourceHash = quickHash(items);

  // 3. hash 门控
  if (!options.force) {
    const lastHash = await getMeta(env, META_SOURCE_HASH);
    if (lastHash === sourceHash) {
      await setMeta(env, META_LAST_SYNC, Date.now());
      return { ok: true, skipped: 'no_change', total: items.length, sourceHash };
    }
  }

  // 4. 归一化
  const rows = items.map(it => normalizeRow(it, sourceHash)).filter(r => r.id > 0);

  // 5. 写入
  await batchUpsert(env, rows);

  // 6. 记录元数据
  await setMeta(env, META_LAST_SYNC, Date.now());
  await setMeta(env, META_SOURCE_HASH, sourceHash);
  await setMeta(env, META_ITEM_COUNT, rows.length);

  return {
    ok: true,
    total: rows.length,
    durationMs: Date.now() - t0,
    sourceHash,
    sourceUrl: SOURCE_URL,
    sourceRepo: SOURCE_REPO,
  };
}

/**
 * Worker scheduled handler 调用
 */
export async function handleScheduledSync(event, env, ctx) {
  ctx?.waitUntil?.(
    runSync(env).then(r => console.log('[bangumi-sync]', JSON.stringify(r)))
      .catch(e => console.error('[bangumi-sync] failed:', e?.message || e))
  );
}

export const _internal = { SOURCE_URL, SOURCE_REPO, BATCH_SIZE, extractAliases, normalizeRow, quickHash };
