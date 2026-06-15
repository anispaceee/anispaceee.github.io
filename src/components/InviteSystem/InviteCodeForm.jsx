import { useState } from 'react';
import { apiRequest } from '../../services/api';
import { CheckCircle, XCircle, Loader2, KeyRound } from 'lucide-react';

export function InviteCodeForm({ onSuccess, onClose }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('请输入邀请码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await apiRequest('/api/invites/claim', {
        method: 'POST',
        body: JSON.stringify({ code: code.toUpperCase().trim() })
      });

      setSuccess(true);
      setResult(response);

      if (onSuccess) {
        setTimeout(() => onSuccess(response), 2000);
      }
    } catch (err) {
      setError(err.message || '验证失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setCode(value);
    setError('');
  };

  if (success && result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <CheckCircle size={48} style={{ color: 'var(--success, #22c55e)', marginBottom: 16 }} />
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{result.message}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>您已获得以下权限:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
          {result.granted_permissions?.map((perm, index) => (
            <span key={index} style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 12,
              background: 'var(--primary-10, rgba(99,102,241,0.1))', color: 'var(--primary)',
            }}>
              {getPermissionName(perm)}
            </span>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600,
          }}
        >
          确定
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <KeyRound size={20} style={{ color: 'var(--primary)' }} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>输入邀请码</h3>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20, lineHeight: 1.5 }}>
        请输入您收到的邀请码，解锁发帖、评论、关注等社交功能
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text"
          value={code}
          onChange={handleCodeChange}
          placeholder="请输入8位邀请码"
          maxLength={8}
          disabled={loading}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
            color: 'var(--text-primary)', fontSize: 15, fontWeight: 600,
            letterSpacing: 3, outline: 'none', boxSizing: 'border-box',
            fontFamily: 'monospace',
          }}
          autoFocus
        />

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger, #ef4444)', fontSize: 13 }}>
            <XCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !code.trim()}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
            background: loading || !code.trim() ? 'var(--bg-tertiary)' : 'var(--primary)',
            color: loading || !code.trim() ? 'var(--text-quaternary)' : '#fff',
            fontSize: 14, fontWeight: 600, cursor: loading || !code.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
              验证中...
            </>
          ) : (
            '验证邀请码'
          )}
        </button>
      </form>

      <p style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 16, textAlign: 'center' }}>
        邀请码为8位大写字母和数字组合
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function getPermissionName(permission) {
  const names = {
    'social.post': '发帖',
    'social.comment': '评论',
    'social.follow': '关注',
    'social.message': '私信',
    'social.world': '世界频道',
    'invite.generate': '生成邀请码',
  };
  return names[permission] || permission;
}
