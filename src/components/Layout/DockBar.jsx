import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useWindowManager } from '../../context/WindowManager';
import { StorageService } from '../../services/api';
import { Settings, MessageCircle, Music, Sparkles, X, Sun, Moon, Contrast, Volume2, VolumeX, Play, Pause, SkipForward, SkipBack, Eye, EyeOff, Brain, Users, ChevronUp, Bell, Gamepad2 } from 'lucide-react';
import { getUnreadCount } from '../Notification/Notifications';
import './DockBar.css';

export default function DockBar({ live2dVisible, onToggleLive2D, musicState, onMusicControl }) {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const { windows, openWindow, focusWindow } = useWindowManager();
  const [activePanel, setActivePanel] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || '');
  const [showLauncher, setShowLauncher] = useState(false);
  const [launcherIndex, setLauncherIndex] = useState(-1);
  const [unreadCount, setUnreadCount] = useState(0);
  const dockRef = useRef(null);

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
    { id: 'touchgal', icon: <Gamepad2 size={18} />, label: 'TouchGal' },
    { id: 'friends', icon: <Users size={18} />, label: '好友空间' },
    { id: 'music', icon: <Music size={18} />, label: '音乐' },
    { id: 'amadeus', icon: <Brain size={18} />, label: 'Amadeus' },
    { id: 'world', icon: <MessageCircle size={18} />, label: '世界频道' },
    { id: 'notifications', icon: <Bell size={18} />, label: '通知' },
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
    { key: 'touchgal', icon: <Gamepad2 size={16} />, label: 'TouchGal', active: windows.touchgal?.open && !windows.touchgal.minimized, onClick: () => handleAppClick('touchgal') },
    { key: 'world', icon: <MessageCircle size={16} />, label: '世界频道', active: windows.world?.open && !windows.world.minimized, onClick: () => handleAppClick('world') },
    { key: 'amadeus', icon: <Brain size={16} />, label: 'Amadeus', active: windows.amadeus?.open && !windows.amadeus.minimized, onClick: () => handleAppClick('amadeus') },
    { key: 'music', icon: <Music size={16} />, label: '音乐', active: windows.music?.open && !windows.music.minimized || activePanel === 'music', onClick: () => handleAppClick('music') },
    { key: 'friends', icon: <Users size={16} />, label: '好友空间', active: windows.friends?.open && !windows.friends.minimized, onClick: () => handleAppClick('friends') },
    { key: 'live2d', icon: <Sparkles size={16} />, label: 'Live2D', active: activePanel === 'live2d' },
    { key: 'settings', icon: <Settings size={16} />, label: '设置', active: activePanel === 'settings' },
    { key: 'notifications', icon: <Bell size={16} />, label: '通知', active: windows.notifications?.open && !windows.notifications.minimized, onClick: () => handleAppClick('notifications'), badge: unreadCount },
  ];

  return (
    <div ref={dockRef} className="dock-bar-wrapper">
      {showLauncher && (
        <div className="dock-launcher">
          {launcherApps.map((app, i) => (
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
          ))}
        </div>
      )}

      <div className="dock-bar">
        {dockItems.map((item, i) => (
          <div key={item.key} className="dock-item-wrap">
            <button
              className={`dock-btn ${item.active ? 'active' : ''}`}
              onClick={item.onClick || (() => togglePanel(item.key))}
              title={item.label}
            >
              {item.icon}
              {item.key === 'music' && musicState?.playing && <span className="dock-btn-playing" />}
              {windows[item.key]?.open && item.key !== 'launcher' && <span className="dock-btn-indicator" />}
              {item.badge > 0 && <span className="dock-btn-badge">{item.badge > 99 ? '99+' : item.badge}</span>}
            </button>
            {i < dockItems.length - 1 && <div className="dock-separator" />}
          </div>
        ))}
      </div>

      {activePanel && (
        <div className="dock-panel">
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
                  <label>Live2D 看板娘</label>
                  <button className="dock-setting-toggle" onClick={onToggleLive2D}>
                    {live2dVisible ? <><Eye size={14} /> 显示中</> : <><EyeOff size={14} /> 已隐藏</>}
                  </button>
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

          {activePanel === 'music' && musicState && (
            <div className="dock-panel-content">
              <div className="dock-panel-header"><h3>音乐</h3><button onClick={() => setActivePanel(null)}><X size={14} /></button></div>
              <div className="dock-music">
                <div className="dock-music-info">
                  <img src={musicState.cover || ''} alt="" className="dock-music-cover" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />
                  <div className="dock-music-meta">
                    <span className="dock-music-name">{musicState.name || '未播放'}</span>
                    <span className="dock-music-artist">{musicState.artist || ''}</span>
                  </div>
                </div>
                <div className="dock-music-controls">
                  <button onClick={() => onMusicControl?.('prev')}><SkipBack size={14} /></button>
                  <button className="dock-music-play" onClick={() => onMusicControl?.('toggle')}>
                    {musicState.playing ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button onClick={() => onMusicControl?.('next')}><SkipForward size={14} /></button>
                </div>
                <div className="dock-music-volume">
                  {musicState.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <input type="range" min={0} max={100} value={musicState.muted ? 0 : Math.round((musicState.volume || 0.7) * 100)} onChange={e => onMusicControl?.('volume', parseInt(e.target.value) / 100)} />
                </div>
              </div>
            </div>
          )}

          {activePanel === 'live2d' && (
            <div className="dock-panel-content">
              <div className="dock-panel-header"><h3>Live2D 配置</h3><button onClick={() => setActivePanel(null)}><X size={14} /></button></div>
              <div className="dock-live2d">
                <div className="dock-setting-group">
                  <label>显示状态</label>
                  <button className="dock-setting-toggle" onClick={onToggleLive2D}>
                    {live2dVisible ? <><Eye size={14} /> 显示</> : <><EyeOff size={14} /> 隐藏</>}
                  </button>
                </div>
                <a href="/live2d" className="dock-live2d-link">打开 Live2D 展示页</a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
