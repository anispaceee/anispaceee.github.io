import { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { MailService, UserService } from '../../services/api';
import { Mail, Send, Star, Trash2, Search, Inbox, ArrowRight, MessageCircle, FileText, Paperclip, X, ChevronLeft, Bold, Italic, Underline, Smile, LinkIcon, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import './Mailbox.css';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const EMOJI_LIST = ['😊', '😂', '🥰', '😎', '🤔', '😅', '😍', '🥺', '😭', '😤', '👍', '❤️', '🎉', '✨', '🌟', '💫', '🎵', '🎮', '📺', '🎬', '🌸', '🎀', '🐱', '🐰', '🦊', '🐻', '🐨', '🐼'];

function sanitizeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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
  const [mode, setMode] = useState('mail');
  const [folder, setFolder] = useState('inbox');
  const [selectedMail, setSelectedMail] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChat]);

  if (!isAuthenticated || !currentUser) {
    return (
      <div className="mailbox-page">
        <div className="mailbox-auth-prompt">
          <Mail size={48} />
          <h2>请先登录</h2>
          <p>登录后即可使用邮箱功能</p>
          <button className="mailbox-auth-btn" onClick={() => openAuth('login')}>登录</button>
        </div>
      </div>
    );
  }

  const inbox = MailService.getInbox(currentUser.id);
  const sent = MailService.getSent(currentUser.id);
  const unreadCount = MailService.getUnreadCount(currentUser.id);

  const filteredMails = useMemo(() => {
    let mails = folder === 'inbox' ? inbox : folder === 'sent' ? sent : [...inbox, ...sent].filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);
    if (searchQuery.trim()) {
      mails = MailService.searchMails(currentUser.id, searchQuery);
    }
    return mails;
  }, [folder, inbox, sent, searchQuery, currentUser.id]);

  const chatList = useMemo(() => {
    const allMails = [...inbox, ...sent];
    const convMap = {};
    allMails.forEach(m => {
      const otherId = m.fromUserId === currentUser.id ? m.toUserId : m.fromUserId;
      if (!convMap[otherId] || new Date(m.createdAt) > new Date(convMap[otherId].lastMail.createdAt)) {
        convMap[otherId] = { otherUserId: otherId, lastMail: m, unread: 0 };
      }
    });
    inbox.forEach(m => {
      if (!m.read && convMap[m.fromUserId]) convMap[m.fromUserId].unread++;
    });
    return Object.values(convMap).sort((a, b) => new Date(b.lastMail.createdAt) - new Date(a.lastMail.createdAt));
  }, [inbox, sent, currentUser.id]);

  const chatMails = useMemo(() => {
    if (!selectedChat) return [];
    return MailService.getConversationMails(currentUser.id, selectedChat);
  }, [selectedChat, currentUser.id, inbox, sent]);

  const handleSendMail = () => {
    const toUser = UserService.search(composeForm.to);
    const target = toUser.find(u => u.username === composeForm.to || u.name === composeForm.to);
    if (!target) { alert('未找到该用户'); return; }
    if (!composeForm.content.trim()) return;
    const result = MailService.send(currentUser.id, target.id, composeForm.subject, composeForm.content, attachments);
    if (result.error) { alert(result.error); return; }
    setComposing(false);
    setComposeForm({ to: '', subject: '', content: '' });
    setAttachments([]);
  };

  const handleSendChat = () => {
    if (!chatInput.trim() || !selectedChat) return;
    MailService.send(currentUser.id, selectedChat, '', chatInput);
    setChatInput('');
    setShowEmoji(false);
  };

  const handleSelectMail = (mail) => {
    if (!mail.read && mail.toUserId === currentUser.id) {
      MailService.markAsRead(mail.id);
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
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--text-link)">$1</a>');
    html = html.replace(/\n/g, '<br/>');
    return html;
  };

  return (
    <div className="mailbox-page">
      <div className="mailbox-header">
        <div className="mailbox-title-row">
          <h1><Mail size={22} /> 邮箱 {unreadCount > 0 && <span className="mail-unread-badge">{unreadCount}</span>}</h1>
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
                {filteredMails.length === 0 ? (
                  <div className="mail-empty">暂无邮件</div>
                ) : (
                  filteredMails.map(mail => {
                    const isFromMe = mail.fromUserId === currentUser.id;
                    const otherUser = UserService.getById(isFromMe ? mail.toUserId : mail.fromUserId);
                    return (
                      <div key={mail.id} className={`mail-item ${selectedMail?.id === mail.id ? 'selected' : ''} ${!mail.read && !isFromMe ? 'unread' : ''}`} onClick={() => handleSelectMail(mail)}>
                        <img src={otherUser?.avatar || FALLBACK_IMG} alt="" className="mail-item-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />
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
                      <button className="detail-action-btn" onClick={() => MailService.toggleStar(selectedMail.id)} title="星标">
                        <Star size={14} fill={selectedMail.starred ? 'var(--accent-warm)' : 'none'} />
                      </button>
                      <button className="detail-action-btn" onClick={() => { MailService.deleteMail(selectedMail.id, currentUser.id); setSelectedMail(null); }} title="删除">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <h2 className="mail-detail-subject">{selectedMail.subject}</h2>
                  <div className="mail-detail-meta">
                    <img src={UserService.getById(selectedMail.fromUserId)?.avatar || FALLBACK_IMG} alt="" className="mail-detail-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />
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
                {chatList.length === 0 ? (
                  <div className="mail-empty">暂无对话</div>
                ) : (
                  chatList.map(conv => {
                    const otherUser = UserService.getById(conv.otherUserId);
                    if (!otherUser) return null;
                    if (searchQuery && !otherUser.name.includes(searchQuery) && !otherUser.username.includes(searchQuery)) return null;
                    return (
                      <div key={conv.otherUserId} className={`chat-item ${selectedChat === conv.otherUserId ? 'selected' : ''}`} onClick={() => setSelectedChat(conv.otherUserId)}>
                        <img src={otherUser.avatar || FALLBACK_IMG} alt="" className="chat-item-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />
                        <div className="chat-item-content">
                          <div className="chat-item-top">
                            <span className="chat-item-name">{otherUser.name}</span>
                            <span className="chat-item-time">{formatTime(conv.lastMail.createdAt)}</span>
                          </div>
                          <span className="chat-item-preview">{conv.lastMail.content.substring(0, 40)}</span>
                        </div>
                        {conv.unread > 0 && <span className="chat-unread-dot">{conv.unread}</span>}
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
                    <img src={UserService.getById(selectedChat)?.avatar || FALLBACK_IMG} alt="" className="chat-header-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />
                    <span className="chat-header-name">{UserService.getById(selectedChat)?.name || '未知'}</span>
                    <span className="chat-header-status">@{UserService.getById(selectedChat)?.username}</span>
                  </div>
                  <div className="chat-messages">
                    {chatMails.map(mail => {
                      const isMine = mail.fromUserId === currentUser.id;
                      return (
                        <div key={mail.id} className={`chat-msg ${isMine ? 'mine' : 'other'}`}>
                          {!isMine && <img src={UserService.getById(mail.fromUserId)?.avatar || FALLBACK_IMG} alt="" className="chat-msg-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />}
                          <div className="chat-msg-bubble">
                            <div className="chat-msg-text" dangerouslySetInnerHTML={{ __html: renderMailContent(mail.content) }} />
                            <div className="chat-msg-meta">
                              <span className="chat-msg-time">{formatTime(mail.createdAt)}</span>
                              {isMine && <span className="chat-msg-read">{mail.read ? <Eye size={10} /> : <EyeOff size={10} />}</span>}
                            </div>
                          </div>
                          {isMine && <img src={currentUser.avatar || FALLBACK_IMG} alt="" className="chat-msg-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />}
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
