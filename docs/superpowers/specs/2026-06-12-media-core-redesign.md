# ANISpace 视频区核心层改造 — 设计文档

| 字段 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 编写日期 | 2026-06-12 |
| 改造范围 | `src/services/media/` 核心层 |
| 参考 | [Animeko 审计报告](../AUDIT_REPORT_ANIMEKO.md) |
| 原则 | 完全按照 Animeko 思路，适配当前项目结构，保持 UI 兼容 |

---

## 1. 目标

将 ANISpace 视频区核心层从"基础可用"升级到"与 Animeko 架构对齐"，实现：
- 双集数匹配（ep/sort）
- MediaProperties 强类型化
- SubtitleKind / MediaSourceLocation 概念
- MaybeExcludedMedia 排除原因追踪
- 四阶段 MediaSelector 流水线
- MediaFetcher 增量并发查询

**不改动 UI 组件**，保持 API 向后兼容。

---

## 2. 改造文件清单

| 文件 | 操作 | 关键变更 |
| --- | --- | --- |
| `types.ts` | 重写 | 新增 SubtitleKind、MediaSourceLocation、ExclusionReason、EpisodeKind、MatchMetadata；MediaProperties 强类型化；MediaFetchRequest 增加 episodeEp；Media 增加 location/kind/originalTitle/publishedTime |
| `MatchEngine.ts` | 重写 | 双集数匹配算法、MaybeExcludedMedia、MatchMetadata、过滤规则 |
| `MediaSelector.ts` | 重写 | 有状态类，四阶段流水线，onResults 回调 |
| `MediaFetcher.ts` | 新建 | 并发查询 + 增量合并 |
| `MediaSourceManager.ts` | 修改 | 新增 createFetcher()，保留 fetchAll() 兼容 |
| `initSources.ts` | 小幅修改 | 适配新类型 |
| `sources/MacCMSSource.ts` | 小幅修改 | Media 适配新字段 |
| `sources/DmhySource.ts` | 小幅修改 | Media 适配新字段 |
| `sources/MikanSource.ts` | 小幅修改 | Media 适配新字段 |
| `sources/LocalCacheSource.ts` | 小幅修改 | Media 适配新字段 |

---

## 3. 类型系统设计

### 3.1 新增枚举

```typescript
// 字幕类型
enum SubtitleKind {
  EMBEDDED = 'embedded',           // 内嵌硬字幕
  CLOSED = 'closed',               // 内封软字幕
  EXTERNAL_PROVIDED = 'external_provided',  // 外挂字幕（随资源提供）
  EXTERNAL_DISCOVER = 'external_discover',  // 外挂字幕（需自行匹配）
  CLOSED_OR_EXTERNAL_DISCOVER = 'closed_or_external_discover',
}

// 数据源/资源位置
enum MediaSourceLocation {
  ONLINE = 'online',   // 公网
  LAN = 'lan',         // 局域网
  LOCAL = 'local',     // 本地文件系统
}

// 剧集匹配类型（用于 MatchMetadata）
enum EpisodeMatchKind {
  NONE = 'none',
  EP = 'ep',       // 按季度内集数匹配
  SORT = 'sort',   // 按系列内集数匹配
}

// 条目标题匹配类型
enum SubjectMatchKind {
  EXACT = 'exact',
  FUZZY = 'fuzzy',
}

// 排除原因
enum ExclusionReason {
  SUBJECT_NOT_MATCH = 'subject_not_match',
  EPISODE_NOT_MATCH = 'episode_not_match',
  SUBTITLE_LANGUAGE_FILTERED = 'subtitle_language_filtered',
  RESOLUTION_FILTERED = 'resolution_filtered',
  SUBTITLE_KIND_INCOMPATIBLE = 'subtitle_kind_incompatible',
  UNKNOWN_EPISODE_RANGE = 'unknown_episode_range',
  SINGLE_EPISODE_BT_HIDDEN = 'single_episode_bt_hidden',
}
```

### 3.2 MediaProperties 强类型化

```typescript
interface MediaProperties {
  subjectName?: string;              // 条目名称
  episodeName?: string;              // 剧集名称
  subtitleLanguageIds: string[];     // ["CHS", "CHT", "JPN", "ENG"]
  resolution: string;                // "1080P", "4K", "720P"
  alliance: string;                  // 字幕组名称
  size: FileSize;                    // 文件大小
  subtitleKind?: SubtitleKind;       // 字幕类型
}
```

### 3.3 MediaFetchRequest 增加 episodeEp

```typescript
interface MediaFetchRequest {
  subjectId: string;
  episodeId?: string;
  subjectNames: string[];
  episodeSort: string;       // 系列内集数（如 "26"）
  episodeEp?: string;        // 季度内集数（如 "01"），新增
  episodeName?: string;
}
```

### 3.4 Media 增加字段

```typescript
interface Media {
  mediaId: string;
  sourceId: string;
  title: string;
  originalTitle: string;            // 新增：字幕组发布的原始标题
  publishedTime: number;            // 新增：发布时间戳
  episodeRange?: EpisodeRange;
  download?: MediaDownload;
  location: MediaSourceLocation;    // 新增
  kind: MediaSourceKind;            // 新增
  properties: MediaProperties;      // 强类型化
  extraFiles?: MediaExtraFile[];    // 新增
}
```

### 3.5 新增辅助类型

```typescript
// 匹配元数据
interface MatchMetadata {
  subjectMatchKind: SubjectMatchKind;
  episodeMatchKind: EpisodeMatchKind;
  similarity: number;  // 0-100
}

// 可能被排除的资源
type MaybeExcludedMedia =
  | { type: 'included'; media: Media; matchKind: MatchKind; metadata: MatchMetadata }
  | { type: 'excluded'; media: Media; reason: ExclusionReason };

// 用户偏好
interface MediaPreference {
  preferredAlliance?: string;          // 偏好字幕组
  preferredResolution?: string;        // 偏好分辨率
  preferredSubtitleLanguage?: string;  // 偏好字幕语言
  allowUnsubtitled: boolean;           // 是否允许无字幕资源
  hideSingleEpisodeBT: boolean;        // 是否隐藏完结番单集BT资源
}

// 选择器配置
interface MediaSelectorSettings {
  preference: MediaPreference;
  subjectCompleted: boolean;  // 条目是否已完结
}
```

---

## 4. MatchEngine 设计

### 4.1 双集数匹配算法

核心逻辑：
- 精确匹配条目标题时 → 优先 `ep`，其次 `sort`
- 模糊匹配条目标题时 → 优先 `sort`，其次 `ep`

```typescript
class MatchEngine {
  /**
   * 计算匹配元数据
   */
  static computeMatchMetadata(
    title: string,
    request: MediaFetchRequest,
    episodeRange?: EpisodeRange,
  ): MatchMetadata | null;

  /**
   * 对单个 Media 执行完整过滤，返回 MaybeExcludedMedia
   */
  static filterMedia(
    media: Media,
    request: MediaFetchRequest,
    settings: MediaSelectorSettings,
  ): MaybeExcludedMedia;

  /**
   * 批量过滤
   */
  static filterMediaList(
    list: MediaMatch[],
    request: MediaFetchRequest,
    settings: MediaSelectorSettings,
  ): MaybeExcludedMedia[];

  /**
   * 排序
   */
  static sortMedia(matches: MaybeExcludedMedia[]): MaybeExcludedMedia[];
}
```

### 4.2 过滤规则表

按优先级依次检查：

1. `episodeRange === null` → 排除（UNKNOWN_EPISODE_RANGE）
2. `matchSubject(title, request)` 失败 → 排除（SUBJECT_NOT_MATCH）
3. 字幕语言过滤：settings.preference 不允许无字幕 && subtitleLanguageIds 为空 → 排除
4. 字幕类型不兼容：当前平台不支持该 subtitleKind → 排除
5. 完结番隐藏单集BT：subjectCompleted && kind === BITTORRENT && episodeRange 为单集 → 排除
6. 通过 → Included + MatchMetadata

### 4.3 排序规则

1. EXACT 优先于 FUZZY
2. 相似度高的优先
3. 数据源 tier 低的优先
4. 字幕类型优先级：EMBEDDED > CLOSED > EXTERNAL_PROVIDED > EXTERNAL_DISCOVER

---

## 5. MediaSelector 设计

从静态工具类改为有状态类：

```typescript
class MediaSelector {
  private settings: MediaSelectorSettings;
  private allMedia: MaybeExcludedMedia[] = [];
  private listeners: Set<(results: MediaSelectorState) => void> = new Set();

  constructor(settings: MediaSelectorSettings);

  /** 添加新到达的匹配结果（增量） */
  addMatches(matches: MediaMatch[]): void;

  /** 获取当前包含的（未被排除的）资源 */
  getIncluded(): MediaMatch[];

  /** 获取当前排除的资源 */
  getExcluded(): { media: Media; reason: ExclusionReason }[];

  /** 手动选择 */
  select(mediaId: string): Media | null;

  /** 自动选择默认 */
  trySelectDefault(): Media | null;

  /** 自动选择已缓存的 */
  trySelectCached(): Media | null;

  /** 订阅结果变更 */
  onChange(callback: (state: MediaSelectorState) => void): () => void;

  /** 更新偏好设置 */
  updateSettings(settings: Partial<MediaSelectorSettings>): void;

  /** 销毁 */
  destroy(): void;
}

interface MediaSelectorState {
  included: MediaMatch[];
  excluded: { media: Media; reason: ExclusionReason }[];
  selected: Media | null;
  totalCount: number;
  completedCount: number;
}
```

---

## 6. MediaFetcher 设计

从 `MediaSourceManager` 中拆分并发查询逻辑：

```typescript
class MediaFetcher {
  private manager: MediaSourceManager;
  private request: MediaFetchRequest;
  private selector: MediaSelector;
  private completedSources: Set<string> = new Set();
  private errors: { sourceId: string; error: string }[] = [];

  constructor(
    manager: MediaSourceManager,
    request: MediaFetchRequest,
    selector: MediaSelector,
  );

  /** 开始查询所有已启用源 */
  start(): void;

  /** 等待所有源查询完成 */
  waitForAll(): Promise<void>;

  /** 获取错误列表 */
  getErrors(): { sourceId: string; error: string }[];

  /** 取消 */
  cancel(): void;
}
```

---

## 7. MediaSourceManager 变更

```typescript
class MediaSourceManager {
  // 保持不变
  registerFactory(factory): void;
  getFactories(): MediaSourceFactory[];
  getSource(sourceId): MediaSource | undefined;
  getEnabledSources(): MediaSource[];
  addRegistration(reg): void;
  removeRegistration(sourceId): void;
  toggleSource(sourceId): void;

  // 新增
  createFetcher(request: MediaFetchRequest, settings: MediaSelectorSettings): MediaFetcher;

  // 保留兼容（内部委托给 MediaFetcher + MediaSelector）
  async fetchAll(request: MediaFetchRequest): Promise<{
    results: MediaMatch[];
    errors: { sourceId: string; error: string }[];
  }>;
}
```

---

## 8. 兼容性策略

1. `MediaSource.fetch()` 返回类型不变，仍为 `Promise<PagedResult<MediaMatch>>`
2. `MediaSourceManager.fetchAll()` 保留，行为不变，内部委托给新组件
3. 现有源实现仅需补充 `Media` 的新字段默认值（`originalTitle: ''`, `publishedTime: 0`, `location: ONLINE`, `kind` 等）
4. VideoPlayer 等 UI 组件不需要修改，因为它们通过 `fetchAll` 获取结果
5. `MediaProperties` 从 `Record<string, any>` 变为强类型后，现有代码中访问 `properties.resolution` 等字段不受影响

---

## 9. 实施步骤

1. 重写 `types.ts` — 新增所有枚举和接口
2. 重写 `MatchEngine.ts` — 双集数匹配 + 过滤 + MaybeExcludedMedia
3. 重写 `MediaSelector.ts` — 有状态类 + 四阶段流水线
4. 新建 `MediaFetcher.ts` — 并发查询 + 增量合并
5. 修改 `MediaSourceManager.ts` — 新增 createFetcher，保留 fetchAll
6. 修改 4 个源文件 — 适配新字段
7. 修改 `initSources.ts` — 适配新类型
8. 验证编译通过