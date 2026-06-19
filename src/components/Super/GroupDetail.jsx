import { useState, useCallback, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, MessageCircle, Clock, Loader2, AlertCircle, ChevronLeft, ChevronRight, Plus, UserPlus, UserMinus, X, Send } from 'lucide-react';
import { SuperService } from '../../services/SuperService';
import { useApp } from '../../context/AppContext';
import TopicCard from './TopicCard';
import './GroupDetail.css';

const PAGE_SIZE = 20;

/**
 * GroupDetail - 小组详情页组件
 * 展示小组信息、话题列表，支持加入/退出小组、发表话题
 */
export default function GroupDetail() {
  const { groupId } = useParams();
  const { currentUser, isAuthenticated, openAuth, bangumiBound } = useApp();

  // 小组详情状态
  const [group, setGroup] = useState(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [groupError, setGroupError] = useState(null);

  // 话题列表状态
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 加入/退出小组状态
  const [isMember, setIsMember] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);

  // 发表话题模态框状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicContent, setNewTopicContent] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);

  // 获取小组详情
  const fetchGroupDetail = useCallback(async () => {
    if (!groupId) return;
    setGroupLoading(true);
    setGroupError(null);
    try {
      const data = await SuperService.getGroupDetail(groupId);
      setGroup(data);
      setIsMember(data.is_member || false);
    } catch (err) {
      setGroupError(err.message || '加载小组详情失败');
      setGroup(null);
    } finally {
      setGroupLoading(false);
    }
  }, [groupId]);

  // 获取话题列表
  const fetchTopics = useCallback(async () => {
    if (!groupId) return;
    setTopicsLoading(true);
    setTopicsError(null);
    try {
      const res = await SuperService.getGroupTopics(groupId, page, PAGE_SIZE);
      setTopics(res.topics || []);
      setTotal(res.total || 0);
      setTotalPages(Math.max(1, Math.ceil((res.total || 0) / PAGE_SIZE)));
    } catch (err) {
      setTopicsError(err.message || '加载话题列表失败');
      setTopics([]);
    } finally {
      setTopicsLoading(false);
    }
  }, [groupId, page]);

  useEffect(() => {
    fetchGroupDetail();
  }, [fetchGroupDetail]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  // 加入小组
  const handleJoinGroup = useCallback(async () => {
    if (!isAuthenticated) {
      openAuth();
      return;
    }
    if (!bangumiBound) {
      alert('请先绑定 Bangumi 账号才能加入小组');
      return;
    }
    setJoinLoading(true);
    try {
      await SuperService.joinGroup(groupId);
      setIsMember(true);
      // 更新小组成员数
      if (group) {
        setGroup({ ...group, members: (group.members || 0) + 1 });
      }
    } catch (err) {
      alert(err.message || '加入小组失败');
    } finally {
      setJoinLoading(false);
    }
  }, [groupId, group, isAuthenticated, bangumiBound, openAuth]);

  // 退出小组
  const handleLeaveGroup = useCallback(async () => {
    if (!isAuthenticated) return;
    setJoinLoading(true);
    try {
      await SuperService.leaveGroup(groupId);
      setIsMember(false);
      // 更新小组成员数
      if (group) {
        setGroup({ ...group, members: Math.max(0, (group.members || 0) - 1) });
      }
    } catch (err) {
      alert(err.message || '退出小组失败');
    } finally {
      setJoinLoading(false);
    }
  }, [groupId, group, isAuthenticated]);

  // 发表话题
  const handleCreateTopic = useCallback(async () => {
    if (!newTopicTitle.trim() || !newTopicContent.trim()) {
      setCreateError('标题和内容不能为空');
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await SuperService.createTopic(groupId, newTopicTitle.trim(), newTopicContent.trim());
      setShowCreateModal(false);
      setNewTopicTitle('');
      setNewTopicContent('');
      // 刷新话题列表
      setPage(1);
      fetchTopics();
      // 更新小组话题数
      if (group) {
        setGroup({ ...group, topics: (group.topics || 0) + 1 });
      }
    } catch (err) {
      setCreateError(err.message || '发表话题失败');
    } finally {
      setCreateLoading(false);
    }
  }, [groupId, group, newTopicTitle, newTopicContent, fetchTopics]);

  // 分页导航
  const handlePrevPage = useCallback(() => {
    setPage(p => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage(p => Math.min(totalPages, p + 1));
  }, [totalPages]);

  // 格式化时间
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}-${month}-${day}`;
  };

  // 加载小组详情状态
  if (groupLoading) {
    return (
      <div className="gd-page">
        <div className="gd-loading">
          <Loader2 size={32} className="gd-spinning" />
          <p>加载小组详情...</p>
        </div>
      </div>
    );
  }

  // 加载小组详情失败
  if (groupError || !group) {
    return (
      <div className="gd-page">
        <div className="gd-error">
          <AlertCircle size={32} />
          <p>{groupError || '小组不存在'}</p>
          <Link to="/super" className="gd-back-btn">
            返回小组列表
          </Link>
        </div>
      </div>
    );
  }

  const {
    id,
    name,
    title,
    icon,
    desc,
    members = 0,
    topics: topicCount = 0,
    nsfw = false,
    created_at,
    updated_at,
  } = group;

  return (
    <div className="gd-page">
      {/* 小组信息头部卡片 */}
      <div className="gd-header-card">
        <div className="gd-icon">
          {icon ? (
            <img src={icon} alt={title || name} loading="lazy" />
          ) : (
            <div className="gd-icon-placeholder">
              <span>{(title || name || '?')[0]}</span>
            </div>
          )}
        </div>

        <div className="gd-header-content">
          <div className="gd-header-top">
            <h1 className="gd-title">{title || name}</h1>
            {nsfw && <span className="gd-nsfw-badge">NSFW</span>}
          </div>

          {desc && (
            <p className="gd-desc">{desc}</p>
          )}

          <div className="gd-stats">
            <span className="gd-stat">
              <Users size={16} />
              <span>{members.toLocaleString()} 成员</span>
            </span>
            <span className="gd-stat">
              <MessageCircle size={16} />
              <span>{topicCount.toLocaleString()} 话题</span>
            </span>
            {created_at && (
              <span className="gd-stat">
                <Clock size={16} />
                <span>创建于 {formatTime(created_at)}</span>
              </span>
            )}
          </div>

          <div className="gd-actions">
            {/* 加入/退出小组按钮 */}
            {isMember ? (
              <button
                className="gd-action-btn gd-leave-btn"
                onClick={handleLeaveGroup}
                disabled={joinLoading}
              >
                {joinLoading ? (
                  <Loader2 size={16} className="gd-spinning" />
                ) : (
                  <UserMinus size={16} />
                )}
                <span>退出小组</span>
              </button>
            ) : (
              <button
                className="gd-action-btn gd-join-btn"
                onClick={handleJoinGroup}
                disabled={joinLoading}
              >
                {joinLoading ? (
                  <Loader2 size={16} className="gd-spinning" />
                ) : (
                  <UserPlus size={16} />
                )}
                <span>加入小组</span>
              </button>
            )}

            {/* 发表话题按钮 */}
            {isMember && (
              <button
                className="gd-action-btn gd-create-btn"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={16} />
                <span>发表话题</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 话题列表 */}
      <div className="gd-topics-section">
        <div className="gd-topics-header">
          <h2 className="gd-topics-title">话题列表</h2>
          <span className="gd-topics-count">
            共 {total.toLocaleString()} 个话题
          </span>
        </div>

        {/* 话题加载错误 */}
        {topicsError && (
          <div className="gd-topics-error">
            <AlertCircle size={20} />
            <p>{topicsError}</p>
            <button className="gd-retry-btn" onClick={fetchTopics}>
              重试
            </button>
          </div>
        )}

        {/* 话题列表 */}
        {topics.length === 0 && !topicsLoading ? (
          <div className="gd-topics-empty">
            <MessageCircle size={48} />
            <p>暂无话题，点击"发表话题"开始讨论</p>
          </div>
        ) : (
          <div className="gd-topics-list">
            {topics.map(topic => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        )}

        {/* 话题加载中 */}
        {topicsLoading && (
          <div className="gd-topics-loading">
            <Loader2 size={24} className="gd-spinning" />
          </div>
        )}

        {/* 分页导航 */}
        {totalPages > 1 && (
          <div className="gd-pagination">
            <button
              className="gd-page-btn"
              disabled={page <= 1 || topicsLoading}
              onClick={handlePrevPage}
            >
              <ChevronLeft size={16} />
              上一页
            </button>
            <span className="gd-page-info">
              {page} / {totalPages}
            </span>
            <button
              className="gd-page-btn"
              disabled={page >= totalPages || topicsLoading}
              onClick={handleNextPage}
            >
              下一页
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* 发表话题模态框 */}
      {showCreateModal && (
        <div className="gd-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="gd-modal" onClick={e => e.stopPropagation()}>
            <div className="gd-modal-header">
              <h3 className="gd-modal-title">发表话题</h3>
              <button
                className="gd-modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="gd-modal-body">
              <div className="gd-modal-field">
                <label className="gd-modal-label">标题</label>
                <input
                  type="text"
                  className="gd-modal-input"
                  value={newTopicTitle}
                  onChange={e => setNewTopicTitle(e.target.value)}
                  placeholder="请输入话题标题..."
                  maxLength={200}
                />
              </div>

              <div className="gd-modal-field">
                <label className="gd-modal-label">内容</label>
                <textarea
                  className="gd-modal-textarea"
                  value={newTopicContent}
                  onChange={e => setNewTopicContent(e.target.value)}
                  placeholder="请输入话题内容..."
                  rows={8}
                />
              </div>

              {createError && (
                <div className="gd-modal-error">
                  <AlertCircle size={16} />
                  <span>{createError}</span>
                </div>
              )}
            </div>

            <div className="gd-modal-footer">
              <button
                className="gd-modal-btn gd-modal-cancel"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </button>
              <button
                className="gd-modal-btn gd-modal-submit"
                onClick={handleCreateTopic}
                disabled={createLoading || !newTopicTitle.trim() || !newTopicContent.trim()}
              >
                {createLoading ? (
                  <Loader2 size={16} className="gd-spinning" />
                ) : (
                  <Send size={16} />
                )}
                <span>发表</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}