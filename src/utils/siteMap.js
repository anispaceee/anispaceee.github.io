/** 站内页名(含中文别名)→路由映射，供 Navi 助手与首页终端共用。已对照 src/App.jsx 核实。 */
export const PAGE_ROUTES = {
  home: '/', '主页': '/',
  forum: '/forum', '放課後': '/forum', '论坛': '/forum',
  news: '/news', '毒电波': '/news', '资讯': '/news',
  wiki: '/wiki', '禁书目录': '/wiki', '百科': '/wiki',
  musashi: '/musashi', '武藏': '/musashi',
  mail: '/mailbox', '邮箱': '/mailbox',
  friends: '/friends', '好友': '/friends', lemu: '/friends',
  world: '/world', '世界线': '/world',
  music: '/music', '音乐': '/music',
  me: '/profile', profile: '/profile', '我': '/profile',
};

/** 解析页名为路由，找不到返回 null。中文无大小写，toLowerCase 幂等。 */
export function resolveRoute(key) {
  if (!key) return null;
  return PAGE_ROUTES[String(key).toLowerCase()] || null;
}
