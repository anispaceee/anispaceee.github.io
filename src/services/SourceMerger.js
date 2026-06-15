// src/services/SourceMerger.js

import { AniListService } from './AniListService';
import { KitsuService } from './KitsuService';
import HikarinagiService from './HikarinagiService';
import { BangumiService } from './api';

// 简单的标题相似度计算（Levenshtein 距离的简化版）
function calculateSimilarity(a, b) {
  if (!a || !b) return 0;
  const sa = a.toLowerCase().trim();
  const sb = b.toLowerCase().trim();
  if (sa === sb) return 1;
  if (sa.includes(sb) || sb.includes(sa)) return 0.85;

  // 简单的字符重叠率
  const setA = new Set(sa);
  const setB = new Set(sb);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

export const SourceMerger = {
  _cache: new Map(), // bgmId -> merged data

  clearCache() {
    this._cache.clear();
  },

  async mergeAnimeData(bgmSubject) {
    const bgmId = bgmSubject?.id;
    if (!bgmId) return { anilist: null, kitsu: null };

    // 检查缓存
    if (this._cache.has(bgmId)) {
      return this._cache.get(bgmId);
    }

    const result = { anilist: null, kitsu: null };

    // 并行查询 AniList 和 Kitsu
    const [anilistResult, kitsuResult] = await Promise.allSettled([
      this._findAniList(bgmSubject),
      this._findKitsu(bgmSubject),
    ]);

    if (anilistResult.status === 'fulfilled' && anilistResult.value) {
      result.anilist = anilistResult.value;
    }
    if (kitsuResult.status === 'fulfilled' && kitsuResult.value) {
      result.kitsu = kitsuResult.value;
    }

    this._cache.set(bgmId, result);
    return result;
  },

  // ─── Hikarinagi 名字匹配合并 ───

  async mergeHikarinagiData(bgmSubject) {
    const bgmId = bgmSubject?.id;
    if (!bgmId) return null;

    // 仅游戏(type=4)和小说(type=1)走 Hikarinagi 合并
    if (bgmSubject.type !== 4 && bgmSubject.type !== 1) return null;

    const cacheKey = `hk_${bgmId}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const hkMatch = await this._findHikarinagi(bgmSubject);
    if (!hkMatch) {
      this._cache.set(cacheKey, null);
      return null;
    }

    // 并行获取补充数据
    const hkId = hkMatch.galId || hkMatch.novelId || hkMatch.id;
    const isGalgame = bgmSubject.type === 4;

    // 获取详情（含评分等完整数据）
    const [detail, downloadInfo, links, related] = await Promise.allSettled([
      isGalgame
        ? HikarinagiService.galgame.getById(hkId)
        : HikarinagiService.lightnovel.getById(hkId),
      isGalgame
        ? HikarinagiService.galgame.getDownloadInfo(hkId)
        : HikarinagiService.lightnovel.getSeriesDownloadUrls(hkId),
      isGalgame ? HikarinagiService.galgame.getLinks(hkId) : Promise.resolve(null),
      isGalgame ? HikarinagiService.galgame.getRelated(hkId) : Promise.resolve(null),
    ]);

    const result = {
      match: hkMatch,
      detail: detail.status === 'fulfilled' ? detail.value : null,
      downloadInfo: downloadInfo.status === 'fulfilled' ? downloadInfo.value : null,
      links: links.status === 'fulfilled' ? links.value : null,
      related: related.status === 'fulfilled' ? related.value : null,
    };

    this._cache.set(cacheKey, result);
    return result;
  },

  async _findHikarinagi(bgmSubject) {
    const type = bgmSubject.type === 4 ? 'galgame' : bgmSubject.type === 1 ? 'novel' : null;
    if (!type) return null;

    const titles = [bgmSubject.name, bgmSubject.name_cn].filter(Boolean);
    for (const title of titles) {
      try {
        const results = await HikarinagiService.search.search({ keyword: title, type, limit: 3 });
        // Hikarinagi 搜索返回 { items: [...], meta: {...} }
        const items = Array.isArray(results) ? results : results?.items || results?.list || [];
        for (const item of items) {
          // Hikarinagi 字段：originTitle（数组，含日文名和英文名）、transTitle（中文名）
          const hkTitles = [
            ...(Array.isArray(item.originTitle) ? item.originTitle : []),
            item.transTitle,
            item.name,
            item.nameCn,
          ].filter(Boolean);
          for (const ht of hkTitles) {
            for (const bt of titles) {
              if (calculateSimilarity(ht, bt) > 0.85) {
                return item;
              }
            }
          }
        }
      } catch { /* 搜索失败，跳过 */ }
    }
    return null;
  },

  // 过滤相关推荐：仅保留能在 Bangumi 中搜到的条目
  async filterRelatedByBangumi(relatedItems, bgmType) {
    if (!relatedItems || relatedItems.length === 0) return [];

    const typeCode = bgmType === 4 ? 4 : 1;
    const toCheck = relatedItems.slice(0, 5);

    const results = await Promise.allSettled(
      toCheck.map(item => {
        const name = item.name || item.nameCn;
        if (!name) return Promise.resolve(null);
        return BangumiService.searchSubjects(name, typeCode, 1, 0)
          .then(res => {
            const match = res.list?.[0];
            if (match) {
              const matchName = match.name || match.name_cn;
              if (calculateSimilarity(matchName, name) > 0.85) {
                return { ...item, bgmSubject: match };
              }
            }
            return null;
          })
          .catch(() => null);
      })
    );

    const verified = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) verified.push(r.value);
    }
    return verified;
  },

  async _findAniList(bgmSubject) {
    if (!AniListService.isAvailable()) {
      const available = await AniListService.checkAvailability();
      if (!available) return null;
    }

    // 策略1: 精确匹配 — 通过标题搜索后检查 externalLinks
    const titles = [
      bgmSubject.name, // 日文标题
      bgmSubject.name_cn, // 中文标题
    ].filter(Boolean);

    for (const title of titles) {
      try {
        const results = await AniListService.searchAnime(title, 1, 5);
        for (const media of results) {
          // 检查 externalLinks 是否包含 Bangumi 链接
          const bgmLink = media.externalLinks?.find(
            link => link.site?.toLowerCase().includes('bangumi') ||
                    link.url?.includes('bangumi.tv')
          );
          if (bgmLink) {
            // 从 URL 提取 bgmId
            const match = bgmLink.url?.match(/\/(\d+)/);
            if (match && parseInt(match[1]) === bgmId) {
              return media; // 精确匹配
            }
          }

          // 模糊匹配：标题相似度 > 0.8
          const mediaTitles = [media.title?.native, media.title?.romaji, media.title?.english].filter(Boolean);
          for (const mt of mediaTitles) {
            for (const bt of titles) {
              if (calculateSimilarity(mt, bt) > 0.8) {
                return media;
              }
            }
          }
        }
      } catch { /* 查询失败，跳过 */ }
    }

    return null;
  },

  async _findKitsu(bgmSubject) {
    if (!KitsuService.isAvailable()) {
      const available = await KitsuService.checkAvailability();
      if (!available) return null;
    }

    const titles = [
      bgmSubject.name,
      bgmSubject.name_cn,
    ].filter(Boolean);

    for (const title of titles) {
      try {
        const results = await KitsuService.searchAnime(title, 3);
        for (const anime of results) {
          const parsed = KitsuService.parseAnime(anime);
          if (!parsed) continue;

          const kitsuTitles = [parsed.title.en, parsed.title.en_jp, parsed.title.ja_jp].filter(Boolean);
          for (const kt of kitsuTitles) {
            for (const bt of titles) {
              if (calculateSimilarity(kt, bt) > 0.8) {
                return parsed;
              }
            }
          }
        }
      } catch { /* 查询失败，跳过 */ }
    }

    return null;
  },
};
