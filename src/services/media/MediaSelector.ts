// src/services/media/MediaSelector.ts
import { MediaMatch, MatchKind } from './types';
import { MatchEngine } from './MatchEngine';

export class MediaSelector {
  /**
   * 从多个源的结果中选出最佳资源
   */
  static selectBest(matches: MediaMatch[]): MediaMatch | null {
    if (matches.length === 0) return null;
    const sorted = MatchEngine.sortMatches(matches);
    return sorted[0];
  }

  /**
   * 按源分组
   */
  static groupBySource(matches: MediaMatch[]): Map<string, MediaMatch[]> {
    const groups = new Map<string, MediaMatch[]>();
    for (const match of matches) {
      const sourceId = match.media.sourceId;
      if (!groups.has(sourceId)) groups.set(sourceId, []);
      groups.get(sourceId)!.push(match);
    }
    return groups;
  }

  /**
   * 过滤只保留指定匹配度的结果
   */
  static filterByMatchKind(matches: MediaMatch[], kind: MatchKind): MediaMatch[] {
    return matches.filter(m => m.matchKind === kind);
  }
}
