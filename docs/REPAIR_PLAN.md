# ANISpace 功能逻辑修复方案（REPAIR_PLAN）

| 字段 | 内容 |
| --- | --- |
| 文档版本 | v0.1（与 PRD v0.1 对齐） |
| 编写日期 | 2026-06-10 |
| 文档目的 | 依据 [PRD.md](./PRD.md) 与 [AUDIT_REPORT_LOGIC.md](./AUDIT_REPORT_LOGIC.md)，把"现状偏差"映射为"代码修复方案" |
| 范围 | 16 个功能模块，10 项已定决策 |
| 严重度分级 | 🔴 严重（功能不可用 / 数据丢失 / 假数据）/ 🟠 重要（业务逻辑偏差）/ 🟡 建议（边界打磨） |

---

## 0. 阅读指引

- 每个模块章节固定结构：**问题清单 → 共同重构 → 文件级修复 → 后端契约 → 验收**。
- 标 🔴 的修复必须先合入；标 🟠 的可以在 🔴 之后分批；标 🟡 的视迭代窗口。
- 修复顺序建议按"后端优先 → 数据迁移 → 客户端替换"三步走。

---

## 1. 全局共同修复（必须先做）

### 1.1 引入 `apiClient` 与统一的错误协议
- **现状**：每个组件用 `fetch` / `axios` 各写一套，错误没有归一。
- **修复**：
  - 新增 `src/services/apiClient.js`，封装 `baseURL`、`JWT 注入`、`401 自动刷新`、`错误码 → 中文文案`。
  - 统一响应：`{ data, error: { code, message, field? } }`。
- **涉及文件**：新增 `src/services/apiClient.js`；删除/改造 `WorldChannel/Mailbox/Amadeus` 等散落的 `fetch` 调用。
- **验收**：所有网络错误有中文 toast；401 触发静默刷新（详见 M-01）。

### 1.2 后端契约：上传协议
- **新增**：`POST /api/uploads`（multipart/form-data）→ `{ id, url, mime, size }`。
- **限制**：图片 ≤ 5MB、mp4 ≤ 50MB、仅 mime 白名单（image/jpeg|png|gif|webp、video/mp4）。
- **存储**：Cloudflare R2，URL 走 `https://cdn.anispace.com/{id}.{ext}`。
- **验收**：上传后用返回 URL 重新请求可直接访问；超限返回 `413` + 中文提示。

### 1.3 数据迁移脚本
- 旧 localStorage key（`acg_world_messages` / `acg_friend_space` / `acg_guestbook` / `acg_clubs` / `acg_notifications` / `acg_mails`）需在用户首次登录后引导"上传到云端"或"标记为旧数据，仅本机保留"。
- **入口**：`Settings > 数据管理 > 旧数据迁移`。
- **验收**：迁移有进度条 + 成功/失败逐条提示。

---

## 2. 模块 M-01 认证与个人中心

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M01-01 | 多标签 login state 串台 | 🔴 | `state` 存 `localStorage` | `state` 改 `sessionStorage`（每标签独立） |
| M01-02 | 无静默 token 刷新 | 🔴 | 无 refresh 流程 | `apiClient` 拦截 401 → 调 `POST /api/auth/refresh`（使用 refresh token httpOnly cookie）→ 失败则 `logout()` |
| M01-03 | 后端不可用时白屏 | 🟠 | 错误未捕获 | `OAuthCallback` 包 `try/catch` → 引导"网络问题"页 |
| M01-04 | 第三方拒绝无重试 | 🟡 | 错误文案缺失 | 文案映射表新增 `OAUTH_DENIED / OAUTH_TIMEOUT / OAUTH_STATE_MISMATCH` |
| M01-05 | `isAuthenticated` 与 `currentUser` 状态可能不同步 | 🟠 | `useState` 各自初始化 | 抽 `useAuth()`，单 source of truth |

- **涉及文件**：
  - [src/services/AuthService.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/AuthService.js) — 改为 sessionStorage
  - [src/pages/OAuthCallback.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/pages/OAuthCallback.jsx) — 错误分支
  - [src/context/AppContext.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/context/AppContext.jsx) — 统一 auth 状态
- **后端契约**：
  - `POST /api/auth/login` → `{ accessToken, refreshToken(由 Set-Cookie), user }`
  - `POST /api/auth/refresh` → 新 `accessToken`，Set-Cookie 续 refresh
  - `POST /api/auth/logout` → 清 cookie
- **验收**：
  - 同浏览器开 2 标签，2 次 GitHub 登录互不串台。
  - accessToken 过期后，下一次 API 自动刷新，**不打断用户**。
  - 第三方拒绝 → 显示"已拒绝授权，是否重试？"

---

## 3. 模块 M-02 资料页 / 追番隐私默认

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M02-01 | 上传/保存无错误反馈 | 🟠 | 表单未监听 `try/catch` | `Profile.jsx` 中 `await updateProfile` 包 `try/catch` + 失败 toast；上传走 `apiClient` |
| M02-02 | 默认 visibility=public，违反"社交更安全"原则 | 🟠 | 旧产品假设 | 追番/收藏默认 visibility=friends；个人页加"公开/仅好友"切换 |
| M02-03 | 头像 5MB 限制仅前端粗略 | 🟡 | 用 `<input accept>` | 提交前用 `URL.createObjectURL` + `img.naturalWidth` 校验，错误时清空 |

- **涉及文件**：
  - [src/components/Profile/Profile.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/Profile.jsx) — 表单错误处理
  - [src/components/Profile/CollectionList.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/CollectionList.jsx) — 默认 visibility
- **后端契约**：
  - `GET /api/users/:id/privacy` → `{ collections: 'friends' | 'public' }`
  - `PUT /api/users/:id/privacy` → 同上
  - `GET /api/users/:id/collections?visibility=` 强制后端校验，**不接受客户端 visibility**
- **验收**：
  - 新用户注册后追番/收藏默认 `friends`，个人页"公开"开关可切换。
  - 改 privacy 保存失败时，输入框不关闭且显示错误。

---

## 4. 模块 M-03 论坛

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M03-01 | 图片/视频只走 `URL.createObjectURL` blob | 🔴 | 未真上传 | 发帖前先 `POST /api/uploads`，URL 入库 |
| M03-02 | 热度排序只按 views | 🟠 | `score = views + ...*0` | 后端综合 `(likes*2 + replies*1.5 + views*0.1) * 24h 衰减` |
| M03-03 | 删除帖子未真正调接口 | 🟠 | 客户端假删 | `DELETE /api/posts/:id` 软删，30 天后清理 |

- **涉及文件**：
  - [src/components/Forum/Forum.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Forum/Forum.jsx) — 发帖前上传
  - [worker/routes/posts.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/posts.js) — 热度算法
- **后端契约**：
  - `POST /api/posts` body `{ title, content, tags, imageIds[] }`
  - `GET /api/posts?sort=hot&category=&page=` 服务端排序
  - `DELETE /api/posts/:id` 软删
- **验收**：
  - 发帖附图，刷新后图片 URL 仍可访问（指向 R2）。
  - 热帖榜 30 分钟内排序与 likes/replies 强相关。

---

## 5. 模块 M-04 世界频道

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M04-01 | 纯 localStorage，跨设备不可见 | 🔴 | 无后端 | 全部消息走 `world_messages` 表（见 worker） |
| M04-02 | `id: Date.now()` 冲突 | 🔴 | 客户端自增 | 后端发 `id`，前端不生成 |
| M04-03 | "在线人数" 100 假数据 | 🟠 | 硬编码 | `POST /api/heartbeat`，后台统计 5min 内活跃用户数；前端每 60s 调一次 |
| M04-04 | 头像/昵称客户端自填 | 🟠 | 不安全 | 后端用 token 解析，**永远以服务端为准** |

- **涉及文件**：
  - [src/components/WorldChannel/WorldChannel.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/WorldChannel/WorldChannel.jsx) — 切到 apiClient
  - [src/services/storage.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/storage.js) — 移除 `acg_world_messages`
  - [worker/routes/world.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/world.js) — 新增/改造
- **后端契约**：
  - `GET /api/world-messages?sort=&page=&limit=` → `{ list, hasMore, onlineCount }`
  - `POST /api/world-messages` → `{ content, imageIds[] }`
  - `POST /api/heartbeat`（匿名也可）
- **验收**：
  - 设备 A 发送 → 设备 B 30s 内可见。
  - onlineCount ≤ 注册用户数；关浏览器 5 分钟后 onlineCount 不再计该用户。

---

## 6. 模块 M-05 邮箱/私信

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M05-01 | 星标文件夹坏（等同全部） | 🟠 | 列表筛选用 `tab==='starred'` 但没过滤 `starred===true` | `Mailbox.jsx` `loadMails(folder)` 中 `starred` 文件夹追加 `where starred=true` |
| M05-02 | 附件仅 metadata，无真实文件 | 🔴 | 模拟对象 | 上传后用 `attachmentIds[]` 写入 `mails` 表，收件人下载时再走 `GET /api/uploads/:id` |
| M05-03 | 给自己发邮件 | 🟡 | 旧策略 | 前后端双重禁：前端禁用"收件人=自己"；后端 400 |
| M05-04 | 未读徽标与列表不同步 | 🟠 | 多次 `loadData` 抢占 | 单 `unreadCount` state 走 `POST /api/mails/read` 增量更新 |

- **涉及文件**：
  - [src/components/Mailbox/Mailbox.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Mailbox/Mailbox.jsx)
  - [src/services/MailService.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/MailService.js) — 附件上传
  - [worker/routes/mails.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/mails.js) — starred 过滤
- **后端契约**：
  - `POST /api/mails` body `{ toUserId, subject, content, attachmentIds[] }`
  - `GET /api/mails?folder=inbox|sent|starred&page=`
  - `PUT /api/mails/:id/star` toggle
- **验收**：
  - 发邮件带 1 附件，收件人下载原文件成功。
  - 切到"星标"显示已星标邮件，与操作实时一致。

---

## 7. 模块 M-06 好友空间

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M06-01 | visibility=friends 实际所有人可见 | 🔴 | 客户端自己过滤 | 后端 `GET /api/space-posts` 根据 `currentUser` 与 `author` 的 `mutual` 字段过滤 |
| M06-02 | "分享"按钮死链 | 🟠 | 未实现 | 生成本平台 `/space/{id}` 短链，复制到剪贴板 |
| M06-03 | 自己的动态可编辑 | 🟡 | 旧策略 | v1 改为不可编辑（已约定），删除走 `DELETE /api/space-posts/:id` |
| M06-04 | 访客数不去重 | 🟠 | 简单 `views+1` | 5min 内同 userId / 同 cookie 只 +1 |

- **涉及文件**：
  - [src/components/FriendSpace/FriendSpace.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/FriendSpace/FriendSpace.jsx)
  - [src/services/storage.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/storage.js) — 移除 `acg_friend_space`
  - [worker/routes/space.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/space.js)
- **后端契约**：
  - `GET /api/space-posts?userId=&page=` 服务端按 mutual 过滤
  - `POST /api/space-posts` body `{ content, imageIds[], visibility }`
  - `POST /api/space-posts/:id/like` toggle
  - `POST /api/space-posts/:id/view` 5min 去重
- **验收**：
  - A 单向关注 B 时，A 看不到 B 的 friends-only 动态；变互关后能看。
  - 点赞 1s 内 UI 反馈。

---

## 8. 模块 M-07 通知中心

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M07-01 | 进入页面即 mark all read | 🔴 | `useEffect` 直接全标已读 | 删除该 `useEffect`；改为用户主动点击"全部已读"或单条点击触发 `PUT /api/notifications/:id/read` |
| M07-02 | 未读徽标与列表不同步 | 🟠 | 本地累加 | 徽标 = `GET /api/notifications/unread-count`，单点变化后 invalidate |
| M07-03 | 通知类型字段无后端推送 | 🟠 | 客户端生成 | 统一由后端在 like/comment/follow 行为后写 `notifications` 表 |

- **涉及文件**：
  - [src/components/Notifications/Notifications.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Notifications/Notifications.jsx) — 移除自动 mark
  - [worker/routes/notifications.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/notifications.js) — 触发器
- **后端契约**：
  - `GET /api/notifications?unread=&page=`
  - `PUT /api/notifications/:id/read`
  - `PUT /api/notifications/read-all`
  - `GET /api/notifications/unread-count`
- **验收**：
  - 打开通知页不立即清零未读。
  - 点击单条后徽标 -1。

---

## 9. 模块 M-08 Wiki / 排行榜

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M08-01 | 排序缓存粒度粗（key 不带 sort） | 🟠 | IndexedDB 缓存只存一份 | 缓存 key = `${type}-${sort}-page`；或每次排序不读缓存 |
| M08-02 | 人物类型走 subjects 接口 | 🟠 | URL 写死 | 抽 `searchSubjects(keyword, type)`，type=persons 走 `/persons` |
| M08-03 | 随机推荐无"换一条" | 🟡 | 仅 initial 一次 | 加按钮调 `GET /api/wiki/random?type=` 后端抽签 |

- **涉及文件**：
  - [src/components/Wiki/Wiki.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Wiki/Wiki.jsx)
  - [src/services/wikiService.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/wikiService.js) — 缓存 key
- **后端契约**：
  - `GET /api/wiki/random?type=` 由 Worker 维护 200 条预热池
- **验收**：
  - 切"评分 / 热度 / 日期"时排行榜内容确实重排。
  - 随机推荐有"换一条"按钮且每次都不同。

---

## 10. 模块 M-09 视频聚合

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M09-01 | 自定义源 URL 无校验 | 🟠 | 简单正则 | 校验 `https://` 开头 + 域名白名单 + "测试连接" |
| M09-02 | 源失败时与搜索失败混淆 | 🟡 | 全部 fail | 错误分类：源失败 vs 搜索失败，分别 toast |
| M09-03 | 源列表 v1 仅本地 | 🟡 | 缺后端 | v1 本地 + 后续 `GET/POST /api/video-sources` |

- **涉及文件**：
  - [src/components/Video/VideoZone.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Video/VideoZone.jsx) — URL 校验
  - [src/services/videoService.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/videoService.js)
- **验收**：
  - 1 源失败其他源结果仍展示，并明确"X 源失败"。
  - 自定义源添加时若 URL 不合规立即报错。

---

## 11. 模块 M-10 音乐

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M10-01 | 导入歌单覆盖当前播放队列 | 🟠 | `setPlaylist(...)` 直接覆盖 | 导入弹"新建 / 替换"二选一 |
| M10-02 | 音量 / 上次位置不记忆 | 🟠 | 关闭即丢 | `localStorage.anispace.music` 存 `{ volume, position, currentId }` |
| M10-03 | 跨域 / Referer | 🟠 | 第三方直连 | 走 `apiClient` 代理，隐藏 referer |
| M10-04 | 国际化地区无版权提示 | 🟡 | 未做 | 启动时 `fetch('https://ipapi.co/json/')` 判断地区 |

- **涉及文件**：
  - [src/components/Music/MusicPlayer.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Music/MusicPlayer.jsx)
  - [src/services/musicService.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/musicService.js) — 走代理
- **后端契约**：
  - `GET /api/music/search?server=&q=`
  - `GET /api/music/url?server=&id=`
  - `POST /api/music/import` body `{ server, id, mode: 'new'|'replace' }`
- **验收**：
  - 刷新页面音量条恢复至原值。
  - 导入歌单默认"新建"，原播放队列不丢。

---

## 12. 模块 M-11 资讯区

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M11-01 | 标签误导（条目当新闻） | 🟠 | 渲染不分类 | 列表卡片分 `news-card / subject-card` 两套样式 |
| M11-02 | 投稿无错误回填 | 🟠 | 表单无 try/catch | 同 M-02-01 模式 |
| M11-03 | 资讯列表 v1 走 MOCK | 🟡 | 后端未实现 | `GET /api/news?type=&page=` + 提交 `POST /api/news` |

- **涉及文件**：
  - [src/components/NewsZone/NewsZone.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/NewsZone/NewsZone.jsx)
  - [worker/routes/news.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/news.js)
- **验收**：
  - 卡片标题前图标区分"业界新闻" vs "条目资讯"。
  - 投稿失败表单不关闭且有错误。

---

## 13. 模块 M-12 TouchGal

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M12-01 | URL 校验弱（可 javascript:） | 🟠 | 缺协议校验 | `new URL` + 协议白名单（http/https） |
| M12-02 | iframe 加载失败白屏 | 🟡 | 无 fallback | `onError` 显示"重试 / 外部打开"两按钮 |
| M12-03 | 书签 v1 仅本地 | 🟡 | 缺后端 | v1 本地；v2 `GET/POST/DELETE /api/touchgal/bookmarks` |

- **涉及文件**：
  - [src/components/TouchGal/TouchGalApp.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/TouchGal/TouchGalApp.jsx)
- **验收**：
  - 输入 `javascript:alert(1)` 被拒绝。
  - 加载失败时不卡白屏。

---

## 14. 模块 M-13 社团

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M13-01 | 纯 localStorage | 🔴 | 无后端 | 社团、成员、消息全走 `clubs`/`club_members`/`club_messages` 表 |
| M13-02 | 社长离场无自动处理 | 🟠 | 状态机缺规则 | `POST /api/clubs/:id/leave` 由后端在事务中执行"自动选 next president"（admin 优先 → 最早成员） |
| M13-03 | admin 不能任命自己 | 🟡 | 缺校验 | 后端 400 |
| M13-04 | 满员可继续加入 | 🟠 | 缺判断 | 后端 `members_count >= maxMembers` 拒绝 |

- **涉及文件**：
  - [src/components/Club/Club.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Club/Club.jsx) — 切到 apiClient
  - [src/services/storage.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/storage.js) — 移除 `acg_clubs`
  - [worker/routes/clubs.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/clubs.js) — 状态机
- **后端契约**：
  - `POST /api/clubs/:id/leave` 事务：
    1. 查当前 president 是否退群
    2. 选 next president：admin 最早 → member 最早
    3. 写 `notifications` 给双方
    4. 无人时设 club `dissolved_at`
- **验收**：
  - 社长退出会自动转让或解散，**不留"无主社团"**。
  - admin 不能任命自己（前后端都拒）。

---

## 15. 模块 M-14 留言板

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M14-01 | 同步 afterrain 是模拟 | 🔴 | 90% 随机 | 走真实 `POST https://afterrain.atabook.org/...`（后端代理） |
| M14-02 | 游客身份识别不严 | 🟠 | 缺持久化 | 客户端 `crypto.randomUUID()` 存 `acg_visitor` cookie |
| M14-03 | 同步状态不显示重试 | 🟠 | 失败即失败 | UI 给出"重试同步"按钮 |

- **涉及文件**：
  - [src/components/Guestbook/Guestbook.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Guestbook/Guestbook.jsx)
  - [worker/routes/guestbook.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/guestbook.js)
  - [worker/routes/afterrain.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/afterrain.js) — 真实代理
- **后端契约**：
  - `GET /api/guestbook?page=`
  - `POST /api/guestbook` body `{ content, replyToId?, nickname? }`，可选 `visitorToken`
  - `POST /api/guestbook/:id/like`，userId 或 visitorToken
  - `POST /api/guestbook/:id/sync` 重试
- **验收**：
  - 留言真实提交到后端，刷新后仍可见。
  - 同步失败时显示"重试同步"按钮，点后真实调用 afterrain。

---

## 16. 模块 M-15 Amadeus

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M15-01 | 失败降级无提示 | 🟠 | 静默 fallback | 云端 API 失败 → toast "已切换本地模式" + 标记 fallback |
| M15-02 | 清空记录藏得深 | 🟡 | 在设置子菜单 | 主面板加"清空"按钮，confirm 后**同步云端** |
| M15-03 | 历史不跨设备 | 🔴 | v1 仅 localStorage | `POST/GET/DELETE /api/amadeus/conversations` |
| M15-04 | API Key 泄漏到 localStorage | 🟠 | 误用 | 改 sessionStorage；cloud 模式 Key 由后端中转 |
| M15-05 | localStorage 4MB 限制 | 🟡 | 无监控 | 容量超 4MB 弹窗"清理 / 同步到云端" |

- **涉及文件**：
  - [src/components/Amadeus/Amadeus.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Amadeus/Amadeus.jsx)
  - [src/services/amadeusService.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/amadeusService.js)
  - [worker/routes/amadeus.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/amadeus.js) — 新增
- **后端契约**：
  - `GET /api/amadeus/conversations?cursor=` 分页拉
  - `POST /api/amadeus/messages` 存用户/AI 消息
  - `DELETE /api/amadeus/conversations` 清空
- **验收**：
  - 设备 A 发消息 → 设备 B 切换 Amadeus 拉到完整历史。
  - 云端失败时 UI 明确提示"已切换本地模式"。
  - 清空记录主面板 1-click 完成。

---

## 17. 模块 M-16 追番 / 收藏 / 评分

| ID | 问题 | 严重度 | 根因 | 修复方案 |
| --- | --- | --- | --- | --- |
| M16-01 | 评分范围未做前端限制 | 🟠 | 无 min/max | `<input type="number" min="0" max="10" step="1">` + 提交校验 |
| M16-02 | 五态切换无后端 | 🟡 | 旧 localStorage | `PUT /api/collections { subjectId, status }` |

- **涉及文件**：
  - [src/components/Profile/RatingEditor.jsx](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/components/Profile/RatingEditor.jsx) — 范围校验
  - [worker/routes/collections.js](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/routes/collections.js)
- **验收**：
  - 输入 11 立即提示"评分范围 0-10"。
  - 五态切换跨设备实时一致。

---

## 18. 修复优先级与里程碑

### Milestone 1（紧急 🔴）：核心数据真源切换
- M01 (02) / M03 (01) / M04 (01,02) / M05 (02) / M06 (01) / M07 (01) / M13 (01) / M14 (01) / M15 (03)
- 完成标志：上述 9 项的"假数据/本地化"全部消除，对应接口 E2E 通过。

### Milestone 2（重要 🟠）：业务逻辑闭合
- M01 (03,05) / M02 (01,02) / M03 (02,03) / M04 (03,04) / M05 (01,03,04) / M06 (02,04) / M07 (02,03) / M08 (01,02) / M09 (01,02) / M10 (01,02,03) / M11 (01,02) / M12 (01,02) / M13 (02,04) / M14 (02,03) / M15 (01,04,05) / M16 (01,02)
- 完成标志：所有 PRD 验收标准可通过手工或 E2E 验证。

### Milestone 3（建议 🟡）：打磨
- 全部 🟡 项、文案、本地化、动画、可访问性、性能调优。

---

## 19. 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| 老用户本地数据丢失 | M-1.3 迁移脚本 + 引导页 |
| 后端 R2 写入失败 | 客户端保留"草稿"到 localStorage，事后手动重发 |
| OAuth 第三方变更 | `provider` 抽象层，加新 provider 不影响业务 |
| 评分算法改动老帖热度跳变 | 旧帖用旧 `views` 单独字段，新帖用 `score` 字段，不混用 |

---

## 20. 测试要求

- 每个模块至少 1 happy path 单元 + 1 关键边界 E2E。
- 关键 E2E 列表：
  - 双设备同时发世界频道消息互见
  - 单向关注下 friends-only 动态不可见
  - 社长退群自动转让
  - JWT 过期 5min 前静默刷新

---

---

## 21. 附录 A：数据库新增/改造 DDL

> 现有表见 [worker/schema.sql](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/schema.sql)。本附录仅列出 **REPAIR_PLAN 引入的新表与对已有表的字段补充**。
> 落地时建议新建 [worker/migrations/](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/) 目录，按 v001_, v002_ 顺序管理。

### 21.1 新表

```sql
-- 通用上传记录（M-1.2）
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,                  -- UUIDv7
  user_id INTEGER NOT NULL REFERENCES users(id),
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  url  TEXT NOT NULL,                   -- R2 公网 URL
  width  INTEGER,
  height INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at DESC);

-- 在线心跳（世界频道 5min 活跃窗口，M04）
CREATE TABLE IF NOT EXISTS heartbeats (
  user_id INTEGER NOT NULL REFERENCES users(id),
  seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id)
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_seen ON heartbeats(seen_at DESC);

-- 好友空间动态（M06）
CREATE TABLE IF NOT EXISTS space_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  image_ids TEXT DEFAULT '[]',          -- upload.id 列表
  visibility TEXT NOT NULL DEFAULT 'friends',  -- public | friends
  view_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_space_posts_author ON space_posts(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS space_post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES space_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS space_post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES space_posts(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 社团（M13）
CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  max_members INTEGER DEFAULT 200,
  president_id INTEGER NOT NULL REFERENCES users(id),
  dissolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS club_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',  -- president | admin | member
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(club_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_club_members_club ON club_members(club_id);

CREATE TABLE IF NOT EXISTS club_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_club_messages_club ON club_messages(club_id, created_at DESC);

-- 留言板（M14）
CREATE TABLE IF NOT EXISTS guestbook_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),     -- 登录用户；游客为 NULL
  visitor_token TEXT,                       -- 游客 UUID
  nickname TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  content TEXT NOT NULL,
  reply_to_id INTEGER REFERENCES guestbook_messages(id),
  sync_status TEXT DEFAULT 'none',           -- none | pending | synced | failed
  sync_url   TEXT,
  sync_error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook_messages(created_at DESC);

CREATE TABLE IF NOT EXISTS guestbook_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES guestbook_messages(id),
  user_id INTEGER REFERENCES users(id),
  visitor_token TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_guestbook_likes_msg ON guestbook_likes(message_id);

-- Amadeus 对话历史（M15-03 跨设备同步）
CREATE TABLE IF NOT EXISTS amadeus_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,                  -- user | assistant | system
  content TEXT NOT NULL,
  expression TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_amadeus_user ON amadeus_messages(user_id, created_at);
```

### 21.2 对已有表的字段补充

```sql
-- users：隐私默认 friends（M02-02）
ALTER TABLE users ADD COLUMN collections_visibility TEXT DEFAULT 'friends';  -- public | friends
ALTER TABLE users ADD COLUMN favorites_visibility   TEXT DEFAULT 'friends';

-- mails：已存在 starred 字段，**接口已实现** PUT /api/mails/:id/star，客户端需正确过滤（M05-01）
-- world_messages：补图片字段支持（M04）
ALTER TABLE world_messages ADD COLUMN image_ids TEXT DEFAULT '[]';

-- collections：评分字段已存在；范围约束 0-10（M16-01）
-- 假设创建时已带 CHECK；若表已存在，则新建触发器抛错
CREATE TRIGGER IF NOT EXISTS trg_collections_rating_insert
BEFORE INSERT ON collections
FOR EACH ROW WHEN NEW.rating IS NOT NULL AND (NEW.rating < 0 OR NEW.rating > 10)
BEGIN SELECT RAISE(ABORT, 'rating out of range'); END;

CREATE TRIGGER IF NOT EXISTS trg_collections_rating_update
BEFORE UPDATE ON collections
FOR EACH ROW WHEN NEW.rating IS NOT NULL AND (NEW.rating < 0 OR NEW.rating > 10)
BEGIN SELECT RAISE(ABORT, 'rating out of range'); END;

-- ratings：同样加 CHECK
CREATE TRIGGER IF NOT EXISTS trg_ratings_score_insert
BEFORE INSERT ON ratings
FOR EACH ROW WHEN NEW.score < 0 OR NEW.score > 10
BEGIN SELECT RAISE(ABORT, 'score out of range'); END;

CREATE TRIGGER IF NOT EXISTS trg_ratings_score_update
BEFORE UPDATE ON ratings
FOR EACH ROW WHEN NEW.score < 0 OR NEW.score > 10
BEGIN SELECT RAISE(ABORT, 'score out of range'); END;

-- posts：删 soft-delete 列（M03-03）
ALTER TABLE posts ADD COLUMN deleted_at TEXT;

-- notifications：未读徽标独立计数接口已实现（M07-02）
-- 现 notifications 表已支持，无需新增字段
```

### 21.3 索引补充（来自 [AUDIT_REPORT.md](./AUDIT_REPORT.md) M-11）

```sql
CREATE INDEX IF NOT EXISTS idx_posts_category_created ON posts(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_to_from_read ON private_messages(to_user_id, from_user_id, read);
```

---

## 22. 附录 B：项目目录结构（修复后建议形态）

> 现状：[worker/](file:///d:/Desktop/Ideas/ANISpace/ANISpace/worker/) 是单文件 `oauth-proxy.js`（1225 行），所有路由 inline。
> 修复阶段建议**先保持单文件结构**完成逻辑改造，再视代码量决定是否拆分。
> 以下是修复后**推荐**的最终结构（按需采纳）。

```
ANISpace/
├── src/
│   ├── components/                       # 现有（与 M-01~M-16 对应）
│   │   ├── Amadeus/                      # M-15
│   │   ├── Club/                         # M-13
│   │   ├── Common/                       # AuthModal / MarkdownEditor / Live2DWidget 等
│   │   ├── Forum/                        # M-03 + PostDetail
│   │   ├── FriendSpace/                  # M-06
│   │   ├── Guestbook/                    # M-14
│   │   ├── Info/                         # 条目详情
│   │   ├── Layout/                       # AppWindow / DockBar / Header / Layout
│   │   ├── Mailbox/                      # M-05
│   │   ├── Music/                        # M-10
│   │   ├── NewsZone/                     # M-11（含 NewsDetail）
│   │   ├── Notification/                 # M-07（注意目录名是单数 Notification）
│   │   ├── Profile/                      # M-02
│   │   ├── TouchGal/                     # M-12
│   │   ├── Video/                        # M-09（含 VideoDetail）
│   │   ├── Wiki/                         # M-08
│   │   └── WorldChannel/                 # M-04
│   ├── services/                         # 业务 Service 层
│   │   ├── apiClient.js                  # ⭐ 新增（M-1.1）：统一 fetch/错误/401 刷新
│   │   ├── AuthService.js                # M-01
│   │   ├── MailService.js                # M-05
│   │   ├── UploadService.js              # ⭐ 新增（M-1.2）
│   │   ├── AmadeusService.js             # M-15
│   │   ├── ClubService.js                # M-13
│   │   ├── SpaceService.js               # ⭐ 新增（M-06）
│   │   ├── GuestbookService.js           # M-14
│   │   ├── MusicService.js               # M-10
│   │   ├── VideoSourceService.js         # M-09
│   │   ├── WikiService.js                # M-08
│   │   ├── NotificationService.js        # M-07
│   │   ├── storage.js                    # 旧 localStorage 包装，新功能不应再调用
│   │   └── ...（其他既有 Service）
│   ├── context/
│   │   └── AppContext.jsx                # 收敛 auth + user 状态
│   ├── pages/
│   │   └── OAuthCallback.jsx             # M-01 错误分支
│   └── utils/
│       ├── sanitize.js                   # ⭐ 新增（抽离 M-2, C-2 修复）
│       └── safeUrl.js                    # 协议白名单
│
├── worker/                               # Cloudflare Worker 后端
│   ├── oauth-proxy.js                    # 路由总入口（暂保持单文件）
│   ├── schema.sql                        # 基础表
│   ├── migrations/                       # ⭐ 新增
│   │   ├── v001_uploads.sql
│   │   ├── v002_heartbeats.sql
│   │   ├── v003_space_posts.sql
│   │   ├── v004_clubs.sql
│   │   ├── v005_guestbook.sql
│   │   ├── v006_amadeus.sql
│   │   └── v007_privacy_columns.sql
│   ├── routes/                           # ⭐（可选）从 oauth-proxy.js 拆出
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── posts.js
│   │   ├── world.js
│   │   ├── space.js
│   │   ├── clubs.js
│   │   ├── mails.js
│   │   ├── guestbook.js
│   │   ├── amadeus.js
│   │   ├── news.js
│   │   ├── uploads.js                    # ⭐ 新增
│   │   └── bangumi_proxy.js
│   ├── lib/                              # ⭐ 抽公共
│   │   ├── jwt.js
│   │   ├── ssrf.js                       # isSafeTargetUrl
│   │   ├── cors.js
│   │   ├── errors.js
│   │   └── rateLimit.js                  # M-H7
│   ├── add-tables.sql                    # 已有
│   ├── drop-all.sql                      # 已有
│   └── wrangler.toml
│
├── docs/
│   ├── PRD.md                            # 产品需求
│   ├── REPAIR_PLAN.md                    # 本文档
│   ├── AUDIT_REPORT.md                   # 安全/质量审查
│   ├── API_INTEGRATION.md                # 第三方 API 集成规范
│   └── ...
│
└── tests/                                # ⭐ 新增（M-2 章节）
    ├── e2e/
    │   ├── world-channel.spec.js
    │   ├── space-privacy.spec.js
    │   ├── club-president-leave.spec.js
    │   └── jwt-refresh.spec.js
    └── unit/
        └── ...
```

> **改造原则**：先**内聚**（一个文件），再**按需拆分**。当 `oauth-proxy.js` > 3000 行或单 PR 改动涉及多领域路由时，启动拆分。
>
> **审计跟踪**：本结构在 [AUDIT_REPORT.md M-3](./AUDIT_REPORT.md)、H-4、H-9 的修复中体现。

---

**以上** — REPAIR_PLAN.md v0.1 + 附录 A/B 完。
