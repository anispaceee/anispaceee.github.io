# WebTorrent 站内种子播放 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 WebTorrent 站内种子播放，支持详情页磁力链接展示、DPlayer 整合 BT 播放、.torrent 文件上传、种子内文件选择器

**Architecture:** WebTorrent `file.renderTo(dp.video)` 将 BT 流注入 DPlayer 的 video 元素，实现边下边播 + 弹幕/进度保存。详情页"站内观看"改为展示磁力链接列表，点击直接跳转播放。

**Tech Stack:** React, WebTorrent, DPlayer, HLS.js, Vite

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/services/media/TorrentAdapter.ts` | 修改 | 新增 `addTorrentFile` 方法 |
| `src/components/Video/VideoPlayer.jsx` | 重构 | BT 播放整合 DPlayer + 文件选择器 + .torrent 上传 |
| `src/components/Video/VideoPlayer.css` | 修改 | 新增文件选择器 + .torrent 上传按钮样式 |
| `src/components/Video/SubjectDetail.jsx` | 修改 | "站内观看"流程改为展示磁力链接 |
| `src/components/Video/SubjectDetail.css` | 修改 | 磁力链接面板样式 |
| `src/components/Video/MediaMatchList.jsx` | 修改 | 增加磁力链接展示和复制 |
| `src/components/Video/MediaMatchList.css` | 修改 | 磁力链接样式 |

---

### Task 1: TorrentAdapter.ts — 新增 addTorrentFile 方法

**Files:**
- Modify: `src/services/media/TorrentAdapter.ts`

- [ ] **Step 1: 在 TorrentAdapter.ts 末尾添加 addTorrentFile 方法**

在文件末尾（`getStreamUrl` 函数之后）添加：

```typescript
/**
 * 添加 .torrent 文件并开始下载
 * @param file .torrent 文件（File 或 Blob）
 * @param trackers tracker 列表
 * @returns 本地流 URL（Tauri 端）或空字符串（Web 端）
 */
export async function addTorrentFile(
  file: File | Blob,
  trackers: string[],
): Promise<string> {
  if (isTauri) {
    try {
      const buffer = await file.arrayBuffer();
      const { invoke } = await import('@tauri-apps/api/core');
      const streamUrl = await invoke<string>('torrent_add_file', {
        params: { fileData: Array.from(new Uint8Array(buffer)), trackers },
      });
      console.log('[TorrentAdapter] Tauri torrent file added, stream URL:', streamUrl);
      return streamUrl;
    } catch (err) {
      console.error('[TorrentAdapter] Tauri torrent_add_file failed:', err);
      throw err;
    }
  }
  // Web 端返回空字符串，由 VideoPlayer 使用 WebTorrent
  return '';
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd ANISpace && npx tsc --noEmit src/services/media/TorrentAdapter.ts`
Expected: 无错误

---

### Task 2: MediaMatchList — 增加磁力链接展示和复制

**Files:**
- Modify: `src/components/Video/MediaMatchList.jsx`
- Modify: `src/components/Video/MediaMatchList.css`

- [ ] **Step 1: 在 MediaMatchList.jsx 中增加磁力链接展示**

在 `MediaMatchList.jsx` 顶部 import 中添加 `useState` 和 `Copy` 图标：

```jsx
import { useState, useMemo } from 'react';
import { Play, Server, Tag, HardDrive, Subtitles, Copy, Check, Magnet } from 'lucide-react';
```

在 `MediaMatchList` 组件内部，`grouped` memo 之后添加：

```jsx
const [copiedId, setCopiedId] = useState(null);

const handleCopyMagnet = (e, magnetUrl, mediaId) => {
  e.stopPropagation();
  navigator.clipboard.writeText(magnetUrl).then(() => {
    setCopiedId(mediaId);
    setTimeout(() => setCopiedId(null), 2000);
  });
};
```

在每个 `mml-item` 的 `mml-item-props` 区域之后、`mml-play-btn` 之前，添加磁力链接展示：

```jsx
{match.media.download?.kind === 'magnet' && (
  <div className="mml-magnet-row">
    <Magnet size={12} className="mml-magnet-icon" />
    <span className="mml-magnet-url" title={match.media.download.url}>
      {match.media.download.url.substring(0, 60)}...
    </span>
    <button
      className="mml-copy-btn"
      onClick={(e) => handleCopyMagnet(e, match.media.download.url, match.media.mediaId)}
      title="复制磁力链接"
    >
      {copiedId === match.media.mediaId ? <Check size={12} /> : <Copy size={12} />}
    </button>
  </div>
)}
```

- [ ] **Step 2: 在 MediaMatchList.css 中添加磁力链接样式**

在文件末尾添加：

```css
/* Magnet Link Row */
.mml-magnet-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--bg-input);
  border-radius: var(--radius-xs);
  max-width: 100%;
  overflow: hidden;
}

.mml-magnet-icon {
  color: var(--primary);
  flex-shrink: 0;
}

.mml-magnet-url {
  font-size: 11px;
  color: var(--text-quaternary);
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

.mml-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-tertiary);
  border: 1px solid var(--border-primary);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}

.mml-copy-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-bg);
}
```

- [ ] **Step 3: 验证页面渲染**

Run: `cd ANISpace && npm run dev`
Expected: 详情页点击剧集后，BT 资源条目下方显示磁力链接行，带复制按钮

---

### Task 3: SubjectDetail — "站内观看"流程改为展示磁力链接

**Files:**
- Modify: `src/components/Video/SubjectDetail.jsx`
- Modify: `src/components/Video/SubjectDetail.css`

- [ ] **Step 1: 修改 SubjectDetail.jsx 的 handleWatchInSite**

将 `handleWatchInSite` 从直接跳转改为触发资源搜索：

```jsx
const [showMagnetPanel, setShowMagnetPanel] = useState(false);
const [allEpisodeMedia, setAllEpisodeMedia] = useState({}); // { epSort: MediaMatch[] }
const [magnetPanelLoading, setMagnetPanelLoading] = useState(false);

const handleWatchInSite = useCallback(async () => {
  if (episodes.length === 0) {
    navigate(`/video/play/${subjectId}/1`);
    return;
  }

  setShowMagnetPanel(true);
  setMagnetPanelLoading(true);
  setAllEpisodeMedia({});

  const subjectNames = [];
  if (subject?.name_cn) subjectNames.push(subject.name_cn);
  if (subject?.name) subjectNames.push(subject.name);

  // 并发搜索前 5 集的资源
  const epsToSearch = episodes.slice(0, 5);
  const results = {};

  await Promise.all(epsToSearch.map(async (ep) => {
    const epSort = String(ep.sort || ep.episode_sort || '');
    const request = {
      subjectId: String(subjectId),
      subjectNames,
      episodeSort: epSort,
      episodeName: ep.name || ep.name_cn || '',
    };
    try {
      const result = await mediaSourceManager.fetchAll(request);
      results[epSort] = result.results || [];
    } catch {
      results[epSort] = [];
    }
  }));

  setAllEpisodeMedia(results);
  setMagnetPanelLoading(false);
}, [episodes, subject, subjectId, navigate]);
```

- [ ] **Step 2: 在 SubjectDetail.jsx 的 JSX 中添加磁力链接面板**

在 `sd-actions` div 之后、Characters Section 之前添加：

```jsx
{/* Magnet Link Panel */}
{showMagnetPanel && (
  <section className="sd-section sd-magnet-panel">
    <div className="sd-magnet-panel-header">
      <h2 className="sd-section-title"><Play size={18} /> 站内资源</h2>
      <button className="sd-magnet-panel-close" onClick={() => setShowMagnetPanel(false)}>
        ✕
      </button>
    </div>
    {magnetPanelLoading && (
      <div className="sd-media-loading">
        <Loader2 size={24} className="sd-spinning" />
        <p>正在搜索资源...</p>
      </div>
    )}
    {!magnetPanelLoading && Object.entries(allEpisodeMedia).map(([epSort, matches]) => (
      <div key={epSort} className="sd-magnet-ep-group">
        <h3 className="sd-magnet-ep-title">第{epSort}话</h3>
        <MediaMatchList
          matches={matches}
          subjectId={subjectId}
          episodeId={epSort}
        />
      </div>
    ))}
    {!magnetPanelLoading && Object.keys(allEpisodeMedia).length === 0 && (
      <div className="mml-empty">未找到资源</div>
    )}
  </section>
)}
```

- [ ] **Step 3: 在 SubjectDetail.css 中添加磁力链接面板样式**

在文件末尾添加：

```css
/* Magnet Panel */
.sd-magnet-panel {
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  padding: 16px;
}

.sd-magnet-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.sd-magnet-panel-header .sd-section-title {
  margin-bottom: 0;
}

.sd-magnet-panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-input);
  color: var(--text-secondary);
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all var(--transition-fast);
}

.sd-magnet-panel-close:hover {
  background: var(--primary-bg);
  color: var(--primary);
}

.sd-magnet-ep-group {
  margin-bottom: 16px;
}

.sd-magnet-ep-group:last-child {
  margin-bottom: 0;
}

.sd-magnet-ep-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  padding-left: 4px;
}
```

- [ ] **Step 4: 验证"站内观看"流程**

Run: `cd ANISpace && npm run dev`
Expected: 点击"站内观看"后，在详情页内展开磁力链接面板，显示每集的 BT 资源列表

---

### Task 4: VideoPlayer — BT 播放整合 DPlayer

**Files:**
- Modify: `src/components/Video/VideoPlayer.jsx`

这是最核心的改动。将 BT 播放分支从"原生 `<video>` + WebTorrent"重构为"DPlayer + WebTorrent renderTo"。

- [ ] **Step 1: 添加新的状态变量**

在 VideoPlayer 组件内，现有 `torrentProgress` 状态之后添加：

```jsx
const [torrentFiles, setTorrentFiles] = useState([]); // 种子内视频文件列表
const [selectedFileIndex, setSelectedFileIndex] = useState(0); // 当前选中文件索引
const [torrentConnecting, setTorrentConnecting] = useState(false); // 正在连接节点
const torrentClientRef = useRef(null); // WebTorrent client 实例
```

- [ ] **Step 2: 重构 BT 播放分支（downloadKind === 'magnet'）**

将 VideoPlayer.jsx 中 L243-L351 的 `if (downloadKind === 'magnet')` 分支替换为以下代码。**修改原因**：原代码使用原生 `<video>` 播放，无弹幕/进度保存；新代码整合 DPlayer，通过 `file.renderTo(dp.video)` 注入流。

```jsx
if (downloadKind === 'magnet' || downloadKind === 'torrent') {
  const trackerList = [
    'udp://tracker1.itzmx.com:8080/announce',
    'udp://moonburrow.club:6969/announce',
    'udp://new-line.net:6969/announce',
    'udp://opentrackr.io:6969/announce',
    'udp://tamas3.ynh.fr:6969/announce',
    'udp://tracker.bittor.pw:1337/announce',
    'udp://tracker.dump.cl:6969/announce',
    'udp://tracker2.dler.org:80/announce',
    'https://tracker.tamersunion.org:443/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.moeking.me:6969/announce',
    'udp://explodie.org:6969/announce',
    'udp://tracker.tiny-vps.com:6969/announce',
    'udp://retracker01-msk-virt.corbina.net:80/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'http://tracker.opentrackr.org:1337/announce',
    'http://nyaa.tracker.wf:7777/announce',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
  ];

  if (isTauri) {
    // Tauri: 调用 Rust 命令，使用 fx-torrent（保持不变）
    const initTauriTorrent = async () => {
      try {
        const streamUrl = await addTorrent(url, trackerList);
        if (!streamUrl) {
          setPlayError('Tauri BT 引擎返回空流地址');
          return;
        }
        console.log('[VideoPlayer] Tauri BT stream URL:', streamUrl);

        const container = playerContainerRef.current;
        const videoEl = document.createElement('video');
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        videoEl.controls = true;
        videoEl.autoplay = true;
        container.appendChild(videoEl);

        videoEl.src = streamUrl;
        videoEl.play().catch(e => console.warn('[VideoPlayer] autoplay blocked:', e));
      } catch (err) {
        setPlayError('Tauri BT 引擎错误: ' + (err.message || err));
      }
    };
    initTauriTorrent();
  } else {
    // Web: WebTorrent + DPlayer 整合
    const initWebTorrentWithDPlayer = async () => {
      try {
        await loadPlayerLibs;
      } catch (e) {
        console.error('[VideoPlayer] Failed to load player libs:', e);
      }

      if (!DPlayer) {
        setPlayError('DPlayer 加载失败，请刷新页面重试');
        return;
      }

      // 1. 初始化 DPlayer（空视频源，后续由 WebTorrent 注入）
      const playerConfig = {
        container: playerContainerRef.current,
        video: { url: '', pic: coverRef.current },
        autoplay: true,
        theme: '#fb7299',
        screenshot: true,
        hotkey: true,
        preload: 'auto',
        volume: 0.7,
      };

      // 弹幕配置
      playerConfig.danmaku = {
        id: `${subjectId}_${episodeId}`,
        maximum: 1000,
        bottom: '10%',
        unlimited: false,
      };
      playerConfig.apiBackend = {
        read: (endpoint, callback) => {
          callback({
            data: danmakuListRef.current.map(d => ({
              time: d.time,
              type: d.type,
              color: parseInt(String(d.color || '#ffffff').replace('#', ''), 16) || 0xffffff,
              author: d.author,
              text: d.text,
            })),
          });
        },
        send: (endpoint, danmaku, callback) => {
          callback();
        },
      };

      let dp;
      try {
        dp = new DPlayer(playerConfig);
        playerRef.current = dp;
      } catch (err) {
        console.error('[VideoPlayer] DPlayer init error for BT:', err);
        setPlayError('播放器初始化失败: ' + (err.message || '未知错误'));
        return;
      }

      // 2. 加载 WebTorrent
      setTorrentConnecting(true);
      const { default: WebTorrent } = await import('webtorrent');
      const client = new WebTorrent({
        maxConns: 100,
        tracker: { announce: trackerList },
      });
      torrentRef.current = client;
      torrentClientRef.current = client;

      client.on('error', (err) => {
        setPlayError('WebTorrent 错误: ' + err.message);
        setTorrentConnecting(false);
      });

      // 3. 添加种子
      client.add(url, { announce: trackerList }, (torrent) => {
        setTorrentConnecting(false);

        // 过滤视频文件
        const videoExts = /\.(mp4|mkv|avi|wmv|flv|webm|mov|ts|m4v)$/i;
        const videoFiles = torrent.files.filter(f => videoExts.test(f.name));
        const filesToShow = videoFiles.length > 0 ? videoFiles : [torrent.files.sort((a, b) => b.length - a.length)[0]];

        setTorrentFiles(filesToShow.map((f, i) => ({
          name: f.name,
          size: f.length,
          index: i,
          file: f,
        })));
        setSelectedFileIndex(0);

        // 4. 渲染最大文件到 DPlayer 的 video 元素
        const file = filesToShow[0];
        file.renderTo(dp.video, (err) => {
          if (err) {
            console.error('[VideoPlayer] renderTo error:', err);
            setPlayError('视频渲染失败: ' + err.message);
          }
        });

        // 5. 进度监听
        torrent.on('download', () => {
          setTorrentProgress({
            progress: Math.round(torrent.progress * 100),
            downloadSpeed: Math.round(torrent.downloadSpeed / 1024),
            numPeers: torrent.numPeers,
          });
        });

        torrent.on('error', (err) => {
          setPlayError('种子下载失败: ' + err.message);
          setTorrentConnecting(false);
        });
      });

      // 6. 进度保存（复用 DPlayer 事件）
      const progressKey = `acg_v2_progress_${subjectId}_${episodeId}_${currentMedia?.sourceId}`;
      dp.on('timeupdate', () => {
        const currentTime = dp.video.currentTime;
        const duration = dp.video.duration;
        if (duration > 0 && currentTime > 5) {
          localStorage.setItem(progressKey, JSON.stringify({
            time: currentTime,
            duration,
            updatedAt: Date.now(),
          }));
        }
      });

      dp.on('loadedmetadata', () => {
        try {
          const saved = JSON.parse(localStorage.getItem(progressKey));
          if (saved?.time && saved?.duration) {
            const ratio = saved.time / saved.duration;
            if (ratio > 0.05 && ratio < 0.95) {
              dp.seek(saved.time);
            }
          }
        } catch {}
      });

      dp.on('error', () => {
        setPlayError('视频播放失败，请尝试切换播放源或剧集');
      });
    };
    initWebTorrentWithDPlayer();
  }

  return () => {
    if (torrentRef.current) {
      torrentRef.current.destroy();
      torrentRef.current = null;
    }
    if (torrentClientRef.current) {
      torrentClientRef.current = null;
    }
    setTorrentFiles([]);
    setSelectedFileIndex(0);
    const container = playerContainerRef.current;
    if (container) {
      const videos = container.querySelectorAll('video:not(.dplayer-video)');
      videos.forEach(v => v.remove());
    }
  };
}
```

- [ ] **Step 3: 添加文件切换处理函数**

在 `handleSourceSwitch` 回调之后添加：

```jsx
// 种子内文件切换
const handleTorrentFileSwitch = useCallback((index) => {
  if (!torrentFiles[index] || !playerRef.current) return;

  const file = torrentFiles[index].file;
  setSelectedFileIndex(index);

  // 重新渲染到 DPlayer 的 video 元素
  file.renderTo(playerRef.current.video, (err) => {
    if (err) {
      setPlayError('切换文件失败: ' + err.message);
    }
  });
}, [torrentFiles]);
```

- [ ] **Step 4: 添加 .torrent 文件上传处理**

在 `handleTorrentFileSwitch` 之后添加：

```jsx
// .torrent 文件上传
const handleTorrentUpload = useCallback((e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // 构造一个 media 对象，kind 为 'torrent'
  const uploadedMedia = {
    mediaId: `upload_${Date.now()}`,
    sourceId: 'upload',
    title: file.name,
    originalTitle: file.name,
    publishedTime: Date.now(),
    location: MediaSourceLocationONLINE,
    kind: MediaSourceKindBITTORRENT,
    download: { kind: 'torrent', url: file.name },
    properties: {
      subjectName: '',
      episodeName: '',
      subtitleLanguageIds: [],
      resolution: '',
      alliance: '本地上传',
      size: FileSizeUnspecified,
    },
  };

  // 将 File 对象存储到 ref，供 WebTorrent 使用
  uploadedFileRef.current = file;
  setCurrentMedia(uploadedMedia);
}, []);
```

需要在组件顶部添加 ref：

```jsx
const uploadedFileRef = useRef(null);
```

并在 import 中添加类型引用：

```jsx
import { MediaSourceLocation, MediaSourceKind, FileSize as FileSizeConst } from '../../services/media/types';
const MediaSourceLocationONLINE = MediaSourceLocation.ONLINE;
const MediaSourceKindBITTORRENT = MediaSourceKind.BITTORRENT;
const FileSizeUnspecified = FileSizeConst.Unspecified;
```

- [ ] **Step 5: 修改 WebTorrent add 调用以支持 .torrent 文件上传**

在 Step 2 的 `client.add(url, ...)` 调用处，修改为：

```jsx
// 判断是上传的 .torrent 文件还是磁力链接
const torrentInput = uploadedFileRef.current || url;
client.add(torrentInput, { announce: trackerList }, (torrent) => {
  // ... 后续逻辑不变
});
```

- [ ] **Step 6: 在 JSX 中添加文件选择器和上传按钮**

在 `vp-torrent-info` div 之后添加：

```jsx
{/* Torrent file selector */}
{torrentFiles.length > 1 && (
  <div className="vp-torrent-files">
    <span className="vp-torrent-files-label">种子内文件：</span>
    <div className="vp-torrent-files-list">
      {torrentFiles.map((f, idx) => (
        <button
          key={idx}
          className={`vp-torrent-file-btn ${idx === selectedFileIndex ? 'active' : ''}`}
          onClick={() => handleTorrentFileSwitch(idx)}
          title={f.name}
        >
          <span className="vp-torrent-file-name">{f.name}</span>
          <span className="vp-torrent-file-size">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
        </button>
      ))}
    </div>
  </div>
)}

{/* Torrent connecting indicator */}
{torrentConnecting && (
  <div className="vp-torrent-info">
    <Loader2 size={14} className="vp-spinning" />
    <span>正在连接节点...</span>
  </div>
)}
```

在 `vp-header-actions` div 中，剧集/资源按钮之后添加上传按钮：

```jsx
<button
  className="vp-toggle-btn"
  onClick={() => document.getElementById('vp-torrent-upload')?.click()}
  title="上传种子文件"
>
  <Upload size={16} />
  <span>上传种子</span>
</button>
<input
  id="vp-torrent-upload"
  type="file"
  accept=".torrent"
  style={{ display: 'none' }}
  onChange={handleTorrentUpload}
/>
```

需要在 import 中添加 `Upload` 图标：

```jsx
import { ArrowLeft, Play, Server, ChevronLeft, ChevronRight, Loader2, List, Layers, Upload } from 'lucide-react';
```

- [ ] **Step 7: 验证 BT 播放整合**

Run: `cd ANISpace && npm run dev`
Expected: BT 资源播放时使用 DPlayer 界面，支持弹幕、进度保存；种子内多文件时显示文件选择器

---

### Task 5: VideoPlayer.css — 新增文件选择器和上传按钮样式

**Files:**
- Modify: `src/components/Video/VideoPlayer.css`

- [ ] **Step 1: 在 VideoPlayer.css 末尾添加样式**

```css
/* ─── Torrent File Selector ─── */
.vp-torrent-files {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-primary);
}

.vp-torrent-files-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.vp-torrent-files-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.vp-torrent-file-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
  max-width: 280px;
}

.vp-torrent-file-btn:hover {
  border-color: var(--primary);
  background: var(--primary-bg);
}

.vp-torrent-file-btn.active {
  border-color: var(--primary);
  background: var(--primary-bg);
  box-shadow: 0 0 0 2px rgba(232, 134, 162, 0.15);
}

.vp-torrent-file-name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.vp-torrent-file-size {
  font-size: 11px;
  color: var(--text-quaternary);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ─── Torrent Connecting Indicator ─── */
.vp-torrent-info .vp-spinning {
  animation: vp-spin 0.8s linear infinite;
}

@media (max-width: 768px) {
  .vp-torrent-file-btn {
    max-width: 200px;
  }

  .vp-torrent-file-name {
    max-width: 120px;
  }
}
```

- [ ] **Step 2: 验证样式渲染**

Run: `cd ANISpace && npm run dev`
Expected: 文件选择器按钮样式正确，选中状态高亮

---

### Task 6: 整体验证

- [ ] **Step 1: 启动开发服务器**

Run: `cd ANISpace && npm run dev`

- [ ] **Step 2: 验证完整流程**

1. 进入条目详情页 → 点击"站内观看" → 磁力链接面板展开
2. 点击磁力链接 → 跳转播放页 → WebTorrent + DPlayer 播放
3. 播放页点击"上传种子" → 选择 .torrent 文件 → 开始播放
4. 种子内多文件时 → 文件选择器出现 → 切换文件正常
5. 弹幕正常显示
6. 进度保存/恢复正常

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd ANISpace && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 验证 Vite 构建**

Run: `cd ANISpace && npm run build`
Expected: 构建成功
