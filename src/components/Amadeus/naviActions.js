import { resolveRoute } from '../../utils/siteMap';
import { typeToKey, extractPreview } from '../../utils/subjectType';

/** 追加到 system prompt 的站内动作指令说明 */
export const DIRECTIVE_GUIDE = `【站内动作】当你需要帮用户跳转页面或推荐/搜索作品时，可在回复正文之后追加一个 \`\`\`navi 代码块，块内每行一个 JSON 指令（可多行）：
- 跳转页面：{"action":"goto","target":"news"}    // target 可选: home/forum/news/wiki/musashi/mail/friends/world/music/me
- 搜索条目：{"action":"search","query":"凉宫春日"}
- 推荐条目：{"action":"recommend","query":"科幻 时间旅行","count":4}    // count 可选，默认4，最多8
规则：正文用角色口吻自然表达；不要把作品 ID 或链接写进正文（交给系统检索）；不需要执行动作时就不要输出该代码块。`;

const NAVI_BLOCK_RE = /```navi\s*([\s\S]*?)```/i;

/** 从模型回复中解析站内动作，返回 { cleanText, actions } */
export function parseDirectives(rawText) {
  if (!rawText) return { cleanText: '', actions: [] };
  const match = rawText.match(NAVI_BLOCK_RE);
  if (!match) return { cleanText: rawText.trim(), actions: [] };
  const cleanText = rawText.replace(NAVI_BLOCK_RE, '').trim();
  const actions = [];
  for (const line of match[1].split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      if (obj && typeof obj.action === 'string') actions.push(obj);
    } catch { /* 忽略无法解析的指令行 */ }
  }
  return { cleanText, actions };
}

/** 把 goto 动作解析为 { route, label }，非法返回 null */
export function resolveGoto(action) {
  const route = resolveRoute(action.target);
  if (!route) return null;
  return { route, label: action.target };
}

/**
 * 执行 search / recommend 动作：调 BangumiService 取真实条目。
 * 返回 { items: [{ id, name, name_cn, type, image, to, state }] }
 * 失败由调用方 try/catch 处理。
 */
export async function runSearchAction(action, BangumiService) {
  const query = (action.query || '').trim();
  if (!query) return { items: [] };
  const count = Math.min(Math.max(Number(action.count) || 4, 1), 8);
  const data = await BangumiService.searchSubjects(query, 0, count, 0);
  const list = data?.list || [];
  return {
    items: list.slice(0, count).map(item => ({
      id: item.id,
      name: item.name || '',
      name_cn: item.name_cn || '',
      type: item.type,
      image: item.images?.common || item.images?.medium || item.images?.large || '',
      to: `/info/${typeToKey(item.type)}/${item.id}`,
      state: { preview: extractPreview(item) },
    })),
  };
}
