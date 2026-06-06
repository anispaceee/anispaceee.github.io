import oauthConfig from './oauth.config.js';

/**
 * Vite 开发服务器 OAuth 代理插件
 * 在服务端完成 code → access_token 的交换，避免 client_secret 暴露到前端
 * 生产环境需部署对应的 serverless function 或后端接口
 */
export default function viteOAuthPlugin() {
  return {
    name: 'vite-plugin-oauth',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`);

        // Bangumi OAuth token 交换
        if (url.pathname === '/api/oauth/bangumi/token') {
          try {
            const code = url.searchParams.get('code');
            if (!code) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: '缺少 code 参数' }));
              return;
            }

            const clientId = process.env.VITE_BANGUMI_CLIENT_ID || oauthConfig.bangumi.clientId;
            const clientSecret = process.env.VITE_BANGUMI_CLIENT_SECRET || '';
            const redirectUri = url.searchParams.get('redirect_uri') || `http://localhost:${server.config.server?.port || 5173}${oauthConfig.bangumi.redirectPath}`;

            const body = new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
            });

            const tokenRes = await fetch(oauthConfig.bangumi.tokenUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'ANISpace/1.0',
                'Accept': 'application/json',
              },
              body: body.toString(),
            });

            const tokenData = await tokenRes.json();
            if (tokenData.access_token) {
              // 用 access_token 获取用户信息
              const userRes = await fetch(`${oauthConfig.bangumi.apiUrl}/user/${tokenData.user_id}`, {
                headers: {
                  'User-Agent': 'ANISpace/1.0',
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${tokenData.access_token}`,
                },
              });
              const userData = await userRes.json();

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
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
              }));
            } else {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: tokenData.error_description || 'Bangumi 授权失败' }));
            }
          } catch (err) {
            console.error('Bangumi OAuth error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Bangumi 授权服务异常' }));
          }
          return;
        }

        // GitHub OAuth token 交换
        if (url.pathname === '/api/oauth/github/token') {
          try {
            const code = url.searchParams.get('code');
            if (!code) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: '缺少 code 参数' }));
              return;
            }

            const clientId = process.env.VITE_GITHUB_CLIENT_ID || oauthConfig.github.clientId;
            const clientSecret = process.env.VITE_GITHUB_CLIENT_SECRET || '';
            const redirectUri = url.searchParams.get('redirect_uri') || `http://localhost:${server.config.server?.port || 5173}${oauthConfig.github.redirectPath}`;

            const body = new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              code,
              redirect_uri: redirectUri,
            });

            const tokenRes = await fetch(oauthConfig.github.tokenUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
              },
              body: body.toString(),
            });

            const tokenData = await tokenRes.json();
            if (tokenData.access_token) {
              // 用 access_token 获取用户信息
              const userRes = await fetch(`${oauthConfig.github.apiUrl}/user`, {
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
                  const emailRes = await fetch(`${oauthConfig.github.apiUrl}/user/emails`, {
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

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                access_token: tokenData.access_token,
                user: {
                  id: userData.id,
                  username: userData.login || '',
                  nickname: userData.name || userData.login || '',
                  avatar: userData.avatar_url || '',
                  bio: userData.bio || '',
                  email,
                },
              }));
            } else {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: tokenData.error_description || 'GitHub 授权失败' }));
            }
          } catch (err) {
            console.error('GitHub OAuth error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'GitHub 授权服务异常' }));
          }
          return;
        }

        next();
      });
    },
  };
}
