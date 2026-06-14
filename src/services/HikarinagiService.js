// src/services/HikarinagiService.js
// Hikarinagi（光凪）API 封装 — Galgame & 轻小说数据源
// 通过 Cloudflare Worker 代理 /api/hikarinagi/* 访问

import { StorageService } from './storage';
import { openDB } from 'idb';
import oauthConfig from '../../oauth.config.js';

const API_BASE = 'https://www.hikarinagi.org/api/v2';
const PROXY_PREFIX = '/api/hikarinagi';
const CACHE_TTL = 10 * 60 * 1000; // 10 分钟
const REQUEST_TIMEOUT = 12000;
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 2000];

function getProxyBase() {
  return oauthConfig.proxyUrl || '';
}

function proxyUrl(path) {
  return `${getProxyBase()}${PROXY_PREFIX}${path}`;
}

// ─── IndexedDB 缓存 ───
const IDB_DB = 'anispace-cache';
const IDB_STORE = 'hikarinagi-cache';
const MAX_CACHE_ENTRIES = 150;

let _dbPromise = null;

function getDB() {
  if (!_dbPromise) {
    _dbPromise = openDB(IDB_DB, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'key' });
          }
        }
      },
    });
  }
  return _dbPromise;
}

async function cacheGet(key) {
  try {
    const db = await getDB();
    const entry = await db.get(IDB_STORE, key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      await db.delete(IDB_STORE, key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

async function cacheSet(key, data) {
  try {
    const db = await getDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const count = await store.count();
    if (count > MAX_CACHE_ENTRIES) {
      const allKeys = await store.getAllKeys();
      const toDelete = allKeys.slice(0, count - MAX_CACHE_ENTRIES + 20);
      for (const k of toDelete) await store.delete(k);
    }
    await store.put({ key, data, timestamp: Date.now() });
    await tx.done;
  } catch { /* 缓存写入失败不影响主流程 */ }
}

// ─── 请求去重 ───
const _inFlight = new Map();

async function request(path, params = {}, options = {}) {
  const { useCache = true, method = 'GET', body } = options;

  const searchStr = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  ).toString();
  const fullPath = searchStr ? `${path}?${searchStr}` : path;
  const cacheKey = `hk_${fullPath}`;

  // 去重
  if (_inFlight.has(cacheKey)) return _inFlight.get(cacheKey);

  const promise = _doRequest(fullPath, cacheKey, useCache, method, body, 0);
  _inFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    _inFlight.delete(cacheKey);
  }
}

async function _doRequest(fullPath, cacheKey, useCache, method, body, retryCount) {
  // 缓存读取
  if (useCache && method === 'GET') {
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;
  }

  const url = proxyUrl(fullPath);
  const headers = { 'Accept': 'application/json' };

  // 透传 hikari_access_token（如有）
  const hikariToken = StorageService.get('hikari_access_token');
  if (hikariToken) headers['Authorization'] = `Bearer ${hikariToken}`;

  const fetchOptions = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const error = new Error(`Hikarinagi API ${res.status}: ${errText}`);
      error.status = res.status;

      if ((res.status >= 500 || res.status === 429) && retryCount < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[retryCount] || 2000));
        return _doRequest(fullPath, cacheKey, false, method, body, retryCount + 1);
      }
      throw error;
    }

    const data = await res.json();

    // Hikarinagi API 统一返回 { success, code, data, message }
    // 提取内层 data 字段，简化调用方使用
    const result = data?.success && 'data' in data ? data.data : data;

    // 缓存 GET 响应
    if (method === 'GET') {
      cacheSet(cacheKey, result).catch(() => {});
    }

    return result;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Hikarinagi API 请求超时');
    }
    throw err;
  }
}

// ─── Galgame API ───

export const HikarinagiGalgameService = {
  /** 分页获取 Galgame 列表 */
  async getList(params = {}) {
    return request('/galgame/list', params);
  },

  /** 获取全部 Galgame（轻量列表） */
  async getAllList() {
    return request('/galgame/list/all');
  },

  /** 获取 Galgame 详情 */
  async getById(id) {
    return request(`/galgame/${id}`);
  },

  /** 随机获取一个 Galgame */
  async getRandom() {
    return request('/galgame/random', {}, { useCache: false });
  },

  /** 月度发售列表 */
  async getMonthlyReleases(params = {}) {
    return request('/galgame/monthly-releases', params);
  },

  /** 通过 Bangumi ID 关联查询 */
  async getByBangumiId(bangumiId) {
    return request(`/galgame/bangumi/${bangumiId}`);
  },

  /** 获取下载信息 */
  async getDownloadInfo(id) {
    return request(`/galgame/${id}/download-info`);
  },

  /** 获取游戏链接 */
  async getLinks(id) {
    return request(`/galgame/${id}/links`);
  },

  /** 获取相关游戏 */
  async getRelated(id) {
    return request(`/galgame/${id}/related`);
  },
};

// ─── LightNovel API ───

export const HikarinagiLightNovelService = {
  /** 分页获取轻小说列表 */
  async getList(params = {}) {
    return request('/lightnovel/list', params);
  },

  /** 获取全部轻小说（轻量列表） */
  async getAllList() {
    return request('/lightnovel/list/all');
  },

  /** 获取轻小说详情 */
  async getById(id) {
    return request(`/lightnovel/${id}`);
  },

  /** 热门轻小说 */
  async getPopular() {
    return request('/lightnovel/popular');
  },

  /** 推荐轻小说 */
  async getRecommend() {
    return request('/lightnovel/recommend');
  },

  /** 最近更新 */
  async getRecent() {
    return request('/lightnovel/recent');
  },

  /** 最近出版 */
  async getRecentPublished() {
    return request('/lightnovel/recent/published');
  },

  /** 文库推荐 */
  async getRecommendByBunko() {
    return request('/lightnovel/recommend/bunko');
  },

  /** 随机获取一个轻小说 */
  async getRandom() {
    return request('/lightnovel/random', {}, { useCache: false });
  },

  /** 通过 Bangumi ID 关联查询 */
  async getByBangumiId(bangumiId) {
    return request(`/lightnovel/bangumi/${bangumiId}`);
  },

  /** 通过 Bangumi ID 查询分卷 */
  async getBangumiVolume(bangumiId) {
    return request(`/lightnovel/bangumi/volume/${bangumiId}`);
  },

  /** 获取系列下载链接 */
  async getSeriesDownloadUrls(novelId) {
    return request(`/lightnovel/download-series/${novelId}`);
  },

  /** 获取分卷详情 */
  async getVolumeById(volumeId) {
    return request(`/lightnovel/volume/${volumeId}`);
  },
};

// ─── PageData API ───

export const HikarinagiPageService = {
  /** 推荐 Galgame */
  async getRecommendGalgames() {
    return request('/page-data/recommend-galgames');
  },

  /** 热门评论 */
  async getHotComments() {
    return request('/page-data/hot-comments');
  },

  /** 最近评分 */
  async getRecentRates() {
    return request('/page-data/recent-rates');
  },

  /** 热门点评 */
  async getHotReviews() {
    return request('/page-data/hot-reviews');
  },

  /** 推荐制作组 */
  async getRecommendProducers() {
    return request('/page-data/recommend-producers');
  },

  /** 首页新闻 */
  async getHomeNews() {
    return request('/page-data/home-news');
  },

  /** 社区动态 */
  async getCommunityFeed() {
    return request('/page-data/community-feed');
  },

  /** 相关内容 */
  async getRelatedContent() {
    return request('/page-data/related-content');
  },

  /** 友情链接 */
  async getFriendLinks() {
    return request('/page-data/friend-links');
  },

  /** UI 组件 */
  async getUIComponents() {
    return request('/page-data/ui-component');
  },
};

// ─── Search API ───

export const HikarinagiSearchService = {
  /** 搜索 */
  async search(params = {}) {
    // Hikarinagi 搜索 API 要求 type 和 relative_match 参数
    const searchParams = {
      keyword: params.keyword || '',
      type: params.type || 'galgame', // galgame | novel | character | person | producer | topic | tag
      page: params.page || 1,
      limit: params.limit || 20,
      relative_match: false, // 必须显式传 false，否则报 400
    };
    return request('/search', searchParams, { useCache: false });
  },

  /** 热搜 */
  async getTrending() {
    return request('/search/trending');
  },

  /** 搜索建议 */
  async getSuggest(params = {}) {
    return request('/search/suggest', params);
  },

  /** 搜索版块 */
  async searchSections(params = {}) {
    return request('/search/sections', params);
  },

  /** 搜索话题 */
  async searchTopics(params = {}) {
    return request('/search/topics', params);
  },
};

// ─── Community API ───

export const HikarinagiCommunityService = {
  /** 社区首页数据 */
  async getHomeData() {
    return request('/community/home-data');
  },

  /** 热门话题 */
  async getHotTopics() {
    return request('/community/hot-topics');
  },

  /** 热门版块 */
  async getHotSections() {
    return request('/community/hot-sections');
  },

  /** 社区内容列表 */
  async getContentList(params = {}) {
    return request('/community/content-list', params);
  },

  /** 社区公告 */
  async getAnnouncements() {
    return request('/community/announcements');
  },

  /** 活跃用户 */
  async getActiveUsers() {
    return request('/community/active-users');
  },

  /** 社区统计 */
  async getCommunityStats() {
    return request('/community/community-stats');
  },

  /** 热门标签 */
  async getPopularTags() {
    return request('/community/popular-tags');
  },

  /** 精选内容 */
  async getFeaturedContent() {
    return request('/community/featured-content');
  },

  /** 社区版块 */
  async getSections() {
    return request('/community/sections');
  },
};

// ─── Entity API（Character / Person / Producer / Tag） ───

export const HikarinagiEntityService = {
  /** 角色详情 */
  async getCharacter(id) {
    return request(`/character/${id}`);
  },

  /** 人物详情 */
  async getPerson(id) {
    return request(`/person/${id}`);
  },

  /** 制作组详情 */
  async getProducer(id) {
    return request(`/producer/${id}`);
  },

  /** 按名称查找制作组 */
  async findProducerByName(name) {
    return request('/producer/find/' + encodeURIComponent(name));
  },

  /** 标签详情 */
  async getTag(id) {
    return request(`/tag/${id}`);
  },

  /** 按名称查找标签 */
  async findTagByName(name) {
    return request('/tag/find/' + encodeURIComponent(name));
  },
};

// ─── Rate API（公开部分） ───

export const HikarinagiRateService = {
  /** 获取评分列表 */
  async getRates(params = {}) {
    return request('/rate', params);
  },

  /** 获取点评列表 */
  async getReviews(params = {}) {
    return request('/rate/review', params);
  },
};

// ─── Favorite API（公开部分） ───

export const HikarinagiFavoriteService = {
  /** 热门收藏 Galgame */
  async getFavoriteGalgames() {
    return request('/favorite/galgames');
  },

  /** 热门收藏轻小说 */
  async getFavoriteLightNovels() {
    return request('/favorite/lightnovels');
  },

  /** 热门收藏文章 */
  async getFavoriteArticles() {
    return request('/favorite/articles');
  },

  /** 热门收藏帖子 */
  async getFavoritePosts() {
    return request('/favorite/posts');
  },
};

// ─── 统一导出 ───

const HikarinagiService = {
  galgame: HikarinagiGalgameService,
  lightnovel: HikarinagiLightNovelService,
  page: HikarinagiPageService,
  search: HikarinagiSearchService,
  community: HikarinagiCommunityService,
  entity: HikarinagiEntityService,
  rate: HikarinagiRateService,
  favorite: HikarinagiFavoriteService,
};

export default HikarinagiService;
