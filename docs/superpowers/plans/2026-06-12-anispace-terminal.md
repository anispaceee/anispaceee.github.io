# ANISpace Terminal 完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把主页侧边栏装饰性 Terminal 升级为可用快捷工具——抽成独立组件 + 命令注册表，加入 goto/search/me/say 等站点联动命令并补齐终端交互体验。

**Architecture:** 命令逻辑放进纯数据的注册表 `terminalCommands.js`（副作用经 `ctx` 注入），UI 放进 `HomeTerminal.jsx`，二者通过 `runCommand(input, ctx)` 衔接。Wiki 的 `typeToKey`/`extractPreview` 抽到共享 util 供 search 命令复用。`HomePage.jsx` 仅渲染 `<HomeTerminal />`。

**Tech Stack:** React 19, react-router-dom, Vite。项目无测试框架——每个任务用 `npx vite build` 通过 + 必要时 `npm run dev` 手测作为验证。

**说明:** 本分支 `feat/terminal-enhance` 基于 `main`，不含 `fix/code-review-bugs` 的改动，互不影响。

---

## 文件结构

**新建:**
- `src/utils/subjectType.js` — 共享 `typeToKey(type)` 与 `extractPreview(item)`
- `src/components/Home/terminalCommands.js` — 命令注册表 `COMMANDS` + 调度 `runCommand`
- `src/components/Home/HomeTerminal.jsx` — 终端 UI 组件
- `src/components/Home/HomeTerminal.css` — 终端样式（从 HomePage.css 迁入）

**修改:**
- `src/components/Wiki/Wiki.jsx` — 改为 import 共享 util，删除本地 `typeToKey`/`extractPreview`
- `src/pages/HomePage.jsx` — 删除内联终端 state/handler/JSX，渲染 `<HomeTerminal />`
- `src/pages/HomePage.css` — 删除 `.home-terminal-*` 规则（已迁出）

---

## Task 1: 共享 subjectType util + Wiki 复用

**Files:**
- Create: `src/utils/subjectType.js`
- Modify: `src/components/Wiki/Wiki.jsx`（删除本地 `extractPreview` 第 41-50 行、`typeToKey` 第 53-56 行，改为 import）

- [ ] **Step 1: 创建共享 util**

`src/utils/subjectType.js`:

```js
/** 根据 Bangumi type 数值返回详情页路由 typeKey */
export function typeToKey(type) {
  return type === 1 ? 'novel' : type === 3 ? 'music' : type === 4 ? 'game' : type === 6 ? 'real' : 'anime';
}

/** 从搜索结果项提取基本信息，作为 navigate state 传给详情页 */
export function extractPreview(item) {
  return {
    id: item.id,
    name: item.name || '',
    name_cn: item.name_cn || '',
    type: item.type,
    image: item.images?.large || item.images?.common || item.image || '',
    images: item.images || {},
  };
}
```

- [ ] **Step 2: Wiki.jsx 改为复用**

在 `src/components/Wiki/Wiki.jsx` 顶部 import 区加入（紧跟现有 import 之后）:

```js
import { typeToKey, extractPreview } from '../../utils/subjectType';
```

然后删除文件内原本的本地定义（`/** 从搜索结果提取基本信息... */ function extractPreview(item){...}` 整段，以及 `/** 根据 type 数值返回路由 typeKey */ function typeToKey(type){...}` 整段）。其余调用处不变（同名函数现在来自 import）。

- [ ] **Step 3: 验证构建**

Run: `npx vite build`
Expected: 构建成功，无 "typeToKey is not defined" / 重复声明报错。

- [ ] **Step 4: Commit**

```bash
git add src/utils/subjectType.js src/components/Wiki/Wiki.jsx
git commit -m "refactor: 抽取共享 subjectType util 供 Wiki 与终端复用"
```

---

## Task 2: 命令注册表 terminalCommands.js

**Files:**
- Create: `src/components/Home/terminalCommands.js`

- [ ] **Step 1: 创建命令注册表与调度函数**

`src/components/Home/terminalCommands.js`:

```js
import { typeToKey, extractPreview } from '../../utils/subjectType';

// 页名（含别名）→ 路由，已对照 src/App.jsx 核实
const PAGE_ROUTES = {
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

export const COMMANDS = [
  {
    name: 'help', aliases: ['?'], description: '显示所有命令',
    run: () => COMMANDS.map(c => `  ${c.name.padEnd(8)} - ${c.description}`),
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
      const route = PAGE_ROUTES[key.toLowerCase()] || PAGE_ROUTES[key];
      if (!route) {
        const pages = [...new Set(Object.keys(PAGE_ROUTES))].filter(k => /^[a-z]+$/.test(k)).join(' ');
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
```

- [ ] **Step 2: 验证构建**

Run: `npx vite build`
Expected: 构建成功，无未解析 import（`typeToKey`/`extractPreview` 来自 Task 1 的 util）。

- [ ] **Step 3: Commit**

```bash
git add src/components/Home/terminalCommands.js
git commit -m "feat(terminal): 命令注册表与调度（goto/search/me/say 等）"
```

---

## Task 3: HomeTerminal 组件 + CSS

**Files:**
- Create: `src/components/Home/HomeTerminal.jsx`
- Create: `src/components/Home/HomeTerminal.css`

- [ ] **Step 1: 迁移终端 CSS**

把 `src/pages/HomePage.css` 第 192-302 行（从 `.home-terminal-window {` 到 `.home-terminal-input::placeholder { ... }`，共 18 个 `.home-terminal-*` 选择器块）**整段剪切**到新文件 `src/components/Home/HomeTerminal.css`。然后在该文件末尾追加可点击/错误行样式:

```css
.home-terminal-line.link {
  color: #6bb1ff;
  cursor: pointer;
}
.home-terminal-line.link:hover {
  text-decoration: underline;
}
.home-terminal-line.error .home-terminal-response {
  color: #ff7a7a;
}
```

（HomePage.css 中这些规则的删除在 Task 4 完成；本步只新建 HomeTerminal.css。若现在就从 HomePage.css 删除也可，但为减少一次构建里同时改两文件的混淆，统一在 Task 4 删。）

- [ ] **Step 2: 创建终端组件**

`src/components/Home/HomeTerminal.jsx`:

```jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { BangumiService, WorldChannelService, MailService } from '../../services/api';
import { runCommand } from './terminalCommands';
import './HomeTerminal.css';

export default function HomeTerminal() {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]); // OutputLine[]
  const [cmdHistory, setCmdHistory] = useState([]); // 仅成功输入的命令文本
  const [cursor, setCursor] = useState(-1); // -1 表示停在当前输入
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  // 输出增长时自动滚到底部
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [history]);

  const print = useCallback((lines) => {
    const arr = Array.isArray(lines) ? lines : [lines];
    setHistory(prev => [...prev, ...arr]);
  }, []);

  const clear = useCallback(() => setHistory([]), []);

  const submit = useCallback(async () => {
    const raw = input.trim();
    if (!raw) return;
    setHistory(prev => [...prev, { type: 'input', text: raw }]);
    setCmdHistory(prev => [...prev, raw]);
    setCursor(-1);
    setInput('');
    const ctx = {
      navigate, currentUser, print, clear,
      services: { BangumiService, WorldChannelService, MailService },
    };
    const out = await runCommand(raw, ctx);
    if (out.length) print(out);
  }, [input, navigate, currentUser, print, clear]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { submit(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const next = cursor === -1 ? cmdHistory.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setInput(cmdHistory[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cursor === -1) return;
      const next = cursor + 1;
      if (next >= cmdHistory.length) { setCursor(-1); setInput(''); }
      else { setCursor(next); setInput(cmdHistory[next]); }
    }
  };

  return (
    <div className="home-terminal-window" onClick={() => inputRef.current?.focus()}>
      <div className="home-terminal-titlebar">
        <div className="home-terminal-controls">
          <span className="home-terminal-ctrl close" />
          <span className="home-terminal-ctrl minimize" />
          <span className="home-terminal-ctrl maximize" />
        </div>
        <span className="home-terminal-title">Terminal — ANISpace</span>
      </div>
      <div className="home-terminal-body">
        <div className="home-terminal-output" ref={outputRef}>
          <div className="home-terminal-line">Welcome to ANISpace Terminal v1.0.0</div>
          <div className="home-terminal-line hint">Type 'help' for available commands.</div>
          {history.map((entry, i) => {
            if (entry.type === 'input') {
              return (
                <div key={i} className="home-terminal-line">
                  <span className="home-terminal-prompt">$ </span><span>{entry.text}</span>
                </div>
              );
            }
            if (entry.type === 'link') {
              return (
                <div
                  key={i}
                  className="home-terminal-line link"
                  onClick={(e) => { e.stopPropagation(); navigate(entry.to, { state: entry.state }); }}
                >
                  {entry.text}
                </div>
              );
            }
            return (
              <div key={i} className={`home-terminal-line ${entry.type === 'error' ? 'error' : ''}`}>
                <span className="home-terminal-response">{entry.text}</span>
              </div>
            );
          })}
        </div>
        <div className="home-terminal-input-line">
          <span className="home-terminal-prompt">$ </span>
          <input
            ref={inputRef}
            type="text"
            className="home-terminal-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 验证构建**

Run: `npx vite build`
Expected: 构建成功。（此时组件已存在但未挂载到主页，Task 4 才接线。）

- [ ] **Step 4: Commit**

```bash
git add src/components/Home/HomeTerminal.jsx src/components/Home/HomeTerminal.css
git commit -m "feat(terminal): HomeTerminal 组件（历史/自动滚动/点击聚焦/可点击结果）"
```

---

## Task 4: 接入 HomePage 并清理旧代码

**Files:**
- Modify: `src/pages/HomePage.jsx`（删除内联终端 state 第 158-159 行、`handleTerminalCommand` 第 215-245 行、JSX 第 482-519 行；新增 import 与 `<HomeTerminal />`）
- Modify: `src/pages/HomePage.css`（删除 Task 3 已迁出的 `.home-terminal-*` 规则，原第 192-302 行）

- [ ] **Step 1: HomePage.jsx 引入组件**

在 `src/pages/HomePage.jsx` 顶部 import 区加入（`UserAvatar` import 之后）:

```js
import HomeTerminal from '../components/Home/HomeTerminal';
```

- [ ] **Step 2: 删除内联终端 state**

删除这两行（约第 158-159 行）:

```js
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState([]);
```

- [ ] **Step 3: 删除 handleTerminalCommand**

删除整个 `const handleTerminalCommand = useCallback(() => { ... }, [terminalInput, terminalHistory]);` 块（约第 215-245 行，从 `const handleTerminalCommand` 到对应的 `}, [terminalInput, terminalHistory]);`）。

- [ ] **Step 4: 替换终端 JSX**

把 `{/* Terminal - Mac终端风格 */}` 注释及其下方整个 `<div className="home-terminal-window"> ... </div>`（约第 482-519 行）替换为:

```jsx
            {/* Terminal - Mac终端风格 */}
            <HomeTerminal />
```

- [ ] **Step 5: 删除 HomePage.css 中已迁出的终端样式**

在 `src/pages/HomePage.css` 删除原第 192-302 行的全部 `.home-terminal-*` 规则块（这些已在 Task 3 迁到 `HomeTerminal.css`）。

- [ ] **Step 6: 验证构建**

Run: `npx vite build`
Expected: 构建成功，无 "terminalInput is not defined" / "handleTerminalCommand is not defined" 等残留引用报错。

- [ ] **Step 7: Commit**

```bash
git add src/pages/HomePage.jsx src/pages/HomePage.css
git commit -m "refactor(home): 主页改用 HomeTerminal 组件，移除内联终端逻辑与样式"
```

---

## Task 5: 本地手测验收

**Files:** 无（仅验证）

- [ ] **Step 1: 启动 dev server**

Run: `npm run dev`
Expected: 输出 `Local: http://localhost:5173/`。

- [ ] **Step 2: 逐项手测（浏览器打开主页侧边栏终端）**

核对验收标准:
- `help` → 列出全部命令（含 goto/search/me/say）
- `goto news` → 跳转 `/news`；`open wiki` → 跳转 `/wiki`；`goto 不存在` → 报错并列出可用页
- `search 凉宫` → 输出若干可点击结果行，点击其一跳到 `/info/<type>/<id>` 详情页
- `me`（登录态）→ 显示用户名 + 未读邮件数；未登录 → 提示登录
- `say 你好`（登录态）→ 回显"已发送到世界线: 你好"；未登录 → 提示"say 需要登录"
- `neko` / `elpsy` → 彩蛋正常
- 连续输入几条命令后按 ↑/↓ → 召回历史命令
- 输出变长时自动滚到底部；点击终端窗体任意处 → 输入框获得焦点

- [ ] **Step 3: 收尾**

确认全部通过后停止 dev server（终端按 Ctrl+C）。本任务无需 commit。

---

## 自检备忘（写计划者已核对）

- **Spec 覆盖:** 架构（Task 1-4）、命令集 help/clear/about/date/echo/goto/search/me/say/neko/elpsy（Task 2）、体验改进 历史/自动滚动/点击聚焦/异步（Task 3）、共享 typeToKey（Task 1）、验收（Task 5）——全部有对应任务。
- **类型一致:** `OutputLine` 形状（`type`/`text`/`to`/`state`）在 Task 2 的 `runCommand` 与 Task 3 的渲染 map 中一致；`ctx` 字段（navigate/currentUser/print/clear/services）在二者一致。
- **服务签名核对:** `BangumiService.searchSubjects(kw,0,8,0) → {list:[{id,type,name,name_cn,images}]}`；`WorldChannelService.sendMessage(userId, content)`（内容须作第 2 参）；`MailService.getUnreadCountAsync(userId)` 可能返回对象或数字，已双形兼容。
