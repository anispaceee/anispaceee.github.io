// src/services/HitokotoService.js

const ENDPOINT = 'https://v1.hitokoto.cn/';
const CACHE_KEY = 'anispace_hitokoto_cache';
const CACHE_SIZE = 35;

export const HitokotoService = {
  _cache: [],
  _cacheIndex: 0,

  async fetchHitokotos() {
    try {
      // 一言API不支持num参数，需逐条获取
      const promises = [];
      for (let i = 0; i < CACHE_SIZE; i++) {
        promises.push(
          fetch(`${ENDPOINT}?c=a&encode=json`)
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

      if (items.length === 0) throw new Error('All requests failed');

      this._cache = items.map(item => ({
        id: item.id,
        text: item.hitokoto,
        from: item.from,
        fromWho: item.from_who,
        type: item.type,
        uuid: item.uuid,
      }));
      this._cacheIndex = 0;

      // 写入 localStorage 缓存
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(this._cache));
      } catch { /* ignore */ }

      return this._cache;
    } catch {
      // 尝试从 localStorage 读取缓存
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          this._cache = JSON.parse(cached);
          this._cacheIndex = 0;
          return this._cache;
        }
      } catch { /* ignore */ }
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
      await this.fetchHitokotos();
    }
  },
};
