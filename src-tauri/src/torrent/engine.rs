use fx_torrent::{FxTorrentSession, Session, SessionConfig, TorrentFlags};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Mutex;
use uuid::Uuid;

use super::{TorrentProgress, TorrentAddParams, ProxyStreamParams};

/// Default tracker list from animeko
const DEFAULT_TRACKERS: &[&str] = &[
    "udp://tracker1.itzmx.com:8080/announce",
    "udp://moonburrow.club:6969/announce",
    "udp://new-line.net:6969/announce",
    "udp://opentracker.io:6969/announce",
    "udp://tamas3.ynh.fr:6969/announce",
    "udp://tracker.bittor.pw:1337/announce",
    "udp://tracker.dump.cl:6969/announce",
    "udp://tracker2.dler.org:80/announce",
    "https://tracker.tamersunion.org:443/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.moeking.me:6969/announce",
    "udp://explodie.org:6969/announce",
    "udp://tracker.tiny-vps.com:6969/announce",
    "udp://retracker01-msk-virt.corbina.net:80/announce",
    "udp://tracker.opentrackr.org:1337/announce",
    "http://tracker.opentrackr.org:1337/announce",
    "http://nyaa.tracker.wf:7777/announce",
    "wss://tracker.openwebtorrent.com",
    "wss://tracker.btorrent.xyz",
];

struct ActiveTorrent {
    id: String,
    info_hash: String,
    name: String,
}

pub struct TorrentEngine {
    app: AppHandle,
    session: Arc<Mutex<Option<FxTorrentSession>>>,
    torrents: Arc<Mutex<HashMap<String, ActiveTorrent>>>,
    proxy_port: u16,
}

impl TorrentEngine {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            session: Arc::new(Mutex::new(None)),
            torrents: Arc::new(Mutex::new(HashMap::new())),
            proxy_port: 18309,
        }
    }

    async fn ensure_session(&self) -> Result<(), String> {
        let mut session = self.session.lock().await;
        if session.is_none() {
            // Create temp download directory
            let temp_dir = std::env::temp_dir().join("anispace-torrents");
            std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

            let fx_session = FxTorrentSession::builder()
                .config(
                    SessionConfig::builder()
                        .base_path(temp_dir.to_string_lossy().to_string())
                        .client_name("ANISpace")
                        .listen_interfaces("0.0.0.0:6881".to_string())
                        .build(),
                )
                .default_extensions()
                .build()
                .map_err(|e| e.to_string())?;

            *session = Some(fx_session);
        }
        Ok(())
    }

    pub async fn add_torrent(
        &self,
        magnet_url: String,
        trackers: Vec<String>,
    ) -> Result<String, String> {
        self.ensure_session().await?;

        let session = self.session.lock().await;
        let fx_session = session.as_ref().ok_or("Session not initialized")?;

        // Add torrent from magnet URI
        let torrent = fx_session
            .add_torrent_from_uri(&magnet_url, TorrentFlags::default())
            .await
            .map_err(|e| format!("Failed to add torrent: {}", e))?;

        let torrent_id = Uuid::new_v4().to_string();
        let info_hash = torrent.info_hash().to_string();
        let name = torrent.name().unwrap_or("Unknown").to_string();

        // Add trackers
        let all_trackers: Vec<String> = trackers
            .into_iter()
            .chain(DEFAULT_TRACKERS.iter().map(|s| s.to_string()))
            .collect();

        for tracker in &all_trackers {
            let _ = torrent.add_tracker(tracker);
        }

        // Resume download
        torrent.resume();

        // Store torrent info
        let mut torrents = self.torrents.lock().await;
        torrents.insert(
            torrent_id.clone(),
            ActiveTorrent {
                id: torrent_id.clone(),
                info_hash,
                name,
            },
        );

        // Return local stream URL
        let stream_url = format!("http://localhost:{}/stream/{}", self.proxy_port, torrent_id);
        Ok(stream_url)
    }

    pub async fn get_progress(&self, torrent_id: &str) -> Result<TorrentProgress, String> {
        let torrents = self.torrents.lock().await;
        let _active = torrents
            .get(torrent_id)
            .ok_or("Torrent not found")?;

        // TODO: Get actual progress from fx-torrent
        // fx-torrent's TorrentHandle doesn't expose progress directly yet
        // We'll need to poll the torrent status
        Ok(TorrentProgress {
            torrent_id: torrent_id.to_string(),
            progress: 0.0,
            download_speed: 0,
            upload_speed: 0,
            num_peers: 0,
            num_seeds: 0,
            state: "downloading".to_string(),
        })
    }

    pub async fn remove_torrent(&self, torrent_id: &str) -> Result<(), String> {
        let mut torrents = self.torrents.lock().await;
        torrents
            .remove(torrent_id)
            .ok_or("Torrent not found")?;

        // TODO: Remove from fx-torrent session
        Ok(())
    }

    pub async fn proxy_stream(&self, url: String, referer: String) -> Result<String, String> {
        // Proxy a video stream URL through the local HTTP server
        // This allows bypassing CORS and geo-restrictions
        let proxy_id = Uuid::new_v4().to_string();
        let proxy_url = format!(
            "http://localhost:{}/proxy?id={}&url={}&referer={}",
            self.proxy_port,
            proxy_id,
            urlencoding::encode(&url),
            urlencoding::encode(&referer),
        );
        Ok(proxy_url)
    }
}
