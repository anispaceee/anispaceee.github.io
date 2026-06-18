# Navi Agent Runtime 设计文档

> 日期：2026-06-15
> 状态：设计阶段

## 一、概述

将 Navi 从被动式聊天机器人升级为主动式站内 Agent，借鉴 Hermes Agent 的 Tools + Skills + Memory + Cron 四层架构，实现：

1. **Tools 工具注册表** — LLM 可调用站内 API 执行真实操作
2. **Agent Loop** — 多轮工具调用循环，直到任务完成
3. **Memory 记忆系统** — 短期对话 + 长期记忆 + 对话摘要
4. **Cron 定时调度** — 主动推送通知（新番提醒、每日问候）
5. **Skills 技能系统** — 可复用交互流程（竞猜、占卜等）
6. **人格养成** — 好感度系统，不同等级解锁不同内容

## 二、架构

### 2.1 Agent Loop

```
用户消息
  ↓
组装 System Prompt + Tools Schema + Memory + SiteData
  ↓
LLM 决策（直接回复 or 调用工具）
  ├─ 直接回复 → 输出给用户 → 结束
  └─ 调用工具 → 执行工具 → 结果注入上下文 → 回到 LLM 决策
                                          ↑ 最多 5 轮
```

**兼容策略**：
- 高级模型（GPT-4o、Claude 等）：使用原生 tool calling（`tools` 参数 + `tool_calls` 响应）
- 基础模型（GLM-4-Flash 等）：使用 ```navi``` 块指令（当前方式），单轮输出所有工具调用
- 两种方式共享同一套工具注册表和执行器，仅调用方式不同

### 2.2 文件结构

```
src/components/Amadeus/
├── Amadeus.jsx          # 主组件（UI + 状态管理）
├── Amadeus.css          # 样式
├── personas.js          # 人格定义 + system prompt 构建
├── llmClient.js         # LLM 请求客户端
├── naviActions.js       # 指令解析 + 工具执行（重构为工具注册表）
├── naviMemory.js        # 记忆系统（短期 + 长期 + 摘要）
├── naviCron.js          # 定时调度
├── naviSkills.js        # 技能系统
└── naviAffinity.js      # 好感度系统
```

## 三、Tools 工具注册表

### 3.1 工具分类

#### 导航类（已有）
| 工具 | 参数 | 说明 |
|------|------|------|
| `goto` | `target: string` | 跳转页面（home/forum/news/wiki/musashi/mail/friends/world/music/me） |

#### 搜索推荐类（已有）
| 工具 | 参数 | 说明 |
|------|------|------|
| `search` | `query: string, count?: number` | 搜索条目 |
| `recommend` | `query: string, count?: number` | 推荐条目 |

#### 信息获取类（新增）
| 工具 | 参数 | 说明 |
|------|------|------|
| `get_schedule` | `date?: string` | 获取放送表（默认今天） |
| `get_subject` | `id: number` | 获取条目详情 |
| `get_collections` | `status?: string` | 获取用户收藏列表 |
| `check_notify` | 无 | 查看未读通知 |

#### 站内操作类（新增）
| 工具 | 参数 | 说明 |
|------|------|------|
| `collect` | `subject_id: number, status: string` | 收藏/取消收藏条目 |
| `comment` | `subject_id: number, content: string` | 发表条目评论 |
| `play_music` | `query: string` | 搜索并播放音乐 |
| `post_forum` | `title: string, content: string, category?: string` | 在放課後发帖 |

#### 记忆类（新增）
| 工具 | 参数 | 说明 |
|------|------|------|
| `remember` | `key: string, value: string` | 保存到长期记忆 |
| `recall` | `query: string` | 检索长期记忆 |

#### 人格养成类（新增）
| 工具 | 参数 | 说明 |
|------|------|------|
| `check_affinity` | 无 | 查看当前好感度 |
| `gift` | `item: string` | 赠送礼物（虚拟物品，增加好感度） |

### 3.2 工具注册表实现

```js
// naviActions.js 重构
const toolRegistry = new Map();

export function registerTool(name, schema, handler) {
  toolRegistry.set(name, { schema, handler });
}

export function getToolSchemas() {
  return Array.from(toolRegistry.entries()).map(([name, { schema }]) => ({
    name,
    ...schema,
  }));
}

export async function executeTool(name, params, context) {
  const tool = toolRegistry.get(name);
  if (!tool) return { error: `未知工具: ${name}` };
  try {
    return await tool.handler(params, context);
  } catch (err) {
    return { error: err.message };
  }
}
```

每个工具独立注册，schema 描述供 LLM 理解参数格式，handler 执行实际操作。

### 3.3 Agent Loop 实现

```js
// Amadeus.jsx 中 sendMessage 的 Agent 模式逻辑
async function agentLoop(llmConfig, systemPrompt, messages, context) {
  const MAX_ITERATIONS = 5;
  let iteration = 0;
  let currentMessages = [...messages];

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    const response = await streamLLM(llmConfig, systemPrompt, currentMessages, { ... });

    // 检查是否有工具调用
    const { cleanText, actions, toolCalls } = parseResponse(response);

    if (actions.length === 0 && !toolCalls) {
      // 无工具调用，直接返回
      return { text: cleanText, actions: [] };
    }

    // 执行工具
    const toolResults = [];
    for (const action of actions) {
      const result = await executeTool(action.action, action, context);
      toolResults.push({ action, result });
    }

    // 将工具结果注入上下文，继续循环
    currentMessages.push(
      { role: 'assistant', content: response },
      { role: 'user', content: `工具执行结果：\n${JSON.stringify(toolResults, null, 2)}` }
    );
  }

  return { text: '任务步骤过多，已暂停。', actions: [] };
}
```

## 四、Memory 记忆系统

### 4.1 三层记忆

| 层 | 存储 | 容量 | 生命周期 | 注入方式 |
|---|---|---|---|---|
| 短期记忆 | localStorage `acg_amadeus_history` | 200 条消息 | 清除记录时删除 | 对话历史数组 |
| 长期记忆 | localStorage `acg_navi_memory` | 100 条 | 永久（LRU 淘汰） | system prompt `【长期记忆】` 段 |
| 对话摘要 | localStorage `acg_navi_summary` | 1 条 | 下次摘要时覆盖 | system prompt `【对话摘要】` 段 |

### 4.2 长期记忆格式

```json
[
  { "key": "喜欢的类型", "value": "科幻、时间旅行", "timestamp": "2026-06-15T10:00:00Z", "accessCount": 5 },
  { "key": "不喜欢的", "value": "后宫番", "timestamp": "2026-06-15T11:00:00Z", "accessCount": 2 }
]
```

- LLM 通过 `remember` 工具写入
- LLM 通过 `recall` 工具读取（模糊匹配 key）
- 超过 100 条时，按 accessCount + timestamp LRU 淘汰
- 每次启动 Navi 时，自动将前 20 条注入 system prompt

### 4.3 对话摘要

- 当对话历史 > 50 条时，触发压缩
- 取前 30 条，用 LLM 生成 200 字以内的摘要
- 摘要替换原 30 条消息，减少 token 消耗
- 压缩在后台异步执行，不阻塞用户操作

## 五、Cron 定时调度

### 5.1 实现方式

前端 `setInterval`（每分钟检查）+ `Notification API`（浏览器通知）

### 5.2 预设定时任务

| 任务 | 触发时间 | 条件 | 行为 |
|------|----------|------|------|
| 新番提醒 | 每天 10:00 | 用户有"在看"收藏且今日有更新 | 推送通知："你追的《XXX》今天更新了！" |
| 每日问候 | 用户首次打开 Navi 时 | 当天尚未问候 | 根据时间段+用户偏好+今日放送生成个性化问候 |
| 收藏更新 | 每小时 | 用户"在看"的番剧有新剧集 | 推送通知 |

### 5.3 用户配置

设置面板新增"定时任务"区域：
- 每项任务独立开关
- 新番提醒可配置提醒时间
- 每日问候可配置是否自动弹出

## 六、Skills 技能系统

### 6.1 技能定义格式

```js
// skills/guessAnime.js
export default {
  id: 'guess_anime',
  name: '番剧竞猜',
  description: 'Navi 描述番剧线索，用户猜作品名',
  trigger: ['竞猜', '猜番', '猜动画', '猜猜看'],
  steps: [
    { role: 'navi', prompt: '从用户收藏或热门番剧中选一部，给出3条线索，不要说出名字' },
    { role: 'user', expect: '猜测' },
    { role: 'navi', prompt: '判断用户猜测是否正确。正确则祝贺，错误则再给一条线索' },
    { role: 'user', expect: '猜测' },
    { role: 'navi', prompt: '揭晓答案，用角色口吻点评这部作品' },
  ],
};
```

### 6.2 技能注册

```js
// naviSkills.js
const skills = new Map();

export function registerSkill(skill) {
  skills.set(skill.id, skill);
}

export function findSkill(input) {
  for (const skill of skills.values()) {
    if (skill.trigger.some(t => input.includes(t))) return skill;
  }
  return null;
}
```

### 6.3 首批技能

| 技能 | 触发词 | 流程 |
|------|--------|------|
| 番剧竞猜 | 竞猜/猜番 | Navi 给线索 → 用户猜 → 揭晓 |
| 运势占卜 | 占卜/运势/抽签 | 分析收藏数据 → 生成运势 → 推荐今日必看 |
| 角色问答 | 角色扮演/扮演 | Navi 扮演指定角色 → 用户提问 → 角色口吻回答 |
| CP 配对 | CP/配对/谁最配 | 分析收藏标签 → 生成 CP 报告 |

## 七、人格养成 — 好感度系统

### 7.1 好感度计算

```
好感度 = 基础分 + 互动加分 - 衰减分
```

- **基础分**：0 分起
- **互动加分**：
  - 每次对话 +1
  - 使用 Navi 推荐并收藏 +3
  - 赠送虚拟礼物 +5~10
  - 连续多天使用 +2/天（连续奖励）
- **衰减分**：超过 3 天未互动，每天 -1（最低 0）

### 7.2 好感度等级

| 等级 | 分数 | 效果 |
|------|------|------|
| 陌生 | 0-20 | 标准对话，礼貌但有距离 |
| 熟悉 | 21-50 | 开始使用昵称，偶尔主动搭话 |
| 亲密 | 51-80 | 专属台词，主动推荐，记住偏好 |
| 羁绊 | 81-100 | 深度对话，解锁隐藏技能，特殊问候 |

### 7.3 存储

```json
// localStorage: acg_navi_affinity_{persona_id}
{
  "score": 45,
  "level": "familiar",
  "lastInteraction": "2026-06-15T10:00:00Z",
  "streakDays": 3,
  "totalConversations": 28,
  "giftsReceived": ["Dr Pepper", "布丁"]
}
```

### 7.4 好感度注入

system prompt 中追加好感度信息：

```
【好感度】当前与用户的好感度：45（熟悉）。连续互动 3 天。已收到礼物：Dr Pepper、布丁。
根据好感度等级调整对话风格：熟悉等级下，可以使用昵称称呼用户，偶尔主动搭话。
```

## 八、System Prompt 完整结构

```
1. 角色设定（人格名 + 人设 + 说话风格 + 口头禅）
2. 推荐规则
3. 站内动作指令说明（DIRECTIVE_GUIDE）
4. 网站功能介绍（SITE_GUIDE）
5. 用户画像（偏好标签 + 类型偏好 + 评分风格）
6. 站内实时数据（今日放送 + 热门 + 推荐）
7. 长期记忆（前 20 条）
8. 对话摘要（如有）
9. 好感度信息
10. 技能提示（如有匹配的技能触发词）
```

## 九、设置面板新增项

| 设置项 | 类型 | 说明 |
|--------|------|------|
| Agent 模式 | 开关 | 启用多轮工具调用（默认开） |
| 最大循环轮数 | 数字 | Agent Loop 最大迭代次数（默认 5） |
| 长期记忆 | 开关 | 启用 remember/recall 工具（默认开） |
| 新番提醒 | 开关 | 每日推送收藏番剧更新（默认开） |
| 每日问候 | 开关 | 首次打开自动问候（默认开） |
| 好感度系统 | 开关 | 启用人格养成（默认开） |

## 十、实现优先级

### P0 — 核心框架
1. 工具注册表重构（naviActions.js）
2. Agent Loop 实现（Amadeus.jsx sendMessage 改造）
3. 新增信息获取工具（get_schedule, get_subject, get_collections, check_notify）

### P1 — 记忆 + 操作
4. 长期记忆系统（naviMemory.js）
5. 对话摘要压缩
6. 新增站内操作工具（collect, comment, play_music, post_forum）

### P2 — 主动交互
7. Cron 定时调度（naviCron.js）
8. 新番提醒 + 每日问候

### P3 — 娱乐 + 养成
9. Skills 技能系统（naviSkills.js）
10. 首批技能（番剧竞猜、运势占卜）
11. 好感度系统（naviAffinity.js）
