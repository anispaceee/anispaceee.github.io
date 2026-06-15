import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AuthService, NotificationService, MailService, StorageService } from '../services/api';

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

  useEffect(() => {
    if (currentUser) {
      NotificationService.getUnreadAsync(currentUser.id).then(unread => {
        setNotifications(Array.isArray(unread) ? unread : []);
      }).catch(() => {});
      MailService.getUnreadCountAsync(currentUser.id).then(data => {
        setMailUnreadCount(typeof data === 'object' ? (data.unread || 0) : (data || 0));
      }).catch(() => {});
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

  const refreshUser = useCallback(() => {
    const user = AuthService.getCurrentUser();
    if (user) setCurrentUser(user);
  }, []);

  const toggleSocialMode = useCallback((val) => {
    const newVal = val !== undefined ? val : !socialMode;
    setSocialMode(newVal);
    StorageService.set('anispace_social_mode', newVal);
  }, [socialMode]);

  return (
    <AppContext.Provider value={{
      currentUser,
      isAuthenticated,
      notifications,
      mailUnreadCount,
      showAuthModal,
      socialMode,
      oauthLogin,
      logout,
      updateProfile,
      openAuth,
      closeAuth,
      refreshUser,
      setNotifications,
      setMailUnreadCount,
      toggleSocialMode,
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
