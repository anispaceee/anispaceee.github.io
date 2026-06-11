import { createContext, useContext, useState, useCallback, useRef } from 'react';

const WindowManagerContext = createContext(null);

const DEFAULT_WINDOW_CONFIG = {
  music: { title: '音乐', icon: '🎵', width: 420, height: 560, minWidth: 300, minHeight: 400 },
  friends: { title: 'LeMU', icon: '👥', width: 480, height: 600, minWidth: 300, minHeight: 400 },
  amadeus: { title: 'Navi', icon: '🧠', width: 680, height: 520, minWidth: 400, minHeight: 400 },
  world: { title: '世界线', icon: '💬', width: 450, height: 550, minWidth: 300, minHeight: 400 },
  notifications: { title: '通知', icon: '🔔', width: 800, height: 600, minWidth: 400, minHeight: 400 },
  touchgal: { title: 'TouchGal', icon: '🎮', width: 1000, height: 700, minWidth: 600, minHeight: 500 },
};

let nextZIndex = 1000;

export function WindowManagerProvider({ children }) {
  const [windows, setWindows] = useState({});
  const zCounter = useRef(1000);
  const windowDataRef = useRef({});

  const openWindow = useCallback((id, data = null) => {
    const config = DEFAULT_WINDOW_CONFIG[id];
    if (!config) return;

    if (data) {
      windowDataRef.current[id] = data;
    }

    setWindows(prev => {
      if (prev[id]?.open) {
        return {
          ...prev,
          [id]: { ...prev[id], zIndex: ++zCounter.current, minimized: false },
        };
      }

      const savedPos = localStorage.getItem(`wm_pos_${id}`);
      const savedSize = localStorage.getItem(`wm_size_${id}`);
      let pos = savedPos ? JSON.parse(savedPos) : {
        x: Math.max(50, (window.innerWidth - (config.width || 800)) / 2 + Object.keys(prev).length * 20),
        y: Math.max(40, 60 + Object.keys(prev).length * 20),
      };
      let size = savedSize ? JSON.parse(savedSize) : {
        width: config.width,
        height: config.height,
      };

      return {
        ...prev,
        [id]: {
          id,
          title: config.title,
          icon: config.icon,
          open: true,
          minimized: false,
          maximized: false,
          zIndex: ++zCounter.current,
          pos,
          size,
          minWidth: config.minWidth,
          minHeight: config.minHeight,
        },
      };
    });
  }, []);

  const getWindowData = useCallback((id) => {
    return windowDataRef.current[id] || null;
  }, []);

  const clearWindowData = useCallback((id) => {
    delete windowDataRef.current[id];
  }, []);

  const closeWindow = useCallback((id) => {
    setWindows(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    delete windowDataRef.current[id];
  }, []);

  const minimizeWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], minimized: true },
    }));
  }, []);

  const maximizeWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], maximized: !prev[id].maximized },
    }));
  }, []);

  const focusWindow = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], zIndex: ++zCounter.current, minimized: false },
    }));
  }, []);

  const updateWindowPos = useCallback((id, pos) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], pos },
    }));
    localStorage.setItem(`wm_pos_${id}`, JSON.stringify(pos));
  }, []);

  const updateWindowSize = useCallback((id, size) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], size },
    }));
    localStorage.setItem(`wm_size_${id}`, JSON.stringify(size));
  }, []);

  const bringToFront = useCallback((id) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], zIndex: ++zCounter.current },
    }));
  }, []);

  return (
    <WindowManagerContext.Provider value={{
      windows,
      openWindow,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      focusWindow,
      updateWindowPos,
      updateWindowSize,
      bringToFront,
      getWindowData,
      clearWindowData,
    }}>
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error('useWindowManager must be used within WindowManagerProvider');
  return ctx;
}

export { DEFAULT_WINDOW_CONFIG };
