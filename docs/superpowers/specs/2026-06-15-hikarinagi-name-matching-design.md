# Hikarinagi 名字匹配合并设计文档

> 日期：2026-06-15
> 状态：待确认
> 替代：2026-06-15-hikarinagi-integration-design.md

## 背景

Hikarinagi（光凪）的 Galgame 和轻小说条目与 Bangumi 的条目编号体系完全不同，`getByBangumiId` 只能匹配极少数已关联 Bangumi ID 的条目，覆盖面很有限。

但实质上：
- Hikarinagi 的 Galgame 是 Bangumi "游戏"分类（type=4）的子集
- Hikarinagi 的轻小说是 Bangumi "小说"分类（type=1）的子集

因此需要用**名字匹配**来扩大合并覆盖率，以 Bangumi 数据为核心，在其中补充 Hikarinagi 的独有内容。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 合并方向 | Bangumi 为核心 + Hikarinagi 补充 | Bangumi 数据更全，Hikarinagi 补充独有数据 |
| 匹配策略 | 纯名字匹配（不用 Bangumi ID 关联） | 两站 ID 体系不同，ID 匹配覆盖面极低 |
| 匹配方式 | 前端实时搜索匹配 | 无需后端改动，利用已有搜索 API |
| 相似度阈值 | > 0.85 | Galgame/轻小说名称通常独特，0.85 可避免误匹配 |

## 合并流程

```
用户打开 Bangumi 条目详情页（type=4 游戏 / type=1 小说）
  │
  ├─ 加载 Bangumi 数据（现有逻辑不变）
  │
  └─ 异步触发 Hikarinagi 名字匹配
       │
       ├─ 用 subject.name（日文名）搜索 Hikarinagi
       │   HikarinagiSearchService.search({ keyword, type: 'galgame'|'novel' })
       │
       ├─ 取搜索结果前3条，验证标题相似度 > 0.85
       │   - 比较 subject.name vs hk.name
       │   - 比较 subject.name_cn vs hk.nameCn（如有）
       │   - 任一匹配即视为命中
       │
       ├─ 命中 → 并行获取补充数据
       │   ├─ Galgame: getDownloadInfo + getLinks + getRelated
       │   └─ LightNovel: getSeriesDownloadUrls + getBangumiVolume
       │
       └─ 未命中 → 不显示 Hikarinagi 补充区域
```

## 详情页补充内容

在 Bangumi 详情页中新增 **"光凪资源"** Tab（仅匹配成功时显示）：

| 补充项 | 来源 | 展示方式 |
|--------|------|---------|
| 光凪评分 | 搜索结果中的 rate 字段 | 评分区域新增一行 |
| 下载信息 | `getDownloadInfo(id)` / `getSeriesDownloadUrls(id)` | Tab 内列表/HTML 渲染 |
| 外部链接 | `getLinks(id)` | 链接列表 |
| 标签/制作组 | 搜索结果中的 tags/producers | 标签区域补充 |
| 相关推荐 | `getRelated(id)` | 卡片列表，**仅显示能在 Bangumi 搜到的条目** |

### 相关推荐的 Bangumi 过滤

Hikarinagi 的相关推荐条目需验证在 Bangumi 中存在才显示：

```
Hikarinagi getRelated(id) → 返回相关游戏列表
  │
  └─ 对每个相关条目（最多5条）：
       ├─ 用名字在 Bangumi 搜索
       │   BangumiService.searchSubjects(name, type, 1, 0)
       ├─ 搜索结果相似度 > 0.85 → 显示（链接到 Bangumi 详情页）
       └─ 无匹配 → 不显示
```

## SourceMerger 扩展

在现有 `SourceMerger` 中新增 `_findHikarinagi` 方法和 `mergeHikarinagiData` 入口：

```js
async mergeHikarinagiData(bgmSubject) {
  const bgmId = bgmSubject?.id;
  if (!bgmId) return null;

  // 检查缓存
  const cacheKey = `hk_${bgmId}`;
  if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

  const hkMatch = await this._findHikarinagi(bgmSubject);
  if (!hkMatch) {
    this._cache.set(cacheKey, null);
    return null;
  }

  // 并行获取补充数据
  const hkId = hkMatch.galId || hkMatch.novelId || hkMatch.id;
  const isGalgame = bgmSubject.type === 4;

  const [downloadInfo, links, related] = await Promise.allSettled([
    isGalgame ? HikarinagiService.galgame.getDownloadInfo(hkId) : HikarinagiService.lightnovel.getSeriesDownloadUrls(hkId),
    isGalgame ? HikarinagiService.galgame.getLinks(hkId) : null,
    isGalgame ? HikarinagiService.galgame.getRelated(hkId) : null,
  ]);

  const result = {
    match: hkMatch,
    downloadInfo: downloadInfo.status === 'fulfilled' ? downloadInfo.value : null,
    links: links.status === 'fulfilled' ? links.value : null,
    related: related.status === 'fulfilled' ? related.value : null,
  };

  this._cache.set(cacheKey, result);
  return result;
}

async _findHikarinagi(bgmSubject) {
  const type = bgmSubject.type === 4 ? 'galgame' : bgmSubject.type === 1 ? 'novel' : null;
  if (!type) return null;

  const titles = [bgmSubject.name, bgmSubject.name_cn].filter(Boolean);
  for (const title of titles) {
    try {
      const results = await HikarinagiSearchService.search({ keyword: title, type, limit: 3 });
      const items = Array.isArray(results) ? results : results?.list || [];
      for (const item of items) {
        const hkTitles = [item.name, item.nameCn].filter(Boolean);
        for (const ht of hkTitles) {
          for (const bt of titles) {
            if (calculateSimilarity(ht, bt) > 0.85) {
              return item;
            }
          }
        }
      }
    } catch { /* 搜索失败，跳过 */ }
  }
  return null;
}
```

## 相关推荐 Bangumi 验证

新增辅助函数 `filterRelatedByBangumi`：

```js
async filterRelatedByBangumi(relatedItems, bgmType) {
  if (!relatedItems || relatedItems.length === 0) return [];

  const typeCode = bgmType === 4 ? 4 : 1; // Bangumi type code
  const verified = [];
  const toCheck = relatedItems.slice(0, 5); // 最多验证5条

  const results = await Promise.allSettled(
    toCheck.map(item =>
      BangumiService.searchSubjects(item.name || item.nameCn, typeCode, 1, 0)
        .then(res => {
          const match = res.list?.[0];
          if (match && calculateSimilarity(
            match.name || match.name_cn,
            item.name || item.nameCn
          ) > 0.85) {
            return { ...item, bgmSubject: match };
          }
          return null;
        })
        .catch(() => null)
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) verified.push(r.value);
  }
  return verified;
}
```

## InfoDetail.jsx 修改

替换现有的 `getByBangumiId` 逻辑为 `SourceMerger.mergeHikarinagiData`：

```js
// 现有逻辑（删除）：
// hkService.getByBangumiId(id)

// 新逻辑：
if (data.type === 4 || data.type === 1) {
  setHikarinagiLoading(true);
  SourceMerger.mergeHikarinagiData({ id, name: data.name, name_cn: data.name_cn, type: data.type })
    .then(result => {
      if (result) {
        // 过滤相关推荐
        return filterRelatedByBangumi(result.related, data.type)
          .then(verified => ({
            ...result,
            related: verified,
          }));
      }
      return null;
    })
    .then(setHikarinagiLinked)
    .catch(() => setHikarinagiLinked(null))
    .finally(() => setHikarinagiLoading(false));
}
```

## 性能考虑

- 搜索+详情并行请求，不阻塞主页面渲染
- 匹配结果缓存到 `SourceMerger._cache`（key: `hk_${bgmId}`）
- 相关推荐的 Bangumi 验证最多 5 条并行，超时 3 秒
- Hikarinagi 请求失败静默降级，不影响 Bangumi 数据展示
- 搜索 API 已有 IndexedDB 缓存（10 分钟 TTL）

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/services/SourceMerger.js` | 新增 `_findHikarinagi` + `mergeHikarinagiData` + `filterRelatedByBangumi` |
| `src/components/Info/InfoDetail.jsx` | 替换 `getByBangumiId` 为 `mergeHikarinagiData`，调整数据结构 |

## 风险

1. **误匹配**：名字相似但不是同一作品（如续作/前作）。0.85 阈值 + 取搜索结果第一条可降低风险
2. **API 限流**：Hikarinagi 搜索 API 可能有频率限制，需做好缓存和降级
3. **搜索结果为空**：Hikarinagi 数据库可能不包含某些 Bangumi 条目，此时静默跳过
