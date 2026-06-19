# ANISpace 超展开功能 PRD

## 一、功能概述

### 1.1 背景
当前 ANISpace 已有「放课后」作为邀请制内部论坛，用户希望新增「超展开」板块，用于浏览和参与 Bangumi 小组讨论，实现 Bangumi 账号绑定后的完整小组功能。

### 1.2 目标
- 在站内实现 Bangumi 小组（超展开）的完整功能
- 与现有「放课后」内部论坛完全独立，作为两个并列板块
- 用户绑定 Bangumi 账号后可直接在站内操作小组内容

### 1.3 功能定位
| 板块 | 定位 | 数据来源 | 权限控制 |
|------|------|----------|----------|
| 放课后 | 邀请制内部论坛 | 本站 D1 数据库 | 需邀请码解锁 |
| 超展开 | Bangumi 小组超展开 | Bangumi API（代理） | 需绑定 Bangumi 账号 |

---

## 二、功能需求

### 2.1 用户功能清单

#### 2.1.1 浏览功能
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 小组列表 | 查看所有 Bangumi 小组，支持按分类/成员数/帖子数排序 | P0 |
| 小组详情 | 查看小组信息（名称、简介、成员数、图标） | P0 |
| 话题列表 | 查看小组内的话题列表，支持分页 | P0 |
| 话题详情 | 查看话题内容及所有回复 | P0 |
| 搜索小组 | 搜索小组名称 | P1 |
| 搜索话题 | 全站话题搜索 | P1 |

#### 2.1.2 发帖/回复功能
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 发表话题 | 在小组内创建新话题 | P0 |
| 回复话题 | 对话题发表回复 | P0 |
| 编辑帖子 | 编辑自己发表的帖子 | P1 |
| 删除帖子 | 删除自己发表的帖子（需小组权限） | P1 |

#### 2.1.3 成员管理功能
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 加入小组 | 申请加入小组 | P0 |
| 退出小组 | 退出已加入的小组 | P0 |
| 查看成员 | 查看小组成员列表 | P1 |
| 成员权限 | 管理员设置成员权限（需小组管理员权限） | P2 |

#### 2.1.4 创建小组功能
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 创建小组 | 创建新的 Bangumi 小组 | P1 |
| 编辑小组 | 编辑小组信息（需创建者权限） | P1 |
| 小组设置 | 设置小组可见性、NSFW 标记等 | P2 |

### 2.2 权限控制

#### 2.2.1 Bangumi 账号绑定
- 用户需先绑定 Bangumi 账号才能使用超展开功能
- 绑定流程：点击绑定 → Bangumi OAuth 授权 → 获取 access token → 存储到用户表
- 已有 Bangumi OAuth 登录的用户自动获得绑定状态

#### 2.2.2 小组权限映射
| Bangumi 权限 | 站内权限 | 说明 |
|---------------|----------|------|
| Visitor (-2) | 游客 | 未加入小组，仅可浏览公开内容 |
| Guest (-1) | 访客 | 特殊权限状态 |
| Member (0) | 成员 | 可发帖、回复 |
| Creator (1) | 创建者 | 可管理小组、设置权限 |
| Moderator (2) | 管理员 | 可管理话题、帖子 |
| Blocked (3) | 被屏蔽 | 无法操作 |

---

## 三、技术方案

### 3.1 数据获取方式

#### 3.1.1 API 代理架构
```
前端 ANISpace → Cloudflare Worker → Bangumi Private API (api.bgm.tv)
```

**代理层职责：**
- 解决 CORS 问题
- 存储用户 Bangumi access token
- 转发请求并添加认证头
- 缓存小组列表等公共数据

#### 3.1.2 Bangumi API 端点（推测）
基于 server-private 项目分析，预计的 API 端点：

| 功能 | 端点 | 方法 |
|------|------|------|
| 获取小组列表 | `/p/groups` | GET |
| 获取小组详情 | `/p/groups/:id` | GET |
| 获取小组话题 | `/p/groups/:id/topics` | GET |
| 获取话题详情 | `/p/topics/:id` | GET |
| 获取话题回复 | `/p/topics/:id/posts` | GET |
| 发表话题 | `/p/groups/:id/topics` | POST |
| 发表回复 | `/p/topics/:id/posts` | POST |
| 加入小组 | `/p/groups/:id/join` | POST |
| 退出小组 | `/p/groups/:id/leave` | DELETE |
| 创建小组 | `/p/groups` | POST |

**注意：** 实际端点需进一步探索 server-private 的 `routes/private/routes` 目录确认。

### 3.2 数据库设计

#### 3.2.1 用户表扩展
在现有 `users` 表添加字段：

```sql
ALTER TABLE users ADD COLUMN bangumi_access_token TEXT;
ALTER TABLE users ADD COLUMN bangumi_refresh_token TEXT;
ALTER TABLE users ADD COLUMN bangumi_token_expires_at INTEGER;
ALTER TABLE users ADD COLUMN bangumi_user_id INTEGER;
ALTER TABLE users ADD COLUMN bangumi_username TEXT;
```

#### 3.2.2 本地缓存表（可选）
为提升性能，可缓存小组数据：

```sql
CREATE TABLE bangumi_groups_cache (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  icon TEXT,
  desc TEXT,
  members INTEGER,
  topics INTEGER,
  posts INTEGER,
  nsfw INTEGER DEFAULT 0,
  accessible INTEGER DEFAULT 1,
  cached_at INTEGER,
  expires_at INTEGER
);

CREATE TABLE bangumi_topics_cache (
  id INTEGER PRIMARY KEY,
  gid INTEGER NOT NULL,
  title TEXT NOT NULL,
  uid INTEGER NOT NULL,
  replies INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  cached_at INTEGER,
  expires_at INTEGER
);
```

### 3.3 前端组件设计

#### 3.3.1 路由结构
```
/super                    → 超展开首页（小组列表）
/super/group/:id          → 小组详情（话题列表）
/super/topic/:id          → 话题详情（帖子列表）
/super/create             → 创建小组
/super/settings           → 超展开设置（绑定账号）
```

#### 3.3.2 组件清单
| 组件 | 路径 | 功能 |
|------|------|------|
| SuperHome | `src/components/Super/SuperHome.jsx` | 小组列表首页 |
| GroupDetail | `src/components/Super/GroupDetail.jsx` | 小组详情页 |
| TopicDetail | `src/components/Super/TopicDetail.jsx` | 话题详情页 |
| GroupCard | `src/components/Super/GroupCard.jsx` | 小组卡片组件 |
| TopicCard | `src/components/Super/TopicCard.jsx` | 话题卡片组件 |
| PostItem | `src/components/Super/PostItem.jsx` | 帖子/回复项 |
| CreateTopicModal | `src/components/Super/CreateTopicModal.jsx` | 发帖弹窗 |
| ReplyInput | `src/components/Super/ReplyInput.jsx` | 回复输入框 |
| GroupCreateForm | `src/components/Super/GroupCreateForm.jsx` | 创建小组表单 |
| BangumiBindPrompt | `src/components/Super/BangumiBindPrompt.jsx` | Bangumi 账号绑定提示 |

#### 3.3.3 服务层
| 服务 | 路径 | 功能 |
|------|------|------|
| SuperService | `src/services/SuperService.js` | 超展开 API 封装 |

### 3.4 后端 Worker 扩展

#### 3.4.1 新增路由
在 `oauth-proxy.js` 添加：

```javascript
// Bangumi 小组代理
GET  /api/super/groups              → 代理 Bangumi 小组列表
GET  /api/super/groups/:id          → 代理小组详情
GET  /api/super/groups/:id/topics   → 代理话题列表
GET  /api/super/topics/:id          → 代理话题详情
GET  /api/super/topics/:id/posts    → 代理回复列表
POST /api/super/groups/:id/topics   → 发表话题
POST /api/super/topics/:id/posts    → 发表回复
POST /api/super/groups/:id/join     → 加入小组
DELETE /api/super/groups/:id/leave  → 退出小组
POST /api/super/groups              → 创建小组

// Bangumi 账号绑定
POST /api/auth/bind-bangumi         → 绑定 Bangumi 账号
GET  /api/auth/bangumi-status       → 查询绑定状态
```

#### 3.4.2 认证流程
1. 前端请求 `/api/super/*` 端点
2. Worker 从 JWT 获取用户 ID
3. 查询 `users` 表获取用户的 `bangumi_access_token`
4. 请求 Bangumi API 时携带 `Authorization: Bearer {access_token}`
5. 若 token 过期，使用 refresh_token 刷新

---

## 四、UI/UX 设计

### 4.1 导航结构
在 Header 导航栏新增「超展开」入口，位于「放课后」之后：

```
首页 | 放课后 | 超展开 | 毒电波！！ | 禁書目錄 | 武藏也
```

### 4.2 页面布局

#### 4.2.1 超展开首页（小组列表）
- 顶部：搜索框 + 分类筛选
- 左侧：热门小组推荐（卡片网格）
- 右侧：最新话题列表
- 底部：分页导航

#### 4.2.2 小组详情页
- 顶部：小组信息卡片（图标、名称、简介、成员数、操作按钮）
- 中部：话题列表（标题、作者、回复数、最后更新）
- 底部：发帖按钮 + 分页

#### 4.2.3 话题详情页
- 顶部：话题标题 + 作者信息
- 主体：帖子列表（楼层数、作者、内容、时间）
- 底部：回复输入框

### 4.3 组件样式
遵循现有萌系配色方案：
- 主色调：粉色系
- 卡片样式：圆角、阴影、hover 效果
- 按钮样式：与现有放课后一致

---

## 五、实现计划

### 5.1 Phase 1：基础架构（预计 2-3 天）
1. 用户表扩展（Bangumi token 存储）
2. Worker 新增代理路由框架
3. 前端路由和基础组件结构

### 5.2 Phase 2：浏览功能（预计 3-4 天）
1. 小组列表页面
2. 小组详情页面
3. 话题详情页面
4. API 代理实现

### 5.3 Phase 3：发帖/回复功能（预计 2-3 天）
1. 发表话题功能
2. 回复话题功能
3. 编辑/删除功能

### 5.4 Phase 4：成员管理功能（预计 1-2 天）
1. 加入/退出小组
2. 成员列表展示

### 5.5 Phase 5：创建小组功能（预计 1-2 天）
1. 创建小组表单
2. 小组管理功能

---

## 六、风险与限制

### 6.1 技术风险
| 风险 | 影响 | 解决方案 |
|------|------|----------|
| Bangumi 私有 API 未公开 | 无法获取完整端点 | 进一步探索 server-private 或联系 Bangumi 开发者 |
| Token 过期处理 | 用户需重新绑定 | 实现 refresh_token 自动刷新 |
| API 限流 | 请求可能被拒绝 | 实现请求队列和缓存 |

### 6.2 使用限制
- 需遵守 Bangumi API 使用条款
- 发帖频率可能受 Bangumi 限制（半小时 3 条）
- NSFW 内容需特殊处理

---

## 七、附录

### 7.1 Bangumi 小组数据库表结构（来自 server-private）

```typescript
// chii_groups - 小组表
{
  id: smallint,           // 小组 ID
  cat: smallint,          // 分类
  name: char(50),         // 小组名称（英文）
  title: varchar(50),     // 小组标题（显示名）
  icon: varchar(255),     // 小组图标
  creator: mediumint,     // 创建者 ID
  topics: mediumint,      // 话题数
  posts: mediumint,       // 帖子数
  members: mediumint,     // 成员数
  desc: text,             // 小组简介
  updatedAt: int,         // 最后更新时间
  createdAt: int,         // 创建时间
  accessible: boolean,    // 是否公开
  nsfw: boolean           // 是否 NSFW
}

// chii_group_members - 成员表
{
  uid: mediumint,         // 用户 ID
  gid: smallint,          // 小组 ID
  role: tinyint,          // 角色（-2=游客, 0=成员, 1=创建者, 2=管理员, 3=屏蔽）
  createdAt: int          // 加入时间
}

// chii_group_topics - 话题表
{
  id: mediumint,          // 话题 ID
  gid: mediumint,         // 小组 ID
  uid: mediumint,         // 作者 ID
  title: varchar(80),     // 话题标题
  createdAt: int,         // 创建时间
  updatedAt: int,         // 最后更新时间
  replies: mediumint,     // 回复数
  state: tinyint,         // 状态
  display: tinyint        // 显示状态
}

// chii_group_posts - 帖子表
{
  id: mediumint,          // 帖子 ID
  mid: mediumint,         // 话题 ID
  uid: mediumint,         // 作者 ID
  related: mediumint,     // 关联帖子 ID（回复）
  content: mediumtext,    // 内容
  state: tinyint,         // 状态
  createdAt: int          // 创建时间
}
```

### 7.2 参考资料
- Bangumi server-private 项目：https://github.com/bangumi/server-private
- Bangumi 公开 API 文档：https://bangumi.github.io/api/
- ANISpace AGENTS.md：项目构建指南