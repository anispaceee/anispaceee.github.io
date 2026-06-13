# Live2D × Navi 轻量版集成设计

> 日期：2026-06-13
> 范围：轻量版 — 气泡回复，不做表情/动作联动

## 1. 目标

在 Live2D 看板娘旁边添加聊天入口，用户可以直接与 Navi AI 对话，回复通过 Live2D 气泡展示。完整对话记录可在 Navi AppWindow 中查看。

## 2. 交互流程

1. 用户看到 Live2D 看板娘，工具栏新增「聊天」按钮（💬）
2. 点击按钮 → Live2D 下方展开输入框
3. 用户输入文字，按 Enter 或点击发送
4. 输入框收起，气泡显示"思考中..."
5. Navi 回复后，气泡展示回复文本（支持长文本滚动）
6. 气泡底部显示「查看完整记录 →」链接
7. 点击链接 → 打开 Navi AppWindow（`openWindow('amadeus')`）

## 3. UI 布局

```
┌─────────────────────────┐
│     💬 气泡（回复文本）     │  ← 增强版 live2d-tip
│  ─────────────────────  │
│  查看完整记录 →           │  ← 点击打开 Navi 窗口
└─────────────────────────┘
         ▼
┌──┐ ┌──────────────┐
│💬│ │  Live2D 模型   │  ← 工具栏新增聊天按钮
│🗣│ │              │
│👤│ │              │
│👗│ │              │
│📷│ │              │
│📋│ │              │
│✕│ │              │
└──┘ └──────────────┘
┌──────────────────────┐
│ 输入消息...      [➤] │  ← 展开的输入框（发送后收起）
└──────────────────────┘
```

## 4. 修改文件清单

| 文件 | 修改内容 |
|---|---|
| `Live2DWidget.jsx` | 新增聊天按钮、输入框状态、调用 Navi 逻辑、增强气泡 |
| `Live2DWidget.css` | 新增输入框样式、增强气泡样式 |

**不修改的文件**：
- `Amadeus.jsx` — 仅作为"查看完整记录"的目标窗口
- `llmClient.js` / `personas.js` / `naviActions.js` — 直接 import

## 5. 状态设计

Live2DWidget 新增状态：

```js
const [chatOpen, setChatOpen] = useState(false);      // 输入框是否展开
const [chatInput, setChatInput] = useState('');        // 输入内容
const [chatLoading, setChatLoading] = useState(false); // 是否正在等待回复

// Navi 配置（复用 Amadeus 的存储 key）
const [llmConfig] = useState(() => { /* 从 sessionStorage/localStorage 读取 */ });
const [activePersonaId] = useState(() => StorageService.get(ACTIVE_PERSONA_KEY, 'makise-kurisu'));
```

## 6. 核心逻辑

### 6.1 发送消息

```js
const sendChatMessage = async (text) => {
  setChatOpen(false);
  setChatLoading(true);
  showTip('思考中...', 30000);

  try {
    let reply;
    if (llmConfig.provider !== 'local') {
      reply = await streamLLM(llmConfig, systemPrompt, messages, { signal });
    } else {
      const result = generateLocalResponse(text);
      reply = result.text;
    }
    const { cleanText } = parseDirectives(reply);
    showTip(cleanText, 30000);
    syncToNaviHistory(text, cleanText); // 同步到 Navi 对话历史
  } catch {
    showTip('回复失败，请打开 Navi 查看详情', 5000);
  } finally {
    setChatLoading(false);
  }
};
```

### 6.2 数据同步

Live2D 聊天的消息需同步到 Navi 的 `CHAT_HISTORY_KEY`，用户打开 Navi 窗口时自然看到完整记录：

```js
function syncToNaviHistory(userText, aiReply) {
  const history = StorageService.get(CHAT_HISTORY_KEY, []);
  const updated = [
    ...history,
    { id: crypto.randomUUID(), role: 'user', content: userText, timestamp: new Date().toISOString() },
    { id: crypto.randomUUID(), role: 'assistant', content: aiReply, expression: 'normal', timestamp: new Date().toISOString() },
  ];
  StorageService.set(CHAT_HISTORY_KEY, updated.slice(-MAX_HISTORY));
}
```

### 6.3 打开 Navi 窗口

气泡底部「查看完整记录 →」链接调用 WindowManager 的 `openWindow('amadeus')`。

## 7. 气泡增强

当前 `live2d-tip` 限制：
- `max-width: 260px` — 太窄
- 无滚动 — 长文本溢出
- 无交互元素

增强：
- `max-width: 320px`
- `max-height: 200px` + `overflow-y: auto`
- 底部追加「查看完整记录 →」链接
- `white-space: pre-wrap` 保持格式
- 区分"系统提示"和"AI 回复"两种气泡样式（回复气泡有特殊样式标识）

## 8. 边界（不做的事）

- ❌ Live2D 表情/动作联动（需引擎迁移，留给完整版）
- ❌ 气泡中展示 search/recommend 动作卡片（仅文本，完整交互在 Navi 窗口）
- ❌ 移动端适配（Live2D 移动端已隐藏）
- ❌ Live2D 旁展示对话历史（仅最新一条回复）
