# ANISpace 视频区 vs Animeko 架构审计报告

| 字段 | 内容 |
| --- | --- |
| 审计日期 | 2026-06-12 |
| 审计人 | AI Agent |
| 参考项目 | [animeko (open-ani/animeko)](https://github.com/open-ani/animeko) |
| 审计范围 | 视频区核心架构（MediaSource 层、匹配引擎、播放器、弹幕、缓存、BT） |

---

## 1. 总体结论

ANISpace 视频区 V2 的架构设计**明确参考了 Animeko 的 MediaSource 抽象模式**，在核心接口层面（`MediaSource`、`MediaSourceFactory`、`MediaFetchRequest`、`MediaMatch`、`MatchKind`）高度一致。但 Animeko 作为历经多年迭代的 Kotlin Multiplatform 桌面/移动端项目，在以下维度显著领先于 ANISpace 当前实现：

- **数据模型丰富度**（MediaProperties、EpisodeRange、ResourceLocation）
- **匹配与过滤算法深度**（双集数系统 ep/sort、MaybeExcludedMedia、字幕类型过滤）
- **BT/种子引擎成熟度**（自研 Anitorrent vs 第三方 WebTorrent）
- **缓存系统完整性**（多类型缓存引擎 vs 简单 IndexedDB）
- **弹幕源多样性**（6+ 弹幕源 vs 2 个）
- **数据源可扩展性**（SPI 自动发现 + Selector/RSS 通用源 vs 手动注册）

---

## 2. 逐模块对比

### 2.1 平台与技术栈

| 维度 | Animeko | ANISpace |
| --- | --- | --- |
| 语言 | Kotlin (KMP) | TypeScript + React |
| 目标平台 | Android / iOS / Desktop (JVM) | Web (Browser) |
| HTTP 客户端 | ScopedHttpClient (Ktor) | fetch API |
| 播放器 | VLC (Desktop) / 原生 (Android/iOS) | DPlayer + Hls.js |
| 种子引擎 | 自研 Anitorrent (基于 libtorrent) | WebTorrent (第三方 JS) |
| 存储 | 本地文件系统 | IndexedDB + localStorage |

**差异本质**：ANISpace 是纯 Web 应用，受浏览器沙箱限制；Animeko 是原生应用，可访问底层文件系统和网络栈。

---

### 2.2 MediaSource 核心接口层

#### 2.2.1 接口定义一致性

两者遵循相同的核心抽象：

```
MediaSource  →  fetch(MediaFetchRequest)  →  MediaMatch[]  →  Media
     ↑                                                    ↑
MediaSourceFactory.create(config)              MatchKind (EXACT/FUZZY)
```

ANISpace 的 [types.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/types.ts) 基本是 Animeko 的 TypeScript 翻译。

#### 2.2.2 Animeko 独有的增强

| 特性 | Animeko | ANISpace |
| --- | --- | --- |
| `MediaSourceLocation` | Online / Lan / Local 三元组 | 无（仅 download.kind） |
| `MediaSourceTier` | 值类，支持排序 | 简单 number（info.tier） |
| `MediaSourceInfo` | 含 `iconResourceId`（本地资源） | 仅含 URL 字段 |
| `SizedSource<MediaMatch>` | 响应式分页流 | 一次性 `Promise<PagedResult>` |
| `MediaSource.close()` | 继承 `AutoCloseable` | 可选 `close()` |
| `FactoryId` | 值类，类型安全 | 简单 string |
| `MediaSourceConfig` | 含 `serializedArguments`(JSON)、`subscriptionId` | 仅 `arguments: Record<string, string>` |
| SPI 自动发现 | `META-INF/services` 机制 | 无（手动 `initSources.ts`） |

**关键差异**：

1. **Animeko 的 `MediaSourceLocation`** 区分了在线、局域网、本地三种位置，影响播放策略（如 LAN 资源可低延迟直接播放）。ANISpace 缺少此抽象。

2. **Animeko 使用 `SizedSource<MediaMatch>`**（响应式分页流），支持增量返回结果。ANISpace 使用 `Promise<PagedResult>`，是一次性返回，无法流式展示逐步到达的搜索结果。

3. **Animeko 的 SPI 自动发现** 允许新增数据源模块（如 `:datasource:ikaros`）无需修改核心代码即可被识别。ANISpace 需要在 `initSources.ts` 中手动注册每个工厂。

---

### 2.3 Media 数据模型

#### 2.3.1 结构对比

| 字段 | Animeko (`Media`) | ANISpace (`Media`) |
| --- | --- | --- |
| 唯一 ID | `mediaId`（含源前缀） | `mediaId`（含源前缀） |
| 源 ID | `mediaSourceId` | `sourceId` |
| 原始链接 | `originalUrl` | 无（仅 `download.url`） |
| 下载方式 | `download: ResourceLocation`（密封类） | `download: MediaDownload`（简单接口） |
| 原始标题 | `originalTitle` | 无 |
| 发布时间 | `publishedTime` | 无 |
| 剧集范围 | `episodeRange: EpisodeRange?` | `episodeRange?: EpisodeRange` |
| 元数据 | `properties: MediaProperties`（强类型） | `properties: Record<string, any>`（弱类型） |
| 额外文件 | `extraFiles: MediaExtraFiles` | 无 |
| 位置 | `location: MediaSourceLocation` | 无 |
| 类型 | `kind: MediaSourceKind` | 无（在 MediaSource 上） |

#### 2.3.2 Animeko 的 `MediaProperties`（强类型）

```kotlin
data class MediaProperties(
    val subjectName: String?,          // 条目名称
    val episodeName: String?,          // 剧集名称
    val subtitleLanguageIds: List<String>,  // 字幕语言 ["CHS", "CHT"]
    val resolution: String,            // "1080P", "4K"
    val alliance: String,              // 字幕组名称
    val size: FileSize,                // 文件大小
    val subtitleKind: SubtitleKind?,   // 内嵌/内封/外挂
)
```

**ANISpace 的对应实现** (`properties: Record<string, any>`):

```typescript
properties: {
    fileSize,          // 文件大小
    subtitleGroup,     // 字幕组
    tier,              // 源优先级
    // ... 其他随意字段
}
```

**关键差异**：

1. **Animeko 的 `SubtitleKind`**（`EMBEDDED`/`CLOSED`/`EXTERNAL_PROVIDED`/`EXTERNAL_DISCOVER`）是影响播放器选择的关键属性。ANISpace 完全没有字幕类型概念。

2. **Animeko 的 `subtitleLanguageIds`** 支持多字幕语言，且在 UI 中有本地化显示。ANISpace 无此能力。

3. **Animeko 的 `FileSize`** 是强类型值类，支持 `Unspecified`/`Zero` 等语义。ANISpace 使用字符串。

4. **Animeko 的 `Media` 是 sealed interface**，分为 `DefaultMedia`（网络源）和 `CachedMedia`（本地缓存包装），后者通过 `by origin` 委托模式复用原始 Media 属性。ANISpace 无此区分。

---

### 2.4 MediaFetchRequest

| 字段 | Animeko | ANISpace |
| --- | --- | --- |
| 条目 ID | `subjectId: String` | `subjectId: string` |
| 剧集 ID | `episodeId: String` | `episodeId?: string` |
| 条目名称列表 | `subjectNames: List<String>` | `subjectNames: string[]` |
| 中文名 | `subjectNameCN: String?`（软弃用） | 无（混在 subjectNames 中） |
| 系列内集数 | `episodeSort: EpisodeSort` | `episodeSort: string` |
| 季度内集数 | `episodeEp: EpisodeSort?` | **无** |
| 剧集名称 | `episodeName: String` | `episodeName?: string` |

**关键差异**：

**Animeko 拥有 `episodeEp`（季度内集数）**，这是 Animeko 匹配系统最关键的特性之一。ANISpace 完全缺失 `episodeEp` 概念。

这直接影响分割放送（split-cour）场景的匹配精度。详见下文 2.5 节。

---

### 2.5 匹配引擎（MatchEngine / MediaSelector）

这是两者差距最大的模块。

#### 2.5.1 Animeko 的匹配系统

Animeko 的 MediaSelector 是一个**四阶段流水线**：

```
过滤(Filter) → 排序(Sort) → 偏好(Preference) → 选择(Select)
```

**阶段 1：过滤** — 独立评估每个 Media，返回 `MaybeExcludedMedia`（含排除原因）：

```kotlin
sealed class MaybeExcludedMedia {
    class Included(val media: Media, val metadata: MatchMetadata)  // 含相似度等
    class Excluded(val media: Media, val reason: ExclusionReason)
}
```

`MatchMetadata` 包含：
- `subjectMatchKind: SubjectMatchKind`（FUZZY / EXACT）
- `episodeMatchKind: EpisodeMatchKind`（NONE / EP / SORT）
- `similarity: Int`（0-100 相似度）

**双集数匹配算法**（ep vs sort）：

这是 Animeko 最具特色的设计。对于分割放送（如"无职转生 第2部分"），数据源可能返回：
- Q1: "无职转生" (01~11) + "无职转生 第2部分" (01~12)
- Q2: "无职转生" (01~11) + "无职转生 第2部分" (12~23)
- Q3: "无职转生" (01~23)

匹配优先级：
- 精确匹配条目标题时 → 优先 `ep`，其次 `sort`
- 模糊匹配条目标题时 → 优先 `sort`，其次 `ep`

**阶段 2：排序** — 按数据源 tier、字幕类型等排序。

**阶段 3：偏好** — 根据用户偏好（如"只选桜都字幕组"）过滤。

**阶段 4：选择** — `trySelectDefault`、`trySelectCached`、`trySelectFromMediaSources` 自动选择。

结果通过 `selected: StateFlow<Media>` 和 `events` Flow 广播。

#### 2.5.2 ANISpace 的匹配系统

ANISpace 的 [MatchEngine.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/MatchEngine.ts) 实现了基础的匹配：

```typescript
static matchSubject(title, request)   // 标题包含匹配
static matchEpisode(title, sort)      // 正则集数匹配
static computeMatchKind(title, request, episodeRange)  // EXACT/FUZZY
static sortMatches(matches)           // EXACT 优先 + tier 排序
```

[MediaSelector.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/MediaSelector.ts) 仅提供三个简单方法：
```typescript
static selectBest(matches)       // 返回排序后的第一个
static groupBySource(matches)    // 按源分组
static filterByMatchKind(matches, kind)  // 按匹配度过滤
```

#### 2.5.3 差距总结

| 能力 | Animeko | ANISpace |
| --- | --- | --- |
| 双集数匹配 (ep/sort) | 支持 | **不支持** |
| 排除原因追踪 | `ExclusionReason` 枚举 | 无 |
| 相似度评分 | 0-100 数值 | 无 |
| 过滤规则列表 | 6+ 条规则（字幕语言、分辨率、完结隐藏等） | 0 条（仅匹配/不匹配） |
| 用户偏好持久化 | 支持（字幕组、分辨率等偏好） | 不支持 |
| 自动选择 | `trySelectDefault` / `trySelectCached` | 手动选第一个 EXACT |
| 响应式结果 | `StateFlow` + `Flow` 事件 | 一次性 Promise |
| 增量结果 | 支持（逐源返回） | `Promise.allSettled` 一次性 |

---

### 2.6 BT/种子系统

| 维度 | Animeko | ANISpace |
| --- | --- | --- |
| 引擎 | 自研 Anitorrent（基于 C/C++ libtorrent） | WebTorrent（JS 库） |
| 架构 | `TorrentDownloader` → `TorrentSession` → `TorrentFileEntry` | `new WebTorrent()` → `client.add()` |
| 文件级控制 | `TorrentFilePieceMatcher` 精确选择文件 | `files.sort((a,b) => b.length - a.length)[0]` 取最大文件 |
| Peer 管理 | `PeerInfo` / `PeerFilter` 完整 API | 无 |
| 下载统计 | `TorrentSession.Stats`（Flow 实时推送） | 简单 `torrent.progress` 轮询 |
| 云下载 | PikPak 集成 | 无 |
| 跨平台 | Android/iOS/Desktop 统一 API | 仅浏览器 |

**关键差异**：

1. **Animeko 的自研 BT 引擎**提供文件级别的精确控制（`TorrentFilePieceMatcher`），可以只下载种子中的特定文件。ANISpace 的 WebTorrent 只能取最大文件。

2. **Animeko 的 `TorrentSession`** 使用 `Flow` 实时推送下载统计，频率可控。ANISpace 的事件监听粒度较粗。

3. **Animeko 支持 PikPak 云下载**，可以直接将磁力链接提交到云端，无需本地下载。ANISpace 无此能力。

---

### 2.7 缓存系统

| 维度 | Animeko | ANISpace |
| --- | --- | --- |
| 缓存类型 | BT（磁力/种子）、HTTP（MP4）、HLS（M3U8） | 仅 Blob 级别 |
| 引擎 | `MediaCacheEngine` + `HttpDownloader` + `Anitorrent` | IndexedDB |
| 数据模型 | `CachedMedia` wrapping `DefaultMedia` | `CachedMedia` 独立类型 |
| 缓存粒度 | 文件级（可缓存单集） | 整 Blob |
| 缓存管理 | `MediaCacheManager`（专用 UI） | `saveMediaToCache` / `getCachedMedia` 辅助函数 |
| 离线检测 | 原生网络状态 | 无 |

**关键差异**：

1. **Animeko 的缓存是多引擎的**：BT 资源通过 Anitorrent 下载后缓存，HTTP/HLS 通过 `HttpDownloader` 缓存。ANISpace 仅支持手动将 Blob 存入 IndexedDB。

2. **Animeko 的 `CachedMedia` 使用委托模式**（`Media by origin`），保留原始 `DefaultMedia` 的所有属性，仅覆盖 `download`、`location` 等缓存相关字段。ANISpace 的 `CachedMedia` 是独立类型，不继承原始 Media 信息。

---

### 2.8 弹幕系统

| 维度 | Animeko | ANISpace |
| --- | --- | --- |
| 弹幕源 | Animeko、AcFun、Baha、Bilibili、Dandanplay、Tucao（6个） | DanDanPlay、SelfBuilt（2个） |
| 弹幕数据模型 | `DanmakuInfo` + `DanmakuContent`（含 `DanmakuLocation` 枚举） | 简单 `DanmakuItem` 接口 |
| 弹幕位置 | `TOP` / `BOTTOM` / `NORMAL`（类型安全） | `0` / `1` / `2`（魔数） |
| 服务标识 | `DanmakuServiceId` 值类 | 字符串 `name` |
| 发送弹幕 | 支持（多源） | 仅 SelfBuilt 支持，DanDanPlay 返回 false |
| 缓存 | 无 | 10 分钟内存缓存 |

**关键差异**：

1. **Animeko 支持 6 个弹幕源**，包括 AcFun、Baha、Bilibili 等大型平台。ANISpace 仅 2 个。

2. **Animeko 的 `DanmakuLocation`** 是枚举类型，类型安全。ANISpace 使用魔数 `0/1/2`。

---

### 2.9 播放器架构

| 维度 | Animeko | ANISpace |
| --- | --- | --- |
| 桌面端 | VLC 集成（libvlc） | DPlayer + Hls.js |
| 移动端 | 原生播放器 | 浏览器原生 `<video>` |
| 视频源解析 | `VideoSourceResolver`（抽象层） | 直接根据 `download.kind` 分支 |
| 字幕渲染 | 原生 ASS/SSA 支持 | 无 |
| 弹幕渲染 | 自研 Danmaku UI 模块 | DPlayer 内置弹幕 |

**关键差异**：

1. **Animeko 有 `VideoSourceResolver` 抽象层**，将 `Media.download` 解析为播放器可用的视频数据。ANISpace 在 `VideoPlayer.jsx` 中直接根据 `download.kind` 写 `if/else` 逻辑。

2. **Animeko 桌面端使用 VLC**，支持 ASS/SSA 字幕渲染。ANISpace 的 Web 端无原生字幕支持。

---

### 2.10 数据源可扩展性

| 维度 | Animeko | ANISpace |
| --- | --- | --- |
| 新增源方式 | 编写模块 → SPI 注册 → 自动发现 | 编写 TS 文件 → `initSources.ts` 手动注册 |
| 通用源模板 | `SelectorMediaSource`（CSS Selector）、`RssMediaSource`（RSS） | 无 |
| 用户自建源 | 支持（在 APP 内配置 Selector/RSS 源） | 仅支持添加 MacCMS 实例 |
| 源订阅 | 支持（`subscriptionId`） | 无 |
| 源参数 | `MediaSourceParameters`（强类型 + 序列化） | `SourceParameter[]`（简单定义） |

**关键差异**：

1. **Animeko 的 `SelectorMediaSource`** 允许用户通过 CSS Selector 配置即可接入任意视频网站，无需编写代码。ANISpace 无此机制。

2. **Animeko 的源订阅系统** 允许用户订阅社区维护的数据源列表，自动更新。ANISpace 无此能力。

---

### 2.11 数据流架构

#### Animeko

```
MediaSourceManager (初始化所有源)
       ↓
MediaFetcher (并发查询所有源，逐源合并结果)
       ↓
MediaSelector (过滤 → 排序 → 偏好 → 选择)
       ↓ (selected: StateFlow<Media>)
VideoSourceResolver (解析 Media → 可播放数据)
       ↓
Player (VLC / 原生播放器)
```

#### ANISpace

```
MediaSourceManager.fetchAll (Promise.allSettled 并发)
       ↓
MatchEngine.sortMatches (排序)
       ↓
VideoPlayer 组件 (直接在 useEffect 中取第一个匹配)
       ↓
DPlayer / Hls.js / WebTorrent
```

**关键差异**：

1. **Animeko 有 `MediaFetcher` 中间层**，负责并发查询和增量结果合并。ANISpace 的 `MediaSourceManager.fetchAll` 直接使用 `Promise.allSettled`，合并逻辑内嵌在 Manager 中。

2. **Animeko 的 MediaSelector 是独立的、可组合的组件**，通过 `StateFlow` 响应式广播结果。ANISpace 的 MediaSelector 仅提供静态工具方法。

3. **Animeko 有 `VideoSourceResolver`** 作为 Media 和播放器之间的适配层。ANISpace 在 VideoPlayer 组件中直接处理。

---

## 3. 优先级建议

### 3.1 高优先级 — 建议尽快改进

| 序号 | 改进项 | 原因 | 影响 |
| --- | --- | --- | --- |
| 1 | **增加 `episodeEp` 支持** | 分割放送季的匹配在无此字段时准确率极低 | 匹配精度 |
| 2 | **MediaProperties 强类型化** | 当前 `Record<string, any>` 导致字幕语言、分辨率等过滤不可实现 | 过滤能力 |
| 3 | **增加 `MediaSourceLocation` 概念** | 未来若有局域网源（Jellyfin/Emby）将无法区分 | 扩展性 |
| 4 | **增加 `SubtitleKind` 概念** | 无字幕类型区分导致无法过滤不兼容的播放格式 | 播放兼容性 |

### 3.2 中优先级 — 建议后续迭代

| 序号 | 改进项 | 原因 | 影响 |
| --- | --- | --- | --- |
| 5 | **MediaFetcher 中间层** | 解耦 Manager 的查询和结果合并职责 | 架构清晰度 |
| 6 | **增量结果返回** | 当前 `Promise.allSettled` 必须等所有源完成才能展示 | 用户体验 |
| 7 | **排除原因追踪（MaybeExcludedMedia）** | 用户无法知道为什么某个资源被过滤 | 调试体验 |
| 8 | **用户偏好持久化** | 无法记住用户喜欢的字幕组/分辨率 | 个性化 |
| 9 | **DanmakuLocation 枚举化** | 魔数 0/1/2 可读性差 | 代码质量 |

### 3.3 低优先级 — 长期愿景

| 序号 | 改进项 | 原因 | 影响 |
| --- | --- | --- | --- |
| 10 | **通用 Selector/RSS 源模板** | 受限于 Web 端无法直接访问第三方 HTML，需要 Worker 代理 | 可扩展性 |
| 11 | **源订阅机制** | 需要后端服务支持 | 可扩展性 |
| 12 | **VideoSourceResolver 适配层** | 当前架构足够简单，但未来扩展时可能需要 | 架构 |
| 13 | **自研 BT 引擎** | 浏览器环境受限于 WebTorrent，改进空间有限 | 平台限制 |

---

## 4. 架构优势总结

### 4.1 ANISpace 做得好的地方

1. **核心接口设计正确**：`MediaSource`/`MediaSourceFactory`/`MediaFetchRequest`/`MediaMatch`/`MatchKind` 的抽象与 Animeko 一致，方向正确。

2. **源工厂模式**：`allowMultipleInstances` + `SourceParameter[]` 的设计使得 MacCMS 源可以灵活添加多个实例。

3. **Worker 代理架构**：利用 Cloudflare Worker 解决 CORS 和跨域问题，是 Web 端的最佳实践。

4. **DPlayer 集成**：m3u8 使用 Hls.js 直接播放，非 m3u8 使用 DPlayer，分离合理。

5. **播放进度记忆**：localStorage 保存/恢复播放进度，实现简洁有效。

6. **代码简洁**：相比 Animeko 的 Kotlin 多层抽象，ANISpace 的代码更易理解。

### 4.2 Animeko 的核心优势（ANISpace 可借鉴）

1. **双集数匹配系统**：`ep` + `sort` 的匹配算法是分割放送场景的刚需。
2. **MaybeExcludedMedia 追踪**：每个被排除的资源都有明确原因，便于调试和用户理解。
3. **MediaProperties 强类型**：字幕语言、字幕类型、分辨率等字段的类型安全保证过滤逻辑正确。
4. **响应式数据流**：`StateFlow` + `Flow` 使得 UI 可以实时响应搜索结果变化。
5. **SPI 自动发现**：新增数据源模块无需修改核心代码。
6. **通用源模板**：`SelectorMediaSource` 和 `RssMediaSource` 使得用户无需编程即可接入新源。

---

## 5. 附录：文件对应关系

| Animeko 文件 | ANISpace 对应文件 | 功能 |
| --- | --- | --- |
| `datasource/api/.../Media.kt` | `services/media/types.ts` | Media 数据模型 |
| `datasource/api/.../source/MediaSource.kt` | `services/media/types.ts` (MediaSource 接口) | 数据源接口 |
| `datasource/api/.../source/MediaSourceFactory.kt` | `services/media/types.ts` (MediaSourceFactory 接口) | 数据源工厂 |
| `datasource/api/.../source/MediaFetchRequest.kt` | `services/media/types.ts` (MediaFetchRequest) | 查询请求 |
| `datasource/api/.../source/MediaMatch.kt` | `services/media/types.ts` (MediaMatch) | 匹配结果 |
| `datasource/api/.../source/MediaSourceKind.kt` | `services/media/types.ts` (MediaSourceKind) | 源类型枚举 |
| `datasource/api/.../source/HttpMediaSource.kt` | 无（ANISpace 无此抽象） | HTTP 源基类 |
| `datasource/web/web-base/.../WebMediaSource.kt` | 无 | Web 源基类 |
| `app/.../MediaSelectorFilterSortAlgorithm.kt` | `services/media/MatchEngine.ts` + `MediaSelector.ts` | 过滤/排序算法 |
| `app/.../MaybeExcludedMedia.kt` | 无 | 排除原因追踪 |
| `app/.../MediaFetcher` | `MediaSourceManager.fetchAll()` | 多源并发查询 |
| `torrent/api/.../TorrentSession.kt` | `webtorrent` (第三方) | BT 下载会话 |
| `torrent/api/.../TorrentDownloader.kt` | `webtorrent` (第三方) | BT 下载管理器 |
| `danmaku/api/.../DanmakuInfo.kt` | `services/media/DanmakuService.ts` | 弹幕数据模型 |
| `ui-mediaselect/.../MediaSelectorView.kt` | `components/Video/VideoPlayer.jsx` (资源切换面板) | 资源选择 UI |
| `video-player/api/` | `components/Video/VideoPlayer.jsx` | 播放器 |
| 无 Animeko 对应（Animeko 无 Worker 层） | `worker/oauth-proxy.js` | CORS 代理 |