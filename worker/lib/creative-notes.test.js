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
