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
 */

// ─── SSRF 防护 ───────────────────────────────────────────

/**
 * 校验目标 URL 是否安全，防止 SSRF 攻击
 * - 仅允许 https:// 协议
 * - 禁止 IP 地址、loopback、内网段
 * - 禁止元数据地址
 */
function isSafeTargetUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    // 仅允许 HTTPS
    if (u.protocol !== 'https:') return false;

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

// ─── 原有常量 ───────────────────────────────────────────────

const BANGUMI_TOKEN_URL = 'https://bgm.tv/oauth/access_token';
const BANGUMI_API_URL = 'https://api.bgm.tv';

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
      'Content-Type': 'application/json',
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
        'Content-Type': 'application/json',
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

async function handleApiRoutes(pathname, request, env, origin) {
  const method = request.method;
  const jwtSecret = env.JWT_SECRET || 'anispace-jwt-secret-change-me';

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
        // 创建新用户
        const result = await env.DB.prepare(
          'INSERT INTO users (provider, provider_id, username, name, avatar, bio, join_date, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'), datetime(\'now\'))'
        ).bind(provider, String(providerId), username || '', name || '', avatar || '', bio || '').run();
        user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(result.meta.last_row_id).first();
      }

      const token = await signJWT({ userId: user.id, provider: user.provider, providerId: user.provider_id }, jwtSecret);
      return jsonResponse({ token, user: formatUser(user) }, 200, origin);
    } catch (err) {
      return jsonResponse({ error: '登录失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/users/:id — 获取用户信息
  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch) {
    const userId = Number(userMatch[1]);
    if (method === 'GET') {
      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
      if (!user) return jsonResponse({ error: '用户不存在' }, 404, origin);
      return jsonResponse(formatUser(user), 200, origin);
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

  // GET /api/posts — 帖子列表（分页）
  if (method === 'GET' && pathname === '/api/posts') {
    const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 20));
    const offset = (page - 1) * limit;

    const posts = await env.DB.prepare(
      'SELECT p.*, u.name AS author_name, u.avatar AS author_avatar FROM posts p JOIN users u ON p.author_id = u.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset).all();

    const countResult = await env.DB.prepare('SELECT COUNT(*) AS total FROM posts').first();
    return jsonResponse({
      posts: posts.results,
      pagination: { page, limit, total: countResult.total },
    }, 200, origin);
  }

  // POST /api/posts — 创建帖子（需认证）
  if (method === 'POST' && pathname === '/api/posts') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { title, content, category } = body;
      if (!title || !content) return jsonResponse({ error: '标题和内容不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO posts (author_id, title, content, category, likes, replies_count, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, datetime(\'now\'), datetime(\'now\'))'
      ).bind(authUser.userId, title, content, category || null).run();

      const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(post, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建帖子失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/posts/:id — 获取帖子详情及回复
  const postMatch = pathname.match(/^\/api\/posts\/(\d+)$/);
  if (postMatch && method === 'GET') {
    const postId = Number(postMatch[1]);
    const post = await env.DB.prepare(
      'SELECT p.*, u.name AS author_name, u.avatar AS author_avatar FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?'
    ).bind(postId).first();
    if (!post) return jsonResponse({ error: '帖子不存在' }, 404, origin);

    const replies = await env.DB.prepare(
      'SELECT r.*, u.name AS author_name, u.avatar AS author_avatar FROM replies r JOIN users u ON r.author_id = u.id WHERE r.post_id = ? ORDER BY r.created_at ASC'
    ).bind(postId).all();

    return jsonResponse({ ...post, replies: replies.results }, 200, origin);
  }

  // POST /api/posts/:id/replies — 添加回复（需认证）
  const replyMatch = pathname.match(/^\/api\/posts\/(\d+)\/replies$/);
  if (replyMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
    const postId = Number(replyMatch[1]);

    try {
      const body = await request.json();
      const { content } = body;
      if (!content) return jsonResponse({ error: '回复内容不能为空' }, 400, origin);

      const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
      if (!post) return jsonResponse({ error: '帖子不存在' }, 404, origin);

      await env.DB.prepare(
        'INSERT INTO replies (post_id, author_id, content, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
      ).bind(postId, authUser.userId, content).run();

      await env.DB.prepare(
        'UPDATE posts SET replies_count = replies_count + 1, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(postId).run();

      return jsonResponse({ message: '回复成功' }, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '回复失败: ' + err.message }, 500, origin);
    }
  }

  // POST /api/posts/:id/like — 切换点赞（需认证）
  const likeMatch = pathname.match(/^\/api\/posts\/(\d+)\/like$/);
  if (likeMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
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

  // POST /api/follows/:userId — 切换关注（需认证）
  const followMatch = pathname.match(/^\/api\/follows\/(\d+)$/);
  if (followMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
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
      'SELECT f.to_user_id, u.name, u.avatar FROM follows f JOIN users u ON f.to_user_id = u.id WHERE f.from_user_id = ?'
    ).bind(userId).all();

    const followers = await env.DB.prepare(
      'SELECT f.from_user_id, u.name, u.avatar FROM follows f JOIN users u ON f.from_user_id = u.id WHERE f.to_user_id = ?'
    ).bind(userId).all();

    return jsonResponse({ following: following.results, followers: followers.results }, 200, origin);
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

  // POST /api/world-messages — 发送世界消息（需认证）
  if (method === 'POST' && pathname === '/api/world-messages') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    try {
      const body = await request.json();
      const { content } = body;
      if (!content) return jsonResponse({ error: '内容不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO world_messages (author_id, content, created_at) VALUES (?, ?, datetime(\'now\'))'
      ).bind(authUser.userId, content).run();

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
    const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 20));
    const offset = (page - 1) * limit;

    const news = await env.DB.prepare(
      'SELECT * FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset).all();

    const countResult = await env.DB.prepare('SELECT COUNT(*) AS total FROM news').first();
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
      const { type, title, source, link, category, content, images } = body;
      if (!title) return jsonResponse({ error: '标题不能为空' }, 400, origin);

      const result = await env.DB.prepare(
        'INSERT INTO news (author_id, type, title, source, link, category, content, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'
      ).bind(
        authUser.userId, type || null, title, source || null, link || null,
        category || null, content || null,
        images ? JSON.stringify(images) : null
      ).run();

      const newsItem = await env.DB.prepare('SELECT * FROM news WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(newsItem, 201, origin);
    } catch (err) {
      return jsonResponse({ error: '创建新闻失败: ' + err.message }, 500, origin);
    }
  }

  // GET /api/news/:id — 获取新闻详情
  const newsMatch = pathname.match(/^\/api\/news\/(\d+)$/);
  if (newsMatch && method === 'GET') {
    const newsId = Number(newsMatch[1]);
    const newsItem = await env.DB.prepare('SELECT * FROM news WHERE id = ?').bind(newsId).first();
    if (!newsItem) return jsonResponse({ error: '新闻不存在' }, 404, origin);
    return jsonResponse(newsItem, 200, origin);
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

  // GET /api/mails/unread?userId=xxx — 未读邮件数
  if (method === 'GET' && pathname === '/api/mails/unread') {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return jsonResponse({ error: '缺少 userId 参数' }, 400, origin);

    const result = await env.DB.prepare(
      'SELECT COUNT(*) AS unread FROM mails WHERE to_user_id = ? AND read = 0 AND deleted_by_receiver = 0'
    ).bind(Number(userId)).first();

    return jsonResponse({ unread: result.unread }, 200, origin);
  }

  // GET /api/mails/inbox?userId=xxx — 收件箱
  if (method === 'GET' && pathname === '/api/mails/inbox') {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return jsonResponse({ error: '缺少 userId 参数' }, 400, origin);

    const mails = await env.DB.prepare(
      'SELECT m.*, u.name AS from_user_name, u.avatar AS from_user_avatar FROM mails m JOIN users u ON m.from_user_id = u.id WHERE m.to_user_id = ? AND m.deleted_by_receiver = 0 ORDER BY m.created_at DESC'
    ).bind(Number(userId)).all();

    return jsonResponse(mails.results, 200, origin);
  }

  // GET /api/mails/sent?userId=xxx — 发件箱
  if (method === 'GET' && pathname === '/api/mails/sent') {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return jsonResponse({ error: '缺少 userId 参数' }, 400, origin);

    const mails = await env.DB.prepare(
      'SELECT m.*, u.name AS to_user_name, u.avatar AS to_user_avatar FROM mails m JOIN users u ON m.to_user_id = u.id WHERE m.from_user_id = ? AND m.deleted_by_sender = 0 ORDER BY m.created_at DESC'
    ).bind(Number(userId)).all();

    return jsonResponse(mails.results, 200, origin);
  }

  // GET /api/mails/conversation?userId=xxx&otherUserId=yyy — 两人之间的邮件
  if (method === 'GET' && pathname === '/api/mails/conversation') {
    const userId = new URL(request.url).searchParams.get('userId');
    const otherUserId = new URL(request.url).searchParams.get('otherUserId');
    if (!userId || !otherUserId) return jsonResponse({ error: '缺少 userId 或 otherUserId 参数' }, 400, origin);

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

  // GET /api/private-messages/conversations?userId=xxx — 获取会话列表
  if (method === 'GET' && pathname === '/api/private-messages/conversations') {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return jsonResponse({ error: '缺少 userId 参数' }, 400, origin);

    const conversations = await env.DB.prepare(
      'SELECT u.id AS other_user_id, u.name AS other_user_name, u.avatar AS other_user_avatar, pm.content AS last_message, pm.created_at AS last_message_at, (SELECT COUNT(*) FROM private_messages WHERE to_user_id = ? AND from_user_id = u.id AND read = 0) AS unread_count FROM private_messages pm JOIN users u ON (CASE WHEN pm.from_user_id = ? THEN pm.to_user_id ELSE pm.from_user_id END) = u.id WHERE pm.id IN (SELECT MAX(id) FROM private_messages WHERE from_user_id = ? OR to_user_id = ? GROUP BY CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END) ORDER BY pm.created_at DESC'
    ).bind(Number(userId), Number(userId), Number(userId), Number(userId), Number(userId)).all();

    return jsonResponse(conversations.results, 200, origin);
  }

  // GET /api/private-messages/conversation?userId=xxx&otherUserId=yyy — 获取两人之间的消息
  if (method === 'GET' && pathname === '/api/private-messages/conversation') {
    const userId = new URL(request.url).searchParams.get('userId');
    const otherUserId = new URL(request.url).searchParams.get('otherUserId');
    if (!userId || !otherUserId) return jsonResponse({ error: '缺少 userId 或 otherUserId 参数' }, 400, origin);

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

  // POST /api/private-messages — 发送私信（需认证）
  if (method === 'POST' && pathname === '/api/private-messages') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

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

  // 未匹配的 API 路由
  return null;
}

// ─── Rate Limiter (H-7) ──────────────────────────────────

const RL_WINDOW_MS = 60 * 1000; // 60 秒滑动窗口

// 各端点每分钟限制
const RL_LIMITS = {
  '/api/auth/login': 5,
  '/api/posts': 10,       // 创建帖子/回复
  '/api/world-messages': 20,
  '/api/private-messages': 20,
  '/api/mails': 10,
  '/api/users': 10,
  '/api/collections': 20,
  '/api/follows': 20,
  '/api/ratings': 20,
  '/api/favorites': 20,
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
  async fetch(request, env) {
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
    if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/users/') || url.pathname.startsWith('/api/posts') || url.pathname.startsWith('/api/collections') || url.pathname.startsWith('/api/follows') || url.pathname.startsWith('/api/notifications') || url.pathname.startsWith('/api/world-messages') || url.pathname.startsWith('/api/news') || url.pathname.startsWith('/api/ratings') || url.pathname.startsWith('/api/favorites') || url.pathname.startsWith('/api/mails') || url.pathname.startsWith('/api/private-messages')) {
      const result = await handleApiRoutes(url.pathname, request, env, origin);
      if (result) return result;
    }

    // Bangumi API 代理：/api/bangumi/*
    if (url.pathname.startsWith('/api/bangumi/')) {
      const bangumiPath = url.pathname.replace('/api/bangumi', '');
      return handleBangumiProxy(bangumiPath, url.searchParams, request, env, origin);
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

      // C-3: SSRF protection - 禁止内网/IP/非HTTPS请求
      if (!isSafeTargetUrl(targetUrl)) {
        return jsonResponse({ error: '目标URL不安全，禁止访问' }, 403, origin);
      }

      try {
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'ANISpace/1.0',
            'Accept': 'application/json',
          },
        });
        const body = await res.text();
        return new Response(body, {
          status: res.status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
          },
        });
      } catch (err) {
        return jsonResponse({ error: '视频源代理请求失败' }, 500, origin);
      }
    }

    // 健康检查
    if (url.pathname === '/') {
      return jsonResponse({ status: 'ok', service: 'ANISpace Proxy' }, 200, origin);
    }

    return jsonResponse({ error: 'Not Found' }, 404, origin);
  },
};
