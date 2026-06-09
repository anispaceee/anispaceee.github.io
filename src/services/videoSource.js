import oauthConfig from '../../oauth.config.js';

// Default video sources (苹果CMS采集站)
const DEFAULT_SOURCES = [
  { id: 'kuapi', name: '酷云资源', baseUrl: 'https://kuapi.co', type: 'maccms', enabled: true },
  { id: 'bfzy', name: '暴风资源', baseUrl: 'https://bfzyapi.com', type: 'maccms', enabled: true },
  { id: 'guangsu', name: '光速资源', baseUrl: 'https://guangsuapi.com', type: 'maccms', enabled: true },
  { id: 'sdzy', name: '闪电资源', baseUrl: 'https://sdzyapi.com', type: 'maccms', enabled: true },
];

const STORAGE_KEY = 'acg_video_sources';

export const VideoSourceService = {
  // Get all sources (default + user custom)
  getSources() {
    const custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return [...DEFAULT_SOURCES, ...custom];
  },

  // Get enabled sources only
  getEnabledSources() {
    return this.getSources().filter(s => s.enabled !== false);
  },

  // Add a custom source
  addSource(source) {
    const custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const newSource = {
      id: `custom_${Date.now()}`,
      name: source.name,
      baseUrl: source.baseUrl.replace(/\/$/, ''),
      type: 'maccms',
      enabled: true,
    };
    custom.push(newSource);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    return newSource;
  },

  // Remove a custom source
  removeSource(id) {
    let custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    custom = custom.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  },

  // Toggle source enabled/disabled
  toggleSource(id) {
    // Check default sources
    const defaults = DEFAULT_SOURCES.find(s => s.id === id);
    if (defaults) {
      // Store disabled state
      const disabled = JSON.parse(localStorage.getItem('acg_video_sources_disabled') || '[]');
      const idx = disabled.indexOf(id);
      if (idx >= 0) disabled.splice(idx, 1);
      else disabled.push(id);
      localStorage.setItem('acg_video_sources_disabled', JSON.stringify(disabled));
      return;
    }
    // Custom source
    const custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const source = custom.find(s => s.id === id);
    if (source) {
      source.enabled = !source.enabled;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    }
  },

  // Check if a default source is disabled
  _isDefaultDisabled(id) {
    const disabled = JSON.parse(localStorage.getItem('acg_video_sources_disabled') || '[]');
    return disabled.includes(id);
  },

  // Get proxy base URL
  _proxyBase() {
    return oauthConfig.proxyUrl || '';
  },

  // Build proxied URL for a source API request
  _buildUrl(source, path, params) {
    const query = new URLSearchParams(params).toString();
    if (this._proxyBase()) {
      // Use Cloudflare Worker proxy: /api/video/proxy?baseUrl=xxx&path=xxx&params=xxx
      return `${this._proxyBase()}/api/video/proxy?baseUrl=${encodeURIComponent(source.baseUrl)}&path=${encodeURIComponent(path)}&${query}`;
    }
    // Direct access (dev mode or no proxy)
    return `${source.baseUrl}${path}?${query}`;
  },

  // Search a single source
  async searchSource(source, keyword) {
    try {
      const url = this._buildUrl(source, '/api.php/provide/vod/', { ac: 'videolist', wd: keyword });
      const res = await fetch(url);
      const data = await res.json();
      if (data.code !== 200 || !data.list) return { sourceId: source.id, sourceName: source.name, results: [] };

      const results = data.list.map(item => ({
        vodId: item.vod_id,
        title: item.vod_name,
        cover: item.vod_pic,
        category: item.vod_class,
        year: item.vod_year,
        area: item.vod_area,
        remarks: item.vod_remarks,
        description: item.vod_content?.replace(/<[^>]+>/g, '') || '',
        sourceId: source.id,
        sourceName: source.name,
      }));

      return { sourceId: source.id, sourceName: source.name, results, total: data.total, pagecount: data.pagecount };
    } catch (err) {
      return { sourceId: source.id, sourceName: source.name, results: [], error: err.message };
    }
  },

  // Search all enabled sources in parallel
  async searchAll(keyword) {
    const sources = this.getEnabledSources();
    const promises = sources.map(s => this.searchSource(s, keyword));
    const results = await Promise.allSettled(promises);

    const failedCount = results.filter(r => r.status === 'rejected').length;

    return {
      groups: results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => r.results.length > 0),
      failedCount,
    };
  },

  // Get video detail (with play URLs) from a specific source
  async getDetail(sourceId, vodId) {
    const source = this.getSources().find(s => s.id === sourceId);
    if (!source) return { error: '源不存在' };

    try {
      const url = this._buildUrl(source, '/api.php/provide/vod/', { ac: 'detail', ids: vodId });
      const res = await fetch(url);
      const data = await res.json();
      if (data.code !== 200 || !data.list?.[0]) return { error: '未找到视频信息' };

      const item = data.list[0];

      // Parse play sources and episodes
      // vod_play_from: "bfzym3u8$$$ffm3u8"
      // vod_play_url: "第01集$url1#第02集$url2$$$第01集$url3#第02集$url4"
      const playFroms = (item.vod_play_from || '').split('$$$').filter(Boolean);
      const playUrlGroups = (item.vod_play_url || '').split('$$$').filter(Boolean);

      const episodes = playFroms.map((from, idx) => {
        const urlGroup = playUrlGroups[idx] || '';
        const eps = urlGroup.split('#').filter(Boolean).map(ep => {
          const parts = ep.split('$');
          return {
            name: parts[0] || `第${idx + 1}集`,
            url: parts[1] || parts[0],
          };
        });
        return {
          source: from,
          episodes: eps,
        };
      });

      return {
        vodId: item.vod_id,
        title: item.vod_name,
        cover: item.vod_pic,
        category: item.vod_class,
        year: item.vod_year,
        area: item.vod_area,
        remarks: item.vod_remarks,
        description: item.vod_content?.replace(/<[^>]+>/g, '') || '',
        director: item.vod_director,
        actor: item.vod_actor,
        episodes,
        sourceId,
        sourceName: source.name,
      };
    } catch (err) {
      return { error: err.message || '获取视频详情失败' };
    }
  },
};
