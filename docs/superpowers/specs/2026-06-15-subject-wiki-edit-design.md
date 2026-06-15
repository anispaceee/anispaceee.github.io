# 条目编辑功能设计（Wiki式版本控制）

## 概述

为ANISpace条目详情页添加社区编辑功能，采用Wiki式版本控制。所有登录用户可编辑条目的所有可编辑字段，编辑内容与Bangumi原始数据分区显示，支持编辑历史查看和版本回滚。

## 需求

- 所有登录用户可编辑任何条目
- 可编辑字段：中文名(name_cn)、简介(summary)、标签(tags)、infobox、角色(crt)、制作人员(staff)、封面图(image)、评分信息等
- 编辑内容与Bangumi原始数据**分区显示**（Bangumi原始 + 社区补充）
- 支持编辑历史查看（版本列表）
- 支持版本回滚
- 编辑时需填写编辑说明（edit_summary）

## 数据库设计

### 新建 `subject_edits` 表

```sql
CREATE TABLE subject_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL,          -- Bangumi条目ID
  editor_id INTEGER NOT NULL,           -- 编辑者用户ID
  version INTEGER NOT NULL DEFAULT 1,   -- 版本号（同一subject_id递增）
  fields TEXT NOT NULL DEFAULT '{}',    -- JSON: 本次编辑涉及的字段及内容
  edit_summary TEXT DEFAULT '',         -- 编辑说明
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (subject_id) REFERENCES bangumi_subjects(id)
);
CREATE INDEX idx_subject_edits_subject ON subject_edits(subject_id, version DESC);
CREATE INDEX idx_subject_edits_editor ON subject_edits(editor_id);
```

### `fields` JSON 结构

只存储用户实际修改的字段，未修改的不包含：

```json
{
  "name_cn": "甜蜜女友3",
  "summary": "补充的简介内容...",
  "tags": [{"name":"Galgame","count":1}],
  "infobox": [{"key":"平台","value":["PC"]}],
  "crt": [{"id":1,"name":"角色名","role":"主角"}],
  "staff": [{"id":1,"name":"制作人员名","role":"开发"}],
  "image": "https://..."
}
```

### 版本号规则

- 同一 `subject_id` 的版本号从1开始递增
- 提交新编辑时，`version = MAX(version) + 1`
- 回滚操作也创建新版本（复制目标版本的fields）

## Worker API 端点

### GET `/api/subjects/:id/edits`

获取条目的编辑历史列表（分页）。

**请求参数**：
- `page` (默认1)
- `limit` (默认20，最大50)

**响应**：
```json
{
  "edits": [
    {
      "id": 1,
      "subject_id": 345691,
      "editor_id": 5,
      "editor_name": "用户名",
      "version": 2,
      "fields": {"name_cn": "...", "summary": "..."},
      "edit_summary": "修正中文名",
      "created_at": "2026-06-15T12:00:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

### GET `/api/subjects/:id/edits/latest`

获取最新编辑版本（用于详情页显示社区补充内容）。

**响应**：同上单个编辑记录，或 `null`（无编辑时）。

### POST `/api/subjects/:id/edits`

提交新编辑。需登录（Authorization header）。

**请求体**：
```json
{
  "fields": {"name_cn": "新中文名", "summary": "新简介"},
  "edit_summary": "修正中文名和补充简介"
}
```

**逻辑**：
1. 验证登录状态
2. 获取当前最大version，新version = max + 1
3. 插入新记录
4. 返回新编辑记录

### GET `/api/subjects/:id/edits/:version`

获取特定版本的编辑内容。

### POST `/api/subjects/:id/edits/:version/revert`

回滚到指定版本。需登录。

**逻辑**：
1. 获取目标版本的fields
2. 创建新版本（version = max + 1），fields复制自目标版本
3. edit_summary自动设为"回滚到版本N"

## 前端设计

### 详情页改动

1. **编辑按钮**：条目标题旁添加铅笔图标按钮，仅登录用户可见
2. **编辑模式**：点击后进入编辑模式，可编辑字段以表单形式展示
   - 当前值 = Bangumi原始 + 最新社区编辑合并后的值
   - 每个字段可单独修改
3. **提交编辑**：填写编辑说明后提交

### 社区补充区域

- 详情页中Bangumi原始数据正常显示
- 新增"社区补充"Tab，显示社区编辑的内容
- 编辑内容与原始数据分区显示，不覆盖

### 编辑历史

- 详情页添加"编辑历史"入口（时钟图标）
- 显示版本列表：版本号、编辑者头像+名称、编辑说明、时间
- 可查看任意版本的详细变更
- 可回滚到任意历史版本（创建新版本）

### 编辑表单字段

| 字段 | 编辑方式 |
|------|----------|
| name_cn | 文本输入 |
| summary | 多行文本 |
| tags | 标签编辑器（添加/删除） |
| infobox | 键值对编辑器 |
| crt | 列表编辑器 |
| staff | 列表编辑器 |
| image | URL输入 |

## 数据流

```
1. 加载详情页:
   Bangumi原始数据(bangumi_subjects) 
   + 最新社区编辑(subject_edits, version=MAX)
   → 合并 → 详情页显示

2. 编辑提交:
   用户修改字段 → POST /api/subjects/:id/edits 
   → 创建新version记录 → 刷新详情页

3. 版本回滚:
   点击回滚 → POST /api/subjects/:id/edits/:version/revert
   → 复制目标版本fields为新版本 → 刷新详情页
```

## 迁移计划

- 新建迁移文件 `v015_subject_edits.sql`
- 不影响现有 `bangumi_subjects` 表结构
