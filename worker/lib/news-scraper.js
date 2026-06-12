/**
 * ANISpace 资讯爬虫模块
 *
 * 数据源：
 * 1. Bangumi Calendar API — 当季新番
 * 2. Bangumi 热门排行 — 高分动画
 * 3. 游民星空 ACG — 中文资讯
 * 4. 3DMGame 动漫 — 游戏+动漫资讯
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
  };

  const fn = scrapers[sourceName];
  if (!fn) return [];

  try {
    return await fn();
  } catch {
    return [];
  }
}
