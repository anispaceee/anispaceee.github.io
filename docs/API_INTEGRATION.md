# ANISpace API 应用方案文档

## 目录

1. [引言](#引言)
2. [API 列表](#api-列表)
   - [Bangumi API](#1-bangumi-api)
   - [AniList API](#2-anilist-api)
   - [Kitsu API](#3-kitsu-api)
   - [萌娘百科 API](#4-萌娘百科-api)
   - [ACGClub API](#5-acgclub-api)
3. [应用场景分析](#应用场景分析)
4. [技术实现方式](#技术实现方式)
5. [数据处理流程](#数据处理流程)
6. [性能优化方案](#性能优化方案)
7. [集成实施路线图](#集成实施路线图)

---

## 引言

ANISpace 作为 ACG 社区平台，需要整合多个外部 API 来提供丰富的内容服务。本文档详细分析了 5 个核心 API 的技术特性、应用场景和集成方案，为项目开发提供完整的技术参考。

### 目标

- 实现多源数据聚合，提升内容丰富度
- 建立统一的数据标准化层，降低前端复杂度
- 通过缓存和请求优化确保响应性能
- 提供可扩展的 API 集成架构

---

## API 列表

### 1. Bangumi API

**基础信息**

| 属性 | 值 |
|------|-----|
| 基础 URL | `https://api.bgm.tv` |
| 协议 | HTTPS REST |
| 认证 | 可选（部分接口需要 Access Token） |
| 速率限制 | 无明确限制，建议 ≤5 req/s |
| 文档 | https://bangumi.github.io/api/ |

**核心接口**

```
POST /v0/search/subjects       - 搜索条目
GET  /v0/subjects/:id          - 条目详情
GET  /v0/subjects/:id/characters - 条目角色
GET  /v0/subjects/:id/persons  - 条目制作人员
GET  /v0/subjects/:id/comments - 条目评论
GET  /v0/persons?keyword=      - 人物搜索
GET  /calendar                  - 每日放送
```

**搜索请求示例**

```javascript
const response = await fetch('https://api.bgm.tv/v0/search/subjects', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'ANISpace/1.0',
  },
  body: JSON.stringify({
    keyword: '魔法少女',
    filter: { type: [2] },  // 1=小说, 2=动画, 4=游戏
    limit: 24,
    offset: 0,
  }),
});
```

**在本项目中的应用**

- 百科搜索与排行榜
- 条目详情页数据
- 每日放送日历
- 人物信息检索
- 社区评论获取

---

### 2. AniList API

**基础信息**

| 属性 | 值 |
|------|-----|
| 基础 URL | `https://graphql.anilist.co` |
| 协议 | HTTPS GraphQL |
| 认证 | 可选（公开查询无需认证） |
| 速率限制 | 90 req/min（认证后更高） |
| 文档 | https://anilist.gitbook.io/anilist-apiv2-docs/ |

**GraphQL 查询示例**

```graphql
query ($search: String, $type: MediaType) {
  Media(search: $search, type: $type) {
    id
    title { romaji native english }
    coverImage { large medium }
    description
    averageScore
    episodes
    startDate { year month day }
    genres
    studios { nodes { name } }
  }
}
```

**在本项目中的应用**

- 补充 Bangumi 缺失的英文数据
- 获取当季新番信息
- 跨平台评分对比
- 多语言标题支持

---

### 3. Kitsu API

**基础信息**

| 属性 | 值 |
|------|-----|
| 基础 URL | `https://kitsu.io/api/edge` |
| 协议 | HTTPS REST (JSON:API) |
| 认证 | 可选 |
| 速率限制 | 无明确限制 |
| 文档 | https://kitsu.docs.apiary.io/ |

**请求示例**

```javascript
const response = await fetch(
  'https://kitsu.io/api/edge/anime?filter[text]=madoka&page[limit]=5',
  {
    headers: { 'Accept': 'application/vnd.api+json' },
  }
);
```

**在本项目中的应用**

- 多源数据交叉验证
- 欧美社区评分参考
- 补充条目元数据

---

### 4. 萌娘百科 API

**基础信息**

| 属性 | 值 |
|------|-----|
| 基础 URL | `https://mzh.moegirl.org.cn/api.php` |
| 协议 | HTTPS MediaWiki API |
| 认证 | 不需要 |
| 速率限制 | 建议间隔 ≥1s |
| 文档 | https://www.mediawiki.org/wiki/API |

**请求示例**

```javascript
const params = new URLSearchParams({
  action: 'query',
  list: 'search',
  srsearch: '牧瀬紅莉栖',
  format: 'json',
  srlimit: '5',
});
const response = await fetch(`https://mzh.moegirl.org.cn/api.php?${params}`);
```

**在本项目中的应用**

- 人物百科页面跳转
- 角色详细信息补充
- ACG 术语解释

---

### 5. ACGClub API

**基础信息**

| 属性 | 值 |
|------|-----|
| 来源 | moeimg.2ge.org / gamersky.com |
| 协议 | HTTPS（图片直链） |
| 认证 | 不需要 |
| 数据格式 | 图片 URL 列表 |

**在本项目中的应用**

- 社区壁纸推荐
- 角色图库展示
- 首页轮播素材

---

## 应用场景分析

### 场景 1：全局搜索

**涉及 API**: Bangumi + AniList + 萌娘百科

```
用户输入 → 并行请求多 API → 标准化数据 → 按类型分组展示
```

- Bangumi: 搜索动画/小说/游戏条目
- AniList: 补充英文标题和封面
- 萌娘百科: 人物搜索和百科链接

### 场景 2：条目详情页

**涉及 API**: Bangumi + Kitsu

```
条目 ID → Bangumi 详情 → Kitsu 补充 → 合并展示
```

- Bangumi: 主要数据源（评分、简介、角色、制作人员）
- Kitsu: 补充欧美评分和简介

### 场景 3：每日放送

**涉及 API**: Bangumi + AniList

```
Bangumi Calendar → AniList 当季信息 → 合并展示
```

### 场景 4：人物搜索

**涉及 API**: Bangumi + 萌娘百科

```
关键词 → Bangumi /v0/persons → 萌娘百科搜索 → 合并展示
```

---

## 技术实现方式

### 统一请求层

```javascript
class BaseExternalAPI {
  static cache = new Map();
  static CACHE_TTL = 30 * 60 * 1000; // 30分钟

  static async request(url, options = {}) {
    const cacheKey = `${url}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }
}
```

### 数据标准化

```javascript
class AniListService extends BaseExternalAPI {
  static normalizeMedia(data) {
    return {
      id: `anilist_${data.id}`,
      source: 'anilist',
      title: data.title?.romaji || data.title?.native || '',
      titleEn: data.title?.english || '',
      titleJp: data.title?.native || '',
      cover: data.coverImage?.large || '',
      score: data.averageScore ? data.averageScore / 10 : 0,
      description: data.description || '',
      episodes: data.episodes || 0,
      genres: data.genres || [],
      startDate: data.startDate
        ? `${data.startDate.year}-${data.startDate.month}-${data.startDate.day}`
        : '',
    };
  }
}
```

---

## 数据处理流程

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  用户请求  │ ──→ │  API 路由分发  │ ──→ │  并行请求执行  │ ──→ │ 数据合并  │
└──────────┘     └──────────────┘     └──────────────┘     └──────────┘
                       │                      │                     │
                       ▼                      ▼                     ▼
                 ┌──────────┐          ┌──────────┐          ┌──────────┐
                 │ 缓存检查  │          │ 超时控制  │          │ 标准化处理 │
                 └──────────┘          └──────────┘          └──────────┘
                       │                      │                     │
                       ▼                      ▼                     ▼
                 ┌──────────┐          ┌──────────┐          ┌──────────┐
                 │ 命中返回  │          │ 降级处理  │          │ 去重合并  │
                 └──────────┘          └──────────┘          └──────────┘
```

### 请求优先级

1. **Bangumi API** - 主要数据源，优先级最高
2. **AniList API** - 补充数据源，用于增强
3. **Kitsu API** - 备用数据源，用于交叉验证
4. **萌娘百科** - 百科链接，独立使用
5. **ACGClub** - 壁纸资源，独立使用

---

## 性能优化方案

### 1. 请求缓存

- **内存缓存**: Map 结构，TTL 30 分钟
- **localStorage**: 持久化缓存，TTL 24 小时
- **缓存键**: URL + 参数哈希

```javascript
const getCached = (key) => {
  const raw = localStorage.getItem(`api_cache_${key}`);
  if (!raw) return null;
  const { data, timestamp } = JSON.parse(raw);
  if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
    localStorage.removeItem(`api_cache_${key}`);
    return null;
  }
  return data;
};
```

### 2. 请求合并

```javascript
const batchSearch = async (keyword) => {
  const results = await Promise.allSettled([
    BangumiService.searchSubjects(keyword, 0, 5, 0),
    AniListService.searchAnime(keyword),
    MoegirlService.search(keyword),
  ]);
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
};
```

### 3. 防抖与节流

- 搜索输入: 300ms 防抖
- 滚动事件: 100ms 节流
- API 请求: 避免重复请求

### 4. 渐进式加载

- 骨架屏占位
- 优先加载首屏数据
- 懒加载图片和次要内容

---

## 集成实施路线图

### 阶段 1：基础集成（已完成）

- [x] Bangumi API 核心接口集成
- [x] 搜索与详情页数据获取
- [x] 每日放送日历
- [x] 人物搜索接口

### 阶段 2：多源增强（已完成）

- [x] AniList GraphQL 集成
- [x] Kitsu REST 集成
- [x] 萌娘百科 MediaWiki 集成
- [x] ACGClub 壁纸集成
- [x] 统一数据标准化层

### 阶段 3：性能优化（进行中）

- [ ] 请求缓存持久化
- [ ] Service Worker 离线缓存
- [ ] 请求合并与批处理
- [ ] 图片 CDN 加速

### 阶段 4：高级功能（规划中）

- [ ] WebSocket 实时数据推送
- [ ] 用户数据同步（Bangumi 收藏同步）
- [ ] 智能推荐算法
- [ ] 多语言支持

### 预期效果评估指标

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 搜索响应时间 | ~800ms | <500ms |
| 缓存命中率 | 30% | >70% |
| API 可用性 | 95% | >99% |
| 页面加载时间 | ~2.5s | <3s |
| 内存占用峰值 | ~150MB | <200MB |
