import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BangumiAuthService, GitHubAuthService } from '../../services/api';
import oauthConfig from '../../../oauth.config.js';
import { X, AlertCircle } from 'lucide-react';
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

export default function AuthModal() {
  const { showAuthModal, closeAuth } = useApp();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(null);

  if (!showAuthModal) return null;

  const handleBangumiLogin = () => {
    setLoading('bangumi');
    setError('');
    if (!oauthConfig.bangumi.clientId) {
      setError('Bangumi 登录未配置，请在 .env 中设置 VITE_BANGUMI_CLIENT_ID');
      setLoading(null);
      return;
    }
    try {
      BangumiAuthService.initiateLogin();
    } catch (err) {
      setError('无法跳转到 Bangumi 登录页面');
      setLoading(null);
    }
  };

  const handleGithubLogin = () => {
    setLoading('github');
    setError('');
    if (!oauthConfig.github.clientId) {
      setError('GitHub 登录未配置，请在 .env 中设置 VITE_GITHUB_CLIENT_ID');
      setLoading(null);
      return;
    }
    try {
      GitHubAuthService.initiateLogin();
    } catch (err) {
      setError('无法跳转到 GitHub 登录页面');
      setLoading(null);
    }
  };

  return (
    <div className="auth-overlay" onClick={closeAuth}>
      <div className="auth-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        <button className="auth-close" onClick={closeAuth}><X size={20} /></button>

        <div className="auth-header">
          <div className="auth-logo">✦</div>
          <h2>欢迎来到 ANISpace</h2>
          <p>选择你的登录方式</p>
        </div>

        {error && <div className="auth-error"><AlertCircle size={16} /> {error}</div>}

        <div className="auth-oauth-buttons">
          <button
            className="oauth-btn oauth-btn-bangumi"
            onClick={handleBangumiLogin}
            disabled={loading !== null}
          >
            <BangumiIcon />
            <div className="oauth-btn-text">
              <span className="oauth-btn-title">使用 Bangumi 登录</span>
              <span className="oauth-btn-desc">同步追番记录和评分数据</span>
            </div>
            {loading === 'bangumi' && <span className="oauth-btn-spinner" />}
          </button>

          <button
            className="oauth-btn oauth-btn-github"
            onClick={handleGithubLogin}
            disabled={loading !== null}
          >
            <GitHubIcon size={20} />
            <div className="oauth-btn-text">
              <span className="oauth-btn-title">使用 GitHub 登录</span>
              <span className="oauth-btn-desc">快速登录，适合开发者</span>
            </div>
            {loading === 'github' && <span className="oauth-btn-spinner" />}
          </button>
        </div>

        <div className="auth-footer">
          <p>登录即表示你同意我们的 <a href="#">用户协议</a> 和 <a href="#">隐私政策</a></p>
        </div>
      </div>
    </div>
  );
}
