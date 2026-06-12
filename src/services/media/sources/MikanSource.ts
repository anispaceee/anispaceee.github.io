// src/services/media/sources/MikanSource.ts
import {
  MediaSource,
  MediaSourceFactory,
  MediaSourceKind,
  MediaSourceInfo,
  MediaFetchRequest,
  MediaMatch,
  Media,
  PagedResult,
  ConnectionStatus,
  SourceConfig,
  SourceParameter,
  MatchKind,
  MediaSourceLocation,
  SubtitleKind,
  FileSize,
} from '../types';
import { MatchEngine } from '../MatchEngine';
import { parseRawTitle } from '../RawTitleParser';
import oauthConfig from '../../../../oauth.config.js';

const MIKAN_FACTORY_ID = 'mikan';

/** 从 magnet 链接中提取 info hash */
function extractMagnetHash(magnetUrl: string): string {
  const match = magnetUrl.match(/btih:([a-fA-F0-9]{40})/i);
  return match ? match[1] : magnetUrl.slice(-40);
}

/** 从标题中提取字幕组名，例如 "[喵萌奶茶屋] ..." → "喵萌奶茶屋" */
function extractSubtitleGroup(title: string): string {
  const match = title.match(/^\[([^\]]+)\]/);
  return match ? match[1] : '';
}

/** 从标题中提取文件大小，例如 "... 1.2GB ..." → "1.2GB" */
function extractFileSize(title: string): string {
  const match = title.match(/(\d+\.?\d*\s*(?:GB|MB|TB))/i);
  return match ? match[1] : '';
}

class MikanSource implements MediaSource {
  readonly sourceId = 'mikan';
  readonly kind = MediaSourceKind.BITTORRENT;
  readonly info: MediaSourceInfo = {
    displayName: '蜜柑计划',
    description: 'Mikan Project BT资源站',
    websiteUrl: 'https://mikanani.me',
    tier: 3,
  };

  private proxyBase: string;

  constructor() {
    this.proxyBase = oauthConfig.proxyUrl || '';
  }

  async checkConnection(): Promise<ConnectionStatus> {
    try {
      const url = this.buildRssUrl('test');
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return ConnectionStatus.UNAVAILABLE;
      const text = await res.text();
      return text.includes('<rss') || text.includes('<item>')
        ? ConnectionStatus.AVAILABLE
        : ConnectionStatus.UNAVAILABLE;
    } catch {
      return ConnectionStatus.TIMEOUT;
    }
  }

  async fetch(request: MediaFetchRequest): Promise<PagedResult<MediaMatch>> {
    const matches: MediaMatch[] = [];

    // Step 1: 尝试 Bangumi ID 索引精确匹配
    if (request.subjectId && this.proxyBase) {
      try {
        const indexRes = await fetch(`${this.proxyBase}/api/mikan/subject/${request.subjectId}`);
        if (indexRes.ok) {
          const indexData = await indexRes.json();
          if (indexData.items && indexData.items.length > 0) {
            // 索引匹配成功，所有结果标记为 EXACT
            for (const item of indexData.items.slice(0, 50)) {
              const parsed = parseRawTitle(item.title);
              const magnetHash = extractMagnetHash(item.link || '');
              const media: Media = {
                mediaId: `mikan_idx_${magnetHash}`,
                sourceId: 'mikan',
                title: item.title,
                originalTitle: item.title,
                publishedTime: item.pubDate ? new Date(item.pubDate).getTime() : 0,
                location: MediaSourceLocation.ONLINE,
                kind: MediaSourceKind.BITTORRENT,
                episodeRange: { sort: parsed.episodeSort || request.episodeSort },
                download: { kind: 'magnet', url: item.link || '' },
                properties: {
                  subjectName: parsed.subjectName || '',
                  episodeName: '',
                  subtitleLanguageIds: parsed.subtitleLanguageIds,
                  resolution: parsed.resolution,
                  alliance: parsed.alliance,
                  size: item.size ? FileSize.of(parseFloat(item.size) || 0, 'B') : FileSize.Unspecified,
                  subtitleKind: parsed.subtitleKind || SubtitleKind.CLOSED_OR_EXTERNAL_DISCOVER,
                  tier: this.info.tier,
                  fileSize: item.size,
                  subtitleGroup: parsed.alliance,
                },
              };
              matches.push({ media, matchKind: MatchKind.EXACT });
            }
            if (matches.length > 0) {
              return { items: MatchEngine.sortMatches(matches), total: matches.length, page: 1, pagecount: 1, hasMore: false };
            }
          }
        }
      } catch (err) {
        console.warn('[MikanSource] index lookup failed, falling back to keyword search:', err);
      }
    }

    // Step 2: 回退到关键词搜索
    const keyword = request.subjectNames.length > 1
      ? request.subjectNames[request.subjectNames.length - 1]
      : (request.subjectNames[0] || '');
    if (!keyword) {
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }

    const url = this.buildRssUrl(keyword);
    const res = await fetch(url);
    const rssText = await res.text();

    const items = this.parseRss(rssText);
    if (items.length === 0) {
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }

    for (const item of items) {
      const parsed = parseRawTitle(item.title);
      const matchKind = MatchEngine.computeMatchKind(item.title, request, {
        sort: parsed.episodeSort || request.episodeSort,
      });
      if (matchKind === null) continue;

      const epMatch = MatchEngine.matchEpisode(item.title, request.episodeSort);
      const finalKind = epMatch ? MatchKind.EXACT : matchKind;

      const magnetHash = extractMagnetHash(item.magnet);

      const media: Media = {
        mediaId: `mikan_${magnetHash}`,
        sourceId: 'mikan',
        title: item.title,
        originalTitle: item.title,
        publishedTime: 0,
        location: MediaSourceLocation.ONLINE,
        kind: MediaSourceKind.BITTORRENT,
        episodeRange: { sort: parsed.episodeSort || request.episodeSort },
        download: { kind: 'magnet', url: item.magnet },
        properties: {
          subjectName: parsed.subjectName || '',
          episodeName: '',
          subtitleLanguageIds: parsed.subtitleLanguageIds.length > 0 ? parsed.subtitleLanguageIds : (parsed.alliance ? ['CHS'] : []),
          resolution: parsed.resolution,
          alliance: parsed.alliance,
          size: FileSize.Unspecified,
          subtitleKind: parsed.subtitleKind || SubtitleKind.CLOSED_OR_EXTERNAL_DISCOVER,
          tier: this.info.tier,
          // 旧兼容字段
          fileSize: '',
          subtitleGroup: parsed.alliance,
        },
      };

      matches.push({ media, matchKind: finalKind });
    }

    return {
      items: MatchEngine.sortMatches(matches),
      total: matches.length,
      page: 1,
      pagecount: 1,
      hasMore: false,
    };
  }

  private buildRssUrl(keyword: string): string {
    if (this.proxyBase) {
      return `${this.proxyBase}/api/video/mikan?searchstr=${encodeURIComponent(keyword)}`;
    }
    return `https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(keyword)}`;
  }

  private parseRss(rssText: string): Array<{ title: string; magnet: string }> {
    const results: Array<{ title: string; magnet: string }> = [];

    let doc: Document;
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(rssText, 'text/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) return results;
    } catch {
      return results;
    }

    const items = doc.querySelectorAll('item');
    for (const item of items) {
      const title = item.querySelector('title')?.textContent?.trim() || '';
      if (!title) continue;

      // 优先从 enclosure 获取 magnet 链接
      let magnet =
        item.querySelector('enclosure')?.getAttribute('url')?.trim() || '';

      // 备选：从 link 元素获取
      if (!magnet) {
        magnet = item.querySelector('link')?.textContent?.trim() || '';
      }

      // 备选：从 description 中提取 magnet 链接
      if (!magnet) {
        const desc = item.querySelector('description')?.textContent || '';
        const magnetMatch = desc.match(/magnet:\?[^\s"<>]+/);
        if (magnetMatch) {
          magnet = magnetMatch[0];
        }
      }

      if (!magnet || !magnet.startsWith('magnet:')) continue;

      results.push({ title, magnet });
    }

    return results;
  }
}

export class MikanSourceFactory implements MediaSourceFactory {
  readonly factoryId = MIKAN_FACTORY_ID;
  readonly allowMultipleInstances = false;
  readonly parameters: SourceParameter[] = [];
  readonly info: MediaSourceInfo = {
    displayName: '蜜柑计划',
    description: 'Mikan Project BT资源站',
    websiteUrl: 'https://mikanani.me',
    tier: 3,
  };

  create(sourceId: string, _config: SourceConfig): MediaSource {
    return new MikanSource();
  }
}
