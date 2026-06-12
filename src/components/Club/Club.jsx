import { useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService, UserService } from '../../services/api';
import {
  Users, Plus, Crown, Shield, MessageSquare, Settings, X, Send,
  Search, UserPlus, LogOut, Hash, Compass, Volume2, MicOff, ChevronDown,
  ChevronRight, Megaphone, MoreHorizontal
} from 'lucide-react';
import './Club.css';

const CLUB_STORAGE = 'acg_clubs';
const FALLBACK_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const CLUB_TYPES = [
  { key: 'creation', label: '创作社', icon: '🎨', desc: '绘画、小说、音乐创作' },
  { key: 'anime', label: '追番社', icon: '📺', desc: '一起追番讨论' },
  { key: 'game', label: '游戏社', icon: '🎮', desc: '游戏攻略与联机' },
  { key: 'music', label: '音乐社', icon: '🎵', desc: '音乐分享与创作' },
  { key: 'tech', label: '技术社', icon: '💻', desc: '编程、技术交流' },
  { key: 'other', label: '其他', icon: '✨', desc: '更多兴趣社团' },
];

const NAV_TABS = [
  { key: 'messages', icon: MessageSquare, label: '消息' },
  { key: 'clubs', icon: Users, label: '社团' },
  { key: 'discover', icon: Compass, label: '加入' },
  { key: 'settings', icon: Settings, label: '设置' },
];

function getInitialClubs() {
  const saved = StorageService.get(CLUB_STORAGE, null);
  if (saved) return saved;
  return [
    {
      id: 'club1',
      name: '星空画社',
      type: 'creation',
      description: '一起画画、分享作品、互相学习进步的社团~',
      icon: '🎨',
      cover: '',
      president: 'user1',
      admins: ['user2'],
      members: ['user1', 'user2', 'user3'],
      mutedMembers: [],
      announcements: [
        { id: 'a1', content: '本周六下午3点线上绘画交流会，大家准备一下作品~', createdAt: new Date(Date.now() - 172800000).toISOString(), userId: 'user1' }
      ],
      messages: [
        { id: 'm1', type: 'system', content: '用户user1创建了社团', createdAt: new Date(Date.now() - 604800000).toISOString() },
        { id: 'm2', type: 'system', content: '用户user2加入了社团', createdAt: new Date(Date.now() - 518400000).toISOString() },
        { id: 'm3', userId: 'user1', content: '欢迎来到星空画社！大家多多分享作品哦~', createdAt: new Date(Date.now() - 86400000).toISOString() },
        { id: 'm4', userId: 'user2', content: '刚画了一张蕾姆，晚点分享给大家看！', createdAt: new Date(Date.now() - 43200000).toISOString() },
      ],
      maxMembers: 50,
      createdAt: new Date(Date.now() - 604800000).toISOString(),
      lastReadIndex: {},
    },
    {
      id: 'club2',
      name: '命运石之门研究部',
      type: 'anime',
      description: 'El Psy Kongroo！研究命运石之门的世界观和理论~',
      icon: '📺',
      cover: '',
      president: 'user2',
      admins: [],
      members: ['user1', 'user2'],
      mutedMembers: [],
      announcements: [],
      messages: [
        { id: 'm5', type: 'system', content: '用户user2创建了社团', createdAt: new Date(Date.now() - 259200000).toISOString() },
        { id: 'm6', userId: 'user2', content: '这个世界线变动率...1.048596%！', createdAt: new Date(Date.now() - 3600000).toISOString() },
      ],
      maxMembers: 30,
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      lastReadIndex: {},
    },
  ];
}

export default function Club() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [clubs, setClubs] = useState(getInitialClubs);
  const [activeTab, setActiveTab] = useState('messages');
  const [activeClub, setActiveClub] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);
  const [announceInput, setAnnounceInput] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', type: 'creation', description: '', maxMembers: 50 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const chatEndRef = useRef(null);

  const saveClubs = useCallback((newClubs) => {
    setClubs(newClubs);
    StorageService.set(CLUB_STORAGE, newClubs);
  }, []);

  const getUserById = (id) => {
    if (currentUser && id === currentUser.id) return currentUser;
    return UserService.getById(id) || { name: '用户' + String(id).slice(-4), avatar: FALLBACK_AVATAR };
  };

  const isMember = (club) => isAuthenticated && club.members.includes(currentUser?.id);
  const isPresident = (club) => isAuthenticated && club.president === currentUser?.id;
  const isAdmin = (club) => isAuthenticated && (club.admins.includes(currentUser?.id) || club.president === currentUser?.id);
  const isMuted = (club) => isAuthenticated && (club.mutedMembers || []).includes(currentUser?.id);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeClub?.messages?.length]);

  // Mark as read when selecting a club
  const handleSelectClub = (club) => {
    setActiveClub(club);
    setMobileShowChat(true);
    // Mark all messages as read
    if (isAuthenticated && club.messages) {
      const userId = currentUser.id;
      const lastIdx = club.messages.length - 1;
      if ((club.lastReadIndex?.[userId] || -1) < lastIdx) {
        saveClubs(clubs.map(c => {
          if (c.id !== club.id) return c;
          return { ...c, lastReadIndex: { ...c.lastReadIndex, [userId]: lastIdx } };
        }));
      }
    }
  };

  // Get unread count for a club
  const getUnreadCount = (club) => {
    if (!isAuthenticated) return 0;
    const userId = currentUser.id;
    const lastRead = club.lastReadIndex?.[userId] ?? -1;
    return Math.max(0, club.messages.length - 1 - lastRead);
  };

  // Get last message preview
  const getLastMessage = (club) => {
    if (!club.messages || club.messages.length === 0) return { text: '暂无消息', time: '' };
    const last = club.messages[club.messages.length - 1];
    const text = last.type === 'system' ? last.content : `${getUserById(last.userId).name}: ${last.content}`;
    return { text, time: formatTime(last.createdAt) };
  };

  const handleCreate = () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (!createForm.name.trim()) return;
    const club = {
      id: 'club' + Date.now(),
      name: createForm.name.trim(),
      type: createForm.type,
      description: createForm.description.trim(),
      icon: CLUB_TYPES.find(t => t.key === createForm.type)?.icon || '✨',
      cover: '',
      president: currentUser.id,
      admins: [],
      members: [currentUser.id],
      mutedMembers: [],
      announcements: [],
      messages: [
        { id: 'm' + Date.now(), type: 'system', content: `${currentUser.name || currentUser.id}创建了社团`, createdAt: new Date().toISOString() },
        { id: 'm' + (Date.now() + 1), userId: currentUser.id, content: `欢迎来到${createForm.name.trim()}！`, createdAt: new Date().toISOString() },
      ],
      maxMembers: createForm.maxMembers,
      createdAt: new Date().toISOString(),
      lastReadIndex: {},
    };
    saveClubs([club, ...clubs]);
    setShowCreate(false);
    setCreateForm({ name: '', type: 'creation', description: '', maxMembers: 50 });
  };

  const handleJoin = (clubId) => {
    if (!isAuthenticated) { openAuth(); return; }
    saveClubs(clubs.map(c => {
      if (c.id !== clubId || c.members.includes(currentUser.id)) return c;
      if (c.members.length >= c.maxMembers) return c;
      const sysMsg = { id: 'm' + Date.now(), type: 'system', content: `${currentUser.name || currentUser.id}加入了社团`, createdAt: new Date().toISOString() };
      return { ...c, members: [...c.members, currentUser.id], messages: [...c.messages, sysMsg] };
    }));
  };

  const handleLeave = (clubId) => {
    if (!isAuthenticated) return;
    const userName = currentUser.name || currentUser.id;
    saveClubs(clubs.map(c => {
      if (c.id !== clubId) return c;
      if (c.president === currentUser.id) return c;
      const sysMsg = { id: 'm' + Date.now(), type: 'system', content: `${userName}退出了社团`, createdAt: new Date().toISOString() };
      return {
        ...c,
        members: c.members.filter(id => id !== currentUser.id),
        admins: c.admins.filter(id => id !== currentUser.id),
        mutedMembers: (c.mutedMembers || []).filter(id => id !== currentUser.id),
        messages: [...c.messages, sysMsg],
      };
    }));
    if (activeClub?.id === clubId) setActiveClub(null);
  };

  const handleSendMessage = () => {
    if (!isAuthenticated || !activeClub || !messageInput.trim()) return;
    if (isMuted(activeClub)) return;
    const msg = {
      id: 'm' + Date.now(),
      userId: currentUser.id,
      content: messageInput.trim(),
      createdAt: new Date().toISOString(),
    };
    saveClubs(clubs.map(c => c.id === activeClub.id ? { ...c, messages: [...c.messages, msg] } : c));
    setActiveClub(prev => prev ? { ...prev, messages: [...prev.messages, msg] } : prev);
    setMessageInput('');
  };

  const handleAppointAdmin = (clubId, userId) => {
    const userName = getUserById(userId).name;
    saveClubs(clubs.map(c => {
      if (c.id !== clubId || c.president !== currentUser?.id) return c;
      const isAdding = !c.admins.includes(userId);
      const sysMsg = {
        id: 'm' + Date.now(),
        type: 'system',
        content: isAdding ? `${userName}被设为管理员` : `${userName}被取消管理员`,
        createdAt: new Date().toISOString(),
      };
      return {
        ...c,
        admins: isAdding ? [...c.admins, userId] : c.admins.filter(id => id !== userId),
        messages: [...c.messages, sysMsg],
      };
    }));
  };

  const handleTransferPresident = (clubId, userId) => {
    if (!isAuthenticated) return;
    const newPresName = getUserById(userId).name;
    const sysMsg = {
      id: 'm' + Date.now(),
      type: 'system',
      content: `社长已转让给${newPresName}`,
      createdAt: new Date().toISOString(),
    };
    saveClubs(clubs.map(c => {
      if (c.id !== clubId || c.president !== currentUser.id) return c;
      return {
        ...c,
        president: userId,
        admins: [...c.admins.filter(id => id !== currentUser.id), currentUser.id],
        messages: [...c.messages, sysMsg],
      };
    }));
  };

  const handleToggleMute = (clubId, userId) => {
    const userName = getUserById(userId).name;
    saveClubs(clubs.map(c => {
      if (c.id !== clubId || !isAdmin(c)) return c;
      const muted = c.mutedMembers || [];
      const isMuting = !muted.includes(userId);
      const sysMsg = {
        id: 'm' + Date.now(),
        type: 'system',
        content: isMuting ? `${userName}已被禁言` : `${userName}已解除禁言`,
        createdAt: new Date().toISOString(),
      };
      return {
        ...c,
        mutedMembers: isMuting ? [...muted, userId] : muted.filter(id => id !== userId),
        messages: [...c.messages, sysMsg],
      };
    }));
  };

  const handlePostAnnouncement = () => {
    if (!isAuthenticated || !activeClub || !announceInput.trim()) return;
    if (!isAdmin(activeClub)) return;
    const announcement = {
      id: 'ann' + Date.now(),
      content: announceInput.trim(),
      createdAt: new Date().toISOString(),
      userId: currentUser.id,
    };
    const sysMsg = {
      id: 'm' + Date.now(),
      type: 'system',
      content: `📢 新公告：${announceInput.trim()}`,
      createdAt: new Date().toISOString(),
    };
    saveClubs(clubs.map(c => {
      if (c.id !== activeClub.id) return c;
      return {
        ...c,
        announcements: [...(c.announcements || []), announcement],
        messages: [...c.messages, sysMsg],
      };
    }));
    setActiveClub(prev => prev ? {
      ...prev,
      announcements: [...(prev.announcements || []), announcement],
      messages: [...prev.messages, sysMsg],
    } : prev);
    setAnnounceInput('');
    setShowAnnounceForm(false);
  };

  const filteredClubs = clubs.filter(c => {
    if (filterType !== 'all' && c.type !== filterType) return false;
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const myClubs = filteredClubs.filter(c => isMember(c));
  const otherClubs = filteredClubs.filter(c => !isMember(c));

  // Messages tab: only show clubs the user has joined, sorted by last message time
  const messageClubs = myClubs.sort((a, b) => {
    const aTime = a.messages.length > 0 ? new Date(a.messages[a.messages.length - 1].createdAt).getTime() : 0;
    const bTime = b.messages.length > 0 ? new Date(b.messages[b.messages.length - 1].createdAt).getTime() : 0;
    return bTime - aTime;
  });

  const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 172800000) return '昨天';
    return Math.floor(diff / 86400000) + '天前';
  };

  const renderSidebarContent = () => {
    switch (activeTab) {
      case 'messages':
        return (
          <div className="club-sidebar-content">
            <div className="club-sidebar-search">
              <Search size={14} />
              <input placeholder="搜索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="club-conversation-list">
              {messageClubs.length === 0 ? (
                <div className="club-sidebar-empty">
                  <MessageSquare size={24} />
                  <span>暂无会话</span>
                </div>
              ) : (
                messageClubs.map(club => {
                  const last = getLastMessage(club);
                  const unread = getUnreadCount(club);
                  return (
                    <div
                      key={club.id}
                      className={`club-conversation-item ${activeClub?.id === club.id ? 'active' : ''}`}
                      onClick={() => handleSelectClub(club)}
                    >
                      <span className="club-conv-icon">{club.icon}</span>
                      <div className="club-conv-info">
                        <div className="club-conv-top">
                          <span className="club-conv-name">{club.name}</span>
                          <span className="club-conv-time">{last.time}</span>
                        </div>
                        <div className="club-conv-bottom">
                          <span className="club-conv-preview">{last.text}</span>
                          {unread > 0 && <span className="club-conv-unread">{unread > 99 ? '99+' : unread}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );

      case 'clubs':
        return (
          <div className="club-sidebar-content">
            <div className="club-sidebar-search">
              <Search size={14} />
              <input placeholder="搜索社团..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="club-filter-pills">
              <button className={`club-filter-pill ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>全部</button>
              {CLUB_TYPES.map(t => (
                <button key={t.key} className={`club-filter-pill ${filterType === t.key ? 'active' : ''}`} onClick={() => setFilterType(t.key)}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <div className="club-conversation-list">
              {myClubs.length > 0 && (
                <div className="club-section">
                  <div className="club-section-header">我的社团</div>
                  {myClubs.map(club => (
                    <div
                      key={club.id}
                      className={`club-conversation-item ${activeClub?.id === club.id ? 'active' : ''}`}
                      onClick={() => handleSelectClub(club)}
                    >
                      <span className="club-conv-icon">{club.icon}</span>
                      <div className="club-conv-info">
                        <div className="club-conv-top">
                          <span className="club-conv-name">
                            {club.name}
                            {club.president === currentUser?.id && <Crown size={12} className="club-crown-inline" />}
                          </span>
                          <span className="club-conv-meta">{club.members.length}/{club.maxMembers}</span>
                        </div>
                        <div className="club-conv-bottom">
                          <span className="club-conv-preview">{club.description || CLUB_TYPES.find(t => t.key === club.type)?.desc}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {otherClubs.length > 0 && (
                <div className="club-section">
                  <div className="club-section-header">发现社团</div>
                  {otherClubs.map(club => (
                    <div
                      key={club.id}
                      className={`club-conversation-item ${activeClub?.id === club.id ? 'active' : ''}`}
                      onClick={() => setActiveClub(club)}
                    >
                      <span className="club-conv-icon">{club.icon}</span>
                      <div className="club-conv-info">
                        <div className="club-conv-top">
                          <span className="club-conv-name">{club.name}</span>
                          <span className="club-conv-meta">{club.members.length}/{club.maxMembers}</span>
                        </div>
                        <div className="club-conv-bottom">
                          <span className="club-conv-preview">{club.description || CLUB_TYPES.find(t => t.key === club.type)?.desc}</span>
                          <button className="club-join-mini" onClick={e => { e.stopPropagation(); handleJoin(club.id); }}>
                            <UserPlus size={10} /> 加入
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="club-create-float-btn" onClick={() => { if (!isAuthenticated) { openAuth(); return; } setShowCreate(true); }}>
              <Plus size={18} />
            </button>
          </div>
        );

      case 'discover':
        return (
          <div className="club-sidebar-content">
            <div className="club-sidebar-search">
              <Search size={14} />
              <input placeholder="搜索社团..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="club-discover-list">
              {CLUB_TYPES.map(type => {
                const typeClubs = clubs.filter(c => c.type === type.key && (!searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())));
                if (typeClubs.length === 0) return null;
                return (
                  <div key={type.key} className="club-discover-section">
                    <div className="club-discover-type">{type.icon} {type.label}</div>
                    {typeClubs.map(club => (
                      <div key={club.id} className="club-discover-item" onClick={() => setActiveClub(club)}>
                        <span className="club-conv-icon">{club.icon}</span>
                        <div className="club-conv-info">
                          <div className="club-conv-top">
                            <span className="club-conv-name">{club.name}</span>
                            <span className="club-conv-meta">{club.members.length}/{club.maxMembers}</span>
                          </div>
                          <div className="club-conv-bottom">
                            <span className="club-conv-preview">{club.description}</span>
                            {isMember(club) ? (
                              <span className="club-joined-tag">已加入</span>
                            ) : (
                              <button className="club-join-mini" onClick={e => { e.stopPropagation(); handleJoin(club.id); }}>
                                <UserPlus size={10} /> 加入
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="club-sidebar-content">
            <div className="club-settings-section">
              <h3>我创建的社团</h3>
              {clubs.filter(c => c.president === currentUser?.id).length === 0 ? (
                <p className="club-settings-empty">暂无创建的社团</p>
              ) : (
                clubs.filter(c => c.president === currentUser?.id).map(club => (
                  <div key={club.id} className="club-settings-item" onClick={() => { setActiveClub(club); setShowMembers(true); }}>
                    <span className="club-conv-icon">{club.icon}</span>
                    <div className="club-conv-info">
                      <span className="club-conv-name">{club.name}</span>
                      <span className="club-conv-meta">{club.members.length}/{club.maxMembers} 成员</span>
                    </div>
                    <Crown size={14} className="club-crown-inline" />
                  </div>
                ))
              )}
            </div>
            <div className="club-settings-section">
              <h3>我管理的社团</h3>
              {clubs.filter(c => c.admins.includes(currentUser?.id) && c.president !== currentUser?.id).length === 0 ? (
                <p className="club-settings-empty">暂无管理的社团</p>
              ) : (
                clubs.filter(c => c.admins.includes(currentUser?.id) && c.president !== currentUser?.id).map(club => (
                  <div key={club.id} className="club-settings-item" onClick={() => { setActiveClub(club); setShowMembers(true); }}>
                    <span className="club-conv-icon">{club.icon}</span>
                    <div className="club-conv-info">
                      <span className="club-conv-name">{club.name}</span>
                      <span className="club-conv-meta">管理员</span>
                    </div>
                    <Shield size={14} style={{ color: '#0c5460' }} />
                  </div>
                ))
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderChatArea = () => {
    if (!activeClub) {
      return (
        <div className="club-chat-empty">
          <MessageSquare size={40} strokeWidth={1.2} />
          <p>选择一个社团开始交流</p>
        </div>
      );
    }

    const latestAnnouncement = activeClub.announcements && activeClub.announcements.length > 0
      ? activeClub.announcements[activeClub.announcements.length - 1]
      : null;

    return (
      <>
        {/* Chat header */}
        <div className="club-chat-header">
          <button className="club-chat-back" onClick={() => setMobileShowChat(false)}>
            <ChevronRight size={18} />
          </button>
          <span className="club-chat-header-icon">{activeClub.icon}</span>
          <div className="club-chat-header-info">
            <h3>{activeClub.name}</h3>
            <span className="club-chat-header-meta">{activeClub.members.length}/{activeClub.maxMembers}</span>
          </div>
          <div className="club-chat-header-actions">
            {latestAnnouncement && (
              <button className="club-header-action" onClick={() => setShowAnnouncement(!showAnnouncement)} title="公告">
                <Megaphone size={16} />
              </button>
            )}
            {isAdmin(activeClub) && (
              <button className="club-header-action" onClick={() => setShowAnnounceForm(!showAnnounceForm)} title="发布公告">
                <Volume2 size={16} />
              </button>
            )}
            <button className="club-header-action" onClick={() => setShowMembers(!showMembers)} title="成员">
              <Users size={16} />
            </button>
            {isMember(activeClub) && !isPresident(activeClub) && (
              <button className="club-header-action leave" onClick={() => handleLeave(activeClub.id)} title="退出社团">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Announcement banner */}
        {showAnnouncement && latestAnnouncement && (
          <div className="club-announcement-banner">
            <Megaphone size={14} />
            <span>{latestAnnouncement.content}</span>
            <span className="club-announcement-time">{formatTime(latestAnnouncement.createdAt)}</span>
            <button className="club-announcement-close" onClick={() => setShowAnnouncement(false)}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* Announce form */}
        {showAnnounceForm && (
          <div className="club-announce-form">
            <input
              placeholder="输入公告内容..."
              value={announceInput}
              onChange={e => setAnnounceInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePostAnnouncement()}
            />
            <button onClick={handlePostAnnouncement} disabled={!announceInput.trim()}>发布</button>
            <button className="club-announce-cancel" onClick={() => { setShowAnnounceForm(false); setAnnounceInput(''); }}>取消</button>
          </div>
        )}

        {/* Messages */}
        <div className="club-chat-messages">
          {activeClub.messages.map(msg => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="club-msg-system">
                  <span>{msg.content}</span>
                </div>
              );
            }
            const sender = getUserById(msg.userId);
            const isSelf = currentUser && msg.userId === currentUser.id;
            return (
              <div key={msg.id} className={`club-msg ${isSelf ? 'self' : ''}`}>
                <img src={sender.avatar || FALLBACK_AVATAR} alt="" className="club-msg-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_AVATAR; }} />
                <div className="club-msg-body">
                  <span className="club-msg-name">{sender.name} <span className="club-msg-time">{formatTime(msg.createdAt)}</span></span>
                  <div className="club-msg-bubble">{msg.content}</div>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        {isMember(activeClub) ? (
          <div className="club-chat-input-area">
            {isMuted(activeClub) ? (
              <div className="club-muted-notice">
                <MicOff size={14} /> 你已被禁言
              </div>
            ) : (
              <>
                <input
                  placeholder="输入消息..."
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                />
                <button className="club-send-btn" onClick={handleSendMessage} disabled={!messageInput.trim()}>
                  <Send size={16} />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="club-join-prompt">
            <p>加入社团后即可参与讨论</p>
            <button className="club-join-btn-large" onClick={() => handleJoin(activeClub.id)}>
              <UserPlus size={16} /> 加入社团
            </button>
          </div>
        )}
      </>
    );
  };

  // Members panel (overlay/modal)
  const renderMembersPanel = () => {
    if (!showMembers || !activeClub) return null;
    return (
      <div className="club-members-overlay" onClick={() => setShowMembers(false)}>
        <div className="club-members-panel" onClick={e => e.stopPropagation()}>
          <div className="club-members-panel-header">
            <h3>成员 ({activeClub.members.length})</h3>
            <button onClick={() => setShowMembers(false)}><X size={16} /></button>
          </div>
          <div className="club-members-panel-list">
            {activeClub.members.map(mid => {
              const m = getUserById(mid);
              const role = mid === activeClub.president ? '社长' : activeClub.admins.includes(mid) ? '管理员' : '成员';
              const roleClass = mid === activeClub.president ? 'president' : activeClub.admins.includes(mid) ? 'admin' : 'member';
              const isMutedMember = (activeClub.mutedMembers || []).includes(mid);
              return (
                <div key={mid} className="club-member-row">
                  <img src={m.avatar || FALLBACK_AVATAR} alt="" className="club-member-avatar-lg" loading="lazy" onError={e => { e.target.src = FALLBACK_AVATAR; }} />
                  <div className="club-member-info">
                    <span className="club-member-name-lg">{m.name}</span>
                    <span className={`club-member-role ${roleClass}`}>
                      {role === '社长' ? <Crown size={10} /> : role === '管理员' ? <Shield size={10} /> : null} {role}
                    </span>
                    {isMutedMember && <span className="club-member-muted"><MicOff size={10} /> 禁言中</span>}
                  </div>
                  {isAdmin(activeClub) && mid !== currentUser.id && mid !== activeClub.president && (
                    <div className="club-member-ops">
                      {isPresident(activeClub) && (
                        <button className="club-member-op" onClick={() => handleAppointAdmin(activeClub.id, mid)} title={activeClub.admins.includes(mid) ? '取消管理员' : '设为管理员'}>
                          <Shield size={14} />
                        </button>
                      )}
                      <button className="club-member-op" onClick={() => handleToggleMute(activeClub.id, mid)} title={isMutedMember ? '解除禁言' : '禁言'}>
                        {isMutedMember ? <Volume2 size={14} /> : <MicOff size={14} />}
                      </button>
                      {isPresident(activeClub) && (
                        <button className="club-member-op" onClick={() => handleTransferPresident(activeClub.id, mid)} title="转让社长">
                          <Crown size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Create club modal
  const renderCreateModal = () => {
    if (!showCreate) return null;
    return (
      <div className="club-modal-overlay" onClick={() => setShowCreate(false)}>
        <div className="club-modal" onClick={e => e.stopPropagation()}>
          <div className="club-modal-header">
            <h3>创建新社团</h3>
            <button onClick={() => setShowCreate(false)}><X size={16} /></button>
          </div>
          <div className="club-modal-body">
            <input placeholder="社团名称" value={createForm.name} onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))} />
            <div className="club-type-select">
              {CLUB_TYPES.map(t => (
                <button key={t.key} className={`club-type-btn ${createForm.type === t.key ? 'active' : ''}`} onClick={() => setCreateForm(prev => ({ ...prev, type: t.key }))}>
                  <span className="club-type-icon">{t.icon}</span>
                  <span className="club-type-label">{t.label}</span>
                </button>
              ))}
            </div>
            <textarea placeholder="社团简介..." value={createForm.description} onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))} rows={3} />
          </div>
          <div className="club-modal-footer">
            <button className="club-modal-cancel" onClick={() => setShowCreate(false)}>取消</button>
            <button className="club-modal-submit" onClick={handleCreate} disabled={!createForm.name.trim()}>创建</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="club-page">
      {/* Left nav bar */}
      <nav className="club-nav">
        <div className="club-nav-logo">☕</div>
        <div className="club-nav-top">
          {NAV_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            const badge = tab.key === 'messages'
              ? myClubs.reduce((sum, c) => sum + getUnreadCount(c), 0)
              : 0;
            return (
              <button
                key={tab.key}
                className={`club-nav-btn ${isActive ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab.key); setSearchQuery(''); setFilterType('all'); }}
              >
                <Icon size={18} />
                <span className="club-nav-label">{tab.label}</span>
                {badge > 0 && <span className="club-nav-badge">{badge > 99 ? '99+' : badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="club-sidebar">
        {renderSidebarContent()}
      </aside>

      {/* Main chat area */}
      <main className={`club-main ${mobileShowChat ? 'mobile-show' : ''}`}>
        {renderChatArea()}
      </main>

      {/* Modals */}
      {renderMembersPanel()}
      {renderCreateModal()}
    </div>
  );
}
