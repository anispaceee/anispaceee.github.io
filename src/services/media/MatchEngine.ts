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
    // 空集数或非数字时不做匹配，否则 "".padStart(2,'0') => "00" 会用 /\b0\b/ 等误匹配大量无关标题
    if (!episodeSort) return false;
    const parsed = parseInt(episodeSort, 10);
    if (Number.isNaN(parsed)) return false;
    const sort = episodeSort.padStart(2, '0');
    const numSort = String(parsed);
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
      !media.episodeRange.ep?.includes('-')
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
