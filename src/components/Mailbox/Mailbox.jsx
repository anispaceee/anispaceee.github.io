import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { MailService, PrivateMessageService, UserService } from '../../services/api';
import { safeUrl, sanitizeHtml } from '../../utils/sanitize.js';
import { Mail, Send, Star, Trash2, Search, Inbox, ArrowRight, MessageCircle, FileText, Paperclip, X, ChevronLeft, Bold, Italic, Underline, Smile, LinkIcon, Image as ImageIcon, Eye, EyeOff, Loader2 } from 'lucide-react';
import UserAvatar from '../Common/UserAvatar';
import './Mailbox.css';

const EMOJI_LIST = ['😊', '😂', '🥰', '😎', '🤔', '😅', '😍', '🥺', '😭', '😤', '👍', '❤️', '🎉', '✨', '🌟', '💫', '🎵', '🎮', '📺', '🎬', '🌸', '🎀', '🐱', '🐰', '🦊', '🐻', '🐨', '🐼'];

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
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(() => searchParams.get('chat') ? 'chat' : 'mail');
  const [folder, setFolder] = useState('inbox');
  const [selectedMail, setSelectedMail] = useState(null);
  const [selectedChat, setSelectedChat] = useState(() => {
    const chatId = searchParams.get('chat');
    return chatId ? parseInt(chatId) : null;
  });
  const [composing, setComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', content: '' });
  const [chatInput, setChatInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const contentRef = useRef(null);

  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatMails, setChatMails] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

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
      setUnreadCount(typeof unreadData === 'object' ? unreadData.count : (unreadData || 0));
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentUser) loadData();
    return () => { setLoading(false); setSelectedMail(null); setSelectedChat(null); };
  }, [loadData, currentUser]);

  useEffect(() => {
    if (currentUser && mode === 'chat') loadConversations();
  }, [loadConversations, currentUser, mode, chatInput]);

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
    let mails = folder === 'inbox' ? inbox : folder === 'sent' ? sent : [...inbox, ...sent].filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      mails = mails.filter(m => m.subject?.toLowerCase().includes(q) || m.content?.toLowerCase().includes(q));
    }
    return mails;
  }, [folder, inbox, sent, searchQuery]);

  if (!isAuthenticated || !currentUser) {
    return (
      <div className="mailbox-page">
        <div className="mailbox-auth-prompt">
          <Mail size={48} />
          <h2>请先登录</h2>
          <p>登录后即可使用邮箱功能</p>
          <button className="mailbox-auth-btn" onClick={() => openAuth()}>登录</button>
        </div>
      </div>
    );
  }

  const handleSendMail = async () => {
    const toUser = UserService.search(composeForm.to);
    const target = toUser.find(u => u.username === composeForm.to || u.name === composeForm.to);
    if (!target) { alert('未找到该用户'); return; }
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
    if (!mail.read && mail.toUserId === currentUser.id) {
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

  return (
    <div className="mailbox-page">
      <div className="mailbox-header">
        <div className="mailbox-title-row">
          <h1><Mail size={22} /> D-Mail {unreadCount > 0 && <span className="mail-unread-badge">{unreadCount}</span>}</h1>
          <div className="mailbox-mode-switch">
            <button className={`mode-btn ${mode === 'mail' ? 'active' : ''}`} onClick={() => { setMode('mail'); setSelectedMail(null); }}>
              <FileText size={14} /> 邮箱模式
            </button>
            <button className={`mode-btn ${mode === 'chat' ? 'active' : ''}`} onClick={() => { setMode('chat'); setSelectedChat(null); setSelectedMail(null); }}>
              <MessageCircle size={14} /> 对话模式
            </button>
          </div>
        </div>
      </div>

      <div className="mailbox-body">
        {mode === 'mail' ? (
          <>
            <div className="mail-sidebar">
              <button className="mail-compose-btn" onClick={() => setComposing(true)}>
                <Send size={14} /> 写邮件
              </button>
              <div className="mail-folders">
                <button className={`folder-btn ${folder === 'inbox' ? 'active' : ''}`} onClick={() => { setFolder('inbox'); setSelectedMail(null); }}>
                  <Inbox size={14} /> 收件箱 {unreadCount > 0 && <span className="folder-badge">{unreadCount}</span>}
                </button>
                <button className={`folder-btn ${folder === 'sent' ? 'active' : ''}`} onClick={() => { setFolder('sent'); setSelectedMail(null); }}>
                  <ArrowRight size={14} /> 已发送
                </button>
                <button className={`folder-btn ${folder === 'starred' ? 'active' : ''}`} onClick={() => { setFolder('starred'); setSelectedMail(null); }}>
                  <Star size={14} /> 星标
                </button>
              </div>
              <div className="mail-search">
                <Search size={14} />
                <input placeholder="搜索邮件..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <div className="mail-list">
                {loading ? (
                  <div className="mail-empty"><Loader2 size={20} className="spin" /> 雨，何时才能停？</div>
                ) : filteredMails.length === 0 ? (
                  <div className="mail-empty">暂无邮件</div>
                ) : (
                  filteredMails.map(mail => {
                    const isFromMe = mail.fromUserId === currentUser.id;
                    const otherUser = UserService.getById(isFromMe ? mail.toUserId : mail.fromUserId);
                    return (
                      <div key={mail.id} className={`mail-item ${selectedMail?.id === mail.id ? 'selected' : ''} ${!mail.read && !isFromMe ? 'unread' : ''}`} onClick={() => handleSelectMail(mail)}>
                        <UserAvatar userId={isFromMe ? mail.toUserId : mail.fromUserId} src={otherUser?.avatar} alt={otherUser?.name} size={40} className="mail-item-avatar" />
                        <div className="mail-item-content">
                          <div className="mail-item-top">
                            <span className="mail-item-from">{otherUser?.name || '未知用户'}</span>
                            <span className="mail-item-time">{formatTime(mail.createdAt)}</span>
                          </div>
                          <span className="mail-item-subject">{mail.subject}</span>
                          <span className="mail-item-preview">{mail.content.substring(0, 60)}...</span>
                        </div>
                        {mail.starred && <Star size={12} className="mail-star-icon" />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mail-reader">
              {composing ? (
                <div className="mail-compose">
                  <div className="compose-header">
                    <h3>写邮件</h3>
                    <button className="compose-close" onClick={() => setComposing(false)}><X size={16} /></button>
                  </div>
                  <div className="compose-field">
                    <label>收件人</label>
                    <input placeholder="输入用户名或昵称..." value={composeForm.to} onChange={e => setComposeForm({ ...composeForm, to: e.target.value })} />
                  </div>
                  <div className="compose-field">
                    <label>主题</label>
                    <input placeholder="邮件主题..." value={composeForm.subject} onChange={e => setComposeForm({ ...composeForm, subject: e.target.value })} />
                  </div>
                  <div className="compose-toolbar">
                    <button className="fmt-btn" onClick={() => insertFormat('bold')} title="粗体"><Bold size={14} /></button>
                    <button className="fmt-btn" onClick={() => insertFormat('italic')} title="斜体"><Italic size={14} /></button>
                    <button className="fmt-btn" onClick={() => insertFormat('underline')} title="下划线"><Underline size={14} /></button>
                    <button className="fmt-btn" onClick={() => setShowEmoji(!showEmoji)} title="表情"><Smile size={14} /></button>
                    <button className="fmt-btn" onClick={() => insertFormat('link')} title="链接"><LinkIcon size={14} /></button>
                    <button className="fmt-btn" onClick={() => fileInputRef.current?.click()} title="附件"><Paperclip size={14} /></button>
                    <input ref={fileInputRef} type="file" multiple onChange={handleFileAttach} hidden />
                  </div>
                  {showEmoji && (
                    <div className="emoji-picker">
                      {EMOJI_LIST.map(e => (
                        <button key={e} className="emoji-btn" onClick={() => { insertEmoji(e); setShowEmoji(false); }}>{e}</button>
                      ))}
                    </div>
                  )}
                  {attachments.length > 0 && (
                    <div className="compose-attachments">
                      {attachments.map((att, i) => (
                        <div key={i} className="compose-att-item">
                          <Paperclip size={10} /> {att.name} ({(att.size / 1024).toFixed(0)}KB)
                          <button onClick={() => removeAttachment(i)}><X size={10} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea ref={contentRef} className="compose-content" rows={10} placeholder="写点什么..." value={composeForm.content} onChange={e => setComposeForm({ ...composeForm, content: e.target.value })} />
                  <div className="compose-actions">
                    <button className="compose-send-btn" onClick={handleSendMail} disabled={!composeForm.to || !composeForm.content.trim()}>
                      <Send size={14} /> 发送
                    </button>
                  </div>
                </div>
              ) : selectedMail ? (
                <div className="mail-detail">
                  <div className="mail-detail-header">
                    <button className="mail-back-btn" onClick={() => setSelectedMail(null)}><ChevronLeft size={16} /> 返回</button>
                    <div className="mail-detail-actions">
                      <button className="detail-action-btn" onClick={async () => { try { await MailService.toggleStarAsync(selectedMail.id); setSelectedMail(prev => prev ? { ...prev, starred: !prev.starred } : prev); loadData(); } catch { /* no-op */ } }} title="星标">
                        <Star size={14} fill={selectedMail.starred ? 'var(--accent-warm)' : 'none'} />
                      </button>
                      <button className="detail-action-btn" onClick={async () => { try { await MailService.deleteMailAsync(selectedMail.id, currentUser.id); } catch { /* no-op */ } setSelectedMail(null); loadData(); }} title="删除">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <h2 className="mail-detail-subject">{selectedMail.subject}</h2>
                  <div className="mail-detail-meta">
                    <UserAvatar userId={selectedMail.fromUserId} src={UserService.getById(selectedMail.fromUserId)?.avatar} alt={UserService.getById(selectedMail.fromUserId)?.name} size={40} className="mail-detail-avatar" />
                    <div>
                      <span className="mail-detail-from">{UserService.getById(selectedMail.fromUserId)?.name || '未知'}</span>
                      <span className="mail-detail-to">发送给 {UserService.getById(selectedMail.toUserId)?.name || '未知'}</span>
                    </div>
                    <span className="mail-detail-time">{formatFullTime(selectedMail.createdAt)}</span>
                  </div>
                  <div className="mail-detail-body" dangerouslySetInnerHTML={{ __html: renderMailContent(selectedMail.content) }} />
                  {selectedMail.attachments?.length > 0 && (
                    <div className="mail-detail-attachments">
                      <h4>附件</h4>
                      {selectedMail.attachments.map((att, i) => (
                        <div key={i} className="detail-att-item"><Paperclip size={12} /> {att.name}</div>
                      ))}
                    </div>
                  )}
                  <button className="mail-reply-btn" onClick={() => {
                    const otherUser = UserService.getById(selectedMail.fromUserId === currentUser.id ? selectedMail.toUserId : selectedMail.fromUserId);
                    setComposeForm({ to: otherUser?.username || '', subject: `Re: ${selectedMail.subject}`, content: '' });
                    setComposing(true);
                  }}>
                    <ArrowRight size={14} /> 回复
                  </button>
                </div>
              ) : (
                <div className="mail-reader-empty">
                  <Mail size={48} />
                  <p>选择一封邮件查看</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="chat-sidebar">
              <div className="chat-search">
                <Search size={14} />
                <input placeholder="搜索对话..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <div className="chat-list">
                {conversations.length === 0 ? (
                  <div className="mail-empty">暂无对话</div>
                ) : (
                  conversations.map(conv => {
                    if (searchQuery && !conv.other_user_name?.includes(searchQuery)) return null;
                    return (
                      <div key={conv.other_user_id} className={`chat-item ${selectedChat === conv.other_user_id ? 'selected' : ''}`} onClick={() => setSelectedChat(conv.other_user_id)}>
                        <UserAvatar userId={conv.other_user_id} src={conv.other_user_avatar} alt={conv.other_user_name} size={40} className="chat-item-avatar" />
                        <div className="chat-item-content">
                          <div className="chat-item-top">
                            <span className="chat-item-name">{conv.other_user_name || '未知用户'}</span>
                            <span className="chat-item-time">{formatTime(conv.last_message_at)}</span>
                          </div>
                          <span className="chat-item-preview">{(conv.last_message || '').substring(0, 40)}</span>
                        </div>
                        {conv.unread_count > 0 && <span className="chat-unread-dot">{conv.unread_count}</span>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="chat-main">
              {selectedChat ? (
                <>
                  <div className="chat-header">
                    {conversations.find(c => c.other_user_id === selectedChat) ? (
                      <>
                        <UserAvatar userId={selectedChat} src={conversations.find(c => c.other_user_id === selectedChat).other_user_avatar} alt={conversations.find(c => c.other_user_id === selectedChat).other_user_name} size={40} className="chat-header-avatar" />
                        <span className="chat-header-name">{conversations.find(c => c.other_user_id === selectedChat).other_user_name || '未知'}</span>
                      </>
                    ) : (
                      <>
                        <UserAvatar userId={selectedChat} src={UserService.getById(selectedChat)?.avatar} alt={UserService.getById(selectedChat)?.name} size={40} className="chat-header-avatar" />
                        <span className="chat-header-name">{UserService.getById(selectedChat)?.name || '未知'}</span>
                      </>
                    )}
                  </div>
                  <div className="chat-messages">
                    {chatMails.map(msg => {
                      const isMine = msg.from_user_id === currentUser.id;
                      return (
                        <div key={msg.id} className={`chat-msg ${isMine ? 'mine' : 'other'}`}>
                          {!isMine && <UserAvatar userId={msg.from_user_id} src={msg.from_user_avatar} alt={msg.from_user_name} size={32} className="chat-msg-avatar" />}
                          <div className="chat-msg-bubble">
                            <div className="chat-msg-text">{msg.content}</div>
                            <div className="chat-msg-meta">
                              <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
                              {isMine && <span className="chat-msg-read">{msg.read ? <Eye size={10} /> : <EyeOff size={10} />}</span>}
                            </div>
                          </div>
                          {isMine && <UserAvatar userId={currentUser.id} src={currentUser.avatar} alt={currentUser.name} size={32} className="chat-msg-avatar" />}
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="chat-input-area">
                    <button className="chat-emoji-btn" onClick={() => setShowEmoji(!showEmoji)}><Smile size={18} /></button>
                    {showEmoji && (
                      <div className="chat-emoji-picker">
                        {EMOJI_LIST.map(e => (
                          <button key={e} className="emoji-btn" onClick={() => { insertEmoji(e); setShowEmoji(false); }}>{e}</button>
                        ))}
                      </div>
                    )}
                    <input className="chat-input" placeholder="输入消息..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }} />
                    <button className="chat-send-btn" onClick={handleSendChat} disabled={!chatInput.trim()}><Send size={16} /></button>
                  </div>
                </>
              ) : (
                <div className="chat-empty">
                  <MessageCircle size={48} />
                  <p>选择一个对话开始聊天</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
