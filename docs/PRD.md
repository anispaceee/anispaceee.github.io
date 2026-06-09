# ANISpace 产品需求文档（PRD）

| 字段 | 内容 |
| --- | --- |
| 文档版本 | v0.1（草案，待确认） |
| 编写日期 | 2026-06-10 |
| 产品定位 | 面向二次元（ACG）用户的桌面端 Web 社区平台 |
| 目标用户 | 18–35 岁，动漫 / 游戏 / 轻小说核心向用户 |
| 平台 | 桌面浏览器优先（兼容移动浏览器），Windows PWA 友好 |
| 技术栈 | React 18 + Vite + Cloudflare Workers + D1（SQLite） |
| 文档目的 | 锁定"应该是什么样"，与代码现状对照得到修复清单 |

---

## 1. 产品概述

### 1.1 一句话定位
> ANISpace 是一款"以个人空间 + 兴趣社团为入口、以条目百科为骨架"的 ACG 社区桌面应用，让用户能在一个跨设备同步的空间里追番、发帖、组社团、与同好交流。

### 1.2 核心价值
1. **跨设备同步**：所有社交数据均落服务端（D1），多端一致。
2. **桌面优先体验**：以"窗口 + Dock + 玻璃拟态"UI 模拟桌面应用，承载多模块。
3. **数据透明**：评分、收藏、追番数据可被公开查阅，形成信任。
4. **轻量 AI 伴侣**：Amadeus 提供命运石之门风格的角色对话，可切换本地规则 / OpenAI 兼容 API。

### 1.3 范围声明（In / Out）
| In | Out（v1 不做） |
| --- | --- |
| 论坛、世界频道、好友空间、邮箱/私信、留言板、社团、通知、收藏/追番、评分、视频聚合、音乐、Wiki 排行榜、资讯区、TouchGal 嵌入、Amadeus AI 助手 | 视频上传/转码、社区商城、付费订阅、移动端原生 App、消息推送（Web Push）、IM 端到端加密 |

### 1.4 名词表
| 名词 | 解释 |
| --- | --- |
| **条目** | 来自 Bangumi 的 Subject（动画/小说/游戏/音乐），是平台最基础的数据实体 |
| **追番** | 用户对条目的收藏标记，五态：想看/在看/看过/搁置/抛弃 |
| **空间** | 用户的"个人空间"，含资料、收藏、好友动态、活跃度 |
| **Dock** | 桌面底部功能入口栏（仿 macOS Dock） |
| **窗口** | 由 WindowManager 管理的多模块容器，类 macOS Window |
| **Amadeus** | AI 角色，对应《命运石之门》牧瀬紅莉栖 |

---

## 2. 用户与权限模型

### 2.1 用户角色
| 角色 | 来源 | 权限 |
| --- | --- | --- |
| **游客 (Guest)** | 未登录 | 可见公开内容，可读 Wiki、论坛、世界频道只读 |
| **用户 (User)** | OAuth 注册 | 全部社交功能、追番、评分、发帖、社团 |
| **认证用户 (Verified)** | 绑定 Bangumi/GitHub | 资料旁显示"已认证"徽标 |
| **管理员 (Admin)** | 数据库标记 | 删除任意内容、封禁用户、编辑公告 |

### 2.2 隐私矩阵
| 字段 | public | friends | private |
| --- | --- | --- | --- |
| 个人简介、签名 | ✓ | ✓ | ✓（仅自己） |
| 追番列表 | ✓（默认） | ✓ | ✓ |
| 收藏 | ✓（默认） | ✓ | ✓ |
| 好友空间动态 | ✓（标记为 public 的） | ✓（标记为 friends 的，**仅互关用户可见**） | × |
| 邮箱地址 | × | × | ✓ |
| 第三方联系方式 | × | × | ✓ |

> 关键决策：好友空间 visibility=public 的内容**所有用户可见**；visibility=friends 的内容**必须经"我关注他且他关注我"的双向关系校验后**才可见。

### 2.3 状态机：帖子 / 评论 / 点赞
```
[草稿(仅自己可见)] ─ 提交 → [已发布]
[已发布] ─ 管理员/作者 → [已删除]（软删，保留 30 天）
[已发布] ─ 作者 → [已编辑]（保留 last_edit 标记）
[已发布] ─ 点赞 → [已点赞]（同用户再点 → 取消）
```

### 2.4 状态机：用户关系
```
陌生人 ─ A 关注 B → A→B 单向关注
陌生人 ─ A 关注 B 且 B 关注 A → 互相关注（互为好友）
互关 ─ A 取消关注 → 解除互关
封禁 ─ 管理员操作 → 不可登录，不可被搜索到
```

---

## 3. 核心信息架构

```
ANISpace
├── 顶栏 Header（Logo / 全局搜索 / 通知 / 用户菜单）
├── 左侧 Dock（Home / Forum / World / Mail / News / Wiki / Video / Music / Gal / Club / Amadeus / Guestbook / Profile / Settings）
├── 主内容区（Window）
│   ├── 窗口标题栏
│   ├── 模块内容
│   └── 状态栏（可选）
└── 底部 Dock（已打开的窗口列表）
```

---

## 4. 16 个功能模块的需求规格

> 编号 = 文档章节号。每个模块固定包含：**目标 / 用户故事 / 主流程 / 异常与边界 / 验收标准**。

### 4.1 模块 M-01：认证与个人中心（Auth & Account）
- **目标**：用户通过 Bangumi / GitHub OAuth 登录，跨设备保持会话。
- **用户故事**：
  - 作为新用户，我希望用 Bangumi 一键登录，省去注册。
  - 作为老用户，我希望关闭浏览器再打开时仍处于登录态。
  - 作为多账号用户，我希望在不同浏览器登录不同账号互不干扰。
- **主流程**：
  1. 用户点击登录 → 唤起 AuthModal。
  2. 选 Bangumi/GitHub → 跳转第三方授权页（带 `state` 防 CSRF）。
  3. 授权成功 → 第三方回调 `/oauth/callback?code=&state=` → Worker 用 code 换 token → 查/建用户 → 颁发 JWT。
  4. JWT 存 `sessionStorage`；用户基本信息存 `localStorage` 供离线读。
  5. 静默 token 刷新：JWT 过期前 5 分钟用 refresh token 续期。
- **异常与边界**：
  - 第三方授权拒绝 → 显示明确错误并提供"重试"。
  - state 不匹配 → 拒绝登录、清理 sessionStorage state。
  - 后端不可用 → 引导至"网络问题"页，不让用户卡在白屏。
- **验收**：
  - 同设备同浏览器双标签同时发起 GitHub 登录，state 不串台。
  - 主动调用 `logout()` 后，所有模块的"我"标识均立即变为未登录态。
  - JWT 过期后，下一次 API 调用触发静默刷新或引导重新登录。

### 4.2 模块 M-02：资料页（Profile）
- **目标**：展示并允许用户编辑公开资料。
- **用户故事**：
  - 作为用户，我希望编辑昵称、签名、头像、封面。
  - 作为访客，我希望看别人主页时只能看到他公开的内容。
- **主流程**：
  1. 打开 `/profile/:id`（无 id 为本人）。
  2. 显示：头像、昵称、签名、加入时间、社交账号、追番概览、活跃度热力图。
  3. 若为自己，显示"编辑资料 / 设置 / 私信"按钮组。
  4. 资料修改：表单 → 校验 → `PUT /api/users/:id` → 成功 toast，失败回滚表单。
- **异常与边界**：
  - 头像/封面上传：限制 JPG/PNG、≤5MB，超限给出明确错误提示。
  - 用户不存在 → "用户不存在"占位。
  - 他人主页 → 不显示"邮箱/联系方式"等私密字段。
- **验收**：
  - 头像上传超 5MB 立即显示"图片超过 5MB"。
  - 修改签名保存失败时，输入框不关闭且显示错误。

### 4.3 模块 M-03：论坛（Forum）
- **目标**：分板块（动画 / 游戏 / 小说 / 吹水）的图文/视频讨论区。
- **用户故事**：
  - 作为用户，我希望按板块/排序（最新/最热/回复）查看帖子。
  - 作为用户，我希望发帖时能插入图片/视频并预览。
- **主流程**：
  1. 列表页：`GET /api/posts?page=&limit=&category=` 支持分页与板块过滤。
  2. 详情页：`GET /api/posts/:id` + `GET /api/posts/:id/replies`。
  3. 发帖：`POST /api/posts`，携带 title、content（Markdown）、tags、images（已上传 URL 列表）。
  4. 图片/视频上传：先 `POST /api/uploads` 拿到 URL，再带 URL 提交帖子。
- **异常与边界**：
  - 未登录用户点击"发帖" → 唤起登录。
  - 上传文件超限 → 明确提示，不静默失败。
  - 帖子已删除 → 详情页 410。
- **验收**：
  - 帖子附图必须真实上传到后端存储，刷新后仍可见。
  - 视频必须上传成功才允许发布，不留 blob: URL。
  - 热度排序需综合浏览/点赞/回复/时间，**禁止纯按 views 排序**。

### 4.4 模块 M-04：世界频道（WorldChannel）
- **目标**：面向所有用户的公开广场，匿名感、实时性高。
- **用户故事**：
  - 作为用户，我希望在首页看到全站最新/最热消息。
  - 作为用户，我希望发图文消息。
- **主流程**：
  1. `GET /api/world-messages?sort=latest|hot&page=&limit=`。
  2. 发送：`POST /api/world-messages`，携带 content + 上传后的图片 URLs。
  3. 客户端每 30s 轮询（或 WebSocket，v1 选轮询）拉取新消息。
  4. "X 人在线" 通过心跳接口 `POST /api/heartbeat`，统计 5 分钟内活跃用户数。
- **异常与边界**：
  - 消息长度上限 500 字、每条最多 9 张图。
  - 后端必须用全局递增 ID（UUID v7 或 Worker KV 自增），**禁止客户端 Date.now()**。
  - 头像/昵称必须取服务端权威数据，不接受客户端自填。
- **验收**：
  - 两个不同设备发同一条消息，刷新后均能互相看到。
  - "在线人数"必须 ≤ 全量注册用户数，且 5 分钟未活动用户被剔除。

### 4.5 模块 M-05：邮箱/私信（Mailbox）
- **目标**：用户间异步通信，区分"邮件模式（带主题、附件、Markdown）"与"对话模式（即时聊天）"。
- **用户故事**：
  - 作为用户，我希望按主题发邮件并附 Markdown。
  - 作为用户，我希望快速与某人持续聊天。
- **主流程**：
  - 邮件发送：`POST /api/mails { toUserId, subject, content, attachmentIds[] }`，附件先 `POST /api/uploads` 拿到 ID。
  - 收件箱：`GET /api/mails?folder=inbox|sent|starred`。
  - 星标：每封邮件有 `starred` 字段，starred 文件夹筛选 `starred === true`。
  - 对话：基于 toUserId 分组，列表显示对方头像、最后一条、累计未读。
  - 标记已读：`PUT /api/mails/:id/read`。
- **异常与边界**：
  - 不能给自己发邮件（前端禁用，后端 400）。
  - 星标文件夹必须正确过滤 `starred === true`，不能等同于"全部"。
  - 附件内容必须真实上传，不能只传 metadata。
  - 未登录不能进入。
- **验收**：
  - 发邮件附带 1 个文件 → 收件人能下载原文件。
  - 切换到"星标"文件夹显示 0 或 N 封已星标的邮件，与星标操作实时一致。
  - 跨设备登录，未读徽标同步。

### 4.6 模块 M-06：好友空间（FriendSpace）
- **目标**：用户发布仅好友可见或公开的动态，附带点赞/评论。
- **用户故事**：
  - 作为用户，我希望"好友可见"的动态只对互关用户展示。
  - 作为用户，我希望评论、点赞、查看访客数。
- **主流程**：
  1. 动态：`GET /api/space-posts?visibility=&userId=`（visibility = public 所有人；friends 仅当 currentUser 与作者互关时返回）。
  2. 发动态：`POST /api/space-posts { content, images, visibility }`。
  3. 点赞：`POST /api/space-posts/:id/like`，重复点切换。
  4. 评论：`POST /api/space-posts/:id/comments`。
  5. 分享：生成分享链接（带 shortUrl），不弹第三方面板。
- **异常与边界**：
  - 互关关系由后端 `GET /api/follows/:id` 返回的 `mutual` 字段决定。
  - 访客数：去重 userId，5 分钟内同一用户多次访问 +1。
  - 自己的动态可删除、不可编辑（简化 v1）。
- **验收**：
  - A 关注 B 但 B 未关注 A → A 看不到 B 的 friends-only 动态。
  - 点赞后立即显示心形填充，无需刷新页面。

### 4.7 模块 M-07：通知中心（Notifications）
- **目标**：聚合所有"对我"的互动（点赞、评论、关注、@、收藏、系统消息）。
- **用户故事**：
  - 作为用户，我希望进入通知页时仍保留未读状态。
  - 作为用户，我希望点"全部已读"清空所有未读。
- **主流程**：
  1. `GET /api/notifications?unread=true&page=` 拉取未读。
  2. **进入页面不自动 mark as read**；只有用户实际"点击"或"标记全部已读"才调接口。
  3. 单条已读：`PUT /api/notifications/:id/read`。
  4. 全部已读：`PUT /api/notifications/read-all`。
  5. 删除：`DELETE /api/notifications/:id`。
  6. 类型：like / comment / follow / mention / favorite / system。
- **异常与边界**：
  - 通知来源必须来自后端推送，**禁止本地生成**。
  - 未登录 → 0 条。
- **验收**：
  - 打开通知页不立即清零未读。
  - 未读徽标与接口数据严格一致。

### 4.8 模块 M-08：Wiki / 排行榜（Wiki）
- **目标**：基于 Bangumi 数据的条目搜索、排行榜、随机推荐。
- **用户故事**：
  - 作为用户，我希望按类型筛选（动画/小说/游戏/音乐/人物）。
  - 作为用户，我希望排行榜按评分/热度/日期排序。
  - 作为用户，我希望"再来一条"刷新随机条目。
- **主流程**：
  1. 搜索：`GET https://api.bgm.tv/v0/subjects?keyword=&type=&limit=&offset=`，前端 300ms 防抖。
  2. 排行榜：客户端分 3 类（动画/小说/游戏）拉前 50 条，缓存 1h（IndexedDB），排序在前端。
  3. 随机推荐：`GET /api/wiki/random?type=` 由后端从预热池中抽签。
  4. 资讯："业界动态 / 新作发售"用 `getPopular` 还是 `getNews` 由后端决定，前端只展示。
- **异常与边界**：
  - 排行榜缓存键必须带 sort key 或每次排序重新拉取（v1 选前端排序）。
  - 人物类型走独立 `/persons` 接口，错误处理与 subjects 统一封装。
  - 缓存被驱逐（LRU 200 条）时静默重拉。
- **验收**：
  - 切换"评分/热度/日期"时排行榜内容确实重排。
  - 随机推荐有"换一条"按钮。

### 4.9 模块 M-09：视频聚合（VideoZone）
- **目标**：跨第三方视频源聚合搜索，伪装成一个播放器入口。
- **用户故事**：
  - 作为用户，我希望输入关键词在多个源同时搜索。
  - 作为用户，我希望添加/启用/禁用自定义源。
- **主流程**：
  1. `POST /api/video-search { keyword, sources[] }`，后端并发请求每个源。
  2. 自定义源：`GET/POST/PUT/DELETE /api/video-sources`（当前仅本地存储，v2 走后端）。
  3. 详情页：`GET /api/video-detail?source=&id=` 拿播放链接。
  4. 失败源：在结果页明确标注，不让用户以为是搜索问题。
- **异常与边界**：
  - 自定义源添加时校验 URL 协议 + 域名，避免注入。
  - 提供"测试连接"按钮，预览该源返回的字段。
- **验收**：
  - 1 个源失败，其他源结果仍展示，并显示"X 源失败"。
  - 源地址必须 `https://` 开头。

### 4.10 模块 M-10：音乐（MusicPlayer）
- **目标**：聚合 QQ / 网易云音乐搜索 + 导入歌单 + 本地历史。
- **用户故事**：
  - 作为用户，我希望搜索歌曲直接播放。
  - 作为用户，我希望导入网易云 / QQ 歌单到本平台。
  - 作为用户，我希望音量、播放进度在我下次打开时恢复。
- **主流程**：
  1. 搜索：`GET /api/music/search?q=&server=qq|netease`，后端代理防 CORS。
  2. 导入歌单：`POST /api/music/import { server, id }`，存为本地"我的歌单"。
  3. 播放：`GET /api/music/url?id=&server=` 拿到真实 URL → 客户端 `<audio>` 播放。
  4. 持久化：音量 / 上次播放位置 / 歌单全部 `localStorage`，并可同步到云端（v2）。
- **异常与边界**：
  - 导入歌单不覆盖当前播放队列，给"新建/替换"二选一。
  - 跨域：URL 走代理，且代理端隐藏源站 referer。
  - 版权：仅在中国大陆服务器可用，国际化地区显式提示。
- **验收**：
  - 刷新页面后音量条保持在关闭前的值。
  - 导入歌单后原播放列表不丢失。

### 4.11 模块 M-11：资讯区（NewsZone）
- **目标**：展示业界动态、新番导视、新作发售等新闻。
- **用户故事**：
  - 作为用户，我希望按动画/小说/游戏分类浏览。
  - 作为用户，我希望申请投稿资讯或原创文章。
- **主流程**：
  1. 列表：`GET /api/news?type=&page=`，合并 MOCK（v1 临时） + 用户投稿。
  2. 投稿：`POST /api/news { type, title, source, link?, content?, images? }`。
  3. 详情：link 类跳外链；article 类走 `/news/:id`。
- **异常与边界**：
  - 提交时未登录 → 唤起登录。
  - 提交失败 → 错误提示，表单不丢失。
  - 投稿需审核（v1 可不做，但留接口）。
- **验收**：
  - 投稿成功后列表立即出现该条。
  - 文章模式支持 Markdown 与图片。

### 4.12 模块 M-12：TouchGal 嵌入式浏览器
- **目标**：在站内嵌入 touchgal.top 浏览 Galgame 资料。
- **用户故事**：
  - 作为用户，我希望能不离开 ANISpace 浏览 Galgame。
  - 作为用户，我希望把常用网址加入书签。
- **主流程**：
  1. 打开 TouchGalApp（窗口或路由）。
  2. iframe 加载 `https://www.touchgal.top`，sandbox 限制同源 / 脚本 / 表单 / 下载。
  3. 书签：增删改查走 `localStorage`（v1）/ 云端（v2）。
  4. 主页默认 `https://www.touchgal.top`；允许输入任意 URL。
- **异常与边界**：
  - iframe 加载失败 → "重试 / 外部打开"两选项。
  - URL 校验：必须 http(s):// 开头，禁止 javascript: / data:。
- **验收**：
  - 加载失败时不卡在白屏。
  - 书签切换正确加载对应 URL。

### 4.13 模块 M-13：社团（Club）
- **目标**：基于共同兴趣的群组空间（创建、加入、退出、聊天、权限分级）。
- **用户故事**：
  - 作为用户，我希望创建社团并邀请好友。
  - 作为社长，我希望管理成员、委派管理员、转让社长。
- **主流程**：
  1. 列表：`GET /api/clubs?type=&search=`。
  2. 创建：`POST /api/clubs`，creator 自动成为 president。
  3. 加入/退出：`POST /api/clubs/:id/join`、`POST /api/clubs/:id/leave`。
  4. 聊天：`GET/POST /api/clubs/:id/messages`，分页加载。
  5. 管理：社长可任命/撤销 admin；admin 可踢人；不能踢 admin 同级。
  6. 转让：`POST /api/clubs/:id/transfer`，原社长降为 admin。
- **异常与边界**：
  - 满员（maxMembers）禁止加入。
  - 社长退出会自动转让给最早加入的 admin，否则社团解散。
  - 解散后历史内容**保留只读** 30 天。
- **验收**：
  - 社长离场自动转让/解散。
  - admin 不能任命自己。

### 4.14 模块 M-14：留言板（Guestbook）
- **目标**：面向所有访客（含未登录）的社区留言墙。
- **用户故事**：
  - 作为访客，我希望不登录也能留言（昵称自填）。
  - 作为已登录用户，我希望留言带我的头像。
  - 作为用户，我希望支持回复、表情、点赞。
- **主流程**：
  1. 列表：`GET /api/guestbook?page=`。
  2. 发送：`POST /api/guestbook { content, replyToId?, nickname? }`。
  3. 点赞：`POST /api/guestbook/:id/like`，登录用户绑定 userId；游客绑定 visitorToken（cookie 存）。
  4. 同步到 afterrain：v1 走真实 `POST afterrain.atabook.org/...` API（带 referer 校验）；失败重试 3 次。
- **异常与边界**：
  - 留言长度 1–500 字。
  - 游客身份通过 `crypto.randomUUID()` + cookie 持久化，禁用户清可重新生成。
  - 删除仅自己留言，admin 可删任何。
- **验收**：
  - 留言真实提交到后端，刷新后仍可见。
  - 同步 afterrain 状态准确（成功/失败/同步中），失败可重试。

### 4.15 模块 M-15：Amadeus AI 助手
- **目标**：在站内提供命运石之门风格的 AI 角色对话。
- **用户故事**：
  - 作为用户，我希望与 AI 闲聊、问番剧推荐、聊命运石之门话题。
  - 作为开发者，我希望配置 OpenAI 兼容 API 切换云端模式。
- **主流程**：
  1. 三种模式：local（内置规则）/ openai / custom。
  2. local：基于关键词分类，命中预置回复池。
  3. openai/custom：调 `POST {baseUrl}/v1/chat/completions`，系统 prompt 固定为"Amadeus 牧瀬紅莉栖"人设。
  4. 失败：云端失败时降级 local，UI 明确提示"已切换本地模式"。
  5. API Key 存 sessionStorage（关闭即清空）。
  6. 语音输入：浏览器 Web Speech API；语音播报：speechSynthesis。
- **异常与边界**：
  - custom 模式未填 baseUrl → 立刻报错并禁用保存。
  - localStorage 容量监控：聊天历史 >4MB 弹窗提示清理。
  - 历史不跨设备同步（v1），但需有"清空记录"按钮在主面板。
- **验收**：
  - 切到云端模式且 Key 错误时，UI 显示"已切换本地模式"提示。
  - 聊天记录可一键清空。

### 4.16 模块 M-16：追番 / 收藏 / 评分（Collection / Favorite / Rating）
- **目标**：管理用户对条目的五态标记、收藏、评分。
- **用户故事**：
  - 作为用户，我希望"想看/在看/看过/搁置/抛弃"切换。
  - 作为用户，我希望给条目 1–10 分评分，并写短评。
  - 作为用户，我希望收藏条目到自定义收藏夹。
- **主流程**：
  1. 五态：`PUT /api/collections { subjectId, status }`。
  2. 评分：`PUT /api/ratings { subjectId, score, comment? }`。
  3. 收藏夹：`POST /api/favorites { subjectId, folderId }`。
  4. 个人页聚合展示。
- **异常与边界**：
  - 评分范围 1–10，0 表示删除评分。
  - 评分与五态可独立。
- **验收**：
  - 个人页统计图与后端数据一致。

---

## 5. 跨模块公共规则

### 5.1 上传协议
- 所有文件走 `POST /api/uploads`，返回 `{ id, url, mime, size }`。
- 客户端再把 `id`/`url` 嵌入业务请求。
- 服务端做 MIME、白名单、大小、病毒扫描（如有）。

### 5.2 分页协议
- 所有列表接口统一：`?page=1&limit=20`，返回 `{ list, total, hasMore }`。

### 5.3 错误协议
- 业务错误：`{ error: { code, message, field? } }` + HTTP 4xx。
- 服务端错误：`{ error: { code: 'SERVER_ERROR' } }` + HTTP 5xx。
- 客户端必须把 code 映射成中文提示。

### 5.4 实时性
- v1：所有列表走 HTTP 轮询（10s / 30s）。
- v2：世界频道、私聊、通知升级为 SSE / WebSocket。

### 5.5 离线 / 降级
- localStorage 缓存只用于"显示骨架"，**不能成为真理源**。
- API 失败时显示"重试"按钮，禁用写入操作。

### 5.6 表单
- 提交前：客户端校验 + 失败提示。
- 提交中：禁用按钮 + loading。
- 失败：错误回填表单，不静默关闭。
- 成功：toast + 关闭表单 + 列表主动失效。

---

## 6. 数据模型概览

> 不写 SQL 字段（详见 schema.sql），仅列实体关系。

```
User ─< Follow >─ User    （关系 A→B）
User ─< Post    ─< Reply  （帖子/回复）
User ─< Like    >─ Post/Reply/Comment
User ─< Comment >─ SpacePost
User ─< CollectionMark >─ Subject
User ─< Rating      >─ Subject
User ─< Favorite    >─ Subject
User ─< Mail        >─ User
User ─< Notification
User ─< ClubMember  >─ Club
User ─< ClubMessage >─ Club
User ─< WorldMessage
User ─< GuestbookMessage
User ─< SpacePost
Subject ─< Character / Person / Episode
Subject ─< Topic / Blog / Related
```

---

## 7. 验收策略

### 7.1 单元 / 集成
- 每个模块核心数据流必须有 1 个 happy path 测试。
- 关键边界（无网络 / 超长输入 / 跨账号）有 1 个 e2e。

### 7.2 可观测性
- 错误统一上报到 `/api/logs`，含 userId、route、stack、env。
- 关键交互（发帖 / 评分 / 私信）上报业务事件。

### 7.3 性能基线
- 首屏可交互 < 2s（已登录态）。
- 列表首屏渲染 < 1s。
- 任何 API 95p < 800ms。

---

## 8. 后续与版本

| 版本 | 范围 |
| --- | --- |
| v1.0 | 16 个模块全部按本 PRD 实现，后端走 Cloudflare D1 + R2 |
| v1.1 | SSE 通知 / 私信实时化 |
| v1.2 | PWA 离线缓存 |
| v2.0 | 移动端 / Push 通知 / 端到端加密 IM |

---

## 附录 A：术语对照

| 本文术语 | 代码现状 | 备注 |
| --- | --- | --- |
| 空间动态 | acg_friend_space | 应改为 space_posts 后端表 |
| 世界频道 | acg_world_messages | 应改为 world_messages 后端表 |
| 留言板 | acg_guestbook | 应改为 guestbook_messages 后端表 |
| 社团 | acg_clubs | 应改为 clubs 后端表 |

## 附录 B：与现有代码的偏差（高层汇总）

> 详细的 50 条问题见 [AUDIT_REPORT_LOGIC.md](./AUDIT_REPORT_LOGIC.md)。
> 本附录是"业务定义层"的偏差，便于对照 PRD。

| 模块 | 偏差类型 |
| --- | --- |
| M-01 认证 | 多标签 state 串台；JWT 过期无静默刷新（**已约定补 5 分钟静默刷新**） |
| M-02 资料 | 上传/保存无错误反馈；**追番/收藏默认 public 应改为默认 friends** |
| M-03 论坛 | 图片/视频未真正上传；热度算法简单 |
| M-04 世界频道 | 纯本地；在现数假；ID 冲突（**已约定：心跳接口 + 30s 轮询**） |
| M-05 邮箱 | 星标文件夹坏；附件 metadata 假上传（**已约定：禁止给自己发**） |
| M-06 好友空间 | 隐私字段形同虚设；分享死按钮（**已约定：v1 不可编辑**） |
| M-07 通知 | 进入即清零未读 |
| M-08 Wiki | 排序缓存粒度粗；随机无"换一条" |
| M-09 视频 | 源 URL 无校验 |
| M-10 音乐 | 导入覆盖播放队列；无位置记忆 |
| M-11 资讯 | 标签误导（条目当新闻） |
| M-12 TouchGal | URL 校验弱 |
| M-13 社团 | 纯本地；社长离场无自动处理（**已约定：转让/降级/通知流程**） |
| M-14 留言板 | 同步 afterrain 是假的（**已约定：UUID+cookie 游客身份**） |
| M-15 Amadeus | 失败降级无提示；清空记录藏得深（**已约定：v1 跨设备同步**） |
| M-16 追番 | 评分范围未做前端限制 |

---
