// src/services/HitokotoService.js
// 主数据源：Animechan（高质量动漫台词，含角色+作品名）
// 降级数据源：一言 Hitokoto（国内可达，质量一般）

const ANIMECHAN_ENDPOINT = 'https://api.animechan.io/v1/quotes/random';
const HITOKOTO_ENDPOINT = 'https://v1.hitokoto.cn/';
const CACHE_KEY = 'anispace_anime_quotes_cache';
const CACHE_SIZE = 30;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时

export const HitokotoService = {
  _cache: [],
  _cacheIndex: 0,

  async fetchQuotes() {
    // 优先尝试 Animechan
    try {
      const quotes = await this._fetchAnimechan();
      if (quotes.length > 0) {
        this._cache = quotes;
        this._cacheIndex = 0;
        this._saveCache(quotes);
        return quotes;
      }
    } catch { /* Animechan 失败，降级 */ }

    // 降级到一言
    try {
      const quotes = await this._fetchHitokoto();
      if (quotes.length > 0) {
        this._cache = quotes;
        this._cacheIndex = 0;
        this._saveCache(quotes);
        return quotes;
      }
    } catch { /* 一言也失败 */ }

    // 最后尝试 localStorage 缓存
    return this._loadCache();
  },

  async _fetchAnimechan() {
    // Animechan 免费版 5次/小时，但可一次请求多条
    // 使用 anime 参数获取特定动漫的多条台词
    const popularAnime = [
      'Naruto', 'One Piece', 'Attack on Titan', 'Death Note',
      'Fullmetal Alchemist', 'Steins;Gate', 'Cowboy Bebop',
      'Neon Genesis Evangelion', 'Code Geass', 'Gintama',
      'Hunter x Hunter', 'Demon Slayer', 'Jujutsu Kaisen',
      'Your Lie in April', 'Sword Art Online', 'Tokyo Ghoul',
      'Mob Psycho 100', 'Vinland Saga', 'Spy x Family',
      'Chainsaw Man', 'Bleach', 'Dragon Ball',
    ];

    const promises = [];
    // 随机选6个动漫，每个获取5条 = 最多30条
    const shuffled = popularAnime.sort(() => Math.random() - 0.5).slice(0, 6);

    for (const anime of shuffled) {
      promises.push(
        fetch(`https://api.animechan.io/v1/quotes?anime=${encodeURIComponent(anime)}`)
          .then(res => {
            if (!res.ok) throw new Error('Animechan fetch failed');
            return res.json();
          })
          .then(data => {
            // data.data 是数组
            const items = data?.data || data || [];
            return Array.isArray(items) ? items : [];
          })
          .catch(() => [])
      );
    }

    const results = await Promise.allSettled(promises);
    const allQuotes = results
      .filter(r => r.status === 'fulfilled' && Array.isArray(r.value))
      .flatMap(r => r.value);

    // 去重并截取
    const seen = new Set();
    const unique = allQuotes.filter(q => {
      const key = q.content || q.quote || '';
      if (seen.has(key) || !key) return false;
      seen.add(key);
      return true;
    }).slice(0, CACHE_SIZE);

    return unique.map(q => ({
      id: q.id || Math.random().toString(36).slice(2),
      text: q.content || q.quote || '',
      from: q.anime?.name || q.anime || '',
      fromWho: q.character?.name || q.character || '',
      source: 'animechan',
    }));
  },

  async _fetchHitokoto() {
    const promises = [];
    for (let i = 0; i < CACHE_SIZE; i++) {
      promises.push(
        fetch(`${HITOKOTO_ENDPOINT}?c=a&encode=json`)
          .then(res => {
            if (!res.ok) throw new Error('Hitokoto fetch failed');
            return res.json();
          })
          .catch(() => null)
      );
    }
    const results = await Promise.allSettled(promises);
    const items = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    return items.map(item => ({
      id: item.id,
      text: item.hitokoto,
      from: item.from,
      fromWho: item.from_who,
      source: 'hitokoto',
    }));
  },

  _saveCache(quotes) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: quotes,
        timestamp: Date.now(),
      }));
    } catch { /* ignore */ }
  },

  _loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      const cached = JSON.parse(raw);
      // 检查缓存是否过期
      if (Date.now() - cached.timestamp > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY);
        return [];
      }
      this._cache = cached.data || [];
      this._cacheIndex = 0;
      return this._cache;
    } catch {
      return [];
    }
  },

  getRandomHitokoto() {
    if (this._cache.length === 0) return null;
    const idx = Math.floor(Math.random() * this._cache.length);
    return this._cache[idx];
  },

  getNextHitokoto() {
    if (this._cache.length === 0) return null;
    if (this._cacheIndex >= this._cache.length) {
      this._cacheIndex = 0;
    }
    return this._cache[this._cacheIndex++];
  },

  async ensureCache() {
    if (this._cache.length === 0) {
      // 先尝试加载缓存
      const cached = this._loadCache();
      if (cached.length > 0) return;
      // 缓存为空则重新获取
      await this.fetchQuotes();
    }
  },
};
