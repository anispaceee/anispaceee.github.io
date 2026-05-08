import { useState, useRef, useEffect, useCallback } from 'react';
import { useDanmakuEngine } from './DanmakuEngine';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, RotateCw, SkipForward, PictureInPicture2, MessageCircle, Eye, EyeOff, ChevronUp, X } from 'lucide-react';
import './VideoPlayer.css';

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export default function VideoPlayer({ src, poster, title, autoPlay = false, danmakus = [], onTimeUpdate, onEnded, onDanmakuSend }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const progressRef = useRef(null);
  const hideTimerRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => parseFloat(localStorage.getItem('vp_volume') || '0.7'));
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [buffered, setBuffered] = useState(0);
  const [danmakuInput, setDanmakuInput] = useState('');
  const [danmakuInputVisible, setDanmakuInputVisible] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#FFFFFF');

  const {
    canvasRef, addDanmaku, clearDanmakus,
    showDanmaku, setShowDanmaku,
    danmakuOpacity, setDanmakuOpacity,
    danmakuFontSize, setDanmakuFontSize,
    DANMAKU_COLORS, danmakuCount,
  } = useDanmakuEngine(containerRef);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    localStorage.setItem('vp_volume', String(volume));
  }, [volume]);

  useEffect(() => {
    danmakus.forEach(d => {
      setTimeout(() => addDanmaku(d.text, { color: d.color, type: d.type }), d.time * 1000);
    });
  }, [danmakus]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play().catch(() => {});
  }, [playing]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (videoRef.current.buffered.length > 0) {
      setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }
    onTimeUpdate?.(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  };

  const handleEnded = () => {
    setPlaying(false);
    onEnded?.();
  };

  const handleProgressClick = (e) => {
    if (!videoRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = pct * duration;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (fullscreen) {
      document.exitFullscreen?.();
    } else {
      containerRef.current.requestFullscreen?.();
    }
  };

  useEffect(() => {
    const handleFS = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFS);
    return () => document.removeEventListener('fullscreenchange', handleFS);
  }, []);

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  };

  const sendDanmaku = () => {
    if (!danmakuInput.trim()) return;
    addDanmaku(danmakuInput.trim(), { color: selectedColor });
    onDanmakuSend?.(danmakuInput.trim(), selectedColor);
    setDanmakuInput('');
    setDanmakuInputVisible(false);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div ref={containerRef} className={`vp-container ${fullscreen ? 'fullscreen' : ''}`} onMouseMove={handleMouseMove} onMouseLeave={() => playing && setShowControls(false)}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="vp-video"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        autoPlay={autoPlay}
        playsInline
      />

      <canvas ref={canvasRef} className={`vp-danmaku-canvas ${showDanmaku ? '' : 'hidden'}`} />

      {!playing && (
        <div className="vp-play-overlay" onClick={togglePlay}>
          <div className="vp-play-btn-large"><Play size={40} /></div>
        </div>
      )}

      <div className={`vp-controls ${showControls ? 'visible' : ''}`}>
        <div className="vp-progress-wrap" ref={progressRef} onClick={handleProgressClick}>
          <div className="vp-progress-track">
            <div className="vp-progress-buffer" style={{ width: `${bufferPct}%` }} />
            <div className="vp-progress-bar" style={{ width: `${progressPct}%` }} />
            <div className="vp-progress-thumb" style={{ left: `${progressPct}%` }} />
          </div>
          <div className="vp-progress-time" style={{ left: `${Math.min(progressPct, 90)}%` }}>{formatTime(currentTime)}</div>
        </div>

        <div className="vp-controls-bar">
          <div className="vp-controls-left">
            <button className="vp-ctrl-btn" onClick={togglePlay} title={playing ? '暂停' : '播放'}>
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button className="vp-ctrl-btn" onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.min(duration, currentTime + 10); }} title="快进10秒">
              <SkipForward size={18} />
            </button>
            <div className="vp-volume-wrap">
              <button className="vp-ctrl-btn" onClick={() => setMuted(!muted)}>
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input type="range" className="vp-volume-slider" min={0} max={1} step={0.01}
                value={muted ? 0 : volume} onChange={e => { setVolume(parseFloat(e.target.value)); setMuted(false); }} />
            </div>
            <span className="vp-time-display">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>

          <div className="vp-controls-right">
            <button className={`vp-ctrl-btn ${danmakuInputVisible ? 'active' : ''}`} onClick={() => setDanmakuInputVisible(!danmakuInputVisible)} title="发弹幕">
              <MessageCircle size={18} />
            </button>
            <button className={`vp-ctrl-btn ${!showDanmaku ? 'active' : ''}`} onClick={() => setShowDanmaku(!showDanmaku)} title={showDanmaku ? '关闭弹幕' : '开启弹幕'}>
              {showDanmaku ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <button className="vp-ctrl-btn" onClick={() => setShowSettings(!showSettings)} title="设置">
              <Settings size={18} />
            </button>
            <button className="vp-ctrl-btn" onClick={toggleFullscreen} title={fullscreen ? '退出全屏' : '全屏'}>
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>

      {danmakuInputVisible && (
        <div className="vp-danmaku-input-bar">
          <div className="vp-danmaku-colors">
            {DANMAKU_COLORS.map(c => (
              <button key={c} className={`vp-color-btn ${selectedColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setSelectedColor(c)} />
            ))}
          </div>
          <div className="vp-danmaku-input-wrap">
            <input
              type="text"
              className="vp-danmaku-input"
              placeholder="发送弹幕..."
              value={danmakuInput}
              onChange={e => setDanmakuInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendDanmaku()}
              maxLength={50}
            />
            <button className="vp-danmaku-send" onClick={sendDanmaku} disabled={!danmakuInput.trim()}>发送</button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="vp-settings-panel">
          <div className="vp-settings-header">
            <h3>播放设置</h3>
            <button onClick={() => setShowSettings(false)}><X size={14} /></button>
          </div>
          <div className="vp-settings-group">
            <label>播放速度</label>
            <div className="vp-speed-options">
              {SPEED_OPTIONS.map(s => (
                <button key={s} className={`vp-speed-btn ${playbackRate === s ? 'active' : ''}`}
                  onClick={() => { setPlaybackRate(s); if (videoRef.current) videoRef.current.playbackRate = s; }}>
                  {s}x
                </button>
              ))}
            </div>
          </div>
          <div className="vp-settings-group">
            <label>弹幕设置</label>
            <div className="vp-danmaku-settings">
              <div className="vp-dm-setting-row">
                <span>弹幕显示</span>
                <button className={`vp-toggle ${showDanmaku ? 'on' : ''}`} onClick={() => setShowDanmaku(!showDanmaku)}>
                  {showDanmaku ? '开' : '关'}
                </button>
              </div>
              <div className="vp-dm-setting-row">
                <span>透明度</span>
                <input type="range" min={0.1} max={1} step={0.1} value={danmakuOpacity}
                  onChange={e => setDanmakuOpacity(parseFloat(e.target.value))} />
              </div>
              <div className="vp-dm-setting-row">
                <span>字号</span>
                <div className="vp-fontsize-btns">
                  {['small', 'medium', 'large'].map(s => (
                    <button key={s} className={`vp-fontsize-btn ${danmakuFontSize === s ? 'active' : ''}`}
                      onClick={() => setDanmakuFontSize(s)}>
                      {s === 'small' ? '小' : s === 'medium' ? '中' : '大'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
