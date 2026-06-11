import { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useMusic, FALLBACK_COVER, formatDuration } from '../../context/MusicContext';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Search, Music, X, List, ChevronDown, ChevronUp, Heart, RotateCw, Headphones, Import, Plus, FolderOpen, ArrowLeft, Disc3 } from 'lucide-react';
import './MusicPlayer.css';

export default function MusicPlayer() {
  const { isAuthenticated, openAuth } = useApp();
  const {
    currentSong, playing, playlist, volume, muted,
    currentTime, duration, mode, savedPlaylists, history,
    loading, error,
    playSong, togglePlay, playNext, playPrev,
    setVolume, toggleMute, seekTo,
    removeFromPlaylist, importPlaylist, loadSavedPlaylist, deleteSavedPlaylist,
    search, setMode, setPlaylist, setError,
  } = useMusic();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importId, setImportId] = useState('');
  const [importServer, setImportServer] = useState('netease');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [activePlaylistView, setActivePlaylistView] = useState(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const results = await search(query);
      setSearchResults(results);
    } catch (err) {
      setError('搜索失败，请稍后重试');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, search, setError]);

  const handleGlobalSearch = useCallback(() => {
    if (!globalSearchQuery.trim()) { setGlobalSearchResults([]); return; }
    setGlobalSearching(true);
    const q = globalSearchQuery.toLowerCase();
    const results = [];
    savedPlaylists.forEach(pl => {
      (pl.songs || []).forEach(song => {
        const name = (song.name || '').toLowerCase();
        const artists = (song.artists || '').toLowerCase();
        const album = (song.album || '').toLowerCase();
        if (name.includes(q) || artists.includes(q) || album.includes(q)) {
          results.push({ ...song, playlistId: pl.id, playlistName: pl.name });
        }
      });
    });
    setGlobalSearchResults(results);
    setGlobalSearching(false);
  }, [globalSearchQuery, savedPlaylists]);

  useEffect(() => {
    if (globalSearchQuery.trim()) {
      const timer = setTimeout(handleGlobalSearch, 200);
      return () => clearTimeout(timer);
    } else {
      setGlobalSearchResults([]);
    }
  }, [globalSearchQuery]);

  const jumpToPlaylistSong = (song) => {
    const pl = savedPlaylists.find(p => p.id === song.playlistId);
    if (pl) {
      setPlaylist(pl.songs || []);
      setActivePlaylistView(pl);
      playSong(song);
    }
  };

  const handleImportPlaylist = useCallback(async () => {
    if (!importId.trim()) { setImportError('请输入歌单ID'); return; }
    setImporting(true);
    setImportError('');
    try {
      await importPlaylist(importId, importServer);
      setShowImport(false);
      setImportId('');
      setShowPlaylist(true);
    } catch (err) {
      setImportError(err.message || '导入失败，请检查歌单ID或网络连接');
    } finally {
      setImporting(false);
    }
  }, [importId, importServer, importPlaylist]);

  const handleLoadSavedPlaylist = (pl) => {
    loadSavedPlaylist(pl);
    setActivePlaylistView(pl);
    setShowPlaylist(true);
  };

  const handleDeleteSavedPlaylist = (id) => {
    deleteSavedPlaylist(id);
    if (activePlaylistView?.id === id) setActivePlaylistView(null);
  };

  const handleProgressClick = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekTo(pct);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="music-page">
      <div className="music-header">
        <div className="music-title">
          <Headphones size={22} />
          <h1>Echoes</h1>
        </div>
        <div className="music-header-actions">
          <div className="music-source-switch">
            <button className={`source-btn ${mode === 'netease' ? 'active' : ''}`} onClick={() => setMode('netease')}>网易云</button>
            <button className={`source-btn ${mode === 'qq' ? 'active' : ''}`} onClick={() => setMode('qq')}>QQ音乐</button>
          </div>
          <button className="music-import-trigger" onClick={() => setShowImport(!showImport)} title="导入歌单">
            <Import size={16} /> 导入歌单
          </button>
        </div>
      </div>

      {showImport && (
        <div className="music-import-panel">
          <h3>导入歌单</h3>
          <p className="music-import-hint">输入网易云或QQ音乐的歌单ID即可导入整个歌单</p>
          <div className="music-import-form">
            <div className="import-server-select">
              <button className={`import-server-btn ${importServer === 'netease' ? 'active' : ''}`} onClick={() => setImportServer('netease')}>网易云</button>
              <button className={`import-server-btn ${importServer === 'qq' ? 'active' : ''}`} onClick={() => setImportServer('qq')}>QQ音乐</button>
            </div>
            <div className="import-id-input">
              <input placeholder={importServer === 'netease' ? '输入网易云歌单ID（如：2379161415）' : '输入QQ音乐歌单ID（如：7467858608）'} value={importId} onChange={e => setImportId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleImportPlaylist()} />
              <button className="import-go-btn" onClick={handleImportPlaylist} disabled={importing}>
                {importing ? <RotateCw size={14} className="spin" /> : <Plus size={14} />} 导入
              </button>
            </div>
            {importError && <p className="music-import-error">{importError}</p>}
            <div className="import-help">
              <p><strong>如何获取歌单ID？</strong></p>
              <p>{importServer === 'netease' ? '打开网易云音乐网页版，进入歌单页面，URL中的数字即为歌单ID（如：playlist?id=2379161415）' : '打开QQ音乐网页版，进入歌单页面，URL中的数字即为歌单ID（如：disstid=7467858608）'}</p>
              <p><strong>提示：</strong>歌单中的VIP歌曲可能无法播放，建议选择免费歌单</p>
            </div>
          </div>
        </div>
      )}

      <div className="music-body">
        <div className="music-left">
          {activePlaylistView ? (
            <div className="music-playlist-detail">
              <div className="music-pl-detail-header">
                <button className="music-pl-back" onClick={() => setActivePlaylistView(null)}>
                  <ArrowLeft size={16} /> 返回
                </button>
                <img src={activePlaylistView.cover || FALLBACK_COVER} alt="" className="music-pl-detail-cover" loading="lazy" onError={e => { e.target.src = FALLBACK_COVER; }} />
                <div className="music-pl-detail-info">
                  <h2>{activePlaylistView.name}</h2>
                  <span className="music-pl-detail-meta">{activePlaylistView.songCount}首 · {activePlaylistView.server === 'netease' ? '网易云' : 'QQ音乐'}</span>
                  <button className="music-pl-play-all" onClick={() => { if (activePlaylistView.songs?.length > 0) { setPlaylist(activePlaylistView.songs); playSong(activePlaylistView.songs[0]); } }}>
                    <Play size={14} /> 播放全部
                  </button>
                </div>
              </div>
              <div className="music-pl-detail-songs">
                {(activePlaylistView.songs || []).map((song, i) => (
                  <div key={song.id || i} className={`music-song-item ${currentSong?.id === song.id ? 'active' : ''}`} onClick={() => playSong(song)}>
                    <span className="music-song-index">{i + 1}</span>
                    <img src={song.albumCover || FALLBACK_COVER} alt="" className="music-song-cover" loading="lazy" onError={e => { e.target.src = FALLBACK_COVER; }} />
                    <div className="music-song-info">
                      <span className="music-song-name">{song.name}</span>
                      <span className="music-song-artist">{song.artists}</span>
                    </div>
                    {song.duration > 0 && <span className="music-song-dur">{formatDuration(song.duration)}</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="music-search">
                <div className="music-search-bar">
                  <Search size={16} />
                  <input placeholder="搜索歌曲、歌手..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }} />
                  <button className="music-search-btn" onClick={handleSearch} disabled={searching}>{searching ? <RotateCw size={14} className="spin" /> : '搜索'}</button>
                </div>
                {error && <p className="music-error">{error}</p>}
              </div>

              {savedPlaylists.length > 0 && (
                <div className="music-global-search">
                  <div className="music-global-search-bar">
                    <Disc3 size={14} />
                    <input placeholder="在歌单中搜索..." value={globalSearchQuery} onChange={e => setGlobalSearchQuery(e.target.value)} />
                    {globalSearchQuery && <button className="music-global-clear" onClick={() => { setGlobalSearchQuery(''); setGlobalSearchResults([]); }}><X size={12} /></button>}
                  </div>
                  {globalSearchResults.length > 0 && (
                    <div className="music-global-results">
                      <span className="music-global-results-label">在歌单中找到 {globalSearchResults.length} 首</span>
                      {globalSearchResults.slice(0, 20).map((song, i) => (
                        <div key={`${song.id}-${i}`} className="music-song-item global-result" onClick={() => jumpToPlaylistSong(song)}>
                          <img src={song.albumCover || FALLBACK_COVER} alt="" className="music-song-cover" loading="lazy" onError={e => { e.target.src = FALLBACK_COVER; }} />
                          <div className="music-song-info">
                            <span className="music-song-name">{song.name}</span>
                            <span className="music-song-artist">{song.artists}</span>
                          </div>
                          <span className="music-song-playlist-tag">{song.playlistName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {savedPlaylists.length > 0 && (
                <div className="music-saved-playlists">
                  <h3>我的歌单</h3>
                  <div className="music-saved-list">
                    {savedPlaylists.map(pl => (
                      <div key={pl.id} className="music-saved-pl-item" onClick={() => handleLoadSavedPlaylist(pl)}>
                        <img src={pl.cover || FALLBACK_COVER} alt="" className="music-saved-pl-cover" loading="lazy" onError={e => { e.target.src = FALLBACK_COVER; }} />
                        <div className="music-saved-pl-info">
                          <span className="music-saved-pl-name">{pl.name}</span>
                          <span className="music-saved-pl-meta">{pl.songCount}首 · {pl.server === 'netease' ? '网易云' : 'QQ音乐'}</span>
                        </div>
                        <button className="music-saved-pl-del" onClick={e => { e.stopPropagation(); handleDeleteSavedPlaylist(pl.id); }}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="music-results">
                {searchResults.length === 0 && !searching && !globalSearchQuery && (
                  <div className="music-results-empty">
                    <Music size={32} />
                    <p>搜索你喜欢的音乐吧~</p>
                  </div>
                )}
                {searchResults.map(song => (
                  <div key={song.id || song.mid} className={`music-song-item ${currentSong?.id === song.id ? 'active' : ''}`} onClick={() => playSong(song)}>
                    <img src={song.albumCover || FALLBACK_COVER} alt="" className="music-song-cover" loading="lazy" onError={e => { e.target.src = FALLBACK_COVER; }} />
                    <div className="music-song-info">
                      <span className="music-song-name">{song.name}</span>
                      <span className="music-song-artist">{song.artists}</span>
                    </div>
                    {song.duration > 0 && <span className="music-song-dur">{formatDuration(song.duration)}</span>}
                  </div>
                ))}
              </div>

              {history.length > 0 && (
                <div className="music-history">
                  <h3>播放历史</h3>
                  <div className="music-history-list">
                    {history.slice(0, 10).map(song => (
                      <div key={song.id} className="music-song-item mini" onClick={() => playSong(song)}>
                        <img src={song.albumCover || FALLBACK_COVER} alt="" className="music-song-cover mini" loading="lazy" onError={e => { e.target.src = FALLBACK_COVER; }} />
                        <div className="music-song-info">
                          <span className="music-song-name">{song.name}</span>
                          <span className="music-song-artist">{song.artists}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="music-right">
          <div className="music-now-playing">
            <div className="music-cover-wrap">
              <img src={currentSong?.albumCover || FALLBACK_COVER} alt="" className={`music-cover-large ${playing ? 'spinning' : ''}`} loading="lazy" onError={e => { e.target.src = FALLBACK_COVER; }} />
            </div>
            <div className="music-song-detail">
              <h2>{currentSong?.name || '未播放'}</h2>
              <p>{currentSong?.artists || '选择一首歌开始播放'}</p>
              {currentSong?.album && <p className="music-album-name">{currentSong.album}</p>}
            </div>

            <div className="music-progress" onClick={handleProgressClick}>
              <span className="music-time">{formatDuration(currentTime)}</span>
              <div className="music-progress-track">
                <div className="music-progress-bar" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="music-time">{formatDuration(duration)}</span>
            </div>

            <div className="music-controls">
              <button className="music-ctrl-btn" onClick={playPrev} title="上一首"><SkipBack size={18} /></button>
              <button className="music-ctrl-btn play" onClick={togglePlay} disabled={!currentSong} title={playing ? '暂停' : '播放'}>
                {loading ? <RotateCw size={20} className="spin" /> : playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button className="music-ctrl-btn" onClick={playNext} title="下一首"><SkipForward size={18} /></button>
              <div className="music-volume">
                <button className="music-ctrl-btn" onClick={toggleMute}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
                <input type="range" className="music-volume-slider" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={e => setVolume(parseFloat(e.target.value))} />
              </div>
              <button className={`music-ctrl-btn ${showPlaylist ? 'active' : ''}`} onClick={() => setShowPlaylist(!showPlaylist)} title="播放列表"><List size={16} /></button>
            </div>
          </div>

          {showPlaylist && (
            <div className="music-playlist">
              <h3>播放列表 ({playlist.length})</h3>
              {playlist.length === 0 ? (
                <p className="music-pl-empty">播放列表为空</p>
              ) : (
                playlist.map(song => (
                  <div key={song.id || song.mid} className={`music-pl-item ${currentSong?.id === song.id ? 'active' : ''}`} onClick={() => playSong(song)}>
                    <span className="music-pl-name">{song.name}</span>
                    <span className="music-pl-artist">{song.artists}</span>
                    <button className="music-pl-remove" onClick={e => { e.stopPropagation(); removeFromPlaylist(song.id); }}><X size={12} /></button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
