/**
 * ANISpace 资讯爬虫模块
 *
 * 数据源：
 * 1. Bangumi Calendar API — 当季新番
 * 2. Bangumi 热门排行 — 高分动画
 * 3. Bangumi 游戏排行 — 高分游戏
 * 4. Bangumi 小说排行 — 高分小说/漫画
 * 5. 月幕 Galgame — Galgame 发行（OAuth2 API）
 * 6. HikariNagi — 光凪 Galgame 社区（HTML 爬取）
 * 7. CnGal — 中文 Gal 文章/新闻/每周速报（公开 API）
 * 8. VNDB — 视觉小说数据库（公开 API）
 * 9. Steam — 精选/特惠游戏
 * 10. Jikan Season — MyAnimeList 当季新番（公开 API）
 * 11. Jikan Top — MyAnimeList 热门排行（公开 API）
 * 12. Kitsu Trending — Kitsu 热门动漫（公开 API）
 * 13. Kitsu Current — Kitsu 正在播出（公开 API）
 *
 * 注意：AniList 和 B站 API 在 Cloudflare Worker 环境中被封禁（403/412），不可用
 *
 * 所有爬取结果统一为 { source, source_id, title, link, summary, cover, category, extra }
 */

const BANGUMI_API = 'https://api.bgm.tv';
const BANGUMI_UA = 'Afterrainliu/ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace)';

// ─── Bangumi Calendar ──────────────────────────────────────

async function scrapeBangumiCalendar() {
  const res = await fetch(`${BANGUMI_API}/calendar`, {
    headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'application/json' },
  });
  if (!res.ok) return [];

  const days = await res.json();
  const items = [];

  for (const day of days) {
    const weekday = day.weekday?.cn || '';
    for (const item of (day.items || [])) {
      if (item.type !== 2) continue;
      const rating = item.rating?.score || 0;
      const doing = item.collection?.doing || 0;
      items.push({
        source: 'bangumi_calendar',
        source_id: `bgm_${item.id}`,
        title: item.name_cn || item.name || '',
        link: (item.url || `https://bgm.tv/subject/${item.id}`).replace('http://', 'https://'),
        summary: item.summary || `${weekday}放送 · 评分 ${rating} · ${doing}人在看`,
        cover: (item.images?.large || item.images?.common || '').replace('http://', 'https://'),
        category: '新番导视',
        extra: JSON.stringify({
          weekday,
          rating,
          doing,
          air_date: item.air_date || '',
          name_jp: item.name || '',
          bgm_id: item.id,
        }),
      });
    }
  }
  return items;
}

// ─── Bangumi Hot (browser rank) ────────────────────────────

async function scrapeBangumiHot() {
  const res = await fetch(`${BANGUMI_API}/v0/subjects?type=2&sort=rank&limit=20`, {
    headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'application/json' },
  });
  if (!res.ok) return [];

  try {
    const data = await res.json();
    const items = (data.data || []).map(item => ({
      source: 'bangumi_hot',
      source_id: `bgm_hot_${item.id}`,
      title: item.name_cn || item.name || '',
      link: `https://bgm.tv/subject/${item.id}`,
      summary: `评分 ${item.rating?.score || '-'} · 排名 #${item.rank || '-'}`,
      cover: (item.images?.large || item.images?.common || '').replace('http://', 'https://'),
      category: '热门推荐',
      extra: JSON.stringify({
        rating: item.rating?.score || 0,
        rank: item.rank || 0,
        name_jp: item.name || '',
        bgm_id: item.id,
      }),
    }));
    return items;
  } catch {
    return [];
  }
}

// ─── Bangumi 游戏排行 ─────────────────────────────────────

async function scrapeBangumiGame() {
  const res = await fetch(`${BANGUMI_API}/v0/subjects?type=4&sort=rank&limit=20`, {
    headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'application/json' },
  });
  if (!res.ok) return [];

  try {
    const data = await res.json();
    const items = (data.data || []).map(item => ({
      source: 'bangumi_game',
      source_id: `bgm_game_${item.id}`,
      title: item.name_cn || item.name || '',
      link: `https://bgm.tv/subject/${item.id}`,
      summary: `评分 ${item.rating?.score || '-'} · 排名 #${item.rank || '-'} · ${(item.tags || []).slice(0, 3).map(t => t.name).join('/')}`,
      cover: (item.images?.large || item.images?.common || '').replace('http://', 'https://'),
      category: '游戏推荐',
      extra: JSON.stringify({
        rating: item.rating?.score || 0,
        rank: item.rank || 0,
        name_jp: item.name || '',
        bgm_id: item.id,
        platform: item.platform || '',
        tags: (item.tags || []).slice(0, 5).map(t => t.name),
      }),
    }));
    return items;
  } catch {
    return [];
  }
}

// ─── Bangumi 小说/漫画排行 ────────────────────────────────

async function scrapeBangumiBook() {
  const items = [];

  // type=1 小说, type=3 音乐
  for (const [type, typeName] of [[1, '小说'], [3, '音乐']]) {
    try {
      const res = await fetch(`${BANGUMI_API}/v0/subjects?type=${type}&sort=rank&limit=10`, {
        headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'application/json' },
      });
      if (!res.ok) continue;

      const data = await res.json();
      for (const item of (data.data || [])) {
        items.push({
          source: 'bangumi_book',
          source_id: `bgm_book_${item.id}`,
          title: item.name_cn || item.name || '',
          link: `https://bgm.tv/subject/${item.id}`,
          summary: `${typeName} · 评分 ${item.rating?.score || '-'} · 排名 #${item.rank || '-'}`,
          cover: (item.images?.large || item.images?.common || '').replace('http://', 'https://'),
          category: typeName === '小说' ? '轻小说' : '音乐推荐',
          extra: JSON.stringify({
            rating: item.rating?.score || 0,
            rank: item.rank || 0,
            name_jp: item.name || '',
            bgm_id: item.id,
            type: typeName,
          }),
        });
      }
    } catch {}
  }

  return items;
}

// ─── 月幕 Galgame (OAuth2 API) ─────────────────────────────

const YMGAL_TOKEN_URL = 'https://www.ymgal.games/oauth/token';
const YMGAL_API = 'https://www.ymgal.games/open/archive';
const YMGAL_CLIENT_ID = 'ymgal';
const YMGAL_CLIENT_SECRET = 'luna0327';

let ymgalTokenCache = { token: '', expires: 0 };

async function getYmgalToken() {
  if (ymgalTokenCache.token && Date.now() < ymgalTokenCache.expires - 300000) {
    return ymgalTokenCache.token;
  }
  try {
    const res = await fetch(
      `${YMGAL_TOKEN_URL}?grant_type=client_credentials&client_id=${YMGAL_CLIENT_ID}&client_secret=${YMGAL_CLIENT_SECRET}&scope=public`,
      { headers: { 'Accept': 'application/json;charset=utf-8', 'version': '1' } }
    );
    if (!res.ok) return '';
    const data = await res.json();
    const token = data.access_token || '';
    const expiresIn = (data.expires_in || 3600) * 1000;
    ymgalTokenCache = { token, expires: Date.now() + expiresIn };
    return token;
  } catch {
    return '';
  }
}

async function scrapeYmgal() {
  const items = [];
  const token = await getYmgalToken();
  if (!token) return items;

  const headers = {
    'Accept': 'application/json;charset=utf-8',
    'Authorization': `Bearer ${token}`,
    'version': '1',
  };

  // 1. 按日期区间查询近期发行的游戏（正确端点：/open/archive/game）
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const releaseStartDate = thirtyDaysAgo.toISOString().split('T')[0];
    const releaseEndDate = now.toISOString().split('T')[0];

    const res = await fetch(
      `${YMGAL_API}/game?releaseStartDate=${releaseStartDate}&releaseEndDate=${releaseEndDate}`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      const games = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      for (const game of games) {
        const title = game.chineseName || game.mainName || game.name || '';
        if (!title) continue;
        const cover = game.mainImg || '';
        items.push({
          source: 'ymgal',
          source_id: `ymgal_${game.gid}`,
          title,
          link: `https://www.ymgal.games/ga${game.gid}`,
          summary: `${game.orgName || 'Galgame'} · ${game.releaseDate || '发售日期未知'}${game.haveChinese ? ' · 有中文' : ''}`,
          cover,
          category: '新作发售',
          extra: JSON.stringify({
            gid: game.gid,
            type: game.typeDesc || '',
            releaseDate: game.releaseDate || '',
            haveChinese: game.haveChinese || false,
            orgName: game.orgName || '',
            restricted: game.restricted || false,
          }),
        });
      }
    }
  } catch {}

  // 2. 获取随机游戏作为补充
  if (items.length < 5) {
    try {
      const res = await fetch(`${YMGAL_API}/random-game?num=5`, { headers });
      if (res.ok) {
        const data = await res.json();
        const games = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        for (const game of games) {
          const title = game.chineseName || game.mainName || game.name || '';
          if (!title) continue;
          if (items.find(i => i.source_id === `ymgal_${game.gid}`)) continue;
          const cover = game.mainImg
            ? (game.mainImg.startsWith('http') ? game.mainImg : `https://cdn.ymgal.games/${game.mainImg}`)
            : '';
          items.push({
            source: 'ymgal',
            source_id: `ymgal_${game.gid}`,
            title,
            link: `https://www.ymgal.games/ga${game.gid}`,
            summary: `${game.orgName || 'Galgame'} · ${game.releaseDate || ''}${game.haveChinese ? ' · 有中文' : ''}`,
            cover,
            category: 'Gal档案',
            extra: JSON.stringify({
              gid: game.gid,
              releaseDate: game.releaseDate || '',
              haveChinese: game.haveChinese || false,
            }),
          });
        }
      }
    } catch {}
  }

  return items.slice(0, 20);
}

// ─── HikariNagi (HTML 爬取) ────────────────────────────────

async function scrapeHikariNagi() {
  const items = [];

  try {
    const res = await fetch('https://www.hikarinagi.org/', {
      headers: { 'User-Agent': BANGUMI_UA, 'Accept': 'text/html' },
    });
    if (!res.ok) return items;

    const html = await res.text();

    const articleRe = /href="https?:\/\/www\.hikarinagi\.org\/community\/article\/(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    const seen = new Set();

    while ((match = articleRe.exec(html)) !== null && items.length < 10) {
      const id = match[1];
      const titleRaw = match[2].replace(/<[^>]*>/g, '').trim();
      if (!titleRaw || titleRaw.length < 4 || seen.has(id)) continue;
      seen.add(id);
      items.push({
        source: 'hikarinagi',
        source_id: `hn_${id}`,
        title: titleRaw,
        link: `https://www.hikarinagi.org/community/article/${id}`,
        summary: '光凪 Galgame 社区',
        cover: '',
        category: 'Gal档案',
        extra: JSON.stringify({ id: Number(id), type: 'article' }),
      });
    }

    const weeklyRe = /href="(https?:\/\/www\.hikarinagi\.org\/community\/article\/(\d+))"[^>]*>[\s\S]*?Gal周报/gi;
    while ((match = weeklyRe.exec(html)) !== null && items.length < 15) {
      const url = match[1];
      const id = match[2];
      if (seen.has(id)) continue;
      seen.add(id);
      const titleMatch = match[0].match(/>([^<]*(?:Gal周报|周报)[^<]*)</);
      const title = titleMatch ? titleMatch[1].trim() : `Gal周报 #${id}`;
      items.push({
        source: 'hikarinagi',
        source_id: `hn_weekly_${id}`,
        title,
        link: url,
        summary: '光凪 Gal 周报',
        cover: '',
        category: '每周速报',
        extra: JSON.stringify({ id: Number(id), type: 'weekly' }),
      });
    }
  } catch {}

  return items.slice(0, 15);
}

// ─── CnGal (公开 API) ──────────────────────────────────────

const CNGAL_API = 'https://api.cngal.org/api';

async function scrapeCnGal() {
  const items = [];

  // 1. 获取最新文章（POST 请求）
  try {
    const res = await fetch(`${CNGAL_API}/articles/GetArticleHomeList`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 1, pageSize: 10 }),
    });
    if (res.ok) {
      const data = await res.json();
      const articles = Array.isArray(data) ? data : (data.data || data.result || []);
      for (const article of articles.slice(0, 10)) {
        const title = article.name || article.title || article.displayName || '';
        if (!title) continue;
        const articleLink = article.link || `https://www.cngal.org/articles/index/${article.id}`;
        items.push({
          source: 'cngal',
          source_id: `cngal_art_${article.id}`,
          title,
          link: articleLink,
          summary: (article.briefIntroduction || '').slice(0, 100),
          cover: article.mainImage || '',
          category: '业界动态',
          extra: JSON.stringify({
            id: article.id,
            type: 'article',
            author: article.createUserName || '',
            createTime: article.lastEditTime || '',
            originalLink: article.link || '',
            readerCount: article.readerCount || 0,
          }),
        });
      }
    }
  } catch {}

  // 2. 获取每周速报概览（GET 请求）
  try {
    const res = await fetch(`${CNGAL_API}/news/GetWeeklyNewsOverview`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const weeklyList = Array.isArray(data) ? data : (data.result || data.data || []);
      for (const weekly of weeklyList.slice(0, 5)) {
        const title = weekly.name || weekly.title || weekly.displayName || '';
        if (!title) continue;
        if (items.find(i => i.title === title)) continue;
        const weeklyLink = weekly.link || `https://www.cngal.org/news/weekly/${weekly.id}`;
        items.push({
          source: 'cngal',
          source_id: `cngal_weekly_${weekly.id}`,
          title,
          link: weeklyLink,
          summary: (weekly.briefIntroduction || '').slice(0, 100),
          cover: weekly.mainImage || '',
          category: '每周速报',
          extra: JSON.stringify({
            id: weekly.id,
            type: 'weekly',
            displayName: weekly.displayName || '',
          }),
        });
      }
    }
  } catch {}

  // 3. 获取近期发售游戏（GET 请求）
  try {
    const res = await fetch(`${CNGAL_API}/entries/GetPublishGamesByTime`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const games = Array.isArray(data) ? data : (data.result || data.data || []);
      for (const game of games.slice(0, 10)) {
        const title = game.name || '';
        if (!title) continue;
        if (items.find(i => i.source_id === `cngal_game_${game.id}`)) continue;
        items.push({
          source: 'cngal',
          source_id: `cngal_game_${game.id}`,
          title,
          link: `https://www.cngal.org/entries/index/${game.id}`,
          summary: (game.briefIntroduction || '').slice(0, 100) || `${game.publishTime || ''}`,
          cover: game.mainImage || '',
          category: 'Gal档案',
          extra: JSON.stringify({
            id: game.id,
            type: 'game',
            publishTime: game.publishTime || '',
          }),
        });
      }
    }
  } catch {}

  return items.slice(0, 25);
}

// ─── VNDB 视觉小说数据库 (公开 API) ──────────────────────

const VNDB_API = 'https://api.vndb.org/kana/vn';

async function scrapeVNDB() {
  const items = [];

  // 1. 高评分视觉小说
  try {
    const res = await fetch(VNDB_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: ['votecount', '>=', 100],
        fields: 'title, image.url, rating, length_minutes, developers.name, developers.original',
        sort: 'rating',
        results: 15,
        page: 1,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      for (const vn of (data.results || [])) {
        const title = vn.title || '';
        if (!title) continue;
        const rating = vn.rating ? (vn.rating / 10).toFixed(1) : '-';
        const dev = (vn.developers || [])[0]?.name || (vn.developers || [])[0]?.original || '';
        const lengthMin = vn.length_minutes || 0;
        const lengthStr = lengthMin > 0 ? ` · 约${Math.round(lengthMin / 60)}小时` : '';
        items.push({
          source: 'vndb',
          source_id: `vndb_${vn.id}`,
          title,
          link: `https://vndb.org/${vn.id}`,
          summary: `VNDB ${rating}分${dev ? ` · ${dev}` : ''}${lengthStr}`,
          cover: vn.image?.url || '',
          category: 'VN推荐',
          extra: JSON.stringify({
            vndbId: vn.id,
            rating: vn.rating || 0,
            lengthMinutes: vn.length_minutes || 0,
            developer: dev,
          }),
        });
      }
    }
  } catch {}

  // 2. 最近新增的视觉小说
  try {
    const res = await fetch(VNDB_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: ['released', '>=', '2026-01-01'],
        fields: 'title, image.url, rating, length_minutes, developers.name',
        sort: 'released',
        results: 10,
        page: 1,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      for (const vn of (data.results || [])) {
        const title = vn.title || '';
        if (!title) continue;
        if (items.find(i => i.source_id === `vndb_${vn.id}`)) continue;
        const rating = vn.rating ? (vn.rating / 10).toFixed(1) : '-';
        const dev = (vn.developers || [])[0]?.name || '';
        items.push({
          source: 'vndb',
          source_id: `vndb_new_${vn.id}`,
          title,
          link: `https://vndb.org/${vn.id}`,
          summary: `新作VN · ${rating}分${dev ? ` · ${dev}` : ''}`,
          cover: vn.image?.url || '',
          category: '新作发售',
          extra: JSON.stringify({
            vndbId: vn.id,
            rating: vn.rating || 0,
            developer: dev,
          }),
        });
      }
    }
  } catch {}

  return items.slice(0, 25);
}

// ─── Steam 精选/特惠 ──────────────────────────────────────

async function scrapeSteam() {
  const items = [];

  try {
    const res = await fetch('https://store.steampowered.com/api/featuredcategories/', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return items;

    const data = await res.json();

    // 1. Spotlight 精选
    const spotlight = data.spotlight || [];
    for (const item of spotlight.slice(0, 5)) {
      const title = item.name || '';
      if (!title) continue;
      items.push({
        source: 'steam',
        source_id: `steam_spot_${item.id}`,
        title,
        link: `https://store.steampowered.com/app/${item.id}`,
        summary: `Steam 精选${item.discounted ? ` · -${item.discount_percent}%` : ''}`,
        cover: item.header_image?.replace('http://', 'https://') || item.large_capsule_image?.replace('http://', 'https://') || '',
        category: 'Steam精选',
        extra: JSON.stringify({
          appId: item.id,
          discounted: item.discounted || false,
          discountPercent: item.discount_percent || 0,
          finalPrice: item.final_price || 0,
        }),
      });
    }

    // 2. Daily Deal 每日特惠
    const deals = data.specials || data.daily_deals || [];
    for (const item of (deals.items || deals).slice(0, 10)) {
      const title = item.name || '';
      if (!title) continue;
      if (items.find(i => i.source_id === `steam_deal_${item.id}`)) continue;
      items.push({
        source: 'steam',
        source_id: `steam_deal_${item.id}`,
        title,
        link: `https://store.steampowered.com/app/${item.id}`,
        summary: `Steam 特惠 · -${item.discount_percent || 0}%`,
        cover: item.header_image?.replace('http://', 'https://') || item.large_capsule_image?.replace('http://', 'https://') || '',
        category: 'Steam特惠',
        extra: JSON.stringify({
          appId: item.id,
          discountPercent: item.discount_percent || 0,
          originalPrice: item.original_price || 0,
          finalPrice: item.final_price || 0,
        }),
      });
    }

    // 3. New Releases 新品
    const newReleases = data.new_releases || [];
    for (const item of (newReleases.items || newReleases).slice(0, 5)) {
      const title = item.name || '';
      if (!title) continue;
      if (items.find(i => i.source_id === `steam_new_${item.id}`)) continue;
      items.push({
        source: 'steam',
        source_id: `steam_new_${item.id}`,
        title,
        link: `https://store.steampowered.com/app/${item.id}`,
        summary: 'Steam 新品',
        cover: item.header_image?.replace('http://', 'https://') || item.large_capsule_image?.replace('http://', 'https://') || '',
        category: 'Steam新品',
        extra: JSON.stringify({
          appId: item.id,
        }),
      });
    }
  } catch {}

  return items.slice(0, 20);
}

// ─── Jikan (MyAnimeList) ──────────────────────────────────────
// 爬取当季新番和热门排行

const JIKAN_API = 'https://api.jikan.moe/v4';

async function scrapeJikanSeason() {
  const items = [];

  try {
    // 获取当季新番
    const res = await fetch(`${JIKAN_API}/seasons/now?limit=25`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return items;

    const data = await res.json();
    const animeList = data.data || [];

    for (const anime of animeList) {
      const title = anime.title || anime.title_japanese || '';
      if (!title) continue;

      const genres = (anime.genres || []).map(g => g.name).join('、');
      const studios = (anime.studios || []).map(s => s.name).join('、');
      const score = anime.score || 0;
      const status = anime.status || '';

      items.push({
        source: 'jikan_season',
        source_id: `mal_${anime.mal_id}`,
        title,
        link: anime.url || `https://myanimelist.net/anime/${anime.mal_id}`,
        summary: `${anime.type || 'TV'} · ${anime.episodes || '?'}集 · 评分 ${score} · ${genres || '未知类型'}`,
        cover: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
        category: '新番导视',
        extra: JSON.stringify({
          malId: anime.mal_id,
          score,
          episodes: anime.episodes,
          type: anime.type,
          status,
          genres,
          studios,
          year: anime.year,
          season: anime.season,
          airing: anime.airing,
        }),
      });
    }
  } catch {}

  return items.slice(0, 25);
}

async function scrapeJikanTop() {
  const items = [];

  try {
    // 获取评分排行
    const res = await fetch(`${JIKAN_API}/top/anime?filter=bypopularity&limit=25`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return items;

    const data = await res.json();
    const animeList = data.data || [];

    for (const anime of animeList) {
      const title = anime.title || anime.title_japanese || '';
      if (!title) continue;

      const genres = (anime.genres || []).map(g => g.name).join('、');
      const score = anime.score || 0;
      const rank = anime.rank || 0;
      const popularity = anime.popularity || 0;

      items.push({
        source: 'jikan_top',
        source_id: `mal_top_${anime.mal_id}`,
        title,
        link: anime.url || `https://myanimelist.net/anime/${anime.mal_id}`,
        summary: `排名 #${rank} · 评分 ${score} · ${popularity}人收藏`,
        cover: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
        category: '热门推荐',
        extra: JSON.stringify({
          malId: anime.mal_id,
          score,
          rank,
          popularity,
          genres,
          type: anime.type,
        }),
      });
    }
  } catch {}

  return items.slice(0, 25);
}

// ─── Kitsu (动漫数据库) ──────────────────────────────────────
// 爬取热门动漫和当季新番

const KITSU_API = 'https://kitsu.io/api/edge';

async function scrapeKitsuTrending() {
  const items = [];

  try {
    // 获取热门动漫
    const res = await fetch(`${KITSU_API}/anime?page[limit]=20&sort=popularityRank`, {
      headers: { 'Accept': 'application/vnd.api+json' },
    });
    if (!res.ok) return items;

    const data = await res.json();
    const animeList = data.data || [];

    for (const anime of animeList) {
      const attrs = anime.attributes || {};
      const title = attrs.canonicalTitle || attrs.titles?.en_jp || attrs.titles?.ja || '';
      if (!title) continue;

      const score = attrs.averageRating || 0;
      const rank = attrs.popularityRank || 0;
      const ratingRank = attrs.ratingRank || 0;
      const status = attrs.status || '';
      const type = attrs.subtype || 'TV';

      items.push({
        source: 'kitsu_trending',
        source_id: `kitsu_${anime.id}`,
        title,
        link: `https://kitsu.io/anime/${anime.id}`,
        summary: `${type} · ${attrs.episodeCount || '?'}集 · 评分 ${score/10 || '?'} · 热门排名 #${rank}`,
        cover: attrs.posterImage?.large || attrs.posterImage?.medium || attrs.posterImage?.original || '',
        category: '热门推荐',
        extra: JSON.stringify({
          kitsuId: anime.id,
          slug: attrs.slug,
          score,
          popularityRank: rank,
          ratingRank,
          status,
          type,
          startDate: attrs.startDate,
          endDate: attrs.endDate,
        }),
      });
    }
  } catch {}

  return items.slice(0, 20);
}

async function scrapeKitsuCurrent() {
  const items = [];

  try {
    // 获取当前播出动漫
    const res = await fetch(`${KITSU_API}/anime?page[limit]=20&filter[status]=current&sort=startDate`, {
      headers: { 'Accept': 'application/vnd.api+json' },
    });
    if (!res.ok) return items;

    const data = await res.json();
    const animeList = data.data || [];

    for (const anime of animeList) {
      const attrs = anime.attributes || {};
      const title = attrs.canonicalTitle || attrs.titles?.en_jp || attrs.titles?.ja || '';
      if (!title) continue;

      const score = attrs.averageRating || 0;
      const type = attrs.subtype || 'TV';

      items.push({
        source: 'kitsu_current',
        source_id: `kitsu_cur_${anime.id}`,
        title,
        link: `https://kitsu.io/anime/${anime.id}`,
        summary: `${type} · 正在播出 · 评分 ${score/10 || '?'}`,
        cover: attrs.posterImage?.large || attrs.posterImage?.medium || attrs.posterImage?.original || '',
        category: '新番导视',
        extra: JSON.stringify({
          kitsuId: anime.id,
          slug: attrs.slug,
          score,
          type,
          startDate: attrs.startDate,
          status: attrs.status,
        }),
      });
    }
  } catch {}

  return items.slice(0, 20);
}

// ─── 统一爬取入口 ──────────────────────────────────────────

export async function runAllScrapers(db) {
  const scrapers = [
    { name: 'bangumi_calendar', fn: scrapeBangumiCalendar },
    { name: 'bangumi_hot', fn: scrapeBangumiHot },
    { name: 'bangumi_game', fn: scrapeBangumiGame },
    { name: 'bangumi_book', fn: scrapeBangumiBook },
    { name: 'ymgal', fn: scrapeYmgal },
    { name: 'hikarinagi', fn: scrapeHikariNagi },
    { name: 'cngal', fn: scrapeCnGal },
    { name: 'vndb', fn: scrapeVNDB },
    { name: 'steam', fn: scrapeSteam },
    { name: 'jikan_season', fn: scrapeJikanSeason },
    { name: 'jikan_top', fn: scrapeJikanTop },
    { name: 'kitsu_trending', fn: scrapeKitsuTrending },
    { name: 'kitsu_current', fn: scrapeKitsuCurrent },
  ];

  const results = {};
  let total = 0;

  for (const scraper of scrapers) {
    try {
      const items = await scraper.fn();
      let inserted = 0;

      for (const item of items) {
        try {
          await db.prepare(
            `INSERT OR REPLACE INTO scraped_news (source, source_id, title, link, summary, cover, category, extra, scraped_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).bind(item.source, item.source_id, item.title, item.link, item.summary, item.cover, item.category, item.extra).run();
          inserted++;
        } catch {}
      }

      results[scraper.name] = inserted;
      total += inserted;
    } catch (err) {
      results[scraper.name] = `error: ${err.message}`;
    }
  }

  // 清理 30 天前的旧数据
  try {
    await db.prepare(
      "DELETE FROM scraped_news WHERE scraped_at < datetime('now', '-30 days')"
    ).run();
  } catch {}

  return { total, sources: results };
}

export async function scrapeSingleSource(sourceName) {
  const scrapers = {
    bangumi_calendar: scrapeBangumiCalendar,
    bangumi_hot: scrapeBangumiHot,
    bangumi_game: scrapeBangumiGame,
    bangumi_book: scrapeBangumiBook,
    ymgal: scrapeYmgal,
    hikarinagi: scrapeHikariNagi,
    cngal: scrapeCnGal,
    vndb: scrapeVNDB,
    steam: scrapeSteam,
    jikan_season: scrapeJikanSeason,
    jikan_top: scrapeJikanTop,
    kitsu_trending: scrapeKitsuTrending,
    kitsu_current: scrapeKitsuCurrent,
  };

  const fn = scrapers[sourceName];
  if (!fn) return [];

  try {
    return await fn();
  } catch {
    return [];
  }
}
