// src/services/media/sources/MacCMSSource.ts
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

const MACCMS_FACTORY_ID = 'maccms';

class MacCMSSource implements MediaSource {
  readonly sourceId: string;
  readonly kind = MediaSourceKind.WEB;
  readonly info: MediaSourceInfo;
  private baseUrl: string;
  private proxyBase: string;

  constructor(sourceId: string, name: string, baseUrl: string) {
    this.sourceId = sourceId;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.proxyBase = oauthConfig.proxyUrl || '';
    this.info = {
      displayName: name,
      description: `苹果CMS源: ${name}`,
      websiteUrl: this.baseUrl,
      tier: 2,
    };
  }

  async checkConnection(): Promise<ConnectionStatus> {
    try {
      const url = this.buildUrl('/api.php/provide/vod/', { ac: 'list' });
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return res.ok ? ConnectionStatus.AVAILABLE : ConnectionStatus.UNAVAILABLE;
    } catch {
      return ConnectionStatus.TIMEOUT;
    }
  }

  async fetch(request: MediaFetchRequest): Promise<PagedResult<MediaMatch>> {
    const keyword = request.subjectNames[0] || '';
    const url = this.buildUrl('/api.php/provide/vod/', { ac: 'videolist', wd: keyword });
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 200 || !data.list) {
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }

    const matches: MediaMatch[] = [];
    for (const item of data.list) {
      const matchKind = MatchEngine.computeMatchKind(item.vod_name, request);
      if (matchKind === null) continue;

      const playFroms = (item.vod_play_from || '').split('$$$').filter(Boolean);
      const playUrlGroups = (item.vod_play_url || '').split('$$$').filter(Boolean);

      const episodes = playFroms.map((from, idx) => {
        const urlGroup = playUrlGroups[idx] || '';
        const eps = urlGroup.split('#').filter(Boolean).map(ep => {
          const parts = ep.split('$');
          return { name: parts[0] || `第${idx + 1}集`, url: parts[1] || parts[0] };
        });
        return { source: from, episodes: eps };
      });

      for (const group of episodes) {
        for (const ep of group.episodes) {
          const epMatch = MatchEngine.matchEpisode(ep.name, request.episodeSort);
          const finalKind = epMatch ? MatchKind.EXACT : matchKind;

          const media: Media = {
            mediaId: `${this.sourceId}_${item.vod_id}_${ep.name}`,
            sourceId: this.sourceId,
            title: `${item.vod_name} - ${ep.name}`,
            episodeRange: { sort: ep.name.replace(/[^0-9]/g, '') || ep.name, name: ep.name },
            download: {
              kind: 'http',
              url: this.buildStreamUrl(ep.url),
            },
            properties: {
              vodId: item.vod_id,
              cover: item.vod_pic,
              category: item.vod_class,
              year: item.vod_year,
              area: item.vod_area,
              remarks: item.vod_remarks,
              description: item.vod_content?.replace(/<[^>]+>/g, '') || '',
              playSource: group.source,
              tier: this.info.tier,
            },
          };

          matches.push({ media, matchKind: finalKind });
        }
      }
    }

    return {
      items: MatchEngine.sortMatches(matches),
      total: data.total || matches.length,
      page: data.page || 1,
      pagecount: data.pagecount || 1,
      hasMore: (data.page || 1) < (data.pagecount || 1),
    };
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString();
    if (this.proxyBase) {
      return `${this.proxyBase}/api/video/proxy?baseUrl=${encodeURIComponent(this.baseUrl)}&path=${encodeURIComponent(path)}&${query}`;
    }
    return `${this.baseUrl}${path}?${query}`;
  }

  private buildStreamUrl(videoUrl: string): string {
    if (this.proxyBase) {
      return `${this.proxyBase}/api/video/stream?url=${encodeURIComponent(videoUrl)}`;
    }
    return videoUrl;
  }
}

export class MacCMSSourceFactory implements MediaSourceFactory {
  readonly factoryId = MACCMS_FACTORY_ID;
  readonly allowMultipleInstances = true;
  readonly parameters: SourceParameter[] = [
    { name: 'baseUrl', displayName: '源地址', type: 'string', required: true },
    { name: 'name', displayName: '源名称', type: 'string', required: true },
  ];
  readonly info: MediaSourceInfo = {
    displayName: '苹果CMS源',
    description: '支持苹果CMS V10 API 标准的视频源',
  };

  create(sourceId: string, config: SourceConfig): MediaSource {
    const baseUrl = config.arguments.baseUrl || '';
    const name = config.arguments.name || '未命名源';
    return new MacCMSSource(sourceId, name, baseUrl);
  }
}

export const DEFAULT_MACCMS_SOURCES = [
  { sourceId: 'kuapi', name: '酷云资源', baseUrl: 'https://kuapi.co' },
  { sourceId: 'bfzy', name: '暴风资源', baseUrl: 'https://bfzyapi.com' },
  { sourceId: 'guangsu', name: '光速资源', baseUrl: 'https://guangsuapi.com' },
  { sourceId: 'sdzy', name: '闪电资源', baseUrl: 'https://sdzyapi.com' },
];
