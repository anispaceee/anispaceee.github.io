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
} from '../types';
import { MatchEngine } from '../MatchEngine';
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
    const keyword = request.subjectNames[0] || '';
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

    const matches: MediaMatch[] = [];

    for (const item of items) {
      const matchKind = MatchEngine.computeMatchKind(item.title, request);
      if (matchKind === null) continue;

      const epMatch = MatchEngine.matchEpisode(item.title, request.episodeSort);
      const finalKind = epMatch ? MatchKind.EXACT : matchKind;

      const magnetHash = extractMagnetHash(item.magnet);
      const subtitleGroup = extractSubtitleGroup(item.title);
      const fileSize = extractFileSize(item.title);

      const media: Media = {
        mediaId: `mikan_${magnetHash}`,
        sourceId: 'mikan',
        title: item.title,
        episodeRange: { sort: request.episodeSort },
        download: {
          kind: 'magnet',
          url: item.magnet,
        },
        properties: {
          fileSize,
          subtitleGroup,
          tier: this.info.tier,
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
