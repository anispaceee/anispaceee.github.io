import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { QQMusicService, NetEaseMusicService, StorageService } from '../services/api';

const MusicContext = createContext(null);

const STORAGE_KEY = 'acg_music_history';
const PLAYLIST_STORAGE = 'acg_saved_playlists';
const VOLUME_STORAGE = 'anispace_music_vol';
const DEFAULT_PLAYLIST_ID = '8464409595';

export const FALLBACK_COVER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" fill="%23f9f3f5"%3E%3Crect width="300" height="300" rx="10"/%3E%3Ctext x="150" y="145" text-anchor="middle" fill="%23d4b8c0" font-size="40"%3E🎵%3C/text%3E%3Ctext x="150" y="180" text-anchor="middle" fill="%23d4b8c0" font-size="12"%3EANISpace%3C/text%3E%3C/svg%3E';

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function MusicProvider({ children }) {
  const audioRef = useRef(null);
  const [currentSong, setCurrentSong] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [playlist, setPlaylist] = useState([]);
  const [volume, setVolumeState] = useState(() => parseFloat(localStorage.getItem(VOLUME_STORAGE) || '0.7'));
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mode, setMode] = useState('netease');
  const [savedPlaylists, setSavedPlaylists] = useState(() => StorageService.get(PLAYLIST_STORAGE, []));
  const [history, setHistory] = useState(() => StorageService.get(STORAGE_KEY, []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Refs to hold latest values for audio event handlers (avoids stale closures)
  const playNextRef = useRef(null);

  // Sync volume to audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // Persist volume
  useEffect(() => {
    localStorage.setItem(VOLUME_STORAGE, String(volume));
  }, [volume]);

  // Pre-import default playlist on first load
  useEffect(() => {
    if (savedPlaylists.length !== 0) return;
    let cancelled = false;
    NetEaseMusicService.getPlaylistDetail(DEFAULT_PLAYLIST_ID).then(data => {
      if (cancelled || !data || !data.tracks || data.tracks.length === 0) return;
      const saved = [{
        id: Date.now().toString(),
        name: data.name || '默认歌单',
        cover: data.coverImgUrl || data.tracks[0]?.albumCover || '',
        server: 'netease',
        sourceId: DEFAULT_PLAYLIST_ID,
        songCount: data.tracks.length,
        songs: data.tracks,
        createdAt: new Date().toISOString(),
      }];
      // 仅在用户尚未导入任何歌单时写入，避免异步返回覆盖用户已选歌单
      setSavedPlaylists(prev => {
        if (prev.length > 0) return prev;
        StorageService.set(PLAYLIST_STORAGE, saved);
        return saved;
      });
      // 仅在当前播放列表为空时填充默认歌单，避免打断用户已开始的播放
      setPlaylist(prev => (prev && prev.length > 0 ? prev : data.tracks));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Audio event handlers - registered once, use refs for callbacks
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime * 1000);
    const onLoadedMetadata = () => setDuration(audio.duration * 1000);
    const onEnded = () => {
      setPlaying(false);
      if (playNextRef.current) playNextRef.current();
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const playSong = useCallback(async (song) => {
    setLoading(true);
    setError('');
    try {
      let url = song.url || '';
      if (!url) {
        if (mode === 'qq' && song.mid) {
          url = await QQMusicService.getSongUrl(song.mid);
        } else if (song.id) {
          url = await NetEaseMusicService.getSongUrl(song.id);
        }
      }
      if (!url) { setError('无法获取播放链接'); setLoading(false); return; }
      setCurrentSong({ ...song, url });
      setPlaylist(prev => {
        if (prev.find(s => s.id === song.id)) return prev;
        return [...prev, song];
      });
      setHistory(prev => {
        const newHistory = [song, ...prev.filter(s => s.id !== song.id)].slice(0, 50);
        StorageService.set(STORAGE_KEY, newHistory);
        return newHistory;
      });
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
      }
    } catch (err) {
      setError('播放失败');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !currentSong) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
  }, [currentSong, playing]);

  const playNext = useCallback(() => {
    if (!currentSong || playlist.length === 0) return;
    const idx = playlist.findIndex(s => s.id === currentSong.id);
    const next = playlist[(idx + 1) % playlist.length];
    if (next) playSong(next);
  }, [currentSong, playlist, playSong]);

  const playPrev = useCallback(() => {
    if (!currentSong || playlist.length === 0) return;
    const idx = playlist.findIndex(s => s.id === currentSong.id);
    const prev = playlist[(idx - 1 + playlist.length) % playlist.length];
    if (prev) playSong(prev);
  }, [currentSong, playlist, playSong]);

  // Keep ref in sync with latest playNext
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const setVolume = useCallback((v) => {
    setVolumeState(v);
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(prev => !prev);
  }, []);

  const seekTo = useCallback((pct) => {
    if (!audioRef.current || !duration) return;
    audioRef.current.currentTime = pct * (duration / 1000);
  }, [duration]);

  const addToPlaylist = useCallback((song) => {
    setPlaylist(prev => {
      if (prev.find(s => s.id === song.id)) return prev;
      return [...prev, song];
    });
  }, []);

  const removeFromPlaylist = useCallback((id) => {
    setPlaylist(prev => prev.filter(s => s.id !== id));
  }, []);

  const importPlaylist = useCallback(async (id, server) => {
    let songs = [];
    let playlistName = '';
    let playlistCover = '';

    if (server === 'netease') {
      const data = await NetEaseMusicService.getPlaylistDetail(id.trim());
      if (data && data.tracks) {
        songs = data.tracks;
        playlistName = data.name || '导入的歌单';
        playlistCover = data.coverImgUrl || '';
      }
    } else {
      const data = await QQMusicService.getPlaylistDetail(id.trim());
      if (data) {
        songs = data.songlist || data.tracklist || [];
        playlistName = data.diss_name || data.name || '导入的歌单';
        playlistCover = data.logo || data.picurl || '';
      }
    }

    if (songs.length === 0) throw new Error('未找到歌曲，请检查歌单ID是否正确');

    setPlaylist(songs);
    const saved = [...savedPlaylists, {
      id: Date.now().toString(),
      name: playlistName,
      cover: playlistCover || songs[0]?.albumCover || '',
      server,
      sourceId: id.trim(),
      songCount: songs.length,
      songs,
      createdAt: new Date().toISOString(),
    }];
    setSavedPlaylists(saved);
    StorageService.set(PLAYLIST_STORAGE, saved);

    return songs;
  }, [savedPlaylists]);

  const loadSavedPlaylist = useCallback((pl) => {
    setPlaylist(pl.songs || []);
  }, []);

  const deleteSavedPlaylist = useCallback((id) => {
    const updated = savedPlaylists.filter(p => p.id !== id);
    setSavedPlaylists(updated);
    StorageService.set(PLAYLIST_STORAGE, updated);
  }, [savedPlaylists]);

  const search = useCallback(async (query) => {
    if (!query.trim()) return [];
    const results = mode === 'qq'
      ? await QQMusicService.search(query)
      : await NetEaseMusicService.search(query);
    return results;
  }, [mode]);

  const value = {
    currentSong,
    playing,
    playlist,
    volume,
    muted,
    currentTime,
    duration,
    mode,
    savedPlaylists,
    history,
    loading,
    error,
    audioRef,
    playSong,
    togglePlay,
    playNext,
    playPrev,
    setVolume,
    toggleMute,
    seekTo,
    addToPlaylist,
    removeFromPlaylist,
    importPlaylist,
    loadSavedPlaylist,
    deleteSavedPlaylist,
    search,
    setMode,
    setPlaylist,
    setError,
  };

  return (
    <MusicContext.Provider value={value}>
      {children}
      <audio ref={audioRef} />
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error('useMusic must be used within MusicProvider');
  return ctx;
}
