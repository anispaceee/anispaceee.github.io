// src/services/media/sources/DmhySource.ts
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

const DMHY_FACTORY_ID = 'dmhy';
const DMHY_BASE_URL = 'https://share.dmhy.org';

interface DmhyResult {
  title: string;
  magnetLink: string;
  size: string;
  subtitleGroup: string;
}

class DmhySource implements MediaSource {
  readonly sourceId = DMHY_FACTORY_ID;
  readonly kind = MediaSourceKind.BITTORRENT;
  readonly info: MediaSourceInfo = {
    displayName: '动漫花园',
    description: 'DMHY BT资源站',
    websiteUrl: DMHY_BASE_URL,
    tier: 3,
  };

  private proxyBase: string;

  constructor(_sourceId: string, _config: SourceConfig) {
    this.proxyBase = oauthConfig.proxyUrl || '';
  }

  async checkConnection(): Promise<ConnectionStatus> {
    try {
      const url = this.buildProxyUrl('');
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const text = await res.text();
        return text.includes('dmhy') || text.includes('动漫花园')
          ? ConnectionStatus.AVAILABLE
          : ConnectionStatus.UNAVAILABLE;
      }
      return ConnectionStatus.UNAVAILABLE;
    } catch {
      return ConnectionStatus.TIMEOUT;
    }
  }

  async fetch(request: MediaFetchRequest): Promise<PagedResult<MediaMatch>> {
    const keyword = this.buildKeyword(request);
    const url = this.buildProxyUrl(keyword);
    const res = await fetch(url);

    if (!res.ok) {
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }

    const html = await res.text();
    const results = this.parseHtml(html);

    if (results.length === 0) {
      return { items: [], total: 0, page: 1, pagecount: 0, hasMore: false };
    }

    const matches: MediaMatch[] = [];

    for (const result of results) {
      const matchKind = MatchEngine.computeMatchKind(result.title, request);
      if (matchKind === null) continue;

      // 标题匹配番剧名 → FUZZY；标题同时包含精确集数 → EXACT
      let finalKind = matchKind;
      if (matchKind === MatchKind.FUZZY && request.episodeSort) {
        if (MatchEngine.matchEpisode(result.title, request.episodeSort)) {
          finalKind = MatchKind.EXACT;
        }
      }

      const infoHash = this.extractInfoHash(result.magnetLink);

      const media: Media = {
        mediaId: `dmhy_${infoHash}`,
        sourceId: this.sourceId,
        title: result.title,
        originalTitle: result.title,
        publishedTime: 0,
        location: MediaSourceLocation.ONLINE,
        kind: MediaSourceKind.BITTORRENT,
        episodeRange: { sort: request.episodeSort },
        download: {
          kind: 'magnet',
          url: result.magnetLink,
        },
        properties: {
          subjectName: '',
          episodeName: '',
          subtitleLanguageIds: result.subtitleGroup ? ['CHS'] : [],
          resolution: '',
          alliance: result.subtitleGroup || '',
          size: result.size
            ? FileSize.of(parseFloat(result.size) || 0, result.size.replace(/[0-9.]/g, '').toUpperCase())
            : FileSize.Unspecified,
          subtitleKind: SubtitleKind.CLOSED_OR_EXTERNAL_DISCOVER,
          tier: this.info.tier,
          // 旧兼容字段
          fileSize: result.size,
          subtitleGroup: result.subtitleGroup,
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

  private buildKeyword(request: MediaFetchRequest): string {
    const subjectName = request.subjectNames[0] || '';
    const episodeSort = request.episodeSort || '';
    return `${subjectName} ${episodeSort}`.trim();
  }

  private buildProxyUrl(keyword: string): string {
    if (this.proxyBase) {
      return `${this.proxyBase}/api/video/dmhy?keyword=${encodeURIComponent(keyword)}`;
    }
    // 无代理时直接请求（浏览器环境可能因 CORS 失败）
    return `${DMHY_BASE_URL}/topics/list?keyword=${encodeURIComponent(keyword)}`;
  }

  private parseHtml(html: string): DmhyResult[] {
    const results: DmhyResult[] = [];

    // 提取表格体中的行：DMHY 搜索结果在 class="tablesorter" 的表格中
    // 每个资源行包含发布时间、分类、标题（含字幕组）、大小、链接等
    const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const rows = html.match(rowPattern);

    if (!rows) return results;

    for (const row of rows) {
      // 跳过表头行
      if (row.includes('tablesorter') || row.includes('<th')) continue;

      // 提取标题：DMHY 的标题在 class="title" 的 <a> 标签中
      const titleMatch = row.match(
        /<a[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/i,
      );
      if (!titleMatch) continue;

      // 清理标题中的 HTML 标签和多余空白
      const rawTitle = titleMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();

      if (!rawTitle) continue;

      // 提取磁力链接
      const magnetMatch = row.match(/href="(magnet:\?[^"]+)"/i);
      if (!magnetMatch) continue;
      const magnetLink = magnetMatch[1];

      // 提取文件大小
      const sizeMatch = row.match(
        /(\d+\.?\d*\s*(?:GB|MB|TB|gb|mb|tb))/i,
      );
      const size = sizeMatch ? sizeMatch[1] : '';

      // 提取字幕组/发布团队：DMHY 中字幕组信息通常在标题前的分类链接或标题内
      // 尝试从标题中提取 【字幕组】 格式
      const teamMatch = rawTitle.match(/【([^】]+)】/);
      const subtitleGroup = teamMatch ? teamMatch[1] : '';

      results.push({
        title: rawTitle,
        magnetLink,
        size,
        subtitleGroup,
      });
    }

    return results;
  }

  private extractInfoHash(magnetLink: string): string {
    // 磁力链接格式：magnet:?xt=urn:btih:INFOHASH&...
    const hashMatch = magnetLink.match(/btih:([a-fA-F0-9]{40})/i);
    if (hashMatch) return hashMatch[1].toLowerCase();

    // 某些磁力链接使用 Base32 编码的 hash（32字符）
    const base32Match = magnetLink.match(/btih:([A-Z2-7]{32})/i);
    if (base32Match) return base32Match[1].toLowerCase();

    // 回退：取 xt 参数值
    const xtMatch = magnetLink.match(/xt=urn:btih:([^&]+)/i);
    return xtMatch ? xtMatch[1].toLowerCase() : String(Date.now());
  }
}

export class DmhySourceFactory implements MediaSourceFactory {
  readonly factoryId = DMHY_FACTORY_ID;
  readonly allowMultipleInstances = false;
  readonly parameters: SourceParameter[] = [];
  readonly info: MediaSourceInfo = {
    displayName: '动漫花园',
    description: 'DMHY BT资源站',
    websiteUrl: DMHY_BASE_URL,
    tier: 3,
  };

  create(sourceId: string, config: SourceConfig): MediaSource {
    return new DmhySource(sourceId, config);
  }
}
