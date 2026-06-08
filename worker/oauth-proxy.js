/**
 * ANISpace 代理 — Cloudflare Worker
 *
 * 功能：
 * 1. OAuth token 交换（Bangumi / GitHub）
 * 2. Bangumi API 代理 + 缓存（解决直连不稳定问题）
 *
 * 环境变量（在 Cloudflare Dashboard 中配置）：
 *   BANGUMI_CLIENT_ID      - Bangumi OAuth Client ID
 *   BANGUMI_CLIENT_SECRET  - Bangumi OAuth Client Secret
 *   GITHUB_CLIENT_ID       - GitHub OAuth Client ID
 *   GITHUB_CLIENT_SECRET   - GitHub OAuth Client Secret
 *   ALLOWED_ORIGIN         - 允许的前端域名（如 https://afterrain-2005.github.io）
 */

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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

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

// Bangumi API 代理
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

// Bangumi OAuth token 交换
async function handleBangumiToken(code, redirectUri, env) {
  const body = new URLSearchParams({
    client_id: env.BANGUMI_CLIENT_ID,
    client_secret: env.BANGUMI_CLIENT_SECRET,
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

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    user_id: tokenData.user_id,
    user: {
      id: userData.id || tokenData.user_id,
      username: userData.username || '',
      nickname: userData.nickname || userData.username || '',
      avatar: userData.avatar?.large || userData.avatar?.medium || '',
      sign: userData.sign || '',
      bio: userData.bio || '',
    },
  };
}

// GitHub OAuth token 交换
async function handleGithubToken(code, redirectUri, env) {
  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
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

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return { error: tokenData.error_description || 'GitHub 授权失败' };
  }

  // 获取用户信息
  const userRes = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`,
    },
  });

  const userData = await userRes.json();

  // 获取用户邮箱
  let email = userData.email || '';
  if (!email) {
    try {
      const emailRes = await fetch(`${GITHUB_API_URL}/user/emails`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      });
      const emails = await emailRes.json();
      const primary = emails.find(e => e.primary);
      if (primary) email = primary.email;
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 验证来源
    const allowedOrigin = env.ALLOWED_ORIGIN || '';
    if (allowedOrigin && origin && !origin.startsWith(allowedOrigin)) {
      return jsonResponse({ error: '来源不被允许' }, 403, origin);
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

      const redirectUri = url.searchParams.get('redirect_uri') || `${allowedOrigin}/auth/bangumi`;

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

      const redirectUri = url.searchParams.get('redirect_uri') || `${allowedOrigin}/auth/github`;

      try {
        const result = await handleGithubToken(code, redirectUri, env);
        if (result.error) return jsonResponse(result, 400, origin);
        return jsonResponse(result, 200, origin);
      } catch (err) {
        return jsonResponse({ error: 'GitHub 授权服务异常' }, 500, origin);
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
