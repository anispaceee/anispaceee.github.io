#!/usr/bin/env node
/**
 * ANISpace — bangumi-data 一次性全量导入脚本
 *
 * 用法：
 *   node scripts/import-bangumi-data.mjs
 *
 * 前置：
 *   1. 已在 D1 跑过 migrations/v008_bangumi_index.sql
 *   2. 本机有 wrangler（npx wrangler 可用）
 *   3. 已 `npx wrangler login`
 *
 * 工作流程：
 *   1. 拉 bangumi-data latest.json
 *   2. 归一化
 *   3. 直接打 D1 HTTP API（通过 wrangler d1 execute --file 临时表 / 单次 SQL）
 *      或：本地起一个临时 Worker bind 真实 D1（更稳）
 *   4. 输出统计
 *
 * 推荐做法：分批生成 SQL INSERT 文件，再用 `npx wrangler d1 execute` --file 导入。
 * D1 单次 SQL 1MB 上限，故每批 500 条。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP = join(ROOT, '.tmp-import');
const SOURCE_URL = 'https://raw.githubusercontent.com/bangumi-data/bangumi-data/master/data/items/latest.json';
const UA = 'ANISpace/1.0 (https://github.com/afterrain-2005/ANISpace; import-script)';
const BATCH = 50; // 分批模式：D1 SQL 语句长度限制 100KB，每条 INSERT ~2KB，50 条 = 100KB
const DB_NAME = process.env.ANISPACE_D1_NAME || 'anispace-db';
const MODE = process.env.ANISPACE_IMPORT_MODE || 'single'; // 'single' = 单大文件（推荐），'batch' = 分批

function extractAliases(item) {
  const set = new Set();
  // title_translate 是 BTreeMap<Language, Vec<String>>，即 { "zh-Hans": ["译名1", "译名2"], "en": ["English"] }
  const tt = item.title_translate || item.titleTranslate || {};
  for (const langs of Object.values(tt)) {
    if (Array.isArray(langs)) {
      for (const name of langs) {
        if (typeof name === 'string' && name.trim()) set.add(name.trim());
      }
    }
  }
  if (typeof item.title === 'string') set.add(item.title);
  return Array.from(set).slice(0, 30);
}

function pickImage(item) {
  return item.image || (item.images && (item.images.large || item.images.common || item.images.medium)) || '';
}

function pickSummary(item) {
  if (!item) return '';
  if (typeof item.summary === 'string') return item.summary;
  if (item.description) return String(item.description);
  return '';
}

function inferWeek(item) {
  if (!item.begin) return [];
  const d = new Date(item.begin);
  if (isNaN(d.getTime())) return [];
  return [((d.getUTCDay() + 6) % 7) + 1];
}

function normalize(item) {
  const aliases = extractAliases(item);
  const tt = item.title_translate || item.titleTranslate || {};
  return {
    id: Number(item.id),
    title: String(item.title || ''),
    title_cn: (() => {
      // title_translate 是 Map<Language, Vec<String>>
      const zhHans = tt['zh-Hans'] || tt['zh-CN'] || [];
      if (Array.isArray(zhHans) && zhHans.length > 0) return zhHans[0];
      const zhHant = tt['zh-Hant'] || tt['zh-TW'] || [];
      if (Array.isArray(zhHant) && zhHant.length > 0) return zhHant[0];
      for (const [lang, names] of Object.entries(tt)) {
        if (/^zh/i.test(lang) && Array.isArray(names) && names.length > 0) return names[0];
      }
      return '';
    })(),
    title_ja: item.title || '',
    aliases: JSON.stringify(aliases),
    type: Number(item.type) || 2,
    begin: item.begin || '',
    end: item.end || '',
    score: Number(item.rating?.score) || 0,
    rank: Number(item.rating?.rank) || 0,
    summary: pickSummary(item),
    image: pickImage(item),
    sites: JSON.stringify(item.sites || {}),
    week: JSON.stringify(inferWeek(item)),
  };
}

function sqlEscape(s) {
  // SQL 字符串字面量转义
  return String(s).replace(/'/g, "''");
}

function rowToInsert(r) {
  return `INSERT OR REPLACE INTO bangumi_index
    (id, title, title_cn, title_ja, aliases, type, begin, end, score, rank, summary, image, sites, week, source_hash, updated_at)
    VALUES (${r.id}, '${sqlEscape(r.title)}', '${sqlEscape(r.title_cn)}', '${sqlEscape(r.title_ja)}',
      '${sqlEscape(r.aliases)}', ${r.type}, '${sqlEscape(r.begin)}', '${sqlEscape(r.end)}',
      ${r.score}, ${r.rank}, '${sqlEscape(r.summary)}', '${sqlEscape(r.image)}',
      '${sqlEscape(r.sites)}', '${sqlEscape(r.week)}', 'manual-import', datetime('now'));`;
}

async function main() {
  console.log('=== ANISpace bangumi-data 全量导入 ===');
  console.log('源:', SOURCE_URL);
  console.log('模式:', MODE === 'single' ? '单大 SQL 文件（推荐）' : '分批导入');

  // 1. 拉取
  console.log('[1/3] 拉取 latest.json ...');
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    throw new Error(`拉取失败: HTTP ${res.status}`);
  }
  const items = await res.json();
  console.log(`  共 ${items.length} 条`);

  // 2. 归一化
  console.log('[2/3] 归一化 ...');
  mkdirSync(TMP, { recursive: true });
  const rows = items.map(normalize).filter(r => r.id > 0);
  console.log(`  有效条目: ${rows.length}`);

  // 3. 生成 SQL
  if (MODE === 'single') {
    // 单大文件模式
    console.log('[3/3] 生成单大 SQL 文件 ...');
    const sqlPath = join(TMP, 'full-import.sql');
    const sql = [
      'BEGIN TRANSACTION;',
      ...rows.map(rowToInsert),
      'COMMIT;',
    ].join('\n');
    writeFileSync(sqlPath, sql, 'utf8');
    const sizeMB = (sql.length / 1024 / 1024).toFixed(2);
    console.log(`  文件大小: ${sizeMB} MB`);
    console.log(`  文件路径: ${sqlPath}`);

    // 直接导入
    console.log('\n执行导入命令:');
    console.log(`npx wrangler d1 execute ${DB_NAME} --remote --file "${sqlPath}"`);
    console.log('\n预计耗时: 2-5 分钟');
    console.log('\n导入完成后可删除临时文件:');
    console.log(`rm -rf "${TMP}"`);
  } else {
    // 分批模式
    console.log('[3/3] 分批生成 SQL + 导入 ...');
    const files = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const sql = [
        'BEGIN TRANSACTION;',
        ...slice.map(rowToInsert),
        'COMMIT;',
      ].join('\n');
      const path = join(TMP, `batch-${String(Math.floor(i / BATCH)).padStart(4, '0')}.sql`);
      writeFileSync(path, sql, 'utf8');
      files.push(path);
    }
    console.log(`  生成 ${files.length} 个分片（每片 ${BATCH} 条）`);

    // 顺序导入
    let ok = 0;
    for (const f of files) {
      try {
        execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file "${f}"`, {
          cwd: ROOT,
          stdio: 'pipe',
        });
        ok += BATCH;
        const pct = Math.min(100, Math.round(ok / rows.length * 100));
        process.stdout.write(`\r  进度: ${pct}% (${Math.min(ok, rows.length)}/${rows.length})`);
      } catch (e) {
        console.error(`\n  [!] 失败: ${f}`);
        console.error(e.message);
        throw e;
      }
    }
    console.log('\n=== 导入完成 ===');
    console.log('总条数:', rows.length);
    console.log('SQL 分片保留在:', TMP);
    console.log('可手动清理: rm -rf', TMP);
  }
}

main().catch(err => {
  console.error('导入失败:', err);
  process.exit(1);
});
