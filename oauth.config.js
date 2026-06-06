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
};
