# ANISpace 影视区 V2 产品需求文档（PRD）

| 字段 | 内容 |
| --- | --- |
| 文档版本 | v2.0 |
| 编写日期 | 2026-06-12 |
| 改造范围 | 影视区（M-09）完全重写 |
| 架构参考 | [Animeko (open-ani/animeko)](https://github.com/open-ani/animeko) |
| 文档目的 | 锁定影视区 V2 的功能规格、架构设计和验收标准 |

---

## 1. 改造背景与目标

### 1.1 现状问题

| 问题 | 影响 |
| --- | --- |
| 仅支持苹果CMS V10 API 源 | 无法接入 DMHY、Mikan 等 BT 源和樱花等 Web 源 |
| 搜索为"关键词维度" | 跨源匹配精度低，同名番剧容易混淆 |
| 无匹配度标记 | 用户无法区分精确匹配和模糊匹配 |
| 无 Bangumi 条目关联 | 影视区与 Wiki 区数据割裂 |
| 无弹幕功能 | 观影体验不完整 |
| 无 BT 种子支持 | 无法获取字幕组高质量资源 |
| 无本地缓存 | 无法离线观看 |
| 评论仅 localStorage | 非真正社交功能 |

### 1.2 改造目标

1. **Bangumi 为元数据中心**：搜索流程从"关键词搜视频"变为"先找番剧条目，再按剧集找资源"
2. **插件化数据源**：支持 WEB/BT/LocalCache 三种源类型，新增源无需修改核心代码
3. **精确匹配**：引入 MatchKind（EXACT/FUZZY），提高跨源匹配精度
4. **弹幕系统**：第三方弹幕 API 优先 + 自建预留
5. **BT 种子播放**：WebTorrent 浏览器端流式播放
6. **本地缓存**：IndexedDB 存储已下载资源，支持离线观看

### 1.3 范围声明

| In | Out（V2 不做） |
| --- | --- |
| Bangumi 条目搜索与关联、MediaSource 抽象层、苹果CMS/DMHY/Mikan/樱花/LocalCache 五种源、MatchKind 匹配、DPlayer+弹幕、WebTorrent BT 播放、IndexedDB 本地缓存、源管理 UI | 视频上传/转码、社区商城、付费订阅、原生 App |

---

## 2. 核心架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────┐
│                    UI 层                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ 影视首页  │ │ 番剧详情  │ │   视频播放器      │ │
│  │(Bangumi  │ │(Subject  │ │ (DPlayer+弹幕    │ │
│  │ 搜索)    │ │ Detail)  │ │  +剧集切换)      │ │
│  └─────┬────┘ └─────┬────┘ └────────┬─────────┘ │
├────────┼────────────┼───────────────┼────────────┤
│        │      MediaSource 层        │            │
│  ┌─────▼────────────▼───────────────▼─────────┐ │
│  │           MediaSourceManager               │ │
│  │  (注册/发现/调度所有 MediaSource)            │ │
│  └──┬──────┬──────┬──────┬──────┬─────────────┘ │
│     │      │      │      │      │               │
│  ┌──▼──┐┌──▼──┐┌──▼──┐┌──▼──┐┌──▼──┐           │
│  │MacCMS││DMHY ││Mikan││Sakura││Local│           │
│  │Source││Source││Source││Source││Cache│           │
│  └─────┘└─────┘└─────┘└─────┘└─────┘           │
├──────────────────────────────────────────────────┤
│              基础设施层                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Bangumi  │ │ WebTorrent│ │  DanmakuService  │ │
│  │ Proxy    │ │  Engine   │ │  (第三方+自建)    │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 2.2 搜索流程（Bangumi 为元数据中心）

```
用户在影视区搜索 "葬送的芙莉莲"
       ↓
1. 调 Bangumi API 搜索条目 → 返回条目列表（封面、评分、简介）
       ↓
2. 用户选择条目 → 进入番剧详情页
   （展示 Bangumi 条目信息 + 剧集列表）
       ↓
3. 用户选择某集 → 构建 MediaFetchRequest
   { subjectId, episodeSort: "01", subjectNames: ["葬送的芙莉莲", "Sousou no Frieren"] }
       ↓
4. 并行调用所有已启用 MediaSource.fetch(request)
       ↓
5. 聚合结果，按 MatchKind + SourceTier 排序
       ↓
6. 展示资源列表，用户选择 → 播放
```

### 2.3 播放流程

```
用户选择 MediaMatch
       ↓
根据 MediaSourceKind 分流：
  ├── WEB → 解析播放直链 → Worker 代理绕 CORS → DPlayer 播放 + 弹幕
  ├── BITTORRENT → WebTorrent 加载磁力链接 → 流式播放 + 弹幕
  └── LOCAL_CACHE → IndexedDB 读取 → DPlayer 播放 + 弹幕
```

---

## 3. 核心接口定义

### 3.1 MediaSource — 数据源接口

```typescript
interface MediaSource {
  readonly sourceId: string;
  readonly kind: MediaSourceKind;
  readonly info: MediaSourceInfo;

  checkConnection(): Promise<ConnectionStatus>;
  fetch(request: MediaFetchRequest): Promise<PagedResult<MediaMatch>>;
  close?(): void;
}
```

### 3.2 MediaSourceFactory — 数据源工厂

```typescript
interface MediaSourceFactory {
  readonly factoryId: string;
  readonly allowMultipleInstances: boolean;
  readonly parameters: SourceParameter[];
  readonly info: MediaSourceInfo;

  create(sourceId: string, config: SourceConfig): MediaSource;
}
```

### 3.3 MediaFetchRequest — 查询请求

```typescript
interface MediaFetchRequest {
  subjectId: string;           // Bangumi 条目 ID
  episodeId?: string;          // Bangumi 剧集 ID
  subjectNames: string[];      // 所有名称（中文/日文/英文/别名）
  episodeSort: string;         // 集数（如 "01", "SP01"）
  episodeName?: string;        // 集名
}
```

### 3.4 MediaMatch — 匹配结果

```typescript
interface MediaMatch {
  media: Media;
  matchKind: MatchKind;        // EXACT | FUZZY
}

enum MatchKind {
  EXACT = 'exact',    // episodeId 或集数精确匹配
  FUZZY = 'fuzzy',    // 名称/集数模糊匹配
}
```

### 3.5 Media — 资源实体

```typescript
interface Media {
  mediaId: string;
  sourceId: string;
  title: string;
  episodeRange?: EpisodeRange;  // 包含的集数范围
  download?: MediaDownload;     // 下载信息
  properties: {
    resolution?: string;        // 分辨率（1080p/4K）
    subtitleGroup?: string;     // 字幕组
    fileSize?: string;          // 文件大小
    [key: string]: any;
  };
}
```

### 3.6 MediaSourceKind — 源类型

```typescript
enum MediaSourceKind {
  WEB = 'web',                // 在线视频源
  BITTORRENT = 'bittorrent',  // BT 种子源
  LOCAL_CACHE = 'local_cache', // 本地缓存
}
```

### 3.7 辅助类型

```typescript
interface MediaSourceInfo {
  displayName: string;
  description?: string;
  websiteUrl?: string;
  iconUrl?: string;
  isSpecial?: boolean;         // 如本地缓存
  tier?: number;               // 优先级，值越低越优先
}

interface SourceConfig {
  arguments: Record<string, string | undefined>;
  serializedArguments?: any;
}

interface SourceParameter {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: any;
  options?: { label: string; value: string }[];
  required?: boolean;
}

interface EpisodeRange {
  sort: string;                // "01"
  ep?: string;                 // EP 编号
  name?: string;               // 集名
}

interface MediaDownload {
  kind: 'http' | 'magnet' | 'torrent' | 'local';
  url: string;                 // 直链 / 磁力链接 / 本地路径
  headers?: Record<string, string>;
}

interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pagecount: number;
  hasMore: boolean;
}

enum ConnectionStatus {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
  TIMEOUT = 'timeout',
}
```

---

## 4. 数据源实现规格

### 4.1 MacCMSSource（苹果CMS 源）

| 字段 | 值 |
| --- | --- |
| factoryId | `maccms` |
| kind | `WEB` |
| allowMultipleInstances | `true` |
| parameters | `baseUrl`（必填）、`name`（必填） |

**fetch 实现逻辑：**
1. 将 `subjectNames[0]` 作为关键词调用 `/api.php/provide/vod/?ac=videolist&wd=`
2. 对返回结果按标题匹配 `subjectNames` 中的任一名称 → 标记 `FUZZY`
3. 若 `episodeSort` 与资源的集数匹配 → 升级为 `EXACT`
4. 返回 `MediaMatch[]`，每个 Media 的 `download.kind = 'http'`，URL 为 m3u8 直链

**预设实例：**
- 酷云资源（kuapi.co）
- 暴风资源（bfzyapi.com）
- 光速资源（guangsuapi.com）
- 闪电资源（sdzyapi.com）

### 4.2 DmhySource（动漫花园源）

| 字段 | 值 |
| --- | --- |
| factoryId | `dmhy` |
| kind | `BITTORRENT` |
| allowMultipleInstances | `false` |
| parameters | 无（固定地址 `share.dmhy.org`） |

**fetch 实现逻辑：**
1. 通过 Worker 代理访问 `https://share.dmhy.org/topics/list?keyword=`
2. 关键词组合：`subjectNames[0] + " " + episodeSort`（如 "葬送的芙莉莲 01"）
3. HTML 解析提取：标题、磁力链接、大小、字幕组
4. 标题匹配 `subjectNames` → `FUZZY`；标题包含精确集数 → `EXACT`
5. 返回 `MediaMatch[]`，每个 Media 的 `download.kind = 'magnet'`

### 4.3 MikanSource（蜜柑计划源）

| 字段 | 值 |
| --- | --- |
| factoryId | `mikan` |
| kind | `BITTORRENT` |
| allowMultipleInstances | `false` |
| parameters | 无（固定地址 `mikanani.me`） |

**fetch 实现逻辑：**
1. 通过 Worker 代理访问 `https://mikanani.me/RSS/Search?searchstr=`
2. RSS 解析提取：标题、磁力链接、大小、字幕组
3. 匹配逻辑同 DMHY
4. 返回 `MediaMatch[]`，每个 Media 的 `download.kind = 'magnet'`

### 4.4 SakuraSource（樱花动漫源）

| 字段 | 值 |
| --- | --- |
| factoryId | `sakura` |
| kind | `WEB` |
| allowMultipleInstances | `false` |
| parameters | 无（固定地址） |

**fetch 实现逻辑：**
1. 通过 Worker 代理访问樱花动漫搜索页
2. HTML 解析提取：标题、封面、播放页链接
3. 进入播放页解析视频直链
4. 返回 `MediaMatch[]`，每个 Media 的 `download.kind = 'http'`

### 4.5 LocalCacheSource（本地缓存源）

| 字段 | 值 |
| --- | --- |
| factoryId | `local_cache` |
| kind | `LOCAL_CACHE` |
| allowMultipleInstances | `false` |
| parameters | 无 |
| isSpecial | `true` |

**fetch 实现逻辑：**
1. 从 IndexedDB `media_cache` 表查询 `subjectId + episodeSort` 匹配的缓存
2. 精确匹配 → `EXACT`
3. 返回 `MediaMatch[]`，每个 Media 的 `download.kind = 'local'`

**缓存写入：**
- BT 源下载完成后，WebTorrent 将文件 blob 存入 IndexedDB
- WEB 源：可选缓存（需用户手动触发，因视频文件较大）

---

## 5. 弹幕系统

### 5.1 架构

```
DPlayer 弹幕接口
       ↓
DanmakuService（统一入口）
       ├── 第三方 API（优先）：DanDanPlay / AcgnX
       │   └── GET/POST 第三方弹幕 API
       └── 自建 API（预留）：/api/danmaku
           └── D1 danmaku 表
```

### 5.2 弹幕关联 Key

- 以 Bangumi `episodeId` 为弹幕聚合 key
- 第三方 API 通常也以 Bangumi ID 关联，天然兼容

### 5.3 DPlayer 集成

```javascript
new DPlayer({
  danmaku: {
    id: episodeId,           // Bangumi episodeId
    api: '/api/danmaku/',    // 弹幕 API 地址
    maximum: 1000,           // 最大弹幕数
  },
});
```

### 5.4 自建弹幕 API（预留）

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/danmaku/list` | GET | 按 episodeId 查询弹幕列表 |
| `/api/danmaku/send` | POST | 发送弹幕（需登录） |

**D1 表结构：**
```sql
CREATE TABLE danmaku (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  time REAL NOT NULL,        -- 视频内时间（秒）
  color TEXT DEFAULT '#FFFFFF',
  type INTEGER DEFAULT 0,    -- 0=滚动 1=顶部 2=底部
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 6. UI 页面规格

### 6.1 影视首页（VideoHome）

**路由**：`/video`

**布局**：
- 顶部：搜索栏（搜索 Bangumi 条目，非视频关键词）
- 中部：热门番剧推荐（Bangumi 排行榜数据）
- 下部：我的追番（从 M-16 追番模块读取）

**搜索行为**：
- 输入关键词 → 300ms 防抖 → 调 Bangumi 搜索 API → 展示条目卡片列表
- 点击条目 → 跳转番剧详情页

### 6.2 番剧详情页（SubjectDetail）

**路由**：`/video/subject/:subjectId`

**布局**：
- 顶部：条目信息（封面、标题、评分、简介、标签）— 来自 Bangumi
- 中部：剧集列表（Bangumi episode 数据）
- 下部：资源匹配结果（点击某集后展示）

**交互**：
- 点击某集 → 构建 MediaFetchRequest → 并行查询所有源 → 展示资源列表
- 资源列表按 MatchKind（EXACT 优先）+ SourceTier 排序
- 每个资源显示：源名、匹配度标签（精确/模糊）、分辨率、字幕组、大小
- 点击资源 → 跳转播放页

### 6.3 播放页（VideoPlayer）

**路由**：`/video/play/:subjectId/:episodeId`

**布局**：
- 播放器区域：DPlayer（含弹幕）
- 右侧/下方：剧集列表（快速切换）
- 下方：资源切换（切换不同源的同一集）

**播放器功能**：
- DPlayer 基础播放控制
- 弹幕显示/隐藏/发送
- 倍速播放
- 画中画
- 播放进度记忆（localStorage）

**BT 播放特殊处理**：
- WebTorrent 加载磁力链接时显示缓冲进度
- 选择最大文件自动播放
- 缓存完成后可存入 IndexedDB

### 6.4 源管理页（SourceManager）

**路由**：`/video/sources`

**布局**：
- 已注册源列表（可拖拽排序优先级）
- 每个源：启用/禁用开关、测试连接按钮、配置按钮
- 添加新源（选择工厂类型 → 填写参数）

---

## 7. 文件结构

```
src/
├── services/
│   └── media/
│       ├── types.ts                # 所有接口/类型定义
│       ├── MediaSourceManager.ts   # 源注册/发现/调度
│       ├── MediaSelector.ts        # 资源选择/排序/过滤
│       ├── MatchEngine.ts          # 匹配引擎
│       └── sources/
│           ├── MacCMSSource.ts     # 苹果CMS 源
│           ├── DmhySource.ts       # 动漫花园源
│           ├── MikanSource.ts      # 蜜柑计划源
│           ├── SakuraSource.ts     # 樱花动漫源
│           └── LocalCacheSource.ts # 本地缓存源
├── services/
│   └── danmaku/
│       ├── DanmakuService.ts       # 弹幕服务
│       └── DanmakuAPI.ts           # 第三方弹幕 API
├── components/
│   └── Video/
│       ├── VideoHome.jsx           # 影视首页
│       ├── VideoHome.css
│       ├── SubjectDetail.jsx       # 番剧详情页
│       ├── SubjectDetail.css
│       ├── VideoPlayer.jsx         # 播放器页
│       ├── VideoPlayer.css
│       ├── SourceManager.jsx       # 源管理页
│       ├── SourceManager.css
│       ├── MediaMatchList.jsx      # 资源匹配列表组件
│       └── MediaMatchList.css
```

**删除旧文件：**
- `src/components/Video/VideoZone.jsx` → 替换为 `VideoHome.jsx`
- `src/components/Video/VideoDetail.jsx` → 替换为 `SubjectDetail.jsx` + `VideoPlayer.jsx`
- `src/components/Video/VideoZone.css` → 替换
- `src/components/Video/VideoDetail.css` → 替换
- `src/services/videoSource.js` → 替换为 `services/media/` 目录

---

## 8. Worker 端变更

### 8.1 新增路由

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/api/video/proxy` | GET | 已有，视频源 API 代理 |
| `/api/video/stream` | GET | 已有，视频流代理 |
| `/api/video/dmhy` | GET | 新增，DMHY HTML 代理 |
| `/api/video/mikan` | GET | 新增，Mikan RSS 代理 |
| `/api/video/sakura` | GET | 新增，樱花动漫 HTML 代理 |
| `/api/danmaku/list` | GET | 新增，弹幕查询 |
| `/api/danmaku/send` | POST | 新增，弹幕发送 |

### 8.2 HTML/RSS 代理

DMHY、Mikan、樱花等源需要 Worker 代理获取 HTML/RSS 内容：
- 请求目标站 → 返回原始 HTML/RSS
- 设置 CORS 头
- 缓存 5 分钟

---

## 9. 依赖新增

| 包 | 用途 |
| --- | --- |
| `webtorrent` | 浏览器端 BT 下载与流式播放 |
| `parse-torrent` | 解析磁力链接/种子文件 |

---

## 10. 验收标准

### 10.1 搜索流程

- [ ] 输入"芙莉莲" → Bangumi 搜索返回条目列表
- [ ] 点击条目 → 详情页展示 Bangumi 信息 + 剧集列表
- [ ] 点击某集 → 所有已启用源并行查询 → 资源列表按匹配度排序
- [ ] EXACT 匹配排在 FUZZY 前面
- [ ] 某源失败 → 其他源结果仍展示 + 失败提示

### 10.2 播放流程

- [ ] WEB 源：点击资源 → DPlayer 播放 m3u8 + 弹幕
- [ ] BT 源：点击资源 → WebTorrent 加载 → 显示缓冲 → 流式播放 + 弹幕
- [ ] LocalCache：有缓存时优先展示缓存资源
- [ ] 播放进度记忆：切换集数后返回，恢复到之前位置
- [ ] 播放失败 → 显示错误提示 + 切换源建议

### 10.3 弹幕

- [ ] 播放视频时弹幕正常显示
- [ ] 可发送弹幕（登录用户）
- [ ] 弹幕开关可切换
- [ ] 第三方 API 不可用时降级为无弹幕，不阻塞播放

### 10.4 源管理

- [ ] 可启用/禁用源
- [ ] 可添加自定义苹果CMS源
- [ ] 测试连接按钮可用
- [ ] 源优先级可调整

### 10.5 BT 缓存

- [ ] BT 资源播放完毕后可"保存到本地"
- [ ] 保存后在 LocalCache 源中可见
- [ ] 离线时可从 LocalCache 播放

---

## 11. 实施分期

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| P0 | 核心抽象层（types.ts + MediaSourceManager + MatchEngine） | 无 |
| P0 | MacCMSSource 适配（复刻现有功能） | P0 |
| P0 | UI 重写（VideoHome + SubjectDetail + VideoPlayer） | P0 |
| P1 | DmhySource + MikanSource（BT 源） | P0 + WebTorrent |
| P1 | 弹幕系统（DanmakuService + DPlayer 集成） | P0 |
| P1 | LocalCacheSource（IndexedDB 缓存） | P1 BT源 |
| P2 | SakuraSource（樱花动漫 Web 源） | P0 |
| P2 | 源管理 UI 完善（拖拽排序、配置面板） | P0 |
| P2 | 自建弹幕 API（D1 表 + Worker 路由） | P1 |

---

## 12. 与 PRD M-09 的对照

| 原 M-09 规格 | V2 变更 |
| --- | --- |
| 关键词搜索视频 | → Bangumi 条目搜索 + 剧集维度查资源 |
| 仅苹果CMS源 | → WEB + BT + LocalCache 三种源类型 |
| 无匹配度 | → MatchKind EXACT/FUZZY |
| 无弹幕 | → DPlayer 弹幕 + 第三方 API |
| 无 BT | → WebTorrent 浏览器端 BT |
| 无缓存 | → IndexedDB LocalCache |
| 源管理简陋 | → 完整源管理（工厂+配置+测试连接） |
