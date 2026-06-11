# ANISpace · 番剧本地索引 运维手册

> 适用模块：M-08 Wiki · 番剧检索
> 数据源：[bangumi-data](https://github.com/bangumi-data/bangumi-data) （CC BY-NC-SA 4.0）
> 同步频率：每周一 03:00 UTC（外加周三容错）
> 部署位置：Cloudflare D1 `anispace-db`

---

## 1. 一次性初始化

### 1.1 跑 DDL

```bash
cd worker
npx wrangler d1 execute anispace-db --remote --file migrations/v008_bangumi_index.sql
```

期望输出 `12 commands executed successfully`。

### 1.2 设置 admin token

```bash
# 在 Cloudflare Dashboard → Workers → anispace-oauth-proxy → Settings → Variables → Secrets
# 添加：ADMIN_SYNC_TOKEN = <一串随机字符串>
# 例如：openssl rand -hex 32
```

### 1.3 全量导入

```bash
cd ..
node scripts/import-bangumi-data.mjs
```

**预期**：
- 拉取 latest.json：~1-2 MB，< 30s
- 写入：~5.5 万条，分 ~110 个 SQL 文件
- D1 通过 wrangler exec 顺序执行：2-5 min
- 末尾打印 `总条数: 55xxx`

**SQL 分片位置**：`.tmp-import/batch-XXX.sql`，导入成功后可删除。

### 1.4 验证

```bash
# 应返回 55000 上下
npx wrangler d1 execute anispace-db --remote --command "SELECT COUNT(*) AS n FROM bangumi_index"

# 应看到 5 条样例
npx wrangler d1 execute anispace-db --remote --command "SELECT id, title, title_cn, type, score FROM bangumi_index WHERE type = 2 AND score > 8 LIMIT 5"
```

---

## 2. 手动触发同步

```bash
# 状态查询
curl -s "https://anispace-oauth-proxy.lyw2373314970.workers.dev/api/bangumi-search/admin/status" | jq

# 强制同步（无视 hash 跳过判断）
curl -X POST "https://anispace-oauth-proxy.lyw2373314970.workers.dev/api/bangumi-search/admin/sync?force=1" \
  -H "X-Admin-Token: <你的 token>"
```

返回示例：
```json
{
  "ok": true,
  "total": 55123,
  "durationMs": 8742,
  "sourceHash": "a3f7b2c1"
}
```

---

## 3. 自动同步（Cron）

由 [wrangler.toml](../../worker/wrangler.toml) 的 `[triggers]` 触发：
```toml
crons = ["0 3 * * 1", "0 3 * * 3"]
```

频率门控见 [bangumi-sync.js](../../worker/lib/bangumi-sync.js)：
- 距上次同步 < 6 天 → 跳过
- hash 未变 → 跳过
- 否则拉取并全量 UPSERT

**查看执行日志**：
```bash
npx wrangler tail anispace-oauth-proxy
```

---

## 4. 健康检查

每周一次（建议周内做一次）：

```bash
# 1. 同步状态
curl -s "$PROXY/api/bangumi-search/admin/status" | jq

# 2. 索引大小
npx wrangler d1 info anispace-db

# 3. 抽样搜索
curl -s "$PROXY/api/bangumi-search/search?q=高达+seed&type=2" | jq '.count, .source'
```

**告警阈值**：
- `lastSyncAt` 距今 > 14 天
- `itemCountLive` < 50000
- 5xx 错误率 > 5%

---

## 5. 故障排查

| 现象 | 排查 |
| --- | --- |
| 同步返回 `fetchSource failed` | 看 Cloudflare Worker 日志；多半是 GitHub raw 限流 → 等 5 分钟重试 |
| `lastSyncAt` 没更新 | 看 wrangler tail；可能是 `ADMIN_SYNC_TOKEN` 没设 |
| 搜索无结果 | 先 `SELECT COUNT(*) FROM bangumi_index`；若为 0 → 重跑 1.3 |
| 搜索 RT > 1s | 加 `EXPLAIN QUERY PLAN` 看是否走了索引；LIKE 不会走索引，500 万条以下 SQLite 是扛得住的 |
| D1 写爆 10GB | `item.image` 字段过长，必要时裁剪；或清理 `summary` 字段 |

---

## 6. 数据回滚

```bash
# 1. 备份
npx wrangler d1 export anispace-db --output=backup-$(date +%F).sql

# 2. 清表
npx wrangler d1 execute anispace-db --remote --command "DELETE FROM bangumi_index"

# 3. 重新导入
node scripts/import-bangumi-data.mjs
```

---

## 7. 协议 / Attribution

`bangumi-data` 协议：**CC BY-NC-SA 4.0**（署名-非商业-相同方式共享）。

**必须在 UI 体现**：
- 搜索结果列表底部一行小字：`数据来自 bangumi-data (CC BY-NC-SA 4.0)`
- "关于"页列出本仓库链接

---

## 8. 相关文件

- 迁移：[worker/migrations/v008_bangumi_index.sql](../../worker/migrations/v008_bangumi_index.sql)
- 同步逻辑：[worker/lib/bangumi-sync.js](../../worker/lib/bangumi-sync.js)
- 搜索逻辑：[worker/lib/bangumi-search.js](../../worker/lib/bangumi-search.js)
- 导入脚本：[scripts/import-bangumi-data.mjs](../../scripts/import-bangumi-data.mjs)
- 前端服务：[src/services/BangumiSearchService.js](../../src/services/BangumiSearchService.js)
- Worker 路由：见 [oauth-proxy.js](../../worker/oauth-proxy.js) `handleApiRoutes` 末尾
