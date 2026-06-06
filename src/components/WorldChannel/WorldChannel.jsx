import { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService, UserService } from '../../services/api';
import { Send, Image, Smile, Clock, TrendingUp, Eye, X } from 'lucide-react';
import './WorldChannel.css';

const FALLBACK_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

function Avatar({ src, alt, size = 40 }) {
  const [failed, setFailed] = useState(false);
  return <img src={failed ? FALLBACK_AVATAR : src} alt={alt} className="chat-avatar" style={{ width: size, height: size }} onError={() => setFailed(true)} />;
}

export default function WorldChannel() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [messages, setMessages] = useState(() => StorageService.get('acg_world_messages', []));
  const [newMessage, setNewMessage] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [imagePreview, setImagePreview] = useState(null);
  const [fullscreenImg, setFullscreenImg] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const getUser = (userId) => UserService.getById(userId);

  const sortedMessages = [...messages].sort((a, b) => {
    if (sortBy === 'hot') return (b.likes || 0) - (a.likes || 0);
    return 0;
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!newMessage.trim() && !imagePreview) return;
    const msg = {
      id: Date.now(),
      userId: currentUser.id,
      content: newMessage.trim(),
      timestamp: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      likes: 0, comments: 0, shares: 0,
      images: imagePreview ? [imagePreview] : [],
    };
    setMessages(prev => [...prev, msg]);
    setNewMessage('');
    setImagePreview(null);
    if (textareaRef.current) textareaRef.current.style.height = '60px';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextareaInput = (e) => {
    setNewMessage(e.target.value);
    const el = e.target;
    el.style.height = '60px';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleImageSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div className="world-channel">
      <div className="chat-header">
        <div className="chat-header-info">
          <h1 className="chat-title">世界频道</h1>
          <span className="chat-online"><span className="online-dot" /> {StorageService.get('acg_users', []).length} 人在线</span>
        </div>
        <div className="chat-sort">
          <button className={`chat-sort-btn ${sortBy === 'latest' ? 'active' : ''}`} onClick={() => setSortBy('latest')}>
            <Clock size={14} /> 最新
          </button>
          <button className={`chat-sort-btn ${sortBy === 'hot' ? 'active' : ''}`} onClick={() => setSortBy('hot')}>
            <TrendingUp size={14} /> 最热
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {sortedMessages.map(msg => {
          const user = getUser(msg.userId);
          const isSelf = currentUser && msg.userId === currentUser.id;
          return (
            <div key={msg.id} className={`chat-message ${isSelf ? 'self' : 'other'} ${msg.isOfficial ? 'official' : ''}`}>
              <Avatar src={user?.avatar} alt={user?.name} size={40} />
              <div className="chat-bubble-wrap">
                <div className="chat-bubble-header">
                  <span className="chat-bubble-name" style={{ color: isSelf ? 'var(--primary)' : 'var(--secondary)' }}>
                    {user?.name}
                    {msg.isOfficial && <span className="chat-official-badge">官方</span>}
                  </span>
                  <span className="chat-bubble-time">{msg.timestamp}</span>
                </div>
                <div className={`chat-bubble ${isSelf ? 'bubble-self' : 'bubble-other'}`}>
                  <p className="chat-bubble-text">{msg.content}</p>
                  {msg.images && msg.images.length > 0 && (
                    <div className="chat-bubble-images">
                      {msg.images.map((img, i) => (
                        <img key={i} src={img} alt="" className="chat-bubble-img" onClick={() => setFullscreenImg(img)} loading="lazy" />
                      ))}
                    </div>
                  )}
                </div>
                <div className="chat-bubble-actions">
                  <button className="chat-action-btn" onClick={() => {
                    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, likes: (m.likes || 0) + (m.liked ? -1 : 1), liked: !m.liked } : m));
                  }}>
                    <Eye size={12} /> {msg.likes || 0}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {imagePreview && (
          <div className="chat-image-preview">
            <img src={imagePreview} alt="preview" />
            <button className="preview-remove" onClick={() => setImagePreview(null)}><X size={14} /></button>
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={isAuthenticated ? '说点什么吧...' : '登录后即可发言'}
            value={newMessage}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            disabled={!isAuthenticated}
            rows={1}
          />
          <div className="chat-input-actions">
            <button className="chat-tool-btn" onClick={handleImageSelect} title="发送图片"><Image size={18} /></button>
            <button className="chat-tool-btn" title="表情"><Smile size={18} /></button>
            <button className="chat-send-btn" onClick={handleSend} disabled={(!newMessage.trim() && !imagePreview) || !isAuthenticated}>
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {fullscreenImg && (
        <div className="chat-fullscreen-overlay" onClick={() => setFullscreenImg(null)}>
          <img src={fullscreenImg} alt="" className="chat-fullscreen-img" onClick={e => e.stopPropagation()} />
          <button className="fullscreen-close" onClick={() => setFullscreenImg(null)}><X size={24} /></button>
        </div>
      )}
    </div>
  );
}
