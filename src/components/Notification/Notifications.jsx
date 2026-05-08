import { useState, useEffect } from 'react';
import { StorageService } from '../../services/api';
import { Bell, MessageCircle, Heart, Star, Users, AtSign, Check, CheckCheck, Trash2, Settings } from 'lucide-react';
import './Notifications.css';

const NOTIFICATIONS_KEY = 'acg_notifications';

const TYPE_CONFIG = {
  like: { icon: Heart, color: '#f56c6c', label: '点赞' },
  comment: { icon: MessageCircle, color: '#409eff', label: '评论' },
  follow: { icon: Users, color: '#67c23a', label: '关注' },
  mention: { icon: AtSign, color: '#e6a23c', label: '提及' },
  favorite: { icon: Star, color: '#f5a623', label: '收藏' },
  system: { icon: Bell, color: '#909399', label: '系统' },
};

const DEFAULT_NOTIFICATIONS = [
  { id: 1, type: 'system', title: '欢迎来到 ANISpace', content: '探索动画、游戏、小说的ACG社区世界', read: false, createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
  { id: 2, type: 'like', title: '追番达人 赞了你的帖子', content: '"2026年4月新番追番指南"获得了新的点赞', read: false, createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
  { id: 3, type: 'comment', title: '宅宅酱 评论了你的帖子', content: '确实！海岛地图太美了，我截图了好多', read: false, createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
  { id: 4, type: 'follow', title: '魔法少女 关注了你', content: '你们有3个共同好友', read: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() },
  { id: 5, type: 'system', title: '社区公告', content: 'ANISpace v2.0 已更新，新增Bilibili嵌入模式和音乐空间功能', read: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
];

function getNotifications() {
  const stored = StorageService.get(NOTIFICATIONS_KEY);
  if (!stored) {
    StorageService.set(NOTIFICATIONS_KEY, DEFAULT_NOTIFICATIONS);
    return DEFAULT_NOTIFICATIONS;
  }
  return stored;
}

function saveNotifications(notifications) {
  StorageService.set(NOTIFICATIONS_KEY, notifications);
}

export function getUnreadCount() {
  const notifications = getNotifications();
  return notifications.filter(n => !n.read).length;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState(() => getNotifications());
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    saveNotifications(updated);
  }, []);

  const filteredNotifications = filter === 'all'
    ? notifications
    : filter === 'unread'
      ? notifications.filter(n => !n.read)
      : notifications.filter(n => n.type === filter);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    saveNotifications(updated);
  };

  const deleteNotification = (id) => {
    const updated = notifications.filter(n => n.id !== id);
    setNotifications(updated);
    saveNotifications(updated);
  };

  const clearAll = () => {
    setNotifications([]);
    saveNotifications([]);
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="notifications-page">
      <div className="notif-header">
        <div className="notif-title-row">
          <Bell size={20} />
          <h2>通知</h2>
          {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
        </div>
        <div className="notif-actions">
          <button className="notif-action-btn" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck size={14} /> 全部已读
          </button>
          <button className="notif-action-btn danger" onClick={clearAll} disabled={notifications.length === 0}>
            <Trash2 size={14} /> 清空
          </button>
        </div>
      </div>

      <div className="notif-filters">
        {[
          { key: 'all', label: '全部' },
          { key: 'unread', label: '未读' },
          { key: 'like', label: '点赞' },
          { key: 'comment', label: '评论' },
          { key: 'follow', label: '关注' },
          { key: 'system', label: '系统' },
        ].map(f => (
          <button key={f.key} className={`notif-filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="notif-list">
        {filteredNotifications.length === 0 ? (
          <div className="notif-empty">
            <Bell size={40} />
            <p>{filter === 'unread' ? '没有未读通知' : '暂无通知'}</p>
          </div>
        ) : (
          filteredNotifications.map(notif => {
            const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
            const Icon = config.icon;
            return (
              <div key={notif.id} className={`notif-item ${notif.read ? 'read' : 'unread'}`}>
                <div className="notif-icon" style={{ background: config.color }}>
                  <Icon size={16} />
                </div>
                <div className="notif-content">
                  <div className="notif-item-header">
                    <span className="notif-type-tag" style={{ color: config.color }}>{config.label}</span>
                    {!notif.read && <span className="notif-unread-dot" />}
                  </div>
                  <h4 className="notif-title">{notif.title}</h4>
                  <p className="notif-text">{notif.content}</p>
                  <span className="notif-time">{formatTime(notif.createdAt)}</span>
                </div>
                <button className="notif-delete" onClick={() => deleteNotification(notif.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
