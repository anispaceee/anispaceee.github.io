import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { BangumiAuthService, GitHubAuthService, EmailAuthService } from '../../services/api';
import oauthConfig from '../../../oauth.config.js';
import { X, AlertCircle, Mail, User, Lock, Eye, EyeOff } from 'lucide-react';
import './AuthModal.css';

const BangumiIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const TABS = [
  { key: 'oauth', label: '快捷登录' },
  { key: 'login', label: '邮箱登录' },
  { key: 'register', label: '邮箱注册' },
];

export default function AuthModal() {
  const { showAuthModal, closeAuth, oauthLogin } = useApp();
  const [tab, setTab] = useState('oauth');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 邮箱登录表单
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // 注册表单
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Turnstile
  const turnstileRef = useRef(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileSiteKey = typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURNSTILE_SITE_KEY;

  // 加载 Turnstile 脚本
  useEffect(() => {
    if (!turnstileSiteKey) return;
    if (tab === 'oauth') return;
    const existing = document.querySelector('script[src*="turnstile"]');
    if (existing) {
      // 脚本已加载，重置 widget
      if (window.turnstile) {
        turnstileRef.current = window.turnstile.render('.cf-turnstile-container', {
          sitekey: turnstileSiteKey,
          callback: (token) => setTurnstileToken(token),
        });
      }
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.onload = () => {
      if (window.turnstile) {
        turnstileRef.current = window.turnstile.render('.cf-turnstile-container', {
          sitekey: turnstileSiteKey,
          callback: (token) => setTurnstileToken(token),
        });
      }
    };
    document.head.appendChild(script);
  }, [tab, turnstileSiteKey]);

  // 切换标签时重置
  const switchTab = (key) => {
    setTab(key);
    setError('');
    setTurnstileToken('');
    if (window.turnstile && turnstileRef.current !== null) {
      try { window.turnstile.reset(turnstileRef.current); } catch {}
    }
  };

  if (!showAuthModal) return null;

  const handleBangumiLogin = () => {
    setLoading(true);
    setError('');
    if (!oauthConfig.bangumi.clientId) {
      setError('Bangumi 登录未配置');
      setLoading(false);
      return;
    }
    try { BangumiAuthService.initiateLogin(); }
    catch { setError('无法跳转到 Bangumi 登录页面'); setLoading(false); }
  };

  const handleGithubLogin = () => {
    setLoading(true);
    setError('');
    if (!oauthConfig.github.clientId) {
      setError('GitHub 登录未配置');
      setLoading(false);
      return;
    }
    try { GitHubAuthService.initiateLogin(); }
    catch { setError('无法跳转到 GitHub 登录页面'); setLoading(false); }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!loginEmail || !loginPassword) { setError('请填写邮箱和密码'); return; }
    setLoading(true);
    const result = await EmailAuthService.login({ email: loginEmail, password: loginPassword, turnstileToken });
    if (result.error) { setError(result.error); setLoading(false); return; }
    oauthLogin(result);
    closeAuth();
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!regEmail || !regUsername || !regPassword) { setError('请填写所有字段'); return; }
    if (regPassword !== regConfirm) { setError('两次输入的密码不一致'); return; }
    if (regPassword.length < 8) { setError('密码至少8个字符'); return; }
    if (!/[a-zA-Z]/.test(regPassword) || !/\d/.test(regPassword)) { setError('密码需包含字母和数字'); return; }
    setLoading(true);
    const result = await EmailAuthService.register({ email: regEmail, username: regUsername, password: regPassword, turnstileToken });
    if (result.error) { setError(result.error); setLoading(false); return; }
    oauthLogin(result);
    closeAuth();
  };

  return (
    <div className="auth-overlay" onClick={closeAuth}>
      <div className="auth-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        <button className="auth-close" onClick={closeAuth}><X size={20} /></button>

        <div className="auth-header">
          <div className="auth-logo">✦</div>
          <h2>欢迎来到 ANISpace</h2>
        </div>

        <div className="auth-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`auth-tab ${tab === t.key ? 'active' : ''}`} onClick={() => switchTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="auth-error"><AlertCircle size={16} /> {error}</div>}

        {tab === 'oauth' && (
          <div className="auth-oauth-buttons">
            <button className="oauth-btn oauth-btn-bangumi" onClick={handleBangumiLogin} disabled={loading}>
              <BangumiIcon />
              <div className="oauth-btn-text">
                <span className="oauth-btn-title">使用 Bangumi 登录</span>
                <span className="oauth-btn-desc">同步追番记录和评分数据</span>
              </div>
              {loading && <span className="oauth-btn-spinner" />}
            </button>
            <button className="oauth-btn oauth-btn-github" onClick={handleGithubLogin} disabled={loading}>
              <GitHubIcon size={20} />
              <div className="oauth-btn-text">
                <span className="oauth-btn-title">使用 GitHub 登录</span>
                <span className="oauth-btn-desc">快速登录，适合开发者</span>
              </div>
              {loading && <span className="oauth-btn-spinner" />}
            </button>
          </div>
        )}

        {tab === 'login' && (
          <form className="auth-form" onSubmit={handleEmailLogin}>
            <div className="auth-field">
              <Mail size={16} />
              <input type="email" placeholder="邮箱" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="auth-field">
              <Lock size={16} />
              <input type={showLoginPassword ? 'text' : 'password'} placeholder="密码" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} autoComplete="current-password" />
              <button type="button" className="auth-field-toggle" onClick={() => setShowLoginPassword(!showLoginPassword)}>
                {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {turnstileSiteKey && <div className="cf-turnstile-container" />}
            <button type="submit" className="auth-submit" disabled={loading || (turnstileSiteKey && !turnstileToken)}>
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="auth-field">
              <Mail size={16} />
              <input type="email" placeholder="邮箱" value={regEmail} onChange={e => setRegEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="auth-field">
              <User size={16} />
              <input type="text" placeholder="用户名（2-20字符）" value={regUsername} onChange={e => setRegUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="auth-field">
              <Lock size={16} />
              <input type={showRegPassword ? 'text' : 'password'} placeholder="密码（8+字符，含字母和数字）" value={regPassword} onChange={e => setRegPassword(e.target.value)} autoComplete="new-password" />
              <button type="button" className="auth-field-toggle" onClick={() => setShowRegPassword(!showRegPassword)}>
                {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="auth-field">
              <Lock size={16} />
              <input type="password" placeholder="确认密码" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} autoComplete="new-password" />
            </div>
            {turnstileSiteKey && <div className="cf-turnstile-container" />}
            <button type="submit" className="auth-submit" disabled={loading || (turnstileSiteKey && !turnstileToken)}>
              {loading ? '注册中...' : '注册'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>登录即表示你同意我们的 <a href="#">用户协议</a> 和 <a href="#">隐私政策</a></p>
        </div>
      </div>
    </div>
  );
}
