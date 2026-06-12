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
 */

// ─── ES Module 依赖 ────────────────────────────────────────
import * as bangumiSync from './lib/bangumi-sync.js';
import * as bangumiSearch from './lib/bangumi-search.js';

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
      const { allow_profile_view, allow_comments_public } = body;
      await env.DB.prepare('UPDATE users SET allow_profile_view = ?, allow_comments_public = ? WHERE id = ?')
        .bind(allow_profile_view ?? 1, allow_comments_public ?? 1, userId).run();
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
      'SELECT r.id, r.subject_id, r.score, r.content, r.created_at, c.subject_name, c.subject_image FROM ratings r LEFT JOIN collections c ON r.subject_id = c.subject_id AND r.user_id = c.user_id WHERE r.user_id = ? AND r.content IS NOT NULL AND r.content != \'\' ORDER BY r.created_at DESC LIMIT 10'
    ).bind(userId).all();
    return jsonResponse(comments.results || [], 200, origin);
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
    if (category) {
      whereClause = 'WHERE p.category = ?';
      bindParams.push(category);
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

    const countSql = category ? 'SELECT COUNT(*) AS total FROM posts WHERE category = ?' : 'SELECT COUNT(*) AS total FROM posts';
    const countResult = await env.DB.prepare(countSql).bind(...bindParams).first();
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
      const { title, content, category, tags, images } = body;
      if (!title || !content) return jsonResponse({ error: '标题和内容不能为空' }, 400, origin);

      const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : '[]';
      const imagesJson = images && images.length > 0 ? JSON.stringify(images) : '[]';

      const result = await env.DB.prepare(
        'INSERT INTO posts (author_id, title, content, category, tags, images, likes, replies_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, datetime(\'now\'), datetime(\'now\'))'
      ).bind(authUser.userId, title, content, category || null, tagsJson, imagesJson).run();

      const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(result.meta.last_row_id).first();
      return jsonResponse(post, 201, origin);
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

    const replies = await env.DB.prepare(
      'SELECT r.*, u.name AS author_name, u.avatar AS author_avatar FROM replies r JOIN users u ON r.author_id = u.id WHERE r.post_id = ? ORDER BY r.created_at ASC'
    ).bind(postId).all();

    return jsonResponse({ ...post, views: (post.views || 0) + 1, replies: replies.results }, 200, origin);
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
      "SELECT fr.*, u.name AS to_user_name, u.avatar AS to_user_avatar, u.username AS to_user_username FROM friend_requests fr JOIN users u ON fr.to_user_id = u.id WHERE fr.from_user_id = ? ORDER BY fr.created_at DESC"
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

  // POST /api/friend-posts — 创建好友动态（需认证）
  if (method === 'POST' && pathname === '/api/friend-posts') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

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

  // POST /api/friend-posts/:id/like — 切换点赞（需认证）
  const fpLikeMatch = pathname.match(/^\/api\/friend-posts\/(\d+)\/like$/);
  if (fpLikeMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
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

  // POST /api/friend-posts/:id/comments — 添加评论（需认证）
  const fpCommentMatch = pathname.match(/^\/api\/friend-posts\/(\d+)\/comments$/);
  if (fpCommentMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);
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
    if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/users/') || url.pathname.startsWith('/api/posts') || url.pathname.startsWith('/api/uploads') || url.pathname.startsWith('/api/collections') || url.pathname.startsWith('/api/follows') || url.pathname.startsWith('/api/notifications') || url.pathname.startsWith('/api/world-messages') || url.pathname.startsWith('/api/news') || url.pathname.startsWith('/api/ratings') || url.pathname.startsWith('/api/favorites') || url.pathname.startsWith('/api/mails') || url.pathname.startsWith('/api/private-messages') || url.pathname.startsWith('/api/friends') || url.pathname.startsWith('/api/friend-posts') || url.pathname.startsWith('/api/bangumi-search')) {
      const result = await handleApiRoutes(url.pathname, request, env, origin);
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
            'Content-Type': 'application/json',
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
      // Block internal/private IPs — use proper IP range checks, not hostname prefix matching
      // (hostname prefix like '172.2' would incorrectly block legitimate domains)
      const isPrivateIp = /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(streamHost)
        || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(streamHost)
        || streamHost === 'localhost'
        || streamHost === '[::1]';
      if (isPrivateIp) {
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
              'Content-Type': 'application/json',
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

    // 健康检查
    if (url.pathname === '/') {
      return jsonResponse({ status: 'ok', service: 'ANISpace Proxy' }, 200, origin);
    }

    return jsonResponse({ error: 'Not Found' }, 404, origin);
  },
};
