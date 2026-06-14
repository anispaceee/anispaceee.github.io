// src/services/AniListService.js

const ENDPOINT = 'https://graphql.anilist.co';
const TIMEOUT = 5000;
const RATE_LIMIT_DELAY = 700; // ~85 requests/min, under 90 limit

let lastRequestTime = 0;

async function rateLimitedFetch(query, variables = {}) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY - elapsed));
  }
  lastRequestTime = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`AniList API error: ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message || 'GraphQL error');
    return json.data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('AniList request timeout');
    throw err;
  }
}

export const AniListService = {
  _available: null,

  async checkAvailability() {
    try {
      await rateLimitedFetch('{ Media(id: 1) { id } }');
      this._available = true;
    } catch {
      this._available = false;
    }
    return this._available;
  },

  isAvailable() {
    return this._available;
  },

  async searchAnime(title, page = 1, perPage = 5) {
    const query = `
      query ($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(search: $search, type: ANIME, isAdult: false) {
            id
            idMal
            title { romaji english native }
            description(asHtml: false)
            coverImage { large medium }
            bannerImage
            startDate { year month day }
            endDate { year month day }
            episodes
            status
            averageScore
            meanScore
            popularity
            favourites
            siteUrl
            externalLinks { site url type }
            studios { nodes { name siteUrl } }
            staff(sort: RELEVANCE, perPage: 6) { nodes { name { full } primaryOccupations } }
            nextAiringEpisode { airingAt timeUntilAiring episode }
          }
        }
      }
    `;
    const data = await rateLimitedFetch(query, { search: title, page, perPage });
    return data?.Page?.media || [];
  },

  async getAnimeById(anilistId) {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          title { romaji english native }
          description(asHtml: false)
          coverImage { large medium color }
          bannerImage
          startDate { year month day }
          endDate { year month day }
          episodes
          status
          averageScore
          meanScore
          popularity
          favourites
          siteUrl
          externalLinks { site url type }
          genres
          tags { name rank }
          studios { nodes { name siteUrl isAnimationStudio } }
          staff(sort: RELEVANCE, perPage: 10) { nodes { name { full } primaryOccupations siteUrl } }
          characters(sort: RELEVANCE, perPage: 6) { nodes { name { full } siteUrl image { large } } }
          nextAiringEpisode { airingAt timeUntilAiring episode }
          rankings { rank type season year allTime context }
        }
      }
    `;
    const data = await rateLimitedFetch(query, { id: anilistId });
    return data?.Media || null;
  },

  async findByBgmId(bgmId) {
    // AniList doesn't have direct bgmId lookup, search via externalLinks
    // This is a best-effort approach
    const query = `
      query ($search: String) {
        Page(page: 1, perPage: 10) {
          media(search: $search, type: ANIME) {
            id
            title { romaji english native }
            externalLinks { site url type }
            averageScore
          }
        }
      }
    `;
    // We can't directly search by bgmId, return null
    // SourceMerger will handle title-based matching
    return null;
  },

  async getAiringSchedule(page = 1, perPage = 50) {
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          airingSchedules(airingAt_greater: 0, sort: TIME) {
            id
            airingAt
            timeUntilAiring
            episode
            media {
              id
              title { romaji english native }
              coverImage { large medium }
              siteUrl
            }
          }
        }
      }
    `;
    const data = await rateLimitedFetch(query, { page, perPage });
    return data?.Page?.airingSchedules || [];
  },
};
