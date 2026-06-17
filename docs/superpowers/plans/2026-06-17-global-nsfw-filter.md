# 全局限制级内容过滤开关 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现全局"屏蔽限制级内容"开关，默认开启，影响 Wiki 搜索、首页推荐、Hikarinagi 内容

**Architecture:** AppContext 管理全局状态（localStorage + 后端同步），各消费组件通过 useApp() 读取 filterNsfw 进行过滤。Worker 后端新增 filter_nsfw 字段到 users 表。

**Tech Stack:** React (AppContext), Cloudflare Worker (D1), JavaScript

---

### Task 1: Worker D1 Migration

**Files:**
- Create: `worker/migrations/v017_filter_nsfw.sql`

- [ ] **Step 1: 创建 migration 文件**

```sql
-- v017_filter_nsfw: 用户限制级内容过滤开关
ALTER TABLE users ADD COLUMN filter_nsfw INTEGER DEFAULT 1;
```

- [ ] **Step 2: 验证 migration 文件存在**

检查 `worker/migrations/v017_filter_nsfw.sql` 已创建。

---

### Task 2: Worker 后端 API 改动

**Files:**
- Modify: `worker/oauth-proxy.js`

- [ ] **Step 1: GET /api/users/:id/profile — 新增 filter_nsfw 返回**

在 `auto_enrich` 查询之后（约第 1443 行后），新增 `filter_nsfw` 的 try-catch 查询：

```js
// filter_nsfw 列可能尚未创建，单独查询以避免主查询失败
try {
  const nsfwRow = await env.DB.prepare('SELECT filter_nsfw FROM users WHERE id = ?').bind(userId).first();
  user.filter_nsfw = nsfwRow?.filter_nsfw ?? 1;
} catch {
  user.filter_nsfw = 1;
}
```

插入位置：在 `user.auto_enrich = 1;` 的 catch 块闭合大括号 `}` 之后（约第 1443 行），`// 动态计算好友数` 注释之前。

- [ ] **Step 2: PUT /api/users/:id/settings — 支持 filter_nsfw 更新**

修改第 1468 行的解构，新增 `filter_nsfw`：

```js
const { allow_profile_view, allow_comments_public, auto_enrich, filter_nsfw } = body;
```

修改第 1471-1472 行的 UPDATE 语句，新增 `filter_nsfw` 字段：

```js
await env.DB.prepare('UPDATE users SET allow_profile_view = ?, allow_comments_public = ?, auto_enrich = ?, filter_nsfw = ? WHERE id = ?')
  .bind(allow_profile_view ?? 1, allow_comments_public ?? 1, auto_enrich ?? 1, filter_nsfw ?? 1, userId).run();
```

修改第 1474 行的 fallback UPDATE（不含 auto_enrich 时），也新增不含 filter_nsfw 的 fallback：

```js
await env.DB.prepare('UPDATE users SET allow_profile_view = ?, allow_comments_public = ? WHERE id = ?')
  .bind(allow_profile_view ?? 1, allow_comments_public ?? 1, userId).run();
```

> 注意：fallback 路径不需要包含 filter_nsfw，因为如果连 auto_enrich 列都不存在，filter_nsfw 更不可能存在。fallback 只更新已有列。

---

### Task 3: AppContext 新增 filterNsfw 全局状态

**Files:**
- Modify: `src/context/AppContext.jsx`

- [ ] **Step 1: 导入 UserService**

在 AppContext.jsx 第 2 行的 import 中，`UserService` 已包含在 `{ AuthService, NotificationService, MailService, StorageService, apiRequest }` 中。需要确认 `UserService` 是否已导入。检查第 2 行：

当前：
```js
import { AuthService, NotificationService, MailService, StorageService, apiRequest } from '../services/api';
```

需要新增 `UserService`：
```js
import { AuthService, NotificationService, MailService, StorageService, UserService, apiRequest } from '../services/api';
```

- [ ] **Step 2: 新增 filterNsfw 状态**

在 `socialMode` 状态声明之后（约第 15 行后），新增：

```js
const [filterNsfw, setFilterNsfw] = useState(() => {
  const saved = StorageService.get('anispace_filter_nsfw');
  return saved !== null ? saved : true; // 默认开启屏蔽
});
```

- [ ] **Step 3: 登录后从后端同步 filter_nsfw**

在现有的 `useEffect`（第 18-32 行，处理 isAuthenticated 变化）中，新增 filter_nsfw 同步逻辑。在 `if (isAuthenticated)` 块内，添加：

```js
// 同步限制级过滤设置
apiRequest('/api/users/' + currentUser.id + '/profile')
  .then(profile => {
    if (typeof profile.filter_nsfw === 'number') {
      setFilterNsfw(profile.filter_nsfw !== 0);
      StorageService.set('anispace_filter_nsfw', profile.filter_nsfw !== 0);
    }
  })
  .catch(() => {});
```

- [ ] **Step 4: 新增 toggleFilterNsfw 方法**

在 `toggleSocialMode` 之后（约第 81 行后），新增：

```js
const toggleFilterNsfw = useCallback((val) => {
  const newVal = val !== undefined ? val : !filterNsfw;
  setFilterNsfw(newVal);
  StorageService.set('anispace_filter_nsfw', newVal);
  if (currentUser?.id) {
    UserService.updateSettings(currentUser.id, { filter_nsfw: newVal ? 1 : 0 }).catch(() => {});
  }
}, [filterNsfw, currentUser?.id]);
```

- [ ] **Step 5: Provider value 新增导出**

在 Provider value 对象中（约第 84-100 行），新增：

```js
filterNsfw,
toggleFilterNsfw,
```

---

### Task 4: 设置页新增 "内容过滤" 标签页

**Files:**
- Modify: `src/components/Profile/UserProfilePage.jsx`

- [ ] **Step 1: 导入 ShieldOff 图标**

在 lucide-react 导入（第 6 行）中，`Shield` 已存在。需要确认 `ShieldOff` 是否已导入。当前导入列表：
```js
import { Calendar, MapPin, Heart, LinkIcon, Shield, BookOpen, UserPlus, UserCheck, UserX, MessageCircle, MoreHorizontal, Star, Users, Activity, MessageSquare, Loader2, Edit3, Settings, Camera, Mail, Smile, Lock, Globe, Search, Newspaper, Send, Trash2, Database, HardDrive, Download } from 'lucide-react';
```

新增 `ShieldOff`：
```js
import { Calendar, MapPin, Heart, LinkIcon, Shield, ShieldOff, BookOpen, ... } from 'lucide-react';
```

- [ ] **Step 2: 从 AppContext 获取 filterNsfw**

在 useApp() 解构（第 30 行）中，新增 `filterNsfw, toggleFilterNsfw`：

```js
const { currentUser, isAuthenticated, openAuth, updateProfile, socialMode, filterNsfw, toggleFilterNsfw } = useApp();
```

- [ ] **Step 3: 删除本地 dataSettings 同步逻辑中对 filter_nsfw 的处理**

不需要额外处理，filter_nsfw 由 AppContext 统一管理。

- [ ] **Step 4: 新增 "内容过滤" 侧边栏导航按钮**

在设置侧边栏的 "数据" 按钮之后（约第 1352 行后），新增：

```jsx
<button className={`settings-nav ${settingsTab === 'content' ? 'active' : ''}`} onClick={() => setSettingsTab('content')}>
  <ShieldOff size={14} /> 内容过滤
</button>
```

- [ ] **Step 5: 新增 "内容过滤" 标签页内容**

在 `{settingsTab === 'data' && (` 块的闭合 `)}` 之后（约第 1506 行后），新增：

```jsx
{settingsTab === 'content' && (
  <div className="settings-section">
    <h3>内容过滤</h3>
    <div className="data-settings-list">
      <div className="data-settings-item">
        <div className="data-settings-info">
          <ShieldOff size={16} />
          <div>
            <div className="data-settings-label">屏蔽限制级内容</div>
            <div className="data-settings-desc">开启后，搜索结果、首页推荐中将不显示限制级（NSFW/R18）内容</div>
          </div>
        </div>
        <label className="profile-settings-toggle">
          <input type="checkbox" checked={filterNsfw} onChange={e => toggleFilterNsfw(e.target.checked)} />
          <span className="toggle-slider" />
        </label>
      </div>
    </div>
  </div>
)}
```

---

### Task 5: Wiki.jsx 改用全局 filterNsfw 状态

**Files:**
- Modify: `src/components/Wiki/Wiki.jsx`

- [ ] **Step 1: 删除本地 NSFW 状态**

删除第 22 行 `NSFW_FILTER_KEY` 常量定义：
```js
const NSFW_FILTER_KEY = 'anispace_filter_nsfw';  // 删除此行
```

删除第 53-54 行 `filterNsfw` 本地状态：
```js
const [filterNsfw, setFilterNsfw] = useState(() => {
  try { return JSON.parse(localStorage.getItem(NSFW_FILTER_KEY) || 'false'); } catch { return false; }
});  // 删除此块
```

- [ ] **Step 2: 从 AppContext 获取 filterNsfw**

在 Wiki 组件内，从 useApp() 获取：
```js
const { filterNsfw, toggleFilterNsfw } = useApp();
```

- [ ] **Step 3: 修改 toggleNsfwFilter 函数**

找到 `toggleNsfwFilter` 函数（约第 247 行），替换为：

```js
const toggleNsfwFilter = () => {
  toggleFilterNsfw();
};
```

- [ ] **Step 4: 移除 filterNsfw 依赖的 useEffect**

删除第 85-90 行的 useEffect（NSFW 过滤切换时自动重新搜索）不再需要，因为 filterNsfw 变化仍会触发搜索（filterNsfw 在搜索 useEffect 的依赖数组中）。

检查搜索 useEffect 的依赖数组（约第 231 行），确保 `filterNsfw` 仍在其依赖中。

- [ ] **Step 5: 更新按钮文字和 title**

在按钮渲染处（约第 381-385 行和 518-522 行），更新 title 属性使用 `filterNsfw`：

```jsx
title={filterNsfw ? '已开启：过滤限制级内容' : '已关闭：显示所有内容（含限制级）'}
```

按钮文字保持不变：`<ShieldOff size={12} /> 过滤限制级`

---

### Task 6: HomePage.jsx 首页推荐过滤

**Files:**
- Modify: `src/pages/HomePage.jsx`

- [ ] **Step 1: 从 AppContext 获取 filterNsfw**

在 useApp() 解构（第 158 行）中，新增 `filterNsfw`：

```js
const { currentUser, isAuthenticated, openAuth, socialMode, filterNsfw } = useApp();
```

- [ ] **Step 2: 横滑推荐（carouselItems）过滤**

在 `loadCarousel` useEffect 中，设置 carouselItems 之前（约第 271 行和 281 行），新增过滤逻辑。

在 `setCarouselItems(sorted)` 之前，添加：

```js
// 过滤限制级内容
if (filterNsfw && sorted.length > 0) {
  const inaccessibleIds = await BangumiService.checkAccessibility(sorted);
  if (inaccessibleIds.size > 0) {
    sorted = sorted.filter(item => !inaccessibleIds.has(item.id));
  }
}
```

注意：因为 `filterNsfw` 现在是依赖项，需要将其加入 useEffect 的依赖数组（第 301 行）：`}, [filterNsfw]);`

- [ ] **Step 3: 每日放送（calendarItems）过滤**

在 `fetchCalendar` 函数中，设置 calendarData 之前（约第 451 行和 461 行），新增过滤。

在 `setCalendarData(converted)` 和 `setCalendarData(data)` 之前，分别添加过滤。因为 calendarData 结构是 `[{ weekday, items: [...] }]`，需要过滤每个 dayGroup 的 items：

```js
// 过滤限制级内容
if (filterNsfw) {
  for (const dayGroup of converted) {
    if (dayGroup.items.length > 0) {
      const inaccessibleIds = await BangumiService.checkAccessibility(dayGroup.items);
      if (inaccessibleIds.size > 0) {
        dayGroup.items = dayGroup.items.filter(item => !inaccessibleIds.has(item.id));
      }
    }
  }
}
```

同样处理降级 Bangumi Calendar 路径的 `data`。

添加 `filterNsfw` 到 `fetchCalendar` 的依赖数组（约第 464 行）：`}, [filterNsfw]);`

- [ ] **Step 4: 随心斩（randomSubject）过滤**

在 `fetchRandom` 函数中，`setRandomSubject(subject)` 之前（约第 402 行和 412 行），新增检查：

```js
// 过滤限制级内容
if (filterNsfw && subject) {
  const inaccessibleIds = await BangumiService.checkAccessibility([subject]);
  if (inaccessibleIds.has(subject.id)) {
    // 重新获取一个
    fetchRandom(type);
    return;
  }
}
```

> 注意：这里递归调用可能导致无限循环。更安全的做法是直接设置 subject 为 null 或显示"暂无推荐"。

简化方案：如果过滤到 NSFW，直接设置 `setRandomSubject(null)` 而不是递归：

```js
if (filterNsfw && subject) {
  const inaccessibleIds = await BangumiService.checkAccessibility([subject]);
  if (inaccessibleIds.has(subject.id)) {
    setRandomSubject(null);
    setRandomLoading(false);
    return;
  }
}
```

添加 `filterNsfw` 到 `fetchRandom` 的依赖数组（约第 419 行）：`}, [randomType, filterNsfw]);`

- [ ] **Step 5: 推荐 Galgame（Hikarinagi）过滤**

在 `loadHomeData` useEffect 中，`setRecommendGals` 之前（约第 205 行），新增标签过滤。需要先检查 Hikarinagi 数据是否有 tags 字段。

由于 `getRecommendGalgames()` 返回的列表数据可能不包含 tags，需要先确认。如果 recommend 端点返回的数据不含 tags，则此过滤暂不生效（需要后续调用详情 API 获取 tags）。

简化处理：在 `setRecommendGals(gals.slice(0, 5))` 之前新增：

```js
// 过滤限制级内容（基于标签）
if (filterNsfw) {
  const nsfwKeywords = ['R18', 'r18', '成人向', '18禁', '18+', 'NSFW', 'nsfw', '成人', '成年向'];
  const filtered = gals.filter(gal => {
    const tags = gal.tags || [];
    return !tags.some(tag => {
      const tagName = typeof tag === 'string' ? tag : (tag.name || tag.tag || '');
      return nsfwKeywords.some(kw => tagName.toLowerCase().includes(kw.toLowerCase()));
    });
  });
  setRecommendGals(filtered.slice(0, 5));
} else {
  setRecommendGals(gals.slice(0, 5));
}
```

---

### Task 7: Hikarinagi 过滤工具函数

**Files:**
- Create: `src/utils/hikarinagiFilter.js`

- [ ] **Step 1: 创建过滤工具函数**

```js
// src/utils/hikarinagiFilter.js
// Hikarinagi 限制级内容过滤（基于标签关键词）

const NSFW_KEYWORDS = ['R18', 'r18', '成人向', '18禁', '18+', 'NSFW', 'nsfw', '成人', '成年向', 'アダルト', 'adult'];

/**
 * 检查 Hikarinagi 条目是否为限制级内容
 * @param {Object} item - Hikarinagi 条目（galgame/lightnovel）
 * @returns {boolean} 是否为限制级
 */
export function isNsfwHikarinagi(item) {
  const tags = item.tags || [];
  return tags.some(tag => {
    const tagName = typeof tag === 'string' ? tag : (tag.name || tag.tag || '');
    return NSFW_KEYWORDS.some(kw => tagName.toLowerCase().includes(kw.toLowerCase()));
  });
}

/**
 * 过滤限制级内容
 * @param {Array} items - Hikarinagi 条目数组
 * @returns {Array} 过滤后的数组
 */
export function filterNsfwHikarinagi(items) {
  if (!Array.isArray(items)) return items;
  return items.filter(item => !isNsfwHikarinagi(item));
}
```

- [ ] **Step 2: 在 HomePage.jsx 中引用**

在 HomePage.jsx 顶部导入：
```js
import { filterNsfwHikarinagi } from '../utils/hikarinagiFilter';
```

然后替换 Task 6 Step 5 中的内联过滤逻辑：
```js
if (filterNsfw) {
  setRecommendGals(filterNsfwHikarinagi(gals).slice(0, 5));
} else {
  setRecommendGals(gals.slice(0, 5));
}
```

---

### Task 8: 构建验证

**Files:** 无

- [ ] **Step 1: 运行前端构建**

```powershell
cd d:\Desktop\Ideas\ANISpace\ANISpace
npx vite build --mode production
```

预期：构建成功，无错误

- [ ] **Step 2: 检查构建输出**

确认 dist/ 目录生成正常，文件大小合理