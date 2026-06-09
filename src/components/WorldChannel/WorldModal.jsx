import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService, UserService } from '../../services/api';
import { X, Minus, Maximize2, Send, Smile, GripHorizontal, Settings } from 'lucide-react';
import EmojiPicker from '../Common/EmojiPicker';
import './WorldModal.css';

const MSG_STORAGE = 'acg_world_messages';
const SIZE_PRESETS = {
  small: { width: 320, height: 400 },
  medium: { width: 450, height: 550 },
  large: { width: 600, height: 700 },
};

export default function WorldModal({ open, onClose }) {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(MSG_STORAGE);
    if (saved) { try { return JSON.parse(saved); } catch {} }
    return StorageService.get('acg_world_messages', []);
  });
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem('acg_world_pos');
    if (saved) { try { return JSON.parse(saved); } catch {} }
    return { x: window.innerWidth * 0.4, y: 0 };
  });
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('acg_world_size');
    if (saved) { try { return JSON.parse(saved); } catch {} }
    return SIZE_PRESETS.medium;
  });
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('acg_world_fontsize');
    if (saved) { return parseInt(saved) || 14; }
    return 14;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const messagesEndRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(MSG_STORAGE, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('acg_world_pos', JSON.stringify(pos));
  }, [pos]);

  useEffect(() => {
    localStorage.setItem('acg_world_size', JSON.stringify(size));
  }, [size]);

  useEffect(() => {
    localStorage.setItem('acg_world_fontsize', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDragStart = (e) => {
    if (resizing) return;
    setDragging(true);
    const rect = modalRef.current.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      const maxX = window.innerWidth - (maximized ? window.innerWidth : size.width);
      const maxY = window.innerHeight - (maximized ? window.innerHeight : size.height);
      const x = Math.max(0, Math.min(maxX, e.clientX - dragOffset.x));
      const y = Math.max(0, Math.min(maxY, e.clientY - dragOffset.y));
      setPos({ x, y });
    };
    const handleUp = () => {
      setDragging(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragging, dragOffset, pos, size, maximized]);

  const handleResizeStart = (e, direction) => {
    e.preventDefault();
    setResizing(direction);
    setDragOffset({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e) => {
      const deltaX = e.clientX - dragOffset.x;
      const deltaY = e.clientY - dragOffset.y;
      
      setSize(prev => {
        let newWidth = prev.width;
        let newHeight = prev.height;
        
        if (resizing.includes('e')) {
          newWidth = Math.max(280, Math.min(window.innerWidth - pos.x - 20, prev.width + deltaX));
        }
        if (resizing.includes('s')) {
          newHeight = Math.max(300, Math.min(window.innerHeight - pos.y - 40, prev.height + deltaY));
        }
        if (resizing.includes('w')) {
          newWidth = Math.max(280, Math.min(prev.width - deltaX, window.innerWidth - 20));
          if (newWidth !== prev.width) {
            setPos(p => ({ ...p, x: p.x + (prev.width - newWidth) }));
          }
        }
        if (resizing.includes('n')) {
          newHeight = Math.max(300, Math.min(prev.height - deltaY, window.innerHeight - 40));
          if (newHeight !== prev.height) {
            setPos(p => ({ ...p, y: p.y + (prev.height - newHeight) }));
          }
        }
        
        return { width: newWidth, height: newHeight };
      });
      setDragOffset({ x: e.clientX, y: e.clientY });
    };
    const handleUp = () => {
      setResizing(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [resizing, dragOffset, pos]);

  const handleSend = () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!input.trim()) return;
    setMessages(prev => [...prev, {
      id: Date.now(), userId: currentUser.id, content: input.trim(),
      timestamp: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    }]);
    setInput('');
    setShowEmoji(false);
  };

  const handleEmojiSelect = (emoji) => {
    setInput(prev => prev + emoji);
  };

  const getUserById = (id) => {
    if (currentUser && id === currentUser.id) return currentUser;
    return UserService.getById(id) || { name: '匿名', avatar: '' };
  };

  const applySizePreset = (preset) => {
    setSize(SIZE_PRESETS[preset]);
    setMaximized(false);
  };

  const toggleMaximize = () => {
    if (maximized) {
      setMaximized(false);
    } else {
      setMaximized(true);
      setPos({ x: 0, y: 0 });
    }
  };

  if (!open) return null;

  const currentSize = maximized ? { width: window.innerWidth, height: window.innerHeight } : size;

  return (
    <div className="world-modal-overlay" onClick={onClose}>
      <div 
        ref={modalRef} 
        className={`world-modal ${minimized ? 'minimized' : ''} ${maximized ? 'maximized' : ''}`} 
        style={{ 
          left: pos.x, 
          top: pos.y,
          width: currentSize.width,
          height: currentSize.height,
          fontSize: fontSize + 'px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="world-modal-titlebar" onMouseDown={handleDragStart}>
          <GripHorizontal size={14} className="world-modal-grip" />
          <span className="world-modal-title">世界频道</span>
          <div className="world-modal-controls">
            <button className="world-modal-ctrl" onClick={() => setShowSettings(!showSettings)}><Settings size={12} /></button>
            <button className="world-modal-ctrl" onClick={() => setMinimized(!minimized)}><Minus size={12} /></button>
            <button className="world-modal-ctrl" onClick={toggleMaximize}><Maximize2 size={12} /></button>
            <button className="world-modal-ctrl close" onClick={onClose}><X size={12} /></button>
          </div>
        </div>

        {showSettings && (
          <div className="world-modal-settings">
            <div className="world-settings-section">
              <h4>窗口大小</h4>
              <div className="world-size-presets">
                {Object.entries(SIZE_PRESETS).map(([key, preset]) => (
                  <button 
                    key={key} 
                    className={`world-size-preset ${size.width === preset.width && size.height === preset.height ? 'active' : ''}`}
                    onClick={() => applySizePreset(key)}
                  >
                    {key === 'small' ? '小' : key === 'medium' ? '中' : '大'}
                  </button>
                ))}
              </div>
            </div>
            <div className="world-settings-section">
              <h4>字体大小: {fontSize}px</h4>
              <input 
                type="range" 
                min="12" 
                max="24" 
                step="1" 
                value={fontSize} 
                onChange={e => setFontSize(parseInt(e.target.value))}
                className="world-font-slider"
              />
              <div className="world-font-preview">
                <span style={{ fontSize: '12px' }}>Aa</span>
                <span style={{ fontSize: '16px' }}>Aa</span>
                <span style={{ fontSize: '20px' }}>Aa</span>
                <span style={{ fontSize: '24px' }}>Aa</span>
              </div>
            </div>
            <button className="world-settings-close" onClick={() => setShowSettings(false)}>关闭</button>
          </div>
        )}

        {!minimized && (
          <>
            <div className="world-modal-messages">
              {messages.map(msg => {
                const user = getUserById(msg.userId);
                const isSelf = currentUser && msg.userId === currentUser.id;
                return (
                  <div key={msg.id} className={`world-modal-msg ${isSelf ? 'self' : ''}`}>
                    <img src={user.avatar || ''} alt="" className="world-modal-avatar" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />
                    <div className="world-modal-bubble-wrap">
                      <span className="world-modal-name">{user.name}</span>
                      <div className={`world-modal-bubble ${isSelf ? 'self' : ''}`}>{msg.content}</div>
                      <span className="world-modal-time">{msg.timestamp}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="world-modal-input-area">
              <button className="world-modal-emoji-btn" onClick={() => setShowEmoji(!showEmoji)}><Smile size={18} /></button>
              {showEmoji && <div className="world-modal-emoji-picker"><EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} /></div>}
              <input placeholder={isAuthenticated ? '说点什么...' : '登录后发言'} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} disabled={!isAuthenticated} />
              <button className="world-modal-send" onClick={handleSend} disabled={!input.trim()}><Send size={14} /></button>
            </div>
          </>
        )}

        {!minimized && !maximized && (
          <>
            <div className="world-resize-handle world-resize-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
            <div className="world-resize-handle world-resize-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
            <div className="world-resize-handle world-resize-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
            <div className="world-resize-handle world-resize-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
            <div className="world-resize-handle world-resize-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
            <div className="world-resize-handle world-resize-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
            <div className="world-resize-handle world-resize-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
            <div className="world-resize-handle world-resize-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
          </>
        )}
      </div>
    </div>
  );
}
