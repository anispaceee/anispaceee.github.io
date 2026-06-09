# 待改进事项 - ANISpace 安全审计 2026-06-09

本文件记录因当前设计/复杂度原因延期的改进事项。

---

## H-8: 头像/背景图服务端校验 + R2 存储迁移

### 当前问题
- `PUT /api/users/:id` 接受 `avatar` 和 `bg_image` 直接存储 base64 到 D1，无大小/内容校验
- 用户可以发送几 MB 的 base64，轻易触发 D1 `row_too_large` 错误，同时撑爆数据库存储

### 改进方案
1. **前置校验**：后端收到 avatar/bg_image 后：
   - 如果是 base64: 解码得到 bytes，校验长度 `< 512KB`
   - 检查 magic number (`89504e47` = PNG, `ffd8ffe0/ffd8ffe1` = JPEG, `47494638` = GIF, `52494646` = WEBP)，只允许图片格式
   - 不合法直接拒绝
2. **转存 R2**：将图片存储到 Cloudflare R2 对象存储，D1 只存 `avatarKey` 而非完整 base64
3. **访问优化**：将 R2 绑定自定义域名，浏览器可直接 `GET r2.域名.com/anispace/avatars/{userId}.png`，避免 Worker 中转
4. **环境变量**：Worker 需要 `[[r2_buckets]]` binding `bucket_name = "anispace-avatars"`

### 必要准备
- 在 Cloudflare R2 创建 bucket "anispace-avatars"
- 在 `worker/wrangler.toml` 添加 binding:
  ```toml
  [[r2_buckets]]
  binding = "AVATARS_BUCKET"
  bucket_name = "anispace-avatars"
  ```
- 在 Cloudflare Dashboard 配置 bucket 公开访问，或者自定义域名

---

## M-8: Amadeus API Key 完整后端代理

### 当前问题
- 当前只从 localStorage 改为 sessionStorage，仍前端可见
- 用户在页面上配置的 API Key 仍可能被 XSS 窃取

### 改进方案
1. **环境变量**：Cloudflare Worker 中配置 `AMADEUS_API_KEY` 作为 secret
2. **代理端点**：新增 `/api/amadeus/chat` 端点：
   - 前端仅发送 `messages`，API Key 由 Worker 从环境变量读取
   - 请求转发到 OpenAI API，响应返回给前端
3. **前端改造**：移除本地配置 UI，固定使用后端代理
   - 优点：API Key 永不离开后端
   - 缺点：对用户开放配置多种 key 的灵活性会丧失

### 备选方案（保留用户配置但更安全）
1. 保持用户可配置 API Key，但不存储在任何持久化介质（关闭即丢）
2. 当前 sessionStorage 已经实现此，无需进一步改动

---

## H-9: WorldChannel 完全迁移后端

### 当前问题
- WorldChannel 发帖目前还是存在 `localStorage` 仅本地可见
- 多端不同步，"在线人数"显示注册用户数而非实时在线
- 发布消息冲突，多人发帖互相覆盖

### 改进方案
1. **前后端改动**：
   - 前端：重构 `WorldChannel` 组件，移除 localStorage 存储，调用 `WorldChannelService.listMessage/sendMessage`
   - 后端：D1 表 `world_messages` 已存在，增加字段 `user_name`, `user_avatar`
   - 增加分页查询（最新 50 条，可下拉加载更多）
2. **online 用户统计**：利用 CF 提供 `wrangler tail` 或 Cloudflare Radar 无法访问，改用：
   - 近 5 分钟内有请求的用户数存在内存，粗略统计在线人数
3. **删除本地 localStorage 冗余清理逻辑**

### 预期收益
- 所有用户可见同一份世界频道消息列表，支持多人聊天
- 数据持久化到 D1，不会丢失

---

## 其他

### D1 迁移注意事项
schema.sql 已经补充了所有缺失索引，部署时需要执行：
```
wrangler d1 execute D1_DATABASE --file=worker/schema.sql
```

---

## 已完成待办

- [x] C-1 verifyJWT 死循环修复（`+=` + try-catch + token 长度校验）
- [x] C-2 Markdown XSS + M-2 Forum/Mailbox XSS
- [x] C-3 SSRF 防护
- [x] H-1 OAuth state 防 CSRF
- [x] H-2 ALLOWED_ORIGIN 精确匹配
- [x] H-3 redirect_uri 白名单
- [x] H-4 JWT 从 localStorage → sessionStorage
- [x] H-5 从 GitHub Actions 移除 VITE_*_CLIENT_SECRET （用户选择保留）
- [x] H-6 错误信息脱敏（用户选择保持原样方便调试）
- [x] H-7 基于内存 Map 的 Rate Limit
- [x] M-1 CSP 响应头
- [x] M-4 关注计数原子批量更新
- [x] M-5 preferences JSON.parse
- [x] M-6 缓存从 localStorage → IndexedDB with LRU
- [x] M-7 视频 URL 安全校验
- [x] M-8 Amadeus API Key 从 localStorage → sessionStorage
- [x] M-10 移除 wrangler.toml account_id
- [x] M-11 D1 补建索引
- [x] M-12 videoSource 失败源计数显示
- [x] L-1/L-2 .gitignore 补全
- [x] L-4 404.html sessionStorage 重复写入守卫
- [x] L-5 ESLint 加入 jsx-a11y
- [x] L-6 图片增加 loading="lazy"
- [x] L-7 组件卸载清理 error 状态
- [x] L-9 控制台脱敏
