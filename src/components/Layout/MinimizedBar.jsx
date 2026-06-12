import { useState, useEffect, useRef, useCallback } from 'react';
import { useWindowManager } from '../../context/WindowManager';
import { X } from 'lucide-react';
import './MinimizedBar.css';

const HIDE_DELAY = 5000; // 5秒无操作后隐去

export default function MinimizedBar({ id, icon, title, bottom = 80, children }) {
  const { focusWindow, closeWindow } = useWindowManager();
  const [hidden, setHidden] = useState(false);
  const timerRef = useRef(null);
  const barRef = useRef(null);

  const resetTimer = useCallback(() => {
    setHidden(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHidden(true), HIDE_DELAY);
  }, []);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [resetTimer]);

  const handleBarClick = (e) => {
    if (e.target.closest('.minimized-bar-btn') || e.target.closest('.minimized-bar-close')) return;
    focusWindow(id);
  };

  const handleMouseEnter = () => {
    setHidden(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleMouseLeave = () => {
    resetTimer();
  };

  const handleClose = (e) => {
    e.stopPropagation();
    closeWindow(id);
  };

  return (
    <div
      ref={barRef}
      className={`minimized-bar ${hidden ? 'hidden' : ''}`}
      style={{ bottom }}
      onClick={handleBarClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button className="minimized-bar-close" onClick={handleClose}>
        <X size={12} />
      </button>
      {children || <span className="minimized-bar-title">{title}</span>}
      <span className="minimized-bar-icon">{icon}</span>
    </div>
  );
}
