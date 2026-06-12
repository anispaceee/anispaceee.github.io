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
  ExclusionReason,
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
  getExcluded(): { media: Media; reason: ExclusionReason }[] {
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

    const exact = included.filter(m => m.matchKind === MatchKind.EXACT);
    const candidates = exact.length > 0 ? exact : included;

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
