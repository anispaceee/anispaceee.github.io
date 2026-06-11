// src/services/media/MatchEngine.ts
import { MatchKind, MediaFetchRequest, MediaMatch } from './types';

export class MatchEngine {
  /**
   * 判断一个资源标题是否匹配请求中的番剧名称
   */
  static matchSubject(title: string, request: MediaFetchRequest): boolean {
    const lowerTitle = title.toLowerCase();
    return request.subjectNames.some(name =>
      lowerTitle.includes(name.toLowerCase())
    );
  }

  /**
   * 判断集数是否精确匹配
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
    ];
    return patterns.some(p => p.test(title));
  }

  /**
   * 为资源计算匹配度
   */
  static computeMatchKind(
    title: string,
    request: MediaFetchRequest,
    episodeRange?: { sort: string },
  ): MatchKind | null {
    if (!this.matchSubject(title, request)) {
      return null;
    }
    if (request.episodeId && episodeRange?.sort === request.episodeSort) {
      return MatchKind.EXACT;
    }
    if (request.episodeSort && this.matchEpisode(title, request.episodeSort)) {
      return MatchKind.EXACT;
    }
    return MatchKind.FUZZY;
  }

  /**
   * 对匹配结果排序：EXACT 优先，然后按 tier 排序
   */
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
