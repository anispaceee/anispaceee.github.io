import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BangumiAuthService, GitHubAuthService } from '../services/api';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import './OAuthCallback.css';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { oauthLogin } = useApp();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const error = params.get('error');
    const state = params.get('state');

    // Determine provider from path
    const provider = location.pathname.includes('github') ? 'github' : 'bangumi';

    // H-1: 验证 OAuth state 参数，防止 CSRF 登录劫持
    const storedState = sessionStorage.getItem(`oauth_state_${provider}`);
    if (storedState) {
      sessionStorage.removeItem(`oauth_state_${provider}`);
      if (storedState !== state) {
        setStatus('error');
        setErrorMsg('安全验证失败，请重新登录');
        return;
      }
    }
    // 兼容旧流程：没有 state 也允许通过（向后兼容无 state 的旧请求）
    // 生产环境上线一段时日后可移除兼容逻辑，改为强制校验

    if (error) {
      setStatus('error');
      setErrorMsg(params.get('error_description') || '授权被拒绝');
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMsg('未收到授权码');
      return;
    }

    // Determine provider from path (moved up for state check)
    // const provider already defined above

    const handleOAuth = async () => {
      try {
        let result;
        if (provider === 'github') {
          result = await GitHubAuthService.loginWithGitHub(code);
        } else {
          result = await BangumiAuthService.loginWithBangumi(code);
        }

        if (result.error) {
          setStatus('error');
          setErrorMsg(result.error);
        } else {
          setStatus('success');
          oauthLogin(result.user);
          setTimeout(() => navigate('/', { replace: true }), 1000);
        }
      } catch (err) {
        setStatus('error');
        setErrorMsg(err.message || '登录失败，请重试');
      }
    };

    handleOAuth();
  }, [location, oauthLogin, navigate]);

  return (
    <div className="oauth-callback-page">
      <div className="oauth-callback-card glass-modal">
        {status === 'loading' && (
          <>
            <Loader2 size={48} className="oauth-spinning" />
            <h2>正在登录...</h2>
            <p>请稍候，正在验证你的授权信息</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={48} className="oauth-success-icon" />
            <h2>登录成功！</h2>
            <p>正在跳转到首页...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={48} className="oauth-error-icon" />
            <h2>登录失败</h2>
            <p className="oauth-error-msg">{errorMsg}</p>
            <button className="oauth-retry-btn" onClick={() => navigate('/')}>返回首页</button>
          </>
        )}
      </div>
    </div>
  );
}
