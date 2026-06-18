import { StorageService } from '../../services/api';

const MEMORY_KEY = 'acg_navi_memory';
const SUMMARY_KEY = 'acg_navi_summary';
const MAX_MEMORIES = 100;
const SUMMARY_THRESHOLD = 50; // 对话超过此数触发压缩
const SUMMARY_KEEP = 30; // 压缩前 30 条

/**
 * 长期记忆存储
 * 格式：[{ key, value, timestamp, accessCount }]
 */
export const memoryStore = {
  _load() {
    return StorageService.get(MEMORY_KEY, []);
  },
  _save(data) {
    StorageService.set(MEMORY_KEY, data);
  },

  /** 保存一条记忆 */
  save(key, value) {
    const data = this._load();
    // 如果 key 已存在，更新值和时间戳
    const existing = data.find(m => m.key === key);
    if (existing) {
      existing.value = value;
      existing.timestamp = new Date().toISOString();
      existing.accessCount = (existing.accessCount || 0) + 1;
    } else {
      data.push({ key, value, timestamp: new Date().toISOString(), accessCount: 1 });
    }
    // LRU 淘汰：超过上限时移除 accessCount 最低且最旧的
    if (data.length > MAX_MEMORIES) {
      data.sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0) || new Date(b.timestamp) - new Date(a.timestamp));
      data.length = MAX_MEMORIES;
    }
    this._save(data);
  },

  /** 模糊搜索记忆 */
  search(query) {
    const data = this._load();
    const q = (query || '').toLowerCase();
    if (!q) return data.slice(0, 20);
    const results = data.filter(m =>
      m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
    );
    // 更新 accessCount
    results.forEach(m => m.accessCount = (m.accessCount || 0) + 1);
    this._save(data);
    return results.slice(0, 10);
  },

  /** 获取前 N 条记忆（供 system prompt 注入） */
  getTop(n = 20) {
    const data = this._load();
    // 按 accessCount 降序，取前 N 条
    return [...data]
      .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0))
      .slice(0, n);
  },

  /** 清空所有记忆 */
  clear() {
    StorageService.remove(MEMORY_KEY);
  },
};

/**
 * 对话摘要管理
 */
export const summaryStore = {
  _load() {
    return StorageService.get(SUMMARY_KEY, null);
  },
  _save(data) {
    StorageService.set(SUMMARY_KEY, data);
  },

  /** 获取摘要 */
  get() {
    return this._load();
  },

  /** 保存摘要 */
  save(summary) {
    this._save({
      text: summary,
      timestamp: new Date().toISOString(),
      messageCount: 0, // 压缩时填充
    });
  },

  /** 检查是否需要压缩 */
  shouldCompress(messageCount) {
    return messageCount > SUMMARY_THRESHOLD;
  },

  /** 清空摘要 */
  clear() {
    StorageService.remove(SUMMARY_KEY);
  },
};

/**
 * 生成对话摘要（使用 LLM 压缩）
 * @param {Array} messages - 要压缩的消息列表
 * @param {object} llmConfig - LLM 配置
 * @param {function} streamLLM - LLM 调用函数
 * @returns {string} 摘要文本
 */
export async function compressMessages(messages, llmConfig, streamLLM) {
  if (!messages || messages.length === 0) return '';

  const conversation = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? '用户' : 'Navi'}: ${m.content}`)
    .join('\n');

  const prompt = `请将以下对话历史压缩为200字以内的摘要，保留关键信息（用户偏好、重要决定、讨论的作品等），去除寒暄和重复内容：\n\n${conversation}`;

  try {
    const summary = await streamLLM(
      llmConfig,
      '你是一个对话摘要助手，请简洁地总结对话内容。',
      [{ role: 'user', content: prompt }],
      {}
    );
    return (summary || '').slice(0, 500);
  } catch {
    // 压缩失败时，用简单拼接作为降级
    return messages
      .filter(m => m.role === 'user')
      .slice(-5)
      .map(m => m.content)
      .join('；');
  }
}

/**
 * 构建记忆注入文本（供 system prompt 使用）
 */
export function buildMemoryContext() {
  const parts = [];

  // 长期记忆
  const memories = memoryStore.getTop(20);
  if (memories.length > 0) {
    const memList = memories.map(m => `- ${m.key}: ${m.value}`).join('\n');
    parts.push(`【长期记忆】以下是关于用户的重要记忆，回答时可参考：\n${memList}`);
  }

  // 对话摘要
  const summary = summaryStore.get();
  if (summary?.text) {
    parts.push(`【对话摘要】以下是之前对话的摘要：\n${summary.text}`);
  }

  return parts.join('\n\n');
}
