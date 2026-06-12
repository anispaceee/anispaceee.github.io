# ANISpace Terminal 完善设计

**日期:** 2026-06-12
**分支:** `feat/terminal-enhance`
**状态:** 已通过 brainstorming，待实现

## 背景

主页侧边栏有一个 Mac 风格的 Terminal 小组件（`src/pages/HomePage.jsx` 内联实现，
逻辑约 `215-245` 行，JSX 约 `482-519` 行）。当前仅支持 `help` / `clear` /
`about` / `date` / `echo` / `neko` / `elpsy` 七条命令，纯装饰、不与站点联动，
且缺少命令历史、自动滚动、点击聚焦等基本终端体验。

## 目标

把它从"装饰玩具"升级为**真正有用的快捷工具**:加入与站点联动的命令（页面跳转、
站内资料库搜索、个人信息、发世界线消息），并补齐基本终端交互体验。

## 非目标（YAGNI）

- 不做 Tab 自动补全
- 不做可拖拽 / 最小化 / 多终端窗口
- 不引入测试框架（项目当前无测试 harness），靠 `vite build` + 本地手测验证

## 架构

当前终端逻辑内联在已经偏大的 `HomePage.jsx`。本次抽成独立、可单测的单元:

### 新增文件

1. **`src/components/Home/HomeTerminal.jsx`**
   终端组件:渲染窗口 + 输入处理。负责命令历史导航（↑/↓）、输出自动滚到底部、
   点击窗体聚焦输入框、异步命令的 pending 占位。内部用 `useNavigate()` 和
   `useApp()`（取 `currentUser`）。不接收 props。

2. **`src/components/Home/terminalCommands.js`**
   命令注册表。导出一个命令数组，每条命令形如:
   ```js
   {
     name: 'goto',
     aliases: ['open'],
     description: '跳转到指定页面',
     requiresAuth: false,
     run(args, ctx) { /* 返回 string | string[] | OutputLine[] | Promise<同上> */ }
   }
   ```
   并导出一个 `runCommand(rawInput, ctx)` 调度函数:取首 token 匹配 name/alias，
   校验 `requiresAuth`，调用 `run`，统一捕获异常。

3. **`src/components/Home/HomeTerminal.css`**
   把 `HomePage.css` 中的 `home-terminal-*` 规则迁移到此处（类名保持不变）。

4. **`src/utils/subjectType.js`**
   把 `Wiki.jsx` 里的 `typeToKey()`（Bangumi 类型码 → 路由 key）抽成共享工具，
   `Wiki.jsx` 改为 import 它，终端 `search` 命令也复用。这是服务于本目标的定向改进，
   消除重复映射。

### 修改文件

- **`src/pages/HomePage.jsx`**:删除内联终端的 state / `handleTerminalCommand` /
  JSX，替换为 `<HomeTerminal />`。文件随之瘦身。
- **`src/pages/HomePage.css`**:移除已迁出的 `home-terminal-*` 规则。
- **`src/components/Wiki/Wiki.jsx`**:`typeToKey` 改为从 `src/utils/subjectType.js` import。

## 命令上下文 `ctx`

调度函数构造并传入:

```js
ctx = {
  navigate,          // react-router navigate
  currentUser,       // 当前用户对象或 null
  print(lineOrLines),// 向输出追加（string | string[] | OutputLine[]）
  clear(),           // 清空历史
  services: { BangumiService, WorldChannelService }, // 复用现有 service
}
```

`OutputLine` 形状:`{ type: 'input' | 'output' | 'error', text } ` 或
`{ type: 'link', text, to, state }`（可点击行，点击后 `navigate(to, { state })`）。

## 命令集（v1）

| 命令 | 别名 | 需登录 | 行为 |
|---|---|---|---|
| `help` | `?` | 否 | 从注册表自动生成命令列表 |
| `clear` | — | 否 | 清屏 |
| `about` | — | 否 | 站点简介（保留现文案） |
| `date` | — | 否 | 当前时间 `toLocaleString('zh-CN')` |
| `echo <text>` | — | 否 | 原样回显 |
| `goto <页>` | `open` | 否 | 跳转路由（见下方页名表）；未知页名报错并列出可用页 |
| `search <关键词>` | — | 否 | 调 `BangumiService.searchSubjects(kw, 0, 8, 0)`，把结果渲染成可点击 `link` 行，点击 `navigate('/info/<typeKey>/<id>', { state: { preview } })`；无结果提示 |
| `me` | `whoami` | 否* | 已登录:显示用户名、未读邮件数；未登录:提示"未登录，点右上角登录" |
| `say <text>` | — | 是 | `WorldChannelService.sendMessage(text)` 发一条世界线消息；成功回显 |
| `neko` | — | 否 | 🐱 彩蛋（保留） |
| `elpsy` | — | 否 | El Psy Kongroo 彩蛋（保留） |

\* `me` 不强制登录，未登录时给出提示而非报错。

### 页名 → 路由 别名表（`goto` / `open`）

路由已对照 `src/App.jsx`（2026-06-12）核实:

| 页名（含别名） | 路由 |
|---|---|
| `home` / `主页` | `/` |
| `forum` / `放課後` / `论坛` | `/forum` |
| `news` / `毒电波` / `资讯` | `/news` |
| `wiki` / `禁书目录` / `百科` | `/wiki` |
| `musashi` / `武藏` | `/musashi` |
| `mail` / `邮箱` | `/mailbox` |
| `friends` / `好友` / `lemu` | `/friends` |
| `world` / `世界线` | `/world` |
| `music` / `音乐` | `/music` |
| `me` / `profile` / `我` | `/profile` |

未知页名 → 报错并把上表的可用页名列出来。

## 数据流

```
用户输入 + Enter
  → HomeTerminal 把输入行 push 进 history
  → runCommand(input, ctx)
      → 解析首 token → 查注册表（name/alias）
      → requiresAuth && !currentUser → print 提示，结束
      → result = cmd.run(args, ctx)（可能是 Promise）
      → 若是 Promise：先 print 一个 '...' pending 行，settle 后替换/追加
      → 同步结果直接 print
      → 抛错 → print 一条 error 行
  → history 更新触发 effect → 输出容器 scrollTop = scrollHeight
```

`history` 是 `OutputLine[]` 状态。`me`/`search`/`say` 等异步命令通过 `ctx.print`
在 settle 后追加结果行。

## 体验改进

- **命令历史:** 单独维护 `commandHistory`（仅成功输入的命令）+ 一个游标；
  ↑ 后退、↓ 前进，到底部时清空输入。
- **自动滚动:** 输出容器 `ref`，`useEffect([history])` 里设 `scrollTop = scrollHeight`。
- **点击聚焦:** 窗体 `onClick` 调用输入框 `ref.current.focus()`。
- **异步占位:** pending 行显示 `...`，settle 后更新为结果。

## 错误处理

- 未知命令 → `command not found: <token>`（error 行）。
- 需登录命令未登录 → 友好提示，不抛错。
- 异步命令内部 try/catch，失败打印 `<命令>: <错误信息>` error 行，不影响终端继续可用。
- `search` 接口失败或空结果 → 明确提示（"未找到相关结果" / "搜索失败，请稍后再试"）。

## 测试

命令注册表（`terminalCommands.js`）逻辑接近纯函数，副作用全部经 `ctx`，
可用 mock `ctx` 单测。但项目当前无测试框架，本次**不引入** vitest，
以 `npx vite build` 通过 + 本地 `npm run dev` 手测各命令为验收标准。

## 验收标准

1. `npx vite build` 通过。
2. 主页终端可运行全部 v1 命令:
   - `help` 列出全部命令；`goto news` 跳转资讯页；`search 凉宫` 列出可点击结果并能跳详情页；
     `me` 显示用户信息/未读邮件；`say 你好` 成功发世界线消息（登录态）；彩蛋正常。
3. ↑/↓ 可召回历史命令；输出自动滚到底部；点击终端聚焦输入框。
4. `HomePage.jsx` 不再内联终端逻辑，`Wiki.jsx` 复用共享 `typeToKey`。
