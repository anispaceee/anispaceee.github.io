# ANISpace Tauri 桌面端 + BT 播放增强设计文档

**日期**: 2026-06-13
**状态**: 已批准

## 1. 背景与动机

ANISpace 当前是纯 Web 应用（Vite + React SPA），视频播放存在两个根本性问题：

1. **BT 资源无法播放**：WebTorrent 只能通过 WebRTC 连接其他 WebTorrent 用户，无法连接普通 BT 客户端（qBittorrent/Transmission 等），导致磁力链接几乎无法播放
2. **MacCMS CDN 地理限制**：视频 CDN 检测到 Cloudflare Worker 的海外 IP 后返回 404，Worker 代理方案不可行

Animeko（桌面应用）使用原生 libtorrent 引擎，通过 TCP/UDP 直连普通 BT peer，播放成功率高。我们需要类似的桌面端能力。

## 2. 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 应用框架 | Tauri 2 | 用户熟悉 Rust，Tauri 体积小、性能好 |
| BT 引擎 | fx-torrent (纯 Rust) | 无需 C++ 编译工具链，跨平台，活跃维护 |
| 前端代码 | 100% 共享 | Web 端和 Tauri 端使用同一套 React 代码 |
| 后端架构 | 保持 Cloudflare Worker | 不改变现有 API 后端 |
| 视频流代理 | Tauri 端本地 HTTP 服务器 | 解决 CORS 和地理限制 |

## 3. 整体架构

```
┌─────────────────────────────────────────────┐
│              前端 (React SPA)                │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Wiki    │  │ 放課後   │  │ 站内观看   │ │
│  └─────────┘  └──────────┘  └─────┬──────┘ │
│                                    │        │
│              ┌─────────────────────┤        │
│              │  BT 播放适配层      │        │
│              │  Web: WebTorrent    │        │
│              │  Tauri: invoke→Rust │        │
│              └─────────┬───────────┘        │
└────────────────────────┼────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │  Web 端        │  Tauri 端      │
        │  WebTorrent    │  fx-torrent    │
        │  (WebRTC only) │  (TCP/UDP+DHT)│
        └────────────────┴────────────────┘
                         │
              ┌──────────┴──────────┐
              │  Cloudflare Worker  │
              │  (API 后端)         │
              └─────────────────────┘
```

## 4. 项目结构

```
ANISpace/
├── src/                    # 前端代码（Web + Tauri 共享）
│   ├── components/
│   ├── services/
│   │   ├── media/
│   │   │   ├── TorrentAdapter.ts   # BT 播放适配层（新增）
│   │   │   └── ...
│   │   └── ...
│   └── ...
├── src-tauri/              # Tauri 后端（新增）
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   └── torrent/        # BT 引擎模块
│   │       ├── mod.rs
│   │       ├── engine.rs   # fx-torrent 封装
│   │       └── server.rs   # 本地 HTTP 流服务器
│   └── tauri.conf.json
├── package.json
└── vite.config.js
```

## 5. BT 播放流程

### 5.1 Tauri 端

1. 前端调用 `invoke('torrent_add', { magnetUrl, trackers })`
2. Rust 端使用 fx-torrent 添加磁力链接，配置 tracker 列表
3. 下载开始后，Rust 端启动本地 HTTP 服务器（`http://localhost:18309/stream/{torrentId}`）
4. 前端用 hls.js / `<video>` 播放本地 HTTP 流
5. Rust 端通过事件 `torrent_progress` 向前端推送下载进度

### 5.2 Web 端

1. 使用 WebTorrent（保持现有行为）
2. 添加 animeko 的 tracker 列表提高连接率
3. BT 资源提供"复制链接"按钮作为备选

### 5.3 前端适配层

```typescript
// src/services/media/TorrentAdapter.ts
const isTauri = '__TAURI_INTERNALS__' in window;

export async function playTorrent(magnetUrl: string, trackers: string[]): Promise<string> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    const streamUrl = await invoke('torrent_add', { magnetUrl, trackers });
    return streamUrl; // "http://localhost:18309/stream/abc123"
  }
  // Web 端返回空字符串，由 VideoPlayer 使用 WebTorrent
  return '';
}

export async function getTorrentProgress(torrentId: string) {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('torrent_progress', { torrentId });
  }
  return null;
}

export async function removeTorrent(torrentId: string) {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('torrent_remove', { torrentId });
  }
}
```

## 6. Rust 端 BT 引擎

### 6.1 Cargo.toml 依赖

```toml
[dependencies]
tauri = { version = "2", features = [] }
fx-torrent = "0.9"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### 6.2 Tauri 命令

```rust
#[tauri::command]
async fn torrent_add(magnet_url: String, trackers: Vec<String>) -> Result<String, String> {
    // 1. 解析磁力链接
    // 2. 添加 tracker 列表
    // 3. 启动下载
    // 4. 返回本地流 URL
}

#[tauri::command]
async fn torrent_progress(torrent_id: String) -> Result<TorrentProgress, String> {
    // 返回下载进度、速度、peer 数
}

#[tauri::command]
async fn torrent_remove(torrent_id: String) -> Result<(), String> {
    // 停止下载并清理
}
```

### 6.3 本地 HTTP 流服务器

- 监听 `localhost:18309`
- 路由：`GET /stream/{torrent_id}` → 返回视频流
- 支持 Range 请求（拖动进度条）
- 支持 HLS：如果下载的是多文件种子，选择最大的视频文件

## 7. MacCMS 视频流代理（Tauri 端增强）

Tauri 端可以在 Rust 层代理视频流，解决 CORS 和地理限制：

```rust
#[tauri::command]
async fn proxy_stream(url: String, referer: String) -> Result<String, String> {
    // 1. 请求 m3u8 文件
    // 2. 重写相对 URL 为本地代理 URL
    // 3. 返回本地流 URL
}
```

本地代理路由：`GET /proxy?url=xxx&referer=xxx` → Rust 端请求原始 URL 并转发

## 8. Tracker 列表

使用 animeko 的 tracker 列表（22 个）：

```
udp://tracker1.itzmx.com:8080/announce
udp://moonburrow.club:6969/announce
udp://new-line.net:6969/announce
udp://opentracker.io:6969/announce
udp://tamas3.ynh.fr:6969/announce
udp://tracker.bittor.pw:1337/announce
udp://tracker.dump.cl:6969/announce
udp://tracker2.dler.org:80/announce
https://tracker.tamersunion.org:443/announce
udp://open.demonii.com:1337/announce
udp://open.stealth.si:80/announce
udp://tracker.torrent.eu.org:451/announce
udp://exodus.desync.com:6969/announce
udp://tracker.moeking.me:6969/announce
udp://explodie.org:6969/announce
udp://tracker.tiny-vps.com:6969/announce
udp://retracker01-msk-virt.corbina.net:80/announce
udp://tracker.opentrackr.org:1337/announce
http://tracker.opentrackr.org:1337/announce
http://nyaa.tracker.wf:7777/announce
wss://tracker.openwebtorrent.com
wss://tracker.btorrent.xyz
```

## 9. 构建与部署

### Web 端
- 保持现有 `vite build` + Cloudflare Pages 部署
- 不需要任何改动

### Tauri 端
- `npm run tauri build` 生成桌面安装包
- Windows: `.msi` / `.exe`
- macOS: `.dmg`
- Linux: `.AppImage` / `.deb`
- GitHub Actions 自动构建多平台

## 10. 实施步骤

1. 初始化 Tauri 2 项目（`npm create tauri-app`）
2. 集成 fx-torrent 到 Rust 后端
3. 实现 BT 引擎模块（engine.rs + server.rs）
4. 实现前端适配层（TorrentAdapter.ts）
5. 修改 VideoPlayer 使用适配层
6. 实现 MacCMS 视频流代理
7. 测试与调试
8. 配置 GitHub Actions 多平台构建
