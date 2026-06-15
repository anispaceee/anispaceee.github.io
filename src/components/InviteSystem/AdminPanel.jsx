import { useState, useEffect } from 'react';
import { apiRequest } from '../../services/api';
import { Plus, X, Copy, Check, Clock, Users, Lock, RefreshCw } from 'lucide-react';

export function AdminPanel() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateData, setGenerateData] = useState({
    type: 'social',
    max_uses: 1,
    expires_days: 30,
    permissions: ['social.post', 'social.comment', 'social.follow', 'social.message', 'social.world']
  });
  const [copiedCode, setCopiedCode] = useState(null);
  const [message, setMessage] = useState('');

  const fetchInvites = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('/api/invites');
      setInvites(response);
    } catch (err) {
      console.error('获取邀请码列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleGenerate = async () => {
    setMessage('');
    try {
      const expires_at = generateData.expires_days 
        ? new Date(Date.now() + generateData.expires_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const response = await apiRequest('/api/invites', {
        method: 'POST',
        body: JSON.stringify({
          type: generateData.type,
          max_uses: generateData.max_uses,
          expires_at,
          permissions: generateData.permissions
        })
      });

      setMessage(`邀请码生成成功: ${response.code}`);
      setShowGenerateModal(false);
      fetchInvites();
    } catch (err) {
      setMessage('生成失败: ' + err.message);
    }
  };

  const handleRevoke = async (id, code) => {
    if (!confirm(`确定要撤销邀请码 ${code} 吗？`)) return;
    
    try {
      await apiRequest(`/api/invites/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'revoked' })
      });
      fetchInvites();
    } catch (err) {
      alert('撤销失败: ' + err.message);
    }
  };

  const copyToClipboard = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const permissionOptions = [
    { value: 'social.post', label: '发帖' },
    { value: 'social.comment', label: '评论' },
    { value: 'social.follow', label: '关注' },
    { value: 'social.message', label: '私信' },
    { value: 'social.world', label: '世界频道' },
    { value: 'invite.generate', label: '生成邀请码' },
  ];

  const statusColors = {
    active: 'bg-green-500',
    used: 'bg-gray-500',
    expired: 'bg-yellow-500',
    revoked: 'bg-red-500'
  };

  const statusLabels = {
    active: '有效',
    used: '已用完',
    expired: '已过期',
    revoked: '已撤销'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">邀请码管理</h2>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg text-white"
        >
          <Plus className="w-5 h-5" />
          生成邀请码
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('成功') ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
          {message}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">邀请码</th>
              <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">类型</th>
              <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">使用情况</th>
              <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">状态</th>
              <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">过期时间</th>
              <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">权限</th>
              <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  暂无邀请码，点击上方按钮生成
                </td>
              </tr>
            ) : (
              invites.map((invite) => (
                <tr key={invite.id} className="border-t border-gray-700">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-primary">{invite.code}</code>
                      <button
                        onClick={() => copyToClipboard(invite.code)}
                        className="p-1 hover:bg-gray-700 rounded"
                        title="复制"
                      >
                        {copiedCode === invite.code ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{invite.type}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-gray-300">
                      <Users className="w-4 h-4" />
                      {invite.used_count}/{invite.max_uses}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs text-white ${statusColors[invite.status]}`}>
                      {statusLabels[invite.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-gray-400 text-sm">
                      <Clock className="w-4 h-4" />
                      {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : '永久'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {JSON.parse(invite.permissions || '[]').map((perm, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs"
                        >
                          {permissionOptions.find(p => p.value === perm)?.label || perm}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {invite.status === 'active' && (
                      <button
                        onClick={() => handleRevoke(invite.id, invite.code)}
                        className="flex items-center gap-1 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-sm"
                      >
                        <X className="w-4 h-4" />
                        撤销
                      </button>
                    )}
                    {invite.status !== 'active' && (
                      <span className="flex items-center gap-1 text-gray-500 text-sm">
                        <Lock className="w-4 h-4" />
                        已锁定
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">生成邀请码</h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="p-1 hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">邀请类型</label>
                <select
                  value={generateData.type}
                  onChange={(e) => setGenerateData({ ...generateData, type: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  <option value="social">社交功能</option>
                  <option value="post">仅发帖</option>
                  <option value="comment">仅评论</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1">最大使用次数</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={generateData.max_uses}
                  onChange={(e) => setGenerateData({ ...generateData, max_uses: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-1">过期天数（留空为永久）</label>
                <input
                  type="number"
                  min="1"
                  value={generateData.expires_days}
                  onChange={(e) => setGenerateData({ ...generateData, expires_days: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">授予权限</label>
                <div className="grid grid-cols-2 gap-2">
                  {permissionOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${
                        generateData.permissions.includes(opt.value)
                          ? 'bg-primary/20 border border-primary'
                          : 'bg-gray-700 border border-gray-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={generateData.permissions.includes(opt.value)}
                        onChange={(e) => {
                          const newPermissions = e.target.checked
                            ? [...generateData.permissions, opt.value]
                            : generateData.permissions.filter(p => p !== opt.value);
                          setGenerateData({ ...generateData, permissions: newPermissions });
                        }}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-300">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
              >
                取消
              </button>
              <button
                onClick={handleGenerate}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg text-white flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
