# Animeko 风格资源搜索系统设计

> 日期: 2026-06-12
> 状态: 已批准

## 1. 目标

完全照搬 Animeko 的搜索源、搜索技术和播放技术，解决当前 MacCMS 源资源质量差的问题。

## 2. 架构

### 2.1 Worker 端新增端点

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/selector/search` | POST | 通用 CSS Selector 搜索：接收 URL + 选择器配置，返回提取的资源列表 |
| `/api/selector/episode` | POST | 通用 CSS Selector 剧集提取：进入番剧详情页，提取剧集 m3u8 链接 |
| `/api/rss/fetch` | GET | 通用 RSS 获取：解析 RSS XML，返回结构化 BT 资源列表 |
| `/api/mikan/subject/:bgmId` | GET | Mikan 索引：Bangumi ID → Mikan 番剧 RSS 种子列表 |

### 2.2 前端新增源

| 源 | 类型 | 说明 |
|---|---|---|
| `SelectorSource` | WEB | 通用 CSS Selector 源，可配置任何在线播放站 |
| `RSSSource` | BITTORRENT | 通用 RSS 源，可对接 ACG.RIP、Nyaa 等 |
| `RawTitleParser` | 工具 | 从 BT 标题提取字幕组/分辨率/字幕语言/集数 |

### 2.3 优化现有源

| 源 | 优化内容 |
|---|---|
| `MikanSource` | Bangumi ID 精确索引匹配（通过 Worker KV 缓存映射） |
| `DmhySource` | 使用 RawTitleParser 解析标题元数据 |
| `MacCMSSource` | 保留，优化 isPlayableUrl 过滤 |

## 3. Worker 端实现

### 3.1 `/api/selector/search`

```typescript
// 请求体
interface SelectorSearchRequest {
  searchUrl: string;    // 搜索页 URL 模板，{keyword} 占位
  selectors: {
    list: string;       // 资源列表容器选择器
    item: string;       // 单个资源选择器
    title: string;      // 标题选择器
    link: string;       // 链接选择器
    cover?: string;     // 封面选择器
  };
  keyword: string;
  baseUrl: string;      // 源站基础 URL
}

// 响应
interface SelectorSearchResponse {
  items: Array<{
    title: string;
    url: string;        // 详情页 URL
    cover?: string;
  }>;
  total: number;
}
```

Worker 使用 `HTMLRewriter` 解析 HTML，按 CSS 选择器提取数据。

### 3.2 `/api/selector/episode`

```typescript
// 请求体
interface SelectorEpisodeRequest {
  url: string;          // 番剧详情页 URL
  baseUrl: string;
  selectors: {
    episodeList: string;  // 剧集列表容器
    episodeItem: string;  // 单集选择器
    episodeTitle: string; // 集数标题
    episodeUrl: string;   // 播放页 URL
  };
  playSelectors?: {
    videoSource: string;  // 视频源选择器（iframe src 或 video source）
  };
}

// 响应
interface SelectorEpisodeResponse {
  episodes: Array<{
    title: string;
    url: string;        // 播放页 URL 或 m3u8 直链
  }>;
}
```

### 3.3 `/api/rss/fetch`

```typescript
// 请求参数
?url=xxx   // RSS 订阅地址

// 响应
interface RSSFetchResponse {
  items: Array<{
    title: string;
    link: string;       // 种子/磁力链 URL
    pubDate: string;
    size?: string;
    description?: string;
  }>;
}
```

### 3.4 `/api/mikan/subject/:bgmId`

- 通过 Mikan 的 Bangumi 关联接口查找番剧
- 使用 Worker KV 缓存 Bangumi ID → Mikan Subject ID 映射
- 返回 Mikan 番剧页的 RSS 种子列表

## 4. 前端源实现

### 4.1 SelectorSource

```typescript
class SelectorSource implements MediaSource {
  readonly kind = MediaSourceKind.WEB;
  // 搜索流程：
  // 1. POST /api/selector/search → 获取番剧列表
  // 2. 选择匹配的番剧 → POST /api/selector/episode → 获取剧集+m3u8
  // 3. 返回 MediaMatch 列表
}
```

预设 Selector 源配置：
- AGE动漫: searchUrl, selectors
- 樱花动漫: searchUrl, selectors
- 嘶吼动漫: searchUrl, selectors

### 4.2 RSSSource

```typescript
class RSSSource implements MediaSource {
  readonly kind = MediaSourceKind.BITTORRENT;
  // 搜索流程：
  // 1. GET /api/rss/fetch?url=xxx → 获取 RSS 条目
  // 2. RawTitleParser 解析标题 → 提取元数据
  // 3. 返回 MediaMatch 列表
}
```

预设 RSS 源配置：
- ACG.RIP: `https://acg.rip/page/2.xml?term={keyword}`
- Nyaa: `https://nyaa.si/?page=rss&q={keyword}&c=0_0&f=0`
- Breadio Garden: `https://garden.breadio.wiki/feed.xml?filter=[{"keyword":"{keyword}"}]`

### 4.3 RawTitleParser

两个解析器（参考 Animeko）：

**LabelFirstRawTitleParser**（默认，正确率高）：
- 优先解析方括号/圆括号标签
- 提取：字幕组、集数、分辨率、字幕语言、编码格式
- 不解析标题名（避免误匹配）

**PatternBasedRawTitleParser**（回退）：
- 基于正则的模式匹配
- 尝试解析标题名，但正确率较低

解析示例：
```
[桜都字幕组] 继母的拖油瓶是我的前女友 - 04 [WebRip 1080p HEVC-10bit AAC][简繁内封字幕]
→ alliance: "桜都字幕组"
→ episodeRange: { sort: "4" }
→ resolution: "1080P"
→ subtitleLanguageIds: ["CHS", "CHT"]
→ subtitleKind: CLOSED
```

## 5. 数据流

```
用户点击"站内观看"标签
  → fetchWatchEpisodes (Bangumi v0 API)
  → 用户选择某集
  → MediaFetcher 并发查询所有源
    → SelectorSource: Worker 搜索 → 提取番剧 → 提取剧集 m3u8
    → RSSSource: Worker RSS → RawTitleParser 解析
    → MikanSource: Worker Bangumi ID 查找 → RSS → RawTitleParser 解析
    → DmhySource: Worker 搜索 → RawTitleParser 解析
    → MacCMSSource: 现有逻辑
  → MediaSelector 过滤排序
  → 展示资源列表（按源分组）
  → 用户点击播放 → VideoPlayer (hls.js)
```

## 6. 预设源配置

| 源 | 类型 | Factory ID | 预设实例 |
|---|---|---|---|
| Selector | WEB | `web-selector` | age, sakura |
| RSS | BITTORRENT | `rss` | acgrip, nyaa, breadio |
| MacCMS | WEB | `maccms` | lizi, feisu, bfzy, kuaikan |
| Mikan | BITTORRENT | `mikan` | mikan |
| DMHY | BITTORRENT | `dmhy` | dmhy |
| LocalCache | LOCAL_CACHE | `local_cache` | local_cache |

## 7. 限制

- Worker 无法执行 JavaScript，部分需要 JS 渲染的站点无法支持
- Worker 有 CPU 时间限制（10ms free plan），复杂 HTML 解析可能超时
- RSS BT 源在浏览器中无法直接播放（需要 WebTorrent 或下载）
- CSS 选择器配置需要随站点改版更新
