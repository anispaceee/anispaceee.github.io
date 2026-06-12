import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Search, LogOut, Menu, X, Mail } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import GlobalSearch from '../Common/GlobalSearch';
import './Header.css';

const navItems = [
  { path: '/', label: '首页' },
  { path: '/forum', label: '放課後' },
  { path: '/club', label: 'Tea Time！' },
  { path: '/news', label: '毒电波！！' },
  { path: '/wiki', label: '禁書目錄' },
  { path: '/musashi', label: '武藏也' },
];

export default function Header() {
  const { currentUser, isAuthenticated, logout, openAuth, notifications, mailUnreadCount } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowGlobalSearch(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="header-logo">
            <span className="logo-icon">✦</span>
            <span className="logo-text">ANISpace</span>
          </Link>

          <nav className={`header-nav ${mobileMenuOpen ? 'mobile-open' : ''}`}>
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path)) ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="nav-label">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="header-right">
            <button className="header-search-trigger" onClick={() => setShowGlobalSearch(true)}>
              <Search size={16} />
              <span className="header-search-placeholder">搜索...</span>
              <kbd className="header-search-kbd">⌘K</kbd>
            </button>

            {isAuthenticated ? (
              <div className="header-user-section">
                <Link to="/mailbox" className="header-icon-btn" title="D-Mail">
                  <Mail size={18} />
                  {mailUnreadCount > 0 && <span className="notification-dot">{mailUnreadCount}</span>}
                </Link>
                <Link to="/profile" className="header-user">
                  <img src={currentUser?.avatar} alt="" className="user-avatar" />
                  <span className="user-name">{currentUser?.name}</span>
                </Link>
                <button className="header-icon-btn logout-btn" onClick={logout} title="退出登录">
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <div className="header-auth-btns">
                <button className="auth-btn login-btn" onClick={() => openAuth()}>登录</button>
              </div>
            )}

            <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>
      {showGlobalSearch && <GlobalSearch onClose={() => setShowGlobalSearch(false)} />}
    </>
  );
}
