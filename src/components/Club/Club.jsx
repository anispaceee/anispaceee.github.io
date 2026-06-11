import { useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService, UserService } from '../../services/api';
import { Users, Plus, Crown, Shield, MessageSquare, Settings, X, Send, Search, UserPlus, LogOut, ChevronDown, ChevronRight, Hash } from 'lucide-react';
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
      messages: [
        { id: 'm1', userId: 'user1', content: '欢迎来到星空画社！大家多多分享作品哦~', createdAt: new Date(Date.now() - 86400000).toISOString() },
        { id: 'm2', userId: 'user2', content: '刚画了一张蕾姆，晚点分享给大家看！', createdAt: new Date(Date.now() - 43200000).toISOString() },
      ],
      maxMembers: 50,
      createdAt: new Date(Date.now() - 604800000).toISOString(),
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
      messages: [
        { id: 'm3', userId: 'user2', content: '这个世界线变动率...1.048596%！', createdAt: new Date(Date.now() - 3600000).toISOString() },
      ],
      maxMembers: 30,
      createdAt: new Date(Date.now() - 259200000).toISOString(),
    },
  ];
}

export default function Club() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [clubs, setClubs] = useState(getInitialClubs);
  const [activeClub, setActiveClub] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', type: 'creation', description: '', maxMembers: 50 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

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
      messages: [{ id: 'm' + Date.now(), userId: currentUser.id, content: `欢迎来到${createForm.name.trim()}！`, createdAt: new Date().toISOString() }],
      maxMembers: createForm.maxMembers,
      createdAt: new Date().toISOString(),
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
      return { ...c, members: [...c.members, currentUser.id] };
    }));
  };

  const handleLeave = (clubId) => {
    if (!isAuthenticated) return;
    saveClubs(clubs.map(c => {
      if (c.id !== clubId) return c;
      if (c.president === currentUser.id) return c;
      return { ...c, members: c.members.filter(id => id !== currentUser.id), admins: c.admins.filter(id => id !== currentUser.id) };
    }));
    if (activeClub?.id === clubId) setActiveClub(null);
  };

  const handleSendMessage = () => {
    if (!isAuthenticated || !activeClub || !messageInput.trim()) return;
    const msg = { id: 'm' + Date.now(), userId: currentUser.id, content: messageInput.trim(), createdAt: new Date().toISOString() };
    saveClubs(clubs.map(c => c.id === activeClub.id ? { ...c, messages: [...c.messages, msg] } : c));
    setActiveClub(prev => prev ? { ...prev, messages: [...prev.messages, msg] } : prev);
    setMessageInput('');
  };

  const handleAppointAdmin = (clubId, userId) => {
    saveClubs(clubs.map(c => {
      if (c.id !== clubId || c.president !== currentUser?.id) return c;
      if (c.admins.includes(userId)) return { ...c, admins: c.admins.filter(id => id !== userId) };
      return { ...c, admins: [...c.admins, userId] };
    }));
  };

  const handleTransferPresident = (clubId, userId) => {
    if (!isAuthenticated) return;
    saveClubs(clubs.map(c => {
      if (c.id !== clubId || c.president !== currentUser.id) return c;
      return { ...c, president: userId, admins: [...c.admins.filter(id => id !== currentUser.id), currentUser.id] };
    }));
  };

  const filteredClubs = clubs.filter(c => {
    if (filterType !== 'all' && c.type !== filterType) return false;
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const myClubs = filteredClubs.filter(c => isMember(c));
  const otherClubs = filteredClubs.filter(c => !isMember(c));

  const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    return Math.floor(diff / 86400000) + '天前';
  };

  return (
    <div className="club-page">
      <div className="club-header">
        <div className="club-title">
          <Users size={22} />
          <h1>Tea Time！</h1>
        </div>
        <button className="club-create-btn" onClick={() => { if (!isAuthenticated) { openAuth(); return; } setShowCreate(!showCreate); }}>
          <Plus size={16} /> 创建社团
        </button>
      </div>

      {showCreate && (
        <div className="club-create-form">
          <h3>创建新社团</h3>
          <div className="club-create-fields">
            <input placeholder="社团名称" value={createForm.name} onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))} />
            <div className="club-type-select">
              {CLUB_TYPES.map(t => (
                <button key={t.key} className={`club-type-btn ${createForm.type === t.key ? 'active' : ''}`} onClick={() => setCreateForm(prev => ({ ...prev, type: t.key }))}>
                  <span className="club-type-icon">{t.icon}</span>
                  <span className="club-type-label">{t.label}</span>
                </button>
              ))}
            </div>
            <textarea placeholder="社团简介..." value={createForm.description} onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))} rows={2} />
            <div className="club-create-actions">
              <button className="club-create-cancel" onClick={() => setShowCreate(false)}>取消</button>
              <button className="club-create-submit" onClick={handleCreate} disabled={!createForm.name.trim()}>创建</button>
            </div>
          </div>
        </div>
      )}

      <div className="club-search">
        <Search size={16} />
        <input placeholder="搜索社团..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      <div className="club-filters">
        <button className={`club-filter-btn ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>全部</button>
        {CLUB_TYPES.map(t => (
          <button key={t.key} className={`club-filter-btn ${filterType === t.key ? 'active' : ''}`} onClick={() => setFilterType(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="club-body">
        <div className="club-list">
          {myClubs.length > 0 && (
            <div className="club-section">
              <h3 className="club-section-title">我的社团</h3>
              {myClubs.map(club => (
                <div key={club.id} className={`club-item ${activeClub?.id === club.id ? 'active' : ''}`} onClick={() => setActiveClub(club)}>
                  <span className="club-item-icon">{club.icon}</span>
                  <div className="club-item-info">
                    <span className="club-item-name">{club.name}</span>
                    <span className="club-item-meta">{club.members.length}/{club.maxMembers} · {CLUB_TYPES.find(t => t.key === club.type)?.label}</span>
                  </div>
                  {club.president === currentUser?.id && <Crown size={14} className="club-crown" />}
                </div>
              ))}
            </div>
          )}
          {otherClubs.length > 0 && (
            <div className="club-section">
              <h3 className="club-section-title">发现社团</h3>
              {otherClubs.map(club => (
                <div key={club.id} className="club-item" onClick={() => setActiveClub(club)}>
                  <span className="club-item-icon">{club.icon}</span>
                  <div className="club-item-info">
                    <span className="club-item-name">{club.name}</span>
                    <span className="club-item-meta">{club.members.length}/{club.maxMembers} · {CLUB_TYPES.find(t => t.key === club.type)?.label}</span>
                  </div>
                  <button className="club-join-btn" onClick={e => { e.stopPropagation(); handleJoin(club.id); }}><UserPlus size={12} /> 加入</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="club-detail">
          {activeClub ? (
            <>
              <div className="club-detail-header">
                <span className="club-detail-icon">{activeClub.icon}</span>
                <div className="club-detail-info">
                  <h2>{activeClub.name}</h2>
                  <span className="club-detail-meta">{activeClub.members.length}/{activeClub.maxMembers} 成员 · {CLUB_TYPES.find(t => t.key === activeClub.type)?.label}</span>
                </div>
                {isMember(activeClub) && (
                  <div className="club-detail-actions">
                    {!isPresident(activeClub) && (
                      <button className="club-leave-btn" onClick={() => handleLeave(activeClub.id)}><LogOut size={12} /> 退出</button>
                    )}
                  </div>
                )}
              </div>
              <p className="club-detail-desc">{activeClub.description}</p>

              <div className="club-members">
                <h4>成员 ({activeClub.members.length})</h4>
                <div className="club-members-list">
                  {activeClub.members.map(mid => {
                    const m = getUserById(mid);
                    const role = mid === activeClub.president ? '社长' : activeClub.admins.includes(mid) ? '管理员' : '成员';
                    const roleClass = mid === activeClub.president ? 'president' : activeClub.admins.includes(mid) ? 'admin' : 'member';
                    return (
                      <div key={mid} className="club-member">
                        <img src={m.avatar || FALLBACK_AVATAR} alt="" className="club-member-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_AVATAR; }} />
                        <span className="club-member-name">{m.name}</span>
                        <span className={`club-member-role ${roleClass}`}>{role === '社长' ? <Crown size={10} /> : role === '管理员' ? <Shield size={10} /> : null} {role}</span>
                        {isPresident(activeClub) && mid !== currentUser.id && (
                          <div className="club-member-actions">
                            <button className="club-member-action" onClick={() => handleAppointAdmin(activeClub.id, mid)} title={activeClub.admins.includes(mid) ? '取消管理员' : '设为管理员'}>
                              <Shield size={12} />
                            </button>
                            <button className="club-member-action" onClick={() => handleTransferPresident(activeClub.id, mid)} title="转让社长">
                              <Crown size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {isMember(activeClub) ? (
                <div className="club-chat">
                  <h4><Hash size={14} /> 社团频道</h4>
                  <div className="club-chat-messages">
                    {activeClub.messages.map(msg => {
                      const sender = getUserById(msg.userId);
                      const isSelf = currentUser && msg.userId === currentUser.id;
                      return (
                        <div key={msg.id} className={`club-chat-msg ${isSelf ? 'self' : ''}`}>
                          <img src={sender.avatar || FALLBACK_AVATAR} alt="" className="club-chat-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_AVATAR; }} />
                          <div className="club-chat-body">
                            <span className="club-chat-name">{sender.name} <span className="club-chat-time">{formatTime(msg.createdAt)}</span></span>
                            <div className="club-chat-text">{msg.content}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="club-chat-input">
                    <input placeholder="说点什么..." value={messageInput} onChange={e => setMessageInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                    <button onClick={handleSendMessage}><Send size={14} /></button>
                  </div>
                </div>
              ) : (
                <div className="club-join-prompt">
                  <p>加入社团后即可参与讨论</p>
                  <button className="club-join-btn large" onClick={() => handleJoin(activeClub.id)}><UserPlus size={16} /> 加入社团</button>
                </div>
              )}
            </>
          ) : (
            <div className="club-empty">
              <Users size={32} />
              <p>选择一个社团开始交流</p>
              <span>或创建属于你自己的社团</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
