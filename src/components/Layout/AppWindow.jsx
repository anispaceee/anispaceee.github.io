import { useState, useRef, useEffect, useCallback } from 'react';
import { useWindowManager } from '../../context/WindowManager';
import './AppWindow.css';

export default function AppWindow({ id, children }) {
  const { windows, closeWindow, minimizeWindow, maximizeWindow, focusWindow, updateWindowPos, updateWindowSize, bringToFront } = useWindowManager();
  const win = windows[id];
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [closeHover, setCloseHover] = useState(false);
  const [closing, setClosing] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.x));
      const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.y));
      updateWindowPos(id, { x, y });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragging, dragOffset, id, updateWindowPos]);

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e) => {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      updateWindowSize(id, {
        width: Math.max(win.minWidth, resizing.startW + (resizing.dir.includes('e') ? dx : -dx)),
        height: Math.max(win.minHeight, resizing.startH + (resizing.dir.includes('s') ? dy : -dy)),
      });
      if (resizing.dir.includes('w')) {
        updateWindowPos(id, { x: resizing.startX + dx, y: win.pos.y });
      }
    };
    const handleUp = () => setResizing(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [resizing, id, win, updateWindowSize, updateWindowPos]);

  const handleDragStart = (e) => {
    if (win.maximized) return;
    setDragging(true);
    const rect = modalRef.current.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    bringToFront(id);
  };

  const handleResizeStart = (e, dir) => {
    e.preventDefault();
    e.stopPropagation();
    if (win.maximized) return;
    setResizing({
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: win.size.width,
      startH: win.size.height,
    });
    bringToFront(id);
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      closeWindow(id);
      setClosing(false);
    }, 300);
  };

  if (!win || !win.open) return null;

  const style = win.maximized
    ? { left: 0, top: 0, width: '100vw', height: '100vh', zIndex: win.zIndex }
    : { left: win.pos.x, top: win.pos.y, width: win.size.width, height: win.size.height, zIndex: win.zIndex };

  return (
    <div
      ref={modalRef}
      className={`app-window ${win.minimized ? 'minimized' : ''} ${win.maximized ? 'maximized' : ''} ${closing ? 'closing' : ''}`}
      style={style}
      onMouseDown={() => bringToFront(id)}
    >
      <div className="app-window-titlebar" onMouseDown={handleDragStart}>
        <div className="app-window-controls">
          <button
            className="app-window-btn close-btn"
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            onClick={handleClose}
          >
            {closeHover && <span className="close-icon">−</span>}
          </button>
          <button className="app-window-btn minimize-btn" onClick={() => minimizeWindow(id)}>−</button>
          <button className="app-window-btn maximize-btn" onClick={() => maximizeWindow(id)}>
            {win.maximized ? '⧉' : '□'}
          </button>
        </div>
        <span className="app-window-title">{win.icon} {win.title}</span>
        <div className="app-window-titlebar-spacer" />
      </div>

      {!win.minimized && (
        <div className="app-window-content">
          {children}
        </div>
      )}

      {!win.minimized && !win.maximized && (
        <>
          <div className="app-resize-handle se" onMouseDown={e => handleResizeStart(e, 'se')} />
          <div className="app-resize-handle e" onMouseDown={e => handleResizeStart(e, 'e')} />
          <div className="app-resize-handle s" onMouseDown={e => handleResizeStart(e, 's')} />
          <div className="app-resize-handle sw" onMouseDown={e => handleResizeStart(e, 'sw')} />
          <div className="app-resize-handle w" onMouseDown={e => handleResizeStart(e, 'w')} />
        </>
      )}
    </div>
  );
}
