# Hikarinagi API 集成设计文档

> 日期：2026-06-15
> 状态：待确认

## 概述

将 [Hikarinagi（光凪）](https://www.hikarinagi.org/api/v2/docs) 的 Galgame 和轻小说数据集成到 ANISpace，采用混合方案：独立分类入口 + Bangumi ID 匹配时自动合并数据。

## 数据源分析

### Hikarinagi API（v2.0.0-alpha）

专注 Galgame 和轻小说的社区平台，提供完整的游戏/小说数据库、评分、下载信息等。

**公开 API 清单**（无需认证）：

| 端点 | 用途 | ANISpace 用途 |
|------|------|---------------|
| `GET /galgame/list` | Galgame 分页列表 | 禁書目錄 Galgame 分类 |
| `GET /galgame/{id}` | Galgame 详情 | 详情页数据源 |
| `GET /galgame/random` | 随机 Galgame | 首页推荐 |
| `GET /galgame/monthly-releases` | 月度发售 | 放送表 Galgame 板块 |
| `GET /galgame/bangumi/{id}` | Bangumi ID 关联 | 条目合并关键接口 |
| `GET /galgame/{id}/download-info` | 下载信息 | 详情页下载 Tab |
| `GET /galgame/{id}/links` | 游戏链接 | 详情页外部链接 |
| `GET /galgame/{id}/related` | 相关游戏 | 详情页推荐 |
| `GET /lightnovel/list` | 轻小说分页列表 | 禁書目錄轻小说分类 |
| `GET /lightnovel/{id}` | 轻小说详情 | 详情页数据源 |
| `GET /lightnovel/popular` | 热门轻小说 | 首页推荐 |
| `GET /lightnovel/recommend` | 推荐轻小说 | 首页推荐 |
| `GET /lightnovel/recent` | 最近更新 | 首页推荐 |
| `GET /lightnovel/random` | 随机轻小说 | 首页推荐 |
| `GET /lightnovel/bangumi/{id}` | Bangumi ID 关联 | 条目合并关键接口 |
| `GET /page-data/hot-comments` | 热门评论 | 首页侧边栏 |
| `GET /page-data/recommend-galgames` | 推荐 Gal | 首页侧边栏 |
| `GET /page-data/recent-rates` | 最近评分 | 首页侧边栏 |
| `GET /page-data/hot-reviews` | 热门点评 | 首页侧边栏 |
| `GET /page-data/recommend-producers` | 推荐制作组 | 详情页制作组 |
| `GET /search` | 搜索 | 全站搜索 |
| `GET /search/trending` | 热搜 | 搜索页热搜 |
| `GET /community/home-data` | 社区首页 | 放課後数据补充 |
| `GET /community/hot-topics` | 热门话题 | 放課後数据补充 |
| `GET /community/hot-sections` | 热门版块 | 放課後数据补充 |
| `GET /character/{id}` | 角色信息 | 详情页角色 |
| `GET /person/{id}` | 人物信息 | 详情页制作人员 |
| `GET /producer/{id}` | 制作组信息 | 详情页制作组 |
| `GET /tag/{id}` | 标签信息 | 标签页 |

**需要认证的 API**（后续集成）：
- 用户系统（登录/注册/签到/关注/收藏）
- 评分/评论/互动
- 轻小说在线阅读器
- 私信/系统消息

## 集成方案：混合方案

### 1. 禁書目錄扩展

**现状**：禁書目錄有动画/漫画/游戏等分类 Tab，数据来自 Bangumi API。

**新增**：
- 分类 Tab 新增 **Galgame** 和 **轻小说** 两个选项
- 选择 Galgame/LN 时，搜索和列表调用 Hikarinagi API
- 列表卡片样式与现有一致：封面、标题、评分、标签
- 支持分页、排序（热门/最新/推荐）

### 2. 条目详情页合并

**核心逻辑**：
```
打开详情页
  ├─ 来自 Bangumi 搜索 → 加载 Bangumi 数据
  │   └─ 用 Bangumi ID 调用 /galgame/bangumi/{id} 或 /lightnovel/bangumi/{id}
  │       ├─ 有匹配 → 详情页新增 "下载信息" Tab（来自 Hikarinagi）
  │       └─ 无匹配 → 保持现有详情页不变
  └─ 来自 Hikarinagi 搜索 → 渲染简化版详情页
      └─ 有 Bangumi ID → 同时加载 Bangumi 数据合并显示
```

**简化版详情页**（纯 Hikarinagi 数据）包含：
- 封面图、标题、别名
- 简介
- 标签
- Hikarinagi 评分
- 下载信息/外部链接
- 相关推荐

### 3. 首页数据丰富

侧边栏新增模块：
- **推荐 Gal**（`/page-data/recommend-galgames`）
- **热门评论**（`/page-data/hot-comments`）

### 4. 搜索集成

- GlobalSearch 新增 Galgame/LN 搜索结果分类
- 搜索建议新增 Hikarinagi 来源
- 热搜词增加 `/search/trending`

### 5. 放送表扩展

- 放送表新增 Galgame 月度发售板块（`/galgame/monthly-releases`）

## 技术架构

```
前端组件
  └─ HikarinagiService.js（API 封装）
      └─ Cloudflare Worker（/api/hikarinagi/* 代理）
          └─ https://www.hikarinagi.org/api/v2/*
```

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/services/HikarinagiService.js` | Hikarinagi API 封装 |
| `src/components/Wiki/GalgameList.jsx` | Galgame 列表组件 |
| `src/components/Wiki/LightNovelList.jsx` | 轻小说列表组件 |
| `src/components/Info/HikarinagiDetail.jsx` | Hikarinagi 简化详情组件 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/components/Wiki/Wiki.jsx` | 新增 Galgame/LN 分类 Tab |
| `src/components/Info/InfoDetail.jsx` | 新增"下载信息"Tab + Bangumi ID 合并逻辑 |
| `src/components/Common/GlobalSearch.jsx` | 新增 Galgame/LN 搜索分类 |
| `src/pages/HomePage.jsx` | 侧边栏新增推荐 Gal/热门评论 |
| Worker `worker.js` | 新增 `/api/hikarinagi/*` 代理路由 |

### Worker 代理路由

```
/api/hikarinagi/galgame/list     → GET /galgame/list
/api/hikarinagi/galgame/{id}     → GET /galgame/{id}
/api/hikarinagi/galgame/random   → GET /galgame/random
/api/hikarinagi/galgame/monthly  → GET /galgame/monthly-releases
/api/hikarinagi/galgame/bangumi/{id} → GET /galgame/bangumi/{id}
/api/hikarinagi/galgame/{id}/download → GET /galgame/{id}/download-info
/api/hikarinagi/galgame/{id}/links    → GET /galgame/{id}/links
/api/hikarinagi/galgame/{id}/related  → GET /galgame/{id}/related
/api/hikarinagi/lightnovel/list  → GET /lightnovel/list
/api/hikarinagi/lightnovel/{id}  → GET /lightnovel/{id}
/api/hikarinagi/lightnovel/popular → GET /lightnovel/popular
/api/hikarinagi/lightnovel/recommend → GET /lightnovel/recommend
/api/hikarinagi/lightnovel/recent → GET /lightnovel/recent
/api/hikarinagi/lightnovel/random → GET /lightnovel/random
/api/hikarinagi/lightnovel/bangumi/{id} → GET /lightnovel/bangumi/{id}
/api/hikarinagi/page-data/*      → GET /page-data/*
/api/hikarinagi/search           → GET /search
/api/hikarinagi/search/trending  → GET /search/trending
/api/hikarinagi/community/*      → GET /community/*
/api/hikarinagi/character/{id}   → GET /character/{id}
/api/hikarinagi/person/{id}      → GET /person/{id}
/api/hikarinagi/producer/{id}    → GET /producer/{id}
/api/hikarinagi/tag/{id}         → GET /tag/{id}
```

## 实施优先级

### P0 - 核心功能
1. Worker 代理路由
2. HikarinagiService.js
3. 禁書目錄 Galgame/LN 分类 Tab + 列表
4. 条目详情页合并（Bangumi ID 匹配 + 下载信息 Tab）

### P1 - 增强功能
5. 首页侧边栏推荐 Gal/热门评论
6. GlobalSearch 集成
7. 放送表 Galgame 月度发售

### P2 - 后续（需认证）
8. 用户系统对接
9. 评分/评论互动
10. 轻小说在线阅读器

## 风险与注意事项

1. **API 稳定性**：Hikarinagi API 标注 `2.0.0-alpha.development`，接口可能变化，需做好错误降级
2. **CORS**：需 Worker 代理，与现有 Bangumi 代理架构一致
3. **数据合并**：Bangumi 和 Hikarinagi 的数据结构不同，合并时需映射字段
4. **性能**：详情页需同时请求两个 API，考虑并行请求和缓存
5. **NSFW**：Galgame 可能包含成人内容，需与现有 NSFW 过滤逻辑配合
