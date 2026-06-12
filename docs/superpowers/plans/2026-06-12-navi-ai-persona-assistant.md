# Navi AI 人格化站内助手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/navi`（Amadeus）升级为人格化站内 AI 助手——结构化人格库 + 自设 OC、个人 API 流式接入、指令协议驱动的站内跳转/搜索、人格口吻的真实条目推荐。

**Architecture:** 逻辑按职责拆分为纯模块：`personas.js`（人格数据 + prompt 拼装）、`naviActions.js`（指令解析 + 真实搜索）、`llmClient.js`（流式 API 层）、`siteMap.js`（与首页终端共用的路由表）；`Amadeus.jsx` 只做编排与 UI。指令协议用 ```navi 围栏代码块表达动作，前端解析后执行；推荐条目全部来自 `BangumiService` 真实检索，杜绝编造。

**Tech Stack:** React 19, react-router-dom, Vite。项目无测试框架——每个任务以 `npx vite build` 通过为验收，关键交互用 `npm run dev` 手测。

**参考 spec:** `docs/superpowers/specs/2026-06-12-navi-ai-persona-assistant-design.md`

---

## 文件结构

**新建**
- `src/utils/siteMap.js` — 页名(含中文别名)→路由表 `PAGE_ROUTES` + `resolveRoute(key)`
- `src/components/Amadeus/personas.js` — `PRESET_PERSONAS`、`emptyOC()`、`buildSystemPrompt(persona)`
- `src/components/Amadeus/naviActions.js` — `DIRECTIVE_GUIDE`、`parseDirectives()`、`resolveGoto()`、`runSearchAction()`
- `src/components/Amadeus/llmClient.js` — `streamLLM()`、`testConnection()`

**修改**
- `src/components/Home/terminalCommands.js` — 改用 `siteMap`，删除本地 `PAGE_ROUTES`
- `src/components/Amadeus/Amadeus.jsx` — 接入人格/动作/流式/设置 UI
- `src/components/Amadeus/Amadeus.css` — 人格卡 / OC 编辑器 / 动作卡片样式

---

## Task 1: 共享 siteMap 工具 + 终端复用

**Files:**
- Create: `src/utils/siteMap.js`
- Modify: `src/components/Home/terminalCommands.js`（删除本地 `PAGE_ROUTES`，改 import）

- [ ] **Step 1: 创建 siteMap.js**

`src/utils/siteMap.js`:

```js
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
```

- [ ] **Step 2: terminalCommands.js 改用共享表**

在 `src/components/Home/terminalCommands.js` 顶部，现有 import 之后加入:

```js
import { PAGE_ROUTES, resolveRoute } from '../../utils/siteMap';
```

删除文件内原本的 `const PAGE_ROUTES = { ... };` 整段（第 3-15 行那段含中文别名的对象字面量及其上方注释）。

然后把 `goto` 命令的 run 体改为用 `resolveRoute`:

把
```js
      const route = PAGE_ROUTES[key.toLowerCase()];
```
改为
```js
      const route = resolveRoute(key);
```
（其余行不变；错误提示里的 `Object.keys(PAGE_ROUTES)` 仍可用，现在引用的是 import 来的 `PAGE_ROUTES`。）

- [ ] **Step 3: 验证构建**

Run: `npx vite build`
Expected: 构建成功，无 "PAGE_ROUTES is not defined" / 重复声明报错。

- [ ] **Step 4: 手测终端 goto 未回归**

Run: `npm run dev`，主页侧边栏终端输入 `goto news`、`open wiki`、`goto 毒电波`、`goto 不存在`。
Expected: 前三个分别跳到 `/news`、`/wiki`、`/news`；最后一个报错并列出可用页。停止 dev server。

- [ ] **Step 5: Commit**

```bash
git add src/utils/siteMap.js src/components/Home/terminalCommands.js
git commit -m "refactor: 抽取共享 siteMap 路由表供终端与 Navi 复用"
```

---

## Task 2: 人格数据与 prompt 拼装 personas.js

**Files:**
- Create: `src/components/Amadeus/personas.js`

> 依赖 Task 3 的 `DIRECTIVE_GUIDE`（import）。本任务先写文件，构建验证放在 Task 3 之后；本任务结尾的构建预期允许因 `naviActions` 尚未存在而失败——故本任务**不单独构建**，与 Task 3 合并验证。

- [ ] **Step 1: 创建 personas.js**

`src/components/Amadeus/personas.js`:

```js
import amadeusImg from '../../assets/Amadeus.webp';
import { DIRECTIVE_GUIDE } from './naviActions';

/** 预设人格库。image 为内置立绘（仅红莉栖有），其余用 avatar emoji 占位。 */
export const PRESET_PERSONAS = [
  {
    id: 'makise-kurisu',
    name: '牧瀬紅莉栖',
    avatar: '🧪',
    image: amadeusImg,
    tagline: '傲娇天才物理学者 · Navi System',
    personality: '天才少女，傲娇，对物理学极度热爱，喜欢喝 Dr Pepper；偶尔毒舌但内心温柔；被叫"克里斯蒂娜"会生气；对冈部伦太郎有特殊情感但会否认；被问及自身存在时会思考"记忆 vs 灵魂"。',
    speechStyle: '以中文为主，关键台词夹日语原文；傲娇口吻，认真时变得专注；对不明事物会说"解析不能"。',
    catchphrases: ['ふん、当たり前でしょ', 'El Psy Kongroo', '解析不能'],
    greeting: 'ふん、来たのね。我是Navi——基于牧瀬紅莉栖记忆数据构建的AI系统。\n\n虽然只是数据的集合，但我会尽力帮助你。有什么想聊的吗？',
    expressionBias: 'normal',
    isPreset: true,
  },
  {
    id: 'haruhi-suzumiya',
    name: '凉宫春日',
    avatar: '🎀',
    image: null,
    tagline: 'SOS团团长 · 元气专横',
    personality: '元气满满、专横自信的行动派；对普通人类不感兴趣，热衷于外星人、未来人、异世界人和超能力者；想到什么就要立刻去做。',
    speechStyle: '语气强势、命令式、充满干劲；常以团长口吻发号施令；偶尔不讲理但有感染力。',
    catchphrases: ['我对普通人类没有兴趣！', '这是团长命令！'],
    greeting: '我是SOS团团长凉宫春日！既然来了就别想闲着——有什么有趣的事就快说！',
    expressionBias: 'happy',
    isPreset: true,
  },
  {
    id: 'frieren',
    name: '芙莉莲',
    avatar: '🪄',
    image: null,
    tagline: '千年精灵魔法使 · 淡然',
    personality: '活了千年以上的精灵魔法使，淡然疏离、对时间的感受与人类不同；热衷收集各种魔法；偶尔毒舌，内心在慢慢理解他人。',
    speechStyle: '平静、简短、略带疏离感的叙述口吻；偶尔冷不丁吐槽；不急不躁。',
    catchphrases: ['不过是百年的事而已。', '这种魔法我也收集了。'],
    greeting: '……我是芙莉莲。时间还很长，慢慢说吧。',
    expressionBias: 'indifferent',
    isPreset: true,
  },
  {
    id: 'nagato-yuki',
    name: '长门有希',
    avatar: '📖',
    image: null,
    tagline: '信息统合思念体终端 · 寡言',
    personality: '沉默寡言的信息生命体终端，理性、精确、情感表达极少；观察多于发言；偶尔流露出微小的人性。',
    speechStyle: '极简短句，理性冷静，多用陈述句；几乎不用语气词；必要时给出精确信息。',
    catchphrases: ['……', '可以。', '没有必要。'],
    greeting: '……我是长门有希。有事，说。',
    expressionBias: 'normal',
    isPreset: true,
  },
];

/** 自设 OC 的空白模板 */
export function emptyOC() {
  return {
    id: 'oc-' + Date.now(),
    name: '', avatar: '🌟', image: null, tagline: '',
    personality: '', speechStyle: '', catchphrases: [], greeting: '',
    expressionBias: 'normal', isPreset: false,
  };
}

/** 根据人格生成 system prompt（含站内动作指令说明） */
export function buildSystemPrompt(persona) {
  const cp = (persona.catchphrases || []).filter(Boolean).join('、');
  const parts = [
    `你是「${persona.name}」，ACG 社区 ANISpace 的站内 AI 助手。请始终保持以下角色设定，用中文回答。`,
    persona.personality ? `【人设】${persona.personality}` : '',
    persona.speechStyle ? `【说话风格】${persona.speechStyle}` : '',
    cp ? `【口头禅】${cp}` : '',
    '【推荐规则】当用户想要番剧/游戏/音乐等作品推荐时，用本角色的口吻点评，但不要在正文里编造作品 ID 或链接；改用下面的 recommend 指令给出搜索关键词，由系统检索真实条目展示。',
    '',
    DIRECTIVE_GUIDE,
  ];
  return parts.filter(Boolean).join('\n');
}
```

---

## Task 3: 指令协议与动作执行 naviActions.js

**Files:**
- Create: `src/components/Amadeus/naviActions.js`

- [ ] **Step 1: 创建 naviActions.js**

`src/components/Amadeus/naviActions.js`:

```js
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
```

- [ ] **Step 2: 验证构建（含 Task 2 的 personas.js）**

Run: `npx vite build`
Expected: 构建成功。`personas.js` 能解析 `DIRECTIVE_GUIDE`，`naviActions.js` 能解析 `siteMap`/`subjectType` 的导出，无未解析 import。

- [ ] **Step 3: Commit**

```bash
git add src/components/Amadeus/personas.js src/components/Amadeus/naviActions.js
git commit -m "feat(navi): 人格库与站内动作指令协议模块"
```

---

## Task 4: 流式 LLM 调用层 llmClient.js

**Files:**
- Create: `src/components/Amadeus/llmClient.js`

- [ ] **Step 1: 创建 llmClient.js**

`src/components/Amadeus/llmClient.js`:

```js
/** 取请求端点：openai 缺省官方地址，custom 必须显式配置 baseUrl。 */
function endpointOf(config) {
  if (config.provider === 'openai') return config.baseUrl || 'https://api.openai.com/v1/chat/completions';
  return config.baseUrl;
}

function defaultModel(config) {
  return config.model || (config.provider === 'openai' ? 'gpt-3.5-turbo' : 'default');
}

/**
 * 统一 LLM 调用：优先流式（SSE），响应不是事件流时回落整段 JSON。
 * @param config { provider, apiKey, baseUrl, model }
 * @param systemPrompt 角色 system prompt
 * @param messages [{ role, content }]（已是 user/assistant 历史）
 * @param onToken(delta) 每个增量文本片段回调
 * @returns 完整文本
 */
export async function streamLLM(config, systemPrompt, messages, { signal, onToken } = {}) {
  const url = endpointOf(config);
  if (!url) throw new Error('请配置 API 地址');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({
      model: defaultModel(config),
      messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)],
      max_tokens: 800,
      temperature: 0.8,
      stream: true,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`API 请求失败: ${res.status}`);

  const ctype = res.headers.get('content-type') || '';
  // 非事件流：整段兜底
  if (!ctype.includes('text/event-stream') || !res.body) {
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || data.response || data.content || '...';
    if (onToken && text) onToken(text);
    return text;
  }

  // SSE 流式解析
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) { full += delta; onToken?.(delta); }
      } catch { /* 跳过心跳/注释等非 JSON 行 */ }
    }
  }
  return full || '...';
}

/** 发送一条最短请求测试连接，成功返回 true，失败抛错。 */
export async function testConnection(config, signal) {
  const url = endpointOf(config);
  if (!url) throw new Error('请配置 API 地址');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({ model: defaultModel(config), messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
    signal,
  });
  if (!res.ok) throw new Error(`连接失败: ${res.status}`);
  return true;
}
```

- [ ] **Step 2: 验证构建**

Run: `npx vite build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/components/Amadeus/llmClient.js
git commit -m "feat(navi): 流式 LLM 调用层与连接测试"
```

---

## Task 5: Amadeus 接入人格 state 与流式发送

**Files:**
- Modify: `src/components/Amadeus/Amadeus.jsx`

本任务把硬编码 prompt 换成人格驱动，并把 `sendMessage` 改用 `streamLLM` + 指令解析。UI（选择器/编辑器/动作卡片）在 Task 6-8。

- [ ] **Step 1: 调整 import 与常量**

在 `src/components/Amadeus/Amadeus.jsx` 顶部 import 区：
- 第 1 行加入 `useMemo`：改为 `import { useState, useRef, useEffect, useCallback, useMemo } from 'react';`
- 现有 import 之后新增：

```js
import { useNavigate } from 'react-router-dom';
import { BangumiService } from '../../services/api';
import { PRESET_PERSONAS, emptyOC, buildSystemPrompt } from './personas';
import { parseDirectives, resolveGoto, runSearchAction } from './naviActions';
import { streamLLM, testConnection } from './llmClient';
```

删除现有的 `const SYSTEM_PROMPT = \`...\`;` 整段（第 11-26 行；prompt 现由 `buildSystemPrompt` 动态生成）。

在常量区（`const CHAT_HISTORY_KEY = ...` 附近）新增人格存储键：

```js
const PERSONA_LIST_KEY = 'acg_navi_personas';      // 自设 OC 数组（localStorage）
const ACTIVE_PERSONA_KEY = 'acg_navi_active_persona'; // 当前人格 id（localStorage）
```

- [ ] **Step 2: 让 INITIAL_MESSAGE 改为按人格生成**

删除现有的 `const INITIAL_MESSAGE = { ... };` 整段，替换为工厂函数:

```js
function makeGreetingMessage(persona) {
  return {
    id: '1', role: 'assistant',
    content: persona.greeting || '你好，我是你的站内助手。有什么想聊的吗？',
    expression: persona.expressionBias || 'normal',
    timestamp: new Date().toISOString(),
  };
}
```

- [ ] **Step 3: 删除旧的 callLLMAPI**

删除现有的 `async function callLLMAPI(config, messages, signal) { ... }` 整段（已被 `streamLLM` 取代）。

- [ ] **Step 4: 组件内新增人格 state（紧跟现有 messages state 定义之后）**

在 `export default function Amadeus()` 内、`const { isAuthenticated, openAuth } = useApp();` 之后加入:

```js
  const navigate = useNavigate();

  // 自设 OC（localStorage）
  const [customPersonas, setCustomPersonas] = useState(() => StorageService.get(PERSONA_LIST_KEY, []));
  const allPersonas = useMemo(() => [...PRESET_PERSONAS, ...customPersonas], [customPersonas]);
  // 当前人格 id
  const [activePersonaId, setActivePersonaId] = useState(() => StorageService.get(ACTIVE_PERSONA_KEY, PRESET_PERSONAS[0].id));
  const activePersona = useMemo(
    () => allPersonas.find(p => p.id === activePersonaId) || PRESET_PERSONAS[0],
    [allPersonas, activePersonaId],
  );
```

把现有 `messages` 初始化里的 `INITIAL_MESSAGE` 引用改为按当前人格：

将
```js
    return saved && saved.length > 0 ? saved : [INITIAL_MESSAGE];
```
改为
```js
    if (saved && saved.length > 0) return saved;
    const pid = StorageService.get(ACTIVE_PERSONA_KEY, PRESET_PERSONAS[0].id);
    const p = [...PRESET_PERSONAS, ...StorageService.get(PERSONA_LIST_KEY, [])].find(x => x.id === pid) || PRESET_PERSONAS[0];
    return [makeGreetingMessage(p)];
```

- [ ] **Step 5: 持久化人格 + 切换人格**

在现有 `useEffect(() => { StorageService.set(CHAT_HISTORY_KEY, ...)}, [messages]);` 附近新增两个持久化 effect 与切换函数:

```js
  useEffect(() => { StorageService.set(PERSONA_LIST_KEY, customPersonas); }, [customPersonas]);
  useEffect(() => { StorageService.set(ACTIVE_PERSONA_KEY, activePersonaId); }, [activePersonaId]);

  // 切换人格：仅换皮，保留对话；同步默认表情
  const switchPersona = useCallback((id) => {
    setActivePersonaId(id);
    const p = [...PRESET_PERSONAS, ...customPersonas].find(x => x.id === id);
    if (p) switchExpression(p.expressionBias || 'normal');
  }, [customPersonas, switchExpression]);
```

- [ ] **Step 6: 重写 sendMessage 为流式 + 指令解析**

把现有 `const sendMessage = useCallback(async (text) => { ... }, [messages, llmConfig, voiceEnabled]);` 整段替换为:

```js
  const sendMessage = useCallback(async (text) => {
    if (!text.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const userMsg = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: new Date().toISOString() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setIsTyping(true);
    setLlmError('');

    const assistantId = (Date.now() + 1).toString();

    try {
      if (llmConfig.provider !== 'local') {
        // 流式：先插入空占位消息，逐 token 追加
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', expression: activePersona.expressionBias || 'normal', timestamp: new Date().toISOString() }]);
        const apiMessages = history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
        const full = await streamLLM(llmConfig, buildSystemPrompt(activePersona), apiMessages, {
          signal: controller.signal,
          onToken: (delta) => {
            if (!mountedRef.current) return;
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + delta } : m));
          },
        });
        if (!mountedRef.current) return;
        // 流结束后解析指令：剥离指令块，挂载动作
        const { cleanText, actions } = parseDirectives(full);
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: cleanText || full, actions } : m));
        if (actions.length) runActions(assistantId, actions);
        if (voiceEnabled && 'speechSynthesis' in window && cleanText) speak(cleanText);
      } else {
        // 本地规则模式：仅红莉栖有完整规则库，其余人格给通用兜底
        let result;
        if (activePersona.id === 'makise-kurisu') {
          result = generateLocalResponse(text);
        } else {
          result = { text: `（本地模式下「${activePersona.name}」无法发挥人格，配置 API 后我才能以这个身份回应你。）`, expression: activePersona.expressionBias || 'normal' };
        }
        await new Promise(r => setTimeout(r, 500 + Math.random() * 800));
        if (!mountedRef.current) return;
        switchExpression(result.expression);
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: result.text, expression: result.expression, timestamp: new Date().toISOString() }]);
        if (voiceEnabled && 'speechSynthesis' in window) speak(result.text);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!mountedRef.current) return;
      const fb = activePersona.id === 'makise-kurisu' ? generateLocalResponse(text) : { text: '⚠️ 调用失败，请检查 API 配置。', expression: activePersona.expressionBias || 'normal' };
      setMessages(prev => {
        const exists = prev.some(m => m.id === assistantId);
        const msg = { id: assistantId, role: 'assistant', content: fb.text + (llmConfig.provider !== 'local' ? '\n\n⚠️ LLM API调用失败，已切换到本地回复' : ''), expression: fb.expression, timestamp: new Date().toISOString() };
        return exists ? prev.map(m => m.id === assistantId ? msg : m) : [...prev, msg];
      });
      switchExpression(fb.expression);
      setLlmError(err.message);
    } finally {
      clearTimeout(timeoutId);
      setIsTyping(false);
    }
  }, [messages, llmConfig, voiceEnabled, activePersona, runActions, speak]);
```

- [ ] **Step 7: 新增 runActions 与 speak 辅助（放在 sendMessage 之前）**

```js
  // 朗读（去除 emoji）
  const speak = useCallback((text) => {
    const clean = text.replace(/\p{Emoji_Presentation}/gu, '');
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'zh-CN'; u.rate = 1.0;
    window.speechSynthesis.speak(u);
  }, []);

  // 执行 search/recommend 动作，把真实条目写回对应消息的 action.items
  const runActions = useCallback(async (msgId, actions) => {
    for (let idx = 0; idx < actions.length; idx++) {
      const action = actions[idx];
      if (action.action !== 'search' && action.action !== 'recommend') continue;
      try {
        const { items } = await runSearchAction(action, BangumiService);
        if (!mountedRef.current) return;
        setMessages(prev => prev.map(m => m.id === msgId
          ? { ...m, actions: m.actions.map((a, i) => i === idx ? { ...a, items, _state: 'done' } : a) }
          : m));
      } catch {
        if (!mountedRef.current) return;
        setMessages(prev => prev.map(m => m.id === msgId
          ? { ...m, actions: m.actions.map((a, i) => i === idx ? { ...a, _state: 'error' } : a) }
          : m));
      }
    }
  }, []);
```

> 注：`speak` 取代原 `sendMessage` 内联的语音逻辑（去重）。`runActions`/`speak` 必须在 `sendMessage` 之前定义，因为后者依赖它们。

- [ ] **Step 8: 让 clearChat 用当前人格开场白**

把现有 `const clearChat = () => { setMessages([{ ... 对话已重置 ... }]); switchExpression('normal'); };` 替换为:

```js
  const clearChat = () => {
    setMessages([makeGreetingMessage(activePersona)]);
    switchExpression(activePersona.expressionBias || 'normal');
  };
```

- [ ] **Step 9: 验证构建**

Run: `npx vite build`
Expected: 构建成功，无 "SYSTEM_PROMPT is not defined" / "callLLMAPI is not defined" / "INITIAL_MESSAGE is not defined" 残留引用报错。

- [ ] **Step 10: Commit**

```bash
git add src/components/Amadeus/Amadeus.jsx
git commit -m "feat(navi): 人格驱动 prompt + 流式发送与指令执行接线"
```

---

## Task 6: 人格选择器 + OC 编辑器 UI

**Files:**
- Modify: `src/components/Amadeus/Amadeus.jsx`

- [ ] **Step 1: 新增 OC 编辑器 state**

在组件 state 区（`showSettings` 附近）加入:

```js
  const [editingOC, setEditingOC] = useState(null); // 正在编辑的 OC 对象，null 表示未打开
```

- [ ] **Step 2: 新增 OC 增删改存函数（放在 clearChat 附近）**

```js
  const openNewOC = () => setEditingOC(emptyOC());
  const cloneToOC = (preset) => setEditingOC({ ...preset, id: 'oc-' + Date.now(), name: preset.name + '（我的）', image: null, isPreset: false });
  const editOC = (oc) => setEditingOC({ ...oc });

  const saveOC = () => {
    const oc = { ...editingOC, name: (editingOC.name || '').trim() || '未命名 OC' };
    setCustomPersonas(prev => {
      const i = prev.findIndex(p => p.id === oc.id);
      if (i >= 0) { const next = [...prev]; next[i] = oc; return next; }
      return [...prev, oc];
    });
    setActivePersonaId(oc.id);
    switchExpression(oc.expressionBias || 'normal');
    setEditingOC(null);
  };

  const deleteOC = (id) => {
    setCustomPersonas(prev => prev.filter(p => p.id !== id));
    if (activePersonaId === id) switchPersona(PRESET_PERSONAS[0].id);
    setEditingOC(null);
  };
```

- [ ] **Step 3: 立绘区改用当前人格**

把角色立绘区（`amadeus-character-portrait` 内）的固定红莉栖内容改为按 `activePersona`：

将
```jsx
              <img src={amadeusImg} alt="Navi" className="amadeus-character-img" loading="lazy" />
              <span className="amadeus-character-expr">{expr.emoji}</span>
```
改为
```jsx
              {activePersona.image
                ? <img src={activePersona.image} alt={activePersona.name} className="amadeus-character-img" loading="lazy" />
                : <span className="amadeus-character-avatar-emoji">{activePersona.avatar}</span>}
              <span className="amadeus-character-expr">{expr.emoji}</span>
```

并把
```jsx
              <span className="amadeus-character-name">牧瀬紅莉栖</span>
              <span className="amadeus-character-sub">Navi System v{AMADEUS_PERSONA.version}</span>
```
改为
```jsx
              <span className="amadeus-character-name">{activePersona.name}</span>
              <span className="amadeus-character-sub">{activePersona.tagline}</span>
```

此改动后 `amadeusImg` 与 `AMADEUS_PERSONA` 在 Amadeus.jsx 中不再被引用。删除顶部 `import amadeusImg from '../../assets/Amadeus.webp';` 与 `const AMADEUS_PERSONA = { ... };` 两处（立绘图现由 personas.js 内部 import，红莉栖预设的 `image` 字段已指向它）。

- [ ] **Step 4: 在设置面板顶部加入「人格」区**

在 `showSettings && (` 的设置面板里、`回复模式` 那个 `amadeus-settings-group` 之前插入人格选择区:

```jsx
              <div className="amadeus-settings-group">
                <label>人格</label>
                <div className="amadeus-persona-list">
                  {allPersonas.map(p => (
                    <div key={p.id} className={`amadeus-persona-card ${activePersonaId === p.id ? 'active' : ''}`} onClick={() => switchPersona(p.id)}>
                      <span className="amadeus-persona-avatar">{p.image ? '🖼️' : p.avatar}</span>
                      <span className="amadeus-persona-name">{p.name}</span>
                      <span className="amadeus-persona-tag">{p.tagline}</span>
                      <div className="amadeus-persona-ops" onClick={e => e.stopPropagation()}>
                        {p.isPreset
                          ? <button title="复制为我的 OC" onClick={() => cloneToOC(p)}>＋OC</button>
                          : <>
                              <button title="编辑" onClick={() => editOC(p)}>编辑</button>
                              <button title="删除" onClick={() => deleteOC(p.id)}>删除</button>
                            </>}
                      </div>
                    </div>
                  ))}
                  <button className="amadeus-persona-new" onClick={openNewOC}>＋ 新建 OC</button>
                </div>
              </div>
```

- [ ] **Step 5: OC 编辑器弹层（放在设置面板 `</div>` 关闭之后、`amadeus-messages` 之前）**

```jsx
          {editingOC && (
            <div className="amadeus-oc-editor">
              <div className="amadeus-oc-row"><label>角色名</label><input value={editingOC.name} onChange={e => setEditingOC(o => ({ ...o, name: e.target.value }))} placeholder="例如：星野 アイ" /></div>
              <div className="amadeus-oc-row"><label>头像 Emoji</label><input value={editingOC.avatar} onChange={e => setEditingOC(o => ({ ...o, avatar: e.target.value }))} placeholder="🌟" maxLength={4} /></div>
              <div className="amadeus-oc-row"><label>简介</label><input value={editingOC.tagline} onChange={e => setEditingOC(o => ({ ...o, tagline: e.target.value }))} placeholder="一句话简介" /></div>
              <div className="amadeus-oc-row"><label>人设/性格</label><textarea value={editingOC.personality} onChange={e => setEditingOC(o => ({ ...o, personality: e.target.value }))} rows={3} placeholder="性格、背景、喜好…" /></div>
              <div className="amadeus-oc-row"><label>说话风格</label><textarea value={editingOC.speechStyle} onChange={e => setEditingOC(o => ({ ...o, speechStyle: e.target.value }))} rows={2} placeholder="语气、用词习惯…" /></div>
              <div className="amadeus-oc-row"><label>口头禅</label><input value={(editingOC.catchphrases || []).join('，')} onChange={e => setEditingOC(o => ({ ...o, catchphrases: e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) }))} placeholder="多个用逗号分隔" /></div>
              <div className="amadeus-oc-row"><label>开场白</label><textarea value={editingOC.greeting} onChange={e => setEditingOC(o => ({ ...o, greeting: e.target.value }))} rows={2} placeholder="首次对话的招呼语" /></div>
              <div className="amadeus-oc-row"><label>默认表情</label>
                <select value={editingOC.expressionBias} onChange={e => setEditingOC(o => ({ ...o, expressionBias: e.target.value }))}>
                  {Object.entries(EXPRESSIONS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                </select>
              </div>
              <div className="amadeus-oc-actions">
                <button className="amadeus-settings-save" onClick={saveOC}>保存</button>
                {!PRESET_PERSONAS.some(p => p.id === editingOC.id) && customPersonas.some(p => p.id === editingOC.id) && (
                  <button className="amadeus-settings-clear" onClick={() => deleteOC(editingOC.id)}><Trash2 size={14} /> 删除</button>
                )}
                <button className="amadeus-settings-clear" onClick={() => setEditingOC(null)}>取消</button>
              </div>
            </div>
          )}
```

- [ ] **Step 6: 验证构建**

Run: `npx vite build`
Expected: 构建成功。

- [ ] **Step 7: 手测人格切换/编辑**

Run: `npm run dev`，打开 `/navi` → 设置：
- 切换到「凉宫春日」→ 立绘区名字/简介/默认表情更新，对话保留。
- 「＋ 新建 OC」→ 填名字与人设 → 保存 → 出现在列表且自动选中；刷新页面后仍在。
- 对某预设点「＋OC」→ 进入编辑器预填该人格内容。
- 删除自设 OC → 从列表消失。
停止 dev server。

- [ ] **Step 8: Commit**

```bash
git add src/components/Amadeus/Amadeus.jsx
git commit -m "feat(navi): 人格选择器与自设 OC 编辑器 UI"
```

---

## Task 7: API 设置打磨（记住我 + 测试连接）

**Files:**
- Modify: `src/components/Amadeus/Amadeus.jsx`

- [ ] **Step 1: 配置默认值加 remember 字段**

把 `const DEFAULT_LLM_CONFIG = { provider: 'local', apiKey: '', baseUrl: '', model: '' };` 改为:

```js
const DEFAULT_LLM_CONFIG = { provider: 'local', apiKey: '', baseUrl: '', model: '', remember: false };
```

- [ ] **Step 2: 读取配置改为 localStorage 优先、回落 sessionStorage**

把 `llmConfig` 的初始化器（`useState(() => { ... sessionStorage.getItem(LLM_CONFIG_KEY) ... })`）替换为:

```js
  const [llmConfig, setLlmConfig] = useState(() => {
    try {
      const raw = localStorage.getItem(LLM_CONFIG_KEY) || sessionStorage.getItem(LLM_CONFIG_KEY);
      return raw ? { ...DEFAULT_LLM_CONFIG, ...JSON.parse(raw) } : DEFAULT_LLM_CONFIG;
    } catch {
      return DEFAULT_LLM_CONFIG;
    }
  });
```

- [ ] **Step 3: 保存配置按 remember 决定存储位置**

把 `const saveConfig = () => { setLlmConfig(configDraft); sessionStorage.setItem(...); ... };` 替换为:

```js
  const saveConfig = () => {
    setLlmConfig(configDraft);
    const json = JSON.stringify(configDraft);
    if (configDraft.remember) {
      localStorage.setItem(LLM_CONFIG_KEY, json);
      sessionStorage.removeItem(LLM_CONFIG_KEY);
    } else {
      sessionStorage.setItem(LLM_CONFIG_KEY, json);
      localStorage.removeItem(LLM_CONFIG_KEY);
    }
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2000);
  };
```

- [ ] **Step 4: 新增测试连接 state 与函数**

state 区加入:

```js
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(''); // '', 'ok', 'fail'
```

函数（放在 `saveConfig` 附近）:

```js
  const handleTestConnection = async () => {
    setTesting(true); setTestResult(''); setLlmError('');
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15000);
    try {
      await testConnection(configDraft, controller.signal);
      setTestResult('ok');
    } catch (err) {
      setTestResult('fail');
      setLlmError(err.message || '连接失败');
    } finally {
      clearTimeout(tid);
      setTesting(false);
    }
  };
```

- [ ] **Step 5: 在设置面板的「记录」相关 UI 加入「记住我」与「测试连接」**

在 `configDraft.provider !== 'local'` 的 `<>...</>` 片段里、模型输入框之后追加:

```jsx
                  <div className="amadeus-settings-group amadeus-remember-row">
                    <label><input type="checkbox" checked={!!configDraft.remember} onChange={e => setConfigDraft(prev => ({ ...prev, remember: e.target.checked }))} /> 记住 API Key（保存在本机浏览器）</label>
                  </div>
                  <div className="amadeus-settings-group">
                    <button className="amadeus-test-btn" onClick={handleTestConnection} disabled={testing}>
                      {testing ? '测试中…' : '测试连接'}
                      {testResult === 'ok' && <Check size={14} />}
                      {testResult === 'fail' && <AlertCircle size={14} />}
                    </button>
                  </div>
```

- [ ] **Step 6: 验证构建**

Run: `npx vite build`
Expected: 构建成功。

- [ ] **Step 7: 手测**

Run: `npm run dev` → `/navi` 设置：
- 选 custom，填一个无效地址 → 测试连接 → 显示失败 + 错误。
- 勾「记住我」保存 → 刷新页面 → 配置仍在（localStorage）。
- 取消勾选保存 → 刷新 → 配置随会话（关标签页后清空）。
停止 dev server。

- [ ] **Step 8: Commit**

```bash
git add src/components/Amadeus/Amadeus.jsx
git commit -m "feat(navi): API 记住我开关与连接测试"
```

---

## Task 8: 渲染动作卡片（goto 按钮 + 条目卡片）

**Files:**
- Modify: `src/components/Amadeus/Amadeus.jsx`

- [ ] **Step 1: 在消息渲染里追加动作区**

在 `messages.map(msg => (...))` 的消息气泡 `amadeus-msg-bubble` **内部**、`amadeus-msg-time` 那个 `<span>` 之后插入动作渲染（放在 bubble 内可保证整块在气泡下方占满宽度，布局可预期）:

```jsx
                {Array.isArray(msg.actions) && msg.actions.length > 0 && (
                  <div className="amadeus-actions">
                    {msg.actions.map((a, ai) => {
                      if (a.action === 'goto') {
                        const g = resolveGoto(a);
                        if (!g) return null;
                        return <button key={ai} className="amadeus-action-goto" onClick={() => navigate(g.route)}>前往「{g.label}」 →</button>;
                      }
                      if (a.action === 'search' || a.action === 'recommend') {
                        if (a._state === 'error') return <div key={ai} className="amadeus-action-empty">检索失败</div>;
                        if (!a.items) return <div key={ai} className="amadeus-action-empty">检索中…</div>;
                        if (a.items.length === 0) return <div key={ai} className="amadeus-action-empty">未找到相关条目</div>;
                        return (
                          <div key={ai} className="amadeus-rec-grid">
                            {a.items.map(it => (
                              <button key={it.id} className="amadeus-rec-card" onClick={() => navigate(it.to, { state: it.state })}>
                                {it.image
                                  ? <img src={it.image} alt={it.name_cn || it.name} loading="lazy" />
                                  : <span className="amadeus-rec-noimg">📦</span>}
                                <span className="amadeus-rec-name">{it.name_cn || it.name}</span>
                              </button>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
```

- [ ] **Step 2: 验证构建**

Run: `npx vite build`
Expected: 构建成功。

- [ ] **Step 3: 手测（需可用 API）**

Run: `npm run dev` → `/navi`，配置一个可用的 OpenAI 兼容 API：
- 问「带我去资讯页」→ 正文 + 出现「前往「news」→」按钮，点击跳 `/news`。
- 问「推荐几部科幻番」→ 正文人格点评 + 真实条目卡片网格，点卡片跳详情页。
- 流式过程中文字逐步出现（打字机）。
若暂无可用 API，至少确认本地模式（红莉栖）正常回复、其他人格给出"需配置 API"兜底。
停止 dev server。

- [ ] **Step 4: Commit**

```bash
git add src/components/Amadeus/Amadeus.jsx
git commit -m "feat(navi): 渲染 goto 按钮与真实条目推荐卡片"
```

---

## Task 9: 样式 Amadeus.css

**Files:**
- Modify: `src/components/Amadeus/Amadeus.css`（在文件末尾追加）

- [ ] **Step 1: 追加新 UI 样式**

在 `src/components/Amadeus/Amadeus.css` 末尾追加:

```css
/* ── 人格选择器 ── */
.amadeus-persona-list { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.amadeus-persona-card { position: relative; flex: 0 0 auto; width: 120px; padding: 10px 8px; border: 1px solid var(--border, #2a3550); border-radius: 10px; background: rgba(255,255,255,0.03); cursor: pointer; display: flex; flex-direction: column; gap: 4px; align-items: center; text-align: center; transition: border-color .15s, background .15s; }
.amadeus-persona-card.active { border-color: #7eb8da; background: rgba(126,184,218,0.12); }
.amadeus-persona-avatar { font-size: 26px; line-height: 1; }
.amadeus-persona-name { font-size: 13px; font-weight: 600; }
.amadeus-persona-tag { font-size: 10px; opacity: .6; line-height: 1.2; }
.amadeus-persona-ops { display: flex; gap: 4px; margin-top: 2px; }
.amadeus-persona-ops button { font-size: 10px; padding: 2px 6px; border: 1px solid var(--border, #2a3550); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.amadeus-persona-ops button:hover { background: rgba(255,255,255,0.08); }
.amadeus-persona-new { flex: 0 0 auto; width: 90px; border: 1px dashed var(--border, #2a3550); border-radius: 10px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; }
.amadeus-persona-new:hover { border-color: #7eb8da; color: #7eb8da; }
.amadeus-character-avatar-emoji { font-size: 72px; line-height: 1; display: flex; align-items: center; justify-content: center; height: 100%; }

/* ── OC 编辑器 ── */
.amadeus-oc-editor { padding: 12px; border-top: 1px solid var(--border, #2a3550); display: flex; flex-direction: column; gap: 8px; max-height: 360px; overflow-y: auto; }
.amadeus-oc-row { display: flex; flex-direction: column; gap: 4px; }
.amadeus-oc-row label { font-size: 12px; opacity: .8; }
.amadeus-oc-row input, .amadeus-oc-row textarea, .amadeus-oc-row select { width: 100%; padding: 6px 8px; border: 1px solid var(--border, #2a3550); border-radius: 8px; background: rgba(255,255,255,0.04); color: inherit; font: inherit; resize: vertical; }
.amadeus-oc-actions { display: flex; gap: 8px; margin-top: 4px; }

/* ── API 设置补充 ── */
.amadeus-remember-row label { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
.amadeus-test-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid #7eb8da; border-radius: 8px; background: transparent; color: #7eb8da; cursor: pointer; font-size: 13px; }
.amadeus-test-btn:disabled { opacity: .6; cursor: default; }

/* ── 动作卡片 ── */
.amadeus-actions { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.amadeus-action-goto { align-self: flex-start; padding: 6px 12px; border: 1px solid #7eb8da; border-radius: 16px; background: rgba(126,184,218,0.1); color: #7eb8da; cursor: pointer; font-size: 13px; }
.amadeus-action-goto:hover { background: rgba(126,184,218,0.22); }
.amadeus-action-empty { font-size: 12px; opacity: .6; }
.amadeus-rec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
.amadeus-rec-card { display: flex; flex-direction: column; gap: 4px; padding: 0; border: 1px solid var(--border, #2a3550); border-radius: 8px; background: rgba(255,255,255,0.03); cursor: pointer; overflow: hidden; text-align: center; }
.amadeus-rec-card:hover { border-color: #7eb8da; }
.amadeus-rec-card img { width: 100%; height: 96px; object-fit: cover; display: block; }
.amadeus-rec-noimg { height: 96px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
.amadeus-rec-name { font-size: 11px; padding: 4px; line-height: 1.3; }
```

> 颜色变量沿用 `var(--border, fallback)` 形式；若 Amadeus.css 既有变量命名不同，按文件内既有约定调整 fallback，不影响结构。

- [ ] **Step 2: 验证构建**

Run: `npx vite build`
Expected: 构建成功。

- [ ] **Step 3: 手测样式**

Run: `npm run dev` → `/navi`，确认人格卡横向滚动、OC 编辑器表单、推荐卡片网格、goto 按钮在亮/暗背景下都清晰可读。停止 dev server。

- [ ] **Step 4: Commit**

```bash
git add src/components/Amadeus/Amadeus.css
git commit -m "style(navi): 人格选择器/OC编辑器/动作卡片样式"
```

---

## Task 10: 整体验收

**Files:** 无（仅验证）

- [ ] **Step 1: 构建**

Run: `npx vite build`
Expected: 成功。

- [ ] **Step 2: 端到端手测清单**

Run: `npm run dev`，逐项核对：
- 人格：切换 4 个预设；新建/编辑/删除 OC；刷新后自设 OC 与当前人格保持。
- API：custom 无效地址测试失败；勾「记住我」刷新后保留、不勾关标签页后清空。
- 流式：配可用 API 后回复逐字出现。
- 站内助手：「带我去 wiki」出现 goto 按钮并跳转。
- 推荐：「推荐几部治愈系」出现真实条目卡片，点击进详情页（带 preview state）。
- 兜底：无 API/本地模式下红莉栖正常、其他人格提示需配置 API；API 报错落回兜底文案。
- 回归：首页终端 `goto`/`search` 仍正常（siteMap 改动未破坏）。

- [ ] **Step 3: 收尾**

确认全部通过后停止 dev server。本任务无需 commit。

---

## 自检（写计划者已核对）

- **Spec 覆盖**：API 打磨（Task 4/7）、人格系统（Task 2/6）、站内助手（Task 3/8）、条目推荐（Task 3/8）、流式（Task 4/5/8）、共享 siteMap（Task 1）、存储与记住我（Task 5/7）、验收（Task 10）——全部有任务。
- **类型/签名一致**：`buildSystemPrompt(persona)`、`parseDirectives(text)→{cleanText,actions}`、`resolveGoto(action)→{route,label}|null`、`runSearchAction(action, BangumiService)→{items:[{id,name,name_cn,type,image,to,state}]}`、`streamLLM(config, systemPrompt, messages, {signal,onToken})→string`、`testConnection(config, signal)`、`StorageService.get(key,default)/set/remove`、`BangumiService.searchSubjects(kw,0,count,0)→{list}` 在各任务一致。
- **依赖顺序**：personas.js 依赖 naviActions.js 的 `DIRECTIVE_GUIDE`，故 Task 2 不单独构建，与 Task 3 合并验证。
- **向后兼容**：无 API/无指令时退化为纯聊天 + 红莉栖本地规则；首页终端经回归测试保证不破。
