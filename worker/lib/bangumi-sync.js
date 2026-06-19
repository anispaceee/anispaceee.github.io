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
export async function refreshBangumiToken(refreshToken, env) {
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
export async function syncToBangumi(accessToken, subjectId, status, rating = 0, comment = '') {
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
export async function fetchBangumiCollections(accessToken, username, limit = 100) {
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
export async function importBangumiCollections(env, userId, bangumiCollections) {
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