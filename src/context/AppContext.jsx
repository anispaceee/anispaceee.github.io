import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AuthService, NotificationService } from '../services/api';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => AuthService.getCurrentUser());
  const [isAuthenticated, setIsAuthenticated] = useState(() => AuthService.isAuthenticated());
  const [notifications, setNotifications] = useState([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('login');

  useEffect(() => {
    if (currentUser) {
      const unread = NotificationService.getUnread(currentUser.id);
      setNotifications(unread);
    }
  }, [currentUser]);

  const login = useCallback(async (identifier, password) => {
    const result = AuthService.login(identifier, password);
    if (result.error) return result;
    setCurrentUser(result.user);
    setIsAuthenticated(true);
    return result;
  }, []);

  const register = useCallback(async (data) => {
    const result = AuthService.register(data);
    if (result.error) return result;
    setCurrentUser(result.user);
    setIsAuthenticated(true);
    return result;
  }, []);

  const logout = useCallback(() => {
    AuthService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
  }, []);

  const updateProfile = useCallback((updates) => {
    if (!currentUser) return;
    const result = AuthService.updateProfile(currentUser.id, updates);
    if (result.user) setCurrentUser(result.user);
    return result;
  }, [currentUser]);

  const openAuth = useCallback((tab = 'login') => {
    setAuthModalTab(tab);
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
      authModalTab,
      login,
      register,
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
