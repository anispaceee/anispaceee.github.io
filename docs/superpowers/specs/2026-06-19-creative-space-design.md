# ANISpace 创作空间（Creative Space）— 设计文档

> 版本：v1.0 | 日期：2026-06-19 | 状态：待确认

---

## 一、项目概述

为 ANISpace 个人主页添加一个类似 Notion 的私人创作空间，让用户整理自己对作品的感悟。

### 核心目标
1. **私人化**：仅自己可见，他人无法访问
2. **Notion 式块编辑**：支持文本/标题/待办/引用/图片/条目关联等多类型块
3. **条目关联**：一条笔记可关联多个条目（动画/游戏/小说等）
4. **短评整合**：自动聚合用户在详情页写的短评（ratings.content + subject_comments）
5. **Navi AI 双模式**：
   - 嵌入式全局对话（带笔记上下文）
   - 单条笔记快捷提问（"我当时看这部作品时的感受？"）
6. **感悟归档**：按条目/时间线查看历史感悟

### 非目标
- 不做公开分享（私人空间）
- 不做双向链接（[[条目名]] 自动关联）—— 属于方案B，暂不实现
- 不做跨笔记全文检索 —— 属于方案B，暂不实现

---

## 二、架构总览

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (React)                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │           UserProfilePage (新增"创作空间"Tab)      │   │
│  │  ┌────────────────┐  ┌────────────────────────┐  │   │
│  │  │ CreativeSpace  │  │ NotionBlockEditor      │  │   │
│  │  │ (笔记列表+时间线)│  │ (块编辑器)              │  │   │
│  │  └───────┬────────┘  └───────────┬────────────┘  │   │
│  │          │                       │               │   │
│  │  ┌───────┴───────────────────────┴────────────┐  │   │
│  │  │      NaviChatPanel (嵌入式对话面板)          │  │   │
│  │  │  - 全局对话（带当前笔记上下文）               │  │   │
│  │  │  - 按条触发提问（"问Navi"快捷按钮）           │  │   │
│  │  └─────────────────────┬──────────────────────┘  │   │
│  └────────────────────────┼──────────────────────────┘   │
│                           │                              │
│  ┌────────────────────────┴──────────────────────────┐   │
│  │          api.js (CreativeSpaceService)             │   │
│  └────────────────────────┬──────────────────────────┘   │
└───────────────────────────┼──────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────┐
│              Cloudflare Worker                           │
│  ┌────────────┐ ┌─────────────┐ ┌────────────────────┐  │
│  │/api/       │ │/api/        │ │/api/llm/chat       │  │
│  │creative-   │ │creative-    │ │/completions        │  │
│  │notes       │ │notes/:id    │ │(复用现有Navi API)   │  │
│  │(CRUD)      │ │(详情/删除)   │ │                    │  │
│  └─────┬──────┘ └──────┬──────┘ └─────────┬──────────┘  │
│        │               │                  │              │
│  ┌─────┴───────────────┴──────────────────┴──────────┐  │
│  │              D1 Database                           │  │
│  │  creative_notes | ratings | subject_comments       │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 三、数据库设计

### 3.1 `creative_notes` — 创作空间笔记主表

```sql
CREATE TABLE IF NOT EXISTS creative_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT DEFAULT '',                    -- 笔记标题
  blocks TEXT DEFAULT '[]',                 -- JSON: Notion式块数组
  linked_subject_ids TEXT DEFAULT '[]',     -- JSON: 关联条目ID数组 [123, 456, ...]
  linked_subjects_snapshot TEXT DEFAULT '[]', -- JSON: 关联条目快照 [{id, name, image, type}, ...]（避免频繁查询）
  tags TEXT DEFAULT '[]',                   -- JSON: 标签数组 ["四月新番", "感想"]
  is_pinned INTEGER DEFAULT 0,              -- 是否置顶
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_creative_notes_user ON creative_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_creative_notes_updated ON creative_notes(user_id, updated_at DESC);
```

### 3.2 块结构定义（blocks JSON）

```json
[
  {
    "id": "block-uuid-1",
    "type": "text",           // text | h1 | h2 | h3 | todo | quote | image | subject-link | divider
    "content": "块文本内容",   // text/h1/h2/h3/todo/quote 使用
    "checked": false,         // todo 块使用
    "src": "https://...",     // image 块使用
    "subject_id": 123,        // subject-link 块使用
    "subject_name": "进击的巨人", // subject-link 块显示
    "subject_image": "https://..."
  }
]
```

### 3.3 现有表复用（不修改结构）

- **`ratings` 表**：读取 `content` 字段（用户评分时的短评）
- **`subject_comments` 表**：读取 `content` 字段（用户在详情页的评论）

---

## 四、后端 API 设计

### 4.1 笔记 CRUD

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/api/creative-notes` | 获取当前用户所有笔记（按 updated_at DESC） | JWT 必填 |
| GET | `/api/creative-notes/:id` | 获取单条笔记详情 | JWT 必填 + 所有权校验 |
| POST | `/api/creative-notes` | 新建笔记 | JWT 必填 |
| PUT | `/api/creative-notes/:id` | 更新笔记（title/blocks/linked_subject_ids/tags/is_pinned） | JWT 必填 + 所有权校验 |
| DELETE | `/api/creative-notes/:id` | 删除笔记 | JWT 必填 + 所有权校验 |

**所有权校验**：所有接口先校验 `note.user_id === currentUserId`，不匹配返回 403。

### 4.2 短评整合视图

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/creative-notes/timeline` | 获取"感悟时间线"：聚合 ratings.content + subject_comments，按时间倒序 |

**响应示例**：
```json
{
  "timeline": [
    {
      "type": "rating",
      "id": 123,
      "subject_id": 456,
      "subject_name": "进击的巨人",
      "subject_image": "https://...",
      "subject_type": 2,
      "score": 9,
      "content": "神作！",
      "created_at": "2026-06-19T..."
    },
    {
      "type": "comment",
      "id": 789,
      "subject_id": 456,
      "subject_name": "进击的巨人",
      "subject_image": "https://...",
      "content": "第三季封神",
      "created_at": "2026-06-18T..."
    }
  ]
}
```

### 4.3 Navi AI 查询（复用现有接口）

**不新增后端接口**，直接复用 `/api/llm/chat/completions`。

前端在调用时，将笔记内容 + 关联条目短评组装到 `messages` 的 system prompt 中：

```
你是用户的创作助手 Navi。以下是用户的笔记内容和关联条目的历史短评，请基于这些上下文回答用户的问题。

【当前笔记】
标题：四月新番整体感受
内容：
## 整体评价
今年四月新番整体质量不错...
- [ ] 待补：葬送的芙莉莲
- [x] 已看：咒术回战第二季

【关联条目历史短评】
1. 咒术回战第二季（评分：8）："战斗作画顶级"
2. 葬送的芙莉莲（评分：9）："治愈系神作"

【用户问题】
我当时看咒术回战时的感受是什么？
```

---

## 五、前端组件设计

### 5.1 组件树

```
UserProfilePage.jsx
└── CreativeSpace.jsx (新增，创作空间主容器)
    ├── CreativeNoteList.jsx (新增，笔记列表)
    │   └── CreativeNoteCard.jsx (新增，笔记卡片)
    ├── NotionBlockEditor.jsx (新增，块编辑器)
    │   └── BlockRenderer.jsx (新增，单块渲染)
    ├── NaviChatPanel.jsx (新增，嵌入式Navi对话)
    └── InsightTimeline.jsx (新增，感悟时间线)
```

### 5.2 `CreativeSpace.jsx` — 主容器

**职责**：
- 管理视图模式：`list`（笔记列表）| `editor`（编辑器）| `timeline`（时间线）
- 管理当前选中笔记
- 渲染顶部工具栏（新建笔记 / 查看时间线 / 切换Navi对话）

**布局**：
```
┌─────────────────────────────────────────────┐
│ [+ 新建笔记]  [感悟时间线]  [Navi对话开关]    │
├─────────────────────────────────────────────┤
│                                             │
│  视图区域（list / editor / timeline）        │
│                                             │
├─────────────────────────────────────────────┤
│  NaviChatPanel（可折叠，默认收起）            │
└─────────────────────────────────────────────┘
```

### 5.3 `NotionBlockEditor.jsx` — 块编辑器

**支持的块类型**：
| 类型 | 说明 | 快捷输入 |
|------|------|----------|
| `text` | 普通文本 | 直接输入 |
| `h1` | 一级标题 | `# ` |
| `h2` | 二级标题 | `## ` |
| `h3` | 三级标题 | `### ` |
| `todo` | 待办事项 | `[] ` |
| `quote` | 引用 | `> ` |
| `image` | 图片 | `/img` 触发上传 |
| `subject-link` | 条目关联 | `/subject` 触发搜索 |
| `divider` | 分割线 | `---` |

**交互**：
- Enter 创建新块
- Backspace 在空块上合并到上一块
- 拖拽排序（使用原生 HTML5 drag API，不引入新依赖）
- 块左侧 hover 显示 `+`（添加）和 `⋮`（菜单：删除/复制/转换类型）

**自动保存**：debounce 1.5s 后调用 PUT 接口，顶部显示"已保存"/"保存中"状态。

### 5.4 `NaviChatPanel.jsx` — 嵌入式 Navi 对话

**两种触发模式**：
1. **全局对话**：用户在面板直接输入问题，系统自动注入当前打开笔记的上下文
2. **按条触发**：笔记卡片/编辑器顶部有"问Navi"按钮，点击后预填问题模板：
   - "我当时看这部作品时的感受？"
   - "帮我总结这篇笔记的核心观点"
   - "基于这篇笔记推荐我相关作品"

**实现**：复用 `llmClient.js` 的 `streamLLM`，流式渲染回复。

### 5.5 `InsightTimeline.jsx` — 感悟时间线

**数据来源**：`/api/creative-notes/timeline`（聚合 ratings + subject_comments）

**展示**：
- 按时间倒序的时间轴
- 每条显示：条目封面 + 名称 + 类型 + 评分（如有）+ 短评内容 + 时间
- 点击条目可跳转到条目详情页
- 支持按条目类型筛选（动画/游戏/小说等）

---

## 六、UserProfilePage 集成

### 6.1 新增标签页

在现有标签页后新增"创作空间"Tab，仅 `isSelf` 时显示：

```jsx
{isSelf && (
  <button className={`user-profile-tab ${activeTab === 'creative' ? 'active' : ''}`} onClick={() => setActiveTab('creative')}>
    <Feather size={14} /> 创作
  </button>
)}
```

### 6.2 标签页内容

```jsx
{activeTab === 'creative' && (
  <CreativeSpace userId={userId} isSelf={isSelf} />
)}
```

---

## 七、安全与隐私

1. **私人化**：所有 `/api/creative-notes/*` 接口强制 JWT 鉴权 + 所有权校验
2. **他人不可见**：`isSelf === false` 时不渲染"创作"Tab
3. **Navi 上下文隔离**：调用 LLM 时只注入当前用户自己的笔记和短评
4. **SSRF 防护**：复用现有 `/api/llm/chat/completions` 的域名白名单

---

## 八、实现步骤（高层）

1. **数据库**：在 `schema.sql` 添加 `creative_notes` 表 + 索引
2. **后端 API**：在 `oauth-proxy.js` 添加笔记 CRUD + timeline 接口
3. **前端服务层**：在 `api.js` 添加 `CreativeSpaceService`
4. **块编辑器**：新建 `NotionBlockEditor.jsx` + `BlockRenderer.jsx`
5. **主容器**：新建 `CreativeSpace.jsx` + `CreativeNoteList.jsx` + `CreativeNoteCard.jsx`
6. **Navi 集成**：新建 `NaviChatPanel.jsx`，复用 `streamLLM`
7. **时间线**：新建 `InsightTimeline.jsx`
8. **集成到 UserProfilePage**：添加"创作"Tab
9. **样式**：新建 `CreativeSpace.css`，复用现有萌系配色

---

## 九、开放问题

1. **图片上传**：笔记中的图片块是否复用 Musashi 的图片上传接口？还是用 base64 内联？
   - 建议：复用 Musashi 图片上传接口（已有 R2 存储）
2. **条目搜索**：`subject-link` 块触发条目搜索时，是否复用现有 Bangumi 搜索接口？
   - 建议：复用 `/api/bangumi-search` 接口
