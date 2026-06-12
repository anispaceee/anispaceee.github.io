import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService, NotificationService } from '../../services/api';
import { Bell, X } from 'lucide-react';
import './LoginNotificationBar.css';

const HIDE_DELAY = 5000;
const DISMISSED_KEY = 'acg_login_notif_dismissed';

const TYPE_CONFIG = {
  like: { icon: '❤️', color: '#f56c6c', label: '点赞' },
  comment: { icon: '💬', color: '#409eff', label: '评论' },
  follow: { icon: '👥', color: '#67c23a', label: '关注' },
  mention: { icon: '@', color: '#e6a23c', label: '提及' },
  favorite: { icon: '⭐', color: '#f5a623', label: '收藏' },
  system: { icon: '🔔', color: '#909399', label: '系统' },
  friend_request: { icon: '👤', color: '#e886a2', label: '好友请求' },
};

export default function LoginNotificationBar() {
  const { currentUser, isAuthenticated } = useApp();
  const [notification, setNotification] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef(null);

  const resetTimer = useCallback(() => {
    setHidden(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHidden(true), HIDE_DELAY);
  }, []);

  // 登录时获取最新通知
  useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      setNotification(null);
      return;
    }

    // 检查本次会话是否已关闭过
    const dismissedSession = sessionStorage.getItem(`${DISMISSED_KEY}_${currentUser.id}`);
    if (dismissedSession) return;

    const fetchLatest = async () => {
      try {
        // 尝试从后端获取
        const serverNotifs = await NotificationService.getByUserId(currentUser.id);
        const serverList = Array.isArray(serverNotifs) ? serverNotifs : [];
        const unread = serverList.filter(n => !n.is_read);
        if (unread.length > 0) {
          const latest = unread[0];
          setNotification({
            type: latest.type || 'system',
            title: latest.content || '新通知',
            time: latest.created_at,
          });
          resetTimer();
          return;
        }
      } catch (e) { /* fallback to local */ }

      // 降级到本地通知
      const localNotifs = StorageService.get('acg_notifications') || [];
      const unread = localNotifs.filter(n => !n.read);
      if (unread.length > 0) {
        const latest = unread[0];
        setNotification({
          type: latest.type || 'system',
          title: latest.title || '新通知',
          time: latest.createdAt,
        });
        resetTimer();
      }
    };

    fetchLatest();

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isAuthenticated, currentUser, resetTimer]);

  const handleDismiss = () => {
    setDismissed(true);
    setHidden(true);
    if (currentUser) {
      sessionStorage.setItem(`${DISMISSED_KEY}_${currentUser.id}`, '1');
    }
  };

  const handleMouseEnter = () => {
    setHidden(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleMouseLeave = () => {
    resetTimer();
  };

  if (!notification || dismissed) return null;

  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system;

  return (
    <div
      className={`login-notif-bar ${hidden ? 'hidden' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="login-notif-icon">{config.icon}</span>
      <div className="login-notif-content">
        <span className="login-notif-label">{config.label}</span>
        <span className="login-notif-title">{notification.title}</span>
      </div>
      <button className="login-notif-close" onClick={handleDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
