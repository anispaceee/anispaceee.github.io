/**
 * 打包脚本：将 Worker 和所有 lib 模块合并为单文件
 * 用于手动部署到 Cloudflare Dashboard
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_DIR = path.join(__dirname, 'worker');
const LIB_DIR = path.join(WORKER_DIR, 'lib');
const OUTPUT_FILE = path.join(WORKER_DIR, 'oauth-proxy-bundled.js');

// 需要打包的 lib 模块
const LIB_MODULES = [
  'bangumi-sync.js',
  'bangumi-search.js',
  'news-scraper.js',
  'bangumi-enrich.js',
  'user-profile.js',
  'recommend-engine.js',
  'behavior-collector.js',
  'explore-engine.js',
  'creative-notes.js',
  'lr-ranker.js',
];

console.log('开始打包 Worker...');

// 读取 oauth-proxy.js
let mainContent = fs.readFileSync(path.join(WORKER_DIR, 'oauth-proxy.js'), 'utf8');

// 移除 import 语句
const importRegex = /import\s+\*?\s*as\s+\w+\s+from\s+'\.\/lib\/[\w-]+\.js';\n?/g;
mainContent = mainContent.replace(importRegex, '');

// 移除 creative-notes 的具名导入
const namedImportRegex = /import\s+\{[^}]+\}\s+from\s+'\.\/lib\/creative-notes\.js';\n?/g;
mainContent = mainContent.replace(namedImportRegex, '');

// 创建模块对象
const modules = {};

LIB_MODULES.forEach(filename => {
  const filePath = path.join(LIB_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`模块不存在: ${filename}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // 移除 export 语句，改为添加到模块对象
  content = content.replace(/export\s+async\s+function\s+(\w+)/g, 'async function $1');
  content = content.replace(/export\s+function\s+(\w+)/g, 'function $1');
  content = content.replace(/export\s+const\s+(\w+)/g, 'const $1');
  content = content.replace(/export\s+\{[^}]+\}/g, '');

  // 模块名（去掉 .js 后缀，转换为 camelCase）
  const moduleName = filename.replace('.js', '').replace(/-([a-z])/g, (m, c) => c.toUpperCase());

  modules[moduleName] = content;
});

/**
 * 从模块内容中提取导出的函数名
 */
function extractExports(content) {
  const exports = [];
  const asyncFuncRegex = /async\s+function\s+(\w+)/g;
  const funcRegex = /function\s+(\w+)/g;
  const constRegex = /const\s+(\w+)\s*=/g;

  let match;
  while ((match = asyncFuncRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }
  while ((match = funcRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }
  while ((match = constRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  return exports;
}

// 构建合并后的内容
let bundledContent = `/**
 * ANISpace Worker - 打包版本
 * 用于手动部署到 Cloudflare Dashboard
 *
 * 此文件包含所有依赖模块，无需单独上传 lib 目录
 */

// ═══════════════════════════════════════════════════════════
// 模块定义
// ═══════════════════════════════════════════════════════════
`;

Object.entries(modules).forEach(([name, content]) => {
  const exportedFunctions = extractExports(content);
  bundledContent += `
// ─── ${name} 模块 ────────────────────────────────────────
const ${name} = {};
(function(module) {
${content}

// 导出函数到模块对象
${exportedFunctions.map(fn => `module.${fn} = ${fn};`).join('\n')}
})(${name});
`;
});

bundledContent += `
// ═══════════════════════════════════════════════════════════
// 主 Worker 代码
// ═══════════════════════════════════════════════════════════

${mainContent}
`;

// 写入输出文件
fs.writeFileSync(OUTPUT_FILE, bundledContent);

console.log(`打包完成: ${OUTPUT_FILE}`);
console.log(`文件大小: ${(bundledContent.length / 1024).toFixed(2)} KB`);
console.log('\n使用方法:');
console.log('1. 打开 Cloudflare Dashboard → Workers & Pages → anispace-oauth-proxy');
console.log('2. 点击 "Quick Edit"');
console.log('3. 复制 oauth-proxy-bundled.js 的全部内容');
console.log('4. 粘贴到编辑器中');
console.log('5. 点击 "Save and Deploy"');