# 全局限制级内容过滤开关 - 设计文档

## 概述

在设置页面新增一个全局的"屏蔽限制级内容"开关，默认开启。当开关开启时，搜索结果、首页推荐、Hikarinagi 内容中将过滤掉限制级（NSFW/R18）条目。

## 需求背景

- 当前 Wiki.jsx 有独立的本地 NSFW 过滤按钮，但作用范围仅限于 Wiki 搜索页
- 首页推荐模块（横滑推荐、每日放送、随心斩）和 Hikarinagi 内容没有任何 NSFW 过滤
- 用户需要一个全局设置来控制所有模块的限制级内容显示

## 作用范围

| 模块 | 过滤方式 | 说明 |
|------|----------|------|
| Wiki 搜索结果 | `checkAccessibility` | 通过 Bangumi API `/v0/subjects/{id}` 检查可访问性，404 = NSFW |
| 首页横滑推荐 | `checkAccessibility` | 同上，批量检查 |
| 首页每日放送 | `checkAccessibility` | 同上，批量检查 |
| 首页随心斩 | `checkAccessibility` | 单条检查 |
| Hikarinagi Galgame/LN | 标签关键词过滤 | 检查 tags 数组是否包含 `R18`/`成人向`/`18禁`/`nsfw` 等关键词 |

### 不受影响的模块

- **详情页 NSFW 提示**：API 返回 404 时显示限制级提示，不受开关影响（无论开关状态，只要 API 返回 404 就显示提示）
- **放课后热议 / 世界线 / 毒电波**：社交/资讯内容，不涉及条目级限制级过滤

## 数据存储

### 前端
- localStorage key: `anispace_filter_nsfw`
- 默认值: `true`（屏蔽限制级）
- 不登录也可用

### 后端
- API: `PUT /api/users/:id/settings` 新增字段 `filter_nsfw: 1 | 0`
- API: `GET /api/users/:id/profile` 返回 `filter_nsfw` 字段
- 数据库: `users` 表新增 `filter_nsfw INTEGER DEFAULT 1`
- 登录后，优先使用后端值；未登录时使用 localStorage 值

### 同步策略
- 与现有 `dataSettings`（auto_enrich / local_backup）模式一致
- localStorage 为主，后端同步为辅
- 登录后从后端拉取值覆盖 localStorage

## 架构改动

### 1. AppContext (`src/context/AppContext.jsx`)

新增状态和方法：

```js
const [filterNsfw, setFilterNsfw] = useState(() => {
  const saved = StorageService.get('anispace_filter_nsfw');
  return saved !== null ? saved : true; // 默认开启
});

const toggleFilterNsfw = useCallback((val) => {
  const newVal = val !== undefined ? val : !filterNsfw;
  setFilterNsfw(newVal);
  StorageService.set('anispace_filter_nsfw', newVal);
  // 已登录时同步到后端
  if (currentUser?.id) {
    UserService.updateSettings(currentUser.id, { filter_nsfw: newVal ? 1 : 0 }).catch(() => {});
  }
}, [filterNsfw, currentUser?.id]);
```

Provider value 新增: `filterNsfw`, `toggleFilterNsfw`

### 2. 设置页 (`src/components/Profile/UserProfilePage.jsx`)

- 设置侧边栏新增 "内容过滤" 标签页
- 使用 `ShieldOff` 图标
- 内容：Toggle 开关 + 说明文字

### 3. Wiki.jsx (`src/components/Wiki/Wiki.jsx`)

- 删除本地 `NSFW_FILTER_KEY` 和 `filterNsfw` state
- 改用 `useApp().filterNsfw` 和 `useApp().toggleFilterNsfw`
- 保留独立按钮，行为不变

### 4. HomePage.jsx (`src/pages/HomePage.jsx`)

- 横滑推荐（carouselItems）：加载后过滤
- 每日放送（calendarItems）：加载后过滤
- 随心斩（randomSubject）：加载后检查单条
- 推荐 Galgame：标签过滤（如 Hikarinagi 数据有 tags 字段）

### 5. Hikarinagi 过滤工具函数

新增工具函数 `filterNsfwHikarinagi(items)`:
- 检查每个 item 的 `tags` 数组
- 关键词列表: `['R18', 'r18', '成人向', '18禁', '18+', 'NSFW', 'nsfw', '成人', '成年向']`
- 返回过滤后的数组

### 6. Worker 后端

#### D1 Migration (v015)

```sql
ALTER TABLE users ADD COLUMN filter_nsfw INTEGER DEFAULT 1;
```

#### `oauth-proxy.js` 改动

- `GET /api/users/:id/profile`: 返回 `filter_nsfw` 字段
- `PUT /api/users/:id/settings`: 支持更新 `filter_nsfw`，含 try-catch 向后兼容

## 实现顺序

1. Worker 后端：D1 migration + API 改动
2. AppContext：新增 filterNsfw 状态
3. 设置页：新增 "内容过滤" 标签页
4. Wiki.jsx：改为使用全局状态
5. HomePage.jsx：各模块过滤逻辑
6. Hikarinagi 过滤工具函数
7. 构建验证