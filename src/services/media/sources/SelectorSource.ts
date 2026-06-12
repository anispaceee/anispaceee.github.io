// src/services/media/sources/SelectorSource.ts
// 通用 CSS Selector 源 — 参考 Animeko SelectorMediaSource
// 通过 Worker 代理获取 HTML，服务端解析提取视频链接

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

// ==================== 预设 Selector 源配置 ====================

export interface SelectorPreset {
  sourceId: string;
  name: string;
  baseUrl: string;
  searchUrl: string;    // {keyword} 占位
  selectors: {
    list?: string;
    item: string;
    title: string;
    link: string;
    cover?: string;
  };
  episodeSelectors: {
    episodeItem: string;
    episodeTitle: string;
    episodeUrl: string;
    videoSource?: string;
  };
  tier?: number;
}

export const DEFAULT_SELECTOR_PRESETS: SelectorPreset[] = [
  {
    sourceId: 'age',
    name: 'AGE动漫',
    baseUrl: 'https://www.agedm.io',
    searchUrl: 'https://www.agedm.io/search?keyword={keyword}',
    selectors: {
      // AGE动漫搜索结果在 <div class="card-list"> 内
      // 每个结果是一个包含动漫信息的卡片
      list: '<div class="card-list">',
      item: '<a[^>]*href="/detail/\\d+"[^>]*>',
      title: 'title=["\']([^"\']+)["\']',
      link: 'href="(/detail/\\d+)"',
      cover: '(?:src|data-original)=["\']([^"\']+)["\']',
    },
    episodeSelectors: {
      // AGE动漫详情页：集数链接格式 <a href="/play/{id}/{线路}/{集数}">
      episodeItem: '<a[^>]*href="/play/\\d+/\\d+/\\d+"[^>]*>',
      episodeTitle: '>([^<]+)</a>',
      episodeUrl: 'href="(/play/\\d+/\\d+/\\d+)"',
      videoSource: 'https?://[^\\s"\']+\\.m3u8[^\\s"\']*',
    },
    tier: 1,
  },
];

// ==================== SelectorSource ====================

class SelectorSource implements MediaSource {
  readonly sourceId: string;
  readonly kind = MediaSourceKind.WEB;
  readonly info: MediaSourceInfo;
  private preset: SelectorPreset;
  private proxyBase: string;

  constructor(preset: SelectorPreset) {
    this.sourceId = preset.sourceId;
    this.preset = preset;
    this.proxyBase = oauthConfig.proxyUrl || '';
    this.info = {
      displayName: preset.name,
      description: `在线播放站: ${preset.name}`,
      websiteUrl: preset.baseUrl,
      tier: preset.tier || 2,
    };
  }

  async checkConnection(): Promise<ConnectionStatus> {
    try {
      const res = await fetch(`${this.proxyBase}/api/selector/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchUrl: this.preset.searchUrl,
          selectors: this.preset.selectors,
          keyword: 'test',
          baseUrl: this.preset.baseUrl,
        }),
      });
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
      // Step 1: 搜索番剧
      const searchRes = await fetch(`${this.proxyBase}/api/selector/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchUrl: this.preset.searchUrl,
          selectors: this.preset.selectors,
          keyword,
          baseUrl: this.preset.baseUrl,
        }),
      });

      if (!searchRes.ok) return { items: [], total: 0, page: 1, pagecount: 1, hasMore: false };
      const searchData = await searchRes.json();
      const items = searchData.items || [];

      if (items.length === 0) {
        return { items: [], total: 0, page: 1, pagecount: 1, hasMore: false };
      }

      // Step 2: 找到匹配的番剧，提取剧集
      const matchedItem = this.findBestMatch(items, request);
      if (!matchedItem || !matchedItem.url) {
        return { items: [], total: 0, page: 1, pagecount: 1, hasMore: false };
      }

      // Step 3: 获取剧集列表
      const episodeRes = await fetch(`${this.proxyBase}/api/selector/episode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: matchedItem.url,
          baseUrl: this.preset.baseUrl,
          selectors: this.preset.episodeSelectors,
        }),
      });

      if (!episodeRes.ok) {
        // 如果无法提取剧集，直接返回搜索结果作为单条资源
        matches.push(this.createMediaMatch(matchedItem, request, MatchKind.FUZZY));
        return { items: matches, total: matches.length, page: 1, pagecount: 1, hasMore: false };
      }

      const episodeData = await episodeRes.json();
      const episodes = episodeData.episodes || [];

      // Step 4: 匹配目标集数
      for (const ep of episodes) {
        const epNum = this.extractEpisodeNumber(ep.title);
        const targetEp = request.episodeSort || request.episodeEp;

        if (targetEp && epNum === targetEp) {
          // 找到目标集数
          const videoUrl = ep.videoUrl || ep.url;
          if (videoUrl) {
            const media = this.createMediaFromEpisode(ep, videoUrl, request);
            matches.push({ media, matchKind: MatchKind.EXACT });
          }
        } else if (!targetEp) {
          // 没有指定集数，返回所有
          const videoUrl = ep.videoUrl || ep.url;
          if (videoUrl) {
            const media = this.createMediaFromEpisode(ep, videoUrl, request);
            matches.push({ media, matchKind: MatchKind.FUZZY });
          }
        }
      }

      // 如果没找到精确匹配，返回第一条
      if (matches.length === 0 && episodes.length > 0) {
        const firstEp = episodes[0];
        const videoUrl = firstEp.videoUrl || firstEp.url;
        if (videoUrl) {
          const media = this.createMediaFromEpisode(firstEp, videoUrl, request);
          matches.push({ media, matchKind: MatchKind.FUZZY });
        }
      }
    } catch (err) {
      console.warn(`[SelectorSource] ${this.sourceId} fetch error:`, err);
    }

    return { items: matches, total: matches.length, page: 1, pagecount: 1, hasMore: false };
  }

  private findBestMatch(items: any[], request: MediaFetchRequest): any | null {
    // 优先精确匹配标题
    for (const name of request.subjectNames) {
      const exact = items.find(item =>
        item.title && item.title.toLowerCase().includes(name.toLowerCase()),
      );
      if (exact) return exact;
    }
    // 回退到第一个结果
    return items[0] || null;
  }

  private extractEpisodeNumber(title: string): string {
    const match = title.match(/第?\s*(\d+)\s*[集话話]?/);
    return match ? match[1] : '';
  }

  private createMediaMatch(item: any, request: MediaFetchRequest, matchKind: MatchKind): MediaMatch {
    return {
      media: {
        mediaId: `${this.sourceId}_${item.url}`,
        sourceId: this.sourceId,
        title: item.title || '',
        originalTitle: item.title || '',
        publishedTime: 0,
        location: MediaSourceLocation.ONLINE,
        kind: MediaSourceKind.WEB,
        episodeRange: { sort: request.episodeSort },
        download: { kind: 'http', url: item.url },
        properties: {
          subjectName: item.title || '',
          episodeName: '',
          subtitleLanguageIds: ['CHS'],
          resolution: '',
          alliance: this.info.displayName,
          size: FileSize.Unspecified,
          subtitleKind: SubtitleKind.EMBEDDED,
          tier: this.info.tier,
          cover: item.cover || '',
        },
      },
      matchKind,
    };
  }

  private createMediaFromEpisode(ep: any, videoUrl: string, request: MediaFetchRequest): Media {
    // 构建流式播放 URL（通过 Worker 代理）
    const streamUrl = videoUrl.startsWith('http')
      ? `${this.proxyBase}/api/video/stream?url=${encodeURIComponent(videoUrl)}`
      : videoUrl;

    return {
      mediaId: `${this.sourceId}_ep_${ep.title}_${Date.now()}`,
      sourceId: this.sourceId,
      title: `${this.info.displayName} - ${ep.title}`,
      originalTitle: ep.title || '',
      publishedTime: 0,
      location: MediaSourceLocation.ONLINE,
      kind: MediaSourceKind.WEB,
      episodeRange: { sort: this.extractEpisodeNumber(ep.title) || request.episodeSort, name: ep.title },
      download: { kind: 'http', url: streamUrl },
      properties: {
        subjectName: '',
        episodeName: ep.title || '',
        subtitleLanguageIds: ['CHS'],
        resolution: '',
        alliance: this.info.displayName,
        size: FileSize.Unspecified,
        subtitleKind: SubtitleKind.EMBEDDED,
        tier: this.info.tier,
      },
    };
  }
}

// ==================== Factory ====================

class SelectorSourceFactory implements MediaSourceFactory {
  readonly factoryId = 'web-selector';
  readonly allowMultipleInstances = true;
  readonly info: MediaSourceInfo = {
    displayName: '在线播放站 (Selector)',
    description: '通用 CSS Selector 数据源，可配置任何在线播放站',
  };
  readonly parameters: SourceParameter[] = [
    { name: 'presetId', displayName: '预设', type: 'select', options: DEFAULT_SELECTOR_PRESETS.map(p => ({ label: p.name, value: p.sourceId })) },
  ];

  create(sourceId: string, config: SourceConfig): MediaSource {
    const presetId = config.arguments?.presetId || sourceId;
    const preset = DEFAULT_SELECTOR_PRESETS.find(p => p.sourceId === presetId);
    if (!preset) {
      throw new Error(`Unknown selector preset: ${presetId}`);
    }
    return new SelectorSource(preset);
  }
}

export { SelectorSource, SelectorSourceFactory };
