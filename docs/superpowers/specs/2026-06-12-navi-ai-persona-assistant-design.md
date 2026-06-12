# Navi AI 人格化站内助手 设计文档

> 状态：已与用户确认，待评审进入实现计划。
> 日期：2026-06-12

## 目标

把现有 `/navi`（Amadeus）从"单一硬编码红莉栖 + 简单 API 接入"升级为一个**人格化站内 AI 助手**，包含四块能力：

1. **个人 API 接入打磨** —— 在现有 local/openai/custom 基础上加：连接测试、「记住 API Key」开关、**流式输出（打字机）**、更清晰的错误反馈。
2. **人格系统** —— 结构化字段定义的自设 OC 编辑器 + 我预置的经典动画人格库；选中的人格驱动 system prompt、开场白、头像、默认表情。
3. **站内助手** —— AI 通过**指令协议**表达意图（跳转/搜索），前端解析后执行（goto 渲染为点击按钮，search 渲染真实条目卡片）。
4. **条目个性推荐** —— AI 用所选人格的口吻 + 对话上下文推荐 Bangumi 条目；推荐结果全部来自**真实搜索**兜底，杜绝编造作品/ID。不读取用户收藏数据。

## 范围之外（YAGNI）

- 不接入用户收藏/在看数据做个性化（推荐只看人格口吻 + 对话上下文）。
- 不做原生 function-calling（个人/中转 API 兼容性差），改用自定义指令协议。
- 不做多 API 配置档案管理（单配置即可）。

---

## 架构总览

现有 `Amadeus.jsx` 已 ~460 行且持续膨胀。按"单一职责、可独立理解"拆分为聚焦模块，`Amadeus.jsx` 只做编排与 UI。

### 文件结构

**新建**

- `src/components/Amadeus/personas.js`
  预设人格库 + 自设 OC 默认结构 + `buildSystemPrompt(persona)`。
- `src/components/Amadeus/naviActions.js`
  `DIRECTIVE_GUIDE` 文本（追加进 system prompt 的指令说明）、`parseDirectives(text)`（剥离指令块、解析动作）、动作执行辅助（goto 校验、search/recommend 调 `BangumiService`）。
- `src/components/Amadeus/llmClient.js`
  `streamLLM(config, messages, { signal, onToken })` 统一 openai/custom 调用 + 流式解析 + 非流式兜底；`testConnection(config, signal)`。
- `src/utils/siteMap.js`
  从 `terminalCommands.js` 抽出的共享「页名(含别名)→路由」表 + `resolveRoute(key)`，终端与 Navi 共用一份。

**修改**

- `src/components/Amadeus/Amadeus.jsx` —— 引入人格选择器、OC 编辑器、Key「记住我」、渲染动作卡片/按钮、改用 `streamLLM`。
- `src/components/Amadeus/Amadeus.css` —— 人格卡 / OC 编辑器 / 推荐卡 / goto 按钮样式。
- `src/components/Home/terminalCommands.js` —— `PAGE_ROUTES` 改为从 `src/utils/siteMap.js` import（去重，保持终端行为不变）。

---

## 数据模型

### 人格 Persona

```js
{
  id: string,            // 预设用固定 id，OC 用 'oc-' + 时间戳
  name: string,          // 角色名
  avatar: string,        // emoji（无图人格）；红莉栖预设特殊使用 Amadeus.webp
  tagline: string,       // 一句话简介，列表展示用
  personality: string,   // 人设 / 性格
  speechStyle: string,   // 说话风格
  catchphrases: string[],// 口头禅
  greeting: string,      // 开场白（首条 assistant 消息）
  expressionBias: string,// 默认表情 key（取自现有 EXPRESSIONS）
  isPreset: boolean,     // 预设只读；可"复制为我的 OC"后编辑
}
```

`buildSystemPrompt(persona)`：
- 把 `personality / speechStyle / catchphrases / greeting` 拼成中文角色设定段落；
- 追加 `DIRECTIVE_GUIDE`（见下）；
- 追加推荐口吻指令：「推荐作品时，用本角色口吻点评，并在回复末尾用 recommend 指令给出搜索关键词，由系统检索真实条目」。

### 预设人格库（4 个）

| id | 角色 | 头像 | 风格基调 |
|----|------|------|----------|
| `makise-kurisu` | 牧瀬紅莉栖 | Amadeus.webp | 傲娇天才物理学者（保留现有设定迁移过来） |
| `haruhi-suzumiya` | 凉宫春日 | emoji | 元气专横团长，行动派 |
| `frieren` | 芙莉莲 | emoji | 千年精灵魔法使，淡然疏离、偶尔毒舌 |
| `nagato-yuki` | 长门有希 | emoji | 寡言、信息生命体式冷静短句 |

> 现有 `SYSTEM_PROMPT`、`RESPONSES`、`classifyInput` 等红莉栖专属内容迁移/收敛进 `makise-kurisu` 预设；本地规则回复（provider=local）仅红莉栖人格保留，其余人格在 local 模式下用一句通用兜底（提示需配置 API 才能发挥人格）。

### 持久化

- `localStorage['acg_navi_personas']` —— 用户自设 OC 数组（非敏感）。
- `localStorage['acg_navi_active_persona']` —— 当前选中人格 id。
- API 配置：沿用 `acg_amadeus_llm_config`，新增 `remember` 布尔；`remember=true` 写 localStorage，否则 sessionStorage（保留 M-8「避免 Key 持久化泄露」精神，由用户显式选择）。读取时 localStorage 优先、回落 sessionStorage。

---

## 指令协议（站内助手 + 推荐）

### AI 侧（DIRECTIVE_GUIDE）

system prompt 中追加说明：需要执行站内操作或推荐时，在回复正文之后追加一个 ```navi 围栏代码块，块内每行一个 JSON 动作：

```navi
{"action":"goto","target":"news"}
{"action":"search","query":"凉宫春日"}
{"action":"recommend","query":"科幻 时间旅行","count":4}
```

- `goto.target` 取页名（支持 siteMap 中的英文/中文别名）。
- `search.query` / `recommend.query` 为 Bangumi 搜索关键词；`recommend.count` 可选，默认 4，上限 8。
- 正文用人格口吻自然表达，**不要**把作品 ID/链接写进正文（交给系统检索）。

### 前端侧（parseDirectives + 执行）

- `parseDirectives(rawText)` → `{ cleanText, actions[] }`：用正则提取 ```navi 代码块，逐行 `JSON.parse`（容错：解析失败的行忽略），从正文剥离该块。
- 干净正文照常渲染（沿用现有 `renderContent`）。
- 每条 action 渲染为独立 UI，挂在该条 assistant 消息下：
  - **goto** → 经 `siteMap.resolveRoute(target)` 校验：合法则渲染「前往 〈页名〉」按钮，点击 `navigate(route)`；非法则不渲染（静默忽略）。**不自动跳转**，避免打断用户。
  - **search / recommend** → 调 `BangumiService.searchSubjects(query, 0, count, 0)`，取 `list`，渲染可点击条目卡片（缩略图 + 中文名/原名），点击 `navigate('/info/'+typeToKey(type)+'/'+id, { state: { preview: extractPreview(item) } })`（复用 `src/utils/subjectType.js`，与 Wiki/终端一致）。搜索中显示骨架/「检索中」；失败显示「检索失败」占位，不崩溃。

> 推荐/搜索卡片的条目 ID 全部来自真实 `BangumiService` 结果，模型无法编造不存在的作品。AI 不输出指令块时即纯聊天，向后兼容。

---

## 流式输出（必做）

`streamLLM(config, messages, { signal, onToken })`：

- openai/custom 均以 `stream: true` 发起 `fetch`；
- 若响应 `Content-Type` 为 `text/event-stream`：按 SSE 逐块读取 `ReadableStream`，解析 `data:` 行的 `choices[0].delta.content`，每片增量回调 `onToken(delta)`，`data: [DONE]` 结束；
- 若响应不是事件流（部分 custom API 不支持 stream）：读取完整 JSON，一次性回调全文（**非流式兜底**）；
- 返回完整文本（供解析指令、写入消息）。

UI 侧：发送后插入一条空 assistant 占位消息，`onToken` 累加更新其 `content`（打字机效果）；流结束后对完整文本跑 `parseDirectives`，渲染动作卡片，并触发表情切换与（启用时）语音朗读。`AbortController` + 30s 超时沿用现有逻辑；流式中断（AbortError）静默处理。

---

## UI 变更

- **人格选择器**：设置面板新增「人格」区，横向卡片列表（预设 + 自设 OC），点选即切换；切换时左侧立绘区头像/角色名/默认表情随之更新，并可选地清空或保留当前对话（默认保留，仅换皮）。
- **OC 编辑器**：「+ 新建 OC」打开结构化表单（name / avatar(emoji) / tagline / personality / speechStyle / catchphrases / greeting / expressionBias）；预设人格提供「复制为我的 OC」入口。OC 可编辑/删除。
- **API 设置**：保留 provider 选择 + Key/URL/model 输入；新增「测试连接」按钮与「记住 API Key」勾选框。
- **消息区**：assistant 消息下方按需渲染 goto 按钮行 / 条目卡片网格。
- 左侧立绘区：有图人格（红莉栖）显示 webp；无图人格显示 emoji 头像占位（沿用表情色块风格）。

---

## 错误处理

- API 调用失败 → 落回本地规则回复（仅红莉栖有完整规则，其余人格给通用兜底）+ `llmError` 展示，沿用现有 catch 流程。
- 流式解析异常 → 退化为非流式整段。
- 动作执行（搜索）失败 → 对应卡片位显示「检索失败」，其余消息正常。
- 指令 JSON 解析失败 → 忽略该行，不影响正文。
- `JSON.parse(localStorage)` 异常 → 回落默认值（沿用现有 try/catch 模式）。

## 测试策略

项目无测试框架。每个实现任务以 `npx vite build` 通过为基本验收；关键交互（人格切换、OC 增删改、流式输出、goto 按钮、推荐卡片点击、记住我开关）以 `npm run dev` 手测验收，与既有 terminal 计划一致。

---

## 自检

- **范围对齐**：四块能力（API 打磨 / 人格系统 / 站内助手 / 条目推荐）均有对应模块与小节。
- **复用一致**：条目跳转复用 `subjectType.js`（与 Wiki/终端同）；路由表抽 `siteMap.js` 与终端共用；`BangumiService.searchSubjects` 签名为 `(keyword, type, limit, offset)`，返回 `{ list }`，已核对。
- **向后兼容**：无 API/无指令时退化为纯聊天 + 本地红莉栖规则，现有用户体验不破。
- **安全**：API Key 默认非持久（sessionStorage），持久化需用户显式勾选「记住我」。
