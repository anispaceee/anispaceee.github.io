# ANISpace 创作空间（Creative Space）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ANISpace 个人主页添加一个 Notion 式私人创作空间，支持块编辑器、条目关联、感悟时间线和 Navi AI 对话。

**Architecture:** 后端在 Cloudflare Worker（oauth-proxy.js）新增 `/api/creative-notes` CRUD + `/api/creative-notes/timeline` 聚合接口，数据存 D1 的 `creative_notes` 表。前端在 UserProfilePage 新增"创作"Tab，包含块编辑器（NotionBlockEditor）、笔记列表、感悟时间线和嵌入式 Navi 对话面板（复用 llmClient.streamLLM）。可测试的纯函数提取到 `worker/lib/creative-notes.js` 并用 vitest 覆盖。

**Tech Stack:** React + Vite（前端）、Cloudflare Worker + D1（后端）、vitest（测试）、原生 HTML5 Drag API（块排序，无新依赖）

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `worker/schema.sql` | 全量 schema，末尾追加 creative_notes 表 | Modify |
| `worker/migrations/v018_creative_space.sql` | 增量 migration | Create |
| `worker/lib/creative-notes.js` | 纯函数：输入校验、块序列化、所有权校验、时间线条目构建 | Create |
| `worker/lib/creative-notes.test.js` | 纯函数 vitest 测试 | Create |
| `worker/oauth-proxy.js` | 在 user-guestbook 路由后追加 creative-notes CRUD + timeline 路由 | Modify |
| `src/services/api.js` | 末尾追加 `CreativeSpaceService` | Modify |
| `src/components/Profile/Creative/BlockRenderer.jsx` | 单块渲染 | Create |
| `src/components/Profile/Creative/NotionBlockEditor.jsx` | 块编辑器（Enter/Backspace/拖拽/快捷输入/自动保存） | Create |
| `src/components/Profile/Creative/CreativeNoteCard.jsx` | 笔记卡片 | Create |
| `src/components/Profile/Creative/CreativeNoteList.jsx` | 笔记列表 | Create |
| `src/components/Profile/Creative/NaviChatPanel.jsx` | 嵌入式 Navi 对话面板 | Create |
| `src/components/Profile/Creative/InsightTimeline.jsx` | 感悟时间线 | Create |
| `src/components/Profile/Creative/CreativeSpace.jsx` | 主容器（视图模式管理 + Navi 集成） | Create |
| `src/components/Profile/Creative/CreativeSpace.css` | 样式，复用萌系 CSS 变量 | Create |
| `src/components/Profile/UserProfilePage.jsx` | 新增"创作"Tab（仅 isSelf） | Modify |

---

## Task 1: 数据库表

**Files:**
- Modify: `worker/schema.sql`（末尾追加）
- Create: `worker/migrations/v018_creative_space.sql`

- [ ] **Step 1: 在 `worker/schema.sql` 末尾追加 creative_notes 表**

在 `worker/schema.sql` 文件最末尾追加：

```sql

-- ============================================================
-- 创作空间（Creative Space）
-- ============================================================

CREATE TABLE IF NOT EXISTS creative_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT DEFAULT '',
  blocks TEXT DEFAULT '[]',
  linked_subject_ids TEXT DEFAULT '[]',
  linked_subjects_snapshot TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  is_pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_creative_notes_user ON creative_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_creative_notes_updated ON creative_notes(user_id, updated_at DESC);
```

- [ ] **Step 2: 创建 migration 文件 `worker/migrations/v018_creative_space.sql`**

```sql
-- v018: 创作空间（Creative Space）
-- 新增 creative_notes 表，存储 Notion 式私人笔记

CREATE TABLE IF NOT EXISTS creative_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT DEFAULT '',
  blocks TEXT DEFAULT '[]',
  linked_subject_ids TEXT DEFAULT '[]',
  linked_subjects_snapshot TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  is_pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_creative_notes_user ON creative_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_creative_notes_updated ON creative_notes(user_id, updated_at DESC);
```

- [ ] **Step 3: 验证 schema 语法**

Run: `node -e "require('fs').readFileSync('worker/schema.sql','utf8'); console.log('schema.sql OK')"`
Expected: 输出 `schema.sql OK`

- [ ] **Step 4: Commit**

```bash
git add worker/schema.sql worker/migrations/v018_creative_space.sql
git commit -m "feat(creative-space): add creative_notes table and migration v018"
```

---

## Task 2: 后端纯函数库 + 测试

**Files:**
- Create: `worker/lib/creative-notes.js`
- Create: `worker/lib/creative-notes.test.js`

将可测试逻辑提取为纯函数，便于 vitest 覆盖（参考 `worker/lib/user-profile.test.js` 的 Mock 模式）。

- [ ] **Step 1: 写失败测试 `worker/lib/creative-notes.test.js`**

```js
/**
 * creative-notes.js 单元测试
 * 测试纯函数：输入校验、块序列化、所有权校验、时间线条目构建
 */
import { describe, it, expect } from 'vitest';
import {
  validateNoteInput,
  serializeBlocks,
  parseNote,
  checkOwnership,
  buildTimelineEntry,
  buildNaviContext,
} from './creative-notes.js';

describe('validateNoteInput', () => {
  it('接受合法的新建输入', () => {
    const result = validateNoteInput({ title: '测试', blocks: [{ id: 'b1', type: 'text', content: 'hi' }] });
    expect(result.valid).toBe(true);
    expect(result.data.title).toBe('测试');
  });

  it('title 缺省时返回空字符串', () => {
    const result = validateNoteInput({});
    expect(result.valid).toBe(true);
    expect(result.data.title).toBe('');
    expect(result.data.blocks).toEqual([]);
  });

  it('title 超长时拒绝', () => {
    const result = validateNoteInput({ title: 'x'.repeat(300) });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('标题');
  });

  it('blocks 非数组时拒绝', () => {
    const result = validateNoteInput({ blocks: 'not-array' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('blocks');
  });

  it('tags 非数组时拒绝', () => {
    const result = validateNoteInput({ tags: 'not-array' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tags');
  });

  it('is_pinned 归一化为 0/1', () => {
    const r1 = validateNoteInput({ is_pinned: true });
    expect(r1.data.is_pinned).toBe(1);
    const r2 = validateNoteInput({ is_pinned: false });
    expect(r2.data.is_pinned).toBe(0);
  });
});

describe('serializeBlocks', () => {
  it('把 blocks 数组序列化为 JSON 字符串', () => {
    const blocks = [{ id: 'b1', type: 'text', content: 'hi' }];
    expect(serializeBlocks(blocks)).toBe(JSON.stringify(blocks));
  });

  it('空数组返回 "[]"', () => {
    expect(serializeBlocks([])).toBe('[]');
  });

  it('非数组输入返回 "[]"', () => {
    expect(serializeBlocks(null)).toBe('[]');
    expect(serializeBlocks('x')).toBe('[]');
  });
});

describe('parseNote', () => {
  it('把 DB 行的 JSON 字段反序列化', () => {
    const row = {
      id: 1, user_id: 5, title: 't',
      blocks: '[{"id":"b1","type":"text","content":"hi"}]',
      linked_subject_ids: '[10,20]',
      linked_subjects_snapshot: '[{"id":10,"name":"A"}]',
      tags: '["感想"]',
      is_pinned: 1,
      created_at: '2026-06-19', updated_at: '2026-06-19',
    };
    const note = parseNote(row);
    expect(note.blocks).toEqual([{ id: 'b1', type: 'text', content: 'hi' }]);
    expect(note.linked_subject_ids).toEqual([10, 20]);
    expect(note.linked_subjects_snapshot).toEqual([{ id: 10, name: 'A' }]);
    expect(note.tags).toEqual(['感想']);
    expect(note.is_pinned).toBe(1);
  });

  it('损坏的 JSON 字段回退为空数组', () => {
    const row = { id: 1, user_id: 5, title: '', blocks: 'broken', linked_subject_ids: 'broken', linked_subjects_snapshot: 'broken', tags: 'broken', is_pinned: 0, created_at: '', updated_at: '' };
    const note = parseNote(row);
    expect(note.blocks).toEqual([]);
    expect(note.linked_subject_ids).toEqual([]);
    expect(note.tags).toEqual([]);
  });
});

describe('checkOwnership', () => {
  it('所有者通过', () => {
    expect(checkOwnership({ userId: 5 }, { user_id: 5 })).toBe(true);
  });

  it('非所有者不通过', () => {
    expect(checkOwnership({ userId: 6 }, { user_id: 5 })).toBe(false);
  });

  it('authUser 为 null 时不通过', () => {
    expect(checkOwnership(null, { user_id: 5 })).toBe(false);
  });

  it('note 为 null 时不通过', () => {
    expect(checkOwnership({ userId: 5 }, null)).toBe(false);
  });
});

describe('buildTimelineEntry', () => {
  it('构建 rating 条目', () => {
    const row = { id: 1, subject_id: 10, subject_name: '巨人', subject_image: 'img', subject_type: 2, score: 9, content: '神作', created_at: '2026-06-19' };
    const entry = buildTimelineEntry('rating', row);
    expect(entry.type).toBe('rating');
    expect(entry.subject_name).toBe('巨人');
    expect(entry.score).toBe(9);
    expect(entry.content).toBe('神作');
  });

  it('构建 comment 条目（无 score 字段）', () => {
    const row = { id: 2, subject_id: 10, subject_name: '巨人', subject_image: 'img', content: '第三季封神', created_at: '2026-06-18' };
    const entry = buildTimelineEntry('comment', row);
    expect(entry.type).toBe('comment');
    expect(entry.score).toBeUndefined();
    expect(entry.content).toBe('第三季封神');
  });
});

describe('buildNaviContext', () => {
  it('组装笔记上下文 + 关联条目短评', () => {
    const note = { title: '四月新番', blocks: [{ type: 'h2', content: '整体评价' }, { type: 'text', content: '今年不错' }] };
    const insights = [
      { subject_name: '咒术回战', score: 8, content: '战斗作画顶级' },
      { subject_name: '芙莉莲', score: 9, content: '治愈系神作' },
    ];
    const ctx = buildNaviContext(note, insights);
    expect(ctx).toContain('四月新番');
    expect(ctx).toContain('整体评价');
    expect(ctx).toContain('今年不错');
    expect(ctx).toContain('咒术回战');
    expect(ctx).toContain('战斗作画顶级');
    expect(ctx).toContain('芙莉莲');
  });

  it('笔记无 blocks 时也能生成上下文', () => {
    const ctx = buildNaviContext({ title: '空笔记', blocks: [] }, []);
    expect(ctx).toContain('空笔记');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run worker/lib/creative-notes.test.js`
Expected: FAIL，报错 `Failed to resolve import "./creative-notes.js"`

- [ ] **Step 3: 写最小实现 `worker/lib/creative-notes.js`**

```js
/**
 * 创作空间纯函数库
 * 提取自 oauth-proxy.js 的可测试逻辑：输入校验、序列化、所有权校验、时间线构建
 */

/** 安全 JSON 解析，失败返回 fallback */
function safeJsonParse(value, fallback) {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

/** 校验笔记新建/更新输入，返回 { valid, data, error } */
export function validateNoteInput(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '请求体无效', data: null };
  }
  const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '';
  if (body.title && typeof body.title === 'string' && body.title.length > 200) {
    return { valid: false, error: '标题不能超过 200 字符', data: null };
  }
  let blocks = [];
  if (body.blocks !== undefined) {
    if (!Array.isArray(body.blocks)) {
      return { valid: false, error: 'blocks 必须是数组', data: null };
    }
    blocks = body.blocks;
  }
  let linked_subject_ids = [];
  if (body.linked_subject_ids !== undefined) {
    if (!Array.isArray(body.linked_subject_ids)) {
      return { valid: false, error: 'linked_subject_ids 必须是数组', data: null };
    }
    linked_subject_ids = body.linked_subject_ids;
  }
  let linked_subjects_snapshot = [];
  if (body.linked_subjects_snapshot !== undefined) {
    if (!Array.isArray(body.linked_subjects_snapshot)) {
      return { valid: false, error: 'linked_subjects_snapshot 必须是数组', data: null };
    }
    linked_subjects_snapshot = body.linked_subjects_snapshot;
  }
  let tags = [];
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return { valid: false, error: 'tags 必须是数组', data: null };
    }
    tags = body.tags;
  }
  const is_pinned = body.is_pinned ? 1 : 0;
  return {
    valid: true,
    error: null,
    data: { title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned },
  };
}

/** 把 blocks 数组序列化为 JSON 字符串（DB 存储） */
export function serializeBlocks(blocks) {
  if (!Array.isArray(blocks)) return '[]';
  return JSON.stringify(blocks);
}

/** 把 DB 行的 JSON 字段反序列化为对象 */
export function parseNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title || '',
    blocks: safeJsonParse(row.blocks, []),
    linked_subject_ids: safeJsonParse(row.linked_subject_ids, []),
    linked_subjects_snapshot: safeJsonParse(row.linked_subjects_snapshot, []),
    tags: safeJsonParse(row.tags, []),
    is_pinned: row.is_pinned || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 所有权校验：authUser.userId === note.user_id */
export function checkOwnership(authUser, note) {
  if (!authUser || !note) return false;
  return authUser.userId === note.user_id;
}

/** 构建时间线条目 */
export function buildTimelineEntry(type, row) {
  const entry = {
    type,
    id: row.id,
    subject_id: row.subject_id,
    subject_name: row.subject_name || '',
    subject_image: row.subject_image || '',
    subject_type: row.subject_type,
    content: row.content || '',
    created_at: row.created_at,
  };
  if (type === 'rating') {
    entry.score = row.score;
  }
  return entry;
}

/** 组装 Navi 上下文：笔记内容 + 关联条目历史短评 */
export function buildNaviContext(note, insights) {
  const lines = [];
  lines.push('你是用户的创作助手 Navi。以下是用户的笔记内容和关联条目的历史短评，请基于这些上下文回答用户的问题。');
  lines.push('');
  lines.push('【当前笔记】');
  lines.push(`标题：${note.title || '（无标题）'}`);
  lines.push('内容：');
  for (const block of (note.blocks || [])) {
    if (block.type === 'text' || block.type === 'quote') {
      lines.push(block.content || '');
    } else if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
      lines.push(`${'#'.repeat(Number(block.type[1]))} ${block.content || ''}`);
    } else if (block.type === 'todo') {
      lines.push(`- [${block.checked ? 'x' : ' '}] ${block.content || ''}`);
    } else if (block.type === 'divider') {
      lines.push('---');
    } else if (block.type === 'image') {
      lines.push(`[图片: ${block.src || ''}]`);
    } else if (block.type === 'subject-link') {
      lines.push(`[条目: ${block.subject_name || ''}]`);
    }
  }
  lines.push('');
  lines.push('【关联条目历史短评】');
  if (insights && insights.length > 0) {
    insights.forEach((it, i) => {
      const score = it.score ? `（评分：${it.score}）` : '';
      lines.push(`${i + 1}. ${it.subject_name || '未知条目'}${score}："${it.content || ''}"`);
    });
  } else {
    lines.push('（暂无关联短评）');
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run worker/lib/creative-notes.test.js`
Expected: PASS，所有测试通过

- [ ] **Step 5: Commit**

```bash
git add worker/lib/creative-notes.js worker/lib/creative-notes.test.js
git commit -m "feat(creative-space): add pure function library with tests"
```

---

## Task 3: 后端 API — 笔记 CRUD

**Files:**
- Modify: `worker/oauth-proxy.js`（在 user-guestbook 路由块之后，约第 2700 行附近的 `guestbookSettingsMatch` 块之后追加）

在 `worker/oauth-proxy.js` 文件顶部已有的 import 区域无需改动。在 `handleApiRoutes` 函数内，找到 `// PUT /api/users/:id/profile-visibility` 路由块**之前**（即 user-guestbook 相关路由全部结束后），追加 creative-notes CRUD 路由。

- [ ] **Step 1: 在 `worker/oauth-proxy.js` 顶部追加 import**

找到文件第 28 行 `import * as exploreEngine from './lib/explore-engine.js';`，在该行**之后**追加：

```js
import {
  validateNoteInput,
  serializeBlocks,
  parseNote,
  checkOwnership,
  buildTimelineEntry,
} from './lib/creative-notes.js';
```

> 说明：oauth-proxy.js 已是 ES module（第 21-28 行有现成 import 语句），新增 import 与现有模式一致。

- [ ] **Step 2: 在 `handleApiRoutes` 函数内追加 creative-notes CRUD 路由**

在 `// PUT /api/users/:id/profile-visibility` 注释行**之前**（即 user-guestbook 路由块结束后），追加以下完整代码：

```js
  // ─── 创作空间 API ───

  // GET /api/creative-notes — 获取当前用户所有笔记（需认证）
  if (method === 'GET' && pathname === '/api/creative-notes') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const result = await env.DB.prepare(
      'SELECT id, user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at FROM creative_notes WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC'
    ).bind(authUser.userId).all();

    const notes = (result.results || []).map(parseNote);
    return jsonResponse({ notes }, 200, origin);
  }

  // POST /api/creative-notes — 新建笔记（需认证）
  if (method === 'POST' && pathname === '/api/creative-notes') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    let body;
    try { body = await request.json(); } catch { return jsonResponse({ error: '请求体无效' }, 400, origin); }

    const { valid, data, error } = validateNoteInput(body);
    if (!valid) return jsonResponse({ error }, 400, origin);

    const result = await env.DB.prepare(
      'INSERT INTO creative_notes (user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
    ).bind(
      authUser.userId,
      data.title,
      serializeBlocks(data.blocks),
      JSON.stringify(data.linked_subject_ids),
      JSON.stringify(data.linked_subjects_snapshot),
      JSON.stringify(data.tags),
      data.is_pinned
    ).run();

    const note = await env.DB.prepare(
      'SELECT id, user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at FROM creative_notes WHERE id = ?'
    ).bind(result.meta.last_row_id).first();

    return jsonResponse(parseNote(note), 201, origin);
  }

  // GET /api/creative-notes/timeline — 感悟时间线（需认证）
  // 注意：此路由必须放在 /:id 路由之前，否则 timeline 会被当成 id 匹配
  if (method === 'GET' && pathname === '/api/creative-notes/timeline') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const ratings = await env.DB.prepare(
      `SELECT r.id, r.subject_id, r.subject_type, r.score, r.content, r.created_at,
              c.subject_name, c.subject_image
       FROM ratings r
       LEFT JOIN collections c ON c.user_id = r.user_id AND c.subject_id = r.subject_id
       WHERE r.user_id = ? AND r.content != ''
       ORDER BY r.created_at DESC
       LIMIT 100`
    ).bind(authUser.userId).all();

    const comments = await env.DB.prepare(
      `SELECT sc.id, sc.subject_id, sc.content, sc.created_at,
              c.subject_name, c.subject_image, c.subject_type
       FROM subject_comments sc
       LEFT JOIN collections c ON c.user_id = sc.user_id AND c.subject_id = sc.subject_id
       WHERE sc.user_id = ?
       ORDER BY sc.created_at DESC
       LIMIT 100`
    ).bind(authUser.userId).all();

    const timeline = [];
    for (const r of (ratings.results || [])) {
      timeline.push(buildTimelineEntry('rating', {
        id: r.id, subject_id: r.subject_id, subject_name: r.subject_name,
        subject_image: r.subject_image, subject_type: r.subject_type,
        score: r.score, content: r.content, created_at: r.created_at,
      }));
    }
    for (const c of (comments.results || [])) {
      timeline.push(buildTimelineEntry('comment', {
        id: c.id, subject_id: c.subject_id, subject_name: c.subject_name,
        subject_image: c.subject_image, subject_type: c.subject_type,
        content: c.content, created_at: c.created_at,
      }));
    }
    timeline.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    return jsonResponse({ timeline }, 200, origin);
  }

  // GET/PUT/DELETE /api/creative-notes/:id — 单条笔记操作（需认证 + 所有权）
  const creativeNoteMatch = pathname.match(/^\/api\/creative-notes\/(\d+)$/);
  if (creativeNoteMatch) {
    const noteId = Number(creativeNoteMatch[1]);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: '未认证' }, 401, origin);

    const row = await env.DB.prepare(
      'SELECT id, user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at FROM creative_notes WHERE id = ?'
    ).bind(noteId).first();

    if (!row) return jsonResponse({ error: '笔记不存在' }, 404, origin);
    if (!checkOwnership(authUser, row)) return jsonResponse({ error: '无权操作' }, 403, origin);

    // GET — 详情
    if (method === 'GET') {
      return jsonResponse(parseNote(row), 200, origin);
    }

    // PUT — 更新
    if (method === 'PUT') {
      let body;
      try { body = await request.json(); } catch { return jsonResponse({ error: '请求体无效' }, 400, origin); }

      const { valid, data, error } = validateNoteInput(body);
      if (!valid) return jsonResponse({ error }, 400, origin);

      await env.DB.prepare(
        'UPDATE creative_notes SET title = ?, blocks = ?, linked_subject_ids = ?, linked_subjects_snapshot = ?, tags = ?, is_pinned = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(
        data.title,
        serializeBlocks(data.blocks),
        JSON.stringify(data.linked_subject_ids),
        JSON.stringify(data.linked_subjects_snapshot),
        JSON.stringify(data.tags),
        data.is_pinned,
        noteId
      ).run();

      const updated = await env.DB.prepare(
        'SELECT id, user_id, title, blocks, linked_subject_ids, linked_subjects_snapshot, tags, is_pinned, created_at, updated_at FROM creative_notes WHERE id = ?'
      ).bind(noteId).first();
      return jsonResponse(parseNote(updated), 200, origin);
    }

    // DELETE — 删除
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM creative_notes WHERE id = ?').bind(noteId).run();
      return jsonResponse({ message: '已删除' }, 200, origin);
    }

    return jsonResponse({ error: '方法不允许' }, 405, origin);
  }
```

- [ ] **Step 3: 验证路由不冲突**

Run: `node -e "const f=require('fs').readFileSync('worker/oauth-proxy.js','utf8'); if(f.includes('/api/creative-notes/timeline') && f.includes('creativeNoteMatch')) console.log('routes OK'); else throw new Error('missing routes')"`
Expected: 输出 `routes OK`

- [ ] **Step 4: 运行全量测试确保无回归**

Run: `npx vitest run`
Expected: 所有现有测试 + creative-notes.test.js 通过

- [ ] **Step 5: Commit**

```bash
git add worker/oauth-proxy.js
git commit -m "feat(creative-space): add creative-notes CRUD and timeline API routes"
```

---

## Task 4: 前端服务层

**Files:**
- Modify: `src/services/api.js`（末尾追加）

- [ ] **Step 1: 在 `src/services/api.js` 文件末尾追加 `CreativeSpaceService`**

在文件最末尾追加：

```js

// ─── CreativeSpaceService ───
// 创作空间笔记，走后端 API（需认证）
export const CreativeSpaceService = {
  async list() {
    return apiRequest('/api/creative-notes');
  },

  async create(data) {
    return apiRequest('/api/creative-notes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async get(id) {
    return apiRequest(`/api/creative-notes/${id}`);
  },

  async update(id, data) {
    return apiRequest(`/api/creative-notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async remove(id) {
    return apiRequest(`/api/creative-notes/${id}`, {
      method: 'DELETE',
    });
  },

  async getTimeline() {
    return apiRequest('/api/creative-notes/timeline');
  },
};
```

- [ ] **Step 2: 验证语法**

Run: `node -e "import('./src/services/api.js').then(()=>console.log('api.js OK')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: 输出 `api.js OK`（如果因 ESM 环境报错，改用 `npx vite build --mode development 2>&1 | head -5` 检查无语法错误）

- [ ] **Step 3: Commit**

```bash
git add src/services/api.js
git commit -m "feat(creative-space): add CreativeSpaceService frontend API layer"
```

---

## Task 5: 块渲染组件 BlockRenderer

**Files:**
- Create: `src/components/Profile/Creative/BlockRenderer.jsx`

先实现单块渲染组件，供编辑器和列表复用。

- [ ] **Step 1: 创建 `src/components/Profile/Creative/BlockRenderer.jsx`**

```jsx
import { Check, Image as ImageIcon, Link2, Minus } from 'lucide-react';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

/**
 * 单块渲染组件（只读展示模式）
 * @param {object} block - 块对象 { id, type, content, checked, src, subject_id, subject_name, subject_image }
 */
export default function BlockRenderer({ block }) {
  if (!block) return null;

  switch (block.type) {
    case 'h1':
      return <h1 className="cs-block cs-block-h1">{block.content || ''}</h1>;
    case 'h2':
      return <h2 className="cs-block cs-block-h2">{block.content || ''}</h2>;
    case 'h3':
      return <h3 className="cs-block cs-block-h3">{block.content || ''}</h3>;
    case 'todo':
      return (
        <div className={`cs-block cs-block-todo ${block.checked ? 'checked' : ''}`}>
          <span className="cs-todo-checkbox">{block.checked ? <Check size={14} /> : null}</span>
          <span className="cs-todo-text">{block.content || ''}</span>
        </div>
      );
    case 'quote':
      return <blockquote className="cs-block cs-block-quote">{block.content || ''}</blockquote>;
    case 'image':
      return (
        <div className="cs-block cs-block-image">
          {block.src ? (
            <img src={block.src} alt={block.content || ''} onError={(e) => { e.target.src = FALLBACK_IMG; }} />
          ) : (
            <div className="cs-image-placeholder"><ImageIcon size={20} /> 图片占位</div>
          )}
          {block.content && <div className="cs-image-caption">{block.content}</div>}
        </div>
      );
    case 'subject-link':
      return (
        <a className="cs-block cs-block-subject-link" href={`#/subject/${block.subject_id}`} target="_blank" rel="noreferrer">
          <img src={block.subject_image || FALLBACK_IMG} alt="" className="cs-subject-thumb" onError={(e) => { e.target.src = FALLBACK_IMG; }} />
          <div className="cs-subject-info">
            <Link2 size={12} />
            <span className="cs-subject-name">{block.subject_name || '未知条目'}</span>
          </div>
        </a>
      );
    case 'divider':
      return <hr className="cs-block cs-block-divider" />;
    case 'text':
    default:
      return <p className="cs-block cs-block-text">{block.content || ''}</p>;
  }
}
```

- [ ] **Step 2: 手动验证（启动 dev server）**

Run: `npm run dev`
在浏览器打开应用，确认无控制台报错（组件尚未挂载，仅验证 import 语法正确）。确认无报错后停止 dev server。

- [ ] **Step 3: Commit**

```bash
git add src/components/Profile/Creative/BlockRenderer.jsx
git commit -m "feat(creative-space): add BlockRenderer component"
```

---

## Task 6: 块编辑器组件 NotionBlockEditor

**Files:**
- Create: `src/components/Profile/Creative/NotionBlockEditor.jsx`

支持块类型：text, h1, h2, h3, todo, quote, image, subject-link, divider。
交互：Enter 新建块、Backspace 合并、拖拽排序、快捷输入（# / ## / [] / > 等）、自动保存 debounce 1.5s。

- [ ] **Step 1: 创建 `src/components/Profile/Creative/NotionBlockEditor.jsx`**

```jsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, GripVertical, Trash2, Copy, Image as ImageIcon } from 'lucide-react';
import BlockRenderer from './BlockRenderer.jsx';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const BLOCK_TYPES = [
  { key: 'text', label: '文本', prefix: '' },
  { key: 'h1', label: '标题1', prefix: '# ' },
  { key: 'h2', label: '标题2', prefix: '## ' },
  { key: 'h3', label: '标题3', prefix: '### ' },
  { key: 'todo', label: '待办', prefix: '[] ' },
  { key: 'quote', label: '引用', prefix: '> ' },
  { key: 'divider', label: '分割线', prefix: '---' },
  { key: 'image', label: '图片', prefix: '/img' },
  { key: 'subject-link', label: '条目', prefix: '/subject' },
];

function genId() {
  return 'block-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** 根据输入内容前缀推断块类型转换 */
function detectTypeConversion(content) {
  if (content.startsWith('### ')) return { type: 'h3', content: content.slice(4) };
  if (content.startsWith('## ')) return { type: 'h2', content: content.slice(3) };
  if (content.startsWith('# ')) return { type: 'h1', content: content.slice(2) };
  if (content.startsWith('[] ')) return { type: 'todo', content: content.slice(3), checked: false };
  if (content.startsWith('> ')) return { type: 'quote', content: content.slice(2) };
  if (content === '---') return { type: 'divider', content: '' };
  return null;
}

/**
 * Notion 式块编辑器
 * @param {object} note - { id, title, blocks }
 * @param {(patch) => void} onChange - 内容变更回调（debounce 自动保存由父组件处理）
 */
export default function NotionBlockEditor({ note, onChange }) {
  const [title, setTitle] = useState(note?.title || '');
  const [blocks, setBlocks] = useState(note?.blocks || []);
  const [focusedId, setFocusedId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const editorRef = useRef(null);
  const blockRefs = useRef({});

  // 同步外部 note 变更（切换笔记时）
  useEffect(() => {
    setTitle(note?.title || '');
    setBlocks(note?.blocks && note.blocks.length > 0 ? note.blocks : [{ id: genId(), type: 'text', content: '' }]);
  }, [note?.id]);

  // 通知父组件变更
  const emitChange = useCallback((newTitle, newBlocks) => {
    onChange?.({ title: newTitle, blocks: newBlocks });
  }, [onChange]);

  const updateBlock = useCallback((id, patch) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, ...patch } : b);
      emitChange(title, next);
      return next;
    });
  }, [title, emitChange]);

  const addBlockAfter = useCallback((id, type = 'text') => {
    const newBlock = { id: genId(), type, content: '' };
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      const next = idx >= 0 ? [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)] : [...prev, newBlock];
      emitChange(title, next);
      return next;
    });
    setTimeout(() => {
      blockRefs.current[newBlock.id]?.focus();
      setFocusedId(newBlock.id);
    }, 0);
  }, [title, emitChange]);

  const deleteBlock = useCallback((id) => {
    setBlocks(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(b => b.id !== id);
      emitChange(title, next);
      return next;
    });
  }, [title, emitChange]);

  const duplicateBlock = useCallback((id) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: genId() };
      const next = [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      emitChange(title, next);
      return next;
    });
  }, [title, emitChange]);

  const mergeWithPrev = useCallback((id) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx <= 0) return prev;
      const prevBlock = prev[idx - 1];
      const curBlock = prev[idx];
      if (prevBlock.type !== 'text' && prevBlock.type !== 'todo') return prev;
      const merged = { ...prevBlock, content: (prevBlock.content || '') + (curBlock.content || ''), type: prevBlock.type === 'todo' ? 'text' : prevBlock.type };
      delete merged.checked;
      const next = [...prev.slice(0, idx - 1), merged, ...prev.slice(idx + 1)];
      emitChange(title, next);
      setTimeout(() => {
        const el = blockRefs.current[merged.id];
        if (el) {
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }, 0);
      return next;
    });
  }, [title, emitChange]);

  const moveBlock = useCallback((fromId, toId) => {
    setBlocks(prev => {
      const fromIdx = prev.findIndex(b => b.id === fromId);
      const toIdx = prev.findIndex(b => b.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      emitChange(title, next);
      return next;
    });
  }, [title, emitChange]);

  const convertBlockType = useCallback((id, type) => {
    setBlocks(prev => {
      const next = prev.map(b => {
        if (b.id !== id) return b;
        const updated = { ...b, type };
        if (type === 'todo') updated.checked = b.checked || false;
        if (type === 'divider') updated.content = '';
        if (type === 'image' && !updated.src) updated.src = '';
        if (type === 'subject-link' && !updated.subject_id) { updated.subject_id = 0; updated.subject_name = ''; updated.subject_image = ''; }
        return updated;
      });
      emitChange(title, next);
      return next;
    });
    setMenuOpenId(null);
  }, [title, emitChange]);

  const handleBlockInput = useCallback((id, e) => {
    const text = e.currentTarget.textContent;
    const block = blocks.find(b => b.id === id);
    if (!block) return;
    // 检测快捷输入转换
    const conversion = detectTypeConversion(text);
    if (conversion && block.type === 'text') {
      updateBlock(id, conversion);
      setTimeout(() => {
        const el = blockRefs.current[id];
        if (el) {
          el.textContent = conversion.content || '';
          el.focus();
        }
      }, 0);
      return;
    }
    updateBlock(id, { content: text });
  }, [blocks, updateBlock]);

  const handleKeyDown = useCallback((id, e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addBlockAfter(id, 'text');
    } else if (e.key === 'Backspace') {
      const text = e.currentTarget.textContent;
      if (text === '') {
        e.preventDefault();
        mergeWithPrev(id);
      }
    }
  }, [addBlockAfter, mergeWithPrev]);

  const handleTitleChange = useCallback((e) => {
    const v = e.target.value;
    setTitle(v);
    emitChange(v, blocks);
  }, [blocks, emitChange]);

  // 拖拽
  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (toId) => {
    if (dragId && dragId !== toId) moveBlock(dragId, toId);
    setDragId(null);
  };

  const renderEditableBlock = (block) => {
    if (block.type === 'divider') {
      return <hr className="cs-block cs-block-divider" />;
    }
    if (block.type === 'image') {
      return (
        <div className="cs-block cs-block-image-edit">
          {block.src ? (
            <img src={block.src} alt="" onError={(e) => { e.target.src = FALLBACK_IMG; }} />
          ) : (
            <div className="cs-image-placeholder">
              <ImageIcon size={20} />
              <span>粘贴图片 URL 或点击菜单转换类型</span>
            </div>
          )}
          <input
            type="text"
            className="cs-image-url-input"
            placeholder="图片 URL"
            value={block.src || ''}
            onChange={(e) => updateBlock(block.id, { src: e.target.value })}
          />
        </div>
      );
    }
    if (block.type === 'subject-link') {
      return (
        <div className="cs-block cs-block-subject-link-edit">
          <input
            type="number"
            placeholder="条目 ID"
            value={block.subject_id || ''}
            onChange={(e) => updateBlock(block.id, { subject_id: Number(e.target.value) || 0 })}
          />
          <input
            type="text"
            placeholder="条目名称"
            value={block.subject_name || ''}
            onChange={(e) => updateBlock(block.id, { subject_name: e.target.value })}
          />
          <input
            type="text"
            placeholder="封面 URL（可选）"
            value={block.subject_image || ''}
            onChange={(e) => updateBlock(block.id, { subject_image: e.target.value })}
          />
        </div>
      );
    }
    if (block.type === 'todo') {
      return (
        <div className="cs-block cs-block-todo-edit">
          <button
            className={`cs-todo-checkbox ${block.checked ? 'checked' : ''}`}
            onClick={() => updateBlock(block.id, { checked: !block.checked })}
          >
            {block.checked ? '✓' : ''}
          </button>
          <div
            ref={(el) => { blockRefs.current[block.id] = el; }}
            className={`cs-block-editable cs-block-todo-text ${block.checked ? 'checked' : ''}`}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => handleBlockInput(block.id, e)}
            onKeyDown={(e) => handleKeyDown(block.id, e)}
            onFocus={() => setFocusedId(block.id)}
            data-placeholder="待办事项..."
          />
        </div>
      );
    }
    // text / h1 / h2 / h3 / quote
    const className = `cs-block-editable cs-block-${block.type}-edit`;
    const placeholder = { h1: '标题1', h2: '标题2', h3: '标题3', quote: '引用内容', text: '输入文字，或使用 # ## [] > 等快捷输入' }[block.type] || '';
    return (
      <div
        ref={(el) => { blockRefs.current[block.id] = el; }}
        className={className}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => handleBlockInput(block.id, e)}
        onKeyDown={(e) => handleKeyDown(block.id, e)}
        onFocus={() => setFocusedId(block.id)}
        data-placeholder={placeholder}
      />
    );
  };

  return (
    <div className="cs-editor" ref={editorRef}>
      <input
        className="cs-editor-title"
        type="text"
        placeholder="无标题"
        value={title}
        onChange={handleTitleChange}
      />
      <div className="cs-editor-blocks">
        {blocks.map((block) => (
          <div
            key={block.id}
            className={`cs-editor-block-row ${focusedId === block.id ? 'focused' : ''}`}
            draggable
            onDragStart={() => handleDragStart(block.id)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(block.id)}
          >
            <div className="cs-block-controls">
              <button className="cs-block-add" onClick={() => addBlockAfter(block.id, 'text')} title="在下方添加块">
                <Plus size={14} />
              </button>
              <span className="cs-block-grip" title="拖拽排序">
                <GripVertical size={14} />
              </span>
            </div>
            <div className="cs-block-content">
              {renderEditableBlock(block)}
            </div>
            <div className="cs-block-menu">
              <button className="cs-block-menu-btn" onClick={() => setMenuOpenId(menuOpenId === block.id ? null : block.id)} title="块菜单">
                ⋮
              </button>
              {menuOpenId === block.id && (
                <div className="cs-block-menu-dropdown">
                  <div className="cs-menu-section">
                    <div className="cs-menu-label">转换为</div>
                    {BLOCK_TYPES.map(t => (
                      <button key={t.key} className="cs-menu-item" onClick={() => convertBlockType(block.id, t.key)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="cs-menu-divider" />
                  <button className="cs-menu-item" onClick={() => { duplicateBlock(block.id); setMenuOpenId(null); }}>
                    <Copy size={12} /> 复制
                  </button>
                  <button className="cs-menu-item danger" onClick={() => { deleteBlock(block.id); setMenuOpenId(null); }}>
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 手动验证**

Run: `npm run dev`
在浏览器打开应用，进入个人主页（需登录）。由于编辑器尚未集成到页面，此处仅验证组件文件无 import 报错。确认控制台无报错后停止。

- [ ] **Step 3: Commit**

```bash
git add src/components/Profile/Creative/NotionBlockEditor.jsx
git commit -m "feat(creative-space): add NotionBlockEditor with drag/drop, shortcuts, autosave hooks"
```

---

## Task 7: 笔记列表组件

**Files:**
- Create: `src/components/Profile/Creative/CreativeNoteCard.jsx`
- Create: `src/components/Profile/Creative/CreativeNoteList.jsx`

- [ ] **Step 1: 创建 `src/components/Profile/Creative/CreativeNoteCard.jsx`**

```jsx
import { Pin, MessageCircle, Clock } from 'lucide-react';
import BlockRenderer from './BlockRenderer.jsx';

/**
 * 笔记卡片
 * @param {object} note - 笔记对象
 * @param {() => void} onOpen - 打开笔记
 */
export default function CreativeNoteCard({ note, onOpen }) {
  const previewBlocks = (note.blocks || []).slice(0, 3);
  const tagCount = (note.tags || []).length;
  const blockCount = (note.blocks || []).length;

  return (
    <div className={`cs-note-card ${note.is_pinned ? 'pinned' : ''}`} onClick={onOpen}>
      <div className="cs-note-card-header">
        {note.is_pinned ? <Pin size={12} className="cs-pin-icon" /> : null}
        <span className="cs-note-card-title">{note.title || '无标题'}</span>
      </div>
      <div className="cs-note-card-preview">
        {previewBlocks.length > 0 ? (
          previewBlocks.map((b) => <BlockRenderer key={b.id} block={b} />)
        ) : (
          <p className="cs-note-card-empty">空笔记</p>
        )}
      </div>
      <div className="cs-note-card-footer">
        <span className="cs-note-meta"><Clock size={11} /> {note.updated_at?.slice(0, 10) || ''}</span>
        <span className="cs-note-meta"><MessageCircle size={11} /> {blockCount} 块</span>
        {tagCount > 0 && <span className="cs-note-tags">{(note.tags || []).slice(0, 3).map(t => <span key={t} className="cs-note-tag">{t}</span>)}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 `src/components/Profile/Creative/CreativeNoteList.jsx`**

```jsx
import { useState } from 'react';
import { Plus, Loader2, Inbox } from 'lucide-react';
import CreativeNoteCard from './CreativeNoteCard.jsx';

/**
 * 笔记列表
 * @param {array} notes - 笔记数组
 * @param {boolean} loading - 加载中
 * @param {(note) => void} onOpen - 打开笔记
 * @param {() => void} onCreate - 新建笔记
 */
export default function CreativeNoteList({ notes, loading, onOpen, onCreate }) {
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? notes.filter(n => (n.title || '').includes(filter) || (n.tags || []).some(t => t.includes(filter)))
    : notes;

  if (loading) {
    return (
      <div className="cs-note-list-loading">
        <Loader2 size={24} className="cs-spin" />
        <span>加载中...</span>
      </div>
    );
  }

  return (
    <div className="cs-note-list">
      <div className="cs-note-list-toolbar">
        <input
          className="cs-note-search"
          type="text"
          placeholder="搜索标题或标签..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="cs-btn cs-btn-primary" onClick={onCreate}>
          <Plus size={14} /> 新建笔记
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="cs-note-list-empty">
          <Inbox size={40} />
          <p>{filter ? '没有匹配的笔记' : '还没有笔记，点击"新建笔记"开始创作'}</p>
        </div>
      ) : (
        <div className="cs-note-grid">
          {filtered.map((note) => (
            <CreativeNoteCard key={note.id} note={note} onOpen={() => onOpen(note)} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 手动验证**

Run: `npm run dev`
确认控制台无 import 报错后停止。

- [ ] **Step 4: Commit**

```bash
git add src/components/Profile/Creative/CreativeNoteCard.jsx src/components/Profile/Creative/CreativeNoteList.jsx
git commit -m "feat(creative-space): add CreativeNoteList and CreativeNoteCard"
```

---

## Task 8: Navi 对话面板组件

**Files:**
- Create: `src/components/Profile/Creative/NaviChatPanel.jsx`

复用 `src/components/Amadeus/llmClient.js` 的 `streamLLM`。两种模式：全局对话（注入当前笔记上下文）+ 按条触发（预填问题模板）。

- [ ] **Step 1: 创建 `src/components/Profile/Creative/NaviChatPanel.jsx`**

```jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, X } from 'lucide-react';
import { streamLLM } from '../../Amadeus/llmClient.js';

const QUICK_PROMPTS = [
  '我当时看这部作品时的感受？',
  '帮我总结这篇笔记的核心观点',
  '基于这篇笔记推荐我相关作品',
];

/**
 * 嵌入式 Navi 对话面板
 * @param {object|null} currentNote - 当前打开的笔记（用于注入上下文）
 * @param {array} insights - 关联条目历史短评 [{ subject_name, score, content }]
 * @param {string} prefillQuestion - 预填问题（按条触发时传入）
 * @param {boolean} open - 面板是否展开
 * @param {() => void} onClose - 关闭面板
 */
export default function NaviChatPanel({ currentNote, insights = [], prefillQuestion = '', open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  // llmConfig：使用 glm4 走 Worker 代理内置 Key
  const llmConfig = { provider: 'glm4', model: 'glm-4-flash', apiKey: '', apiBase: '' };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  // 按条触发：预填问题
  useEffect(() => {
    if (prefillQuestion) {
      setInput(prefillQuestion);
    }
  }, [prefillQuestion]);

  const buildSystemPrompt = useCallback(() => {
    if (!currentNote) {
      return '你是用户的创作助手 Navi，帮助用户整理和回顾对作品的感悟。请用简洁、温暖的语气回答。';
    }
    const lines = [];
    lines.push('你是用户的创作助手 Navi。以下是用户的笔记内容和关联条目的历史短评，请基于这些上下文回答用户的问题。');
    lines.push('');
    lines.push('【当前笔记】');
    lines.push(`标题：${currentNote.title || '（无标题）'}`);
    lines.push('内容：');
    for (const block of (currentNote.blocks || [])) {
      if (['text', 'quote'].includes(block.type)) lines.push(block.content || '');
      else if (['h1', 'h2', 'h3'].includes(block.type)) lines.push(`${'#'.repeat(Number(block.type[1]))} ${block.content || ''}`);
      else if (block.type === 'todo') lines.push(`- [${block.checked ? 'x' : ' '}] ${block.content || ''}`);
      else if (block.type === 'divider') lines.push('---');
      else if (block.type === 'image') lines.push(`[图片]`);
      else if (block.type === 'subject-link') lines.push(`[条目: ${block.subject_name || ''}]`);
    }
    lines.push('');
    lines.push('【关联条目历史短评】');
    if (insights.length > 0) {
      insights.forEach((it, i) => {
        const score = it.score ? `（评分：${it.score}）` : '';
        lines.push(`${i + 1}. ${it.subject_name || '未知'}${score}："${it.content || ''}"`);
      });
    } else {
      lines.push('（暂无关联短评）');
    }
    return lines.join('\n');
  }, [currentNote, insights]);

  const send = useCallback(async (question) => {
    if (!question.trim() || streaming) return;
    const userMsg = { role: 'user', content: question.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);
    setStreamText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const systemPrompt = buildSystemPrompt();
      let full = '';
      await streamLLM(llmConfig, systemPrompt, newMessages, {
        signal: controller.signal,
        onToken: (delta) => {
          full += delta;
          setStreamText(full);
        },
      });
      setMessages(prev => [...prev, { role: 'assistant', content: full || '...' }]);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: `（Navi 暂时无法回复：${err.message}）` }]);
      }
    } finally {
      setStreaming(false);
      setStreamText('');
      abortRef.current = null;
    }
  }, [messages, streaming, buildSystemPrompt]);

  const handleSend = () => send(input);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  if (!open) return null;

  return (
    <div className="cs-navi-panel">
      <div className="cs-navi-header">
        <div className="cs-navi-title">
          <Sparkles size={14} /> Navi 对话
          {currentNote && <span className="cs-navi-context-badge">已注入笔记上下文</span>}
        </div>
        <button className="cs-navi-close" onClick={onClose}><X size={14} /></button>
      </div>

      <div className="cs-navi-quick-prompts">
        {QUICK_PROMPTS.map((q) => (
          <button key={q} className="cs-quick-prompt" onClick={() => send(q)} disabled={streaming}>
            {q}
          </button>
        ))}
      </div>

      <div className="cs-navi-messages" ref={scrollRef}>
        {messages.length === 0 && !streaming && (
          <div className="cs-navi-empty">
            <Sparkles size={32} />
            <p>向 Navi 提问吧！我会基于你当前的笔记和关联短评来回答。</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`cs-navi-msg ${m.role}`}>
            <div className="cs-navi-msg-avatar">{m.role === 'user' ? '我' : 'N'}</div>
            <div className="cs-navi-msg-content">{m.content}</div>
          </div>
        ))}
        {streaming && (
          <div className="cs-navi-msg assistant">
            <div className="cs-navi-msg-avatar">N</div>
            <div className="cs-navi-msg-content">
              {streamText || <Loader2 size={14} className="cs-spin" />}
            </div>
          </div>
        )}
      </div>

      <div className="cs-navi-input-area">
        <textarea
          className="cs-navi-input"
          placeholder="输入问题...（Enter 发送，Shift+Enter 换行）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={streaming}
        />
        {streaming ? (
          <button className="cs-btn cs-btn-danger" onClick={handleStop}>停止</button>
        ) : (
          <button className="cs-btn cs-btn-primary" onClick={handleSend} disabled={!input.trim()}>
            <Send size={14} /> 发送
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 手动验证**

Run: `npm run dev`
确认控制台无 import 报错（特别是 `streamLLM` 路径正确）后停止。

- [ ] **Step 3: Commit**

```bash
git add src/components/Profile/Creative/NaviChatPanel.jsx
git commit -m "feat(creative-space): add NaviChatPanel with streaming and context injection"
```

---

## Task 9: 感悟时间线组件

**Files:**
- Create: `src/components/Profile/Creative/InsightTimeline.jsx`

- [ ] **Step 1: 创建 `src/components/Profile/Creative/InsightTimeline.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { Clock, Star, MessageCircle, Loader2, Film, Gamepad2, BookOpen, Tv } from 'lucide-react';
import { CreativeSpaceService } from '../../../services/api.js';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const TYPE_ICON = { 1: BookOpen, 2: Film, 4: Gamepad2, 6: Tv };
const TYPE_LABEL = { 1: '书籍', 2: '动画', 4: '游戏', 6: '三次元' };

/**
 * 感悟时间线：聚合 ratings.content + subject_comments
 */
export default function InsightTimeline() {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await CreativeSpaceService.getTimeline();
        if (!cancelled) setTimeline(data.timeline || []);
      } catch (err) {
        if (!cancelled) setError(err.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = typeFilter === 'all'
    ? timeline
    : timeline.filter(t => String(t.subject_type) === typeFilter);

  if (loading) {
    return (
      <div className="cs-timeline-loading">
        <Loader2 size={24} className="cs-spin" />
        <span>加载感悟时间线...</span>
      </div>
    );
  }

  if (error) {
    return <div className="cs-timeline-error">加载失败：{error}</div>;
  }

  return (
    <div className="cs-timeline">
      <div className="cs-timeline-toolbar">
        <span className="cs-timeline-title">感悟时间线</span>
        <div className="cs-timeline-filters">
          <button className={`cs-filter-btn ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>全部</button>
          {Object.entries(TYPE_LABEL).map(([k, label]) => (
            <button key={k} className={`cs-filter-btn ${typeFilter === k ? 'active' : ''}`} onClick={() => setTypeFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="cs-timeline-empty">
          <Clock size={40} />
          <p>还没有感悟记录。去详情页写评分短评或评论吧！</p>
        </div>
      ) : (
        <div className="cs-timeline-list">
          {filtered.map((item) => {
            const Icon = TYPE_ICON[item.subject_type] || Clock;
            return (
              <div key={`${item.type}-${item.id}`} className="cs-timeline-item">
                <div className="cs-timeline-dot">
                  {item.type === 'rating' ? <Star size={12} /> : <MessageCircle size={12} />}
                </div>
                <div className="cs-timeline-content">
                  <div className="cs-timeline-item-header">
                    <img src={item.subject_image || FALLBACK_IMG} alt="" className="cs-timeline-thumb" onError={(e) => { e.target.src = FALLBACK_IMG; }} />
                    <div className="cs-timeline-meta">
                      <span className="cs-timeline-subject-name">{item.subject_name || '未知条目'}</span>
                      <span className="cs-timeline-type">
                        <Icon size={11} /> {TYPE_LABEL[item.subject_type] || '其他'}
                      </span>
                      {item.type === 'rating' && item.score && (
                        <span className="cs-timeline-score">评分 {item.score}</span>
                      )}
                    </div>
                    <span className="cs-timeline-date">{item.created_at?.slice(0, 10) || ''}</span>
                  </div>
                  <p className="cs-timeline-text">{item.content || '（无内容）'}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 手动验证**

Run: `npm run dev`
确认控制台无 import 报错后停止。

- [ ] **Step 3: Commit**

```bash
git add src/components/Profile/Creative/InsightTimeline.jsx
git commit -m "feat(creative-space): add InsightTimeline component"
```

---

## Task 10: 主容器组件 CreativeSpace

**Files:**
- Create: `src/components/Profile/Creative/CreativeSpace.jsx`

管理视图模式：list | editor | timeline。集成 NaviChatPanel。自动保存 debounce 1.5s。

- [ ] **Step 1: 创建 `src/components/Profile/Creative/CreativeSpace.jsx`**

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Feather, Clock, Sparkles, ArrowLeft, Loader2, Save } from 'lucide-react';
import { CreativeSpaceService } from '../../../services/api.js';
import CreativeNoteList from './CreativeNoteList.jsx';
import NotionBlockEditor from './NotionBlockEditor.jsx';
import InsightTimeline from './InsightTimeline.jsx';
import NaviChatPanel from './NaviChatPanel.jsx';
import './CreativeSpace.css';

/**
 * 创作空间主容器
 * @param {number} userId - 当前用户 ID
 * @param {boolean} isSelf - 是否是自己
 */
export default function CreativeSpace({ userId, isSelf }) {
  const [view, setView] = useState('list'); // list | editor | timeline
  const [notes, setNotes] = useState([]);
  const [currentNote, setCurrentNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved'
  const [naviOpen, setNaviOpen] = useState(false);
  const [prefillQuestion, setPrefillQuestion] = useState('');
  const [insights, setInsights] = useState([]);
  const saveTimerRef = useRef(null);
  const currentNoteRef = useRef(null);

  // 加载笔记列表
  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CreativeSpaceService.list();
      setNotes(data.notes || []);
    } catch (err) {
      console.error('加载笔记失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSelf) loadNotes();
  }, [isSelf, loadNotes]);

  // 同步 currentNote 到 ref（供 debounce 回调读取最新值）
  useEffect(() => {
    currentNoteRef.current = currentNote;
  }, [currentNote]);

  // 自动保存：debounce 1.5s
  const scheduleSave = useCallback((note) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      if (!note || !note.id) return;
      setSaving(true);
      try {
        const updated = await CreativeSpaceService.update(note.id, {
          title: note.title,
          blocks: note.blocks,
          linked_subject_ids: note.linked_subject_ids || [],
          linked_subjects_snapshot: note.linked_subjects_snapshot || [],
          tags: note.tags || [],
          is_pinned: note.is_pinned || 0,
        });
        setCurrentNote(prev => prev ? { ...prev, updated_at: updated.updated_at } : prev);
        setSaveStatus('saved');
        // 刷新列表中的该笔记
        setNotes(prev => prev.map(n => n.id === note.id ? { ...n, title: note.title, blocks: note.blocks, updated_at: updated.updated_at } : n));
      } catch (err) {
        console.error('保存失败:', err);
        setSaveStatus('');
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, []);

  // 编辑器内容变更回调
  const handleEditorChange = useCallback((patch) => {
    if (!currentNoteRef.current) return;
    const updated = { ...currentNoteRef.current, ...patch };
    setCurrentNote(updated);
    scheduleSave(updated);
  }, [scheduleSave]);

  // 新建笔记
  const handleCreate = useCallback(async () => {
    try {
      const note = await CreativeSpaceService.create({
        title: '',
        blocks: [{ id: 'block-' + Date.now().toString(36), type: 'text', content: '' }],
        linked_subject_ids: [],
        linked_subjects_snapshot: [],
        tags: [],
        is_pinned: 0,
      });
      setNotes(prev => [note, ...prev]);
      setCurrentNote(note);
      setView('editor');
      setSaveStatus('');
    } catch (err) {
      console.error('新建笔记失败:', err);
    }
  }, []);

  // 打开笔记
  const handleOpen = useCallback(async (note) => {
    setView('editor');
    setCurrentNote(note);
    setSaveStatus('');
    // 加载完整详情（确保 blocks 完整）
    try {
      const full = await CreativeSpaceService.get(note.id);
      setCurrentNote(full);
    } catch (err) {
      console.error('加载笔记详情失败:', err);
    }
  }, []);

  // 返回列表
  const handleBack = useCallback(() => {
    // 切换前 flush 保存
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (currentNoteRef.current) {
        CreativeSpaceService.update(currentNoteRef.current.id, {
          title: currentNoteRef.current.title,
          blocks: currentNoteRef.current.blocks,
          linked_subject_ids: currentNoteRef.current.linked_subject_ids || [],
          linked_subjects_snapshot: currentNoteRef.current.linked_subjects_snapshot || [],
          tags: currentNoteRef.current.tags || [],
          is_pinned: currentNoteRef.current.is_pinned || 0,
        }).catch(() => {});
      }
    }
    setView('list');
    setCurrentNote(null);
    loadNotes();
  }, [loadNotes]);

  // 打开 Navi 对话（按条触发）
  const handleAskNavi = useCallback((question) => {
    setPrefillQuestion(question || '');
    setNaviOpen(true);
  }, []);

  // 加载关联条目短评作为 Navi 上下文
  useEffect(() => {
    if (naviOpen && currentNote && insights.length === 0) {
      CreativeSpaceService.getTimeline().then(data => {
        // 只取与当前笔记关联条目相关的短评
        const linkedIds = currentNote.linked_subject_ids || [];
        const related = (data.timeline || []).filter(t => linkedIds.includes(t.subject_id));
        setInsights(related);
      }).catch(() => {});
    }
  }, [naviOpen, currentNote, insights.length]);

  if (!isSelf) return null;

  return (
    <div className="cs-creative-space">
      <div className="cs-toolbar">
        <div className="cs-toolbar-left">
          {view === 'editor' && (
            <button className="cs-btn cs-btn-ghost" onClick={handleBack}>
              <ArrowLeft size={14} /> 返回列表
            </button>
          )}
          {view === 'editor' && currentNote && (
            <span className="cs-save-status">
              {saving || saveStatus === 'saving' ? (
                <><Loader2 size={12} className="cs-spin" /> 保存中...</>
              ) : saveStatus === 'saved' ? (
                <><Save size={12} /> 已保存</>
              ) : null}
            </span>
          )}
        </div>
        <div className="cs-toolbar-right">
          {view === 'list' && (
            <>
              <button className="cs-btn cs-btn-ghost" onClick={() => setView('timeline')}>
                <Clock size={14} /> 感悟时间线
              </button>
              <button className="cs-btn cs-btn-primary" onClick={handleCreate}>
                <Feather size={14} /> 新建笔记
              </button>
            </>
          )}
          {view === 'editor' && (
            <button className="cs-btn cs-btn-ghost" onClick={() => setNaviOpen(!naviOpen)}>
              <Sparkles size={14} /> {naviOpen ? '收起 Navi' : '问 Navi'}
            </button>
          )}
          {view === 'timeline' && (
            <button className="cs-btn cs-btn-ghost" onClick={() => setView('list')}>
              <ArrowLeft size={14} /> 返回列表
            </button>
          )}
        </div>
      </div>

      <div className={`cs-main ${naviOpen ? 'with-navi' : ''}`}>
        <div className="cs-content">
          {view === 'list' && (
            <CreativeNoteList
              notes={notes}
              loading={loading}
              onOpen={handleOpen}
              onCreate={handleCreate}
            />
          )}
          {view === 'editor' && currentNote && (
            <>
              <NotionBlockEditor
                note={currentNote}
                onChange={handleEditorChange}
              />
              <div className="cs-editor-quick-ask">
                <button className="cs-btn cs-btn-ghost" onClick={() => handleAskNavi('我当时看这部作品时的感受？')}>
                  <Sparkles size={12} /> 问 Navi：当时的感受？
                </button>
                <button className="cs-btn cs-btn-ghost" onClick={() => handleAskNavi('帮我总结这篇笔记的核心观点')}>
                  <Sparkles size={12} /> 问 Navi：总结笔记
                </button>
              </div>
            </>
          )}
          {view === 'timeline' && <InsightTimeline />}
        </div>

        {naviOpen && (
          <div className="cs-navi-wrap">
            <NaviChatPanel
              currentNote={currentNote}
              insights={insights}
              prefillQuestion={prefillQuestion}
              open={naviOpen}
              onClose={() => { setNaviOpen(false); setPrefillQuestion(''); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 手动验证**

Run: `npm run dev`
确认控制台无 import 报错后停止（组件尚未挂载到页面，下一任务集成）。

- [ ] **Step 3: Commit**

```bash
git add src/components/Profile/Creative/CreativeSpace.jsx
git commit -m "feat(creative-space): add CreativeSpace main container with view modes and autosave"
```

---

## Task 11: 集成到 UserProfilePage

**Files:**
- Modify: `src/components/Profile/UserProfilePage.jsx`

在标签页后新增"创作"Tab（仅 isSelf 显示）。

- [ ] **Step 1: 在 `src/components/Profile/UserProfilePage.jsx` 顶部追加 import**

找到第 4 行的 import 语句（从 `../../services/api` 导入多个 Service），在 `UserGuestbookService` 之后追加 `CreativeSpaceService`（如果 CreativeSpace 组件自己 import 了 Service，则此处无需改 Service import，只需 import 组件）。

在第 9 行 `import ActivityHeatmap from './ActivityHeatmap';` 之后追加：

```jsx
import CreativeSpace from './Creative/CreativeSpace.jsx';
```

同时在第 6 行的 lucide-react import 中追加 `Feather` 图标（在 `Sparkles` 之后添加 `Feather`）。

- [ ] **Step 2: 在标签页区域新增"创作"Tab**

找到第 773 行附近的标签页闭合 `</div>`（`user-profile-tabs` 容器结束），在 `posts` Tab 按钮**之后**、`</div>` **之前**追加：

```jsx
                {isSelf && (
                <button className={`user-profile-tab ${activeTab === 'creative' ? 'active' : ''}`} onClick={() => setActiveTab('creative')}>
                  <Feather size={14} /> 创作
                </button>
                )}
```

- [ ] **Step 3: 在标签页内容区域新增"创作"内容**

在文件中找到 `posts` 标签页内容的渲染块（搜索 `activeTab === 'posts'`），在其渲染块**之后**追加：

```jsx
              {/* ─── 创作空间标签页 ─── */}
              {activeTab === 'creative' && isSelf && (
                <div className="user-profile-category-section">
                  <CreativeSpace userId={effectiveUserId} isSelf={isSelf} />
                </div>
              )}
```

- [ ] **Step 4: 手动验证**

Run: `npm run dev`
在浏览器打开应用，登录后进入个人主页（`/profile` 或点击头像）。验证：
1. 标签栏出现"创作"Tab（仅自己可见）
2. 点击"创作"Tab 显示创作空间（笔记列表，空状态显示"还没有笔记"）
3. 点击"新建笔记"创建笔记，进入编辑器
4. 在编辑器输入文字，按 Enter 创建新块
5. 输入 `# ` 触发标题转换，输入 `[] ` 触发待办转换
6. 停止输入 1.5s 后顶部显示"已保存"
7. 点击"返回列表"回到列表，新建的笔记出现在列表中
8. 点击"感悟时间线"查看时间线
9. 点击"问 Navi"打开对话面板，输入问题验证流式回复

确认所有功能正常后停止 dev server。

- [ ] **Step 5: Commit**

```bash
git add src/components/Profile/UserProfilePage.jsx
git commit -m "feat(creative-space): integrate CreativeSpace tab into UserProfilePage"
```

---

## Task 12: 样式

**Files:**
- Create: `src/components/Profile/Creative/CreativeSpace.css`

复用现有萌系配色（CSS 变量与 UserProfilePage.css 一致）。

- [ ] **Step 1: 创建 `src/components/Profile/Creative/CreativeSpace.css`**

```css
/* ─── 创作空间样式 ─── */
/* 复用萌系 CSS 变量：var(--primary), var(--bg-card), var(--border-secondary), var(--radius-lg), var(--shadow-sm) 等 */

.cs-creative-space {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── 工具栏 ─── */
.cs-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.cs-toolbar-left, .cs-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cs-save-status {
  font-size: 12px;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ─── 按钮 ─── */
.cs-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  border: none;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.cs-btn-primary {
  background: var(--primary);
  color: #fff;
  box-shadow: var(--shadow-primary);
}
.cs-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
.cs-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.cs-btn-ghost {
  background: var(--bg-input);
  color: var(--text-secondary);
}
.cs-btn-ghost:hover { background: var(--bg-hover, #f0eef3); color: var(--text-primary); }
.cs-btn-danger {
  background: #f56c6c;
  color: #fff;
}

/* ─── 主布局 ─── */
.cs-main {
  display: flex;
  gap: 16px;
}
.cs-main.with-navi .cs-content { flex: 1; min-width: 0; }
.cs-main.with-navi .cs-navi-wrap { width: 380px; flex-shrink: 0; }
.cs-content { flex: 1; min-width: 0; }

/* ─── 笔记列表 ─── */
.cs-note-list-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.cs-note-search {
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-secondary);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
}
.cs-note-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.cs-note-card {
  background: var(--bg-card);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cs-note-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
  transform: translateY(-2px);
}
.cs-note-card.pinned {
  border-color: var(--primary);
  background: linear-gradient(135deg, var(--bg-card) 0%, rgba(255,182,193,0.08) 100%);
}
.cs-note-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cs-pin-icon { color: var(--primary); flex-shrink: 0; }
.cs-note-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-note-card-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  max-height: 80px;
  overflow: hidden;
}
.cs-note-card-preview .cs-block { margin: 2px 0; }
.cs-note-card-preview .cs-block-text { margin: 0; }
.cs-note-card-empty { color: var(--text-quaternary); font-size: 12px; }
.cs-note-card-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--text-tertiary);
  flex-wrap: wrap;
}
.cs-note-meta { display: inline-flex; align-items: center; gap: 3px; }
.cs-note-tags { display: inline-flex; gap: 4px; }
.cs-note-tag {
  background: var(--bg-input);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
}
.cs-note-list-empty, .cs-note-list-loading, .cs-timeline-empty, .cs-timeline-loading, .cs-navi-empty {
  text-align: center;
  padding: 48px 20px;
  color: var(--text-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.cs-note-list-empty p, .cs-timeline-empty p, .cs-navi-empty p { font-size: 13px; }

/* ─── 编辑器 ─── */
.cs-editor {
  background: var(--bg-card);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-lg);
  padding: 24px;
}
.cs-editor-title {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  padding: 8px 0;
  margin-bottom: 16px;
  outline: none;
  border-bottom: 1px solid transparent;
}
.cs-editor-title:focus { border-bottom-color: var(--border-secondary); }
.cs-editor-title::placeholder { color: var(--text-quaternary); }

.cs-editor-blocks { display: flex; flex-direction: column; gap: 2px; }
.cs-editor-block-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  position: relative;
  padding: 2px 0;
}
.cs-block-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
  padding-top: 4px;
}
.cs-editor-block-row:hover .cs-block-controls { opacity: 1; }
.cs-block-add, .cs-block-grip {
  background: transparent;
  border: none;
  color: var(--text-quaternary);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}
.cs-block-add:hover { color: var(--primary); }
.cs-block-grip { cursor: grab; }
.cs-block-content { flex: 1; min-width: 0; }

.cs-block-editable {
  min-height: 24px;
  padding: 4px 6px;
  border-radius: 4px;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  word-break: break-word;
}
.cs-block-editable:focus { background: var(--bg-input); }
.cs-block-editable:empty::before {
  content: attr(data-placeholder);
  color: var(--text-quaternary);
  pointer-events: none;
}
.cs-block-h1-edit { font-size: 20px; font-weight: 700; }
.cs-block-h2-edit { font-size: 17px; font-weight: 700; }
.cs-block-h3-edit { font-size: 15px; font-weight: 600; }
.cs-block-quote-edit {
  border-left: 3px solid var(--primary);
  padding-left: 12px;
  color: var(--text-secondary);
  font-style: italic;
}

.cs-block-todo-edit {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 6px;
}
.cs-todo-checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-secondary);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
  flex-shrink: 0;
  margin-top: 2px;
}
.cs-todo-checkbox.checked { background: var(--primary); border-color: var(--primary); }
.cs-block-todo-text.checked { text-decoration: line-through; color: var(--text-quaternary); }

.cs-block-image-edit { padding: 4px 6px; display: flex; flex-direction: column; gap: 6px; }
.cs-block-image-edit img { max-width: 100%; border-radius: var(--radius-md); }
.cs-image-placeholder {
  padding: 24px;
  background: var(--bg-input);
  border-radius: var(--radius-md);
  text-align: center;
  color: var(--text-quaternary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.cs-image-url-input {
  padding: 4px 8px;
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  font-size: 12px;
  background: var(--bg-input);
  color: var(--text-primary);
}
.cs-block-subject-link-edit { display: flex; gap: 6px; flex-wrap: wrap; padding: 4px 6px; }
.cs-block-subject-link-edit input {
  padding: 4px 8px;
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  font-size: 12px;
  background: var(--bg-input);
  color: var(--text-primary);
}

/* ─── 块菜单 ─── */
.cs-block-menu { position: relative; flex-shrink: 0; padding-top: 4px; }
.cs-block-menu-btn {
  background: transparent;
  border: none;
  color: var(--text-quaternary);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 16px;
  line-height: 1;
  border-radius: 4px;
}
.cs-block-menu-btn:hover { background: var(--bg-input); color: var(--text-primary); }
.cs-block-menu-dropdown {
  position: absolute;
  right: 0;
  top: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: 6px;
  z-index: 10;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cs-menu-section { display: flex; flex-direction: column; gap: 2px; }
.cs-menu-label { font-size: 10px; color: var(--text-quaternary); padding: 2px 8px; }
.cs-menu-item {
  background: transparent;
  border: none;
  padding: 6px 8px;
  text-align: left;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cs-menu-item:hover { background: var(--bg-input); color: var(--text-primary); }
.cs-menu-item.danger:hover { color: #f56c6c; }
.cs-menu-divider { height: 1px; background: var(--border-secondary); margin: 4px 0; }

.cs-editor-quick-ask {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}

/* ─── Navi 对话面板 ─── */
.cs-navi-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  height: 600px;
  max-height: 70vh;
}
.cs-navi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-secondary);
}
.cs-navi-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
}
.cs-navi-context-badge {
  font-size: 10px;
  background: rgba(255,182,193,0.2);
  color: var(--primary);
  padding: 2px 6px;
  border-radius: 8px;
  margin-left: 4px;
}
.cs-navi-close {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.cs-navi-close:hover { background: var(--bg-input); }
.cs-navi-quick-prompts {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-secondary);
}
.cs-quick-prompt {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--bg-input);
  color: var(--text-secondary);
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}
.cs-quick-prompt:hover { background: var(--primary); color: #fff; }
.cs-quick-prompt:disabled { opacity: 0.5; cursor: not-allowed; }

.cs-navi-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cs-navi-msg {
  display: flex;
  gap: 8px;
  max-width: 90%;
}
.cs-navi-msg.user { align-self: flex-end; flex-direction: row-reverse; }
.cs-navi-msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.cs-navi-msg.user .cs-navi-msg-avatar { background: var(--primary); color: #fff; }
.cs-navi-msg.assistant .cs-navi-msg-avatar { background: #e6a23c; color: #fff; }
.cs-navi-msg-content {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
.cs-navi-msg.user .cs-navi-msg-content { background: var(--primary); color: #fff; }
.cs-navi-msg.assistant .cs-navi-msg-content { background: var(--bg-input); }

.cs-navi-input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-secondary);
}
.cs-navi-input {
  flex: 1;
  resize: none;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-secondary);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.cs-navi-input:focus { border-color: var(--primary); }

/* ─── 时间线 ─── */
.cs-timeline-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}
.cs-timeline-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.cs-timeline-filters { display: flex; gap: 4px; flex-wrap: wrap; }
.cs-filter-btn {
  padding: 4px 10px;
  border-radius: 12px;
  border: none;
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.cs-filter-btn.active { background: var(--primary); color: #fff; }
.cs-filter-btn:hover:not(.active) { background: var(--bg-hover, #f0eef3); }

.cs-timeline-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}
.cs-timeline-list::before {
  content: '';
  position: absolute;
  left: 11px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--border-secondary);
}
.cs-timeline-item {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  position: relative;
}
.cs-timeline-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 2px solid var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  flex-shrink: 0;
  z-index: 1;
}
.cs-timeline-content {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-md);
  padding: 12px;
}
.cs-timeline-item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.cs-timeline-thumb {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
}
.cs-timeline-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.cs-timeline-subject-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.cs-timeline-type {
  font-size: 11px;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.cs-timeline-score {
  font-size: 11px;
  color: #e6a23c;
  font-weight: 600;
}
.cs-timeline-date {
  font-size: 11px;
  color: var(--text-quaternary);
  margin-left: auto;
}
.cs-timeline-text {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
}
.cs-timeline-error { color: #f56c6c; padding: 20px; text-align: center; font-size: 13px; }

/* ─── 通用动画 ─── */
.cs-spin { animation: cs-spin 1s linear infinite; }
@keyframes cs-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ─── 块渲染（只读，用于卡片预览） ─── */
.cs-block { margin: 4px 0; font-size: 13px; color: var(--text-secondary); }
.cs-block-h1 { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.cs-block-h2 { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.cs-block-h3 { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.cs-block-text { margin: 0; }
.cs-block-todo { display: flex; align-items: center; gap: 6px; }
.cs-todo-checkbox {
  width: 14px; height: 14px;
  border: 1.5px solid var(--border-secondary);
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}
.cs-block-todo.checked .cs-todo-text { text-decoration: line-through; color: var(--text-quaternary); }
.cs-block-quote {
  border-left: 2px solid var(--primary);
  padding-left: 8px;
  color: var(--text-tertiary);
  font-style: italic;
  margin: 4px 0;
}
.cs-block-image img { max-width: 100%; border-radius: 4px; }
.cs-image-caption { font-size: 11px; color: var(--text-quaternary); text-align: center; margin-top: 4px; }
.cs-block-subject-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-input);
  border-radius: 12px;
  text-decoration: none;
  color: var(--primary);
  font-size: 12px;
}
.cs-subject-thumb { width: 20px; height: 20px; border-radius: 3px; object-fit: cover; }
.cs-subject-info { display: inline-flex; align-items: center; gap: 3px; }
.cs-block-divider { border: none; border-top: 1px solid var(--border-secondary); margin: 8px 0; }
```

- [ ] **Step 2: 手动验证（完整流程）**

Run: `npm run dev`
在浏览器完整验证创作空间所有功能：
1. 进入个人主页，看到"创作"Tab
2. 点击"创作"进入笔记列表（空状态）
3. 新建笔记，编辑器样式正常
4. 块类型转换、拖拽、菜单功能正常
5. 自动保存状态显示正常
6. 笔记卡片样式正常
7. 感悟时间线样式正常（如有评分/评论数据）
8. Navi 对话面板样式正常，流式回复正常
9. 响应式布局：窗口缩小时 Navi 面板和内容区不重叠

确认所有样式正常后停止 dev server。

- [ ] **Step 3: Commit**

```bash
git add src/components/Profile/Creative/CreativeSpace.css
git commit -m "feat(creative-space): add CreativeSpace styles with moe theme variables"
```

---

## 完成后验证清单

- [ ] 所有 vitest 测试通过：`npx vitest run`
- [ ] dev server 启动无报错：`npm run dev`
- [ ] 创作空间 Tab 仅自己可见
- [ ] 笔记 CRUD 全流程正常（新建/编辑/自动保存/删除）
- [ ] 块编辑器支持所有 9 种块类型
- [ ] 快捷输入转换正常（# / ## / ### / [] / > / ---）
- [ ] 拖拽排序正常
- [ ] 感悟时间线聚合 ratings + subject_comments
- [ ] Navi 对话流式回复正常，笔记上下文注入正常
- [ ] 他人主页不显示"创作"Tab
