# 站内注册功能设计

## 概述

为 ANISpace 添加邮箱+密码注册功能，集成 Cloudflare Turnstile 人机验证，与现有 OAuth 登录并存。

## 需求

- 邮箱+密码注册，不需要邮箱验证
- Cloudflare Turnstile 人机验证防机器人
- 与现有 GitHub/Bangumi OAuth 登录共存
- 密码重置功能预留（依赖 Cloudflare Email Sending，后续实现）

## 数据库变更

`users` 表新增字段：

```sql
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
```

- `password_hash`：PBKDF2 哈希值，仅 `provider='email'` 用户有值
- `email_verified`：预留字段，当前始终为 0
- `provider` 新增值 `'email'`，`provider_id` 存储邮箱地址
- 现有 `UNIQUE(provider, provider_id)` 约束确保同一邮箱不能重复注册

## 注册流程

```
用户填写邮箱+用户名+密码 → Turnstile验证 → POST /api/auth/register → 创建用户 → 返回JWT
```

1. 前端展示注册表单（邮箱、用户名、密码、确认密码）
2. Turnstile widget 完成人机验证，获取 token
3. 前端 POST `/api/auth/register`
   - Body: `{ email, username, password, turnstileToken }`
4. Worker 端处理：
   - 调用 Turnstile siteverify API 验证 token
   - 检查邮箱是否已注册（`provider='email' AND provider_id=email`）
   - 检查用户名是否已占用（`username=?`）
   - PBKDF2 哈希密码（随机 16 字节 salt + 100000 iterations + SHA-256）
   - 插入 users 表（`provider='email'`, `provider_id=email`, `password_hash=salt:hash`）
   - 生成 JWT 返回

### 校验规则

- 邮箱：合法格式，最大 254 字符
- 用户名：2-20 字符，仅允许字母/数字/下划线/中文
- 密码：8-64 字符，至少包含字母和数字

## 登录流程

```
用户填写邮箱+密码 → Turnstile验证 → POST /api/auth/login-email → 验证密码 → 返回JWT
```

1. 前端 POST `/api/auth/login-email`
   - Body: `{ email, password, turnstileToken }`
2. Worker 端处理：
   - Turnstile 验证
   - 查找 `provider='email' AND provider_id=email` 的用户
   - PBKDF2 验证密码（从 `password_hash` 提取 salt，重新计算 hash 对比）
   - 更新 `last_login`
   - 生成 JWT 返回

## Turnstile 集成

### 前端

- 在注册/登录表单中嵌入 `<div class="cf-turnstile" data-sitekey="..."></div>`
- 加载 `https://challenges.cloudflare.com/turnstile/v0/api.js` 脚本
- 表单提交时从 `cf-turnstile-response` 隐藏字段获取 token
- Site Key 通过 `VITE_TURNSTILE_SITE_KEY` 环境变量注入

### Worker 端

- 调用 `https://challenges.cloudflare.com/turnstile/v0/siteverify`
- POST Body: `{ secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken }`
- 验证 `success: true` 后继续处理
- Secret Key 通过 Worker 环境变量 `TURNSTILE_SECRET_KEY` 配置

### 配置步骤

1. Cloudflare Dashboard → Turnstile → Add site
2. Domain 填写 `anispaceee.github.io`
3. 获取 Site Key 和 Secret Key
4. Site Key → GitHub repo Secrets `VITE_TURNSTILE_SITE_KEY`
5. Secret Key → Worker 环境变量 `TURNSTILE_SECRET_KEY`

## 密码安全

Cloudflare Worker 不支持 bcrypt/argon2（无原生绑定），使用 Web Crypto API PBKDF2：

```javascript
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
  return `${saltB64}:${hashB64}`;
}

async function verifyPassword(password, storedHash) {
  const [saltB64, hashB64] = storedHash.split(':');
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const computedB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
  return computedB64 === hashB64;
}
```

存储格式：`salt:hash`（Base64 编码）

## API 端点

### POST /api/auth/register

注册新用户。

Request:
```json
{
  "email": "user@example.com",
  "username": "cooluser",
  "password": "securePass123",
  "turnstileToken": "turnstile-response-token"
}
```

Response (201):
```json
{
  "token": "jwt-token",
  "user": { "id": 1, "username": "cooluser", "avatar": "", "name": "cooluser" }
}
```

Error (400):
```json
{ "error": "邮箱已被注册" }
{ "error": "用户名已被占用" }
{ "error": "Turnstile 验证失败" }
```

### POST /api/auth/login-email

邮箱密码登录。

Request:
```json
{
  "email": "user@example.com",
  "password": "securePass123",
  "turnstileToken": "turnstile-response-token"
}
```

Response (200):
```json
{
  "token": "jwt-token",
  "user": { "id": 1, "username": "cooluser", "avatar": "", "name": "cooluser" }
}
```

Error (401):
```json
{ "error": "邮箱或密码错误" }
```

## 前端变更

### AuthModal.jsx

- 新增标签页切换：OAuth 登录 / 邮箱登录 / 邮箱注册
- 邮箱登录表单：邮箱 + 密码 + Turnstile
- 邮箱注册表单：邮箱 + 用户名 + 密码 + 确认密码 + Turnstile
- OAuth 登录保持不变

### AuthModal.css

- 标签页样式（pill 形状，与项目统一风格）
- 表单输入框样式（圆角，与现有搜索框一致）
- Turnstile widget 容器样式

### 环境变量

- `VITE_TURNSTILE_SITE_KEY`：Turnstile Site Key（前端）
- GitHub Actions secrets 中添加此变量

## 密码重置（预留）

依赖 Cloudflare Email Sending，当前不实现，预留 API 端点设计：

- `POST /api/auth/forgot-password`：发送重置链接到邮箱
- `POST /api/auth/reset-password`：验证一次性 token + 设置新密码
- Token 存储：D1 新建 `password_resets` 表（token, user_id, expires_at）

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `worker/schema.sql` | 修改 | 新增 password_hash, email_verified 字段 |
| `worker/oauth-proxy.js` | 修改 | 新增注册/登录端点、Turnstile验证、密码哈希 |
| `src/components/Common/AuthModal.jsx` | 修改 | 新增邮箱登录/注册标签页 |
| `src/components/Common/AuthModal.css` | 修改 | 标签页和表单样式 |
| `src/services/api.js` | 修改 | 新增 registerWithEmail, loginWithEmail |
| `index.html` | 修改 | CSP 添加 Turnstile 域名 |
| `oauth.config.js` | 修改 | 新增 Turnstile site key 配置 |
| `.github/workflows/deploy.yml` | 修改 | 添加 VITE_TURNSTILE_SITE_KEY 环境变量 |
