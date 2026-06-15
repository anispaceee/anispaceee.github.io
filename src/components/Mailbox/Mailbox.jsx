import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { MailService, PrivateMessageService, UserService } from '../../services/api';
import { safeUrl, sanitizeHtml } from '../../utils/sanitize.js';
import { Mail, Send, Star, Trash2, Search, Inbox, ArrowRight, MessageCircle, FileText, Paperclip, X, ChevronLeft, Bold, Italic, Underline, Smile, LinkIcon, Image as ImageIcon, Eye, EyeOff, Loader2 } from 'lucide-react';
import UserAvatar from '../Common/UserAvatar';
import './Mailbox.css';

const EMOJI_LIST = ['😊', '😂', '🥰', '😎', '🤔', '😅', '😍', '🥺', '😭', '😤', '👍', '❤️', '🎉', '✨', '🌟', '💫', '🎵', '🎮', '📺', '🎬', '🌸', '🎀', '🐱', '🐰', '🦊', '🐻', '🐨', '🐼'];

const NAV_TABS = [
  { key: 'inbox', icon: Inbox, label: '收件箱' },
  { key: 'sent', icon: ArrowRight, label: '已发送' },
  { key: 'starred', icon: Star, label: '星标' },
  { key: 'chat', icon: MessageCircle, label: '对话' },
];

function formatTime(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatFullTime(isoStr) {
  return new Date(isoStr).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Mailbox() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [activeTab, setActiveTab] = useState('inbox');
  const [selectedMail, setSelectedMail] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [composing, setComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', content: '' });
  const [chatInput, setChatInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const contentRef = useRef(null);

  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatMails, setChatMails] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const mode = activeTab === 'chat' ? 'chat' : 'mail';
  const folder = activeTab === 'chat' ? 'inbox' : activeTab;

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const inboxData = await MailService.fetchInbox(currentUser.id);
      setInbox(Array.isArray(inboxData) ? inboxData : []);
    } catch { setInbox([]); }
    try {
      const sentData = await MailService.fetchSent(currentUser.id);
      setSent(Array.isArray(sentData) ? sentData : []);
    } catch { setSent([]); }
    try {
      const unreadData = await MailService.getUnreadCountAsync(currentUser.id);
      setUnreadCount(typeof unreadData === 'object' ? unreadData.unread : (unreadData || 0));
    } catch { /* no-op */ }
    setLoading(false);
  }, [currentUser]);

  const loadConversations = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await PrivateMessageService.fetchConversations(currentUser.id);
      setConversations(Array.isArray(data) ? data : []);
    } catch { setConversations([]); }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) loadData();
    return () => { setLoading(false); setSelectedMail(null); setSelectedChat(null); };
  }, [loadData, currentUser]);

  useEffect(() => {
    if (currentUser && mode === 'chat') loadConversations();
  }, [loadConversations, currentUser, mode]);

  useEffect(() => {
    if (!selectedChat || !currentUser || mode !== 'chat') return;
    let cancelled = false;
    PrivateMessageService.fetchConversation(currentUser.id, selectedChat)
      .then(data => { if (!cancelled) setChatMails(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setChatMails([]); });
    PrivateMessageService.markAsReadAsync(currentUser.id, selectedChat).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedChat, currentUser, mode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChat, chatMails]);

  const filteredMails = useMemo(() => {
    let mails = folder === 'inbox' ? inbox : folder === 'sent' ? sent : folder === 'starred' ? [...inbox, ...sent].filter(m => m.starred) : [...inbox, ...sent];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      mails = mails.filter(m => m.subject?.toLowerCase().includes(q) || m.content?.toLowerCase().includes(q));
    }
    return mails;
  }, [folder, inbox, sent, searchQuery]);

  if (!isAuthenticated || !currentUser) {
    return (
      <div className="dmail-page">
        <div className="dmail-auth-prompt">
          <Mail size={48} />
          <h2>请先登录</h2>
          <p>登录后即可使用 D-Mail</p>
          <button className="dmail-auth-btn" onClick={() => openAuth()}>登录</button>
        </div>
      </div>
    );
  }

  const handleSendMail = async () => {
    if (!composeForm.to.trim()) { alert('请输入收件人'); return; }
    const toUser = UserService.search(composeForm.to);
    const target = Array.isArray(toUser) ? toUser.find(u => u.username === composeForm.to || u.name === composeForm.to) : null;
    if (!target) { alert('未找到该用户'); return; }
    if (target.id === currentUser.id) { alert('不能给自己发邮件'); return; }
    if (!composeForm.content.trim()) return;
    try {
      const result = await MailService.sendAsync(currentUser.id, target.id, composeForm.subject, composeForm.content, attachments);
      if (result.error) { alert(result.error); return; }
    } catch (err) { alert('发送失败：' + (err.message || '未知错误')); return; }
    setComposing(false);
    setComposeForm({ to: '', subject: '', content: '' });
    setAttachments([]);
    loadData();
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !selectedChat) return;
    try {
      await PrivateMessageService.sendAsync(currentUser.id, selectedChat, chatInput);
    } catch { /* no-op */ }
    setChatInput('');
    setShowEmoji(false);
    loadConversations();
    try {
      const data = await PrivateMessageService.fetchConversation(currentUser.id, selectedChat);
      setChatMails(Array.isArray(data) ? data : []);
    } catch { /* no-op */ }
  };

  const handleSelectMail = async (mail) => {
    if (!mail.read && mail.to_user_id === currentUser.id) {
      try {
        await MailService.markAsReadAsync(mail.id);
        setInbox(prev => prev.map(m => m.id === mail.id ? { ...m, read: true } : m));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch { /* no-op */ }
    }
    setSelectedMail(mail);
  };

  const handleFileAttach = (e) => {
    const files = Array.from(e.target.files || []);
    const newAtts = files.filter(f => f.size <= 10 * 1024 * 1024).map(f => ({
      name: f.name, size: f.size, type: f.type, data: null,
    }));
    setAttachments(prev => [...prev, ...newAtts]);
  };

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const insertFormat = (type) => {
    const textarea = contentRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = composeForm.content.substring(start, end);
    let wrapped = selected;
    if (type === 'bold') wrapped = `**${selected}**`;
    else if (type === 'italic') wrapped = `*${selected}*`;
    else if (type === 'underline') wrapped = `__${selected}__`;
    else if (type === 'link') wrapped = `[${selected || '链接文字'}](url)`;
    const newContent = composeForm.content.substring(0, start) + wrapped + composeForm.content.substring(end);
    setComposeForm({ ...composeForm, content: newContent });
  };

  const insertEmoji = (emoji) => {
    if (mode === 'chat') {
      setChatInput(prev => prev + emoji);
    } else {
      setComposeForm({ ...composeForm, content: composeForm.content + emoji });
    }
  };

  const renderMailContent = (content) => {
    let html = sanitizeHtml(content);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/__(.*?)__/g, '<u>$1</u>');
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, (_, text, url) =>
      safeUrl(url) ? `<a href="${safeUrl(url)}" target="_blank" rel="noopener" style="color:var(--text-link)">${text}</a>` : text
    );
    html = html.replace(/\n/g, '<br/>');
    return html;
  };

  // ── Sidebar content ──
  const renderSidebar = () => {
    if (mode === 'chat') {
      return (
        <div className="dmail-sidebar-content">
          <div className="dmail-sidebar-search">
            <Search size={14} />
            <input placeholder="搜索对话..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="dmail-list">
            {conversations.length === 0 ? (
              <div className="dmail-empty">暂无对话</div>
            ) : (
              conversations.map(conv => {
                if (searchQuery && !conv.other_user_name?.includes(searchQuery)) return null;
                return (
                  <div key={conv.other_user_id} className={`dmail-list-item ${selectedChat === conv.other_user_id ? 'active' : ''}`} onClick={() => setSelectedChat(conv.other_user_id)}>
                    <UserAvatar userId={conv.other_user_id} src={conv.other_user_avatar} alt={conv.other_user_name} size={42} className="dmail-list-avatar" />
                    <div className="dmail-list-info">
                      <div className="dmail-list-top">
                        <span className="dmail-list-name">{conv.other_user_name || '未知用户'}</span>
                        <span className="dmail-list-time">{formatTime(conv.last_message_at)}</span>
                      </div>
                      <span className="dmail-list-preview">{(conv.last_message || '').substring(0, 40)}</span>
                    </div>
                    {conv.unread_count > 0 && <span className="dmail-list-badge">{conv.unread_count}</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="dmail-sidebar-content">
        <div className="dmail-sidebar-search">
          <Search size={14} />
          <input placeholder="搜索邮件..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="dmail-list">
          {loading ? (
            <div className="dmail-empty"><Loader2 size={20} className="spin" /> 雨何时停？</div>
          ) : filteredMails.length === 0 ? (
            <div className="dmail-empty">暂无邮件</div>
          ) : (
            filteredMails.map(mail => {
              const isFromMe = mail.from_user_id === currentUser.id;
              const otherUser = UserService.getById(isFromMe ? mail.to_user_id : mail.from_user_id);
              return (
                <div key={mail.id} className={`dmail-list-item ${selectedMail?.id === mail.id ? 'active' : ''} ${!mail.read && !isFromMe ? 'unread' : ''}`} onClick={() => handleSelectMail(mail)}>
                  <UserAvatar userId={isFromMe ? mail.to_user_id : mail.from_user_id} src={otherUser?.avatar} alt={otherUser?.name} size={42} className="dmail-list-avatar" />
                  <div className="dmail-list-info">
                    <div className="dmail-list-top">
                      <span className="dmail-list-name">{otherUser?.name || '未知用户'}</span>
                      <span className="dmail-list-time">{formatTime(mail.created_at)}</span>
                    </div>
                    <span className="dmail-list-subject">{mail.subject}</span>
                    <span className="dmail-list-preview">{mail.content.substring(0, 50)}...</span>
                  </div>
                  {mail.starred && <Star size={12} className="dmail-star-icon" />}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // ── Main content ──
  const renderMain = () => {
    if (composing) {
      return (
        <div className="dmail-compose">
          <div className="dmail-compose-header">
            <h3>写邮件</h3>
            <button className="dmail-compose-close" onClick={() => setComposing(false)}><X size={16} /></button>
          </div>
          <div className="dmail-compose-field">
            <label>收件人</label>
            <input placeholder="输入用户名或昵称..." value={composeForm.to} onChange={e => setComposeForm({ ...composeForm, to: e.target.value })} />
          </div>
          <div className="dmail-compose-field">
            <label>主题</label>
            <input placeholder="邮件主题..." value={composeForm.subject} onChange={e => setComposeForm({ ...composeForm, subject: e.target.value })} />
          </div>
          <div className="dmail-compose-toolbar">
            <button className="dmail-fmt-btn" onClick={() => insertFormat('bold')} title="粗体"><Bold size={14} /></button>
            <button className="dmail-fmt-btn" onClick={() => insertFormat('italic')} title="斜体"><Italic size={14} /></button>
            <button className="dmail-fmt-btn" onClick={() => insertFormat('underline')} title="下划线"><Underline size={14} /></button>
            <button className="dmail-fmt-btn" onClick={() => setShowEmoji(!showEmoji)} title="表情"><Smile size={14} /></button>
            <button className="dmail-fmt-btn" onClick={() => insertFormat('link')} title="链接"><LinkIcon size={14} /></button>
            <button className="dmail-fmt-btn" onClick={() => fileInputRef.current?.click()} title="附件"><Paperclip size={14} /></button>
            <input ref={fileInputRef} type="file" multiple onChange={handleFileAttach} hidden />
          </div>
          {showEmoji && (
            <div className="dmail-emoji-picker">
              {EMOJI_LIST.map(e => (
                <button key={e} className="dmail-emoji-btn" onClick={() => { insertEmoji(e); setShowEmoji(false); }}>{e}</button>
              ))}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="dmail-compose-attachments">
              {attachments.map((att, i) => (
                <div key={i} className="dmail-att-item">
                  <Paperclip size={10} /> {att.name} ({(att.size / 1024).toFixed(0)}KB)
                  <button onClick={() => removeAttachment(i)}><X size={10} /></button>
                </div>
              ))}
            </div>
          )}
          <textarea ref={contentRef} className="dmail-compose-content" rows={10} placeholder="写点什么..." value={composeForm.content} onChange={e => setComposeForm({ ...composeForm, content: e.target.value })} />
          <div className="dmail-compose-actions">
            <button className="dmail-send-btn" onClick={handleSendMail} disabled={!composeForm.to || !composeForm.content.trim()}>
              <Send size={14} /> 发送
            </button>
          </div>
        </div>
      );
    }

    if (mode === 'chat') {
      if (!selectedChat) {
        return (
          <div className="dmail-main-empty">
            <MessageCircle size={48} />
            <p>选择一个对话开始聊天</p>
          </div>
        );
      }
      return (
        <>
          <div className="dmail-chat-header">
            {conversations.find(c => c.other_user_id === selectedChat) ? (
              <>
                <UserAvatar userId={selectedChat} src={conversations.find(c => c.other_user_id === selectedChat).other_user_avatar} alt={conversations.find(c => c.other_user_id === selectedChat).other_user_name} size={36} className="dmail-chat-header-avatar" />
                <span className="dmail-chat-header-name">{conversations.find(c => c.other_user_id === selectedChat).other_user_name || '未知'}</span>
              </>
            ) : (
              <>
                <UserAvatar userId={selectedChat} src={UserService.getById(selectedChat)?.avatar} alt={UserService.getById(selectedChat)?.name} size={36} className="dmail-chat-header-avatar" />
                <span className="dmail-chat-header-name">{UserService.getById(selectedChat)?.name || '未知'}</span>
              </>
            )}
          </div>
          <div className="dmail-chat-messages">
            {chatMails.map(msg => {
              const isMine = msg.from_user_id === currentUser.id;
              return (
                <div key={msg.id} className={`dmail-chat-msg ${isMine ? 'mine' : 'other'}`}>
                  {!isMine && <UserAvatar userId={msg.from_user_id} src={msg.from_user_avatar} alt={msg.from_user_name} size={32} className="dmail-chat-msg-avatar" />}
                  <div className="dmail-chat-bubble">
                    <div className="dmail-chat-msg-text">{msg.content}</div>
                    <div className="dmail-chat-msg-meta">
                      <span className="dmail-chat-msg-time">{formatTime(msg.created_at)}</span>
                      {isMine && <span className="dmail-chat-msg-read">{msg.read ? <Eye size={10} /> : <EyeOff size={10} />}</span>}
                    </div>
                  </div>
                  {isMine && <UserAvatar userId={currentUser.id} src={currentUser.avatar} alt={currentUser.name} size={32} className="dmail-chat-msg-avatar" />}
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          <div className="dmail-chat-input-area">
            <button className="dmail-emoji-trigger" onClick={() => setShowEmoji(!showEmoji)}><Smile size={18} /></button>
            {showEmoji && (
              <div className="dmail-chat-emoji-picker">
                {EMOJI_LIST.map(e => (
                  <button key={e} className="dmail-emoji-btn" onClick={() => { insertEmoji(e); setShowEmoji(false); }}>{e}</button>
                ))}
              </div>
            )}
            <input className="dmail-chat-input" placeholder="输入消息..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }} />
            <button className="dmail-chat-send-btn" onClick={handleSendChat} disabled={!chatInput.trim()}><Send size={16} /></button>
          </div>
        </>
      );
    }

    // Mail mode
    if (!selectedMail) {
      return (
        <div className="dmail-main-empty">
          <Mail size={48} />
          <p>选择一封邮件查看</p>
        </div>
      );
    }

    return (
      <div className="dmail-detail">
        <div className="dmail-detail-header">
          <button className="dmail-back-btn" onClick={() => setSelectedMail(null)}><ChevronLeft size={16} /> 返回</button>
          <div className="dmail-detail-actions">
            <button className="dmail-action-btn" onClick={async () => { try { await MailService.toggleStarAsync(selectedMail.id); setSelectedMail(prev => prev ? { ...prev, starred: !prev.starred } : prev); loadData(); } catch { /* no-op */ } }} title="星标">
              <Star size={14} fill={selectedMail.starred ? 'var(--accent-warm)' : 'none'} />
            </button>
            <button className="dmail-action-btn" onClick={async () => { try { await MailService.deleteMailAsync(selectedMail.id, currentUser.id); } catch { /* no-op */ } setSelectedMail(null); loadData(); }} title="删除">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <h2 className="dmail-detail-subject">{selectedMail.subject}</h2>
        <div className="dmail-detail-meta">
          <UserAvatar userId={selectedMail.from_user_id} src={UserService.getById(selectedMail.from_user_id)?.avatar} alt={UserService.getById(selectedMail.from_user_id)?.name} size={40} className="dmail-detail-avatar" />
          <div>
            <span className="dmail-detail-from">{UserService.getById(selectedMail.from_user_id)?.name || '未知'}</span>
            <span className="dmail-detail-to">发送给 {UserService.getById(selectedMail.to_user_id)?.name || '未知'}</span>
          </div>
          <span className="dmail-detail-time">{formatFullTime(selectedMail.created_at)}</span>
        </div>
        <div className="dmail-detail-body" dangerouslySetInnerHTML={{ __html: renderMailContent(selectedMail.content) }} />
        {selectedMail.attachments?.length > 0 && (
          <div className="dmail-detail-attachments">
            <h4>附件</h4>
            {selectedMail.attachments.map((att, i) => (
              <div key={i} className="dmail-detail-att-item"><Paperclip size={12} /> {att.name}</div>
            ))}
          </div>
        )}
        <button className="dmail-reply-btn" onClick={() => {
          const otherUser = UserService.getById(selectedMail.from_user_id === currentUser.id ? selectedMail.to_user_id : selectedMail.from_user_id);
          setComposeForm({ to: otherUser?.username || '', subject: `Re: ${selectedMail.subject}`, content: '' });
          setComposing(true);
        }}>
          <ArrowRight size={14} /> 回复
        </button>
      </div>
    );
  };

  return (
    <div className="dmail-page">
      {/* Left icon nav */}
      <nav className="dmail-nav">
        <div className="dmail-nav-logo">✉</div>
        <div className="dmail-nav-top">
          {NAV_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            const badge = tab.key === 'inbox' ? unreadCount : 0;
            return (
              <button
                key={tab.key}
                className={`dmail-nav-btn ${isActive ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.key); setSearchQuery(''); setSelectedMail(null); setSelectedChat(null); setComposing(false); }}
              >
                <Icon size={18} />
                <span className="dmail-nav-label">{tab.label}</span>
                {badge > 0 && <span className="dmail-nav-badge">{badge > 99 ? '99+' : badge}</span>}
              </button>
            );
          })}
        </div>
        <div className="dmail-nav-bottom">
          <button className="dmail-nav-btn" onClick={() => setComposing(true)} title="写邮件">
            <Send size={18} />
            <span className="dmail-nav-label">写信</span>
          </button>
        </div>
      </nav>

      {/* Sidebar list */}
      <aside className="dmail-sidebar">
        {renderSidebar()}
      </aside>

      {/* Main content */}
      <main className="dmail-main">
        {renderMain()}
      </main>
    </div>
  );
}
