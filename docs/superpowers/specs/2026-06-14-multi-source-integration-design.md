# 多数据源集成 + 一言装饰设计文档

> 日期: 2026-06-14
> 状态: 已批准

## 概述

集成 AniList、Kitsu、一言(Hitokoto) 三个二次元 API 作为 ANISpace 的补充数据源，实现条目自动合并、海外数据展示和动漫台词装饰。

## 背景

### 新增数据源

| API | 类型 | 端点 | 国内可达 | ANISpace 价值 |
|-----|------|------|---------|--------------|
| AniList | GraphQL | `https://graphql.anilist.co` | 不稳定(需降级) | 高 — 500k+条目，海外评分/英文标题/制作人员 |
| Kitsu | REST | `https://kitsu.io/api/edge/` | 不稳定(需降级) | 中低 — 与AniList重叠，评分/分类 |
| 一言 | REST | `https://v1.hitokoto.cn/` | 稳定 | 中 — 动漫台词装饰 |

### 国内可达性

| API | 国内直连 | 降级策略 |
|-----|---------|---------|
| Bangumi | 可达 | 无需 |
| AniBT | 可达(Worker代理) | 无需 |
| bangumi-data CDN | 可达 | 无需 |
| AniList | 不稳定 | 超时5s降级 |
| Kitsu | 不稳定 | 超时5s降级 |
| 一言 | 可达 | 无需 |

## 设计决策

### 1. 统一版 + 降级架构

不区分国内版/国际版。所有数据源统一可用，海外源增加超时检测和降级：
- 请求超时 5 秒则标记该源不可用
- 不可用源的补充信息区域显示"数据源暂时不可用"
- 用户可在设置中手动开关各数据源

### 2. 条目自动合并

以 Bangumi 为主数据源，AniList/Kitsu 数据自动合并到同一详情页。

**匹配策略（精确+模糊降级）**：
1. **精确匹配**：AniList 条目的 `externalLinks` 字段可能包含 Bangumi 链接和 ID → 直接关联
2. **模糊降级**：无精确链接时，通过标题（日文/中文/英文）模糊匹配

**合并展示**：
- 详情页主信息来自 Bangumi
- 新增"海外数据"区域，展示补充信息
- 各源评分并排展示

### 3. 一言装饰 UI

在页面空白区域展示随机动漫台词：
- 半透明彩色字体，大小随机（14px-48px）
- 每次刷新/页面切换时随机改变位置和内容
- 仅展示 `type=a`（动画）类型
- 缓存：一次获取 5 条，用完再取
- 字体颜色使用项目色调的半透明变体

## 功能详细设计

### F1: AniListService

新增 `src/services/AniListService.js`:

```js
export const AniListService = {
  ENDPOINT: 'https://graphql.anilist.co',
  TIMEOUT: 5000,
  _available: null, // null=未检测, true=可用, false=不可用

  async checkAvailability() { /* 发送简单查询检测可达性 */ },
  async searchAnime(title) { /* 通过标题搜索动漫 */ },
  async getAnimeById(anilistId) { /* 获取动漫详情 */ },
  async getAnimeByBgmId(bgmId) { /* 通过 externalLinks 查找 Bangumi ID 关联 */ },
  async getAiringSchedule(page) { /* 获取放送时间表 */ },
  async getStaff(staffId) { /* 获取制作人员信息 */ },
};
```

关键 GraphQL 查询：
- `Media` 查询：支持 `id`, `idMal`, `search`(标题搜索)
- `Media.externalLinks`：包含 Bangumi 等外部链接
- `Page` 查询：分页搜索

### F2: KitsuService

新增 `src/services/KitsuService.js`:

```js
export const KitsuService = {
  ENDPOINT: 'https://kitsu.io/api/edge/',
  TIMEOUT: 5000,
  _available: null,

  async checkAvailability() { /* 检测可达性 */ },
  async searchAnime(title) { /* 通过标题搜索 */ },
  async getAnimeById(kitsuId) { /* 获取详情 */ },
  async getAnimeBySlug(slug) { /* 通过 slug 获取 */ },
};
```

### F3: HitokotoService

新增 `src/services/HitokotoService.js`:

```js
export const HitokotoService = {
  ENDPOINT: 'https://v1.hitokoto.cn/',
  CACHE_KEY: 'anispace_hitokoto_cache',
  CACHE_SIZE: 5,

  async fetchHitokotos() { /* 获取5条动画台词 */ },
  getRandomHitokoto() { /* 从缓存中随机取一条 */ },
};
```

### F4: SourceMerger

新增 `src/services/SourceMerger.js`:

```js
export const SourceMerger = {
  async mergeAnimeData(bgmSubject) { /* 合并多源数据 */ },
  async findAniListByBgmId(bgmId) { /* 精确匹配 */ },
  async findAniListByTitle(title) { /* 模糊匹配 */ },
  async findKitsuByTitle(title) { /* Kitsu标题匹配 */ },
  calculateMatchScore(bgmTitle, externalTitle) { /* 计算标题匹配分数 */ },
};
```

匹配逻辑：
1. 先用 `bgmId` 在 AniList 的 `externalLinks` 中查找精确匹配
2. 失败则用 `title.japanese` 在 AniList 搜索，取第一个结果（匹配度>80%）
3. 再用 `title.chinese` / `title.english` 尝试
4. Kitsu 同理

### F5: 详情页海外数据区域

修改 `src/components/Info/InfoDetail.jsx`:

在侧边栏添加"海外数据"区域：
- AniList 评分（0-100，转换为10分制显示）
- 英文标题 / 罗马音标题
- 海外制作人员（如有差异于 Bangumi 数据）
- Kitsu 评分
- 数据源不可用时显示"数据源暂时不可用"灰色提示

### F6: 一言装饰组件

新增 `src/components/Common/HitokotoDecoration.jsx` + `HitokotoDecoration.css`:

- 固定定位（position: fixed），覆盖页面空白区域
- 多个台词元素随机分布（使用 CSS transform 随机定位）
- 半透明彩色字体：
  - 粉色: rgba(232, 134, 162, 0.15)
  - 紫色: rgba(184, 154, 212, 0.12)
  - 蓝色: rgba(126, 184, 218, 0.12)
  - 绿色: rgba(143, 212, 164, 0.10)
- 字体大小随机：14px-48px
- pointer-events: none（不影响页面交互）
- 每次路由切换时重新随机位置和内容
- z-index: 0（在内容下方）

### F7: 数据源设置

在设置页面添加"数据源"开关：
- AniList（默认开）
- Kitsu（默认开）
- 一言装饰（默认开）
- 存储在 localStorage

## 技术约束

- AniList 速率限制：90 请求/分钟
- Kitsu 无明确速率限制，建议不超过 30 请求/分钟
- 一言限制：2 QPS（国内），需缓存
- AniList 和 Kitsu 在中国大陆可能不可达，必须有降级机制
- GraphQL 请求需 POST + Content-Type: application/json

## 影响范围

| 文件 | 改动类型 |
|------|---------|
| `src/services/AniListService.js` | 新增 |
| `src/services/KitsuService.js` | 新增 |
| `src/services/HitokotoService.js` | 新增 |
| `src/services/SourceMerger.js` | 新增 |
| `src/components/Common/HitokotoDecoration.jsx` | 新增 |
| `src/components/Common/HitokotoDecoration.css` | 新增 |
| `src/components/Info/InfoDetail.jsx` | 修改（添加海外数据区域） |
| `src/components/Info/InfoDetail.css` | 修改（海外数据样式） |

## 不做的事

- 不区分国内版/国际版（统一版+降级）
- 不修改放送表数据源（保持 AniBT）
- 不修改搜索功能数据源（保持 Bangumi）
- 不实现用户级别的 AniList/Kitsu 账号绑定
- 不实现 AniList/Kitsu 的用户收藏同步
