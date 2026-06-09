/**
 * Bangumi 数据爬取脚本
 *
 * 功能：爬取 Bangumi 条目数据（动画/书籍/游戏）并存储到 SQLite 数据库
 * 用法：node scripts/crawl-bangumi.js [选项]
 *
 * 选项：
 *   --type=2        仅爬取指定类型（1=书籍, 2=动画, 4=游戏），默认爬全部
 *   --delay=200     请求间隔（毫秒），默认 200
 *   --db=./bangumi.db  数据库文件路径，默认 ./bangumi.db
 *   --detail        是否爬取详情（角色/Staff），默认开启
 *   --no-detail     不爬取详情，仅基本信息
 *   --proxy=URL     使用代理（如 Cloudflare Worker 地址）
 *
 * 示例：
 *   node scripts/crawl-bangumi.js --type=2 --delay=300
 *   node scripts/crawl-bangumi.js --proxy=https://your-worker.workers.dev/api/bangumi
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// ============ 配置 ============

const BANGUMI_API = 'https://api.bgm.tv';
const USER_AGENT = 'ANISpace-Crawler/1.0 (https://github.com/anispace)';

// 条目类型映射
const SUBJECT_TYPES = {
  1: '书籍',  // 包含小说、漫画
  2: '动画',
  4: '游戏',
};

// 默认爬取的类型
const DEFAULT_TYPES = [1, 2, 4];

// 请求间隔（毫秒）
const DEFAULT_DELAY = 200;

// 每页数量
const PAGE_SIZE = 50;

// 最大重试次数
const MAX_RETRIES = 3;

// ============ 参数解析 ============

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    types: DEFAULT_TYPES,
    delay: DEFAULT_DELAY,
    dbPath: resolve(process.cwd(), 'bangumi.db'),
    fetchDetail: true,
    proxy: '',
  };

  for (const arg of args) {
    if (arg.startsWith('--type=')) {
      const type = parseInt(arg.split('=')[1]);
      if (SUBJECT_TYPES[type]) {
        config.types = [type];
      } else {
        console.error(`未知类型: ${type}，可选: ${Object.keys(SUBJECT_TYPES).join(', ')}`);
        process.exit(1);
      }
    } else if (arg.startsWith('--delay=')) {
      config.delay = parseInt(arg.split('=')[1]) || DEFAULT_DELAY;
    } else if (arg.startsWith('--db=')) {
      config.dbPath = resolve(arg.split('=')[1]);
    } else if (arg === '--no-detail') {
      config.fetchDetail = false;
    } else if (arg === '--detail') {
      config.fetchDetail = true;
    } else if (arg.startsWith('--proxy=')) {
      config.proxy = arg.split('=')[1].replace(/\/$/, '');
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Bangumi 数据爬取脚本

用法: node scripts/crawl-bangumi.js [选项]

选项:
  --type=N        仅爬取指定类型（1=书籍, 2=动画, 4=游戏），默认全部
  --delay=N       请求间隔毫秒数，默认 200
  --db=PATH       数据库文件路径，默认 ./bangumi.db
  --detail        爬取详情（角色/Staff），默认开启
  --no-detail     不爬取详情，仅基本信息
  --proxy=URL     使用代理地址（如 Cloudflare Worker）
  --help          显示帮助信息
      `);
      process.exit(0);
    }
  }

  return config;
}

// ============ 工具函数 ============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
        },
      });

      if (res.status === 429) {
        // 速率限制，等待更长时间
        console.log(`  ⚠ 429 速率限制，等待 10 秒...`);
        await sleep(10000);
        continue;
      }

      if (res.status === 404) {
        return null;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      console.log(`  ⚠ 请求失败 (${err.message})，第 ${i + 1} 次重试...`);
      await sleep(2000 * (i + 1));
    }
  }
}

function buildApiUrl(path) {
  return `${BANGUMI_API}${path}`;
}

// ============ 数据库 ============

function initDatabase(dbPath) {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);

  // 启用 WAL 模式提升写入性能
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY,
      type INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      name_cn TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '{}',
      rating_score REAL NOT NULL DEFAULT 0,
      rating_total INTEGER NOT NULL DEFAULT 0,
      rating_count TEXT NOT NULL DEFAULT '{}',
      eps INTEGER NOT NULL DEFAULT 0,
      eps_count INTEGER NOT NULL DEFAULT 0,
      air_date TEXT NOT NULL DEFAULT '',
      air_weekday INTEGER NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL DEFAULT 0,
      platform TEXT NOT NULL DEFAULT '',
      collection TEXT NOT NULL DEFAULT '{}',
      infobox TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      volume_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY,
      subject_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      name_cn TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      role INTEGER NOT NULL DEFAULT 0,
      actors TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );

    CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY,
      subject_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      name_cn TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      jobs TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );

    CREATE TABLE IF NOT EXISTS crawl_progress (
      type INTEGER PRIMARY KEY,
      last_offset INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      phase TEXT NOT NULL DEFAULT 'list',
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_subjects_type ON subjects(type);
    CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name);
    CREATE INDEX IF NOT EXISTS idx_subjects_name_cn ON subjects(name_cn);
    CREATE INDEX IF NOT EXISTS idx_subjects_rating ON subjects(rating_score DESC);
    CREATE INDEX IF NOT EXISTS idx_subjects_rank ON subjects(rank);
    CREATE INDEX IF NOT EXISTS idx_characters_subject ON characters(subject_id);
    CREATE INDEX IF NOT EXISTS idx_persons_subject ON persons(subject_id);
  `);

  return db;
}

// ============ 爬取逻辑 ============

/**
 * 阶段1：通过 browse 接口获取所有条目的基本信息
 */
async function crawlListPhase(db, type, delay, proxy) {
  const typeName = SUBJECT_TYPES[type];
  const progress = db.prepare('SELECT * FROM crawl_progress WHERE type = ?').get(type);
  let startOffset = progress?.last_offset || 0;
  let total = progress?.total || 0;

  const insertSubject = db.prepare(`
    INSERT OR REPLACE INTO subjects (id, type, name, name_cn, summary, image, images,
      rating_score, rating_total, rating_count, eps, eps_count, air_date, air_weekday,
      rank, platform, collection, infobox, tags, volume_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateProgress = db.prepare(`
    INSERT OR REPLACE INTO crawl_progress (type, last_offset, total, phase, updated_at)
    VALUES (?, ?, ?, 'list', ?)
  `);

  console.log(`\n📋 [${typeName}] 开始爬取列表，从偏移 ${startOffset} 开始...`);

  let offset = startOffset;
  let consecutiveEmpty = 0;

  while (consecutiveEmpty < 3) {
    const apiUrl = proxy
      ? `${proxy}/v0/subjects?type=${type}&limit=${PAGE_SIZE}&offset=${offset}`
      : buildApiUrl(`/v0/subjects?type=${type}&limit=${PAGE_SIZE}&offset=${offset}`);

    let data;
    try {
      data = await fetchWithRetry(apiUrl);
    } catch (err) {
      console.error(`  ✗ 请求失败: ${err.message}`);
      break;
    }

    if (!data || !data.data || data.data.length === 0) {
      consecutiveEmpty++;
      console.log(`  ⚠ 空页 (offset=${offset})，连续空页: ${consecutiveEmpty}`);
      offset += PAGE_SIZE;
      await sleep(delay);
      continue;
    }

    consecutiveEmpty = 0;
    total = data.total || total;

    // 批量写入
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        if (!item || !item.id) continue;
        const rating = item.rating || {};
        const ratingCount = rating.count || {};
        insertSubject.run(
          item.id,
          item.type || type,
          item.name || '',
          item.name_cn || '',
          item.summary || '',
          item.images?.common || item.images?.medium || '',
          JSON.stringify(item.images || {}),
          rating.score || rating.score === 0 ? rating.score : 0,
          rating.total || 0,
          JSON.stringify(ratingCount),
          item.eps || 0,
          item.total_episodes || item.eps_count || 0,
          item.date || item.air_date || '',
          item.air_weekday || 0,
          item.rank || 0,
          item.platform || '',
          JSON.stringify(item.collection || {}),
          JSON.stringify(item.infobox || []),
          JSON.stringify(item.tags || []),
          item.volumes || 0,
          Date.now(),
        );
      }
    });

    insertMany(data.data);

    // 更新进度
    offset += PAGE_SIZE;
    updateProgress.run(type, offset, total, Date.now());

    // 进度显示
    const pct = total > 0 ? ((offset / total) * 100).toFixed(1) : '?';
    process.stdout.write(`\r  ✓ [${typeName}] ${offset}/${total} (${pct}%)`);

    await sleep(delay);
  }

  console.log(`\n  ✓ [${typeName}] 列表爬取完成，共 ${offset} 条`);

  // 标记列表阶段完成
  updateProgress.run(type, offset, total, Date.now());

  return { type, total, offset };
}

/**
 * 阶段2：获取每个条目的详细信息（角色、Staff）
 */
async function crawlDetailPhase(db, type, delay, proxy) {
  const typeName = SUBJECT_TYPES[type];

  // 获取需要更新详情的条目
  const subjects = db.prepare(`
    SELECT id FROM subjects
    WHERE type = ? AND updated_at > 0
    AND id NOT IN (SELECT DISTINCT subject_id FROM characters)
    AND id NOT IN (SELECT DISTINCT subject_id FROM persons)
    ORDER BY id
  `).all(type);

  console.log(`\n🔍 [${typeName}] 需要爬取详情的条目: ${subjects.length} 条`);

  if (subjects.length === 0) {
    console.log(`  ✓ [${typeName}] 所有条目详情已存在，跳过`);
    return;
  }

  const insertCharacter = db.prepare(`
    INSERT OR REPLACE INTO characters (id, subject_id, name, name_cn, image, role, actors)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPerson = db.prepare(`
    INSERT OR REPLACE INTO persons (id, subject_id, name, name_cn, image, role, jobs)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  let errors = 0;

  for (const { id } of subjects) {
    try {
      // 获取角色
      const charUrl = proxy
        ? `${proxy}/v0/subjects/${id}/characters`
        : buildApiUrl(`/v0/subjects/${id}/characters`);
      const charData = await fetchWithRetry(charUrl);

      if (Array.isArray(charData)) {
        const insertChars = db.transaction((chars) => {
          for (const c of chars) {
            if (!c || !c.id) continue;
            const actors = (c.actors || []).map(a => ({
              id: a.id,
              name: a.name,
              image: a.images?.grid || '',
            }));
            insertCharacter.run(
              c.id,
              id,
              c.name || '',
              c.name_cn || '',
              c.images?.grid || c.images?.medium || '',
              c.role || 0,
              JSON.stringify(actors),
            );
          }
        });
        insertChars(charData);
      }

      await sleep(delay / 2);

      // 获取 Staff
      const personUrl = proxy
        ? `${proxy}/v0/subjects/${id}/persons`
        : buildApiUrl(`/v0/subjects/${id}/persons`);
      const personData = await fetchWithRetry(personUrl);

      if (Array.isArray(personData)) {
        const insertPersons = db.transaction((persons) => {
          for (const p of persons) {
            if (!p || !p.id) continue;
            insertPerson.run(
              p.id,
              id,
              p.name || '',
              p.name_cn || '',
              p.images?.grid || p.images?.medium || '',
              p.role || '',
              JSON.stringify(p.jobs || []),
            );
          }
        });
        insertPersons(personData);
      }

      count++;
      if (count % 100 === 0) {
        process.stdout.write(`\r  ✓ [${typeName}] 详情: ${count}/${subjects.length} (${((count / subjects.length) * 100).toFixed(1)}%) 错误: ${errors}`);
      }

      await sleep(delay / 2);
    } catch (err) {
      errors++;
      if (errors % 10 === 0) {
        console.log(`\n  ⚠ 累计错误: ${errors}`);
      }
      await sleep(1000);
    }
  }

  console.log(`\n  ✓ [${typeName}] 详情爬取完成: ${count} 成功, ${errors} 失败`);
}

// ============ 主函数 ============

async function main() {
  const config = parseArgs();

  console.log('╔══════════════════════════════════════╗');
  console.log('║   Bangumi 数据爬取脚本 v1.0          ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n配置:`);
  console.log(`  类型: ${config.types.map(t => `${SUBJECT_TYPES[t]}(${t})`).join(', ')}`);
  console.log(`  延迟: ${config.delay}ms`);
  console.log(`  数据库: ${config.dbPath}`);
  console.log(`  详情: ${config.fetchDetail ? '是' : '否'}`);
  console.log(`  代理: ${config.proxy || '无'}`);

  const db = initDatabase(config.dbPath);
  const startTime = Date.now();

  try {
    // 阶段1：爬取列表
    console.log('\n━━━ 阶段1：爬取条目列表 ━━━');
    for (const type of config.types) {
      await crawlListPhase(db, type, config.delay, config.proxy);
    }

    // 阶段2：爬取角色和 Staff
    if (config.fetchDetail) {
      console.log('\n━━━ 阶段2：爬取角色和 Staff ━━━');
      for (const type of config.types) {
        await crawlDetailPhase(db, type, config.delay, config.proxy);
      }
    }

    // 统计
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log('\n━━━ 爬取完成 ━━━');
    for (const type of config.types) {
      const count = db.prepare('SELECT COUNT(*) as c FROM subjects WHERE type = ?').get(type);
      const charCount = db.prepare(`
        SELECT COUNT(*) as c FROM characters WHERE subject_id IN (SELECT id FROM subjects WHERE type = ?)
      `).get(type);
      const personCount = db.prepare(`
        SELECT COUNT(*) as c FROM persons WHERE subject_id IN (SELECT id FROM subjects WHERE type = ?)
      `).get(type);
      console.log(`  ${SUBJECT_TYPES[type]}: ${count.c} 条目, ${charCount.c} 角色, ${personCount.c} Staff`);
    }
    console.log(`  耗时: ${elapsed} 分钟`);

  } catch (err) {
    console.error(`\n✗ 爬取失败: ${err.message}`);
    console.error(err.stack);
  } finally {
    db.close();
  }
}

main();
