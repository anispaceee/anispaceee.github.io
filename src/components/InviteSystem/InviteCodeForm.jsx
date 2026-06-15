import { useState } from 'react';
import { apiRequest } from '../../services/api';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

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

  if (success && result) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">{result.message}</h3>
        <p className="text-gray-400 text-sm mb-4">
          您已获得以下权限:
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {result.granted_permissions?.map((perm, index) => (
            <span
              key={index}
              className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm"
            >
              {getPermissionName(perm)}
            </span>
          ))}
        </div>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-primary hover:bg-primary/80 rounded-lg text-white"
        >
          确定
        </button>
      </div>
    );
  }

  const handleCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setCode(value);
    setError('');
  };

  return (
    <div className="p-6">
      <h3 className="text-xl font-bold text-white mb-4">输入邀请码解锁社交功能</h3>
      <p className="text-gray-400 text-sm mb-6">
        请输入您收到的邀请码，解锁发帖、评论、关注等社交功能
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            value={code}
            onChange={handleCodeChange}
            placeholder="请输入8位邀请码"
            maxLength={8}
            disabled={loading}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary disabled:opacity-50"
          />
        </div>
        
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <XCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
        
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full px-4 py-3 bg-primary hover:bg-primary/80 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-medium flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              验证中...
            </>
          ) : (
            '验证邀请码'
          )}
        </button>
      </form>
      
      <p className="text-gray-500 text-xs mt-4 text-center">
        邀请码区分大小写，请勿分享您的邀请码
      </p>
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
