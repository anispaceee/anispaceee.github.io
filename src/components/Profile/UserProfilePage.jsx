import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { FriendService, FollowService, CollectionMarkService, UserService, MailService, BangumiAuthService, GitHubAuthService, StorageService } from '../../services/api';
import { Calendar, MapPin, Heart, LinkIcon, Shield, BookOpen, UserPlus, UserCheck, UserX, MessageCircle, MoreHorizontal, Star, Users, Activity, MessageSquare, Loader2, Edit3, Settings, Camera, Mail, Smile, Lock, Globe, Search } from 'lucide-react';
import { SubjectCard } from '../Common/CommonComponents';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import ActivityHeatmap from './ActivityHeatmap';
import './UserProfilePage.css';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';
const MARK_COLORS = { wish: '#409eff', collect: '#e6a23c', doing: '#67c23a', on_hold: '#909399', dropped: '#f56c6c' };

const PRIVACY_OPTIONS = [
  { key: 'public', label: '公开', icon: Globe, desc: '所有人可见' },
  { key: 'friends', label: '仅好友', icon: UserCheck, desc: '仅好友可见' },
  { key: 'private', label: '私密', icon: Lock, desc: '仅自己可见' },
];

const GitHubIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

export default function UserProfilePage() {
  const { userId: urlUserId } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, openAuth, updateProfile } = useApp();

  // 如果没有 URL 参数（/profile 路由），使用当前用户 ID
  const effectiveUserId = urlUserId || (currentUser?.id);
  const isSelf = !urlUserId || (currentUser && currentUser.id === parseInt(urlUserId));

  // ─── 基础状态 ───
  const [userInfo, setUserInfo] = useState(null);
  const [friendStatus, setFriendStatus] = useState(null); // 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'rejected' | 'following'
  const [friendRequestId, setFriendRequestId] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [userMarks, setUserMarks] = useState([]);
  const [markCounts, setMarkCounts] = useState({ wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [activityData, setActivityData] = useState([]);
  const [userComments, setUserComments] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // ─── 自有主页状态 ───
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [avatarPreview, setAvatarPreview] = useState(null);
  const avatarInputRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [privacySettings, setPrivacySettings] = useState(() => {
    const prefs = StorageService.get('acg_current_user')?.preferences;
    return prefs?.privacy || StorageService.get('acg_privacy') || { profile: 'public', marks: 'public', info: 'public' };
  });
  const [unreadMail, setUnreadMail] = useState(0);

  // ─── 好友标签页状态 ───
  const [activeTab, setActiveTab] = useState('collections');
  const [friendList, setFriendList] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ─── 加载用户信息 ───
  useEffect(() => {
    const loadUser = async () => {
      // 自己的主页：直接使用 currentUser，无需调 API
      if (isSelf && currentUser) {
        setUserInfo(currentUser);
        setLoading(false);
        return;
      }
      if (!effectiveUserId) { setLoading(false); return; }
      setLoading(true);
      try {
        const data = await FriendService.getUserPublic(effectiveUserId);
        setUserInfo(data);
      } catch {
        setUserInfo(null);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [effectiveUserId, isSelf, currentUser]);

  // ─── 加载好友状态和关注状态（仅他人主页） ───
  useEffect(() => {
    if (!isAuthenticated || !currentUser || isSelf) return;
    const loadStatus = async () => {
      try {
        const status = await FriendService.getFriendStatus(effectiveUserId);
        // 后端返回 requestStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'rejected'
        // 以及 isFollowing, isFollower, requestId
        if (status.requestStatus === 'accepted') {
          setFriendStatus('accepted');
        } else if (status.requestStatus === 'pending_sent' || status.requestStatus === 'pending_received') {
          setFriendStatus(status.requestStatus);
        } else if (status.isFollowing) {
          setFriendStatus('following');
        } else {
          setFriendStatus('none');
        }
        setFriendRequestId(status.requestId || null);
      } catch {
        setFriendStatus('none');
      }
      try {
        const following = await FollowService.isFollowingAsync(currentUser.id, parseInt(effectiveUserId));
        setIsFollowing(following);
      } catch {}
    };
    loadStatus();
  }, [isAuthenticated, currentUser, effectiveUserId, isSelf]);

  // ─── 加载用户收藏 ───
  useEffect(() => {
    if (!effectiveUserId) return;
    // 自己的主页始终加载；他人主页需 allow_profile_view
    if (!isSelf && !userInfo?.allow_profile_view) return;
    const loadMarks = async () => {
      try {
        const marks = await CollectionMarkService.getByUserId(parseInt(effectiveUserId));
        const list = Array.isArray(marks) ? marks : [];
        setUserMarks(list);
        const counts = { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 };
        list.forEach(m => { if (counts[m.status] !== undefined) counts[m.status]++; });
        setMarkCounts(counts);
      } catch {}
    };
    loadMarks();
  }, [userInfo, effectiveUserId, isSelf]);

  // ─── 加载活跃度热力图 ───
  useEffect(() => {
    if (!effectiveUserId) return;
    if (!isSelf && !userInfo?.allow_profile_view) return;
    setActivityLoading(true);
    UserService.getUserActivity(parseInt(effectiveUserId))
      .then(data => setActivityData(Array.isArray(data) ? data : []))
      .catch(() => setActivityData([]))
      .finally(() => setActivityLoading(false));
  }, [userInfo, effectiveUserId, isSelf]);

  // ─── 加载用户评论 ───
  useEffect(() => {
    if (!effectiveUserId) return;
    if (!isSelf && !userInfo?.allow_profile_view) return;
    setCommentsLoading(true);
    UserService.getUserComments(parseInt(effectiveUserId))
      .then(data => setUserComments(Array.isArray(data) ? data : []))
      .catch(() => setUserComments([]))
      .finally(() => setCommentsLoading(false));
  }, [userInfo, effectiveUserId, isSelf]);

  // ─── 加载未读邮件数（仅自己主页） ───
  useEffect(() => {
    if (!isSelf || !currentUser) return;
    MailService.getUnreadCountAsync(currentUser.id).then(data => {
      setUnreadMail(typeof data === 'object' ? data.count : (data || 0));
    }).catch(() => {});
  }, [isSelf, currentUser]);

  // ─── 加载好友列表和请求（仅自己主页） ───
  useEffect(() => {
    if (!isSelf || !currentUser) return;
    const loadFriendData = async () => {
      try {
        const friends = await FriendService.getFriendList();
        setFriendList(Array.isArray(friends) ? friends : (friends?.list || []));
      } catch {}
      try {
        const received = await FriendService.getReceivedRequests();
        setReceivedRequests(Array.isArray(received) ? received : []);
      } catch {}
      try {
        const sent = await FriendService.getSentRequests();
        setSentRequests(Array.isArray(sent) ? sent : []);
      } catch {}
    };
    loadFriendData();
  }, [isSelf, currentUser]);

  // ─── 计算属性 ───
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

  // ─── 他人主页：好友操作 ───
  const handleSendRequest = async () => {
    if (!isAuthenticated) { openAuth(); return; }
    setActionLoading(true);
    try {
      await FriendService.sendFriendRequest(parseInt(effectiveUserId), requestMessage);
      setFriendStatus('pending_sent');
      setShowRequestModal(false);
      setRequestMessage('');
    } catch (err) {
      alert(err.message || '发送好友请求失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!isAuthenticated) return;
    setActionLoading(true);
    try {
      // 使用已缓存的 requestId，若无则重新查询
      let requestId = friendRequestId;
      if (!requestId) {
        const status = await FriendService.getFriendStatus(effectiveUserId);
        requestId = status.requestId;
      }
      if (requestId) {
        await FriendService.handleFriendRequest(requestId, 'accepted');
        setFriendStatus('accepted');
        setFriendRequestId(requestId);
      }
    } catch (err) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!isAuthenticated) return;
    setActionLoading(true);
    try {
      let requestId = friendRequestId;
      if (!requestId) {
        const status = await FriendService.getFriendStatus(effectiveUserId);
        requestId = status.requestId;
      }
      if (requestId) {
        await FriendService.handleFriendRequest(requestId, 'rejected');
        setFriendStatus('none');
        setFriendRequestId(null);
      }
    } catch (err) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!isAuthenticated) return;
    if (!confirm('确定要删除好友吗？')) return;
    setActionLoading(true);
    try {
      await FriendService.removeFriend(parseInt(effectiveUserId));
      setFriendStatus('none');
      setShowDropdown(false);
    } catch (err) {
      alert(err.message || '删除好友失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!isAuthenticated) { openAuth(); return; }
    try {
      await FollowService.toggleFollow(currentUser.id, parseInt(effectiveUserId));
      setIsFollowing(prev => !prev);
    } catch {}
  };

  // ─── 自己主页：编辑操作 ───
  const handleEdit = () => {
    setEditForm({
      name: userInfo.name,
      sign: userInfo.sign || '',
      bio: userInfo.bio || '',
      hobbies: userInfo.hobbies || '',
      contact: userInfo.contact || '',
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateProfile(editForm);
    setUserInfo(prev => ({ ...prev, ...editForm }));
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
      setUserInfo(prev => ({ ...prev, avatar: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const handlePrivacyChange = (key, value) => {
    const updated = { ...privacySettings, [key]: value };
    setPrivacySettings(updated);
    updateProfile({ preferences: { ...(currentUser?.preferences || {}), privacy: updated } });
  };

  // ─── 判断是否可查看详情 ───
  const canViewProfile = isSelf || userInfo?.allow_profile_view;

  // ─── 加载中 ───
  if (loading) {
    return (
      <div className="user-profile-page">
        <div className="user-profile-loading">
          <div className="user-profile-skeleton-avatar" />
          <div className="user-profile-skeleton-lines">
            <div className="skeleton-line w60" />
            <div className="skeleton-line w40" />
            <div className="skeleton-line w80" />
          </div>
        </div>
      </div>
    );
  }

  // ─── 未登录提示 ───
  if (!isAuthenticated && isSelf) {
    return (
      <div className="user-profile-page">
        <div className="user-profile-not-found">
          <span>🔒</span>
          <h2>请先登录</h2>
          <button onClick={openAuth} className="back-link">去登录</button>
        </div>
      </div>
    );
  }

  // ─── 用户不存在 ───
  if (!userInfo) {
    return (
      <div className="user-profile-page">
        <div className="user-profile-not-found">
          <span>👤</span>
          <h2>用户不存在</h2>
          <Link to="/" className="back-link">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="user-profile-page">
      <div className="user-profile-layout">
        {/* ═══ 左侧边栏 ═══ */}
        <aside className="user-profile-sidebar">
          <div className="user-profile-sidebar-header">
            {/* 头像 */}
            <div className="user-profile-avatar-wrap">
              <img src={avatarPreview || userInfo.avatar || FALLBACK_IMG} alt="" className="user-profile-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
              {isSelf && (
                <button className="avatar-upload-btn" onClick={() => avatarInputRef.current?.click()} title="更换头像">
                  <Camera size={12} />
                </button>
              )}
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png" onChange={handleAvatarChange} hidden />
            </div>

            <h2 className="user-profile-name">{userInfo.name}</h2>
            {userInfo.username && <p className="user-profile-username">@{userInfo.username}</p>}
            {userInfo.sign && <p className="user-profile-sign">{userInfo.sign}</p>}
            {userInfo.bio && (
              <div className="user-profile-bio-md">
                <MarkdownRenderer content={userInfo.bio} />
              </div>
            )}

            {/* ─── 操作按钮 ─── */}
            {isSelf ? (
              <div className="user-profile-actions">
                <button className="user-profile-action-btn edit" onClick={handleEdit}>
                  <Edit3 size={13} /> 编辑
                </button>
                <Link to="/mailbox" className="user-profile-action-btn message">
                  <Mail size={13} /> D-Mail{unreadMail > 0 && <span className="mail-badge-small">{unreadMail}</span>}
                </Link>
                <button className="user-profile-action-btn settings" onClick={() => setShowSettings(true)}>
                  <Settings size={13} /> 设置
                </button>
              </div>
            ) : (
              <div className="user-profile-actions">
                {friendStatus === 'accepted' && (
                  <>
                    <span className="user-profile-badge friend">
                      <UserCheck size={13} /> 已好友
                    </span>
                    <Link to={`/mailbox?chat=${effectiveUserId}`} className="user-profile-action-btn message">
                      <MessageCircle size={13} /> 发私信
                    </Link>
                    <div className="user-profile-dropdown-wrap">
                      <button className="user-profile-action-btn more" onClick={() => setShowDropdown(!showDropdown)}>
                        <MoreHorizontal size={13} />
                      </button>
                      {showDropdown && (
                        <div className="user-profile-dropdown">
                          <button className="dropdown-item danger" onClick={handleRemoveFriend} disabled={actionLoading}>
                            <UserX size={13} /> 删除好友
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {friendStatus === 'pending_sent' && (
                  <>
                    <button className="user-profile-action-btn disabled" disabled>
                      <UserPlus size={13} /> 已申请
                    </button>
                    <button className={`user-profile-action-btn follow ${isFollowing ? 'following' : ''}`} onClick={handleToggleFollow}>
                      {isFollowing ? '已关注' : '+ 关注'}
                    </button>
                  </>
                )}
                {friendStatus === 'pending_received' && (
                  <>
                    <button className="user-profile-action-btn accept" onClick={handleAcceptRequest} disabled={actionLoading}>
                      <UserCheck size={13} /> 通过申请
                    </button>
                    <button className="user-profile-action-btn reject" onClick={handleRejectRequest} disabled={actionLoading}>
                      <UserX size={13} /> 拒绝
                    </button>
                  </>
                )}
                {friendStatus === 'following' && (
                  <>
                    <button className={`user-profile-action-btn follow ${isFollowing ? 'following' : ''}`} onClick={handleToggleFollow}>
                      {isFollowing ? '已关注' : '+ 关注'}
                    </button>
                    <button className="user-profile-action-btn primary" onClick={() => setShowRequestModal(true)}>
                      <UserPlus size={13} /> 添加好友
                    </button>
                  </>
                )}
                {(friendStatus === 'none' || !friendStatus) && (
                  <>
                    <button className="user-profile-action-btn primary" onClick={() => setShowRequestModal(true)}>
                      <UserPlus size={13} /> 添加好友
                    </button>
                    <button className={`user-profile-action-btn follow ${isFollowing ? 'following' : ''}`} onClick={handleToggleFollow}>
                      {isFollowing ? '已关注' : '+ 关注'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ─── 个人信息 ─── */}
            <div className="user-profile-meta-list">
              {userInfo.joinDate && <div className="user-profile-meta-item"><Calendar size={14} /> <span>加入于 {userInfo.joinDate}</span></div>}
              {userInfo.provider && (
                <div className="user-profile-meta-item">
                  {userInfo.provider === 'bangumi' ? <BookOpen size={14} /> : userInfo.provider === 'github' ? <GitHubIcon size={14} /> : <Shield size={14} />}
                  <span>通过 {userInfo.provider === 'bangumi' ? 'Bangumi' : userInfo.provider === 'github' ? 'GitHub' : '系统'} 登录</span>
                </div>
              )}
              {userInfo.gender && userInfo.gender !== 'other' && (
                <div className="user-profile-meta-item"><MapPin size={14} /> <span>{userInfo.gender === 'male' ? '男' : '女'}</span></div>
              )}
              {userInfo.hobbies && (
                <div className="user-profile-meta-item"><Heart size={14} /> <span>{userInfo.hobbies}</span></div>
              )}
              {userInfo.contact && (
                <div className="user-profile-meta-item"><LinkIcon size={14} /> <span>{userInfo.contact}</span></div>
              )}
            </div>

            {/* ─── 社交统计 ─── */}
            <div className="user-profile-social">
              <div className="user-profile-social-item"><span className="social-num">{userInfo.postCount || 0}</span><span className="social-label">帖子</span></div>
              <div className="user-profile-social-item"><span className="social-num">{userInfo.followingCount || 0}</span><span className="social-label">关注</span></div>
              <div className="user-profile-social-item"><span className="social-num">{userInfo.followerCount || 0}</span><span className="social-label">粉丝</span></div>
              <div className="user-profile-social-item"><span className="social-num">{userInfo.friend_count || userInfo.friendCount || 0}</span><span className="social-label">好友</span></div>
            </div>
          </div>

          {/* ─── 数据统计 ─── */}
          {canViewProfile && (
            <div className="user-profile-sidebar-stats">
              <h3>数据统计</h3>
              <div className="sidebar-stat-row"><span>动画</span><span className="stat-val anime">{userMarks.filter(m => m.subject_type === 2).length}</span></div>
              <div className="sidebar-stat-row"><span>游戏</span><span className="stat-val game">{userMarks.filter(m => m.subject_type === 4).length}</span></div>
              <div className="sidebar-stat-row"><span>小说</span><span className="stat-val novel">{userMarks.filter(m => m.subject_type === 1).length}</span></div>
              <div className="sidebar-stat-row divider"><span>均分</span><span className="stat-val score">{avgScore}</span></div>
            </div>
          )}

          {/* ─── 标记进度条（仅自己主页） ─── */}
          {isSelf && canViewProfile && progressData.length > 0 && (
            <div className="user-profile-sidebar-progress">
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
          )}

          {/* ─── 活跃度热力图（侧边栏，仅自己主页） ─── */}
          {isSelf && canViewProfile && (
            <div className="user-profile-sidebar-heatmap">
              <h3>活跃度</h3>
              <ActivityHeatmap data={activityData} />
            </div>
          )}
        </aside>

        {/* ═══ 右侧主内容 ═══ */}
        <main className="user-profile-main">
          {!canViewProfile ? (
            <div className="user-profile-private-hint">
              <Shield size={32} />
              <h3>该用户的主页仅对好友可见</h3>
              <p>添加好友后即可查看 TA 的收藏和评分</p>
            </div>
          ) : (
            <>
              {/* ─── 标签页切换（仅自己主页显示好友标签） ─── */}
              {isSelf && (
                <div className="user-profile-tabs">
                  <button className={`user-profile-tab ${activeTab === 'collections' ? 'active' : ''}`} onClick={() => setActiveTab('collections')}>
                    <BookOpen size={14} /> 收藏
                  </button>
                  <button className={`user-profile-tab ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => setActiveTab('friends')}>
                    <Users size={14} /> 好友
                    {receivedRequests.length > 0 && <span className="user-profile-tab-badge">{receivedRequests.length}</span>}
                  </button>
                </div>
              )}

              {/* ─── 收藏标签页 ─── */}
              {(!isSelf || activeTab === 'collections') && (
                <>
                  {/* 活跃度热力图（他人主页在主内容区显示） */}
                  {!isSelf && (
                    <div className="user-profile-category-section">
                      <div className="user-profile-category-header">
                        <Activity size={16} style={{ color: 'var(--primary)' }} />
                        <span className="category-title">活跃度</span>
                      </div>
                      {activityLoading ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-quaternary)' }}>
                          <Loader2 size={20} className="spin" />
                        </div>
                      ) : activityData.length > 0 ? (
                        <ActivityHeatmap data={activityData} />
                      ) : (
                        <div className="category-empty">暂无活跃度数据</div>
                      )}
                    </div>
                  )}

                  {/* 收藏分类列表 */}
                  {['wish', 'doing', 'collect', 'on_hold', 'dropped'].map(status => {
                    const items = userMarks.filter(m => m.status === status);
                    const isCollapsed = (status === 'on_hold' || status === 'dropped') && expandedCategory !== status && items.length > 0;

                    return (
                      <div key={status} className="user-profile-category-section">
                        <div className="user-profile-category-header">
                          <span className="category-indicator" style={{ background: MARK_COLORS[status] }} />
                          <span className="category-title">{CollectionMarkService.MARK_LABELS[status]}</span>
                          <span className="category-count">{items.length} 部</span>
                          {(status === 'on_hold' || status === 'dropped') ? (
                            isCollapsed && (
                              <span className="category-more" onClick={() => setExpandedCategory(status)}>展开 ▼</span>
                            )
                          ) : (
                            items.length > 5 && expandedCategory !== status && (
                              <span className="category-more" onClick={() => setExpandedCategory(status)}>更多 →</span>
                            )
                          )}
                          {expandedCategory === status && (
                            <span className="category-more" onClick={() => setExpandedCategory(null)}>收起 ↑</span>
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
                                    images: mark.subject_image ? { large: mark.subject_image, common: mark.subject_image } : {},
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
                      </div>
                    );
                  })}

                  {/* 评论列表 */}
                  <div className="user-profile-category-section">
                    <div className="user-profile-category-header">
                      <MessageSquare size={16} style={{ color: 'var(--primary)' }} />
                      <span className="category-title">评论</span>
                      <span className="category-count">{userComments.length} 条</span>
                    </div>
                    {commentsLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-quaternary)' }}>
                        <Loader2 size={20} className="spin" />
                      </div>
                    ) : userComments.length > 0 ? (
                      <div className="user-profile-comments">
                        {userComments.slice(0, 10).map(comment => (
                          <div key={comment.id} className="user-profile-comment-item">
                            <div className="comment-item-header">
                              {comment.subject_name && (
                                <Link
                                  to={`/info/${comment.subject_type === 1 ? 'novel' : comment.subject_type === 4 ? 'game' : 'anime'}/${comment.subject_id}`}
                                  className="comment-subject-link"
                                >
                                  {comment.subject_name}
                                </Link>
                              )}
                              {comment.score > 0 && (
                                <span className="comment-score">
                                  <Star size={10} fill="var(--accent-warm)" style={{ color: 'var(--accent-warm)' }} /> {comment.score}
                                </span>
                              )}
                            </div>
                            {comment.content && (
                              <p className="comment-item-content">{comment.content.length > 120 ? comment.content.substring(0, 120) + '...' : comment.content}</p>
                            )}
                            <span className="comment-item-time">{new Date(comment.created_at).toLocaleDateString('zh-CN')}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="category-empty">暂无评论</div>
                    )}
                  </div>
                </>
              )}

              {/* ─── 好友标签页（仅自己主页） ─── */}
              {isSelf && activeTab === 'friends' && (
                <div className="user-profile-friends-tab">
                  {/* 搜索用户 */}
                  <div className="user-profile-friend-search">
                    <div className="user-profile-friend-search-input-wrap">
                      <Search size={16} className="user-profile-friend-search-icon" />
                      <input
                        type="text"
                        placeholder="搜索用户..."
                        value={searchKeyword}
                        onChange={e => setSearchKeyword(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && searchKeyword.trim()) {
                            setSearchLoading(true);
                            FriendService.searchUsers(searchKeyword.trim()).then(data => {
                              setSearchResults(Array.isArray(data) ? data : []);
                            }).catch(() => {
                              setSearchResults([]);
                            }).finally(() => setSearchLoading(false));
                          }
                        }}
                        className="user-profile-friend-search-input"
                      />
                      {searchLoading && <Loader2 size={14} className="user-profile-friend-search-spinner" />}
                    </div>
                  </div>

                  {/* 搜索结果 */}
                  {searchResults.length > 0 && (
                    <div className="user-profile-friend-section">
                      <h3 className="user-profile-friend-section-title">搜索结果</h3>
                      <div className="user-profile-friend-list">
                        {searchResults.map(user => (
                          <Link key={user.id} to={`/user/${user.id}`} className="user-profile-friend-item">
                            <img src={user.avatar || FALLBACK_IMG} alt="" className="user-profile-friend-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
                            <div className="user-profile-friend-info">
                              <span className="user-profile-friend-name">{user.name}</span>
                              {user.sign && <span className="user-profile-friend-sign">{user.sign}</span>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 收到的好友请求 */}
                  {receivedRequests.length > 0 && (
                    <div className="user-profile-friend-section">
                      <h3 className="user-profile-friend-section-title">
                        好友请求 <span className="user-profile-friend-count">{receivedRequests.length}</span>
                      </h3>
                      <div className="user-profile-friend-list">
                        {receivedRequests.map(req => (
                          <div key={req.id} className="user-profile-friend-item with-actions">
                            <Link to={`/user/${req.fromUserId || req.userId}`} className="user-profile-friend-item-left">
                              <img src={req.avatar || FALLBACK_IMG} alt="" className="user-profile-friend-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
                              <div className="user-profile-friend-info">
                                <span className="user-profile-friend-name">{req.name || req.fromUserName || '用户'}</span>
                                {req.message && <span className="user-profile-friend-sign">{req.message}</span>}
                              </div>
                            </Link>
                            <div className="user-profile-friend-request-actions">
                              <button className="user-profile-friend-accept-btn" onClick={async () => {
                                try {
                                  await FriendService.handleFriendRequest(req.id, 'accepted');
                                  setReceivedRequests(prev => prev.filter(r => r.id !== req.id));
                                  const friends = await FriendService.getFriendList();
                                  setFriendList(Array.isArray(friends) ? friends : (friends?.list || []));
                                } catch (err) {
                                  alert(err.message || '操作失败');
                                }
                              }}>
                                <UserCheck size={12} /> 通过
                              </button>
                              <button className="user-profile-friend-reject-btn" onClick={async () => {
                                try {
                                  await FriendService.handleFriendRequest(req.id, 'rejected');
                                  setReceivedRequests(prev => prev.filter(r => r.id !== req.id));
                                } catch (err) {
                                  alert(err.message || '操作失败');
                                }
                              }}>
                                <UserX size={12} /> 拒绝
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 发出的好友请求 */}
                  {sentRequests.length > 0 && (
                    <div className="user-profile-friend-section">
                      <h3 className="user-profile-friend-section-title">待通过请求</h3>
                      <div className="user-profile-friend-list">
                        {sentRequests.map(req => (
                          <Link key={req.id} to={`/user/${req.toUserId || req.userId}`} className="user-profile-friend-item">
                            <img src={req.avatar || FALLBACK_IMG} alt="" className="user-profile-friend-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
                            <div className="user-profile-friend-info">
                              <span className="user-profile-friend-name">{req.name || req.toUserName || '用户'}</span>
                              <span className="user-profile-friend-sign pending">等待通过</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 好友列表 */}
                  <div className="user-profile-friend-section">
                    <h3 className="user-profile-friend-section-title">
                      好友列表 <span className="user-profile-friend-count">{friendList.length}</span>
                    </h3>
                    {friendList.length > 0 ? (
                      <div className="user-profile-friend-list">
                        {friendList.map(friend => (
                          <Link key={friend.id || friend.userId} to={`/user/${friend.id || friend.userId}`} className="user-profile-friend-item">
                            <img src={friend.avatar || FALLBACK_IMG} alt="" className="user-profile-friend-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
                            <div className="user-profile-friend-info">
                              <span className="user-profile-friend-name">{friend.name || friend.username || '用户'}</span>
                              {friend.sign && <span className="user-profile-friend-sign">{friend.sign}</span>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="user-profile-friend-empty">
                        <Users size={32} />
                        <p>暂无好友</p>
                        <span>搜索并添加好友吧~</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ═══ 编辑资料弹窗 ═══ */}
      {isEditing && (
        <div className="user-profile-overlay" onClick={() => setIsEditing(false)}>
          <div className="user-profile-edit-modal animate-scale-in" onClick={e => e.stopPropagation()}>
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

      {/* ═══ 好友请求弹窗 ═══ */}
      {showRequestModal && (
        <div className="user-profile-overlay" onClick={() => setShowRequestModal(false)}>
          <div className="user-profile-request-modal animate-scale-in" onClick={e => e.stopPropagation()}>
            <h2>添加好友</h2>
            <p className="request-modal-desc">向 <strong>{userInfo.name}</strong> 发送好友请求</p>
            <div className="request-modal-field">
              <label>验证消息（可选）</label>
              <textarea
                rows={3}
                placeholder="你好，我是..."
                value={requestMessage}
                onChange={e => setRequestMessage(e.target.value)}
              />
            </div>
            <div className="request-modal-actions">
              <button className="request-cancel" onClick={() => setShowRequestModal(false)}>取消</button>
              <button className="request-send" onClick={handleSendRequest} disabled={actionLoading}>
                {actionLoading ? '发送中...' : '发送请求'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 设置弹窗 ═══ */}
      {showSettings && isSelf && (
        <div className="user-profile-overlay" onClick={() => setShowSettings(false)}>
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
                      <img src={avatarPreview || userInfo.avatar} alt="" className="settings-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
                      <button className="settings-btn" onClick={() => avatarInputRef.current?.click()}>更换头像</button>
                      <p className="settings-hint">支持 JPG、PNG 格式，5MB 以内</p>
                    </div>
                  </div>
                  <div className="settings-item">
                    <label>个性签名</label>
                    <input className="settings-input" value={userInfo.sign || ''} onChange={e => { updateProfile({ sign: e.target.value }); setUserInfo(prev => ({ ...prev, sign: e.target.value })); }} placeholder="写点什么吧~" />
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
