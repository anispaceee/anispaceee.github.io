import { useParams, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { UserService, FollowService, CollectionMarkService, RatingService, FavoriteService, StorageService, BangumiAuthService, GitHubAuthService, MailService, BangumiService } from '../../services/api';
import { Settings, Edit3, Users, FileText, Heart, MessageCircle, Calendar, MapPin, BookOpen, Star, Eye, Camera, Mail, Shield, Smile, LinkIcon, Lock, Globe, UserCheck, ChevronRight, Download, Activity } from 'lucide-react';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import { SubjectCard } from '../Common/CommonComponents';
import UserAvatar from '../Common/UserAvatar';
import ActivityHeatmap from './ActivityHeatmap';
import ProfileSettings from './ProfileSettings';
import { useState, useRef, useMemo, useEffect } from 'react';
import './Profile.css';

const GitHubIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

const PRIVACY_OPTIONS = [
  { key: 'public', label: '公开', icon: Globe, desc: '所有人可见' },
  { key: 'friends', label: '仅好友', icon: UserCheck, desc: '仅关注的人可见' },
  { key: 'private', label: '私密', icon: Lock, desc: '仅自己可见' },
];

const MARK_COLORS = { wish: '#409eff', collect: '#e6a23c', doing: '#67c23a', on_hold: '#909399', dropped: '#f56c6c' };

export default function Profile() {
  const { id } = useParams();
  const { currentUser, isAuthenticated, openAuth, updateProfile } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [privacySettings, setPrivacySettings] = useState(() => {
    const prefs = StorageService.get('acg_current_user')?.preferences;
    return prefs?.privacy || StorageService.get('acg_privacy') || { profile: 'public', marks: 'public', info: 'public' };
  });
  const avatarInputRef = useRef(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [userMarks, setUserMarks] = useState([]);
  const [markCounts, setMarkCounts] = useState({ wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 });
  const [userFavorites, setUserFavorites] = useState([]);
  const [unreadMail, setUnreadMail] = useState(0);

  const [activityData, setActivityData] = useState([]);
  const [userComments, setUserComments] = useState([]);
  const [expandedCategory, setExpandedCategory] = useState(null);

  const profileUser = id ? UserService.getById(parseInt(id)) : currentUser;
  const isOwnProfile = !id || (currentUser && currentUser.id === parseInt(id));

  useEffect(() => {
    if (isAuthenticated && currentUser && profileUser) {
      FollowService.isFollowingAsync(currentUser.id, profileUser.id).then(setIsFollowing).catch(() => {});
    }
  }, [isAuthenticated, currentUser, profileUser]);

  useEffect(() => {
    if (profileUser) {
      FavoriteService.getUserFavoritesAsync(profileUser.id, 'info').then(data => {
        setUserFavorites(Array.isArray(data) ? data : []);
      }).catch(() => {});
    }
  }, [profileUser]);

  useEffect(() => {
    if (currentUser) {
      MailService.getUnreadCountAsync(currentUser.id).then(data => {
        setUnreadMail(typeof data === 'object' ? data.count : (data || 0));
      }).catch(() => {});
    }
  }, [currentUser]);

  useEffect(() => {
    const loadMarks = async () => {
      try {
        const marks = await CollectionMarkService.getByUserId(profileUser.id);
        const list = Array.isArray(marks) ? marks : [];
        setUserMarks(list);
        const counts = { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 };
        list.forEach(m => { if (counts[m.status] !== undefined) counts[m.status]++; });
        setMarkCounts(counts);
      } catch {}
    };
    if (profileUser) loadMarks();
  }, [profileUser]);

  useEffect(() => {
    if (!profileUser?.id) return;
    UserService.getUserActivity(profileUser.id).then(data => {
      setActivityData(Array.isArray(data) ? data : []);
    }).catch(() => {});
    UserService.getUserComments(profileUser.id).then(data => {
      setUserComments(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, [profileUser]);

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

  const handlePrivacyChange = (key, value) => {
    const updated = { ...privacySettings, [key]: value };
    setPrivacySettings(updated);
    updateProfile({ preferences: { ...(currentUser?.preferences || {}), privacy: updated } });
  };

  const animeCount = userMarks.filter(m => m.subject_type === 2).length;
  const gameCount = userMarks.filter(m => m.subject_type === 4).length;
  const novelCount = userMarks.filter(m => m.subject_type === 1).length;
  const totalMarks = userMarks.length;
  const avgScore = useMemo(() => {
    const scores = userMarks.filter(m => m.user_score > 0).map(m => m.user_score);
    return scores.length > 0 ? (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1) : '-';
  }, [userMarks]);

  const progressData = useMemo(() => {
    const total = totalMarks || 1;
    return [
      { key: 'wish', count: markCounts.wish, color: MARK_COLORS.wish, label: '想看' },
      { key: 'collect', count: markCounts.collect, color: MARK_COLORS.collect, label: '看过' },
      { key: 'doing', count: markCounts.doing, color: MARK_COLORS.doing, label: '在看' },
      { key: 'on_hold', count: markCounts.on_hold, color: MARK_COLORS.on_hold, label: '搁置' },
      { key: 'dropped', count: markCounts.dropped, color: MARK_COLORS.dropped, label: '抛弃' },
    ].filter(d => d.count > 0);
  }, [markCounts, totalMarks]);

  return (
    <div className="profile-page">
      <div className="profile-layout">
        {/* 左侧边栏 */}
        <aside className="profile-sidebar">
          <div className="profile-sidebar-header">
            <div className="profile-avatar-wrap-sidebar">
              <img src={avatarPreview || profileUser.avatar || FALLBACK_IMG} alt="" className="profile-sidebar-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
              {isOwnProfile && (
                <button className="avatar-upload-btn-sidebar" onClick={() => avatarInputRef.current?.click()} title="更换头像">
                  <Camera size={12} />
                </button>
              )}
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png" onChange={handleAvatarChange} hidden />
            </div>
            <h2 className="profile-sidebar-name">{profileUser.name}</h2>
            {profileUser.username && <p className="profile-sidebar-username">@{profileUser.username}</p>}
            {profileUser.sign && <p className="profile-sidebar-bio">{profileUser.sign}</p>}
            {profileUser.bio && (
              <div className="profile-sidebar-bio-md">
                <MarkdownRenderer content={profileUser.bio} />
              </div>
            )}

            {/* 操作按钮 */}
            <div className="profile-sidebar-actions-row">
              {isOwnProfile ? (
                <>
                  <button className="profile-action-pill edit" onClick={handleEdit}>
                    <Edit3 size={13} /> 编辑
                  </button>
                  <Link to="/mailbox" className="profile-action-pill mail">
                    <Mail size={13} /> 邮箱{unreadMail > 0 && <span className="mail-badge-small">{unreadMail}</span>}
                  </Link>
                  <button className="profile-action-pill settings" onClick={() => setShowSettings(true)}>
                    <Settings size={13} /> 设置
                  </button>
                </>
              ) : (
                <>
                  <button className={`profile-action-pill follow ${isFollowing ? 'following' : ''}`}
                    onClick={() => { if (!isAuthenticated) { openAuth(); return; } FollowService.toggleFollow(currentUser.id, profileUser.id); }}>
                    {isFollowing ? '已关注' : '+ 关注'}
                  </button>
                  <Link to="/mailbox" className="profile-action-pill mail">
                    <Mail size={13} /> 私信
                  </Link>
                </>
              )}
            </div>

            {/* 个人信息 */}
            <div className="profile-meta-list">
              {profileUser.joinDate && <div className="profile-meta-item"><Calendar size={14} /> <span>加入于 {profileUser.joinDate}</span></div>}
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

            {/* 关注/粉丝/帖子 */}
            <div className="profile-sidebar-social">
              <div className="sidebar-social-item"><span className="sidebar-social-num">{profileUser.postCount || 0}</span><span className="sidebar-social-label">帖子</span></div>
              <div className="sidebar-social-item"><span className="sidebar-social-num">{profileUser.followingCount || 0}</span><span className="sidebar-social-label">关注</span></div>
              <div className="sidebar-social-item"><span className="sidebar-social-num">{profileUser.followerCount || 0}</span><span className="sidebar-social-label">粉丝</span></div>
            </div>
          </div>

          {/* 统计数字 */}
          <div className="profile-sidebar-stats">
            <h3>数据统计</h3>
            <div className="sidebar-stat-row"><span>动画</span><span className="stat-val anime">{animeCount}</span></div>
            <div className="sidebar-stat-row"><span>游戏</span><span className="stat-val game">{gameCount}</span></div>
            <div className="sidebar-stat-row"><span>小说</span><span className="stat-val novel">{novelCount}</span></div>
            <div className="sidebar-stat-row divider"><span>均分</span><span className="stat-val score">{avgScore}</span></div>
          </div>

          {/* 标记进度 */}
          <div className="profile-sidebar-progress">
            <h3>标记进度</h3>
            <div className="progress-bar-stack">
              {progressData.map(d => (
                <div
                  key={d.key}
                  className="progress-bar-segment"
                  style={{ width: `${(d.count / totalMarks) * 100}%`, background: d.color }}
                  title={`${d.label}: ${d.count}`}
                />
              ))}
            </div>
            <div className="progress-legend">
              {progressData.map(d => (
                <div key={d.key} className="progress-legend-item">
                  <span className="progress-legend-left">
                    <span className="progress-legend-dot" style={{ background: d.color }} />
                    {d.label}
                  </span>
                  <span className="progress-legend-count">{d.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 活跃度热力图 */}
          <div className="profile-sidebar-heatmap">
            <h3>活跃度</h3>
            <ActivityHeatmap data={activityData} />
          </div>
        </aside>

        {/* 右侧主内容 */}
        <main className="profile-main">
          {['wish', 'doing', 'collect', 'on_hold', 'dropped'].map(status => {
            const items = userMarks.filter(m => m.status === status);
            const isCollapsed = (status === 'on_hold' || status === 'dropped') && expandedCategory !== status && items.length > 0;

            return (
              <div key={status} className="profile-category-section">
                <div className="profile-category-header">
                  <span className="category-indicator" style={{ background: MARK_COLORS[status] }} />
                  <span className="category-title">{CollectionMarkService.MARK_LABELS[status]}</span>
                  <span className="category-count">{items.length} 部</span>
                  {(status === 'on_hold' || status === 'dropped') ? (
                    isCollapsed && (
                      <span className="category-more" onClick={() => setExpandedCategory(status)}>
                        展开 ▼
                      </span>
                    )
                  ) : (
                    items.length > 5 && expandedCategory !== status && (
                      <span className="category-more" onClick={() => setExpandedCategory(status)}>
                        更多 →
                      </span>
                    )
                  )}
                  {expandedCategory === status && (
                    <span className="category-more" onClick={() => setExpandedCategory(null)}>
                      收起 ↑
                    </span>
                  )}
                </div>
                {!isCollapsed && (
                  items.length > 0 ? (
                    <div className="category-covers">
                      {(expandedCategory === status ? items : items.slice(0, 6)).map(mark => (
                        <SubjectCard
                          key={`${mark.user_id}_${mark.subject_id}`}
                          item={{
                            id: mark.subject_id,
                            name: mark.subject_name || `条目 #${mark.subject_id}`,
                            name_cn: mark.subject_name || '',
                            image: mark.subject_image || '',
                            images: mark.subject_image ? { common: mark.subject_image } : {},
                            rating: { score: 0 },
                            tags: [],
                          }}
                          type={mark.subject_type === 1 ? 'novel' : mark.subject_type === 4 ? 'game' : 'anime'}
                          linkTo={`/info/${mark.subject_type === 1 ? 'novel' : mark.subject_type === 4 ? 'game' : 'anime'}/${mark.subject_id}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="category-empty">暂无{CollectionMarkService.MARK_LABELS[status]}</div>
                  )
                )}
                {status === 'collect' && userComments.length > 0 && (
                  <div className="profile-recent-comments">
                    <h4>最近评论</h4>
                    {userComments.slice(0, 5).map(c => (
                      <div key={c.id} className="comment-item">
                        <img src={c.subject_image || FALLBACK_IMG} alt="" className="comment-cover" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
                        <div className="comment-info">
                          <span className="comment-subject">{c.subject_name}</span>
                          {c.score > 0 && <span className="comment-score">⭐ {c.score}</span>}
                          <p className="comment-text">{c.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </main>
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
              <label>个性签名</label>
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
                      <img src={avatarPreview || profileUser.avatar} alt="" className="settings-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
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
                      { key: '', label: '浅色模式', desc: '清新明亮', color: '#F5F5F7' },
                      { key: 'dark', label: '深色模式', desc: '护眼舒适', color: '#1c1c1e' },
                      { key: 'high-contrast', label: '高对比度', desc: '清晰易读', color: '#ffffff' },
                    ].map(t => (
                      <button key={t.key} className={`theme-option ${(document.documentElement.getAttribute('data-theme') || '') === t.key ? 'active' : ''}`}
                        onClick={() => {
                          if (t.key) document.documentElement.setAttribute('data-theme', t.key);
                          else document.documentElement.removeAttribute('data-theme');
                          updateProfile({ preferences: { ...(currentUser?.preferences || {}), theme: t.key } });
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
                          <img src={BangumiAuthService.getBoundAccount()?.avatar || FALLBACK_IMG} alt="" className="settings-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
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
                          <img src={GitHubAuthService.getBoundAccount()?.avatar || FALLBACK_IMG} alt="" className="settings-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
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
