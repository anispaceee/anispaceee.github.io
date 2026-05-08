import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Mail, Lock, User, Eye, EyeOff, AlertCircle, Check } from 'lucide-react';
import './AuthModal.css';

export default function AuthModal() {
  const { showAuthModal, authModalTab, closeAuth, login, register, openAuth } = useApp();
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '', remember: false });
  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '', confirmPassword: '', agree: false });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  if (!showAuthModal) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!loginForm.identifier || !loginForm.password) {
      setError('请填写所有字段');
      return;
    }
    setLoading(true);
    const result = await login(loginForm.identifier, loginForm.password);
    setLoading(false);
    if (result.error) setError(result.error);
    else { setSuccess('登录成功！'); setTimeout(() => { closeAuth(); setSuccess(''); }, 800); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!registerForm.username || !registerForm.email || !registerForm.password) {
      setError('请填写所有字段');
      return;
    }
    if (registerForm.password.length < 6) {
      setError('密码至少6位');
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      setError('两次密码不一致');
      return;
    }
    if (!registerForm.agree) {
      setError('请同意用户协议');
      return;
    }
    setLoading(true);
    const result = await register({
      username: registerForm.username,
      email: registerForm.email,
      password: registerForm.password,
    });
    setLoading(false);
    if (result.error) setError(result.error);
    else { setSuccess('注册成功！'); setTimeout(() => { closeAuth(); setSuccess(''); }, 800); }
  };

  const switchTab = (tab) => {
    setError('');
    setSuccess('');
    openAuth(tab);
  };

  return (
    <div className="auth-overlay" onClick={closeAuth}>
      <div className="auth-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        <button className="auth-close" onClick={closeAuth}><X size={20} /></button>

        <div className="auth-header">
          <div className="auth-logo">✦</div>
          <h2>{authModalTab === 'login' ? '欢迎回来' : '加入我们'}</h2>
          <p>{authModalTab === 'login' ? '登录你的ACG社区账号' : '创建你的ACG社区账号'}</p>
        </div>

        {error && <div className="auth-error"><AlertCircle size={16} /> {error}</div>}
        {success && <div className="auth-success"><Check size={16} /> {success}</div>}

        {authModalTab === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="auth-field">
              <Mail size={16} />
              <input type="text" placeholder="邮箱或用户名" value={loginForm.identifier}
                onChange={e => setLoginForm({ ...loginForm, identifier: e.target.value })} />
            </div>
            <div className="auth-field">
              <Lock size={16} />
              <input type={showPassword ? 'text' : 'password'} placeholder="密码" value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
              <button type="button" className="auth-eye" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="auth-options">
              <label className="auth-remember">
                <input type="checkbox" checked={loginForm.remember}
                  onChange={e => setLoginForm({ ...loginForm, remember: e.target.checked })} />
                <span>记住我</span>
              </label>
              <button type="button" className="auth-forgot">忘记密码？</button>
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </button>
            <div className="auth-divider"><span>或</span></div>
            <div className="auth-third-party">
              <button type="button" className="third-party-btn qq">QQ</button>
              <button type="button" className="third-party-btn wechat">微信</button>
            </div>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="auth-field">
              <User size={16} />
              <input type="text" placeholder="用户名" value={registerForm.username}
                onChange={e => setRegisterForm({ ...registerForm, username: e.target.value })} />
            </div>
            <div className="auth-field">
              <Mail size={16} />
              <input type="email" placeholder="邮箱" value={registerForm.email}
                onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })} />
            </div>
            <div className="auth-field">
              <Lock size={16} />
              <input type={showPassword ? 'text' : 'password'} placeholder="密码（至少6位）" value={registerForm.password}
                onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })} />
              <button type="button" className="auth-eye" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="auth-field">
              <Lock size={16} />
              <input type="password" placeholder="确认密码" value={registerForm.confirmPassword}
                onChange={e => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })} />
            </div>
            <label className="auth-agree">
              <input type="checkbox" checked={registerForm.agree}
                onChange={e => setRegisterForm({ ...registerForm, agree: e.target.checked })} />
              <span>我已阅读并同意 <a href="#">用户协议</a> 和 <a href="#">隐私政策</a></span>
            </label>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? '注册中...' : '注册'}
            </button>
          </form>
        )}

        <div className="auth-switch">
          {authModalTab === 'login' ? (
            <span>还没有账号？<button onClick={() => switchTab('register')}>立即注册</button></span>
          ) : (
            <span>已有账号？<button onClick={() => switchTab('login')}>立即登录</button></span>
          )}
        </div>
      </div>
    </div>
  );
}
