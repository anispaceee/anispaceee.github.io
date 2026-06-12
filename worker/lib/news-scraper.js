/**
 * ANISpace 资讯爬虫模块
 *
 * 数据源：
 * 1. Bangumi Calendar API — 当季新番
 * 2. Bangumi 热门排行 — 高分动画
 * 3. 游民星空 ACG — 中文资讯
 * 4. 3DMGame 动漫 — 游戏+动漫资讯
 * 5. 月幕 Galgame — Galgame 发行/档案（OAuth2 API）
 * 6. CnGal — 中文 Gal 文章/新闻/每周速报（公开 API）
 *
 * 所有爬取结果统一为 { source, source_id, title, link, summary, cover, category, extra }
 */

const BANGUMI_API = 'https://api.bgm.tv';
const UA = 'ANISpace/1.0 (https://github.com/anispace)';

// ─── Bangumi Calendar ──────────────────────────────────────

async function scrapeBangumiCalendar() {
  const res = await fetch(`${BANGUMI_API}/calendar`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });
  if (!res.ok) return [];

  const days = await res.json();
  const items = [];

  for (const day of days) {
    const weekday = day.weekday?.cn || '';
    for (const item of (day.items || [])) {
      // 只收录当季有评分的动画
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
  // 使用 /v0/subjects 接口获取高分动画
  const res = await fetch(`${BANGUMI_API}/v0/subjects?type=2&sort=rank&limit=20`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
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

// ─── 游民星空 ACG ──────────────────────────────────────────

async function scrapeGamersky() {
  const res = await fetch('https://acg.gamersky.com/news/', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const items = [];

  // 解析资讯列表：匹配 <a href="...">标题</a> + 日期 + 图片
  // 游民星空的资讯列表结构：
  // <div class="tit"><a href="链接">标题</a></div>
  // <p class="con">摘要</p>
  // <span class="time">日期</span>
  // <img src="封面" />

  // 使用正则提取资讯块
  const blockRe = /<div[^>]*class="[^"]*list_item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let match;
  while ((match = blockRe.exec(html)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"[^>]*>/);
    const dateMatch = block.match(/(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2})/);
    const summaryMatch = block.match(/<p[^>]*class="[^"]*con[^"]*"[^>]*>([\s\S]*?)<\/p>/);

    if (titleMatch) {
      const link = titleMatch[1];
      const title = titleMatch[2].replace(/<[^>]*>/g, '').trim();
      if (!title || !link) continue;

      items.push({
        source: 'gamersky',
        source_id: `gsky_${link.replace(/[^\w]/g, '_').substring(0, 60)}`,
        title,
        link,
        summary: summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').trim() : '',
        cover: imgMatch ? imgMatch[1] : '',
        category: '业界动态',
        extra: JSON.stringify({ date: dateMatch ? dateMatch[1] : '' }),
      });
    }
  }

  // 如果正则没匹配到，尝试更宽松的解析
  if (items.length === 0) {
    // 匹配 <a href="https://acg.gamersky.com/news/.../...shtml">标题</a>
    const linkRe = /<a[^>]*href="(https:\/\/acg\.gamersky\.com\/news\/\d+\/\d+\.shtml)"[^>]*>([\s\S]*?)<\/a>/g;
    let linkMatch;
    while ((linkMatch = linkRe.exec(html)) !== null) {
      const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
      if (!title || title.length < 4) continue;

      items.push({
        source: 'gamersky',
        source_id: `gsky_${linkMatch[1].replace(/[^\w]/g, '_').substring(0, 60)}`,
        title,
        link: linkMatch[1],
        summary: '',
        cover: '',
        category: '业界动态',
        extra: JSON.stringify({}),
      });
    }
  }

  return items.slice(0, 20);
}

// ─── 3DMGame 动漫 ──────────────────────────────────────────

async function scrape3DMGame() {
  const res = await fetch('https://www.3dmgame.com/dongman/', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const items = [];

  // 3DM 动漫列表结构
  // <div class="list"> 中包含 <li> 元素
  // 每个 <li> 包含 <a href="链接"><img src="封面"/></a> + <h2><a href="链接">标题</a></h2> + <p>摘要</p> + <span>日期</span>

  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let liMatch;
  while ((liMatch = liRe.exec(html)) !== null) {
    const block = liMatch[1];

    const titleMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"[^>]*>/);
    const dateMatch = block.match(/(\d{4}-\d{2}-\d{2})/);
    const summaryMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);

    if (titleMatch) {
      const link = titleMatch[1];
      const title = titleMatch[2].replace(/<[^>]*>/g, '').trim();
      if (!title || !link || !link.startsWith('http')) continue;

      items.push({
        source: '3dmgame',
        source_id: `3dm_${link.replace(/[^\w]/g, '_').substring(0, 60)}`,
        title,
        link,
        summary: summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 200) : '',
        cover: imgMatch ? imgMatch[1] : '',
        category: '业界动态',
        extra: JSON.stringify({ date: dateMatch ? dateMatch[1] : '' }),
      });
    }
  }

  // 如果正则没匹配到，尝试更宽松的解析
  if (items.length === 0) {
    const linkRe = /<a[^>]*href="(https:\/\/www\.3dmgame\.com\/[^"]*\d+\.html)"[^>]*>([\s\S]*?)<\/a>/g;
    let linkMatch;
    while ((linkMatch = linkRe.exec(html)) !== null) {
      const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
      if (!title || title.length < 4) continue;

      items.push({
        source: '3dmgame',
        source_id: `3dm_${linkMatch[1].replace(/[^\w]/g, '_').substring(0, 60)}`,
        title,
        link: linkMatch[1],
        summary: '',
        cover: '',
        category: '业界动态',
        extra: JSON.stringify({}),
      });
    }
  }

  return items.slice(0, 20);
}

// ─── 月幕 Galgame (OAuth2 API) ─────────────────────────────

const YMGAL_TOKEN_URL = 'https://www.ymgal.games/oauth/token';
const YMGAL_API = 'https://www.ymgal.games/open/archive';
const YMGAL_CLIENT_ID = 'ymgal';
const YMGAL_CLIENT_SECRET = 'luna0327';

let ymgalTokenCache = { token: '', expires: 0 };

async function getYmgalToken() {
  // 使用缓存的 token（提前 5 分钟过期）
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

  // 优先尝试 OAuth2 API
  const token = await getYmgalToken();
  if (token) {
    const headers = {
      'Accept': 'application/json;charset=utf-8',
      'Authorization': `Bearer ${token}`,
      'version': '1',
    };

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];

      const res = await fetch(
        `${YMGAL_API}/game/released?startDate=${startDate}&endDate=${endDate}&pageNum=1&pageSize=20`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        const games = data.result || [];
        for (const game of games) {
          const title = game.chineseName || game.name || '';
          if (!title) continue;
          items.push({
            source: 'ymgal',
            source_id: `ymgal_${game.gid}`,
            title,
            link: `https://www.ymgal.games/game/${game.gid}`,
            summary: `${game.typeDesc || 'Galgame'} · ${game.releaseDate || '发售日期未知'}${game.haveChinese ? ' · 有中文' : ''}`,
            cover: game.mainImg ? `https://www.ymgal.games${game.mainImg}` : '',
            category: '新作发售',
            extra: JSON.stringify({
              gid: game.gid,
              type: game.typeDesc || '',
              releaseDate: game.releaseDate || '',
              haveChinese: game.haveChinese || false,
              developer: game.developerId || 0,
              restricted: game.restricted || false,
              country: game.country || '',
            }),
          });
        }
      }
    } catch {}
  }

  // API 不可用时，回退到 HTML 爬取
  if (items.length === 0) {
    try {
      const res = await fetch('https://www.ymgal.games/', {
        headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      });
      if (res.ok) {
        const html = await res.text();
        // 尝试从首页提取最新游戏/资讯
        // 匹配游戏卡片链接 /gaXXXXX
        const gameRe = /href="\/ga(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        const seen = new Set();
        while ((match = gameRe.exec(html)) !== null && items.length < 15) {
          const gid = match[1];
          const titleRaw = match[2].replace(/<[^>]*>/g, '').trim();
          if (!titleRaw || titleRaw.length < 2 || seen.has(gid)) continue;
          seen.add(gid);
          items.push({
            source: 'ymgal',
            source_id: `ymgal_${gid}`,
            title: titleRaw,
            link: `https://www.ymgal.games/ga${gid}`,
            summary: '月幕 Galgame',
            cover: '',
            category: 'Gal档案',
            extra: JSON.stringify({ gid: Number(gid), type: 'game' }),
          });
        }
      }
    } catch {}
  }

  return items.slice(0, 20);
}

// ─── CnGal (公开 API) ──────────────────────────────────────

const CNGAL_API = 'https://api.cngal.org/api';

async function scrapeCnGal() {
  const items = [];

  // 1. 获取最新文章
  try {
    const res = await fetch(`${CNGAL_API}/articles/GetArticleHomeList`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const articles = Array.isArray(data) ? data : (data.result || data.data || []);
      for (const article of articles.slice(0, 10)) {
        const title = article.title || article.name || '';
        if (!title) continue;
        items.push({
          source: 'cngal',
          source_id: `cngal_art_${article.id}`,
          title,
          link: `https://www.cngal.org/articles/${article.id}`,
          summary: article.briefIntroduction || article.summary || '',
          cover: article.mainImage || article.cover || '',
          category: '业界动态',
          extra: JSON.stringify({
            id: article.id,
            type: 'article',
            author: article.author || '',
            createTime: article.createTime || '',
          }),
        });
      }
    }
  } catch {}

  // 2. 获取每周速报概览
  try {
    const res = await fetch(`${CNGAL_API}/news/GetWeeklyNewsOverview`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const weeklyList = Array.isArray(data) ? data : (data.result || data.data || []);
      for (const weekly of weeklyList.slice(0, 5)) {
        const title = weekly.title || weekly.name || '';
        if (!title) continue;
        // 避免重复
        if (items.find(i => i.title === title)) continue;
        items.push({
          source: 'cngal',
          source_id: `cngal_weekly_${weekly.id}`,
          title,
          link: `https://www.cngal.org/news/weekly/${weekly.id}`,
          summary: weekly.briefIntroduction || weekly.summary || '',
          cover: weekly.mainImage || weekly.cover || '',
          category: '每周速报',
          extra: JSON.stringify({
            id: weekly.id,
            type: 'weekly',
            period: weekly.period || '',
          }),
        });
      }
    }
  } catch {}

  // 3. 获取近期发售游戏
  try {
    const res = await fetch(`${CNGAL_API}/entries/GetPublishGamesByTime`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const games = Array.isArray(data) ? data : (data.result || data.data || []);
      for (const game of games.slice(0, 10)) {
        const title = game.name || game.chineseName || '';
        if (!title) continue;
        if (items.find(i => i.source_id === `cngal_game_${game.id}`)) continue;
        items.push({
          source: 'cngal',
          source_id: `cngal_game_${game.id}`,
          title,
          link: `https://www.cngal.org/entries/${game.id}`,
          summary: game.briefIntroduction || `${game.publisher || ''} · ${game.publishDate || ''}`,
          cover: game.mainImage || game.cover || '',
          category: '新作发售',
          extra: JSON.stringify({
            id: game.id,
            type: 'game',
            publisher: game.publisher || '',
            publishDate: game.publishDate || '',
          }),
        });
      }
    }
  } catch {}

  return items.slice(0, 25);
}

// ─── 统一爬取入口 ──────────────────────────────────────────

/**
 * 执行所有源的爬取，返回合并后的结果
 * @param {D1Database} db - Cloudflare D1 数据库绑定
 * @returns {{ total: number, sources: Record<string, number> }}
 */
export async function runAllScrapers(db) {
  const scrapers = [
    { name: 'bangumi_calendar', fn: scrapeBangumiCalendar },
    { name: 'bangumi_hot', fn: scrapeBangumiHot },
    { name: 'gamersky', fn: scrapeGamersky },
    { name: '3dmgame', fn: scrape3DMGame },
    { name: 'ymgal', fn: scrapeYmgal },
    { name: 'cngal', fn: scrapeCnGal },
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
            `INSERT OR IGNORE INTO scraped_news (source, source_id, title, link, summary, cover, category, extra, scraped_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          ).bind(item.source, item.source_id, item.title, item.link, item.summary, item.cover, item.category, item.extra).run();
          inserted++;
        } catch {
          // 单条插入失败不影响其他
        }
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

/**
 * 实时爬取单个源（前端按需刷新用）
 * @param {string} sourceName - 源名称
 * @returns {Array} 爬取结果（不写入数据库，直接返回）
 */
export async function scrapeSingleSource(sourceName) {
  const scrapers = {
    bangumi_calendar: scrapeBangumiCalendar,
    bangumi_hot: scrapeBangumiHot,
    gamersky: scrapeGamersky,
    '3dmgame': scrape3DMGame,
    ymgal: scrapeYmgal,
    cngal: scrapeCnGal,
  };

  const fn = scrapers[sourceName];
  if (!fn) return [];

  try {
    return await fn();
  } catch {
    return [];
  }
}
