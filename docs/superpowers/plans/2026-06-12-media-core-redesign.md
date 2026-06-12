# ANISpace 视频区核心层改造 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ANISpace 视频区核心层（types、MatchEngine、MediaSelector、MediaFetcher、MediaSourceManager、4个源）按照 Animeko 架构全面升级，实现双集数匹配、强类型 MediaProperties、MaybeExcludedMedia 排除追踪、四阶段选择器流水线。

**Architecture:** 纯核心层改造，不改动 UI 组件。新增 MediaFetcher 中间层剥离并发查询逻辑；重写 MatchEngine 和 MediaSelector 为完整流水线；MediaSourceManager 保留 fetchAll 兼容层。所有改动的 API 保持向后兼容。

**Tech Stack:** TypeScript，无新增依赖。

**参考文档:** [设计文档](../specs/2026-06-12-media-core-redesign.md), [审计报告](../AUDIT_REPORT_ANIMEKO.md)

---

## 文件结构

| 文件 | 操作 | 职责 |
| --- | --- | --- |
| `src/services/media/types.ts` | 重写 | 所有类型/枚举定义 |
| `src/services/media/MatchEngine.ts` | 重写 | 匹配算法 + 过滤规则 + 排序 |
| `src/services/media/MediaSelector.ts` | 重写 | 有状态选择器，四阶段流水线 |
| `src/services/media/MediaFetcher.ts` | 新建 | 并发查询 + 增量合并 |
| `src/services/media/MediaSourceManager.ts` | 修改 | 新增 createFetcher，保留 fetchAll |
| `src/services/media/initSources.ts` | 修改 | 适配新类型 |
| `src/services/media/sources/MacCMSSource.ts` | 修改 | Media 适配新字段 |
| `src/services/media/sources/DmhySource.ts` | 修改 | Media 适配新字段 |
| `src/services/media/sources/MikanSource.ts` | 修改 | Media 适配新字段 |
| `src/services/media/sources/LocalCacheSource.ts` | 修改 | Media 适配新字段 |

---

### Task 1: 重写 types.ts — 新增所有枚举和类型

**Files:**
- Modify: `src/services/media/types.ts`

- [ ] **Step 1: 重写 types.ts 完整内容**

用以下完整内容替换 [types.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/types.ts)：

```typescript
// src/services/media/types.ts
// 影视区 V2 核心类型定义 — 参考 Animeko MediaSource 架构
// v2.1: 对齐 Animeko 强类型模型

// ==================== 枚举 ====================

export enum MediaSourceKind {
  WEB = 'web',
  BITTORRENT = 'bittorrent',
  LOCAL_CACHE = 'local_cache',
}

export enum MatchKind {
  EXACT = 'exact',
  FUZZY = 'fuzzy',
}

export enum ConnectionStatus {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
  TIMEOUT = 'timeout',
}

/** 字幕类型 — 参考 Animeko SubtitleKind */
export enum SubtitleKind {
  /** 内嵌硬字幕，直接嵌入视频画面，无法通过播放器隐藏 */
  EMBEDDED = 'embedded',
  /** 内封软字幕，嵌入视频文件字幕轨道，播放器可开关 */
  CLOSED = 'closed',
  /** 外挂字幕（随资源提供） */
  EXTERNAL_PROVIDED = 'external_provided',
  /** 外挂字幕（需播放器自行匹配） */
  EXTERNAL_DISCOVER = 'external_discover',
  /** 可能是内封或外挂 */
  CLOSED_OR_EXTERNAL_DISCOVER = 'closed_or_external_discover',
}

/** 数据源/资源存放位置 — 参考 Animeko MediaSourceLocation */
export enum MediaSourceLocation {
  ONLINE = 'online',
  LAN = 'lan',
  LOCAL = 'local',
}

/** 剧集匹配方式 — 参考 Animeko EpisodeMatchKind */
export enum EpisodeMatchKind {
  NONE = 'none',
  EP = 'ep',       // 按季度内集数匹配
  SORT = 'sort',   // 按系列内集数匹配
}

/** 条目标题匹配方式 */
export enum SubjectMatchKind {
  EXACT = 'exact',
  FUZZY = 'fuzzy',
}

/** 资源排除原因 — 参考 Animeko ExclusionReason */
export enum ExclusionReason {
  SUBJECT_NOT_MATCH = 'subject_not_match',
  EPISODE_NOT_MATCH = 'episode_not_match',
  SUBTITLE_LANGUAGE_FILTERED = 'subtitle_language_filtered',
  RESOLUTION_FILTERED = 'resolution_filtered',
  SUBTITLE_KIND_INCOMPATIBLE = 'subtitle_kind_incompatible',
  UNKNOWN_EPISODE_RANGE = 'unknown_episode_range',
  SINGLE_EPISODE_BT_HIDDEN = 'single_episode_bt_hidden',
}

// ==================== 数据源相关 ====================

export interface MediaSourceInfo {
  displayName: string;
  description?: string;
  websiteUrl?: string;
  iconUrl?: string;
  isSpecial?: boolean;
  tier?: number;
}

export interface MediaSource {
  readonly sourceId: string;
  readonly kind: MediaSourceKind;
  readonly info: MediaSourceInfo;
  checkConnection(): Promise<ConnectionStatus>;
  fetch(request: MediaFetchRequest): Promise<PagedResult<MediaMatch>>;
  close?(): void;
}

export interface MediaSourceFactory {
  readonly factoryId: string;
  readonly allowMultipleInstances: boolean;
  readonly parameters: SourceParameter[];
  readonly info: MediaSourceInfo;
  create(sourceId: string, config: SourceConfig): MediaSource;
}

export interface SourceConfig {
  arguments: Record<string, string | undefined>;
  serializedArguments?: any;
}

export interface SourceParameter {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: any;
  options?: { label: string; value: string }[];
  required?: boolean;
}

// ==================== 查询请求 ====================

export interface MediaFetchRequest {
  subjectId: string;
  episodeId?: string;
  subjectNames: string[];
  /** 系列内集数（如 "26"），对应 Animeko episodeSort */
  episodeSort: string;
  /** 季度内集数（如 "01"），对应 Animeko episodeEp。分割放送场景的关键字段 */
  episodeEp?: string;
  episodeName?: string;
}

// ==================== 资源实体 ====================

/** 强类型资源属性 — 参考 Animeko MediaProperties */
export interface MediaProperties {
  /** 条目名称（数据源提供的） */
  subjectName?: string;
  /** 剧集名称（数据源提供的） */
  episodeName?: string;
  /** 字幕语言列表，建议值: "CHS", "CHT", "JPN", "ENG" */
  subtitleLanguageIds: string[];
  /** 分辨率，建议值: "720P", "1080P", "2K", "4K" */
  resolution: string;
  /** 字幕组名称 / 线路名称 */
  alliance: string;
  /** 文件大小 */
  size: FileSize;
  /** 字幕类型 */
  subtitleKind?: SubtitleKind;
  /** 数据源优先级（tier） */
  tier?: number;
  /** 额外属性（兼容旧代码） */
  [key: string]: any;
}

export interface FileSize {
  value: number;
  unit: string;  // "B", "KB", "MB", "GB", "TB"
}

export const FileSize = {
  Unspecified: { value: 0, unit: '' } as FileSize,
  Zero: { value: 0, unit: 'B' } as FileSize,
  of(value: number, unit: string): FileSize {
    return { value, unit };
  },
};

export interface Media {
  mediaId: string;
  sourceId: string;
  title: string;
  /** 字幕组发布的原始标题 — 参考 Animeko originalTitle */
  originalTitle: string;
  /** 发布时间，毫秒时间戳，0 表示不支持 */
  publishedTime: number;
  episodeRange?: EpisodeRange;
  download?: MediaDownload;
  /** 资源位置 — 参考 Animeko MediaSourceLocation */
  location: MediaSourceLocation;
  /** 资源类型 — 参考 Animeko MediaSourceKind */
  kind: MediaSourceKind;
  properties: MediaProperties;
  /** 额外文件（如外挂字幕） */
  extraFiles?: MediaExtraFile[];
}

export interface EpisodeRange {
  sort: string;
  ep?: string;
  name?: string;
}

export interface MediaDownload {
  kind: 'http' | 'magnet' | 'torrent' | 'local';
  url: string;
  headers?: Record<string, string>;
}

export interface MediaExtraFile {
  name: string;
  url: string;
  kind: 'subtitle' | 'font' | 'other';
}

// ==================== 匹配结果 ====================

export interface MediaMatch {
  media: Media;
  matchKind: MatchKind;
}

/** 匹配元数据 — 参考 Animeko MatchMetadata */
export interface MatchMetadata {
  subjectMatchKind: SubjectMatchKind;
  episodeMatchKind: EpisodeMatchKind;
  /** 条目名称相似度 0-100 */
  similarity: number;
}

/** 可能被排除的资源 — 参考 Animeko MaybeExcludedMedia */
export type MaybeExcludedMedia =
  | { type: 'included'; media: Media; matchKind: MatchKind; metadata: MatchMetadata }
  | { type: 'excluded'; media: Media; reason: ExclusionReason };

// ==================== 用户偏好 ====================

/** 用户偏好 — 参考 Animeko MediaPreference */
export interface MediaPreference {
  /** 偏好字幕组 */
  preferredAlliance?: string;
  /** 偏好分辨率 */
  preferredResolution?: string;
  /** 偏好字幕语言 */
  preferredSubtitleLanguage?: string;
  /** 是否允许无字幕资源 */
  allowUnsubtitled: boolean;
  /** 是否隐藏完结番单集BT资源 */
  hideSingleEpisodeBT: boolean;
}

export const DEFAULT_MEDIA_PREFERENCE: MediaPreference = {
  allowUnsubtitled: false,
  hideSingleEpisodeBT: true,
};

/** 选择器设置 — 参考 Animeko MediaSelectorSettings */
export interface MediaSelectorSettings {
  preference: MediaPreference;
  /** 条目是否已完结（用于隐藏单集BT规则） */
  subjectCompleted: boolean;
}

/** 选择器状态 */
export interface MediaSelectorState {
  included: MediaMatch[];
  excluded: { media: Media; reason: ExclusionReason }[];
  selected: Media | null;
  totalCount: number;
  completedCount: number;
}

// ==================== 分页 ====================

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pagecount: number;
  hasMore: boolean;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```powershell
npx tsc --noEmit src/services/media/types.ts
```

预期：无类型错误。

---

### Task 2: 重写 MatchEngine.ts — 双集数匹配 + 过滤 + MaybeExcludedMedia

**Files:**
- Modify: `src/services/media/MatchEngine.ts`

- [ ] **Step 1: 重写 MatchEngine.ts 完整内容**

用以下完整内容替换 [MatchEngine.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/MatchEngine.ts)：

```typescript
// src/services/media/MatchEngine.ts
// 匹配引擎 — 参考 Animeko MediaSelectorFilterSortAlgorithm
import {
  MatchKind,
  SubjectMatchKind,
  EpisodeMatchKind,
  ExclusionReason,
  MediaFetchRequest,
  MediaMatch,
  Media,
  MaybeExcludedMedia,
  MatchMetadata,
  MediaSelectorSettings,
  SubtitleKind,
  MediaSourceKind,
  MediaPreference,
  EpisodeRange,
} from './types';

export class MatchEngine {
  // ==================== 基础匹配 ====================

  /**
   * 判断标题是否匹配请求中的条目名称。
   * 返回匹配类型和相似度。
   */
  static matchSubject(
    title: string,
    request: MediaFetchRequest,
  ): { kind: SubjectMatchKind; similarity: number } | null {
    const lowerTitle = title.toLowerCase();

    for (const name of request.subjectNames) {
      const lowerName = name.toLowerCase();
      if (lowerTitle === lowerName) {
        return { kind: SubjectMatchKind.EXACT, similarity: 100 };
      }
      if (lowerTitle.includes(lowerName)) {
        // 相似度 = 名称长度 / 标题长度 * 100，但有上限
        const sim = Math.min(95, Math.round((lowerName.length / lowerTitle.length) * 100));
        return { kind: SubjectMatchKind.FUZZY, similarity: sim };
      }
    }
    return null;
  }

  /**
   * 判断标题中是否包含指定集数。
   * 支持 01、第1集、EP01、#01 等格式。
   */
  static matchEpisode(title: string, episodeSort: string): boolean {
    const sort = episodeSort.padStart(2, '0');
    const numSort = String(parseInt(sort, 10));
    const patterns = [
      new RegExp(`[^0-9]${sort}[^0-9]`),
      new RegExp(`第${sort}集`),
      new RegExp(`第${numSort}集`),
      new RegExp(`EP${sort}`, 'i'),
      new RegExp(`\\b${sort}\\b`),
      new RegExp(`\\b${numSort}\\b`),
      new RegExp(`#${sort}\\b`),
      new RegExp(`#${numSort}\\b`),
    ];
    return patterns.some(p => p.test(title));
  }

  // ==================== 双集数匹配 (ep/sort) — 参考 Animeko ====================

  /**
   * 计算剧集匹配方式。
   *
   * 双集数匹配算法：对于分割放送（split-cour）场景，
   * 数据源可能使用季度内集数（ep）或系列内集数（sort）。
   * - 精确匹配标题时 → 优先 ep，其次 sort
   * - 模糊匹配标题时 → 优先 sort，其次 ep
   */
  static computeEpisodeMatchKind(
    title: string,
    episodeRange: EpisodeRange | undefined,
    request: MediaFetchRequest,
    subjectMatchKind: SubjectMatchKind,
  ): EpisodeMatchKind {
    if (!episodeRange) return EpisodeMatchKind.NONE;

    const ep = request.episodeEp || request.episodeSort;
    const sort = request.episodeSort;

    if (subjectMatchKind === SubjectMatchKind.EXACT) {
      // 精确匹配：优先 ep 匹配
      if (ep && episodeRange.ep && episodeRange.ep === ep) {
        return EpisodeMatchKind.EP;
      }
      if (episodeRange.sort === ep) {
        return EpisodeMatchKind.EP;
      }
      if (sort && episodeRange.sort === sort) {
        return EpisodeMatchKind.SORT;
      }
    } else {
      // 模糊匹配：优先 sort 匹配
      if (sort && episodeRange.sort === sort) {
        return EpisodeMatchKind.SORT;
      }
      if (ep && episodeRange.ep && episodeRange.ep === ep) {
        return EpisodeMatchKind.EP;
      }
      if (ep && episodeRange.sort === ep) {
        return EpisodeMatchKind.EP;
      }
    }

    // 最后尝试标题中匹配集数
    if (this.matchEpisode(title, sort || ep)) {
      return EpisodeMatchKind.SORT;
    }

    return EpisodeMatchKind.NONE;
  }

  // ==================== 匹配度计算 ====================

  /**
   * 计算匹配元数据 — 参考 Animeko MatchMetadata
   */
  static computeMatchMetadata(
    title: string,
    request: MediaFetchRequest,
    episodeRange?: EpisodeRange,
  ): MatchMetadata | null {
    const subjectResult = this.matchSubject(title, request);
    if (!subjectResult) return null;

    const episodeMatchKind = this.computeEpisodeMatchKind(
      title, episodeRange, request, subjectResult.kind,
    );

    return {
      subjectMatchKind: subjectResult.kind,
      episodeMatchKind,
      similarity: subjectResult.similarity,
    };
  }

  /**
   * 根据 MatchMetadata 决定 MatchKind
   */
  static matchKindFromMetadata(metadata: MatchMetadata): MatchKind {
    if (
      metadata.subjectMatchKind === SubjectMatchKind.EXACT &&
      metadata.episodeMatchKind !== EpisodeMatchKind.NONE
    ) {
      return MatchKind.EXACT;
    }
    if (metadata.episodeMatchKind === EpisodeMatchKind.EP) {
      return MatchKind.EXACT;
    }
    return MatchKind.FUZZY;
  }

  // ==================== 过滤规则 — 参考 Animeko filterMedia ====================

  /**
   * 对单个 Media 执行完整过滤，返回 MaybeExcludedMedia。
   * 参考 Animeko MediaSelectorFilterSortAlgorithm.filterMedia
   */
  static filterMedia(
    media: Media,
    metadata: MatchMetadata | null,
    settings: MediaSelectorSettings,
  ): MaybeExcludedMedia {
    const pref = settings.preference;

    // 规则 1: 剧集范围未知
    if (!media.episodeRange) {
      return { type: 'excluded', media, reason: ExclusionReason.UNKNOWN_EPISODE_RANGE };
    }

    // 规则 2: 条目标题不匹配
    if (!metadata) {
      return { type: 'excluded', media, reason: ExclusionReason.SUBJECT_NOT_MATCH };
    }

    // 规则 3: 剧集不匹配
    if (metadata.episodeMatchKind === EpisodeMatchKind.NONE) {
      return { type: 'excluded', media, reason: ExclusionReason.EPISODE_NOT_MATCH };
    }

    // 规则 4: 字幕语言过滤
    if (!pref.allowUnsubtitled && media.properties.subtitleLanguageIds.length === 0) {
      return { type: 'excluded', media, reason: ExclusionReason.SUBTITLE_LANGUAGE_FILTERED };
    }
    if (pref.preferredSubtitleLanguage && media.properties.subtitleLanguageIds.length > 0) {
      if (!media.properties.subtitleLanguageIds.includes(pref.preferredSubtitleLanguage)) {
        return { type: 'excluded', media, reason: ExclusionReason.SUBTITLE_LANGUAGE_FILTERED };
      }
    }

    // 规则 5: 字幕类型不兼容（Web 端：外挂字幕不支持）
    if (media.properties.subtitleKind === SubtitleKind.EXTERNAL_DISCOVER) {
      return { type: 'excluded', media, reason: ExclusionReason.SUBTITLE_KIND_INCOMPATIBLE };
    }

    // 规则 6: 完结番隐藏单集BT资源
    if (
      settings.subjectCompleted &&
      pref.hideSingleEpisodeBT &&
      media.kind === MediaSourceKind.BITTORRENT &&
      media.episodeRange.ep === media.episodeRange.sort &&
      !media.episodeRange.ep?.includes('-') // 不是范围
    ) {
      return { type: 'excluded', media, reason: ExclusionReason.SINGLE_EPISODE_BT_HIDDEN };
    }

    // 通过所有过滤
    return {
      type: 'included',
      media,
      matchKind: this.matchKindFromMetadata(metadata),
      metadata,
    };
  }

  /**
   * 批量过滤 MediaMatch 列表
   */
  static filterMediaList(
    matches: MediaMatch[],
    request: MediaFetchRequest,
    settings: MediaSelectorSettings,
  ): MaybeExcludedMedia[] {
    return matches.map(match => {
      const metadata = this.computeMatchMetadata(match.media.title, request, match.media.episodeRange);
      return this.filterMedia(match.media, metadata, settings);
    });
  }

  // ==================== 排序 — 参考 Animeko sortMedia ====================

  /**
   * 排序规则（按优先级）：
   * 1. included 优先于 excluded
   * 2. EXACT 优先于 FUZZY
   * 3. EP 匹配优先于 SORT 匹配
   * 4. 相似度高的优先
   * 5. 数据源 tier 低的优先
   * 6. 字幕类型优先级: EMBEDDED > CLOSED > EXTERNAL_PROVIDED > EXTERNAL_DISCOVER
   */
  static sortMedia(list: MaybeExcludedMedia[]): MaybeExcludedMedia[] {
    return [...list].sort((a, b) => {
      // 1. included 优先
      if (a.type !== b.type) {
        return a.type === 'included' ? -1 : 1;
      }

      if (a.type === 'included' && b.type === 'included') {
        // 2. EXACT 优先
        if (a.matchKind !== b.matchKind) {
          return a.matchKind === MatchKind.EXACT ? -1 : 1;
        }

        // 3. EP 优先于 SORT
        const epA = a.metadata.episodeMatchKind === EpisodeMatchKind.EP ? 0 : 1;
        const epB = b.metadata.episodeMatchKind === EpisodeMatchKind.EP ? 0 : 1;
        if (epA !== epB) return epA - epB;

        // 4. 相似度高的优先
        if (a.metadata.similarity !== b.metadata.similarity) {
          return b.metadata.similarity - a.metadata.similarity;
        }
      }

      // 5. tier 低的优先
      const tierA = a.media.properties.tier ?? 999;
      const tierB = b.media.properties.tier ?? 999;
      if (tierA !== tierB) return tierA - tierB;

      // 6. 字幕类型优先级
      const subPriority: Record<string, number> = {
        [SubtitleKind.EMBEDDED]: 0,
        [SubtitleKind.CLOSED]: 1,
        [SubtitleKind.EXTERNAL_PROVIDED]: 2,
        [SubtitleKind.CLOSED_OR_EXTERNAL_DISCOVER]: 3,
        [SubtitleKind.EXTERNAL_DISCOVER]: 4,
      };
      const subA = subPriority[a.media.properties.subtitleKind || ''] ?? 99;
      const subB = subPriority[b.media.properties.subtitleKind || ''] ?? 99;
      return subA - subB;
    });
  }

  // ==================== 兼容旧 API（供源实现使用） ====================

  /** @deprecated 使用 computeMatchMetadata + filterMedia */
  static computeMatchKind(
    title: string,
    request: MediaFetchRequest,
    episodeRange?: { sort: string },
  ): MatchKind | null {
    const metadata = this.computeMatchMetadata(title, request, episodeRange as EpisodeRange);
    if (!metadata) return null;
    return this.matchKindFromMetadata(metadata);
  }

  /** @deprecated 使用 sortMedia */
  static sortMatches(matches: MediaMatch[]): MediaMatch[] {
    return [...matches].sort((a, b) => {
      if (a.matchKind !== b.matchKind) {
        return a.matchKind === MatchKind.EXACT ? -1 : 1;
      }
      const tierA = a.media.properties?.tier ?? 999;
      const tierB = b.media.properties?.tier ?? 999;
      return tierA - tierB;
    });
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```powershell
npx tsc --noEmit src/services/media/MatchEngine.ts
```

---

### Task 3: 重写 MediaSelector.ts — 有状态选择器

**Files:**
- Modify: `src/services/media/MediaSelector.ts`

- [ ] **Step 1: 重写 MediaSelector.ts 完整内容**

用以下完整内容替换 [MediaSelector.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/MediaSelector.ts)：

```typescript
// src/services/media/MediaSelector.ts
// 资源选择器 — 参考 Animeko MediaSelector
import {
  MediaMatch,
  Media,
  MatchKind,
  MaybeExcludedMedia,
  MediaSelectorSettings,
  MediaSelectorState,
  MediaFetchRequest,
  MediaSourceKind,
  DEFAULT_MEDIA_PREFERENCE,
} from './types';
import { MatchEngine } from './MatchEngine';

export type MediaSelectorCallback = (state: MediaSelectorState) => void;

export class MediaSelector {
  private settings: MediaSelectorSettings;
  private request: MediaFetchRequest;
  private allMedia: MaybeExcludedMedia[] = [];
  private selectedMedia: Media | null = null;
  private listeners: Set<MediaSelectorCallback> = new Set();
  private sourceCount = 0;
  private completedSources = 0;

  constructor(request: MediaFetchRequest, settings?: Partial<MediaSelectorSettings>) {
    this.request = request;
    this.settings = {
      preference: settings?.preference || DEFAULT_MEDIA_PREFERENCE,
      subjectCompleted: settings?.subjectCompleted || false,
    };
  }

  /** 设置预期的源总数（用于计算 completedCount） */
  setSourceCount(count: number): void {
    this.sourceCount = count;
  }

  /** 标记一个源查询完成 */
  markSourceCompleted(): void {
    this.completedSources++;
    this.notify();
  }

  /**
   * 添加新到达的匹配结果（增量）。
   * 参考 Animeko MediaFetcher 逐源合并结果。
   */
  addMatches(matches: MediaMatch[]): void {
    const filtered = MatchEngine.filterMediaList(matches, this.request, this.settings);
    this.allMedia = MatchEngine.sortMedia([...this.allMedia, ...filtered]);
    this.notify();
  }

  /** 获取当前包含的（未被排除的）资源 */
  getIncluded(): MediaMatch[] {
    return this.allMedia
      .filter((m): m is Extract<MaybeExcludedMedia, { type: 'included' }> => m.type === 'included')
      .map(m => ({ media: m.media, matchKind: m.matchKind }));
  }

  /** 获取当前排除的资源 */
  getExcluded(): { media: Media; reason: string }[] {
    return this.allMedia
      .filter((m): m is Extract<MaybeExcludedMedia, { type: 'excluded' }> => m.type === 'excluded')
      .map(m => ({ media: m.media, reason: m.reason }));
  }

  /** 获取当前状态快照 */
  getState(): MediaSelectorState {
    return {
      included: this.getIncluded(),
      excluded: this.getExcluded(),
      selected: this.selectedMedia,
      totalCount: this.allMedia.length,
      completedCount: this.completedSources,
    };
  }

  /** 手动选择资源 */
  select(mediaId: string): Media | null {
    const found = this.allMedia.find(
      m => m.type === 'included' && m.media.mediaId === mediaId,
    );
    if (found) {
      this.selectedMedia = found.media;
      this.notify();
      return found.media;
    }
    return null;
  }

  /**
   * 自动选择默认资源。
   * 参考 Animeko trySelectDefault：
   * 1. 优先 EXACT + 最低 tier
   * 2. 优先 HTTP 流（比 BT 更快）
   * 3. 回退到第一个 included
   */
  trySelectDefault(): Media | null {
    const included = this.getIncluded();
    if (included.length === 0) return null;

    // 优先 EXACT
    const exact = included.filter(m => m.matchKind === MatchKind.EXACT);
    const candidates = exact.length > 0 ? exact : included;

    // 优先 HTTP 流
    const http = candidates.filter(m => m.media.download?.kind === 'http');
    const chosen = (http.length > 0 ? http[0] : candidates[0]).media;

    this.selectedMedia = chosen;
    this.notify();
    return chosen;
  }

  /**
   * 自动选择已缓存的资源。
   * 参考 Animeko trySelectCached。
   */
  trySelectCached(): Media | null {
    const cached = this.getIncluded().find(
      m => m.media.kind === MediaSourceKind.LOCAL_CACHE,
    );
    if (cached) {
      this.selectedMedia = cached.media;
      this.notify();
      return cached.media;
    }
    return null;
  }

  /** 订阅结果变更，返回取消订阅函数 */
  onChange(callback: MediaSelectorCallback): () => void {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  /** 更新偏好设置，触发重新过滤 */
  updateSettings(partial: Partial<MediaSelectorSettings>): void {
    if (partial.preference) {
      this.settings.preference = { ...this.settings.preference, ...partial.preference };
    }
    if (partial.subjectCompleted !== undefined) {
      this.settings.subjectCompleted = partial.subjectCompleted;
    }
    // 重新过滤所有资源
    this.refilter();
  }

  /** 销毁 */
  destroy(): void {
    this.listeners.clear();
    this.allMedia = [];
    this.selectedMedia = null;
  }

  // ==================== 私有方法 ====================

  private refilter(): void {
    // 重新对所有 Media 执行过滤（保留原始 title 等数据）
    const rawMatches: MediaMatch[] = this.allMedia.map(m => ({
      media: m.media,
      matchKind: m.type === 'included' ? m.matchKind : MatchKind.FUZZY,
    }));
    this.allMedia = MatchEngine.sortMedia(
      MatchEngine.filterMediaList(rawMatches, this.request, this.settings),
    );
    this.notify();
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.error('[MediaSelector] listener error:', e);
      }
    }
  }
}

// ==================== 兼容旧 API ====================

/** @deprecated 使用 new MediaSelector() 实例 */
export const MediaSelectorCompat = {
  selectBest(matches: MediaMatch[]): MediaMatch | null {
    if (matches.length === 0) return null;
    const sorted = MatchEngine.sortMatches(matches);
    return sorted[0];
  },

  groupBySource(matches: MediaMatch[]): Map<string, MediaMatch[]> {
    const groups = new Map<string, MediaMatch[]>();
    for (const match of matches) {
      const sourceId = match.media.sourceId;
      if (!groups.has(sourceId)) groups.set(sourceId, []);
      groups.get(sourceId)!.push(match);
    }
    return groups;
  },

  filterByMatchKind(matches: MediaMatch[], kind: MatchKind): MediaMatch[] {
    return matches.filter(m => m.matchKind === kind);
  },
};
```

- [ ] **Step 2: 验证 TypeScript 编译**

```powershell
npx tsc --noEmit src/services/media/MediaSelector.ts
```

---

### Task 4: 新建 MediaFetcher.ts — 并发查询 + 增量合并

**Files:**
- Create: `src/services/media/MediaFetcher.ts`

- [ ] **Step 1: 创建 MediaFetcher.ts**

```typescript
// src/services/media/MediaFetcher.ts
// 资源查找器 — 参考 Animeko MediaFetcher
// 负责并发查询多个 MediaSource，逐源将结果推入 MediaSelector
import { MediaSourceManager } from './MediaSourceManager';
import { MediaSelector } from './MediaSelector';
import { MediaFetchRequest } from './types';

export class MediaFetcher {
  private manager: MediaSourceManager;
  private request: MediaFetchRequest;
  private selector: MediaSelector;
  private errors: { sourceId: string; error: string }[] = [];
  private cancelled = false;
  private promise: Promise<void> | null = null;

  constructor(
    manager: MediaSourceManager,
    request: MediaFetchRequest,
    selector: MediaSelector,
  ) {
    this.manager = manager;
    this.request = request;
    this.selector = selector;
  }

  /**
   * 开始并发查询所有已启用源。
   * 每个源的结果到达后立即推入 MediaSelector，实现增量展示。
   */
  start(): void {
    const sources = this.manager.getEnabledSources();
    this.selector.setSourceCount(sources.length);

    this.promise = (async () => {
      const promises = sources.map(async (source) => {
        if (this.cancelled) return;
        try {
          const result = await source.fetch(this.request);
          if (this.cancelled) return;
          // 增量推入选择器
          this.selector.addMatches(result.items);
        } catch (err: any) {
          if (this.cancelled) return;
          this.errors.push({
            sourceId: source.sourceId,
            error: err.message || '查询失败',
          });
        } finally {
          if (!this.cancelled) {
            this.selector.markSourceCompleted();
          }
        }
      });

      await Promise.allSettled(promises);
    })();
  }

  /** 等待所有源查询完成 */
  async waitForAll(): Promise<void> {
    if (this.promise) {
      await this.promise;
    }
  }

  /** 获取错误列表 */
  getErrors(): { sourceId: string; error: string }[] {
    return [...this.errors];
  }

  /** 取消所有查询 */
  cancel(): void {
    this.cancelled = true;
  }

  /** 获取关联的 MediaSelector */
  getSelector(): MediaSelector {
    return this.selector;
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```powershell
npx tsc --noEmit src/services/media/MediaFetcher.ts
```

---

### Task 5: 修改 MediaSourceManager.ts — 新增 createFetcher，保留 fetchAll

**Files:**
- Modify: `src/services/media/MediaSourceManager.ts`

- [ ] **Step 1: 新增 createFetcher 方法，对 fetchAll 添加弃用标记**

在 [MediaSourceManager.ts](file:///d:/Desktop/Ideas/ANISpace/ANISpace/src/services/media/MediaSourceManager.ts) 中，找到 `fetchAll` 方法（约第 60 行），在其上方添加 `createFetcher` 方法：

**在 `fetchAll` 方法之前插入以下代码：**

```typescript
  /**
   * 创建 MediaFetcher + MediaSelector 组合。
   * 推荐的新 API，支持增量结果和完整过滤流水线。
   *
   * @example
   * const fetcher = manager.createFetcher(request);
   * fetcher.getSelector().onChange(state => {
   *   setMatches(state.included);
   * });
   * fetcher.start();
   * await fetcher.waitForAll();
   */
  createFetcher(
    request: MediaFetchRequest,
    settings?: Partial<MediaSelectorSettings>,
  ): MediaFetcher {
    // 动态导入避免循环依赖
    const { MediaFetcher } = require('./MediaFetcher');
    const { MediaSelector } = require('./MediaSelector');
    const selector = new MediaSelector(request, settings);
    return new MediaFetcher(this, request, selector);
  }
```

**注意**：由于 `MediaSourceManager.ts` 使用 ES module 导出，而 `require` 不兼容，需要改用静态导入。在文件顶部添加：

```typescript
import { MediaFetcher } from './MediaFetcher';
import { MediaSelector } from './MediaSelector';
import { MediaSelectorSettings } from './types';
```

然后将 `createFetcher` 方法改为：

```typescript
  createFetcher(
    request: MediaFetchRequest,
    settings?: Partial<MediaSelectorSettings>,
  ): MediaFetcher {
    const selector = new MediaSelector(request, settings);
    return new MediaFetcher(this, request, selector);
  }
```

- [ ] **Step 2: 导出 MediaSourceManager 类**

当前 `MediaSourceManager.ts` 中类未导出（仅导出实例 `mediaSourceManager`）。MediaFetcher 需要引用该类类型。修改 class 声明为 export：

```typescript
// 将第 21 行的
class MediaSourceManager {
// 改为
export class MediaSourceManager {
```

- [ ] **Step 3: 在文件顶部添加新的 import**

在 `MediaSourceManager.ts` 第 1-8 行，将 import 修改为：

```typescript
// src/services/media/MediaSourceManager.ts
import {
  MediaSource,
  MediaSourceFactory,
  MediaFetchRequest,
  MediaMatch,
  SourceConfig,
  MediaSelectorSettings,
} from './types';
import { MediaFetcher } from './MediaFetcher';
import { MediaSelector } from './MediaSelector';
```

- [ ] **Step 4: 验证编译**

```powershell
npx tsc --noEmit src/services/media/MediaSourceManager.ts
```

---

### Task 6: 修改 4 个源文件 — 适配 Media 新字段

**Files:**
- Modify: `src/services/media/sources/MacCMSSource.ts`
- Modify: `src/services/media/sources/DmhySource.ts`
- Modify: `src/services/media/sources/MikanSource.ts`
- Modify: `src/services/media/sources/LocalCacheSource.ts`

- [ ] **Step 1: 修改 MacCMSSource.ts — Media 构造补充新字段**

在 `MacCMSSource.ts` 中找到 `const media: Media = {` 构造（约第 202 行），将 Media 对象改为：

```typescript
        const media: Media = {
          mediaId: `${this.sourceId}_${item.vod_id}_${ep.name}`,
          sourceId: this.sourceId,
          title: `${item.vod_name} - ${ep.name}`,
          originalTitle: item.vod_name || '',
          publishedTime: 0,
          location: MediaSourceLocation.ONLINE,
          kind: MediaSourceKind.WEB,
          episodeRange: { sort: ep.name.replace(/[^0-9]/g, '') || ep.name, name: ep.name },
          download: {
            kind: 'http',
            url: this.buildStreamUrl(ep.url),
          },
          properties: {
            subjectName: item.vod_name || '',
            episodeName: ep.name || '',
            subtitleLanguageIds: ['CHS'],
            resolution: '',
            alliance: group.source || '',
            size: FileSize.Unspecified,
            subtitleKind: SubtitleKind.EMBEDDED,
            tier: this.info.tier ?? 2,
            // 旧兼容字段
            vodId: item.vod_id,
            cover: item.vod_pic,
            category: item.vod_class,
            year: item.vod_year,
            area: item.vod_area,
            remarks: item.vod_remarks,
            description: item.vod_content?.replace(/<[^>]+>/g, '') || '',
            playSource: group.source,
          },
        };
```

同时在文件顶部 import 中添加：

```typescript
import {
  // ... existing imports
  MediaSourceLocation,
  SubtitleKind,
  FileSize,
} from '../types';
```

- [ ] **Step 2: 修改 DmhySource.ts — Media 构造补充新字段**

找到 `const media: Media = {` 构造（约第 93 行），改为：

```typescript
      const media: Media = {
        mediaId: `dmhy_${infoHash}`,
        sourceId: this.sourceId,
        title: result.title,
        originalTitle: result.title,
        publishedTime: 0,
        location: MediaSourceLocation.ONLINE,
        kind: MediaSourceKind.BITTORRENT,
        episodeRange: { sort: request.episodeSort },
        download: {
          kind: 'magnet',
          url: result.magnetLink,
        },
        properties: {
          subjectName: '',
          episodeName: '',
          subtitleLanguageIds: result.subtitleGroup ? ['CHS'] : [],
          resolution: '',
          alliance: result.subtitleGroup || '',
          size: result.size
            ? FileSize.of(parseFloat(result.size) || 0, result.size.replace(/[0-9.]/g, '').toUpperCase())
            : FileSize.Unspecified,
          subtitleKind: SubtitleKind.CLOSED_OR_EXTERNAL_DISCOVER,
          tier: this.info.tier ?? 3,
          // 旧兼容字段
          fileSize: result.size,
          subtitleGroup: result.subtitleGroup,
        },
      };
```

在 import 中添加 `MediaSourceLocation, SubtitleKind, FileSize`。

- [ ] **Step 3: 修改 MikanSource.ts — Media 构造补充新字段**

找到 `const media: Media = {` 构造（约第 97 行），改为：

```typescript
      const media: Media = {
        mediaId: `mikan_${magnetHash}`,
        sourceId: 'mikan',
        title: item.title,
        originalTitle: item.title,
        publishedTime: 0,
        location: MediaSourceLocation.ONLINE,
        kind: MediaSourceKind.BITTORRENT,
        episodeRange: { sort: request.episodeSort },
        download: {
          kind: 'magnet',
          url: item.magnet,
        },
        properties: {
          subjectName: '',
          episodeName: '',
          subtitleLanguageIds: subtitleGroup ? ['CHS'] : [],
          resolution: '',
          alliance: subtitleGroup || '',
          size: fileSize
            ? FileSize.of(parseFloat(fileSize) || 0, fileSize.replace(/[0-9.]/g, '').toUpperCase())
            : FileSize.Unspecified,
          subtitleKind: SubtitleKind.CLOSED_OR_EXTERNAL_DISCOVER,
          tier: this.info.tier ?? 3,
          // 旧兼容字段
          fileSize,
          subtitleGroup,
        },
      };
```

在 import 中添加 `MediaSourceLocation, SubtitleKind, FileSize`。

- [ ] **Step 4: 修改 LocalCacheSource.ts — Media 构造补充新字段**

找到 `const media: Media = {` 构造（约第 91 行），改为：

```typescript
        const media: Media = {
          mediaId: `local_${cached.id}`,
          sourceId: 'local_cache',
          title: cached.title,
          originalTitle: cached.title,
          publishedTime: cached.savedAt,
          location: MediaSourceLocation.LOCAL,
          kind: MediaSourceKind.LOCAL_CACHE,
          episodeRange: { sort: cached.episodeSort },
          download: {
            kind: 'local',
            url: blobUrl,
          },
          properties: {
            subjectName: '',
            episodeName: '',
            subtitleLanguageIds: [],
            resolution: '',
            alliance: '本地缓存',
            size: FileSize.of(cached.size / 1024 / 1024, 'MB'),
            subtitleKind: undefined,
            tier: 1,
            // 旧兼容字段
            fileSize: `${(cached.size / 1024 / 1024).toFixed(1)} MB`,
            contentType: cached.contentType,
            savedAt: new Date(cached.savedAt).toLocaleString(),
          },
        };
```

在 import 中添加 `MediaSourceLocation, FileSize`。

- [ ] **Step 5: 验证编译**

```powershell
npx tsc --noEmit
```

---

### Task 7: 修改 initSources.ts — 适配新类型

**Files:**
- Modify: `src/services/media/initSources.ts`

- [ ] **Step 1: 检查 initSources.ts 是否需要修改**

通常 `initSources.ts` 只使用 `mediaSourceManager` 的注册方法，不直接接触 `Media` 类型，大概率无需修改。但需要验证：

```powershell
npx tsc --noEmit src/services/media/initSources.ts
```

如有类型错误，逐一修复（通常为 import 路径或参数类型不匹配）。

---

### Task 8: 最终验证

- [ ] **Step 1: 完整 TypeScript 编译检查**

```powershell
npx tsc --noEmit
```

预期：无类型错误。

- [ ] **Step 2: 检查 UI 组件兼容性**

确认 VideoPlayer.jsx、SubjectDetail.jsx、VideoHome.jsx 中引用的 `mediaSourceManager.fetchAll`、`MatchEngine.sortMatches`、`MediaSelector.selectBest` 等 API 仍然可用：

```powershell
rg "mediaSourceManager\.fetchAll\|MatchEngine\.\|MediaSelector\." src/components/Video/ --files-with-matches
```

如果有引用，确认这些 API 在改造后仍存在（已在 Task 2 和 Task 3 中保留了兼容方法）。

- [ ] **Step 3: 运行开发服务器验证**

```powershell
npm run dev
```

打开浏览器，进入影视区，验证搜索、详情、播放功能正常。

---

## 风险与缓解

| 风险 | 缓解措施 |
| --- | --- |
| 类型改动导致 UI 组件编译失败 | 保留 `fetchAll`、`sortMatches`、`selectBest` 等向后兼容 API |
| `MediaProperties` 从 `Record<string, any>` 改为强类型后旧代码访问 `properties.xxx` 失败 | 保留 `[key: string]: any` 索引签名 |
| 循环依赖（MediaSourceManager ↔ MediaFetcher ↔ MediaSelector） | 在 Manager 中静态导入（非 dynamic import） |
| 源文件构造 Media 时遗漏新必填字段 | 每个源逐一修改，提供默认值 |