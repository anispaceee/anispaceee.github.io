// src/services/KitsuService.js

const ENDPOINT = 'https://kitsu.io/api/edge/';
const TIMEOUT = 5000;

async function kitsuFetch(path, params = {}) {
  const url = new URL(path, ENDPOINT);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Kitsu API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Kitsu request timeout');
    throw err;
  }
}

export const KitsuService = {
  _available: null,

  async checkAvailability() {
    try {
      await kitsuFetch('anime', { 'page[limit]': 1 });
      this._available = true;
    } catch {
      this._available = false;
    }
    return this._available;
  },

  isAvailable() {
    return this._available;
  },

  async searchAnime(title, limit = 5) {
    const data = await kitsuFetch('anime', {
      'filter[text]': title,
      'page[limit]': limit,
    });
    return data?.data || [];
  },

  async getAnimeById(kitsuId) {
    const data = await kitsuFetch(`anime/${kitsuId}`);
    return data?.data || null;
  },

  async getAnimeBySlug(slug) {
    const data = await kitsuFetch('anime', { 'filter[slug]': slug });
    return data?.data?.[0] || null;
  },

  parseAnime(kitsuAnime) {
    if (!kitsuAnime?.attributes) return null;
    const attr = kitsuAnime.attributes;
    return {
      id: kitsuAnime.id,
      slug: attr.slug,
      title: {
        en: attr.titles?.en || attr.canonicalTitle || '',
        en_jp: attr.titles?.en_jp || '',
        ja_jp: attr.titles?.ja_jp || '',
      },
      synopsis: attr.synopsis || '',
      posterImage: attr.posterImage?.large || attr.posterImage?.medium || '',
      coverImage: attr.coverImage?.large || '',
      episodeCount: attr.episodeCount || 0,
      episodeLength: attr.episodeLength || 0,
      status: attr.status || '',
      startDate: attr.startDate || '',
      endDate: attr.endDate || '',
      averageRating: attr.averageRating || null,
      popularityRank: attr.popularityRank || null,
      ratingRank: attr.ratingRank || null,
      nsfw: attr.nsfw || false,
      siteUrl: `https://kitsu.io/anime/${attr.slug}`,
    };
  },
};
