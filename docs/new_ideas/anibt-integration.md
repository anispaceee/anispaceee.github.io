# AniBT 集成方案

| 字段 | 内容 |
| --- | --- |
| 编写日期 | 2026-06-13 |
| 状态 | 待确认 |
| 数据来源 | [AniBT Wiki](https://wiki.anibt.net/docs) |

---

## 1. 概述

将 AniBT 开放 API 集成到 ANISpace，实现两个核心功能：
1. **毒电波番剧时间线**：在毒电波页面新增"放送表"Tab，照搬 AniBT 的时间线 UI
2. **视频聚合增强**：在条目详情页展示字幕组资源列表

---

## 2. AniBT API 概览

### 2.1 季度番剧 JSON

```
GET https://anibt.net/api/seasons/anime
GET https://anibt.net/api/seasons/anime?season=2026春
```

**返回数据**：
- `byWeekday`: 按星期分组的番剧列表
- 每部番剧包含：`bgmId`（Bangumi ID）、多语言标题、封面、评分、播出时间、格式
- 速率限制：30 次/60 秒/IP
- 缓存：10 分钟新鲜 + 24h SWR

### 2.2 番剧字幕组 JSON

```
GET https://anibt.net/api/anime/groups?bgmId=543360
```

**返回数据**：
- `groups`: 该番剧的所有字幕组
- 每个字幕组包含：名称、slug、最近 30 条发布
- 每条发布包含：标题、磁力链接、集数键、分辨率、语言、字幕方式
- 速率限制：30 次/60 秒/IP
- 缓存：5 分钟新鲜 + 1h SWR

### 2.3 RSS 订阅

```
GET https://anibt.net/rss/anime.xml?bgmId=xxx&groupSlug=xxx&resolution=1080p&language=CHS
```

支持按番剧+字幕组+分辨率+语言精确过滤。

---

## 3. 毒电波番剧时间线

### 3.1 UI 设计

在毒电波页面顶部新增 Tab 切换：

```
[资讯流] [放送表]    ← 新增 Tab
```

**放送表 Tab** 完整照搬 AniBT 的时间线布局：

```
┌─────────────────────────────────────────────────┐
│  周六（今天）                                      │
│                                                   │
│  00:00  [TMS Entertainment] 北斗神拳 重制          │
│         战斗·漫画改                                │
│                                                   │
│  01:23  [David Production] 炎炎消防队 三之章 P2    │
│         奇幻战斗·漫画改                            │
│                                                   │
│  08:30  [Creadom8] ねずみくんのチョッキ            │
│         2026TV·日本                               │
│                                                   │
│  ...更多番剧...                                    │
├─────────────────────────────────────────────────┤
│  周日                                             │
│  00:00  [bones film] 黄泉的使者                    │
│         奇幻战斗·漫画改                            │
│  ...                                              │
├─────────────────────────────────────────────────┤
│  周一 | 周二 | 周三 | 周四 | 周五                  │
│  ...                                              │
└─────────────────────────────────────────────────┘
```

**每个番剧条目包含**：
- 播出时间
- 制作公司
- 番剧标题（中文优先，hover 显示日文/罗马音）
- 类型标签（漫画改/轻小说改/原创等）
- 封面缩略图
- 评分（如有）
- 点击跳转到 ANISpace 条目详情页（`/info/2/{bgmId}`）

### 3.2 顶部快捷导航

```
[周日] [周一] [周二] [周三] [周四] [周五] [周六]  ← 当前日期高亮
```

点击跳转到对应星期区块。

### 3.3 季度切换

```
[2026春 ▼]  ← 下拉选择季度
```

调用 `GET /api/seasons/anime?season=2026春` 切换季度数据。

### 3.4 数据流

```
前端请求 → Cloudflare Worker 代理 → anibt.net/api/seasons/anime
                                      ↓
                              缓存到 D1/Cache API (10分钟TTL)
                                      ↓
                              返回给前端渲染
```

**为何需要 Worker 代理**：
- AniBT API 有 30 次/60 秒/IP 的速率限制
- 通过 Worker 代理可以共享缓存，减少对 AniBT 的请求
- 与现有 Bangumi 代理模式一致

### 3.5 Worker API

```
GET /api/anibt/seasons?season=2026春
```

Worker 内部逻辑：
1. 检查 Cache API 缓存（TTL 10 分钟）
2. 缓存命中 → 直接返回
3. 缓存未命中 → 请求 `https://anibt.net/api/seasons/anime?season=2026春`
4. 存入缓存 → 返回给前端

---

## 4. 视频聚合增强

### 4.1 条目详情页集成

在条目详情页（InfoDetail）新增"字幕组资源"Tab：

```
[条目介绍] [评论] [字幕组资源]    ← 新增 Tab
```

**字幕组资源 Tab** 展示：

```
┌─────────────────────────────────────────────────┐
│  北宇治字幕组                    最近更新: 2小时前  │
│  ┌───────────────────────────────────────────┐  │
│  │ [02] 上伊那牡丹 [1080p] [繁日内嵌]         │  │
│  │ 🧲 复制磁力链接                            │  │
│  ├───────────────────────────────────────────┤  │
│  │ [01] 上伊那牡丹 [1080p] [繁日内嵌]         │  │
│  │ 🧲 复制磁力链接                            │  │
│  └───────────────────────────────────────────┘  │
│                                                   │
│  kirara-fantasia                 最近更新: 1天前   │
│  ┌───────────────────────────────────────────┐  │
│  │ [02] 上伊那牡丹 [1080p] [简日外挂]         │  │
│  │ 🧲 复制磁力链接                            │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 4.2 数据流

```
条目详情页 bgmId=543360
    → GET /api/anibt/groups?bgmId=543360
    → Worker 代理 → anibt.net/api/anime/groups?bgmId=543360
    → 缓存 5 分钟 → 返回字幕组+资源列表
```

### 4.3 Worker API

```
GET /api/anibt/groups?bgmId=543360
```

---

## 5. 前端改造清单

### 5.1 NewsZone.jsx 改造

- 新增 Tab 切换状态：`activeTab = 'feed' | 'schedule'`
- 新增 `AnimeSchedule` 子组件
- Tab 切换时按需加载数据

### 5.2 新增 AnimeSchedule 组件

```
src/components/NewsZone/AnimeSchedule.jsx
src/components/NewsZone/AnimeSchedule.css
```

功能：
- 调用 `/api/anibt/seasons` 获取季度番剧数据
- 按星期分组渲染
- 顶部星期快捷导航
- 季度切换下拉
- 点击番剧跳转条目详情页

### 5.3 InfoDetail.jsx 改造

- 新增"字幕组资源"Tab
- 调用 `/api/anibt/groups?bgmId=xxx` 获取数据
- 渲染字幕组列表 + 资源列表
- 磁力链接复制功能

### 5.4 Worker 路由新增

```javascript
// anibt 代理路由
router.get('/api/anibt/seasons', handleAnibtSeasons);
router.get('/api/anibt/groups', handleAnibtGroups);
```

---

## 6. 缓存策略

| API | 缓存位置 | TTL | 说明 |
|-----|----------|-----|------|
| `/api/anibt/seasons` | Worker Cache API | 10 分钟 | 季度数据变化不频繁 |
| `/api/anibt/groups` | Worker Cache API | 5 分钟 | 字幕组发布后需较快更新 |

---

## 7. 实施步骤

### 阶段 1：Worker 代理

- [ ] 新增 `/api/anibt/seasons` 代理路由
- [ ] 新增 `/api/anibt/groups` 代理路由
- [ ] 实现 Cache API 缓存

### 阶段 2：毒电波放送表

- [ ] 新增 `AnimeSchedule` 组件
- [ ] NewsZone 添加 Tab 切换
- [ ] 按星期分组渲染 + 快捷导航
- [ ] 季度切换
- [ ] 点击跳转条目详情

### 阶段 3：条目详情页字幕组

- [ ] InfoDetail 新增"字幕组资源"Tab
- [ ] 字幕组列表 + 资源列表渲染
- [ ] 磁力链接复制

---

## 8. 注意事项

1. **AniBT 速率限制**：30 次/60 秒/IP，Worker 代理可缓解但不能完全消除
2. **CORS**：AniBT API 可能不允许浏览器直接请求，必须走 Worker 代理
3. **数据映射**：AniBT 使用 `bgmId` 与 Bangumi 主体 ID 一致，可直接关联 ANISpace 条目
4. **版权**：磁力链接仅提供复制功能，不提供直接下载，降低版权风险
5. **LLM 集成**：后续可让 Amadeus 引用 AniBT 的 `/llms-full.txt` 来回答资源相关问题
