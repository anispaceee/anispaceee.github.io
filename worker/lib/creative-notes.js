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
