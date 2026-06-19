import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AuthService, NotificationService, MailService, StorageService, UserService, apiRequest } from '../services/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => AuthService.getCurrentUser());
  const [isAuthenticated, setIsAuthenticated] = useState(() => AuthService.isAuthenticated());
  const [notifications, setNotifications] = useState([]);
  const [mailUnreadCount, setMailUnreadCount] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [socialMode, setSocialMode] = useState(() => {
    const saved = StorageService.get('anispace_social_mode');
    return saved !== null ? saved : false; // 默认关闭社交（邀请制）
  });
  const [filterNsfw, setFilterNsfw] = useState(() => {
    const saved = StorageService.get('anispace_filter_nsfw');
    return saved !== null ? saved : true; // 默认开启屏蔽限制级
  });
  const [bangumiBound, setBangumiBound] = useState(false);

  // 登录时自动检查社交权限
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      // 管理员：保持 localStorage 中的选择（管理员可自由开关）
      if (currentUser.is_admin) return;
      // 普通用户：先重置为 false，再检查权限
      setSocialMode(false);
      StorageService.set('anispace_social_mode', false);
      apiRequest('/api/permissions/check?permission=social.post')
        .then(res => {
          if (res.has_permission) {
            setSocialMode(true);
            StorageService.set('anispace_social_mode', true);
          }
        })
        .catch(() => {});
      // 同步限制级过滤设置
      apiRequest('/api/users/' + currentUser.id + '/profile')
        .then(profile => {
          if (typeof profile.filter_nsfw === 'number') {
            setFilterNsfw(profile.filter_nsfw !== 0);
            StorageService.set('anispace_filter_nsfw', profile.filter_nsfw !== 0);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, currentUser]);

  useEffect(() => {
    if (currentUser) {
      NotificationService.getUnreadAsync(currentUser.id).then(unread => {
        setNotifications(Array.isArray(unread) ? unread : []);
      }).catch(() => {});
      MailService.getUnreadCountAsync(currentUser.id).then(data => {
        setMailUnreadCount(typeof data === 'object' ? (data.unread || 0) : (data || 0));
      }).catch(() => {});
      // 检查 Bangumi 绑定状态
      apiRequest('/api/auth/bangumi-status')
        .then(status => setBangumiBound(status.bound === true && !status.expired))
        .catch(() => setBangumiBound(false));
    } else {
      setBangumiBound(false);
    }
  }, [currentUser]);

  const oauthLogin = useCallback((user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setShowAuthModal(false);
  }, []);

  const logout = useCallback(() => {
    AuthService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    // 清除社交模式状态，防止切换账号后残留
    setSocialMode(false);
    StorageService.set('anispace_social_mode', false);
  }, []);

  const updateProfile = useCallback(async (updates) => {
    if (!currentUser) return;
    const result = await AuthService.updateProfile(currentUser.id, updates);
    if (result.user) setCurrentUser(result.user);
    return result;
  }, [currentUser]);

  const openAuth = useCallback(() => {
    setShowAuthModal(true);
  }, []);

  const closeAuth = useCallback(() => {
    setShowAuthModal(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const user = AuthService.getCurrentUser();
    if (user) setCurrentUser(user);
    // 检查 Bangumi 绑定状态
    try {
      const status = await apiRequest('/api/auth/bangumi-status');
      setBangumiBound(status.bound === true && !status.expired);
    } catch {
      setBangumiBound(false);
    }
  }, []);

  const toggleSocialMode = useCallback((val) => {
    const newVal = val !== undefined ? val : !socialMode;
    setSocialMode(newVal);
    StorageService.set('anispace_social_mode', newVal);
  }, [socialMode]);

  const toggleFilterNsfw = useCallback((val) => {
    const newVal = val !== undefined ? val : !filterNsfw;
    setFilterNsfw(newVal);
    StorageService.set('anispace_filter_nsfw', newVal);
    if (currentUser?.id) {
      UserService.updateSettings(currentUser.id, { filter_nsfw: newVal ? 1 : 0 }).catch(() => {});
    }
  }, [filterNsfw, currentUser?.id]);

  return (
    <AppContext.Provider value={{
      currentUser,
      isAuthenticated,
      notifications,
      mailUnreadCount,
      showAuthModal,
      socialMode,
      bangumiBound,
      setBangumiBound,
      oauthLogin,
      logout,
      updateProfile,
      openAuth,
      closeAuth,
      refreshUser,
      setNotifications,
      setMailUnreadCount,
      toggleSocialMode,
      filterNsfw,
      toggleFilterNsfw,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
