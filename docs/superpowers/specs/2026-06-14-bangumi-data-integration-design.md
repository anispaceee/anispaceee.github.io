# bangumi-data 集成设计文档

> 日期: 2026-06-14
> 状态: 已批准

## 概述

将 [bangumi-data](https://github.com/bangumi-data/bangumi-data) 开源数据集集成到 ANISpace，为放送表提供精确的放送时间和多平台播放链接，并与现有 AniBT 数据源融合。

## 背景

### 研究的项目

| 项目 | 定位 | 与 ANISpace 的关系 |
|------|------|-------------------|
| [Auto_Bangumi](https://github.com/EstrellaXD/Auto_Bangumi) | 基于 RSS 的全自动追番下载工具 | 日历视图 UI 参考；自部署工具，无公开 API |
| [bangumi-list](https://github.com/wxt2005/bangumi-list) | 新番放送聚合站 | 已归档，数据迁移至 bangumi-data |
| [bangumi-data](https://github.com/bangumi-data/bangumi-data) | 动画番组放送+资讯站点数据集 | **核心数据源**，活跃维护，CC BY 4.0 |

### bangumi-data 数据结构

```json
{
  "siteMeta": {
    "bangumi": { "title": "番组计划", "urlTemplate": "https://bangumi.tv/subject/{{id}}", "type": "info" },
    "bilibili": { "title": "哔哩哔哩", "urlTemplate": "https://www.bilibili.com/bangumi/media/md{{id}}/", "regions": ["CN"], "type": "onair" },
    "netflix": { "title": "Netflix", "urlTemplate": "https://www.netflix.com/title/{{id}}", "type": "onair" }
    // ... 更多平台
  },
  "items": [
    {
      "title": "番剧标题",
      "titleTranslate": { "zh-Hans": ["中文名"] },
      "type": "tv",
      "sites": [
        { "site": "bangumi", "id": "12345" },
        { "site": "bilibili", "id": "md12345", "begin": "2026-07-01T23:00:00+08:00" }
      ],
      "begin": "2026-07-01T23:00:00+08:00"
    }
  ]
}
```

## 设计决策

### 1. 数据获取方式：前端 CDN 直接调用

- **CDN 地址**: `https://unpkg.com/bangumi-data@0.3/dist/data.json`
- **缓存策略**: localStorage 缓存，key `anispace_bangumi_data`，有效期 24 小时
- **选择理由**: 无需后端改动，unpkg CDN 支持 CORS，数据量可接受（gzip ~100-200KB）

### 2. 双数据源融合

- **bangumi-data**: 放送时间 + 多平台 ID 映射 + 平台元信息
- **AniBT**: 字幕组资源等独有数据
- **Bangumi API**: 封面图、评分、详情信息
- **关联键**: bgmId（bangumi-data items 中的 bangumi site id）

### 3. 多平台播放链接：仅条目详情页

在条目详情页添加"播放平台"区域，展示各平台播放链接按钮。

### 4. 放送表 UI：周历视图

7 列网格，每天一列，番剧卡片带封面缩略图。

## 功能详细设计

### F1: BangumiDataService 服务模块

新增 `src/services/BangumiDataService.js`:

```js
export const BangumiDataService = {
  CDN_URL: 'https://unpkg.com/bangumi-data@0.3/dist/data.json',
  CACHE_KEY: 'anispace_bangumi_data',
  CACHE_TTL: 24 * 60 * 60 * 1000, // 24h

  async fetchData() { /* 获取并缓存 bangumi-data */ },
  async getSeasonItems(year, season) { /* 获取指定季度番剧 */ },
  async getSitesByBgmId(bgmId) { /* 根据 bgmId 获取各平台链接 */ },
  getSiteMeta() { /* 获取平台元信息 */ },
  generatePlatformUrl(siteKey, id) { /* 根据 siteMeta urlTemplate 生成链接 */ }
};
```

### F2: 放送表周历视图

**改造文件**: `src/components/NewsZone/AnimeSchedule.jsx` + `AnimeSchedule.css`

**UI 结构**:
- 顶部: 周导航（上一周/下一周/回到本周）+ 季度选择器
- 主体: 7 列网格（周一~周日），每天一列
- 番剧卡片: 封面缩略图 + 标题 + 放送时间
- 当天列: 粉色边框高亮（var(--primary)），无"今天"标签
- 番剧按放送时间排序

**数据流**:
1. bangumi-data 提供当季番剧列表 + 放送时间
2. Bangumi API 通过 bgmId 补充封面图、评分
3. AniBT 补充字幕组资源信息
4. 前端按星期分组，渲染周历网格

**周导航逻辑**:
- 计算当前周的起止日期（周一~周日）
- 前后翻页改变周偏移
- "回到本周"重置偏移为 0
- 根据周内日期过滤 bangumi-data items

### F3: 条目详情页多平台播放链接

**改造文件**: `src/components/Info/InfoDetail.jsx` + `InfoDetail.css`

**UI 设计**:
- 在条目详情页信息区域添加"播放平台"区块
- 根据 bgmId 从 bangumi-data 查找该番剧在各平台的 ID
- 生成平台播放链接按钮，使用各平台品牌色:
  - 哔哩哔哩: #00a1d6
  - AcFun: #e53935
  - Netflix: #e50914
  - 動畫瘋: #ff6b00
  - 优酷: #1a9cff
  - 腾讯视频: #ff6600
  - 爱奇艺: #00c800
  - Niconico: #231815
- 按钮点击新窗口打开对应平台页面
- 仅展示有该番剧的平台，无数据的平台不显示

### F4: 跨平台 ID 映射

- bangumi-data 的 items 中每条番剧的 `sites` 数组包含各平台 ID
- 通过 `sites.find(s => s.site === 'bangumi')?.id` 获取 bgmId
- 与 Bangumi API 数据通过 bgmId 关联
- 映射关系由 bangumi-data 社区维护，ANISpace 无需额外维护

## 技术约束

- bangumi-data 许可证: CC BY 4.0，需在页面注明数据来源
- CDN 数据可能有延迟（unpkg 缓存），最新数据需等待 CDN 更新
- bangumi-data 数据量约 500KB-1MB（gzip ~100-200KB），首次加载需考虑 loading 状态
- 前端过滤当季数据后实际使用的数据量较小

## 影响范围

| 文件 | 改动类型 |
|------|---------|
| `src/services/BangumiDataService.js` | 新增 |
| `src/components/NewsZone/AnimeSchedule.jsx` | 重构（周历视图） |
| `src/components/NewsZone/AnimeSchedule.css` | 重构（周历样式） |
| `src/components/Info/InfoDetail.jsx` | 修改（添加播放平台区域） |
| `src/components/Info/InfoDetail.css` | 修改（播放平台样式） |

## 不做的事

- 不替代 AniBT 作为放送表唯一数据源（双数据源融合）
- 不在放送表卡片上显示平台标签（仅在详情页展示）
- 不修改 Cloudflare Worker 代码
- 不引入 bangumi-data npm 包（使用 CDN 方式）
