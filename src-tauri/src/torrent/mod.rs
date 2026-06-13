mod engine;

use engine::TorrentEngine;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
pub struct TorrentProgress {
    pub torrent_id: String,
    pub progress: f64,
    pub download_speed: u64,
    pub upload_speed: u64,
    pub num_peers: u32,
    pub num_seeds: u32,
    pub state: String,
}

#[derive(Deserialize)]
pub struct TorrentAddParams {
    magnet_url: String,
    trackers: Vec<String>,
}

#[derive(Deserialize)]
pub struct ProxyStreamParams {
    url: String,
    referer: String,
}

/// Add a magnet link and start downloading
#[tauri::command]
async fn torrent_add(
    engine: State<'_, TorrentEngine>,
    params: TorrentAddParams,
) -> Result<String, String> {
    engine
        .add_torrent(params.magnet_url, params.trackers)
        .await
        .map_err(|e| e.to_string())
}

/// Get torrent download progress
#[tauri::command]
async fn torrent_progress(
    engine: State<'_, TorrentEngine>,
    torrent_id: String,
) -> Result<TorrentProgress, String> {
    engine
        .get_progress(&torrent_id)
        .await
        .map_err(|e| e.to_string())
}

/// Remove a torrent
#[tauri::command]
async fn torrent_remove(
    engine: State<'_, TorrentEngine>,
    torrent_id: String,
) -> Result<(), String> {
    engine
        .remove_torrent(&torrent_id)
        .await
        .map_err(|e| e.to_string())
}

/// Proxy a video stream URL through the local server
#[tauri::command]
async fn proxy_stream(
    engine: State<'_, TorrentEngine>,
    params: ProxyStreamParams,
) -> Result<String, String> {
    engine
        .proxy_stream(params.url, params.referer)
        .await
        .map_err(|e| e.to_string())
}
