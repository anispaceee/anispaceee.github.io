import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { FriendService, FollowService, CollectionMarkService, UserService } from '../../services/api';
import { Calendar, MapPin, Heart, LinkIcon, Shield, BookOpen, UserPlus, UserCheck, UserX, MessageCircle, MoreHorizontal, ChevronDown, Star, Users } from 'lucide-react';
import { SubjectCard } from '../Common/CommonComponents';
import { MarkdownRenderer } from '../Common/MarkdownEditor/MarkdownEditor';
import './UserProfilePage.css';

const FALLBACK_IMG = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';
const MARK_COLORS = { wish: '#409eff', collect: '#e6a23c', doing: '#67c23a', on_hold: '#909399', dropped: '#f56c6c' };

export default function UserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, openAuth } = useApp();

  const [userInfo, setUserInfo] = useState(null);
  const [friendStatus, setFriendStatus] = useState(null); // 'none' | 'pending_sent' | 'pending_received' | 'friend' | 'following'
  const [isFollowing, setIsFollowing] = useState(false);
  const [userMarks, setUserMarks] = useState([]);
  const [markCounts, setMarkCounts] = useState({ wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);

  const isSelf = currentUser && currentUser.id === parseInt(userId);

  // 加载用户公开信息
  useEffect(() => {
    const loadUser = async () => {
      setLoading(true);
      try {
        const data = await FriendService.getUserPublic(userId);
        setUserInfo(data);
      } catch {
        setUserInfo(null);
      } finally {
        setLoading(false);
      }
    };
    if (userId) loadUser();
  }, [userId]);

  // 加载好友状态和关注状态
  useEffect(() => {
    if (!isAuthenticated || !currentUser || isSelf) return;
    const loadStatus = async () => {
      try {
        const status = await FriendService.getFriendStatus(userId);
        setFriendStatus(status.status || 'none');
      } catch {
        setFriendStatus('none');
      }
      try {
        const following = await FollowService.isFollowingAsync(currentUser.id, parseInt(userId));
        setIsFollowing(following);
      } catch {}
    };
    loadStatus();
  }, [isAuthenticated, currentUser, userId, isSelf]);

  // 加载用户收藏（仅 allow_profile_view 时）
  useEffect(() => {
    if (!userInfo?.allow_profile_view) return;
    const loadMarks = async () => {
      try {
        const marks = await CollectionMarkService.getByUserId(parseInt(userId));
        const list = Array.isArray(marks) ? marks : [];
        setUserMarks(list);
        const counts = { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 };
        list.forEach(m => { if (counts[m.status] !== undefined) counts[m.status]++; });
        setMarkCounts(counts);
      } catch {}
    };
    loadMarks();
  }, [userInfo, userId]);

  const totalMarks = userMarks.length;
  const avgScore = useMemo(() => {
    const scores = userMarks.filter(m => m.user_score > 0).map(m => m.user_score);
    return scores.length > 0 ? (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1) : '-';
  }, [userMarks]);

  const handleSendRequest = async () => {
    if (!isAuthenticated) { openAuth(); return; }
    setActionLoading(true);
    try {
      await FriendService.sendFriendRequest(parseInt(userId), requestMessage);
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
      // 需要从 friendStatus 中获取 requestId
      const status = await FriendService.getFriendStatus(userId);
      if (status.requestId) {
        await FriendService.handleFriendRequest(status.requestId, 'accepted');
        setFriendStatus('friend');
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
      const status = await FriendService.getFriendStatus(userId);
      if (status.requestId) {
        await FriendService.handleFriendRequest(status.requestId, 'rejected');
        setFriendStatus('none');
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
      await FriendService.removeFriend(parseInt(userId));
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
      await FollowService.toggleFollow(currentUser.id, parseInt(userId));
      setIsFollowing(prev => !prev);
    } catch {}
  };

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
        {/* 左侧边栏 */}
        <aside className="user-profile-sidebar">
          <div className="user-profile-sidebar-header">
            <div className="user-profile-avatar-wrap">
              <img src={userInfo.avatar || FALLBACK_IMG} alt="" className="user-profile-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
            </div>
            <h2 className="user-profile-name">{userInfo.name}</h2>
            {userInfo.username && <p className="user-profile-username">@{userInfo.username}</p>}
            {userInfo.sign && <p className="user-profile-sign">{userInfo.sign}</p>}
            {userInfo.bio && (
              <div className="user-profile-bio-md">
                <MarkdownRenderer content={userInfo.bio} />
              </div>
            )}

            {/* 操作按钮 */}
            {!isSelf && (
              <div className="user-profile-actions">
                {friendStatus === 'friend' && (
                  <>
                    <span className="user-profile-badge friend">
                      <UserCheck size={13} /> 已好友
                    </span>
                    <Link to="/mailbox" className="user-profile-action-btn message">
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

            {/* 个人信息 */}
            <div className="user-profile-meta-list">
              {userInfo.joinDate && <div className="user-profile-meta-item"><Calendar size={14} /> <span>加入于 {userInfo.joinDate}</span></div>}
              {userInfo.provider && (
                <div className="user-profile-meta-item">
                  {userInfo.provider === 'bangumi' ? <BookOpen size={14} /> : <Shield size={14} />}
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

            {/* 统计 */}
            <div className="user-profile-social">
              <div className="user-profile-social-item"><span className="social-num">{userInfo.postCount || 0}</span><span className="social-label">帖子</span></div>
              <div className="user-profile-social-item"><span className="social-num">{userInfo.followingCount || 0}</span><span className="social-label">关注</span></div>
              <div className="user-profile-social-item"><span className="social-num">{userInfo.followerCount || 0}</span><span className="social-label">粉丝</span></div>
              <div className="user-profile-social-item"><span className="social-num">{userInfo.friendCount || 0}</span><span className="social-label">好友</span></div>
            </div>
          </div>

          {/* 数据统计 */}
          {userInfo.allow_profile_view && (
            <div className="user-profile-sidebar-stats">
              <h3>数据统计</h3>
              <div className="sidebar-stat-row"><span>动画</span><span className="stat-val anime">{userMarks.filter(m => m.subject_type === 2).length}</span></div>
              <div className="sidebar-stat-row"><span>游戏</span><span className="stat-val game">{userMarks.filter(m => m.subject_type === 4).length}</span></div>
              <div className="sidebar-stat-row"><span>小说</span><span className="stat-val novel">{userMarks.filter(m => m.subject_type === 1).length}</span></div>
              <div className="sidebar-stat-row divider"><span>均分</span><span className="stat-val score">{avgScore}</span></div>
            </div>
          )}
        </aside>

        {/* 右侧主内容 */}
        <main className="user-profile-main">
          {!userInfo.allow_profile_view ? (
            <div className="user-profile-private-hint">
              <Shield size={32} />
              <h3>该用户的主页仅对好友可见</h3>
              <p>添加好友后即可查看 TA 的收藏和评分</p>
            </div>
          ) : (
            ['wish', 'doing', 'collect', 'on_hold', 'dropped'].map(status => {
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
                </div>
              );
            })
          )}
        </main>
      </div>

      {/* 好友请求弹窗 */}
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
    </div>
  );
}
