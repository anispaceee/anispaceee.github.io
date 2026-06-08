import { useParams, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { UserService, CollectionMarkService, RatingService, FavoriteService, StorageService, BangumiAuthService, GitHubAuthService, MailService } from '../../services/api';
import { Settings, Edit3, Users, FileText, Heart, MessageCircle, Calendar, MapPin, BookOpen, Star, Eye, Camera, Mail, Shield, Image as ImageIcon, Smile, LinkIcon, Lock, Globe, UserCheck, ChevronRight, Download, Activity } from 'lucide-react';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import { useState, useRef, useMemo } from 'react';
import ProfileStats from './ProfileStats';
import './Profile.css';

const GitHubIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const BG_TEMPLATES = [
  { id: 'default', color: 'var(--primary)' },
  { id: 'ocean', color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'sunset', color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 'forest', color: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { id: 'night', color: 'linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)' },
  { id: 'sakura', color: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)' },
];

const PRIVACY_OPTIONS = [
  { key: 'public', label: '公开', icon: Globe, desc: '所有人可见' },
  { key: 'friends', label: '仅好友', icon: UserCheck, desc: '仅关注的人可见' },
  { key: 'private', label: '私密', icon: Lock, desc: '仅自己可见' },
];

function ContributionGrid({ userId }) {
  const [viewMode, setViewMode] = useState('week');
  const loginData = useMemo(() => {
    const data = StorageService.get('acg_login_history') || {};
    const userLogins = data[userId] || {};
    const today = new Date();
    const days = viewMode === 'week' ? 7 : viewMode === 'month' ? 30 : 365;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const hours = userLogins[key] || 0;
      result.push({ date: key, hours, day: d.getDay() });
    }
    return result;
  }, [userId, viewMode]);

  const getColor = (hours) => {
    if (hours === 0) return 'var(--bg-input)';
    if (hours < 1) return 'var(--primary-bg)';
    if (hours < 2) return 'rgba(232, 134, 162, 0.4)';
    if (hours < 4) return 'rgba(232, 134, 162, 0.65)';
    return 'var(--primary)';
  };

  const totalHours = loginData.reduce((s, d) => s + d.hours, 0);
  const activeDays = loginData.filter(d => d.hours > 0).length;

  return (
    <div className="contribution-grid">
      <div className="contrib-header">
        <span className="contrib-title">登录活跃度</span>
        <div className="contrib-view-tabs">
          {['week', 'month', 'year'].map(m => (
            <button key={m} className={`contrib-view-btn ${viewMode === m ? 'active' : ''}`} onClick={() => setViewMode(m)}>
              {m === 'week' ? '周' : m === 'month' ? '月' : '年'}
            </button>
          ))}
        </div>
      </div>
      <div className="contrib-stats">
        <span>活跃 {activeDays} 天</span>
        <span>累计 {totalHours.toFixed(1)} 小时</span>
      </div>
      <div className={`contrib-cells ${viewMode}`}>
        {loginData.map((d, i) => (
          <div key={i} className="contrib-cell" style={{ background: getColor(d.hours) }} title={`${d.date}: ${d.hours}h`} />
        ))}
      </div>
      <div className="contrib-legend">
        <span>少</span>
        {[0, 1, 2, 3, 4].map(level => (
          <div key={level} className="contrib-cell" style={{ background: getColor(level * 1.2) }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}

export default function Profile() {
  const { id } = useParams();
  const { currentUser, isAuthenticated, openAuth, updateProfile } = useApp();
  const [activeTab, setActiveTab] = useState('marks');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bgPreview, setBgPreview] = useState(null);
  const [profileBg, setProfileBg] = useState(() => StorageService.get('acg_profile_bg') || 'default');
  const [privacySettings, setPrivacySettings] = useState(() => StorageService.get('acg_privacy') || { profile: 'public', marks: 'public', info: 'public' });
  const avatarInputRef = useRef(null);
  const bgInputRef = useRef(null);

  const profileUser = id ? UserService.getById(parseInt(id)) : currentUser;
  const isOwnProfile = !id || (currentUser && currentUser.id === parseInt(id));

  if (!profileUser) {
    return (
      <div className="profile-page">
        <div className="profile-not-found">
          <span>👤</span>
          <h2>用户不存在</h2>
          <Link to="/" className="back-link">返回首页</Link>
        </div>
      </div>
    );
  }

  const isFollowing = isAuthenticated && currentUser ? UserService.isFollowing(currentUser.id, profileUser.id) : false;
  const markCounts = CollectionMarkService.getMarkCounts(profileUser.id);
  const userMarks = CollectionMarkService.getUserMarks(profileUser.id);
  const userFavorites = isAuthenticated ? FavoriteService.getUserFavorites(profileUser.id, 'info') : [];
  const unreadMail = currentUser ? MailService.getUnreadCount(currentUser.id) : 0;

  const handleEdit = () => {
    setEditForm({
      name: profileUser.name,
      sign: profileUser.sign || '',
      bio: profileUser.bio || '',
      hobbies: profileUser.hobbies || '',
      contact: profileUser.contact || '',
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateProfile(editForm);
    setIsEditing(false);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarPreview(ev.target.result);
      updateProfile({ avatar: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  const handleBgChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBgPreview(ev.target.result);
      setProfileBg('custom');
      StorageService.set('acg_profile_bg', 'custom');
      StorageService.set('acg_profile_bg_img', ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const selectBgTemplate = (template) => {
    setProfileBg(template.id);
    setBgPreview(null);
    StorageService.set('acg_profile_bg', template.id);
    StorageService.remove('acg_profile_bg_img');
  };

  const handlePrivacyChange = (key, value) => {
    const updated = { ...privacySettings, [key]: value };
    setPrivacySettings(updated);
    StorageService.set('acg_privacy', updated);
  };

  const bannerBgStyle = bgPreview
    ? { backgroundImage: `url(${bgPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : profileBg === 'custom'
      ? { backgroundImage: `url(${StorageService.get('acg_profile_bg_img')})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : profileBg === 'default'
        ? {}
        : { background: BG_TEMPLATES.find(t => t.id === profileBg)?.color || 'var(--primary)' };

  const tabs = [
    { key: 'marks', label: '标记', icon: <BookOpen size={16} /> },
    { key: 'ratings', label: '评分', icon: <Star size={16} /> },
    { key: 'favorites', label: '收藏', icon: <Heart size={16} /> },
    { key: 'following', label: '关注', icon: <Users size={16} /> },
    { key: 'followers', label: '粉丝', icon: <Users size={16} /> },
  ];

  return (
    <div className="profile-page">
      <div className="profile-banner">
        <div className="banner-bg" style={bannerBgStyle}></div>
        {isOwnProfile && (
          <button className="banner-edit-btn" onClick={() => bgInputRef.current?.click()}>
            <ImageIcon size={14} /> 更换封面
          </button>
        )}
        <input ref={bgInputRef} type="file" accept="image/jpeg,image/png" onChange={handleBgChange} hidden />
        <div className="banner-content">
          <div className="profile-avatar-wrap">
            <img src={avatarPreview || profileUser.avatar} alt="" className="profile-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />
            <span className="profile-level">Lv.{profileUser.level}</span>
            {isOwnProfile && (
              <button className="avatar-upload-btn" onClick={() => avatarInputRef.current?.click()}>
                <Camera size={14} />
              </button>
            )}
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png" onChange={handleAvatarChange} hidden />
          </div>
          <div className="profile-info">
            <h1 className="profile-name">{profileUser.name}</h1>
            <p className="profile-username">@{profileUser.username}</p>
            {profileUser.sign && <p className="profile-sign">{profileUser.sign}</p>}
          </div>
          <div className="profile-actions">
            {isOwnProfile ? (
              <>
                <button className="profile-btn edit-btn" onClick={handleEdit}>
                  <Edit3 size={14} /> 编辑资料
                </button>
                <Link to="/mailbox" className="profile-btn mail-btn">
                  <Mail size={14} /> 邮箱 {unreadMail > 0 && <span className="mail-badge">{unreadMail}</span>}
                </Link>
                <button className="profile-btn settings-btn" onClick={() => setShowSettings(true)}>
                  <Settings size={14} /> 设置
                </button>
              </>
            ) : (
              <>
                <button className={`profile-btn follow-btn ${isFollowing ? 'following' : ''}`}
                  onClick={() => { if (!isAuthenticated) { openAuth(); return; } UserService.follow(currentUser.id, profileUser.id); }}>
                  {isFollowing ? '已关注' : '+ 关注'}
                </button>
                <Link to="/mailbox" className="profile-btn mail-btn">
                  <Mail size={14} /> 私信
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <ProfileStats />

      <div className="profile-body">
        <div className="profile-sidebar">
          <div className="profile-card">
            <h3>个人信息</h3>
            {profileUser.bio && <div className="profile-bio-md"><MarkdownRenderer content={profileUser.bio} /></div>}
            <div className="profile-meta-list">
              <div className="profile-meta-item"><Calendar size={14} /> <span>加入于 {profileUser.joinDate}</span></div>
              {profileUser.provider && (
                <div className="profile-meta-item">
                  {profileUser.provider === 'bangumi' ? <BookOpen size={14} /> : profileUser.provider === 'github' ? <GitHubIcon size={14} /> : <Shield size={14} />}
                  <span>通过 {profileUser.provider === 'bangumi' ? 'Bangumi' : profileUser.provider === 'github' ? 'GitHub' : '系统'} 登录</span>
                </div>
              )}
              {profileUser.gender && profileUser.gender !== 'other' && (
                <div className="profile-meta-item"><MapPin size={14} /> <span>{profileUser.gender === 'male' ? '男' : '女'}</span></div>
              )}
              {profileUser.hobbies && (
                <div className="profile-meta-item"><Heart size={14} /> <span>{profileUser.hobbies}</span></div>
              )}
              {profileUser.contact && (
                <div className="profile-meta-item"><LinkIcon size={14} /> <span>{profileUser.contact}</span></div>
              )}
            </div>
          </div>
          <div className="profile-card">
            <h3>条目标记</h3>
            <div className="profile-marks-summary">
              <div className="mark-summary-item wish"><span className="mark-summary-num">{markCounts.wish}</span><span className="mark-summary-label">想看</span></div>
              <div className="mark-summary-item collect"><span className="mark-summary-num">{markCounts.collect}</span><span className="mark-summary-label">看过</span></div>
              <div className="mark-summary-item doing"><span className="mark-summary-num">{markCounts.doing}</span><span className="mark-summary-label">在看</span></div>
              <div className="mark-summary-item on-hold"><span className="mark-summary-num">{markCounts.on_hold}</span><span className="mark-summary-label">搁置</span></div>
              <div className="mark-summary-item dropped"><span className="mark-summary-num">{markCounts.dropped}</span><span className="mark-summary-label">抛弃</span></div>
            </div>
          </div>
          <div className="profile-card">
            <h3>数据统计</h3>
            <div className="profile-stats-grid">
              <div className="stat-item"><span className="stat-num">{profileUser.postCount || 0}</span><span className="stat-label">帖子</span></div>
              <div className="stat-item"><span className="stat-num">{profileUser.followingCount || 0}</span><span className="stat-label">关注</span></div>
              <div className="stat-item"><span className="stat-num">{profileUser.followerCount || 0}</span><span className="stat-label">粉丝</span></div>
            </div>
          </div>
          {isOwnProfile && (
            <div className="profile-card contrib-card">
              <ContributionGrid userId={profileUser.id} />
            </div>
          )}
        </div>

        <div className="profile-main">
          <div className="profile-tabs">
            {tabs.map(tab => (
              <button key={tab.key} className={`profile-tab ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
          <div className="profile-tab-content">
            {activeTab === 'marks' && (
              userMarks.length > 0 ? (
                <div className="profile-marks-list">
                  {userMarks.map(mark => (
                    <Link key={mark.key} to={`/info/${mark.subjectType === 1 ? 'novel' : mark.subjectType === 4 ? 'game' : 'anime'}/${mark.subjectId}`} className="profile-mark-item">
                      <img src={mark.subjectImage || FALLBACK_IMG} alt="" className="profile-mark-img" onError={e => { e.target.src = FALLBACK_IMG; }} />
                      <div className="profile-mark-info">
                        <span className="profile-mark-name">{mark.subjectName || `条目 #${mark.subjectId}`}</span>
                        <span className={`profile-mark-badge mark-${mark.mark}`}>{CollectionMarkService.MARK_LABELS[mark.mark]}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="profile-empty"><BookOpen size={48} /><p>暂无标记</p></div>
              )
            )}
            {activeTab === 'ratings' && <div className="profile-empty"><Star size={48} /><p>暂无评分</p></div>}
            {activeTab === 'favorites' && (
              userFavorites.length > 0 ? (
                <div className="profile-marks-list">
                  {userFavorites.map(fav => (
                    <div key={fav.key} className="profile-mark-item">
                      <div className="profile-mark-info">
                        <span className="profile-mark-name">条目 #{fav.targetId}</span>
                        <span className="profile-mark-badge mark-collect">已收藏</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="profile-empty"><Heart size={48} /><p>暂无收藏</p></div>
            )}
            {activeTab === 'following' && <div className="profile-empty"><Users size={48} /><p>暂无关注</p></div>}
            {activeTab === 'followers' && <div className="profile-empty"><Users size={48} /><p>暂无粉丝</p></div>}
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="profile-edit-overlay" onClick={() => setIsEditing(false)}>
          <div className="profile-edit-modal animate-scale-in" onClick={e => e.stopPropagation()}>
            <h2>编辑资料</h2>
            <div className="edit-field">
              <label>昵称</label>
              <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="edit-field">
              <label>个性签名 <Smile size={12} /></label>
              <input value={editForm.sign} onChange={e => setEditForm({ ...editForm, sign: e.target.value })} placeholder="写点什么吧~" />
            </div>
            <div className="edit-field">
              <label>个人简介</label>
              <textarea rows={3} value={editForm.bio} onChange={e => setEditForm({ ...editForm, bio: e.target.value })} placeholder="介绍一下自己..." />
            </div>
            <div className="edit-field">
              <label>兴趣爱好</label>
              <input value={editForm.hobbies} onChange={e => setEditForm({ ...editForm, hobbies: e.target.value })} placeholder="动画、游戏、音乐..." />
            </div>
            <div className="edit-field">
              <label>联系方式</label>
              <input value={editForm.contact} onChange={e => setEditForm({ ...editForm, contact: e.target.value })} placeholder="网站、社交账号..." />
            </div>
            <div className="edit-actions">
              <button className="edit-cancel" onClick={() => setIsEditing(false)}>取消</button>
              <button className="edit-save" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && isOwnProfile && (
        <div className="profile-edit-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="settings-sidebar">
              <h2>设置</h2>
              <button className={`settings-nav ${settingsTab === 'profile' ? 'active' : ''}`} onClick={() => setSettingsTab('profile')}>
                <Edit3 size={14} /> 个人资料
              </button>
              <button className={`settings-nav ${settingsTab === 'background' ? 'active' : ''}`} onClick={() => setSettingsTab('background')}>
                <ImageIcon size={14} /> 背景设置
              </button>
              <button className={`settings-nav ${settingsTab === 'privacy' ? 'active' : ''}`} onClick={() => setSettingsTab('privacy')}>
                <Shield size={14} /> 隐私设置
              </button>
              <button className={`settings-nav ${settingsTab === 'bangumi' ? 'active' : ''}`} onClick={() => setSettingsTab('bangumi')}>
                <BookOpen size={14} /> 账号绑定
              </button>
              <button className={`settings-nav ${settingsTab === 'theme' ? 'active' : ''}`} onClick={() => setSettingsTab('theme')}>
                <Smile size={14} /> 主题外观
              </button>
            </div>
            <div className="settings-content">
              {settingsTab === 'profile' && (
                <div className="settings-section">
                  <h3>个人资料</h3>
                  <div className="settings-item">
                    <label>头像</label>
                    <div className="avatar-settings">
                      <img src={avatarPreview || profileUser.avatar} alt="" className="settings-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />
                      <button className="settings-btn" onClick={() => avatarInputRef.current?.click()}>更换头像</button>
                      <p className="settings-hint">支持 JPG、PNG 格式，5MB 以内</p>
                    </div>
                  </div>
                  <div className="settings-item">
                    <label>个性签名</label>
                    <input className="settings-input" value={profileUser.sign || ''} onChange={e => updateProfile({ sign: e.target.value })} placeholder="写点什么吧~" />
                  </div>
                </div>
              )}
              {settingsTab === 'theme' && (
                <div className="settings-section">
                  <h3>主题外观</h3>
                  <p className="settings-desc">选择你喜欢的主题风格</p>
                  <div className="theme-options">
                    {[
                      { key: '', label: '浅色模式', desc: '苹果银 · 清新明亮', color: '#F5F5F7' },
                      { key: 'dark', label: '深色模式', desc: '暗夜粉 · 护眼舒适', color: '#1c1c1e' },
                      { key: 'high-contrast', label: '高对比度', desc: '强对比 · 清晰易读', color: '#ffffff' },
                    ].map(t => (
                      <button key={t.key} className={`theme-option ${(document.documentElement.getAttribute('data-theme') || '') === t.key ? 'active' : ''}`}
                        onClick={() => {
                          if (t.key) document.documentElement.setAttribute('data-theme', t.key);
                          else document.documentElement.removeAttribute('data-theme');
                          StorageService.set('acg_theme', t.key);
                        }}>
                        <div className="theme-preview" style={{ background: t.color, border: '1px solid var(--border-primary)' }}>
                          <div className="theme-preview-bar" style={{ background: t.key === 'dark' ? '#f09bb3' : t.key === 'high-contrast' ? '#d63384' : '#e886a2' }} />
                        </div>
                        <span className="theme-label">{t.label}</span>
                        <span className="theme-desc">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {settingsTab === 'background' && (
                <div className="settings-section">
                  <h3>背景设置</h3>
                  <div className="bg-templates">
                    {BG_TEMPLATES.map(t => (
                      <button key={t.id} className={`bg-template ${profileBg === t.id ? 'active' : ''}`} onClick={() => selectBgTemplate(t)}>
                        <div className="bg-preview" style={{ background: t.color }} />
                        <span>{t.id === 'default' ? '默认' : t.id}</span>
                      </button>
                    ))}
                    <button className="bg-template" onClick={() => bgInputRef.current?.click()}>
                      <div className="bg-preview bg-upload-preview"><ImageIcon size={20} /></div>
                      <span>自定义</span>
                    </button>
                  </div>
                </div>
              )}
              {settingsTab === 'privacy' && (
                <div className="settings-section">
                  <h3>隐私设置</h3>
                  {[
                    { key: 'profile', label: '主页访问权限' },
                    { key: 'marks', label: '标记可见范围' },
                    { key: 'info', label: '个人信息可见范围' },
                  ].map(item => (
                    <div key={item.key} className="privacy-item">
                      <label>{item.label}</label>
                      <div className="privacy-options">
                        {PRIVACY_OPTIONS.map(opt => (
                          <button key={opt.key} className={`privacy-btn ${privacySettings[item.key] === opt.key ? 'active' : ''}`} onClick={() => handlePrivacyChange(item.key, opt.key)}>
                            <opt.icon size={12} /> {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {settingsTab === 'bangumi' && (
                <div className="settings-section">
                  <h3>账号绑定</h3>
                  <p className="settings-desc">绑定第三方账号可同步数据或快速登录</p>
                  <div className="account-bind-section">
                    <h4>Bangumi</h4>
                    {BangumiAuthService.isBound() ? (
                      <div className="bangumi-bound-info">
                        <div className="bangumi-bound-user">
                          <img src={BangumiAuthService.getBoundAccount()?.avatar || FALLBACK_IMG} alt="" className="settings-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />
                          <div>
                            <span className="bangumi-bound-name">{BangumiAuthService.getBoundAccount()?.nickname || BangumiAuthService.getBoundAccount()?.name || '已绑定'}</span>
                            <span className="settings-hint">Bangumi 账号已绑定</span>
                          </div>
                        </div>
                        <button className="bangumi-unbind-btn" onClick={() => { BangumiAuthService.unbind(); setSettingsTab('bangumi'); }}>解除绑定</button>
                      </div>
                    ) : (
                      <>
                        <button className="bangumi-bind-btn" onClick={() => BangumiAuthService.initiateLogin()}>
                          <BookOpen size={16} /> 绑定 Bangumi 账号
                        </button>
                        <p className="settings-hint">将跳转至 Bangumi 进行授权</p>
                      </>
                    )}
                  </div>
                  <div className="account-bind-section">
                    <h4>GitHub</h4>
                    {GitHubAuthService.isBound() ? (
                      <div className="bangumi-bound-info">
                        <div className="bangumi-bound-user">
                          <img src={GitHubAuthService.getBoundAccount()?.avatar || FALLBACK_IMG} alt="" className="settings-avatar" onError={e => { e.target.src = FALLBACK_IMG; }} />
                          <div>
                            <span className="bangumi-bound-name">{GitHubAuthService.getBoundAccount()?.nickname || GitHubAuthService.getBoundAccount()?.username || '已绑定'}</span>
                            <span className="settings-hint">GitHub 账号已绑定</span>
                          </div>
                        </div>
                        <button className="bangumi-unbind-btn" onClick={() => { GitHubAuthService.unbind(); setSettingsTab('bangumi'); }}>解除绑定</button>
                      </div>
                    ) : (
                      <>
                        <button className="bangumi-bind-btn" onClick={() => GitHubAuthService.initiateLogin()}>
                          <GitHubIcon size={16} /> 绑定 GitHub 账号
                        </button>
                        <p className="settings-hint">将跳转至 GitHub 进行授权</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
