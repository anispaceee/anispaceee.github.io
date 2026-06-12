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
  MediaSourceLocation,
  SubtitleKind,
  FileSize,
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
    // MacCMS 源使用中文名索引，优先使用 name_cn（数组最后一个元素）
    // subjectNames 格式: [name(日文), name_cn(中文)]
    const keyword = request.subjectNames.length > 1
      ? request.subjectNames[request.subjectNames.length - 1]
      : (request.subjectNames[0] || '');

    const url = this.buildUrl('/api.php/provide/vod/', { ac: 'videolist', wd: keyword });
    console.log(`[MacCMS:${this.sourceId}] 开始搜索, keyword="${keyword}", proxyBase="${this.proxyBase}", url="${url}"`);

    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      console.warn(`[MacCMS:${this.sourceId}] 请求失败:`, err);
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }

    let data: any;
    try {
      data = await res.json();
    } catch (err) {
      console.warn(`[MacCMS:${this.sourceId}] 响应解析失败:`, err);
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }

    if ((data.code !== 200 && data.code !== 1) || !data.list || data.list.length === 0) {
      // 如果中文名搜索无结果，尝试用日文名再搜一次
      if (request.subjectNames.length > 1 && request.subjectNames[0] !== keyword) {
        return this.fetchWithKeyword(request.subjectNames[0], request);
      }
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }

    return this.processSearchResults(data, request);
  }

  /**
   * 使用指定关键词搜索（用于中文名无结果时的回退）
   */
  private async fetchWithKeyword(keyword: string, request: MediaFetchRequest): Promise<PagedResult<MediaMatch>> {
    const url = this.buildUrl('/api.php/provide/vod/', { ac: 'videolist', wd: keyword });
    try {
      const res = await fetch(url);
      const data = await res.json();
      if ((data.code !== 200 && data.code !== 1) || !data.list || data.list.length === 0) {
        return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
      }
      return this.processSearchResults(data, request);
    } catch {
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }
  }

  /**
   * 处理搜索结果，提取剧集和播放 URL
   * 如果 videolist 未返回播放 URL，则使用 ac=detail 获取
   */
  private async processSearchResults(data: any, request: MediaFetchRequest): Promise<PagedResult<MediaMatch>> {
    const matches: MediaMatch[] = [];
    const needDetailIds: number[] = [];

    for (const item of data.list) {
      const matchKind = MatchEngine.computeMatchKind(item.vod_name, request);
      if (matchKind === null) continue;

      const playFroms = (item.vod_play_from || '').split('$$$').filter(Boolean);
      const playUrlGroups = (item.vod_play_url || '').split('$$$').filter(Boolean);

      // 如果 videolist 没有返回播放 URL，标记需要 detail 请求
      if (playUrlGroups.length === 0 || (playUrlGroups.length === 1 && playUrlGroups[0] === '')) {
        needDetailIds.push(item.vod_id);
        continue;
      }

      this.extractEpisodesFromPlayUrl(item, playFroms, playUrlGroups, matchKind, request, matches);
    }

    // 对需要 detail 的条目，批量获取播放 URL
    if (needDetailIds.length > 0) {
      const detailIds = needDetailIds.slice(0, 5).join(','); // 最多获取5个
      const detailUrl = this.buildUrl('/api.php/provide/vod/', { ac: 'detail', ids: detailIds });
      try {
        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();
        if ((detailData.code === 200 || detailData.code === 1) && detailData.list) {
          for (const item of detailData.list) {
            const matchKind = MatchEngine.computeMatchKind(item.vod_name, request);
            if (matchKind === null) continue;

            const playFroms = (item.vod_play_from || '').split('$$$').filter(Boolean);
            const playUrlGroups = (item.vod_play_url || '').split('$$$').filter(Boolean);

            this.extractEpisodesFromPlayUrl(item, playFroms, playUrlGroups, matchKind, request, matches);
          }
        }
      } catch (err) {
        console.warn(`[MacCMS:${this.sourceId}] detail 请求失败:`, err);
      }
    }

    console.log(`[MacCMS:${this.sourceId}] 搜索完成, ${matches.length} 条匹配`);
    return {
      items: MatchEngine.sortMatches(matches),
      total: data.total || matches.length,
      page: data.page || 1,
      pagecount: data.pagecount || 1,
      hasMore: (data.page || 1) < (data.pagecount || 1),
    };
  }

  /**
   * 从播放 URL 数据中提取剧集信息并生成 MediaMatch
   */
  private extractEpisodesFromPlayUrl(
    item: any,
    playFroms: string[],
    playUrlGroups: string[],
    matchKind: MatchKind,
    request: MediaFetchRequest,
    matches: MediaMatch[],
  ): void {
    const episodes = playFroms.map((from, idx) => {
      const urlGroup = playUrlGroups[idx] || '';
      const eps = urlGroup.split('#').filter(Boolean).map(ep => {
        const parts = ep.split('$');
        return { name: parts[0] || `第${idx + 1}集`, url: parts[1] || parts[0] };
      });
      return { source: from, episodes: eps };
    });

    // 优先处理 m3u8 源（包含 m3u8 的播放源排在前面）
    const sortedEpisodes = [...episodes].sort((a, b) => {
      const aHasM3u8 = a.episodes.some(ep => ep.url.includes('.m3u8'));
      const bHasM3u8 = b.episodes.some(ep => ep.url.includes('.m3u8'));
      if (aHasM3u8 && !bHasM3u8) return -1;
      if (!aHasM3u8 && bHasM3u8) return 1;
      return 0;
    });

    for (const group of sortedEpisodes) {
      for (const ep of group.episodes) {
        // 从集数名中提取数字（支持 "第1集"、"01"、"第01话"、"EP01" 等格式）
        const epNum = this.extractEpNumber(ep.name);
        const targetEpNum = request.episodeSort ? parseInt(request.episodeSort, 10) : NaN;

        // 集数匹配：数字相等即为精确匹配
        const isEpMatch = !isNaN(epNum) && !isNaN(targetEpNum) && epNum === targetEpNum;
        const finalKind = isEpMatch ? MatchKind.EXACT : matchKind;

        // 跳过没有有效 URL 的条目
        if (!ep.url || ep.url === 'undefined' || ep.url === 'null') continue;

        // Filter out non-playable URLs (share pages, embed pages, etc.)
        // Only keep direct video stream URLs (m3u8, mp4, flv, etc.)
        if (!this.isPlayableUrl(ep.url)) continue;

        const epSortStr = !isNaN(epNum) ? String(epNum) : ep.name;

        const media: Media = {
          mediaId: `${this.sourceId}_${item.vod_id}_${ep.name}`,
          sourceId: this.sourceId,
          title: `${item.vod_name} - ${ep.name}`,
          originalTitle: item.vod_name || '',
          publishedTime: 0,
          location: MediaSourceLocation.ONLINE,
          kind: MediaSourceKind.WEB,
          episodeRange: { sort: epSortStr, name: ep.name },
          download: {
            kind: 'http',
            url: this.buildStreamUrl(ep.url),
            proxyUrl: this.buildProxyUrl(ep.url),
          },
          properties: {
            subjectName: item.vod_name || '',
            episodeName: ep.name || '',
            subtitleLanguageIds: ['CHS'],
            resolution: '',
            alliance: group.source || '',
            size: FileSize.Unspecified,
            subtitleKind: SubtitleKind.EMBEDDED,
            tier: this.info.tier,
            // 旧兼容字段
            vodId: item.vod_id,
            cover: item.vod_pic,
            category: item.vod_class,
            year: item.vod_year,
            area: item.vod_area,
            remarks: item.vod_remarks,
            description: item.vod_content?.replace(/<[^>]+>/g, '') || '',
            playSource: group.source,
          },
        };

        matches.push({ media, matchKind: finalKind });
      }
    }
  }

  /**
   * 从集数名中提取数字。
   * 支持 "第1集"、"01"、"第01话"、"EP01"、"第1话" 等格式。
   */
  private extractEpNumber(name: string): number {
    // 尝试 "第X集/话/話" 格式
    const cnMatch = name.match(/第\s*(\d+)\s*[集话話]/);
    if (cnMatch) return parseInt(cnMatch[1], 10);

    // 尝试 "EP01" 格式
    const epMatch = name.match(/EP\s*(\d+)/i);
    if (epMatch) return parseInt(epMatch[1], 10);

    // 尝试纯数字（"01"、"1"）
    const numMatch = name.match(/^(\d+)$/);
    if (numMatch) return parseInt(numMatch[1], 10);

    // 尝试提取第一个数字
    const anyNum = name.match(/(\d+)/);
    if (anyNum) return parseInt(anyNum[1], 10);

    return NaN;
  }

  /**
   * Check if a URL is a direct playable video stream URL.
   * Filters out share/embed pages that return HTML instead of video content.
   */
  private isPlayableUrl(url: string): boolean {
    const lower = url.toLowerCase();
    // Known video stream formats
    if (lower.includes('.m3u8')) return true;
    if (lower.endsWith('.mp4') || lower.includes('.mp4?')) return true;
    if (lower.endsWith('.flv') || lower.includes('.flv?')) return true;
    if (lower.endsWith('.mkv') || lower.includes('.mkv?')) return true;
    if (lower.endsWith('.avi') || lower.includes('.avi?')) return true;
    if (lower.endsWith('.ts') || lower.includes('.ts?')) return true;
    // CDN video URLs with path patterns like /2026XXXX/xxx/index.m3u8
    if (lower.includes('/index.m3u8')) return true;
    // Known CDN video path patterns (e.g., v.lzcdn27.com/20260410/xxx/)
    // These typically contain date-like segments and end with video content
    if (/\/\d{6,8}\//.test(lower) && !lower.includes('/share/')) return true;
    // Exclude known non-playable patterns
    if (lower.includes('/share/')) return false;  // Share/embed pages
    if (lower.includes('/player/') && !lower.includes('.m3u8')) return false;  // Player pages
    if (lower.includes('/embed/')) return false;  // Embed pages
    // If URL has no video extension and no known CDN pattern, skip it
    // (likely a share page or API endpoint, not a direct stream)
    if (!/\.(m3u8|mp4|flv|mkv|avi|ts|mov|wmv)(\?|$)/i.test(url) && !/\/\d{6,8}\//.test(lower)) {
      return false;
    }
    return true;
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString();
    if (this.proxyBase) {
      return `${this.proxyBase}/api/video/proxy?baseUrl=${encodeURIComponent(this.baseUrl)}&path=${encodeURIComponent(path)}&${query}`;
    }
    return `${this.baseUrl}${path}?${query}`;
  }

  private buildStreamUrl(videoUrl: string): string {
    // 直接返回原始 URL，让前端直连
    // Worker 代理会导致 CDN 检测到海外 IP 返回 404
    // 前端会尝试直连，CORS 失败时回退到 Worker 代理
    return videoUrl;
  }

  /** 构建 Worker 代理 URL（作为 CORS 回退） */
  private buildProxyUrl(videoUrl: string): string {
    if (this.proxyBase) {
      return `${this.proxyBase}/api/video/stream?url=${encodeURIComponent(videoUrl)}&referer=${encodeURIComponent(this.baseUrl + '/')}`;
    }
    return '';
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
  { sourceId: 'lizi', name: '量子资源', baseUrl: 'https://cj.lziapi.com' },
  { sourceId: 'feisu', name: '飞速资源', baseUrl: 'https://www.feisuzyapi.com' },
  { sourceId: 'bfzy', name: '暴风资源', baseUrl: 'https://bfzyapi.com' },
  { sourceId: 'kuaikan', name: '快看资源', baseUrl: 'https://www.kuaikan-api.com' },
  { sourceId: 'ffzy', name: '非凡资源', baseUrl: 'https://cj.ffzyapi.com' },
  { sourceId: '919dm', name: '樱花动漫', baseUrl: 'https://www.919dm.com' },
];
