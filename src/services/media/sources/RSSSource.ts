// src/services/media/sources/RSSSource.ts
// 通用 RSS 源 — 参考 Animeko RSSMediaSource
// 通过 Worker 代理获取 RSS，解析 BT 资源

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

// ==================== 预设 RSS 源配置 ====================

export interface RSSPreset {
  sourceId: string;
  name: string;
  rssUrlTemplate: string;  // {keyword} 占位
  tier?: number;
}

export const DEFAULT_RSS_PRESETS: RSSPreset[] = [
  {
    sourceId: 'acgrip',
    name: 'ACG.RIP',
    rssUrlTemplate: 'https://acg.rip/page/2.xml?term={keyword}',
    tier: 2,
  },
  {
    sourceId: 'nyaa',
    name: 'Nyaa',
    rssUrlTemplate: 'https://nyaa.si/?page=rss&q={keyword}&c=0_0&f=0',
    tier: 3,
  },
  {
    sourceId: 'breadio',
    name: 'Breadio Garden',
    rssUrlTemplate: 'https://garden.breadio.wiki/feed.xml?filter=[{"keyword":"{keyword}"}]',
    tier: 2,
  },
];

// ==================== RSSSource ====================

class RSSSource implements MediaSource {
  readonly sourceId: string;
  readonly kind = MediaSourceKind.BITTORRENT;
  readonly info: MediaSourceInfo;
  private preset: RSSPreset;
  private proxyBase: string;

  constructor(preset: RSSPreset) {
    this.sourceId = preset.sourceId;
    this.preset = preset;
    this.proxyBase = oauthConfig.proxyUrl || '';
    this.info = {
      displayName: preset.name,
      description: `RSS BT 源: ${preset.name}`,
      tier: preset.tier || 3,
    };
  }

  async checkConnection(): Promise<ConnectionStatus> {
    try {
      const testUrl = this.preset.rssUrlTemplate.replace('{keyword}', 'test');
      const res = await fetch(`${this.proxyBase}/api/rss/fetch?url=${encodeURIComponent(testUrl)}`);
      return res.ok ? ConnectionStatus.AVAILABLE : ConnectionStatus.UNAVAILABLE;
    } catch {
      return ConnectionStatus.TIMEOUT;
    }
  }

  async fetch(request: MediaFetchRequest): Promise<PagedResult<MediaMatch>> {
    const keyword = request.subjectNames.length > 1
      ? request.subjectNames[request.subjectNames.length - 1]
      : (request.subjectNames[0] || '');

    const matches: MediaMatch[] = [];

    try {
      const rssUrl = this.preset.rssUrlTemplate.replace('{keyword}', encodeURIComponent(keyword));
      const res = await fetch(`${this.proxyBase}/api/rss/fetch?url=${encodeURIComponent(rssUrl)}`);

      if (!res.ok) return { items: [], total: 0, page: 1, pagecount: 1, hasMore: false };
      const data = await res.json();
      const items = data.items || [];

      for (const item of items.slice(0, 50)) {
        // 使用 RawTitleParser 解析标题
        const parsed = parseRawTitle(item.title);

        // 匹配检查
        const matchKind = MatchEngine.computeMatchKind(item.title, request, {
          sort: parsed.episodeSort || request.episodeSort,
        });

        if (!matchKind) continue;

        // 确定下载链接类型
        const link = item.link || '';
        const downloadKind = link.startsWith('magnet:') ? 'magnet' as const
          : link.endsWith('.torrent') ? 'torrent' as const
          : 'http' as const;

        // 稳定 mediaId：优先用 magnet 的 btih 哈希，其次下载链接，最后标题，
        // 避免每次抓取生成随机 id 导致同一资源重复且无法去重
        const stableKey = link.match(/btih:([a-z0-9]+)/i)?.[1] || link || item.title;
        const media: Media = {
          mediaId: `${this.sourceId}_${stableKey}`,
          sourceId: this.sourceId,
          title: item.title,
          originalTitle: item.title,
          publishedTime: item.pubDate ? new Date(item.pubDate).getTime() : 0,
          location: MediaSourceLocation.ONLINE,
          kind: MediaSourceKind.BITTORRENT,
          episodeRange: { sort: parsed.episodeSort || request.episodeSort },
          download: { kind: downloadKind, url: link },
          properties: {
            subjectName: parsed.subjectName || '',
            episodeName: '',
            subtitleLanguageIds: parsed.subtitleLanguageIds,
            resolution: parsed.resolution,
            alliance: parsed.alliance,
            size: item.size
              ? FileSize.of(parseFloat(item.size) || 0, 'B')
              : FileSize.Unspecified,
            subtitleKind: parsed.subtitleKind,
            tier: this.info.tier,
            // 旧兼容字段
            fileSize: item.size,
            pubDate: item.pubDate,
            description: item.description,
          },
        };

        matches.push({ media, matchKind });
      }
    } catch (err) {
      console.warn(`[RSSSource] ${this.sourceId} fetch error:`, err);
    }

    return { items: matches, total: matches.length, page: 1, pagecount: 1, hasMore: false };
  }
}

// ==================== Factory ====================

class RSSSourceFactory implements MediaSourceFactory {
  readonly factoryId = 'rss';
  readonly allowMultipleInstances = true;
  readonly info: MediaSourceInfo = {
    displayName: 'RSS BT 源',
    description: '通用 RSS 数据源，可对接 ACG.RIP、Nyaa 等',
  };
  readonly parameters: SourceParameter[] = [
    { name: 'presetId', displayName: '预设', type: 'select', options: DEFAULT_RSS_PRESETS.map(p => ({ label: p.name, value: p.sourceId })) },
  ];

  create(sourceId: string, config: SourceConfig): MediaSource {
    const presetId = config.arguments?.presetId || sourceId;
    const preset = DEFAULT_RSS_PRESETS.find(p => p.sourceId === presetId);
    if (!preset) {
      throw new Error(`Unknown RSS preset: ${presetId}`);
    }
    return new RSSSource(preset);
  }
}

export { RSSSource, RSSSourceFactory };
