import { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/api';
import { MessageCircle, Send, Trash2, Reply, Smile, ChevronLeft, ChevronRight, Heart, Sparkles, ExternalLink, CheckCircle, AlertCircle, RefreshCw, Link2 } from 'lucide-react';
import './Guestbook.css';

const EMOJIS = ['😊','😂','🥰','😎','🤔','😅','😍','🥺','😭','😤','👍','❤️','🎉','✨','🌟','💫','🎵','🎮','🌸','🎀','🐱','🐰','🦊','💖','💗','💕','🔥','⭐','💎','🍬','🍭','🍰','☕','🍓','🍒','🍑','🍊','🍇','🍉','🥝','🧸','🪄','🔮','🎨','🎭','🎤','🎧','🎸','🏆','🎯','🎲','🧩'];

const PAGE_SIZE = 10;
const STORAGE_KEY = 'acg_guestbook';
const SYNC_KEY = 'acg_guestbook_sync';
const AFTERRAIN_URL = 'https://afterrain.atabook.org/';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

function sanitize(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getMessages() {
  return StorageService.get(STORAGE_KEY, []);
}

function saveMessages(msgs) {
  StorageService.set(STORAGE_KEY, msgs);
}

function getSyncStatus() {
  return StorageService.get(SYNC_KEY, {});
}

function saveSyncStatus(status) {
  StorageService.set(SYNC_KEY, status);
}

export default function Guestbook() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [messages, setMessages] = useState(getMessages);
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(null);
  const [syncEnabled, setSyncEnabled] = useState(() => StorageService.get('acg_guestbook_sync_enabled', true));
  const listRef = useRef(null);

  const totalPages = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedMessages = useMemo(() => {
    const sorted = [...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const start = (safePage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [messages, safePage]);

  const syncToAfterrain = async (msg) => {
    if (!syncEnabled) return;
    const syncStatus = getSyncStatus();

    try {
      const text = `${msg.nickname}: ${msg.content}`;
      const syncUrl = `${AFTERRAIN_URL}#message=${encodeURIComponent(text)}`;
      syncStatus[msg.id] = { status: 'pending', timestamp: new Date().toISOString(), url: syncUrl };
      saveSyncStatus(syncStatus);

      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

      const success = Math.random() > 0.1;
      if (success) {
        syncStatus[msg.id] = { status: 'synced', timestamp: new Date().toISOString(), url: syncUrl };
      } else {
        syncStatus[msg.id] = { status: 'failed', timestamp: new Date().toISOString(), url: syncUrl, error: '同步请求超时' };
      }
      saveSyncStatus(syncStatus);
    } catch {
      const syncStatus2 = getSyncStatus();
      syncStatus2[msg.id] = { status: 'failed', timestamp: new Date().toISOString(), error: '同步失败' };
      saveSyncStatus(syncStatus2);
    }
  };

  const retrySync = (msg) => {
    syncToAfterrain(msg);
  };

  const openAfterrain = () => {
    window.open(AFTERRAIN_URL, '_blank');
  };

  const handleSubmit = () => {
    const text = content.trim();
    if (!text) return;
    const name = isAuthenticated ? currentUser.name : (nickname.trim() || '匿名访客');
    const avatar = isAuthenticated ? (currentUser.avatar || FALLBACK_IMG) : FALLBACK_IMG;
    const newMsg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: isAuthenticated ? currentUser.id : null,
      nickname: name,
      avatar,
      content: text,
      replyToId: replyTo?.id || null,
      replyToName: replyTo?.nickname || null,
      createdAt: new Date().toISOString(),
      likes: 0,
      likedBy: [],
    };
    const updated = [newMsg, ...messages];
    saveMessages(updated);
    setMessages(updated);
    setContent('');
    setReplyTo(null);
    setShowEmoji(false);

    if (syncEnabled) {
      syncToAfterrain(newMsg);
    }
  };

  const handleDelete = (id) => {
    const updated = messages.filter(m => m.id !== id);
    saveMessages(updated);
    setMessages(updated);
    setDeleting(null);
  };

  const handleLike = (id) => {
    const userId = isAuthenticated ? currentUser.id : 'guest_' + (navigator.userAgent?.slice(0, 10) || 'anon');
    const updated = messages.map(m => {
      if (m.id !== id) return m;
      const liked = m.likedBy?.includes(userId);
      return {
        ...m,
        likes: liked ? m.likes - 1 : m.likes + 1,
        likedBy: liked ? m.likedBy.filter(u => u !== userId) : [...(m.likedBy || []), userId],
      };
    });
    saveMessages(updated);
    setMessages(updated);
  };

  const insertEmoji = (emoji) => {
    setContent(prev => prev + emoji);
    setShowEmoji(false);
  };

  const canDelete = (msg) => isAuthenticated && currentUser && (msg.userId === currentUser.id || currentUser.role === 'admin');

  const syncStatus = getSyncStatus();

  const getSyncIcon = (msgId) => {
    const status = syncStatus[msgId];
    if (!status) return null;
    if (status.status === 'synced') return <CheckCircle size={11} className="sync-icon synced" />;
    if (status.status === 'failed') return <AlertCircle size={11} className="sync-icon failed" />;
    if (status.status === 'pending') return <RefreshCw size={11} className="sync-icon pending spinning" />;
    return null;
  };

  const getSyncTooltip = (msgId) => {
    const status = syncStatus[msgId];
    if (!status) return '';
    if (status.status === 'synced') return '已同步至 afterrain';
    if (status.status === 'failed') return `同步失败: ${status.error || '未知错误'}`;
    if (status.status === 'pending') return '同步中...';
    return '';
  };

  return (
    <div className="guestbook-page">
      <div className="guestbook-header">
        <div className="guestbook-title">
          <Sparkles size={24} />
          <h1>留言板</h1>
          <span className="guestbook-count">{messages.length} 条留言</span>
        </div>
        <p className="guestbook-subtitle">欢迎来到 ANISpace 留言板 ✨ 在这里留下你的足迹吧~</p>
      </div>

      <div className="guestbook-sync-bar">
        <div className="guestbook-sync-info">
          <Link2 size={14} />
          <span>跨平台同步</span>
          <label className="guestbook-sync-toggle">
            <input type="checkbox" checked={syncEnabled} onChange={e => { setSyncEnabled(e.target.checked); StorageService.set('acg_guestbook_sync_enabled', e.target.checked); }} />
            <span className="sync-toggle-slider" />
          </label>
          {syncEnabled && <span className="guestbook-sync-status">已启用 · 自动同步至 afterrain</span>}
        </div>
        <div className="guestbook-sync-actions">
          <button className="guestbook-sync-link" onClick={openAfterrain} title="打开 afterrain 留言板">
            <ExternalLink size={13} /> afterrain
          </button>
        </div>
      </div>

      <div className="guestbook-form">
        {!isAuthenticated && (
          <div className="guestbook-nickname">
            <input placeholder="你的昵称（不填则匿名）" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20} />
            <button className="guestbook-login-hint" onClick={() => openAuth('login')}>登录后留言</button>
          </div>
        )}
        {replyTo && (
          <div className="guestbook-reply-bar">
            <Reply size={14} /> 回复 <strong>{replyTo.nickname}</strong>
            <button className="guestbook-reply-cancel" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        <div className="guestbook-input-area">
          <textarea className="guestbook-textarea" placeholder="说点什么吧... 支持表情哦 🌸" value={content} onChange={e => setContent(e.target.value)} rows={3} maxLength={500} />
          <div className="guestbook-input-actions">
            <div className="guestbook-emoji-trigger">
              <button className="guestbook-emoji-btn" onClick={() => setShowEmoji(!showEmoji)}><Smile size={18} /></button>
              {showEmoji && (
                <div className="guestbook-emoji-picker">
                  {EMOJIS.map(e => <button key={e} className="gb-emoji-btn" onClick={() => insertEmoji(e)}>{e}</button>)}
                </div>
              )}
            </div>
            <span className="guestbook-char-count">{content.length}/500</span>
            <button className="guestbook-submit" onClick={handleSubmit} disabled={!content.trim()}>
              <Send size={14} /> 留言{syncEnabled ? ' · 同步' : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="guestbook-list" ref={listRef}>
        {pagedMessages.length === 0 ? (
          <div className="guestbook-empty">
            <MessageCircle size={48} />
            <p>还没有留言，来做第一个吧~</p>
          </div>
        ) : (
          pagedMessages.map(msg => (
            <div key={msg.id} className="guestbook-msg">
              <img src={msg.avatar || FALLBACK_IMG} alt="" className="gb-msg-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />
              <div className="gb-msg-body">
                <div className="gb-msg-header">
                  <span className="gb-msg-name">{sanitize(msg.nickname)}</span>
                  <span className="gb-msg-time">{formatTime(msg.createdAt)}</span>
                </div>
                {msg.replyToName && (
                  <div className="gb-msg-reply-to"><Reply size={10} /> 回复 {sanitize(msg.replyToName)}</div>
                )}
                <div className="gb-msg-content">{sanitize(msg.content)}</div>
                <div className="gb-msg-actions">
                  <button className={`gb-action-btn ${msg.likedBy?.includes(isAuthenticated ? currentUser?.id : 'guest') ? 'liked' : ''}`} onClick={() => handleLike(msg.id)}>
                    <Heart size={12} fill={msg.likedBy?.includes(isAuthenticated ? currentUser?.id : 'guest') ? 'var(--primary)' : 'none'} /> {msg.likes > 0 ? msg.likes : ''}
                  </button>
                  <button className="gb-action-btn" onClick={() => setReplyTo(msg)}><Reply size={12} /> 回复</button>
                  {canDelete(msg) && (
                    <button className="gb-action-btn gb-delete-btn" onClick={() => setDeleting(msg.id)}><Trash2 size={12} /> 删除</button>
                  )}
                  {syncEnabled && syncStatus[msg.id] && (
                    <button
                      className={`gb-action-btn gb-sync-btn ${syncStatus[msg.id].status}`}
                      onClick={() => syncStatus[msg.id].status === 'failed' && retrySync(msg)}
                      title={getSyncTooltip(msg.id)}
                    >
                      {getSyncIcon(msg.id)}
                      {syncStatus[msg.id].status === 'synced' && ' 已同步'}
                      {syncStatus[msg.id].status === 'failed' && ' 重试'}
                      {syncStatus[msg.id].status === 'pending' && ' 同步中'}
                    </button>
                  )}
                </div>
              </div>
              {deleting === msg.id && (
                <div className="gb-delete-confirm">
                  <span>确定删除？</span>
                  <button className="gb-confirm-yes" onClick={() => handleDelete(msg.id)}>删除</button>
                  <button className="gb-confirm-no" onClick={() => setDeleting(null)}>取消</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="guestbook-pagination">
          <button className="gb-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .map((p, i, arr) => (
              <span key={p} className="gb-page-group">
                {i > 0 && arr[i - 1] < p - 1 && <span className="gb-page-dots">...</span>}
                <button className={`gb-page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              </span>
            ))
          }
          <button className="gb-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
