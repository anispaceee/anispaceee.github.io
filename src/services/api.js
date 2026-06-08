import { StorageService } from './storage';
import oauthConfig from '../../oauth.config.js';

const { STORAGE_KEYS: SK } = StorageService;

const CACHE_TTL = 30 * 60 * 1000;
const REQUEST_TIMEOUT = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
const NON_RETRYABLE_STATUS = [400, 401, 403, 404, 405, 410];

class ApiError extends Error {
  constructor(message, status = 0, code = 'UNKNOWN') {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }

  get isRetryable() {
    if (NON_RETRYABLE_STATUS.includes(this.status)) return false;
    if (this.code === 'OFFLINE') return false;
    if (this.code === 'NETWORK_ERROR') return true;
    if (this.status >= 500) return true;
    if (this.status === 429) return true;
    return false;
  }

  get userMessage() {
    switch (this.code) {
      case 'OFFLINE': return '网络连接已断开，请检查网络设置';
      case 'NETWORK_ERROR': return '网络请求异常，请检查网络连接';
      case 'TIMEOUT': return '请求超时，请稍后重试';
      case 'RATE_LIMITED': return '请求过于频繁，请稍后再试';
      case 'NOT_FOUND': return '请求的内容不存在';
      case 'FORBIDDEN': return '无权访问该内容';
      case 'SERVER_ERROR': return '服务器暂时不可用，请稍后重试';
      case 'INVALID_DATA': return '返回数据格式异常';
      default: return this.message || '请求失败，请重试';
    }
  }
}

class CacheManager {
  static get(key) {
    const cache = StorageService.get(SK.BANGUMI_CACHE, {});
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      delete cache[key];
      StorageService.set(SK.BANGUMI_CACHE, cache);
      return null;
    }
    return entry.data;
  }

  static set(key, data) {
    const cache = StorageService.get(SK.BANGUMI_CACHE, {});
    cache[key] = { data, timestamp: Date.now() };
    try {
      StorageService.set(SK.BANGUMI_CACHE, cache);
    } catch {
      const cache2 = {};
      cache2[key] = { data, timestamp: Date.now() };
      StorageService.set(SK.BANGUMI_CACHE, cache2);
    }
  }

  static clear() {
    StorageService.set(SK.BANGUMI_CACHE, {});
  }

  static clearAll() {
    StorageService.remove(SK.BANGUMI_CACHE);
  }
}

function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createTimeoutController(timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return { controller, timer };
}

function validateSubject(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    id: data.id || 0,
    type: data.type || 0,
    name: data.name || '',
    name_cn: data.name_cn || '',
    summary: data.summary || '',
    images: data.images || {},
    rating: data.rating || { score: 0, total: 0, count: {} },
    tags: Array.isArray(data.tags) ? data.tags : [],
    eps: data.eps || 0,
    eps_count: data.eps_count || 0,
    air_date: data.air_date || '',
    air_weekday: data.air_weekday || 0,
    collection: data.collection || {},
    rank: data.rank || 0,
    meta: data.meta || '',
    date: data.date || '',
    platform: data.platform || '',
    volumes: data.volumes || 0,
    total_episodes: data.total_episodes || 0,
    infobox: Array.isArray(data.infobox) ? data.infobox : [],
    crt: Array.isArray(data.crt) ? data.crt : [],
    staff: Array.isArray(data.staff) ? data.staff : [],
    topic: Array.isArray(data.topic) ? data.topic : [],
    blog: Array.isArray(data.blog) ? data.blog : [],
    related: Array.isArray(data.related) ? data.related : [],
    _loadedAt: Date.now(),
  };
}

function normalizeSubject(item) {
  if (!item) return null;
  return {
    id: item.id,
    type: item.type,
    name: item.name || '',
    name_cn: item.name_cn || item.nameCn || '',
    summary: item.summary || '',
    image: item.images?.common || item.images?.medium || item.image || '',
    images: item.images || {},
    score: item.rating?.score || item.score || 0,
    rating: item.rating || { score: 0, total: 0, count: {} },
    tags: Array.isArray(item.tags)
      ? item.tags.map(t => typeof t === 'string' ? t : t.name).filter(Boolean)
      : [],
    eps: item.eps || item.eps_count || 0,
    air_date: item.air_date || '',
    platform: item.platform || '',
    rank: item.rank || 0,
    collection: item.collection || {},
    url: item.url || '',
    infobox: item.infobox || [],
    crt: item.crt || [],
    staff: item.staff || [],
  };
}

function generateId(items) {
  return items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
}

export { ApiError, CacheManager, isOnline, validateSubject, normalizeSubject };
export { StorageService } from './storage';

export const AuthService = {
  loginWithOAuth(provider, oauthUser) {
    const users = StorageService.get(SK.USERS, []);
    // 查找已有用户（按 provider + providerId）
    const existing = users.find(u => u.provider === provider && u.providerId === String(oauthUser.id));
    if (existing) {
      if (existing.status === 'disabled') return { error: '账户已被禁用' };
      existing.lastLogin = new Date().toISOString().split('T')[0];
      if (oauthUser.nickname && existing.name !== oauthUser.nickname) existing.name = oauthUser.nickname;
      if (oauthUser.avatar) existing.avatar = oauthUser.avatar;
      if (oauthUser.bio && !existing.bio) existing.bio = oauthUser.bio;
      StorageService.set(SK.USERS, users);
      const token = `token_${existing.id}_${Date.now()}`;
      StorageService.set(SK.AUTH_TOKEN, token);
      StorageService.set(SK.CURRENT_USER, existing);
      return { user: existing, token };
    }
    // 创建新用户
    const newUser = {
      id: generateId(users),
      username: oauthUser.username || `user_${Date.now()}`,
      provider,
      providerId: String(oauthUser.id),
      name: oauthUser.nickname || oauthUser.username || '新用户',
      avatar: oauthUser.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${oauthUser.username || Date.now()}`,
      level: 1, sign: '', gender: 'other', birthday: '', bio: oauthUser.bio || '',
      followingCount: 0, followerCount: 0, postCount: 0,
      joinDate: new Date().toISOString().split('T')[0],
      lastLogin: new Date().toISOString().split('T')[0],
      status: 'active',
      preferences: { worldChannel: 'all', theme: 'light', emailNotifications: true },
    };
    users.push(newUser);
    StorageService.set(SK.USERS, users);
    const token = `token_${newUser.id}_${Date.now()}`;
    StorageService.set(SK.AUTH_TOKEN, token);
    StorageService.set(SK.CURRENT_USER, newUser);
    return { user: newUser, token };
  },
  logout() { StorageService.remove(SK.AUTH_TOKEN); StorageService.remove(SK.CURRENT_USER); },
  getCurrentUser() { return StorageService.get(SK.CURRENT_USER); },
  isAuthenticated() { return !!StorageService.get(SK.AUTH_TOKEN); },
  updateProfile(userId, updates) {
    const users = StorageService.get(SK.USERS, []);
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return { error: '用户不存在' };
    users[idx] = { ...users[idx], ...updates };
    StorageService.set(SK.USERS, users);
    const cur = StorageService.get(SK.CURRENT_USER);
    if (cur && cur.id === userId) StorageService.set(SK.CURRENT_USER, users[idx]);
    return { user: users[idx] };
  },
};

export const UserService = {
  getById(id) { return StorageService.get(SK.USERS, []).find(u => u.id === id); },
  search(query) { return StorageService.get(SK.USERS, []).filter(u => u.name.includes(query) || u.username.includes(query)); },
  follow(currentUserId, targetUserId) {
    let follows = StorageService.get(SK.FOLLOWS, []);
    const existing = follows.find(f => f.from === currentUserId && f.to === targetUserId);
    if (existing) { follows = follows.filter(f => f !== existing); StorageService.set(SK.FOLLOWS, follows); return { following: false }; }
    follows.push({ from: currentUserId, to: targetUserId, date: new Date().toISOString() });
    StorageService.set(SK.FOLLOWS, follows); return { following: true };
  },
  isFollowing(currentUserId, targetUserId) { return StorageService.get(SK.FOLLOWS, []).some(f => f.from === currentUserId && f.to === targetUserId); },
};

export const BangumiService = {
  BASE_URL: 'https://api.bgm.tv',
  USER_AGENT: 'ANISpace/1.0 (https://github.com/anispace)',

  // 获取代理后的请求 URL
  // 生产环境：通过 Cloudflare Worker 代理（proxyUrl + /api/bangumi + 路径）
  // 开发环境：直连 api.bgm.tv
  _proxyUrl(url) {
    const proxyBase = oauthConfig.proxyUrl;
    if (!proxyBase) return url;
    return url.replace(this.BASE_URL, `${proxyBase}/api/bangumi`);
  },

  _headers() {
    return { 'User-Agent': this.USER_AGENT, 'Accept': 'application/json' };
  },

  _cacheKey(endpoint, params = '') {
    return `bgm_${endpoint}_${params}`;
  },

  async _request(url, cacheKey = null, useCache = true, retryCount = 0) {
    if (!isOnline()) {
      if (useCache && cacheKey) {
        const cached = CacheManager.get(cacheKey);
        if (cached) return cached;
      }
      throw new ApiError('网络连接已断开，请检查网络设置', 0, 'OFFLINE');
    }

    if (useCache && cacheKey) {
      const cached = CacheManager.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const { controller, timer } = createTimeoutController(REQUEST_TIMEOUT);
      const targetUrl = this._proxyUrl(url);
      const res = await fetch(targetUrl, {
        headers: this._headers(),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        let code = 'API_ERROR';
        if (res.status === 429) code = 'RATE_LIMITED';
        else if (res.status === 404) code = 'NOT_FOUND';
        else if (res.status === 403) code = 'FORBIDDEN';
        else if (res.status >= 500) code = 'SERVER_ERROR';

        const error = new ApiError(`API请求失败 (${res.status})`, res.status, code);

        if (error.isRetryable && retryCount < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[retryCount] || 4000);
          return this._request(url, cacheKey, false, retryCount + 1);
        }

        throw error;
      }

      const data = await res.json();
      if (cacheKey) CacheManager.set(cacheKey, data);
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;

      if (err.name === 'AbortError') {
        const error = new ApiError('请求超时，请稍后重试', 0, 'TIMEOUT');
        if (retryCount < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[retryCount] || 4000);
          return this._request(url, cacheKey, false, retryCount + 1);
        }
        throw error;
      }

      const error = new ApiError('网络请求异常，请检查网络连接', 0, 'NETWORK_ERROR');
      if (retryCount < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[retryCount] || 4000);
        return this._request(url, cacheKey, false, retryCount + 1);
      }
      throw error;
    }
  },

  async searchSubjects(keyword, type = 0, limit = 20, offset = 0) {
    const filter = {};
    if (type && type > 0) {
      filter.type = [type];
    } else {
      filter.type = [1, 2, 4];
    }
    const url = `${this.BASE_URL}/v0/search/subjects?limit=${limit}&offset=${offset}`;
    const body = JSON.stringify({
      keyword,
      filter,
      sort: 'match',
    });
    try {
      const targetUrl = this._proxyUrl(url);
      const { controller, timer } = createTimeoutController(REQUEST_TIMEOUT);
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status === 429) throw new ApiError('请求过于频繁', res.status, 'RATE_LIMITED');
        if (res.status === 404) throw new ApiError('未找到结果', res.status, 'NOT_FOUND');
        throw new ApiError(`搜索失败 (${res.status})`, res.status);
      }
      const data = await res.json();
      if (data && data.data) {
        return {
          list: data.data.map(normalizeSubject).filter(Boolean),
          results: data.total || 0,
          total: data.total || 0,
          offset: data.offset || 0,
          limit: data.limit || limit,
        };
      }
      return { list: [], results: 0, total: 0, offset: 0, limit };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('搜索请求异常', 0, 'NETWORK_ERROR');
    }
  },

  async getSubject(id) {
    const url = `${this.BASE_URL}/subject/${id}`;
    const data = await this._request(url, this._cacheKey('subject', String(id)));
    return validateSubject(data);
  },

  async getSubjectDetail(id) {
    const url = `${this.BASE_URL}/subject/${id}?responseGroup=large`;
    const data = await this._request(url, this._cacheKey('subject_detail', String(id)));
    return validateSubject(data);
  },

  async getCalendar() {
    const url = `${this.BASE_URL}/calendar`;
    const data = await this._request(url, this._cacheKey('calendar'), true);
    if (Array.isArray(data)) {
      return data.map(day => ({
        ...day,
        items: (day.items || []).map(normalizeSubject),
      }));
    }
    return data;
  },

  async getPopular(type, limit = 10, offset = 0) {
    const typeMap = { anime: 2, novel: 1, game: 4 };
    const subjectType = typeMap[type] || 2;
    const url = `${this.BASE_URL}/browse?subjectType=${subjectType}&limit=${limit}&offset=${offset}&sort=rank`;
    const result = await this._request(url, this._cacheKey('popular', `${type}_${limit}_${offset}`));
    if (result && result.data) {
      result.data = result.data.map(normalizeSubject);
    }
    return result;
  },

  async getSubjectsByTag(tag, type = 2, limit = 10, offset = 0) {
    const url = `${this.BASE_URL}/search/subject/${encodeURIComponent(tag)}?type=${type}&limit=${limit}&offset=${offset}&responseGroup=small`;
    const result = await this._request(url, this._cacheKey('tag', `${tag}_${type}_${limit}_${offset}`));
    if (result && result.list) {
      result.list = result.list.map(normalizeSubject);
    }
    return result;
  },

  async getSubjectCharacters(id) {
    const url = `${this.BASE_URL}/subject/${id}/characters`;
    const data = await this._request(url, this._cacheKey('characters', String(id)));
    return Array.isArray(data) ? data : [];
  },

  async getSubjectPersons(id) {
    const url = `${this.BASE_URL}/subject/${id}/persons`;
    const data = await this._request(url, this._cacheKey('persons', String(id)));
    return Array.isArray(data) ? data : [];
  },

  async getRelatedSubjects(id) {
    const url = `${this.BASE_URL}/subject/${id}/related`;
    const data = await this._request(url, this._cacheKey('related', String(id)));
    return Array.isArray(data) ? data : [];
  },

  async getSubjectComments(id, limit = 20, offset = 0) {
    const url = `${this.BASE_URL}/subject/${id}/comments?limit=${limit}&offset=${offset}`;
    const data = await this._request(url, this._cacheKey('comments', `${id}_${limit}_${offset}`));
    return data || { comments: [], total: 0 };
  },

  async getSubjectBlog(id, limit = 10, offset = 0) {
    const url = `${this.BASE_URL}/subject/${id}/blog?limit=${limit}&offset=${offset}`;
    const data = await this._request(url, this._cacheKey('blog', `${id}_${limit}_${offset}`));
    return data || [];
  },

  async getSubjectReviews(id) {
    const url = `${this.BASE_URL}/subject/${id}/reviews`;
    const data = await this._request(url, this._cacheKey('reviews', String(id)));
    return data || [];
  },

  getTypeByCode(code) {
    const map = { 1: 'novel', 2: 'anime', 3: 'music', 4: 'game', 6: 'real' };
    return map[code] || 'anime';
  },

  getTypeLabel(code) {
    const map = { 1: '小说', 2: '动画', 3: '音乐', 4: '游戏', 6: '三次元' };
    return map[code] || '其他';
  },

  buildBangumiUrl(id) { return `https://bgm.tv/subject/${id}`; },
  buildSubjectWebUrl(id) { return `https://bgm.tv/subject/${id}`; },

  clearCache() { CacheManager.clearAll(); },

  async getRandomSubject(excludeIds = [], weights = { popularity: 0.4, score: 0.35, recency: 0.25 }) {
    const DEDUP_KEY = 'acg_random_dedup';
    const FALLBACK_IDS = [12,323,590,1142,1319,1840,2001,2692,3228,4312,5033,6487,7662,8733,9914,10659,11661,12661,13761,15061];

    const now = Date.now();
    const dedup = StorageService.get(DEDUP_KEY, {});
    const cleaned = {};
    Object.entries(dedup).forEach(([id, ts]) => { if (now - ts < 86400000) cleaned[id] = ts; });
    StorageService.set(DEDUP_KEY, cleaned);

    const allExcluded = [...new Set([...excludeIds, ...Object.keys(cleaned).map(Number)])];

    try {
      const keywords = ['冒险', '恋爱', '奇幻', '科幻', '日常', '热血', '搞笑', '治愈', '悬疑', '运动', '音乐', '机战', '魔法', '校园', '战斗'];
      const keyword = keywords[Math.floor(Math.random() * keywords.length)];
      const offset = Math.floor(Math.random() * 50);
      const url = `${this.BASE_URL}/v0/search/subjects`;
      const body = JSON.stringify({
        keyword,
        filter: { type: [1, 2, 4] },
        page: Math.floor(offset / 10) + 1,
        per_page: 25,
      });

      const targetUrl = this._proxyUrl(url);
      const { controller, timer } = createTimeoutController(REQUEST_TIMEOUT);
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return this._getFallbackSubject(FALLBACK_IDS, allExcluded, cleaned, DEDUP_KEY);
      }

      const data = await res.json();
      if (!data?.data || data.data.length === 0) {
        return this._getFallbackSubject(FALLBACK_IDS, allExcluded, cleaned, DEDUP_KEY);
      }

      const candidates = data.data
        .map(normalizeSubject)
        .filter(s => s && s.id && !allExcluded.includes(s.id));

      if (candidates.length === 0) {
        return this._getFallbackSubject(FALLBACK_IDS, allExcluded, cleaned, DEDUP_KEY);
      }

      const scored = candidates.map(s => {
        const popularityScore = Math.min(s.rank > 0 ? 1 / s.rank : 0.01, 1);
        const scoreVal = s.rating?.score || s.score || 0;
        const scoreScore = scoreVal / 10;
        const recencyScore = Math.random();
        const weighted = popularityScore * (weights.popularity || 0.4) + scoreScore * (weights.score || 0.35) + recencyScore * (weights.recency || 0.25);
        return { ...s, _weight: weighted };
      });

      scored.sort((a, b) => b._weight - a._weight);
      const topN = scored.slice(0, Math.min(10, scored.length));
      const idx = Math.floor(Math.random() * topN.length);
      const selected = topN[idx];

      cleaned[selected.id] = now;
      StorageService.set(DEDUP_KEY, cleaned);

      return selected;
    } catch (err) {
      return this._getFallbackSubject(FALLBACK_IDS, allExcluded, cleaned, DEDUP_KEY);
    }
  },

  async _getFallbackSubject(fallbackIds, excludedIds, dedupMap, dedupKey) {
    const available = fallbackIds.filter(id => !excludedIds.includes(id));
    const pool = available.length > 0 ? available : fallbackIds;
    const pickId = pool[Math.floor(Math.random() * pool.length)];
    try {
      const subject = await this.getSubject(pickId);
      if (subject) {
        const normalized = normalizeSubject(subject);
        dedupMap[pickId] = Date.now();
        StorageService.set(dedupKey, dedupMap);
        return normalized;
      }
      return null;
    } catch {
      return null;
    }
  },
};

export const RatingService = {
  addRating(userId, subjectId, subjectType, score, content = '') {
    const ratings = StorageService.get(SK.RATINGS, []);
    const existing = ratings.find(r => r.userId === userId && r.subjectId === subjectId);
    if (existing) { existing.score = score; existing.content = content; existing.updatedAt = new Date().toISOString(); }
    else { ratings.push({ id: generateId(ratings), userId, subjectId, subjectType, score, content, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), likes: 0 }); }
    StorageService.set(SK.RATINGS, ratings); return { success: true };
  },
  getRatings(subjectId) { return StorageService.get(SK.RATINGS, []).filter(r => r.subjectId === subjectId); },
  getAverageScore(subjectId) { const r = this.getRatings(subjectId); return r.length === 0 ? 0 : (r.reduce((s, x) => s + x.score, 0) / r.length).toFixed(1); },
  getUserRating(userId, subjectId) { return StorageService.get(SK.RATINGS, []).find(r => r.userId === userId && r.subjectId === subjectId); },
};

export const LikeService = {
  toggle(userId, targetType, targetId) {
    let likes = StorageService.get(SK.LIKES, []);
    const key = `${userId}_${targetType}_${targetId}`;
    const existing = likes.find(l => l.key === key);
    if (existing) { likes = likes.filter(l => l !== existing); StorageService.set(SK.LIKES, likes); return { liked: false }; }
    likes.push({ key, userId, targetType, targetId, date: new Date().toISOString() });
    StorageService.set(SK.LIKES, likes); return { liked: true };
  },
  isLiked(userId, targetType, targetId) { return StorageService.get(SK.LIKES, []).some(l => l.key === `${userId}_${targetType}_${targetId}`); },
  getCount(targetType, targetId) { return StorageService.get(SK.LIKES, []).filter(l => l.targetType === targetType && l.targetId === targetId).length; },
};

export const FavoriteService = {
  toggle(userId, targetType, targetId) {
    let favs = StorageService.get(SK.FAVORITES, []);
    const key = `${userId}_${targetType}_${targetId}`;
    const existing = favs.find(f => f.key === key);
    if (existing) { favs = favs.filter(f => f !== existing); StorageService.set(SK.FAVORITES, favs); return { favorited: false }; }
    favs.push({ key, userId, targetType, targetId, date: new Date().toISOString() });
    StorageService.set(SK.FAVORITES, favs); return { favorited: true }; 
  },
  isFavorited(userId, targetType, targetId) { return StorageService.get(SK.FAVORITES, []).some(f => f.key === `${userId}_${targetType}_${targetId}`); },
  getUserFavorites(userId, targetType) { return StorageService.get(SK.FAVORITES, []).filter(f => f.userId === userId && (!targetType || f.targetType === targetType)); },
};

export const NotificationService = {
  add(userId, type, title, content, link = '') {
    const n = StorageService.get(SK.NOTIFICATIONS, []);
    n.unshift({ id: generateId(n), userId, type, title, content, link, read: false, createdAt: new Date().toISOString() });
    StorageService.set(SK.NOTIFICATIONS, n);
  },
  getUnread(userId) { return StorageService.get(SK.NOTIFICATIONS, []).filter(n => n.userId === userId && !n.read); },
  getAll(userId) { return StorageService.get(SK.NOTIFICATIONS, []).filter(n => n.userId === userId); },
  markRead(id) { const n = StorageService.get(SK.NOTIFICATIONS, []); const item = n.find(x => x.id === id); if (item) item.read = true; StorageService.set(SK.NOTIFICATIONS, n); },
  markAllRead(userId) { const n = StorageService.get(SK.NOTIFICATIONS, []); n.forEach(x => { if (x.userId === userId) x.read = true; }); StorageService.set(SK.NOTIFICATIONS, n); },
};

export const CollectionMarkService = {
  MARKS: { WISH: 'wish', COLLECT: 'collect', DOING: 'doing', ON_HOLD: 'on_hold', DROPPED: 'dropped' },
  MARK_LABELS: { wish: '想看', collect: '看过', doing: '在看', on_hold: '搁置', dropped: '抛弃' },
  MARK_COLORS: { wish: 'var(--secondary)', collect: 'var(--success)', doing: 'var(--accent-warm)', on_hold: 'var(--tag-novel)', dropped: 'var(--error)' },

  setMark(userId, subjectId, subjectType, mark, subjectName = '', subjectImage = '') {
    const marks = StorageService.get(SK.COLLECTION_MARKS, []);
    const key = `${userId}_${subjectId}`;
    const idx = marks.findIndex(m => m.key === key);
    if (idx !== -1) {
      if (marks[idx].mark === mark) { marks.splice(idx, 1); }
      else { marks[idx] = { ...marks[idx], mark, updatedAt: new Date().toISOString() }; }
    } else {
      marks.push({ key, userId, subjectId, subjectType, mark, subjectName, subjectImage, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    StorageService.set(SK.COLLECTION_MARKS, marks);
    return marks.find(m => m.key === key) || null;
  },

  getMark(userId, subjectId) {
    const marks = StorageService.get(SK.COLLECTION_MARKS, []);
    return marks.find(m => m.key === `${userId}_${subjectId}`) || null;
  },

  getUserMarks(userId, markType = null) {
    const marks = StorageService.get(SK.COLLECTION_MARKS, []);
    return marks.filter(m => m.userId === userId && (!markType || m.mark === markType));
  },

  getMarkCounts(userId) {
    const marks = this.getUserMarks(userId);
    const counts = { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 };
    marks.forEach(m => { if (counts[m.mark] !== undefined) counts[m.mark]++; });
    return counts;
  },

  removeMark(userId, subjectId) {
    let marks = StorageService.get(SK.COLLECTION_MARKS, []);
    marks = marks.filter(m => m.key !== `${userId}_${subjectId}`);
    StorageService.set(SK.COLLECTION_MARKS, marks);
  },
};

export const PrivateMessageService = {
  send(fromUserId, toUserId, content) {
    const msgs = StorageService.get(SK.PRIVATE_MESSAGES, []);
    msgs.push({ id: generateId(msgs), fromUserId, toUserId, content, createdAt: new Date().toISOString(), read: false });
    StorageService.set(SK.PRIVATE_MESSAGES, msgs);
    return { success: true };
  },

  getConversation(userId1, userId2) {
    const msgs = StorageService.get(SK.PRIVATE_MESSAGES, []);
    return msgs.filter(m => (m.fromUserId === userId1 && m.toUserId === userId2) || (m.fromUserId === userId2 && m.toUserId === userId1)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  getConversations(userId) {
    const msgs = StorageService.get(SK.PRIVATE_MESSAGES, []);
    const userMsgs = msgs.filter(m => m.fromUserId === userId || m.toUserId === userId);
    const convMap = {};
    userMsgs.forEach(m => {
      const otherId = m.fromUserId === userId ? m.toUserId : m.fromUserId;
      if (!convMap[otherId] || new Date(m.createdAt) > new Date(convMap[otherId].lastMessage.createdAt)) {
        convMap[otherId] = { otherUserId: otherId, lastMessage: m, unread: m.toUserId === userId && !m.read ? 1 : 0 };
      } else if (m.toUserId === userId && !m.read) {
        convMap[otherId].unread++;
      }
    });
    return Object.values(convMap).sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
  },

  markAsRead(userId, otherUserId) {
    const msgs = StorageService.get(SK.PRIVATE_MESSAGES, []);
    msgs.forEach(m => { if (m.toUserId === userId && m.fromUserId === otherUserId) m.read = true; });
    StorageService.set(SK.PRIVATE_MESSAGES, msgs);
  },

  getUnreadCount(userId) {
    return StorageService.get(SK.PRIVATE_MESSAGES, []).filter(m => m.toUserId === userId && !m.read).length;
  },
};

export const MailService = {
  send(fromUserId, toUserId, subject, content, attachments = []) {
    const mails = StorageService.get(SK.MAILBOX, []);
    const toUser = UserService.getById(toUserId);
    if (!toUser) return { error: '收件人不存在' };
    if (content.length > 5000) return { error: '邮件内容不能超过5000字' };
    for (const att of attachments) {
      if (att.size > 10 * 1024 * 1024) return { error: '附件大小不能超过10MB' };
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
      if (!allowed.includes(att.type)) return { error: '不支持的附件类型' };
    }
    const mail = {
      id: generateId(mails),
      fromUserId,
      toUserId,
      subject: subject || '(无主题)',
      content,
      attachments: attachments.map(a => ({ name: a.name, size: a.size, type: a.type, data: a.data })),
      createdAt: new Date().toISOString(),
      read: false,
      starred: false,
      deletedBy: [],
      folder: 'inbox',
    };
    mails.push(mail);
    StorageService.set(SK.MAILBOX, mails);
    NotificationService.add(toUserId, 'mail', '收到新邮件', `${UserService.getById(fromUserId)?.name || '用户'} 给你发了一封邮件`, `/mailbox`);
    return { success: true, mail };
  },

  getInbox(userId) {
    const mails = StorageService.get(SK.MAILBOX, []);
    return mails
      .filter(m => m.toUserId === userId && !m.deletedBy.includes(userId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getSent(userId) {
    const mails = StorageService.get(SK.MAILBOX, []);
    return mails
      .filter(m => m.fromUserId === userId && !m.deletedBy.includes(userId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getMail(mailId) {
    const mails = StorageService.get(SK.MAILBOX, []);
    return mails.find(m => m.id === mailId) || null;
  },

  markAsRead(mailId) {
    const mails = StorageService.get(SK.MAILBOX, []);
    const mail = mails.find(m => m.id === mailId);
    if (mail) { mail.read = true; StorageService.set(SK.MAILBOX, mails); }
  },

  toggleStar(mailId) {
    const mails = StorageService.get(SK.MAILBOX, []);
    const mail = mails.find(m => m.id === mailId);
    if (mail) { mail.starred = !mail.starred; StorageService.set(SK.MAILBOX, mails); return mail.starred; }
    return false;
  },

  deleteMail(mailId, userId) {
    const mails = StorageService.get(SK.MAILBOX, []);
    const mail = mails.find(m => m.id === mailId);
    if (mail) {
      mail.deletedBy.push(userId);
      if (mail.deletedBy.includes(mail.fromUserId) && mail.deletedBy.includes(mail.toUserId)) {
        const filtered = mails.filter(m => m.id !== mailId);
        StorageService.set(SK.MAILBOX, filtered);
      } else {
        StorageService.set(SK.MAILBOX, mails);
      }
    }
  },

  getUnreadCount(userId) {
    return this.getInbox(userId).filter(m => !m.read).length;
  },

  getConversationMails(userId1, userId2) {
    const mails = StorageService.get(SK.MAILBOX, []);
    return mails
      .filter(m => (m.fromUserId === userId1 && m.toUserId === userId2) || (m.fromUserId === userId2 && m.toUserId === userId1))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  searchMails(userId, query) {
    const q = query.toLowerCase();
    const inbox = this.getInbox(userId);
    const sent = this.getSent(userId);
    const all = [...inbox, ...sent];
    const seen = new Set();
    return all.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return m.subject.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
    });
  },
};

export const NetEaseMusicService = {
  METING_API: 'https://api.injahow.cn/meting/',
  _cache: {},

  async _metingRequest(params) {
    if (!isOnline()) throw new ApiError('网络连接已断开', 0, 'OFFLINE');
    const query = new URLSearchParams(params).toString();
    const cacheKey = `netease_meting_${query}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    try {
      const url = `${this.METING_API}?${query}`;
      const { controller, timer } = createTimeoutController(REQUEST_TIMEOUT);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new ApiError('网易云API请求失败', res.status);
      const data = await res.json();
      this._cache[cacheKey] = data;
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('网易云API请求异常', 0, 'NETWORK_ERROR');
    }
  },

  async search(keyword, limit = 10) {
    const data = await this._metingRequest({
      type: 'search',
      id: keyword,
      server: 'netease',
    });
    const items = Array.isArray(data) ? data.slice(0, limit) : [];
    return items.map(song => ({
      id: song.id || song.url?.split('/').pop(),
      mid: '',
      name: song.name || song.title || '',
      artists: song.artist || '',
      album: song.album || '',
      albumCover: song.cover || song.pic || '',
      duration: (song.duration || 0) * 1000,
      url: song.url || '',
      lrc: song.lrc || '',
    }));
  },

  async getSongUrl(id) {
    const data = await this._metingRequest({
      type: 'url',
      id: String(id),
      server: 'netease',
    });
    if (typeof data === 'string') return data;
    if (Array.isArray(data) && data.length > 0) return data[0].url || data[0];
    if (data?.url) return data.url;
    return null;
  },

  async getPlaylistDetail(id) {
    const data = await this._metingRequest({
      type: 'playlist',
      id: String(id),
      server: 'netease',
    });
    if (!Array.isArray(data) || data.length === 0) return null;
    const songs = data.map(song => ({
      id: song.id || '',
      mid: '',
      name: song.name || song.title || '',
      artists: song.artist || '',
      album: song.album || '',
      albumCover: song.cover || song.pic || '',
      duration: (song.duration || 0) * 1000,
      url: song.url || '',
      lrc: song.lrc || '',
    }));
    return {
      name: '网易云歌单',
      tracks: songs,
      coverImgUrl: songs[0]?.albumCover || '',
    };
  },

  async getLyric(id) {
    const data = await this._metingRequest({
      type: 'lrc',
      id: String(id),
      server: 'netease',
    });
    if (typeof data === 'string') return data;
    return data?.lrc || '';
  },
};

export const BangumiAuthService = {
  buildAuthUrl() {
    const redirectUri = `${window.location.origin}${oauthConfig.bangumi.redirectPath}`;
    const params = new URLSearchParams({
      client_id: oauthConfig.bangumi.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
    });
    return `${oauthConfig.bangumi.authUrl}?${params.toString()}`;
  },

  initiateLogin() {
    window.location.href = this.buildAuthUrl();
  },

  async handleOAuthCallback(code) {
    try {
      const redirectUri = `${window.location.origin}${oauthConfig.bangumi.redirectPath}`;
      const res = await fetch(`${oauthConfig.tokenBase}/bangumi/token?code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();
      if (data.error) return { error: data.error };
      return data;
    } catch (err) {
      return { error: err.message || 'Bangumi 授权服务异常' };
    }
  },

  async loginWithBangumi(code) {
    const oauthResult = await this.handleOAuthCallback(code);
    if (oauthResult.error) return { error: oauthResult.error };

    // 保存 Bangumi token 和用户信息
    StorageService.set('acg_bangumi_token', oauthResult.access_token);
    if (oauthResult.refresh_token) StorageService.set('acg_bangumi_refresh', oauthResult.refresh_token);
    StorageService.set('acg_bangumi_user', oauthResult.user);

    // 通过 AuthService 创建或登录本地用户
    const result = AuthService.loginWithOAuth('bangumi', oauthResult.user);
    return result;
  },

  getBoundAccount() {
    return StorageService.get('acg_bangumi_user');
  },

  isBound() {
    return !!StorageService.get('acg_bangumi_token');
  },

  unbind() {
    StorageService.remove('acg_bangumi_token');
    StorageService.remove('acg_bangumi_refresh');
    StorageService.remove('acg_bangumi_user');
  },
};

export const GitHubAuthService = {
  buildAuthUrl() {
    const redirectUri = `${window.location.origin}${oauthConfig.github.redirectPath}`;
    const params = new URLSearchParams({
      client_id: oauthConfig.github.clientId,
      redirect_uri: redirectUri,
      scope: oauthConfig.github.scope,
    });
    return `${oauthConfig.github.authUrl}?${params.toString()}`;
  },

  initiateLogin() {
    window.location.href = this.buildAuthUrl();
  },

  async handleOAuthCallback(code) {
    try {
      const redirectUri = `${window.location.origin}${oauthConfig.github.redirectPath}`;
      const url = `${oauthConfig.tokenBase}/github/token?code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      const res = await fetch(url);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { return { error: `响应解析失败 (HTTP ${res.status}): ${text.substring(0, 200)}` }; }
      if (data.error) return { error: data.error };
      return data;
    } catch (err) {
      return { error: err.message || 'GitHub 授权服务异常' };
    }
  },

  async loginWithGitHub(code) {
    const oauthResult = await this.handleOAuthCallback(code);
    if (oauthResult.error) return { error: oauthResult.error };

    // 保存 GitHub token 和用户信息
    StorageService.set(SK.GITHUB_TOKEN, oauthResult.access_token);
    StorageService.set(SK.GITHUB_USER, oauthResult.user);

    // 通过 AuthService 创建或登录本地用户
    const result = AuthService.loginWithOAuth('github', oauthResult.user);
    return result;
  },

  getBoundAccount() {
    return StorageService.get(SK.GITHUB_USER);
  },

  isBound() {
    return !!StorageService.get(SK.GITHUB_TOKEN);
  },

  unbind() {
    StorageService.remove(SK.GITHUB_TOKEN);
    StorageService.remove(SK.GITHUB_USER);
  },
};

export const QQMusicService = {
  METING_API: 'https://api.injahow.cn/meting/',
  _cache: {},

  async _metingRequest(params) {
    if (!isOnline()) throw new ApiError('网络连接已断开', 0, 'OFFLINE');
    const query = new URLSearchParams(params).toString();
    const cacheKey = `qq_meting_${query}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    try {
      const url = `${this.METING_API}?${query}`;
      const { controller, timer } = createTimeoutController(REQUEST_TIMEOUT);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new ApiError('QQ音乐API请求失败', res.status);
      const data = await res.json();
      this._cache[cacheKey] = data;
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('QQ音乐API请求异常', 0, 'NETWORK_ERROR');
    }
  },

  async search(keyword, limit = 20) {
    const data = await this._metingRequest({
      type: 'search',
      id: keyword,
      server: 'tencent',
    });
    const items = Array.isArray(data) ? data.slice(0, limit) : [];
    return items.map(song => ({
      id: song.id || song.url?.split('/').pop(),
      mid: song.mid || song.id || '',
      name: song.name || song.title || '',
      artists: song.artist || '',
      album: song.album || '',
      albumCover: song.cover || song.pic || '',
      duration: (song.duration || 0) * 1000,
      url: song.url || '',
      lrc: song.lrc || '',
    }));
  },

  async getSongUrl(songmid) {
    const data = await this._metingRequest({
      type: 'url',
      id: songmid,
      server: 'tencent',
    });
    if (typeof data === 'string') return data;
    if (Array.isArray(data) && data.length > 0) return data[0].url || data[0];
    if (data?.url) return data.url;
    return `https://ws.stream.qqmusic.qq.com/C400${songmid}.m4a?fromtag=38`;
  },

  async getPlaylistDetail(disstid) {
    const data = await this._metingRequest({
      type: 'playlist',
      id: String(disstid),
      server: 'tencent',
    });
    if (!Array.isArray(data) || data.length === 0) return null;
    const songs = data.map(song => ({
      id: song.id || '',
      mid: song.mid || song.id || '',
      name: song.name || song.title || '',
      artists: song.artist || '',
      album: song.album || '',
      albumCover: song.cover || song.pic || '',
      duration: (song.duration || 0) * 1000,
      url: song.url || '',
      lrc: song.lrc || '',
    }));
    return {
      name: 'QQ音乐歌单',
      songlist: songs,
      tracklist: songs,
      logo: songs[0]?.albumCover || '',
    };
  },

  async getLyric(songmid) {
    const data = await this._metingRequest({
      type: 'lrc',
      id: songmid,
      server: 'tencent',
    });
    if (typeof data === 'string') return data;
    return data?.lrc || '';
  },
};
