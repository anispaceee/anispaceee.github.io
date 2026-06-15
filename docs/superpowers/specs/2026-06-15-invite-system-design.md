# 邀请制社交功能解决方案

## 一、需求分析

| 需求维度 | 具体要求 | 说明 |
|---------|---------|------|
| **社交模式默认关闭** | 默认禁用社交功能 | 用户注册后社交功能默认关闭，只有使用邀请码解锁后才能开启 |
| **邀请范围** | 社交功能邀请制 | 用户可自由注册，但发帖、评论等社交行为需要被邀请才能解锁 |
| **邀请码生成** | 管理员专属 | 只有管理员可以生成和发放邀请码 |
| **邀请链追踪** | 需要 | 记录邀请关系链，支持奖励机制 |

## 二、系统架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端层 (Frontend)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │ 用户注册页  │  │ 社交功能页  │  │ 邀请管理后台        │    │
│  │ (无邀请限制)│  │ (需邀请权限)│  │ (管理员专属)        │    │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘    │
└─────────┼────────────────┼─────────────────────┼───────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker (Backend)                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Auth Service    │  Invite Service    │  Permission Service││
│  │  ────────────────│  ────────────────  │  ──────────────── ││
│  │  • 登录/登出     │  • 生成邀请码      │  • 权限校验        ││
│  │  • 用户管理      │  • 验证邀请码      │  • 角色管理        ││
│  └─────────────────│  • 邀请记录        │  • 权限配置        ││
│                    └────────────────────┴──────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        D1 Database                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │    users     │ │   invites    │ │ permissions  │           │
│  │ (用户表)     │ │ (邀请码表)   │ │ (权限表)     │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心数据模型

**表 1: invites（邀请码表）**

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 主键 |
| code | TEXT | UNIQUE NOT NULL | 邀请码（8位字母数字组合） |
| creator_id | INTEGER | NOT NULL REFERENCES users(id) | 创建者（管理员）ID |
| max_uses | INTEGER | DEFAULT 1 | 最大使用次数 |
| used_count | INTEGER | DEFAULT 0 | 已使用次数 |
| type | TEXT | DEFAULT 'social' | 邀请类型（social/post/comment等） |
| status | TEXT | DEFAULT 'active' | 状态（active/used/expired/revoked） |
| expires_at | TEXT | | 过期时间 |
| permissions | TEXT | DEFAULT '[]' | 预置权限列表（JSON） |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |
| updated_at | TEXT | DEFAULT (datetime('now')) | 更新时间 |

**表 2: invite_relations（邀请关系表）**

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 主键 |
| invite_id | INTEGER | NOT NULL REFERENCES invites(id) | 邀请码ID |
| inviter_id | INTEGER | NOT NULL REFERENCES users(id) | 邀请者ID |
| invitee_id | INTEGER | NOT NULL REFERENCES users(id) | 被邀请者ID |
| granted_permissions | TEXT | DEFAULT '[]' | 授予的权限（JSON数组） |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |

**表 3: user_permissions（用户权限表）**

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 主键 |
| user_id | INTEGER | NOT NULL REFERENCES users(id) | 用户ID |
| permission | TEXT | NOT NULL | 权限标识 |
| granted_by | INTEGER | REFERENCES users(id) | 授权者ID |
| expires_at | TEXT | | 过期时间 |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |
| UNIQUE(user_id, permission) | | | 复合唯一索引 |

**表 4: invite_rewards（邀请奖励表）**

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 主键 |
| invite_relation_id | INTEGER | NOT NULL REFERENCES invite_relations(id) | 邀请关系ID |
| reward_type | TEXT | NOT NULL | 奖励类型（points/permission/invite_quota） |
| reward_value | TEXT | NOT NULL | 奖励值 |
| status | TEXT | DEFAULT 'pending' | 状态（pending/claimed/expired） |
| claimed_at | TEXT | | 领取时间 |
| created_at | TEXT | DEFAULT (datetime('now')) | 创建时间 |

### 2.3 权限系统设计

**权限列表**

| 权限标识 | 权限名称 | 说明 |
|---------|---------|------|
| social.post | 发帖权限 | 允许在讨论区发帖 |
| social.comment | 评论权限 | 允许在帖子、条目下评论 |
| social.follow | 关注权限 | 允许关注其他用户 |
| social.message | 私信权限 | 允许发送私信 |
| social.world | 世界频道权限 | 允许在世界频道发言 |
| invite.generate | 生成邀请码 | 允许生成邀请码（管理员权限） |

## 三、核心流程设计

### 3.1 管理员生成邀请码流程

```
管理员 → 调用 POST /api/invites → 生成邀请码 → 保存到 invites 表 → 返回邀请码信息
```

**API 接口:** `POST /api/invites`

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| type | string | 是 | 邀请类型（social/post/comment等） |
| max_uses | integer | 否 | 最大使用次数，默认1 |
| expires_at | string | 否 | 过期时间（ISO格式） |
| permissions | array | 否 | 授予的权限列表 |

**响应示例:**
```json
{
  "id": 1,
  "code": "AB3XK9YZ",
  "type": "social",
  "max_uses": 1,
  "used_count": 0,
  "status": "active",
  "expires_at": "2026-12-31T23:59:59Z",
  "created_at": "2026-06-15T10:00:00Z"
}
```

### 3.2 用户使用邀请码流程

```
用户 → 输入邀请码 → 调用 POST /api/invites/claim → 验证邀请码有效性 → 
创建邀请关系 → 授予权限 → 记录奖励 → 返回成功信息
```

**API 接口:** `POST /api/invites/claim`

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| code | string | 是 | 邀请码 |

**响应示例:**
```json
{
  "success": true,
  "message": "邀请码验证成功，已解锁社交功能",
  "granted_permissions": ["social.post", "social.comment", "social.follow"],
  "invite_code": "AB3XK9YZ",
  "inviter_id": 123,
  "expires_at": "2026-12-31T23:59:59Z"
}
```

### 3.3 社交功能权限校验流程

```
用户执行社交操作 → 前端检查权限 → 调用权限校验API → 
验证通过 → 执行操作 → 返回结果
```

**API 接口:** `GET /api/permissions/check`

| 参数名 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| permission | string | 是 | 要检查的权限标识 |

**响应示例:**
```json
{
  "has_permission": true,
  "permission": "social.post",
  "expires_at": "2026-12-31T23:59:59Z",
  "granted_by": 123
}
```

### 3.4 邀请奖励发放流程

```
用户使用邀请码 → 创建邀请关系 → 检查奖励规则 → 
创建奖励记录 → 发放奖励（积分/权限/邀请配额）
```

**奖励规则示例:**
| 奖励触发条件 | 奖励类型 | 奖励值 |
|------------|---------|--------|
| 成功邀请1人 | points | +100积分 |
| 成功邀请5人 | permission | invite.generate（生成邀请码权限） |
| 成功邀请10人 | invite_quota | +5邀请配额 |

## 四、邀请码生成算法

### 4.1 邀请码结构

```
格式: 8位字母数字组合（大写）
字符集: ABCDEFGHJKLMNPQRSTUVWXYZ23456789（去除容易混淆的I/O/0/1）
```

### 4.2 生成算法

```javascript
function generateInviteCode(length = 8) {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    code += charset[array[i] % charset.length];
  }
  return code;
}
```

### 4.3 唯一性保证

```
1. 使用 crypto.getRandomValues 生成安全随机数
2. 生成后检查数据库是否已存在
3. 若存在则重新生成（最多重试10次）
```

## 五、安全性设计

### 5.1 邀请码安全

| 安全措施 | 说明 |
|---------|------|
| **防暴力破解** | 邀请码长度8位，字符集32个，组合数约10^12，足够安全 |
| **过期时间** | 邀请码可设置过期时间，过期后自动失效 |
| **使用次数限制** | 可设置最大使用次数，防止滥用 |
| **状态管理** | 支持主动撤销邀请码 |

### 5.2 权限安全

| 安全措施 | 说明 |
|---------|------|
| **最小权限原则** | 只授予必要的权限 |
| **权限过期** | 权限可设置过期时间 |
| **审计日志** | 记录所有权限变更操作 |
| **管理员权限隔离** | 生成邀请码权限仅管理员拥有 |

### 5.3 数据安全

| 安全措施 | 说明 |
|---------|------|
| **JWT 认证** | 所有 API 请求需要 JWT 认证 |
| **CORS 限制** | 仅允许白名单域名访问 |
| **输入验证** | 对所有输入进行严格验证 |
| **SQL 注入防护** | 使用参数化查询 |

## 六、API 接口清单

### 6.1 邀请码管理（管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/invites | 生成邀请码 |
| GET | /api/invites | 获取邀请码列表 |
| GET | /api/invites/:id | 获取邀请码详情 |
| PUT | /api/invites/:id | 更新邀请码状态 |
| DELETE | /api/invites/:id | 删除邀请码 |

### 6.2 邀请码使用（用户）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/invites/claim | 使用邀请码 |
| GET | /api/invites/validate | 验证邀请码是否有效（不消耗） |

### 6.3 权限管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/permissions | 获取当前用户权限列表 |
| GET | /api/permissions/check | 检查特定权限 |
| POST | /api/permissions/grant | 授予权限（管理员） |
| DELETE | /api/permissions/revoke | 撤销权限（管理员） |

### 6.4 邀请关系

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/invite-relations | 获取邀请关系列表（管理员） |
| GET | /api/users/:id/invites | 获取用户邀请记录 |

### 6.5 奖励管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/rewards | 获取奖励列表 |
| POST | /api/rewards/claim | 领取奖励 |

## 七、数据库变更

### 7.1 新增表 SQL

```sql
-- 邀请码表
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  type TEXT DEFAULT 'social',
  status TEXT DEFAULT 'active',
  expires_at TEXT,
  permissions TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 邀请关系表
CREATE TABLE IF NOT EXISTS invite_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_id INTEGER NOT NULL REFERENCES invites(id),
  inviter_id INTEGER NOT NULL REFERENCES users(id),
  invitee_id INTEGER NOT NULL REFERENCES users(id),
  granted_permissions TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 用户权限表
CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  permission TEXT NOT NULL,
  granted_by INTEGER REFERENCES users(id),
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, permission)
);

-- 邀请奖励表
CREATE TABLE IF NOT EXISTS invite_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_relation_id INTEGER NOT NULL REFERENCES invite_relations(id),
  reward_type TEXT NOT NULL,
  reward_value TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  claimed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
CREATE INDEX IF NOT EXISTS idx_invite_relations_invitee ON invite_relations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_invite_rewards_relation ON invite_rewards(invite_relation_id);
```

### 7.2 用户表扩展

```sql
ALTER TABLE users ADD COLUMN invite_code TEXT;
ALTER TABLE users ADD COLUMN invite_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN invite_quota INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN total_points INTEGER DEFAULT 0;
```

## 八、前端集成方案

### 8.1 权限检查组件

```jsx
// PermissionGuard.jsx
export function PermissionGuard({ permission, children, fallback }) {
  const [hasPermission, setHasPermission] = useState(null);
  
  useEffect(() => {
    checkPermission(permission).then(setHasPermission);
  }, [permission]);
  
  if (hasPermission === null) return <Loading />;
  if (!hasPermission) return fallback || <AccessDenied />;
  return children;
}
```

### 8.2 邀请码输入组件

```jsx
// InviteCodeForm.jsx
export function InviteCodeForm({ onSuccess }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/api/invites/claim', { code });
      onSuccess(response.data);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="请输入邀请码"
        maxLength={8}
        disabled={loading}
      />
      <button type="submit" disabled={loading}>
        {loading ? '验证中...' : '验证邀请码'}
      </button>
    </form>
  );
}
```

### 8.3 权限状态管理

```javascript
// hooks/usePermissions.js
export function usePermissions() {
  const [permissions, setPermissions] = useState([]);
  
  useEffect(() => {
    fetchPermissions().then(setPermissions);
  }, []);
  
  const hasPermission = (permission) => {
    return permissions.some(p => p.permission === permission && 
      (!p.expires_at || new Date(p.expires_at) > new Date()));
  };
  
  return { permissions, hasPermission };
}
```

## 九、部署与迁移

### 9.1 数据库迁移

```bash
# 在 Cloudflare Dashboard 中执行 SQL
wrangler d1 execute ANISpace_DB --file ./migrations/v012_invite_system.sql
```

### 9.2 Worker 更新

```bash
wrangler deploy
```

### 9.3 环境变量配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| INVITE_CODE_LENGTH | 邀请码长度 | 8 |
| DEFAULT_INVITE_EXPIRE_DAYS | 默认邀请码过期天数 | 30 |
| DEFAULT_MAX_USES | 默认最大使用次数 | 1 |

## 十、监控与日志

### 10.1 关键指标

| 指标 | 说明 | 监控方式 |
|------|------|---------|
| 邀请码生成数 | 管理员生成的邀请码数量 | 计数器 |
| 邀请码使用数 | 成功使用的邀请码数量 | 计数器 |
| 邀请码转化率 | 使用数/生成数 | 比率 |
| 权限授予数 | 授予用户的权限数量 | 计数器 |
| 奖励发放数 | 发放的奖励数量 | 计数器 |

### 10.2 日志记录

| 日志类型 | 内容 | 级别 |
|---------|------|------|
| 邀请码生成 | 管理员、邀请码、类型、有效期 | INFO |
| 邀请码使用 | 用户ID、邀请码、结果 | INFO |
| 权限变更 | 用户ID、权限、操作类型 | INFO |
| 奖励发放 | 用户ID、奖励类型、奖励值 | INFO |
| 异常日志 | 错误信息、堆栈跟踪 | ERROR |

## 十一、扩展考虑

### 11.1 邀请配额系统（未来扩展）

当需要开放用户生成邀请码权限时，可启用配额系统：

```sql
-- 用户表已扩展 invite_quota 字段
-- 奖励规则可设置增加配额
```

### 11.2 邀请排行榜

```sql
CREATE TABLE IF NOT EXISTS invite_ranking (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  invite_count INTEGER DEFAULT 0,
  last_invite_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 11.3 邀请码批量生成

```javascript
// 批量生成接口
// POST /api/invites/batch
// { count: 10, type: 'social', max_uses: 1 }
```

## 十二、实现状态

### 12.1 已完成实现

| 模块 | 实现状态 | 说明 |
|------|---------|------|
| **前端社交模式默认关闭** | ✅ 已完成 | 修改 `AppContext.jsx`，社交模式默认值改为 `false` |
| **邀请码生成 API** | ✅ 已完成 | `POST /api/invites` - 管理员生成邀请码 |
| **邀请码验证 API** | ✅ 已完成 | `POST /api/invites/claim` - 用户使用邀请码 |
| **权限检查 API** | ✅ 已完成 | `GET /api/permissions/check` - 检查特定权限 |
| **权限列表 API** | ✅ 已完成 | `GET /api/permissions` - 获取当前用户权限列表 |
| **权限授予 API** | ✅ 已完成 | `POST /api/permissions/grant` - 管理员授予权限 |
| **权限撤销 API** | ✅ 已完成 | `DELETE /api/permissions/revoke` - 管理员撤销权限 |
| **API 路由注册** | ✅ 已完成 | `/api/invites` 和 `/api/permissions` 已注册到 Worker |
| **Rate Limiter** | ✅ 已完成 | 添加邀请码和权限相关 API 的限流配置 |

### 12.2 待实现

| 模块 | 说明 |
|------|------|
| **数据库表创建** | 需要在 D1 数据库中创建 `invites`、`invite_relations`、`user_permissions`、`invite_rewards` 表 |
| **用户表扩展** | 需要在 `users` 表中添加 `invite_code`、`invite_count`、`invite_quota`、`total_points` 字段 |
| **前端邀请码输入组件** | 用户输入邀请码的界面组件 |
| **权限守卫组件** | 保护需要权限的页面/功能 |
| **管理员后台** | 邀请码管理界面（生成、查看、撤销邀请码） |
| **邀请奖励系统** | 邀请他人获得奖励的功能 |

### 12.3 关键代码位置

| 文件 | 说明 |
|------|------|
| `worker/oauth-proxy.js` | 邀请制 API 后端实现（第 916-1124 行） |
| `src/context/AppContext.jsx` | 社交模式状态管理，默认关闭（第 12-15 行） |
| `src/services/api.js` | 前端 API 调用服务 |

---

**文档版本**: v1.0  
**创建日期**: 2026-06-15  
**适用项目**: ANISpace  

以上