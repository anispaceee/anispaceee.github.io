# ANISpace 好友系统设计文档

## 概述

为 ANISpace 添加完整的好友系统，支持双向好友关系（需确认）和单向关注关系。分三个阶段实现。

## 第一阶段：好友关系核心

### 数据模型

#### 新增表：`friend_requests`

```sql
CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / accepted / rejected
  message TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(from_user_id, to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_fr_from ON friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_fr_to ON friend_requests(to_user_id, status);
```

#### 复用现有表

- `follows` — 单向关注关系（已存在）
- `notifications` — 好友申请通知（已存在，type='friend_request'）

### API 端点（Cloudflare Worker）

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/users/search?q=keyword&limit=10` | 搜索用户（按用户名/昵称模糊匹配） | 可选 |
| GET | `/api/users/:id` | 获取用户公开信息 | 可选 |
| POST | `/api/friends/request` | 发送好友申请 `{to_user_id, message}` | 必须 |
| GET | `/api/friends/requests` | 获取收到的待处理申请 | 必须 |
| GET | `/api/friends/requests/sent` | 获取已发送的申请 | 必须 |
| PUT | `/api/friends/request/:id` | 处理申请 `{status: 'accepted'/'rejected'}` | 必须 |
| DELETE | `/api/friends/:userId` | 删除好友 | 必须 |
| GET | `/api/friends` | 获取好友列表（支持分页） | 必须 |
| POST | `/api/follows/:userId` | 关注用户 | 必须 |
| DELETE | `/api/follows/:userId` | 取消关注 | 必须 |
| GET | `/api/follows/following` | 获取关注列表 | 必须 |
| GET | `/api/follows/followers` | 获取粉丝列表 | 必须 |

### 前端改动

1. **用户搜索**：在全局搜索中增加"用户"分类，或在好友空间页面添加搜索框
2. **用户主页**：点击用户头像/名称跳转到 `/profile/:userId`，显示公开信息+好友状态按钮
3. **好友申请按钮**：在用户主页显示"添加好友"/"已申请"/"互为好友"/"关注"等状态
4. **通知中心**：好友申请通知，支持一键接受/拒绝
5. **好友列表页**：在个人主页添加"好友"标签页，显示好友列表
6. **好友空间**：动态权限控制（第二阶段）

### 好友状态机

```
陌生人 → [发送申请] → 待确认(pending)
待确认 → [对方接受] → 好友(accepted)
待确认 → [对方拒绝] → 陌生人(rejected，可重新申请)
好友   → [删除好友] → 陌生人
```

### 关注状态（独立于好友）

```
未关注 → [关注] → 已关注
已关注 → [取消关注] → 未关注
```

好友自动互相关注，删除好友不自动取消关注。

## 第二阶段：动态权限 + 私信

### 动态权限

- 好友空间动态增加 `visibility` 字段：`public`/`friends`/`private`
- `friends` 可见性：仅双向好友可见
- `public` 可见性：所有人可见
- 动态数据从 localStorage 迁移到 D1 数据库

### 私信系统

- 复用 `private_messages` 表
- 新增 API：`GET /api/messages/:userId`（获取与某人的对话）、`POST /api/messages`（发送私信）
- 前端：在好友列表中点击"发私信"进入对话界面

## 第三阶段：好友主页互访

- 好友可查看对方的在看/想看/看过列表（受 `allow_profile_view` 控制）
- 好友可查看对方的评分和评论
- 好友可查看对方的活跃度热力图

## 约束

- 好友申请只能发给已注册用户
- 不能向自己发送好友申请
- 同一申请不能重复发送（UNIQUE约束）
- 好友申请通知通过 `notifications` 表实现
- 所有好友相关 API 需要登录认证
