mod torrent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize torrent engine
            let torrent_engine = torrent::TorrentEngine::new(app.handle().clone());
            app.manage(torrent_engine);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            torrent::torrent_add,
            torrent::torrent_progress,
            torrent::torrent_remove,
            torrent::proxy_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
