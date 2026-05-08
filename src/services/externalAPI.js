import { StorageService } from './api';

const CACHE_TTL = 30 * 60 * 1000;

class BaseExternalAPI {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async request(url, options = {}) {
    const cacheKey = `ext_api_${url}`;
    const cached = StorageService.get(cacheKey);
    if (cached) return cached;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 10000);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      StorageService.set(cacheKey, data, CACHE_TTL);
      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('请求超时，请稍后重试');
      }
      throw err;
    }
  }
}

export class AniListService extends BaseExternalAPI {
  constructor() {
    super('https://graphql.anilist.co');
  }

  async query(graphqlQuery, variables = {}) {
    const cacheKey = `anilist_${JSON.stringify({ query: graphqlQuery, variables })}`;
    const cached = StorageService.get(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: graphqlQuery, variables }),
      });

      if (!res.ok) throw new Error(`AniList Error: ${res.status}`);
      const data = await res.json();

      if (data.errors) {
        throw new Error(data.errors[0]?.message || 'GraphQL Error');
      }

      StorageService.set(cacheKey, data.data, CACHE_TTL);
      return data.data;
    } catch (err) {
      console.error('AniList API Error:', err);
      throw err;
    }
  }

  async searchAnime(keyword, page = 1, perPage = 20) {
    const query = `
      query ($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { total currentPage lastPage hasNextPage }
          media(search: $search, type: ANIME, isAdult: false) {
            id idMal title { romaji english native userPreferred }
            coverImage { large medium color }
            bannerImage description(asHtml: false)
            episodes duration format status season year
            averageScore meanScore popularity
            genres tags { name rank }
            studios { name }
            nextAiringEpisode { airingAt episode }
            startDate { year month day }
            endDate { year month day }
          }
        }
      }
    `;
    return this.query(query, { search: keyword, page, perPage });
  }

  async searchManga(keyword, page = 1, perPage = 20) {
    const query = `
      query ($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { total currentPage lastPage hasNextPage }
          media(search: $search, type: MANGA, isAdult: false) {
            id idMal title { romaji english native userPreferred }
            coverImage { large medium color }
            bannerImage description(asHtml: false)
            chapters volumes format status
            averageScore meanScore popularity
            genres tags { name rank }
            startDate { year month day }
          }
        }
      }
    `;
    return this.query(query, { search: keyword, page, perPage });
  }

  async getAiringSchedule(page = 1, perPage = 20) {
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo { total currentPage lastPage hasNextPage }
          airingSchedules(airingAt_greater: ${Math.floor(Date.now() / 1000) - 86400}) {
            id airingAt episode
            media {
              id title { romaji english native userPreferred }
              coverImage { large medium }
              format episodes
            }
          }
        }
      }
    `;
    return this.query(query, { page, perPage });
  }

  async getTrendingAnime(page = 1, perPage = 20) {
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
            id idMal title { romaji english native userPreferred }
            coverImage { large medium color }
            bannerImage description(asHtml: false)
            episodes averageScore meanScore popularity
            genres format status season year
          }
        }
      }
    `;
    return this.query(query, { page, perPage });
  }

  static normalizeMedia(media) {
    return {
      id: `anilist_${media.id}`,
      bgmId: media.idMal,
      title: media.title?.userPreferred || media.title?.romaji || media.title?.native || '',
      titleCn: media.title?.native || '',
      cover: media.coverImage?.large || media.coverImage?.medium || '',
      banner: media.bannerImage || '',
      description: media.description || '',
      score: (media.averageScore || media.meanScore || 0) / 10,
      episodes: media.episodes || 0,
      format: media.format || '',
      status: media.status || '',
      genres: media.genres || [],
      tags: (media.tags || []).map(t => t.name),
      year: media.startDate?.year || media.year,
      popularity: media.popularity || 0,
    };
  }
}

export class KitsuService extends BaseExternalAPI {
  constructor() {
    super('https://kitsu.io/api/edge');
  }

  async searchAnime(keyword, limit = 20, offset = 0) {
    const url = `${this.baseUrl}/anime?filter[text]=${encodeURIComponent(keyword)}&page[limit]=${limit}&page[offset]=${offset}`;
    const data = await this.request(url);
    return data;
  }

  async searchManga(keyword, limit = 20, offset = 0) {
    const url = `${this.baseUrl}/manga?filter[text]=${encodeURIComponent(keyword)}&page[limit]=${limit}&page[offset]=${offset}`;
    const data = await this.request(url);
    return data;
  }

  async getTrendingAnime(limit = 20) {
    const url = `${this.baseUrl}/trending/anime?limit=${limit}`;
    const data = await this.request(url);
    return data;
  }

  async getAnimeById(id) {
    const url = `${this.baseUrl}/anime/${id}`;
    const data = await this.request(url);
    return data;
  }

  static normalizeAnime(item) {
    const attrs = item.attributes || {};
    const poster = attrs.posterImage || {};
    const cover = attrs.coverImage || {};
    return {
      id: `kitsu_${item.id}`,
      title: attrs.canonicalTitle || attrs.titles?.en || attrs.titles?.ja || '',
      titleJp: attrs.titles?.ja_jp || attrs.titles?.ja || '',
      cover: poster.large || poster.medium || poster.original || '',
      banner: cover.large || cover.original || '',
      description: attrs.description || attrs.synopsis || '',
      score: attrs.averageRating ? parseFloat(attrs.averageRating) / 10 : 0,
      episodes: attrs.episodeCount || 0,
      status: attrs.status || '',
      startDate: attrs.startDate || '',
      endDate: attrs.endDate || '',
      ageRating: attrs.ageRating || '',
      subtype: attrs.subtype || '',
    };
  }
}

export class AcgClubService extends BaseExternalAPI {
  constructor() {
    super('https://rabtman.com/api/v2/acgclub');
  }

  async getPictures(type = '', offset = 1, limit = 20, query = '') {
    let url;
    if (type) {
      url = `${this.baseUrl}/category/${type}/pictures?offset=${offset}&limit=${limit}`;
      if (query) url += `&query=${encodeURIComponent(query)}`;
    } else {
      url = `${this.baseUrl}/pictures?offset=${offset}&limit=${limit}`;
      if (query) url += `&query=${encodeURIComponent(query)}`;
    }
    const data = await this.request(url);
    return data?.data || [];
  }

  async searchPictures(keyword, limit = 20) {
    return this.getPictures('', 1, limit, keyword);
  }

  static normalizePicture(item) {
    return {
      id: `acgclub_${item.sort}`,
      title: item.title || '',
      type: item.type || '',
      thumbnail: item.thumbnail || '',
      images: item.imgUrls || [],
    };
  }
}

export class MoegirlService extends BaseExternalAPI {
  constructor() {
    super('https://mzh.moegirl.org.cn/api.php');
  }

  async search(keyword, limit = 20) {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: keyword,
      srlimit: limit,
      format: 'json',
      origin: '*',
    });
    const url = `${this.baseUrl}?${params}`;
    try {
      const data = await this.request(url);
      return data?.query?.search || [];
    } catch (err) {
      console.error('Moegirl API Error:', err);
      return [];
    }
  }

  async getPage(title) {
    const params = new URLSearchParams({
      action: 'parse',
      page: title,
      prop: 'text',
      format: 'json',
      origin: '*',
    });
    const url = `${this.baseUrl}?${params}`;
    try {
      const data = await this.request(url);
      return data?.parse?.text?.['*'] || '';
    } catch (err) {
      console.error('Moegirl API Error:', err);
      return '';
    }
  }

  static getSearchUrl(keyword) {
    return `https://mzh.moegirl.org.cn/index.php?search=${encodeURIComponent(keyword)}`;
  }

  static normalizeSearchResult(item) {
    return {
      id: `moegirl_${item.pageid}`,
      title: item.title || '',
      snippet: item.snippet ? item.snippet.replace(/<[^>]*>/g, '') : '',
      url: `https://mzh.moegirl.org.cn/${encodeURIComponent(item.title)}`,
    };
  }
}

export class AnimeAPIService extends BaseExternalAPI {
  constructor(baseUrl = 'http://localhost:6001') {
    super(baseUrl);
  }

  async searchVideo(keyword, engine = '') {
    const url = `${this.baseUrl}/video/search?keyword=${encodeURIComponent(keyword)}${engine ? `&engine=${engine}` : ''}`;
    try {
      const data = await this.request(url);
      return data || [];
    } catch (err) {
      console.error('AnimeAPI Error:', err);
      return [];
    }
  }

  async getVideoDetail(url) {
    const apiUrl = `${this.baseUrl}/video/detail?url=${encodeURIComponent(url)}`;
    try {
      const data = await this.request(apiUrl);
      return data;
    } catch (err) {
      console.error('AnimeAPI Error:', err);
      return null;
    }
  }

  async searchNovel(keyword, engine = '') {
    const apiUrl = `${this.baseUrl}/novel/search?keyword=${encodeURIComponent(keyword)}${engine ? `&engine=${engine}` : ''}`;
    try {
      const data = await this.request(apiUrl);
      return data || [];
    } catch (err) {
      console.error('AnimeAPI Error:', err);
      return [];
    }
  }

  async searchMusic(keyword, engine = '') {
    const apiUrl = `${this.baseUrl}/music/search?keyword=${encodeURIComponent(keyword)}${engine ? `&engine=${engine}` : ''}`;
    try {
      const data = await this.request(apiUrl);
      return data || [];
    } catch (err) {
      console.error('AnimeAPI Error:', err);
      return [];
    }
  }

  static normalizeVideo(item) {
    return {
      id: `animeapi_${item.id || Date.now()}`,
      title: item.title || '',
      cover: item.cover || '',
      url: item.url || '',
      engine: item.engine || '',
      episode: item.episode || '',
    };
  }
}

export const ExternalAPIRegistry = {
  anilist: new AniListService(),
  kitsu: new KitsuService(),
  acgclub: new AcgClubService(),
  moegirl: new MoegirlService(),
  animeapi: new AnimeAPIService(),
};

export default ExternalAPIRegistry;
