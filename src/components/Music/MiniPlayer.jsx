import { useMusic, FALLBACK_COVER } from '../../context/MusicContext';
import { useWindowManager } from '../../context/WindowManager';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import './MiniPlayer.css';

export default function MiniPlayer() {
  const { currentSong, playing, togglePlay, playNext, playPrev } = useMusic();
  const { windows, focusWindow } = useWindowManager();

  const visible = windows.music?.open && windows.music?.minimized && currentSong;

  if (!visible) return null;

  const handleBarClick = (e) => {
    if (e.target.closest('.mini-player-btn')) return;
    focusWindow('music');
  };

  return (
    <div className="mini-player" onClick={handleBarClick}>
      <img
        src={currentSong.albumCover || FALLBACK_COVER}
        alt=""
        className="mini-player-cover"
        loading="lazy"
        onError={e => { e.target.src = FALLBACK_COVER; }}
      />
      <div className="mini-player-info">
        <span className="mini-player-name">{currentSong.name}</span>
        <span className="mini-player-artist">{currentSong.artists}</span>
      </div>
      <div className="mini-player-controls">
        <button className="mini-player-btn" onClick={playPrev} title="上一首">
          <SkipBack size={14} />
        </button>
        <button className="mini-player-btn mini-player-btn-play" onClick={togglePlay} title={playing ? '暂停' : '播放'}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="mini-player-btn" onClick={playNext} title="下一首">
          <SkipForward size={14} />
        </button>
      </div>
    </div>
  );
}
