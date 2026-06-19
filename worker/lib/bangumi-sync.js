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

  // 状态映射：ANISpace 字符串 → Bangumi 数字
  // ANISpace: wish, collect, doing, on_hold, dropped
  // Bangumi: 1=wish(想看), 2=collect(看过), 3=doing(在看), 4=on_hold(搁置), 5=dropped(抛弃)
  const statusMap = {
    wish: 1,
    collect: 2,
    doing: 3,
    on_hold: 4,
    dropped: 5,
  };
  const bangumiType = statusMap[status] || 1;

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
        type: bangumiType,
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
export async function importBangumiCollections(env, userId, bangumiCollections, overwrite = false) {
  if (!bangumiCollections || bangumiCollections.length === 0) {
    return { imported: 0, skipped: 0, updated: 0 };
  }

  let imported = 0;
  let skipped = 0;
  let updated = 0;

  for (const item of bangumiCollections) {
    const subjectId = item.subject_id;
    const bangumiType = Number(item.type); // Bangumi 数字类型：1=想看, 2=看过, 3=在看, 4=搁置, 5=抛弃
    const rating = item.rate || 0;
    const comment = item.comment || '';
    const hasEpisode = item.ep_status || 0; // 已看集数

    // 从 Bangumi API 响应中提取条目元信息
    // 收藏列表响应的每个 item 包含 subject 对象（含 name/name_cn/images/type）
    const subject = item.subject || {};
    const subjectName = subject.name_cn || subject.name || '';
    const subjectImage = (subject.images && (subject.images.large || subject.images.common)) || '';
    const subjectType = subject.type ? String(subject.type) : '';

    // 状态映射：Bangumi 数字 → ANISpace 字符串
    // Bangumi: 1=wish(想看), 2=collect(看过), 3=doing(在看), 4=on_hold(搁置), 5=dropped(抛弃)
    // ANISpace: wish, collect, doing, on_hold, dropped
    const statusMap = {
      1: 'wish',
      2: 'collect',
      3: 'doing',
      4: 'on_hold',
      5: 'dropped',
    };
    const anispaceStatus = statusMap[bangumiType] || 'wish';

    try {
      // 检查是否已存在
      const existing = await env.DB.prepare(
        'SELECT id FROM collections WHERE user_id = ? AND subject_id = ?'
      ).bind(userId, subjectId).first();

      if (existing) {
        if (overwrite) {
          // 覆盖模式：用新数据完全覆盖（含名称/封面/类型）
          await env.DB.prepare(
            `UPDATE collections SET status = ?, rating = ?, comment = ?, subject_name = ?, subject_image = ?, subject_type = ?, updated_at = datetime('now')
             WHERE user_id = ? AND subject_id = ?`
          ).bind(anispaceStatus, rating, comment, subjectName, subjectImage, subjectType, userId, subjectId).run();
          updated++;
        } else {
          // 非覆盖模式：跳过已存在的记录
          skipped++;
        }
      } else {
        // 插入新记录（包含名称/封面/类型）
        await env.DB.prepare(
          `INSERT INTO collections (user_id, subject_id, subject_type, subject_name, subject_image, status, rating, comment, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        ).bind(userId, subjectId, subjectType, subjectName, subjectImage, anispaceStatus, rating, comment).run();
        imported++;
      }
    } catch (err) {
      console.warn(`Import collection ${subjectId} failed:`, err);
      skipped++;
    }
  }

  return { imported, skipped, updated };
}

/**
 * 将本地收藏批量同步（上传）到 Bangumi
 * 对比本地与 Bangumi 端的状态/评分/评论，不一致的进行上传或更新
 * @param {object} env - Worker 环境变量
 * @param {number} userId - ANISpace 用户 ID
 * @param {string} accessToken - Bangumi access token
 * @param {string} username - Bangumi 用户名
 * @returns {Promise<{synced: number, skipped: number, failed: number, errors: Array}>}
 */
export async function uploadCollectionsToBangumi(env, userId, accessToken, username) {
  if (!accessToken || !username) {
    return { synced: 0, skipped: 0, failed: 0, errors: ['缺少 Bangumi token 或用户名'] };
  }

  // 1. 读取本地所有收藏
  const localCollections = await env.DB.prepare(
    'SELECT subject_id, status, rating, comment FROM collections WHERE user_id = ?'
  ).bind(userId).all();

  if (!localCollections.results || localCollections.results.length === 0) {
    return { synced: 0, skipped: 0, failed: 0, errors: [] };
  }

  // 2. 拉取 Bangumi 端所有收藏
  const fetchResult = await fetchBangumiCollections(accessToken, username);
  if (fetchResult.error) {
    return { synced: 0, skipped: 0, failed: 0, errors: [fetchResult.error] };
  }

  // 3. 构建 Bangumi 收藏 Map（subject_id → {type, rate, comment}）
  const bangumiMap = new Map();
  for (const item of fetchResult.collections) {
    bangumiMap.set(item.subject_id, {
      type: Number(item.type),
      rate: item.rate || 0,
      comment: item.comment || '',
    });
  }

  // 4. 状态映射：ANISpace 字符串 → Bangumi 数字
  const statusMap = {
    wish: 1,
    collect: 2,
    doing: 3,
    on_hold: 4,
    dropped: 5,
  };

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  // 5. 遍历本地收藏，对比并上传
  for (const local of localCollections.results) {
    const bangumiType = statusMap[local.status] || 1;
    const localRating = local.rating || 0;
    const localComment = local.comment || '';
    const bangumiEntry = bangumiMap.get(local.subject_id);

    // 判断是否一致
    let isConsistent = false;
    if (bangumiEntry) {
      isConsistent =
        bangumiEntry.type === bangumiType &&
        bangumiEntry.rate === localRating &&
        (bangumiEntry.comment || '').trim() === localComment.trim();
    }

    if (isConsistent) {
      skipped++;
      continue;
    }

    // 不一致或不存在，上传到 Bangumi
    const result = await syncToBangumi(accessToken, local.subject_id, local.status, localRating, localComment);
    if (result.ok) {
      synced++;
    } else {
      failed++;
      errors.push(`条目 ${local.subject_id}: ${result.error}`);
    }

    // 速率限制：每条之间延迟 200ms
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { synced, skipped, failed, errors };
}