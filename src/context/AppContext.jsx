import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AuthService, NotificationService } from '../services/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => AuthService.getCurrentUser());
  const [isAuthenticated, setIsAuthenticated] = useState(() => AuthService.isAuthenticated());
  const [notifications, setNotifications] = useState([]);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (currentUser) {
      NotificationService.getUnreadAsync(currentUser.id).then(unread => {
        setNotifications(Array.isArray(unread) ? unread : []);
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

  return (
    <AppContext.Provider value={{
      currentUser,
      isAuthenticated,
      notifications,
      showAuthModal,
      oauthLogin,
      logout,
      updateProfile,
      openAuth,
      closeAuth,
      refreshUser,
      setNotifications,
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
