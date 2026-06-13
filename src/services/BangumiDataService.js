// src/services/BangumiDataService.js

const CDN_URL = 'https://unpkg.com/bangumi-data@0.3/dist/data.json';
const CACHE_KEY = 'anispace_bangumi_data';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export const BangumiDataService = {
  _data: null,

  async fetchData(forceRefresh = false) {
    if (!forceRefresh && this._data) return this._data;

    // 尝试从 localStorage 读取缓存
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            this._data = data;
            return data;
          }
        }
      } catch { /* 缓存损坏，忽略 */ }
    }

    // 从 CDN 获取
    const res = await fetch(CDN_URL);
    if (!res.ok) throw new Error(`bangumi-data fetch failed: ${res.status}`);
    const data = await res.json();

    // 写入缓存
    this._data = data;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch { /* localStorage 满了，忽略 */ }

    return data;
  },

  async getSeasonItems(year, season) {
    const data = await this.fetchData();
    if (!data?.items) return [];

    // season: 1=冬(1-3月), 2=春(4-6月), 3=夏(7-9月), 4=秋(10-12月)
    const monthRanges = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] };
    const months = monthRanges[season];
    if (!months) return [];

    return data.items.filter(item => {
      if (!item.begin) return false;
      const d = new Date(item.begin);
      return d.getFullYear() === year && months.includes(d.getMonth() + 1);
    });
  },

  async getSitesByBgmId(bgmId) {
    const data = await this.fetchData();
    if (!data?.items) return null;

    const item = data.items.find(item =>
      item.sites?.some(s => s.site === 'bangumi' && String(s.id) === String(bgmId))
    );
    return item || null;
  },

  async getItemsByWeekDate(dateStr) {
    const data = await this.fetchData();
    if (!data?.items) return [];

    return data.items.filter(item => {
      if (!item.begin) return false;
      const itemDate = item.begin.slice(0, 10);
      return itemDate === dateStr;
    });
  },

  generatePlatformUrl(siteKey, id) {
    const data = this._data;
    if (!data?.siteMeta?.[siteKey]) return null;
    const template = data.siteMeta[siteKey].urlTemplate;
    if (!template) return null;
    return template.replace('{{id}}', id);
  },

  getSiteMeta() {
    return this._data?.siteMeta || {};
  },

  clearCache() {
    this._data = null;
    localStorage.removeItem(CACHE_KEY);
  }
};
