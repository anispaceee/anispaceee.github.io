/**
 * BT 播放适配层
 * Web 端：使用 WebTorrent（WebRTC）
 * Tauri 端：调用 Rust 命令（fx-torrent，TCP/UDP + DHT）
 */

// 检测运行环境
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface TorrentProgressInfo {
  torrentId: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  numSeeds: number;
  state: string;
}

/**
 * 添加磁力链接并开始下载
 * @returns 本地流 URL（Tauri 端）或空字符串（Web 端）
 */
export async function addTorrent(
  magnetUrl: string,
  trackers: string[],
): Promise<string> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const streamUrl = await invoke<string>('torrent_add', {
        params: { magnetUrl, trackers },
      });
      console.log('[TorrentAdapter] Tauri torrent added, stream URL:', streamUrl);
      return streamUrl;
    } catch (err) {
      console.error('[TorrentAdapter] Tauri torrent_add failed:', err);
      throw err;
    }
  }
  // Web 端返回空字符串，由 VideoPlayer 使用 WebTorrent
  return '';
}

/**
 * 获取下载进度
 */
export async function getTorrentProgress(
  torrentId: string,
): Promise<TorrentProgressInfo | null> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<TorrentProgressInfo>('torrent_progress', {
        torrentId,
      });
    } catch (err) {
      console.error('[TorrentAdapter] Tauri torrent_progress failed:', err);
      return null;
    }
  }
  return null;
}

/**
 * 移除种子
 */
export async function removeTorrent(torrentId: string): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('torrent_remove', { torrentId });
    } catch (err) {
      console.error('[TorrentAdapter] Tauri torrent_remove failed:', err);
    }
  }
}

/**
 * 代理视频流 URL（仅 Tauri 端可用）
 * 通过 Rust 端代理视频流，解决 CORS 和地理限制
 * @returns 本地代理 URL
 */
export async function proxyStreamUrl(
  url: string,
  referer: string,
): Promise<string> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string>('proxy_stream', {
        params: { url, referer },
      });
    } catch (err) {
      console.error('[TorrentAdapter] Tauri proxy_stream failed:', err);
      return url; // 回退到原始 URL
    }
  }
  return url; // Web 端不代理
}

/**
 * 获取 MacCMS 视频流的播放 URL
 * Tauri 端：通过 Rust 代理（解决 CORS 和地理限制）
 * Web 端：直接使用原始 URL（直连 CDN）
 */
export async function getStreamUrl(
  originalUrl: string,
  proxyUrl?: string,
  referer?: string,
): Promise<string> {
  if (isTauri && referer) {
    // Tauri 端优先使用 Rust 代理
    return proxyStreamUrl(originalUrl, referer);
  }
  // Web 端直接返回原始 URL
  return originalUrl;
}
