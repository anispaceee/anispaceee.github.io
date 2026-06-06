// OAuth 配置
// 前端：Vite 会替换 import.meta.env.VITE_XXX
// 服务端（Vite 插件）：从 process.env 读取

function getEnvVar(key) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch {}
  return undefined;
}

// 生产环境 OAuth 代理地址（Cloudflare Worker）
// 部署 Worker 后替换为你的 Worker URL
const OAUTH_PROXY_URL = getEnvVar('VITE_OAUTH_PROXY_URL') || '';

export default {
  bangumi: {
    clientId: getEnvVar('VITE_BANGUMI_CLIENT_ID') || 'bgm_anispace',
    authUrl: 'https://bgm.tv/oauth/authorize',
    tokenUrl: 'https://bgm.tv/oauth/access_token',
    apiUrl: 'https://api.bgm.tv',
    redirectPath: '/auth/bangumi',
  },
  github: {
    clientId: getEnvVar('VITE_GITHUB_CLIENT_ID') || 'gh_anispace',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    apiUrl: 'https://api.github.com',
    redirectPath: '/auth/github',
    scope: 'read:user user:email',
  },
  // 获取 OAuth 代理基础 URL
  // 开发环境：''（使用 Vite 插件的 /api/oauth/* 端点）
  // 生产环境：Worker URL（如 https://anispace-oauth.your-name.workers.dev）
  get proxyUrl() {
    return OAUTH_PROXY_URL;
  },
};
