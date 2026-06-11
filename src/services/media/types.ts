// src/services/media/types.ts
// 影视区 V2 核心类型定义 — 参考 Animeko MediaSource 架构

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

export interface MediaFetchRequest {
  subjectId: string;
  episodeId?: string;
  subjectNames: string[];
  episodeSort: string;
  episodeName?: string;
}

export interface MediaMatch {
  media: Media;
  matchKind: MatchKind;
}

export interface Media {
  mediaId: string;
  sourceId: string;
  title: string;
  episodeRange?: EpisodeRange;
  download?: MediaDownload;
  properties: Record<string, any>;
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

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pagecount: number;
  hasMore: boolean;
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
