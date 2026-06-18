# WebTorrent 站内种子播放设计

> 日期: 2026-06-18
> 状态: 待审核

## 1. 背景与问题

当前 ANISpace 的 BT 播放功能存在以下不足：

1. **"站内观看"流程断裂**：点击"站内观看"直接跳转播放页，用户无法在详情页看到磁力链接列表
2. **磁力链接不可见**：MediaMatchList 只显示标题+属性+播放按钮，不展示磁力链接 URL
3. **BT 播放体验差**：BT 资源使用原生 `<video>` 播放，无弹幕、无进度保存、无截图
4. **无 .torrent 文件上传**：只支持磁力链接，不支持上传种子文件
5. **无文件选择器**：种子内多文件时自动选最大文件，用户无法选择

## 2. 设计目标

- 详情页"站内观看"→ 展示磁力链接列表 → 点击直接站内播放
- BT 播放整合 DPlayer，支持弹幕、进度保存、截图
- 支持 .torrent 文件上传播放
- 种子内多文件时提供文件选择器

## 3. 技术方案：WebTorrent renderTo + DPlayer 整合

### 3.1 核心原理

WebTorrent 的 `file.renderTo(videoElement)` 通过 MediaSource API 向 `<video>` 元素注入流数据。DPlayer 内部也使用标准 `<video>` 元素，因此可以将 WebTorrent 流直接注入 DPlayer 的 video 元素，实现边下边播 + 完整播放器功能。

### 3.2 数据流

```
磁力链接 → client.add(magnetURI, {announce}) → torrent → files[] → 选择 → renderTo(dp.video)
.torrent文件 → client.add(file, {announce}) → torrent → files[] → 选择 → renderTo(dp.video)
```

### 3.3 DPlayer + WebTorrent 整合步骤

1. 创建 DPlayer 实例（使用占位视频源或空源）
2. DPlayer 初始化后，获取 `dp.video` 元素
3. WebTorrent `file.renderTo(dp.video)` 注入流
4. DPlayer 控制栏、弹幕层正常工作

## 4. 组件改动

### 4.1 SubjectDetail.jsx — "站内观看"流程改进

**当前**：`handleWatchInSite` 直接跳转 `/video/play/:subjectId/:episodeSort`

**改为**：
- 点击"站内观看"后，自动搜索第一集（或全部剧集）的 BT 资源
- 在详情页内展开磁力链接列表面板
- 用户点击磁力链接 → 携带 `state.media` 跳转到播放页（VideoPlayer 已支持 `passedMedia`）

**具体改动**：
- `handleWatchInSite` 改为触发资源搜索，而非直接跳转
- 新增 `showMagnetPanel` 状态控制磁力链接面板的显示
- 磁力链接面板内展示每集对应的 BT 资源列表

### 4.2 MediaMatchList.jsx — 增加磁力链接展示

**当前**：只显示标题+属性+播放按钮

**改为**：
- BT 资源（`kind === 'bittorrent'`）显示磁力链接图标 + 可复制的 magnet URI
- 点击磁力链接直接跳转播放（与现有"播放"按钮行为一致）
- 增加"复制磁力链接"功能

### 4.3 VideoPlayer.jsx — BT 播放 DPlayer 整合

**当前**：BT 播放分支（L243-L351）创建原生 `<video>` + WebTorrent

**改为**：
1. BT 播放也初始化 DPlayer（与 HTTP 播放共享配置，含弹幕 apiBackend）
2. DPlayer 创建后，获取 `dp.video` 元素
3. WebTorrent `file.renderTo(dp.video)` 注入流
4. 复用 `timeupdate` / `loadedmetadata` 事件监听实现进度保存/恢复

**关键代码结构**：
```javascript
if (downloadKind === 'magnet' || downloadKind === 'torrent') {
  // 1. 初始化 DPlayer
  const dp = new DPlayer({
    container: playerContainerRef.current,
    video: { url: '', pic: coverRef.current }, // 空源，后续由 WebTorrent 注入
    danmaku: { ... },
    apiBackend: { ... },
    autoplay: true,
  });
  playerRef.current = dp;

  // 2. WebTorrent 添加种子
  const client = new WebTorrent({ maxConns: 100, tracker: { announce: trackerList } });
  torrentRef.current = client;

  client.add(url, { announce: trackerList }, (torrent) => {
    // 3. 文件选择
    const files = torrent.files.filter(f => /\.(mp4|mkv|avi|wmv|flv|webm|mov)$/i.test(f.name));
    const file = files.sort((a, b) => b.length - a.length)[0]; // 默认最大

    // 4. 渲染到 DPlayer 的 video 元素
    file.renderTo(dp.video, (err) => {
      if (err) setPlayError('视频渲染失败: ' + err.message);
    });

    // 5. 进度监听
    torrent.on('download', () => { ... });
  });
}
```

### 4.4 文件选择器 — 新增 UI

当种子内包含多个视频文件时，在播放器下方显示文件选择面板：

- 列出种子内所有视频文件（按扩展名过滤：mp4/mkv/avi/wmv/flv/webm/mov）
- 显示文件名、文件大小
- 默认选中最大文件
- 用户点击切换时：销毁当前 renderTo，重新 `file.renderTo(dp.video)`

**状态管理**：
```javascript
const [torrentFiles, setTorrentFiles] = useState([]); // 种子内文件列表
const [selectedFileIndex, setSelectedFileIndex] = useState(0); // 当前选中文件
```

### 4.5 .torrent 文件上传 — 新增入口

在播放页（VideoPlayer）增加"上传种子"按钮：

- `<input type="file" accept=".torrent" hidden>` + 触发按钮
- 读取为 `File` 对象
- 调用 `client.add(file)` （WebTorrent 原生支持 File/Blob 输入）
- 后续流程与磁力链接一致

### 4.6 TorrentAdapter.ts — 扩展

新增方法：
```typescript
/** 添加 .torrent 文件 */
export async function addTorrentFile(
  file: File | Blob,
  trackers: string[],
): Promise<string> {
  if (isTauri) {
    // Tauri: 读取文件为 ArrayBuffer，调用 Rust 命令
    const buffer = await file.arrayBuffer();
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('torrent_add_file', {
      params: { fileData: Array.from(new Uint8Array(buffer)), trackers },
    });
  }
  // Web 端返回空字符串，由 VideoPlayer 使用 WebTorrent
  return '';
}
```

## 5. 生命周期管理

| 场景 | 操作 |
|------|------|
| 切换资源/剧集 | `client.destroy()` + `dp.destroy()` |
| 文件选择切换 | 仅重新 `renderTo`，不销毁 client/torrent |
| 页面卸载 | `useEffect` cleanup 中销毁所有实例 |

## 6. 错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| WebTorrent 加载失败 | 提示"浏览器不支持 BT 播放" |
| 无可用 peer | 显示连接进度 + "正在寻找节点..." |
| 渲染失败 | 提示错误 + 建议切换资源 |
| DPlayer 初始化失败 | 回退到原生 `<video>` + WebTorrent |

## 7. 进度信息

保留现有 `torrentProgress` 状态，在播放器下方显示：
- 缓冲进度百分比
- 下载速度
- 连接节点数

## 8. 涉及文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/components/Video/VideoPlayer.jsx` | 重构 | BT 播放整合 DPlayer + 文件选择器 + .torrent 上传 |
| `src/components/Video/VideoPlayer.css` | 修改 | 新增文件选择器样式 |
| `src/components/Video/SubjectDetail.jsx` | 修改 | "站内观看"流程改为展示磁力链接 |
| `src/components/Video/MediaMatchList.jsx` | 修改 | 增加磁力链接展示和复制 |
| `src/components/Video/MediaMatchList.css` | 修改 | 磁力链接样式 |
| `src/services/media/TorrentAdapter.ts` | 扩展 | 新增 addTorrentFile 方法 |
