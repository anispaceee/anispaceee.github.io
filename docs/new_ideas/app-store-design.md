# ANISpace App Store 设计文档

| 字段 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 编写日期 | 2026-06-13 |
| 状态 | 待确认 |
| 关联 PRD | docs/PRD.md |

---

## 1. 概述

### 1.1 目标

为 ANISpace 添加开放 APP 平台能力，允许用户上传自开发的 APP 安装到 Dock 栏，并提供类似 App Store 的浏览/安装/管理界面。

### 1.2 核心决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| APP 运行形态 | iframe 沙箱隔离 | 浏览器原生隔离，安全性最高，无需审核即可上架 |
| 审核模式 | 无需审核 | 开放生态，降低运营成本 |
| 通信机制 | postMessage Bridge | 受控 API 暴露，主站可鉴权限流 |
| 存储方案 | D1 (元数据) + R2 (APP 包) | 与现有架构一致 |

### 1.3 架构图

```
┌─────────────────────────────────────────────────┐
│                   ANISpace 主站                    │
│                                                   │
│  ┌─────────┐   ┌──────────┐   ┌───────────────┐ │
│  │ AppStore │   │ AppRegistry│  │ AppBridge     │ │
│  │  页面    │   │  (D1 数据) │  │ (postMessage) │ │
│  └────┬────┘   └─────┬────┘   └───────┬───────┘ │
│       │              │                 │          │
│  ┌────▼──────────────▼─────────────────▼───────┐ │
│  │              WindowManager                   │ │
│  │  ┌─────────────────────────────────────────┐│ │
│  │  │  AppWindow (iframe sandbox)              ││ │
│  │  │  ┌─────────────────────────────────────┐││ │
│  │  │  │  第三方 APP (HTML/CSS/JS)            │││ │
│  │  │  │  ←→ postMessage ←→ AppBridge        │││ │
│  │  │  └─────────────────────────────────────┘││ │
│  │  └─────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  DockBar (动态渲染已安装 APP 图标)            │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 2. APP 规范

### 2.1 APP 包结构

每个 APP 是一个 **ZIP 包**，包含：

```
my-app/
├── manifest.json    # 必需，APP 元数据
├── index.html       # 必需，入口页面
├── icon.png         # 必需，APP 图标 (≤100KB, 建议 128x128)
├── styles.css       # 可选
├── app.js           # 可选
└── assets/          # 可选，静态资源
```

也支持**单文件模式**：仅上传一个自包含 HTML 文件（内联 CSS/JS），系统自动生成 manifest。

### 2.2 manifest.json 规范

```json
{
  "id": "com.example.my-app",
  "name": "我的APP",
  "version": "1.0.0",
  "description": "一个示例APP的简短描述",
  "icon": "icon.png",
  "author": "用户名",
  "permissions": [
    "user:identity",
    "bangumi:search",
    "bangumi:subject",
    "collection:read",
    "notification:badge"
  ],
  "window": {
    "width": 800,
    "height": 600,
    "minWidth": 400,
    "minHeight": 300
  }
}
```

**字段说明**：

| 字段 | 必需 | 类型 | 说明 |
|------|------|------|------|
| id | 是 | string | 反向域名格式，全局唯一 |
| name | 是 | string | APP 显示名称，≤30 字符 |
| version | 是 | string | 语义化版本号 (semver) |
| description | 是 | string | APP 描述，≤200 字符 |
| icon | 是 | string | 图标文件名（包内相对路径） |
| author | 否 | string | 作者名（默认取登录用户名） |
| permissions | 否 | string[] | 需要的权限列表 |
| window | 否 | object | 窗口默认尺寸 |

### 2.3 权限模型

| 权限 | 说明 | 授权方式 |
|------|------|----------|
| `user:identity` | 读取用户 ID/昵称/头像 | 安装时弹窗授权 |
| `bangumi:search` | 搜索 Bangumi 条目 | 自动授予 |
| `bangumi:subject` | 获取条目详情 | 自动授予 |
| `collection:read` | 读取用户追番/收藏 | 安装时弹窗授权 |
| `collection:write` | 修改用户追番/收藏 | 安装时弹窗授权 |
| `notification:badge` | 设置 Dock 徽标数 | 自动授予 |
| `notification:push` | 推送站内通知 | 安装时弹窗授权 |

**授权流程**：
- 自动授予的权限：安装时无需确认
- 需授权的权限：安装时弹出权限确认弹窗，用户可逐项勾选
- 用户拒绝某项权限 → APP 仍可安装，但调用该权限 API 时返回 `permission_denied`

### 2.4 提交校验规则

| 校验项 | 规则 |
|--------|------|
| manifest.json | 必须存在且 JSON 格式正确 |
| id | 反向域名格式 `^[a-z0-9]+(\.[a-z0-9]+)+$`，全局唯一 |
| name | 非空，≤30 字符 |
| version | 语义化版本号 |
| icon | 文件存在，≤100KB，格式 PNG/JPG/SVG |
| index.html | 必须存在 |
| ZIP 大小 | ≤2MB |
| 外部脚本 | `<script src>` 仅允许 `https://` 协议，禁止 `http://` |
| 外部样式 | `<link href>` 仅允许 `https://` 协议 |

---

## 3. AppBridge 通信协议

### 3.1 通信格式

**请求（APP → 主站）**：
```json
{
  "type": "anispace:request",
  "id": "uuid-123",
  "method": "bangumi.search",
  "params": { "keyword": "莉可丽丝" }
}
```

**响应（主站 → APP）**：
```json
{
  "type": "anispace:response",
  "id": "uuid-123",
  "result": { "data": [...] },
  "error": null
}
```

**错误响应**：
```json
{
  "type": "anispace:response",
  "id": "uuid-123",
  "result": null,
  "error": {
    "code": "permission_denied",
    "message": "APP 未获得 collection:read 权限"
  }
}
```

**事件推送（主站 → APP）**：
```json
{
  "type": "anispace:event",
  "event": "theme.changed",
  "data": { "theme": "dark" }
}
```

### 3.2 API 方法列表

| 方法 | 所需权限 | 说明 | 参数 |
|------|----------|------|------|
| `app.ready` | - | 通知主站 APP 加载完成 | - |
| `app.resize` | - | 请求调整窗口大小 | `{width, height}` |
| `user.getIdentity` | `user:identity` | 获取用户信息 | - |
| `bangumi.search` | `bangumi:search` | 搜索条目 | `{keyword, type?, limit?}` |
| `bangumi.getSubject` | `bangumi:subject` | 获取条目详情 | `{subjectId}` |
| `collection.list` | `collection:read` | 读取用户收藏 | `{status?, limit?}` |
| `collection.update` | `collection:write` | 修改收藏状态 | `{subjectId, status}` |
| `notification.setBadge` | `notification:badge` | 设置 Dock 徽标 | `{count}` |
| `notification.push` | `notification:push` | 推送站内通知 | `{title, body}` |

### 3.3 事件列表

| 事件 | 说明 | 数据 |
|------|------|------|
| `theme.changed` | 主题切换 | `{theme: 'dark' \| ''}` |
| `window.focus` | 窗口获得焦点 | - |
| `window.blur` | 窗口失去焦点 | - |

---

## 4. APP SDK

### 4.1 引入方式

```html
<script src="https://anispace.app/sdk/v1.js"></script>
```

### 4.2 SDK API

```javascript
// 初始化（自动与主站建立 postMessage 连接）
const app = ANISpace.init();

// 生命周期
app.onReady(() => { /* APP 加载完成 */ });
app.onThemeChange((theme) => { /* 主题切换 */ });

// 用户
const user = await app.user.getIdentity();
// → { id: '123', name: '用户名', avatar: 'https://...' }

// Bangumi
const results = await app.bangumi.search({ keyword: '莉可丽丝' });
const subject = await app.bangumi.getSubject({ subjectId: 12345 });

// 收藏
const collections = await app.collection.list({ status: 'watching' });
await app.collection.update({ subjectId: 12345, status: 'watched' });

// 通知
app.notification.setBadge(3);
await app.notification.push({ title: '更新提醒', body: '新番已更新' });

// 窗口
app.resize({ width: 1000, height: 700 });
```

---

## 5. 安全机制

### 5.1 iframe sandbox

```html
<iframe
  sandbox="allow-scripts allow-forms"
  src="https://apps-cdn.anispace.app/{appId}/index.html"
/>
```

- `allow-scripts`：允许 JS 执行
- `allow-forms`：允许表单提交
- **不设** `allow-top-navigation`：禁止跳转主站
- **不设** `allow-popups`：禁止弹窗
- **不设** `allow-same-origin`：阻止 APP 访问主站 Cookie/Storage

### 5.2 origin 校验

主站 AppBridge 只接受来自 `apps-cdn.anispace.app` 域名的 postMessage：

```javascript
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://apps-cdn.anispace.app') return;
  // 处理消息...
});
```

### 5.3 权限校验

每次 API 调用前，AppBridge 检查：
1. 该 APP 是否已安装
2. 用户是否授予了对应权限
3. 未授权 → 返回 `permission_denied` 错误

### 5.4 速率限制

- 每个 APP 每分钟最多 60 次 API 调用
- 超限返回 `rate_limit_exceeded` 错误
- 基于 D1 `app_api_logs` 表统计（每分钟清理过期记录）

### 5.5 CSP 头

APP 的 HTML 响应附带 Content-Security-Policy：

```
Content-Security-Policy:
  default-src 'self' https://anispace.app;
  script-src 'self' https://anispace.app;
  style-src 'self' 'unsafe-inline' https://anispace.app;
  img-src * data:;
  connect-src https://anispace.app https://api.bgm.tv;
```

---

## 6. 数据模型

### 6.1 D1 表结构

```sql
-- APP 元数据表
CREATE TABLE apps (
  id TEXT PRIMARY KEY,              -- com.example.my-app
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT NOT NULL,           -- R2 URL
  author_id TEXT NOT NULL,          -- 发布者 user_id
  author_name TEXT,
  version TEXT NOT NULL,
  permissions TEXT,                 -- JSON array
  window_config TEXT,               -- JSON: {width, height, minWidth, minHeight}
  package_url TEXT NOT NULL,        -- R2 URL to ZIP
  install_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',     -- active | removed
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 用户安装记录
CREATE TABLE user_apps (
  user_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  granted_permissions TEXT,         -- JSON array
  installed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, app_id)
);

-- API 调用日志（速率限制用）
CREATE TABLE app_api_logs (
  app_id TEXT NOT NULL,
  user_id TEXT,
  method TEXT NOT NULL,
  called_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX idx_apps_status ON apps(status);
CREATE INDEX idx_apps_author ON apps(author_id);
CREATE INDEX idx_user_apps_user ON user_apps(user_id);
CREATE INDEX idx_api_logs_app_time ON app_api_logs(app_id, called_at);
```

### 6.2 R2 存储

- Bucket: `anispace-apps`
- APP 包: `{app_id}/{version}/package.zip`
- APP 图标: `{app_id}/icon.png`
- SDK: `sdk/v1.js`

---

## 7. Worker API

### 7.1 APP 管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/apps` | 公开 | 列出 APP（?search=&sort=popular\|newest&page=&limit=） |
| GET | `/api/apps/:id` | 公开 | APP 详情 |
| POST | `/api/apps` | 登录 | 发布 APP（multipart/form-data: manifest + zip） |
| PUT | `/api/apps/:id` | 作者 | 更新 APP |
| DELETE | `/api/apps/:id` | 作者 | 删除 APP（软删，status→removed） |

### 7.2 安装管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/apps/:id/install` | 登录 | 安装 APP（body: {granted_permissions}） |
| DELETE | `/api/apps/:id/install` | 登录 | 卸载 APP |
| GET | `/api/apps/installed` | 登录 | 获取已安装 APP 列表 |

### 7.3 Bridge 代理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/apps/:id/bridge` | APP Bridge API 代理入口 |

---

## 8. 前端改造

### 8.1 WindowManager 改造

**现状**：`DEFAULT_WINDOW_CONFIG` 硬编码 7 个内置 APP。

**改造**：
- 新增 `AppRegistry` 模块，统一管理内置 APP 和第三方 APP
- `registerApp(config)` / `unregisterApp(appId)` 方法
- `WindowLayer` 支持 iframe 类型窗口

```javascript
// AppRegistry 数据结构
const appRegistry = new Map();

// 内置 APP 注册
registerApp({
  id: 'music',
  type: 'builtin',        // 内置 APP
  component: MusicPlayer,  // React 组件
  title: '音乐',
  icon: '🎵',
  window: { width: 740, height: 700, minWidth: 440, minHeight: 500 }
});

// 第三方 APP 注册（用户安装后）
registerApp({
  id: 'com.example.my-app',
  type: 'external',       // 第三方 APP
  url: 'https://apps-cdn.anispace.app/com.example.my-app/index.html',
  title: '我的APP',
  icon: 'https://apps-cdn.anispace.app/com.example.my-app/icon.png',
  permissions: ['user:identity', 'bangumi:search'],
  window: { width: 800, height: 600, minWidth: 400, minHeight: 300 }
});
```

### 8.2 WindowLayer 改造

```jsx
function WindowLayer() {
  const { windows } = useWindowManager();
  return (
    <>
      {Object.values(windows).map(win => {
        if (!win.open) return null;
        const app = appRegistry.get(win.id);
        if (!app) return null;

        if (app.type === 'builtin') {
          return (
            <AppWindow key={win.id} id={win.id}>
              {React.createElement(app.component)}
            </AppWindow>
          );
        }

        if (app.type === 'external') {
          return (
            <AppWindow key={win.id} id={win.id}>
              <AppBridge appId={win.id} url={app.url} permissions={app.permissions}>
                <iframe
                  sandbox="allow-scripts allow-forms"
                  src={app.url}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </AppBridge>
            </AppWindow>
          );
        }
        return null;
      })}
    </>
  );
}
```

### 8.3 DockBar 改造

- 内置项（launcher/settings）保持硬编码
- 已安装 APP 从 `GET /api/apps/installed` 获取，localStorage 缓存
- 新增 App Store 入口图标

### 8.4 AppStore 页面

- 路由：`/appstore`
- 布局：顶部搜索栏 + 分类标签 + APP 卡片网格
- APP 卡片：图标 + 名称 + 作者 + 安装数 + 安装/打开按钮
- 发布页：表单 + ZIP 上传 + manifest 预览

---

## 9. 实施路线

### 阶段 1：基础设施

- [ ] D1 建表 (apps, user_apps, app_api_logs)
- [ ] R2 bucket 创建 (anispace-apps)
- [ ] Worker API 实现 (CRUD + 安装/卸载)
- [ ] WindowManager 重构为动态注册表
- [ ] DockBar 动态 APP 图标支持

### 阶段 2：AppBridge + AppStore

- [ ] AppBridge postMessage 通信层
- [ ] APP SDK (v1.js) 开发
- [ ] AppStore 页面 UI
- [ ] APP 提交/发布流程
- [ ] 权限授权弹窗

### 阶段 3：生态完善

- [ ] APP 评分/评论系统
- [ ] 开发者文档
- [ ] 示例 APP (Hello World + Bangumi 搜索器)
- [ ] 主题 CSS 变量注入（渐进增强）
- [ ] APP 更新通知机制

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 恶意 APP 窃取数据 | 高 | iframe sandbox 隔离 + origin 校验 + 权限控制 |
| 恶意 APP 消耗资源 | 中 | 速率限制 + CSP 限制外部连接 |
| APP 质量参差不齐 | 低 | 评分系统 + 举报机制（后续） |
| R2 存储成本 | 低 | ZIP 限制 2MB，定期清理 removed APP |
| SDK 版本兼容 | 中 | SDK URL 含版本号，旧版本长期可用 |
