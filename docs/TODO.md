# ANISpace 未完成需求整合 TODO

> 更新日期: 2026-06-13
> 来源: docs/ 目录下所有设计文档、PRD、修复方案

---

## P0 — 关键修复与安全

### 安全审计 (来源: AUDIT_REPORT.md)
- [ ] verifyJWT 死循环修复
- [ ] MarkdownEditor 持久化 XSS 修复
- [ ] Worker SSRF 防护
- [ ] OAuth state 参数校验
- [ ] CORS 白名单收紧
- [ ] OAuth redirect_uri 严格匹配
- [ ] JWT 迁移到 httpOnly cookie
- [ ] CI 注入 secret 安全加固
- [ ] CSP 头配置
- [ ] dangerouslySetInnerHTML 安全处理

### 核心修复 (来源: REPAIR_PLAN.md)
- [ ] 引入 apiClient 与统一错误协议
- [ ] 后端契约上传协议
- [ ] 数据迁移脚本
- [ ] 多标签 login state 串台修复
- [ ] 静默 token 刷新
- [ ] 资料页/追番隐私默认值修复
- [ ] 论坛图片视频上传修复
- [ ] 世界频道纯 localStorage + id 冲突修复
- [ ] 邮箱/私信星标文件夹修复
- [ ] 通知中心进入页面即 mark all read 修复
- [ ] Wiki/排行榜搜索结果不全修复
- [ ] 视频聚合自定义源 URL 校验
- [ ] 追番/收藏/评分数据一致性修复

---

## P1 — 已确认设计，待实施

### 游客功能开放 (来源: guest-access-design.md)
- [ ] P0: 放課後/Tea Time!/LeMU/世界线只读浏览开放
- [ ] P1: GuestStorageService — 游客本地存储（进度/收藏/点赞/评分）
- [ ] P2: 登录合并弹窗 — 手动确认合并本地数据到账号
- [ ] P3: 个人主页游客状态提示条

### App Store 开放平台 (来源: app-store-design.md)
- [ ] iframe 沙箱隔离 + postMessage Bridge
- [ ] AppBridge 通信协议实现
- [ ] APP SDK 开发
- [ ] Worker API: 上传/安装/卸载/列表
- [ ] 前端 AppRegistry 动态注册
- [ ] D1 + R2 存储后端

### 放課後社区 V2 (来源: forum-community-v2-design.md)
- [ ] P1: 楼中楼回复、回复点赞、回复排序
- [ ] P1: 回复 Markdown 工具栏
- [ ] P2: 收藏帖子、关注用户、@提及
- [ ] P2: 自定义表情包
- [ ] P3: 举报系统、通知系统

### Navi AI 人格化助手 (来源: navi-ai-persona-assistant-design.md)
- [ ] 人格数据模型（persona config）
- [ ] 指令协议（/persona、/mode 等）
- [ ] 流式输出优化
- [ ] 多人格切换 UI

### Live2D + Navi 集成 (来源: live2d-navi-integration-design.md)
- [ ] Live2D 看板娘旁边聊天入口
- [ ] 消息气泡显示
- [ ] 点击聚焦交互

### 视频区核心层改造 (来源: media-core-redesign.md + PRD-Video-V2.md)
- [ ] 类型系统设计（MediaSource, MatchResult 等）
- [ ] MatchEngine 匹配引擎
- [ ] MediaSelector 选择器
- [ ] MediaFetcher 获取器
- [ ] Animeko 风格资源搜索系统 (animeko-source-system-design.md)
- [ ] 弹幕系统

### 武藏也创作者平台 (来源: PRD-Musashi.md)
- [ ] 内容类型支持（小说/图文/连载）
- [ ] 创作者角色与权限
- [ ] 编辑器与发布流程
- [ ] 图片存储（R2）
- [ ] 内容审核策略
- [ ] 阅读器（NovelReader 已有基础）
- [ ] 付费能力预留

---

## P2 — 设计已确认，优先级较低

### ANISpace Terminal 增强 (来源: anispace-terminal-design.md)
- [ ] 命令历史导航（上下键）
- [ ] 自动滚动到底部
- [ ] 点击聚焦
- [ ] 异步命令占位
- [ ] 命令上下文支持
- [ ] 命令集 v1（goto, search, me, say 等）

### 好友系统 (来源: friend-system-design.md)
- [ ] 第一阶段: 双向好友关系核心（申请/接受/拒绝/删除）
- [ ] 第二阶段: 动态权限 + 私信
- [ ] 第三阶段: 好友主页互访

### 装饰功能增强 (来源: decorative-features-design.md)
- [x] 鼠标点击烟花效果（已完成，含设置开关）
- [x] 音乐窗口最小化迷你播放条（已完成，扩展为通用 MinimizedBar）
- [ ] Live2D 看板娘换用 weblive2d

### UX 优化 (来源: anispace-ux-overhaul-design.md)
- [x] 首页布局重构（已完成萌系风格）
- [ ] 用户头像点击 + 个人主页重构
- [ ] 世界频道重构 + 搜索优化 + 百科精简

---

## P3 — 仅有概念/调研，需进一步设计

### 首页萌系改版 (来源: homepage-moe-design.md)
- [x] 大封面图片驱动布局（已完成）
- [x] 轮播图 + 每日放送（已完成）
- [ ] 响应式适配优化

### 竞品分析后续 (来源: competitor-analysis.md)
- [ ] 参考同萌(ai2.moe)的论坛互动机制
- [ ] 参考紫缘社(galzy.moe)的标签检索系统
- [ ] 参考 ACGDB 的 OpenList 资源目录

### AniBT 集成后续 (来源: anibt-integration.md)
- [x] 番剧时间线（已完成）
- [x] 字幕组资源 Tab（已完成）
- [x] 首页每日放送数据源切换（已完成）
- [ ] 视频聚合增强（与视频区改造合并）

---

## 已完成

- [x] 鼠标点击烟花效果 + 设置开关
- [x] 音乐窗口最小化迷你播放条 → 通用 MinimizedBar
- [x] 所有 APP 最小化横条（Tea Time!/Navi/世界线/LeMU/友情链接）
- [x] 5s 无操作自动隐去动画
- [x] 登录通知横条（右上角）
- [x] 友情链接改为 APP 窗口模式
- [x] AniBT 番剧时间线集成
- [x] AniBT 字幕组资源 Tab
- [x] 首页每日放送 AniBT 数据源
- [x] Dock macOS 风格 + 侧边放大效果
- [x] Dock 自动隐藏 + 设置开关
- [x] 首页萌系风格改版
- [x] 条目详情页背景模糊效果
- [x] 评论瀑布流圆角卡片
