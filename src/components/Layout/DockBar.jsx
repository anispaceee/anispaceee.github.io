import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useWindowManager } from '../../context/WindowManager';
import { useMusic, FALLBACK_COVER } from '../../context/MusicContext';
import { StorageService } from '../../services/api';
import { Settings, MessageCircle, Music, Sparkles, X, Sun, Moon, Contrast, Volume2, VolumeX, Play, Pause, SkipForward, SkipBack, Brain, Users, ChevronUp, Bell, Gamepad2, PenSquare, Coffee, Link2, Globe } from 'lucide-react';
import { getUnreadCount } from '../Notification/Notifications';
import './DockBar.css';

export default function DockBar() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const { windows, openWindow, focusWindow } = useWindowManager();
  const { currentSong, playing, volume, muted, togglePlay, playNext, playPrev, setVolume } = useMusic();
  const [activePanel, setActivePanel] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || '');
  const [showLauncher, setShowLauncher] = useState(false);
  const [launcherIndex, setLauncherIndex] = useState(-1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dockHidden, setDockHidden] = useState(false);
  const [hoveringTrigger, setHoveringTrigger] = useState(false);
  const [hoveringDock, setHoveringDock] = useState(false);
  const dockRef = useRef(null);
  const hideTimerRef = useRef(null);

  // 启动/重置隐藏计时器
  const startHideTimer = useRef(() => {});
  startHideTimer.current = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setDockHidden(true);
    }, 10000);
  };

  // 页面加载时开始计时
  useEffect(() => {
    startHideTimer.current();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // 鼠标在 Dock 区域内时暂停计时，离开时重新计时
  useEffect(() => {
    if (hoveringDock || hoveringTrigger) {
      setDockHidden(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else if (!dockHidden) {
      startHideTimer.current();
    }
  }, [hoveringDock, hoveringTrigger]);

  useEffect(() => {
    setUnreadCount(getUnreadCount());
    const interval = setInterval(() => setUnreadCount(getUnreadCount()), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dockRef.current && !dockRef.current.contains(e.target)) {
        setActivePanel(null);
        setShowLauncher(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const togglePanel = (panel) => {
    setActivePanel(prev => prev === panel ? null : panel);
    setShowLauncher(false);
  };

  const setThemeAndSave = (t) => {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    StorageService.set('acg_theme', t);
  };

  const handleAppClick = (appId) => {
    if (windows[appId]?.open) {
      focusWindow(appId);
    } else {
      openWindow(appId);
    }
    setShowLauncher(false);
  };

  const launcherApps = [
    { id: 'club', icon: <Coffee size={18} />, label: 'Tea Time！' },
    { id: 'friends', icon: <Users size={18} />, label: '好友空间' },
    { id: 'music', icon: <Music size={18} />, label: '音乐' },
    { id: 'amadeus', icon: <Brain size={18} />, label: 'Navi' },
    { id: 'world', icon: <Globe size={18} />, label: '世界频道' },
    { id: 'notifications', icon: <Bell size={18} />, label: '通知' },
    ...(isAuthenticated ? [{ id: 'musashi-new', icon: <PenSquare size={18} />, label: '发布作品', href: '/musashi/new' }] : []),
  ];

  const handleLauncherKeyDown = (e) => {
    if (!showLauncher) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setLauncherIndex(prev => prev <= 0 ? launcherApps.length - 1 : prev - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setLauncherIndex(prev => prev >= launcherApps.length - 1 ? 0 : prev + 1);
    } else if (e.key === 'Enter' && launcherIndex >= 0) {
      handleAppClick(launcherApps[launcherIndex].id);
    } else if (e.key === 'Escape') {
      setShowLauncher(false);
      setLauncherIndex(-1);
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleLauncherKeyDown);
    return () => document.removeEventListener('keydown', handleLauncherKeyDown);
  }, [showLauncher, launcherIndex]);

  const dockItems = [
    { key: 'launcher', icon: <ChevronUp size={16} />, label: '应用', active: showLauncher, onClick: () => { setShowLauncher(prev => !prev); setActivePanel(null); } },
    { key: 'club', icon: <Coffee size={16} />, label: 'Tea Time！', active: windows.club?.open && !windows.club.minimized, onClick: () => handleAppClick('club') },
    { key: 'world', icon: <Globe size={16} />, label: '世界线', active: windows.world?.open && !windows.world.minimized, onClick: () => handleAppClick('world') },
    { key: 'amadeus', icon: <Brain size={16} />, label: 'Navi', active: windows.amadeus?.open && !windows.amadeus.minimized, onClick: () => handleAppClick('amadeus') },
    { key: 'music', icon: <Music size={16} />, label: '音乐', active: windows.music?.open && !windows.music.minimized || activePanel === 'music', onClick: () => handleAppClick('music') },
    { key: 'friends', icon: <Users size={16} />, label: 'LeMU', active: windows.friends?.open && !windows.friends.minimized, onClick: () => handleAppClick('friends') },
    { key: 'links', icon: <Link2 size={16} />, label: '友情链接', href: '/links' },
    { key: 'settings', icon: <Settings size={16} />, label: '设置', active: activePanel === 'settings' },
    { key: 'notifications', icon: <Bell size={16} />, label: '通知', active: windows.notifications?.open && !windows.notifications.minimized, onClick: () => handleAppClick('notifications'), badge: unreadCount },
  ];

  return (
    <div ref={dockRef} className={`dock-bar-wrapper ${dockHidden ? 'dock-hidden' : ''}`} onMouseEnter={() => setHoveringDock(true)} onMouseLeave={() => setHoveringDock(false)}>
      {/* 隐藏时的触发横条 */}
      {dockHidden && (
        <div
          className="dock-trigger-bar"
          onMouseEnter={() => setHoveringTrigger(true)}
          onMouseLeave={() => setHoveringTrigger(false)}
        />
      )}

      {activePanel && (
        <div className="dock-panel dock-panel-above">
          {activePanel === 'settings' && (
            <div className="dock-panel-content">
              <div className="dock-panel-header"><h3>设置</h3><button onClick={() => setActivePanel(null)}><X size={14} /></button></div>
              <div className="dock-settings">
                <div className="dock-setting-group">
                  <label>主题</label>
                  <div className="dock-theme-btns">
                    <button className={`dock-theme-btn ${theme === '' ? 'active' : ''}`} onClick={() => setThemeAndSave('')}><Sun size={14} /> 浅色</button>
                    <button className={`dock-theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setThemeAndSave('dark')}><Moon size={14} /> 深色</button>
                    <button className={`dock-theme-btn ${theme === 'high-contrast' ? 'active' : ''}`} onClick={() => setThemeAndSave('high-contrast')}><Contrast size={14} /> 高对比</button>
                  </div>
                </div>
                <div className="dock-setting-group">
                  <label>账户</label>
                  {isAuthenticated ? (
                    <div className="dock-account-info">
                      <span>{currentUser?.name}</span>
                      <a href="/profile" className="dock-account-link">个人资料</a>
                    </div>
                  ) : (
                    <button className="dock-login-btn" onClick={openAuth}>登录</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activePanel === 'music' && (
            <div className="dock-panel-content">
              <div className="dock-panel-header"><h3>音乐</h3><button onClick={() => setActivePanel(null)}><X size={14} /></button></div>
              <div className="dock-music">
                <div className="dock-music-info">
                  <img src={currentSong?.albumCover || FALLBACK_COVER} alt="" className="dock-music-cover" loading="lazy" onError={e => { e.target.src = FALLBACK_COVER; }} />
                  <div className="dock-music-meta">
                    <span className="dock-music-name">{currentSong?.name || '未播放'}</span>
                    <span className="dock-music-artist">{currentSong?.artists || ''}</span>
                  </div>
                </div>
                <div className="dock-music-controls">
                  <button onClick={playPrev}><SkipBack size={14} /></button>
                  <button className="dock-music-play" onClick={togglePlay}>
                    {playing ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button onClick={playNext}><SkipForward size={14} /></button>
                </div>
                <div className="dock-music-volume">
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <input type="range" min={0} max={100} value={muted ? 0 : Math.round(volume * 100)} onChange={e => setVolume(parseInt(e.target.value) / 100)} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showLauncher && (
        <div className="dock-launcher">
          {launcherApps.map((app, i) => (
            app.href ? (
              <a
                key={app.id}
                href={app.href}
                className={`dock-launcher-item ${launcherIndex === i ? 'focused' : ''}`}
                onMouseEnter={() => setLauncherIndex(i)}
              >
                <span className="dock-launcher-icon">{app.icon}</span>
                <span className="dock-launcher-label">{app.label}</span>
              </a>
            ) : (
              <button
                key={app.id}
                className={`dock-launcher-item ${launcherIndex === i ? 'focused' : ''} ${windows[app.id]?.open ? 'running' : ''}`}
                onClick={() => handleAppClick(app.id)}
                onMouseEnter={() => setLauncherIndex(i)}
              >
                <span className="dock-launcher-icon">{app.icon}</span>
                <span className="dock-launcher-label">{app.label}</span>
                {windows[app.id]?.open && <span className="dock-launcher-dot" />}
              </button>
            )
          ))}
        </div>
      )}

      <div className="dock-bar">
        {dockItems.map((item, i) => (
          <div key={item.key} className="dock-item-wrap">
            {item.href ? (
              <a href={item.href} className={`dock-btn ${item.active ? 'active' : ''}`} title={item.label}>
                {item.icon}
              </a>
            ) : (
              <button
                className={`dock-btn ${item.active ? 'active' : ''}`}
                onClick={item.onClick || (() => togglePanel(item.key))}
                title={item.label}
              >
                {item.icon}
                {item.key === 'music' && playing && <span className="dock-btn-playing" />}
                {windows[item.key]?.open && item.key !== 'launcher' && <span className="dock-btn-indicator" />}
                {item.badge > 0 && <span className="dock-btn-badge">{item.badge > 99 ? '99+' : item.badge}</span>}
              </button>
            )}
            {i < dockItems.length - 1 && <div className="dock-separator" />}
          </div>
        ))}
      </div>
    </div>
  );
}
