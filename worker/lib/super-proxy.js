/**
 * ANISpace 超展开代理模块
 * 功能：代理 Bangumi 小组 API，实现小组浏览、发帖、成员管理等功能
 */

// Bangumi Private API 基础 URL
// 私有 API 端点位于 next.bgm.tv/p1/ 前缀下
const BANGUMI_PRIVATE_API = 'https://next.bgm.tv';

/**
 * 获取用户的 Bangumi access token
 * @param {object} db - D1 数据库绑定
 * @param {number} userId - 用户 ID
 * @returns {object|null} token 信息或 null
 */
export async function getBangumiToken(db, userId) {
  const user = await db.prepare(
    'SELECT bangumi_access_token, bangumi_refresh_token, bangumi_token_expires_at, bangumi_user_id, bangumi_username, bangumi_avatar, bangumi_bound_at FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user || !user.bangumi_access_token) {
    return null;
  }

  // 检查 token 是否过期
  const now = Math.floor(Date.now() / 1000);
  if (user.bangumi_token_expires_at && user.bangumi_token_expires_at < now) {
    // Token 已过期，返回 null（需要刷新）
    return { expired: true, refreshToken: user.bangumi_refresh_token };
  }

  return {
    accessToken: user.bangumi_access_token,
    refreshToken: user.bangumi_refresh_token,
    expiresAt: user.bangumi_token_expires_at,
    bangumiUserId: user.bangumi_user_id,
    bangumiUsername: user.bangumi_username,
    bangumiAvatar: user.bangumi_avatar,
    boundAt: user.bangumi_bound_at,
  };
}

/**
 * 代理 Bangumi Private API 请求
 * @param {string} endpoint - API 端点（如 /p/groups）
 * @param {string} accessToken - Bangumi access token
 * @param {object} options - 请求选项（method, body, params）
 * @returns {object} API 响应
 */
export async function proxyBangumiAPI(endpoint, accessToken, options = {}) {
  const { method = 'GET', body = null, params = {} } = options;

  // 构建完整 URL
  const url = new URL(`${BANGUMI_PRIVATE_API}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    'User-Agent': 'ANISpace-SuperProxy/1.0',
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    const data = await res.json();

    if (!res.ok) {
      return { error: data.error || data.message || 'Bangumi API 请求失败', status: res.status };
    }

    return { data, status: res.status };
  } catch (err) {
    return { error: `Bangumi API 请求异常: ${err.message}`, status: 500 };
  }
}

/**
 * 处理小组列表请求
 * GET /api/super/groups
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {object} params - 查询参数（page, limit, sort, cat）
 * @returns {object} 小组列表
 */
export async function handleGroupsList(db, env, userId, params = {}) {
  const tokenInfo = await getBangumiToken(db, userId);
  if (!tokenInfo) {
    return { error: '请先绑定 Bangumi 账号', status: 401 };
  }
  if (tokenInfo.expired) {
    return { error: 'Bangumi token 已过期，请重新绑定', status: 401 };
  }

  const { page = 1, limit = 20, sort = 'members', cat } = params;
  const offset = (page - 1) * limit;
  const queryParams = { limit, offset, sort };
  if (cat) queryParams.cat = cat;

  return await proxyBangumiAPI('/p1/groups', tokenInfo.accessToken, { params: queryParams });
}

/**
 * 处理小组详情请求
 * GET /api/super/groups/:groupName
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {string} groupName - 小组名称（英文标识）
 * @returns {object} 小组详情
 */
export async function handleGroupDetail(db, env, userId, groupName) {
  const tokenInfo = await getBangumiToken(db, userId);
  if (!tokenInfo) {
    return { error: '请先绑定 Bangumi 账号', status: 401 };
  }
  if (tokenInfo.expired) {
    return { error: 'Bangumi token 已过期，请重新绑定', status: 401 };
  }

  return await proxyBangumiAPI(`/p1/groups/${groupName}`, tokenInfo.accessToken);
}

/**
 * 处理话题列表请求
 * GET /api/super/groups/:groupName/topics
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {string} groupName - 小组名称（英文标识）
 * @param {object} params - 查询参数（page, limit）
 * @returns {object} 话题列表
 */
export async function handleTopicsList(db, env, userId, groupName, params = {}) {
  const tokenInfo = await getBangumiToken(db, userId);
  if (!tokenInfo) {
    return { error: '请先绑定 Bangumi 账号', status: 401 };
  }
  if (tokenInfo.expired) {
    return { error: 'Bangumi token 已过期，请重新绑定', status: 401 };
  }

  const { limit = 20, offset = 0 } = params;
  return await proxyBangumiAPI(`/p1/groups/${groupName}/topics`, tokenInfo.accessToken, { params: { limit, offset } });
}

/**
 * 处理话题详情请求
 * GET /api/super/topics/:id
 * 由于 Bangumi 没有公开的话题详情 API，使用 HTML 爬取
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {number} topicId - 话题 ID
 * @returns {object} 话题详情（包含帖子列表）
 */
export async function handleTopicDetail(db, env, userId, topicId) {
  const tokenInfo = await getBangumiToken(db, userId);
  if (!tokenInfo) {
    return { error: '请先绑定 Bangumi 账号', status: 401 };
  }

  try {
    // 爬取话题页面 HTML
    const response = await fetch(`https://bgm.tv/group/topic/${topicId}`, {
      headers: {
        'User-Agent': 'ANISpace/1.0 (https://anispaceee.github.io)',
        'Cookie': `chii_auth=${tokenInfo.accessToken}`,
      },
    });
    
    if (!response.ok) {
      return { error: '话题不存在或无法访问', status: 404 };
    }
    
    const html = await response.text();
    
    // 解析话题标题
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const title = titleMatch ? titleMatch[1].trim() : `话题 ${topicId}`;
    
    // 解析帖子列表
    const posts = [];
    const postRegex = /<div[^>]*class="[^"]*reply_item[^"]*"[^>]*>[\s\S]*?<a[^>]*href="\/user\/([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?<div[^>]*class="[^"]*message[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let match;
    let floor = 1;
    while ((match = postRegex.exec(html)) !== null) {
      posts.push({
        id: floor,
        floor: floor,
        uid: match[1],
        username: match[2].trim(),
        createdAt: match[3].trim(),
        content: match[4].trim().replace(/<[^>]+>/g, ''),
      });
      floor++;
    }
    
    return {
      id: parseInt(topicId),
      title,
      posts,
      total: posts.length,
    };
  } catch (err) {
    console.error('Failed to fetch topic detail:', err);
    return { error: '获取话题详情失败', status: 500 };
  }
}

/**
 * 处理帖子列表请求
 * GET /api/super/topics/:id/posts
 * 由于 Bangumi 没有公开的帖子列表 API，使用 HTML 爬取
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {number} topicId - 话题 ID
 * @param {object} params - 查询参数（page, limit）
 * @returns {object} 帖子列表
 */
export async function handlePostsList(db, env, userId, topicId, params = {}) {
  // 帖子列表已在 handleTopicDetail 中获取，这里直接返回
  const result = await handleTopicDetail(db, env, userId, topicId);
  if (result.error) {
    return result;
  }
  
  const { page = 1, limit = 20 } = params;
  const start = (page - 1) * limit;
  const end = start + limit;
  
  return {
    data: result.posts.slice(start, end),
    total: result.posts.length,
    page,
    limit,
  };
}

/**
 * 处理发表话题请求
 * POST /api/super/groups/:groupName/topics
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {string} groupName - 小组名称（英文标识）
 * @param {object} body - 话题内容（title, content）
 * @returns {object} 创建结果
 */
export async function handleCreateTopic(db, env, userId, groupName, body) {
  const tokenInfo = await getBangumiToken(db, userId);
  if (!tokenInfo) {
    return { error: '请先绑定 Bangumi 账号', status: 401 };
  }
  if (tokenInfo.expired) {
    return { error: 'Bangumi token 已过期，请重新绑定', status: 401 };
  }

  if (!body.title || !body.content) {
    return { error: '话题标题和内容不能为空', status: 400 };
  }

  return await proxyBangumiAPI(`/p1/groups/${groupName}/topics`, tokenInfo.accessToken, {
    method: 'POST',
    body: { title: body.title, content: body.content },
  });
}

/**
 * 处理发表回复请求
 * POST /api/super/topics/:id/posts
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {number} topicId - 话题 ID
 * @param {object} body - 回复内容（content, related）
 * @returns {object} 创建结果
 */
export async function handleCreatePost(db, env, userId, topicId, body) {
  const tokenInfo = await getBangumiToken(db, userId);
  if (!tokenInfo) {
    return { error: '请先绑定 Bangumi 账号', status: 401 };
  }
  if (tokenInfo.expired) {
    return { error: 'Bangumi token 已过期，请重新绑定', status: 401 };
  }

  if (!body.content) {
    return { error: '回复内容不能为空', status: 400 };
  }

  const postBody = { content: body.content };
  if (body.related) {
    postBody.related = body.related; // 关联帖子 ID（回复某楼层）
  }

  return await proxyBangumiAPI(`/p1/topics/${topicId}/posts`, tokenInfo.accessToken, {
    method: 'POST',
    body: postBody,
  });
}

/**
 * 处理加入小组请求
 * POST /api/super/groups/:groupName/join
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {string} groupName - 小组名称（英文标识）
 * @returns {object} 加入结果
 */
export async function handleJoinGroup(db, env, userId, groupName) {
  const tokenInfo = await getBangumiToken(db, userId);
  if (!tokenInfo) {
    return { error: '请先绑定 Bangumi 账号', status: 401 };
  }
  if (tokenInfo.expired) {
    return { error: 'Bangumi token 已过期，请重新绑定', status: 401 };
  }

  return await proxyBangumiAPI(`/p1/groups/${groupName}/join`, tokenInfo.accessToken, {
    method: 'POST',
  });
}

/**
 * 处理退出小组请求
 * DELETE /api/super/groups/:groupName/leave
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {string} groupName - 小组名称（英文标识）
 * @returns {object} 退出结果
 */
export async function handleLeaveGroup(db, env, userId, groupName) {
  const tokenInfo = await getBangumiToken(db, userId);
  if (!tokenInfo) {
    return { error: '请先绑定 Bangumi 账号', status: 401 };
  }
  if (tokenInfo.expired) {
    return { error: 'Bangumi token 已过期，请重新绑定', status: 401 };
  }

  return await proxyBangumiAPI(`/p1/groups/${groupName}/leave`, tokenInfo.accessToken, {
    method: 'POST',
  });
}

/**
 * 处理创建小组请求
 * POST /api/super/groups
 * @param {object} db - D1 数据库
 * @param {object} env - Worker 环境变量
 * @param {number} userId - 用户 ID
 * @param {object} body - 小组信息（name, title, desc, icon, nsfw, accessible）
 * @returns {object} 创建结果
 */
export async function handleCreateGroup(db, env, userId, body) {
  const tokenInfo = await getBangumiToken(db, userId);
  if (!tokenInfo) {
    return { error: '请先绑定 Bangumi 账号', status: 401 };
  }
  if (tokenInfo.expired) {
    return { error: 'Bangumi token 已过期，请重新绑定', status: 401 };
  }

  if (!body.name || !body.title) {
    return { error: '小组名称和标题不能为空', status: 400 };
  }

  const groupBody = {
    name: body.name,
    title: body.title,
    desc: body.desc || '',
    icon: body.icon || '',
    nsfw: body.nsfw || false,
    accessible: body.accessible !== false, // 默认公开
  };

  return await proxyBangumiAPI('/p1/groups', tokenInfo.accessToken, {
    method: 'POST',
    body: groupData,
  });
}

/**
 * 处理 Bangumi 账号绑定状态查询
 * GET /api/auth/bangumi-status
 * @param {object} db - D1 数据库
 * @param {number} userId - 用户 ID
 * @returns {object} 绑定状态
 */
export async function handleBangumiStatus(db, userId) {
  const tokenInfo = await getBangumiToken(db, userId);

  if (!tokenInfo) {
    return {
      bound: false,
      message: '未绑定 Bangumi 账号',
    };
  }

  if (tokenInfo.expired) {
    return {
      bound: true,
      expired: true,
      message: 'Bangumi token 已过期，请重新绑定',
    };
  }

  return {
    bound: true,
    expired: false,
    bangumiUserId: tokenInfo.bangumiUserId,
    bangumiUsername: tokenInfo.bangumiUsername,
    bangumiAvatar: tokenInfo.bangumiAvatar,
    boundAt: tokenInfo.boundAt,
    expiresAt: tokenInfo.expiresAt,
  };
}

/**
 * 绑定 Bangumi 账号（保存 token 到用户表）
 * POST /api/auth/bind-bangumi
 * @param {object} db - D1 数据库
 * @param {number} userId - 用户 ID
 * @param {object} tokenData - Bangumi token 数据
 * @returns {object} 绑定结果
 */
export async function handleBindBangumi(db, userId, tokenData) {
  if (!tokenData.access_token) {
    return { error: '缺少 access_token', status: 400 };
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = tokenData.expires_in ? now + tokenData.expires_in : null;

  try {
    await db.prepare(
      `UPDATE users SET
        bangumi_access_token = ?,
        bangumi_refresh_token = ?,
        bangumi_token_expires_at = ?,
        bangumi_user_id = ?,
        bangumi_username = ?,
        bangumi_avatar = ?,
        bangumi_bound_at = ?
      WHERE id = ?`
    ).bind(
      tokenData.access_token,
      tokenData.refresh_token || null,
      expiresAt,
      tokenData.user_id || null,
      tokenData.username || null,
      tokenData.avatar || null,
      now,
      userId
    ).run();

    return {
      success: true,
      message: 'Bangumi 账号绑定成功',
      bangumiUserId: tokenData.user_id,
      bangumiUsername: tokenData.username,
    };
  } catch (err) {
    return { error: `绑定失败: ${err.message}`, status: 500 };
  }
}

/**
 * 解绑 Bangumi 账号
 * DELETE /api/auth/unbind-bangumi
 * @param {object} db - D1 数据库
 * @param {number} userId - 用户 ID
 * @returns {object} 解绑结果
 */
export async function handleUnbindBangumi(db, userId) {
  try {
    await db.prepare(
      `UPDATE users SET
        bangumi_access_token = NULL,
        bangumi_refresh_token = NULL,
        bangumi_token_expires_at = NULL,
        bangumi_user_id = NULL,
        bangumi_username = NULL,
        bangumi_avatar = NULL,
        bangumi_bound_at = NULL
      WHERE id = ?`
    ).bind(userId).run();

    return { success: true, message: 'Bangumi 账号已解绑' };
  } catch (err) {
    return { error: `解绑失败: ${err.message}`, status: 500 };
  }
}