import { typeToKey, extractPreview } from '../../utils/subjectType';
import { PAGE_ROUTES, resolveRoute } from '../../utils/siteMap';

export const COMMANDS = [
  {
    name: 'help', aliases: ['?'], description: '显示所有命令',
    run: () => COMMANDS.map(c => {
      const names = [c.name, ...(c.aliases || [])].join('|');
      return `  ${names.padEnd(14)} - ${c.description}`;
    }),
  },
  {
    name: 'clear', description: '清屏',
    run: (_args, ctx) => { ctx.clear(); },
  },
  {
    name: 'about', description: '关于 ANISpace',
    run: () => ['ANISpace — ACG Community Platform', 'Built with React + Cloudflare Workers'],
  },
  {
    name: 'date', description: '显示当前时间',
    run: () => new Date().toLocaleString('zh-CN'),
  },
  {
    name: 'echo', description: '回显文本',
    run: (args) => args.join(' '),
  },
  {
    name: 'goto', aliases: ['open'], description: '跳转页面 (goto <页名>)',
    run: (args, ctx) => {
      const key = args[0];
      if (!key) return { type: 'error', text: '用法: goto <页名>，如 goto news' };
      const route = resolveRoute(key);
      if (!route) {
        const pages = Object.keys(PAGE_ROUTES).join(' ');
        return { type: 'error', text: `未知页面: ${key}。可用: ${pages}` };
      }
      ctx.navigate(route);
      return `→ ${route}`;
    },
  },
  {
    name: 'search', description: '搜索资料库 (search <关键词>)',
    run: async (args, ctx) => {
      const kw = args.join(' ').trim();
      if (!kw) return { type: 'error', text: '用法: search <关键词>' };
      try {
        const data = await ctx.services.BangumiService.searchSubjects(kw, 0, 8, 0);
        const list = data?.list || [];
        if (list.length === 0) return '未找到相关结果';
        return list.map(item => ({
          type: 'link',
          text: `  ${item.name_cn || item.name}`,
          to: `/info/${typeToKey(item.type)}/${item.id}`,
          state: { preview: extractPreview(item) },
        }));
      } catch {
        return { type: 'error', text: '搜索失败，请稍后再试' };
      }
    },
  },
  {
    name: 'me', aliases: ['whoami'], description: '显示我的信息',
    run: async (_args, ctx) => {
      if (!ctx.currentUser) return { type: 'error', text: '未登录，点击右上角登录' };
      const u = ctx.currentUser;
      const lines = [`用户: ${u.name || u.username}`];
      try {
        const unread = await ctx.services.MailService.getUnreadCountAsync(u.id);
        const count = typeof unread === 'object' ? (unread.unread ?? unread.count ?? 0) : (unread || 0);
        lines.push(`未读邮件: ${count}`);
      } catch { /* 忽略未读数失败 */ }
      return lines;
    },
  },
  {
    name: 'say', description: '发一条世界线消息 (say <内容>)', requiresAuth: true,
    run: async (args, ctx) => {
      const text = args.join(' ').trim();
      if (!text) return { type: 'error', text: '用法: say <内容>' };
      try {
        // sendMessage(userId, content)：内容必须作第二个参数，第一参仅占位
        await ctx.services.WorldChannelService.sendMessage(ctx.currentUser.id, text);
        return `已发送到世界线: ${text}`;
      } catch {
        return { type: 'error', text: '发送失败，请稍后再试' };
      }
    },
  },
  { name: 'neko', description: '🐱', run: () => '🐱 Meow~' },
  { name: 'elpsy', description: 'El Psy Kongroo!', run: () => 'El Psy Kongroo! 世界线变动率 1.048596%' },
];

/** 把命令返回值归一化为 OutputLine[] */
function normalizeOutput(result) {
  if (result == null) return [];
  const arr = Array.isArray(result) ? result : [result];
  return arr.map(item => (typeof item === 'string' ? { type: 'output', text: item } : item));
}

/**
 * 解析并执行一条输入。
 * ctx: { navigate, currentUser, print, clear, services: { BangumiService, WorldChannelService, MailService } }
 * 返回 OutputLine[]，OutputLine 形如:
 *   { type: 'input'|'output'|'error', text }
 *   { type: 'link', text, to, state }
 */
export async function runCommand(rawInput, ctx) {
  const trimmed = rawInput.trim();
  if (!trimmed) return [];
  const [token, ...args] = trimmed.split(/\s+/);
  const lower = token.toLowerCase();
  const cmd = COMMANDS.find(c => c.name === lower || (c.aliases || []).includes(lower));
  if (!cmd) return [{ type: 'error', text: `command not found: ${token}` }];
  if (cmd.requiresAuth && !ctx.currentUser) {
    return [{ type: 'error', text: `${cmd.name} 需要登录` }];
  }
  try {
    return normalizeOutput(await cmd.run(args, ctx));
  } catch (err) {
    return [{ type: 'error', text: `${cmd.name}: ${err?.message || '执行出错'}` }];
  }
}
