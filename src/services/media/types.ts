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
  /** Worker 代理 URL（作为 CORS 回退） */
  proxyUrl?: string;
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
