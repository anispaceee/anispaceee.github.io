import { useState, useEffect } from 'react';
import { apiRequest } from '../../services/api';
import { Plus, Copy, Check, Clock, Users, Lock, RefreshCw, Trash2, KeyRound } from 'lucide-react';

const PERMISSION_OPTIONS = [
  { value: 'social.post', label: '发帖' },
  { value: 'social.comment', label: '评论' },
  { value: 'social.follow', label: '关注' },
  { value: 'social.message', label: '私信' },
  { value: 'social.world', label: '世界频道' },
];

const STATUS_MAP = {
  active: { label: '有效', color: 'var(--success, #22c55e)' },
  used: { label: '已用完', color: 'var(--text-quaternary, #6b7280)' },
  expired: { label: '已过期', color: 'var(--warning, #eab308)' },
  revoked: { label: '已撤销', color: 'var(--danger, #ef4444)' },
};

export function AdminPanel() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateData, setGenerateData] = useState({
    type: 'year',
    max_uses: 1,
    permissions: ['social.post', 'social.comment', 'social.follow', 'social.message', 'social.world']
  });
  const [copiedCode, setCopiedCode] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchInvites = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('/api/invites');
      // 后端返回数组
      setInvites(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('获取邀请码列表失败:', err);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvites(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await apiRequest('/api/invites', {
        method: 'POST',
        body: JSON.stringify({
          type: generateData.type,
          max_uses: generateData.max_uses,
          permissions: generateData.permissions
        })
      });

      showToast(`邀请码 ${response.code} 生成成功`);
      setShowGenerate(false);
      fetchInvites();
    } catch (err) {
      showToast('生成失败: ' + err.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id, code) => {
    try {
      await apiRequest(`/api/invites/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'revoked' })
      });
      showToast(`邀请码 ${code} 已撤销`);
      fetchInvites();
    } catch (err) {
      showToast('撤销失败: ' + err.message, 'error');
    }
  };

  const copyToClipboard = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const togglePermission = (perm) => {
    const newPerms = generateData.permissions.includes(perm)
      ? generateData.permissions.filter(p => p !== perm)
      : [...generateData.permissions, perm];
    setGenerateData({ ...generateData, permissions: newPerms });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300 }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.9)',
          color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'all 0.3s',
        }}>
          {toast.msg}
        </div>
      )}

      {/* 顶部操作栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={18} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>邀请码管理</span>
          <span style={{ fontSize: 12, color: 'var(--text-quaternary)', marginLeft: 4 }}>{invites.length} 个邀请码</span>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 600,
          }}
        >
          <Plus size={15} /> 生成邀请码
        </button>
      </div>

      {/* 列表区域 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {invites.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-quaternary)' }}>
            <KeyRound size={40} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 14 }}>暂无邀请码</span>
            <span style={{ fontSize: 12 }}>点击上方按钮生成第一个邀请码</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invites.map((invite) => {
              const statusInfo = STATUS_MAP[invite.status] || STATUS_MAP.active;
              const perms = JSON.parse(invite.permissions || '[]');
              return (
                <div key={invite.id} style={{
                  background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid var(--border-primary)', display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {/* 第一行：邀请码 + 状态 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{
                        fontFamily: 'monospace', fontSize: 16, fontWeight: 700, letterSpacing: 2,
                        color: 'var(--primary)', background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 6,
                      }}>
                        {invite.code}
                      </code>
                      <button
                        onClick={() => copyToClipboard(invite.code)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}
                        title="复制"
                      >
                        {copiedCode === invite.code
                          ? <Check size={14} style={{ color: 'var(--success, #22c55e)' }} />
                          : <Copy size={14} style={{ color: 'var(--text-quaternary)' }} />
                        }
                      </button>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      background: `${statusInfo.color}20`, color: statusInfo.color,
                    }}>
                      {statusInfo.label}
                    </span>
                  </div>
                  {/* 第二行：详情 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Users size={12} /> {invite.used_count}/{invite.max_uses}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : '永久'}
                    </span>
                    <span style={{ color: 'var(--text-quaternary)' }}>{invite.type === 'permanent' ? '永久' : invite.type === 'year' ? '1年' : invite.type}</span>
                  </div>
                  {/* 第三行：权限标签 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {perms.map((perm, i) => (
                      <span key={i} style={{
                        fontSize: 11, padding: '1px 6px', borderRadius: 4,
                        background: 'var(--primary-10, rgba(99,102,241,0.1))', color: 'var(--primary)',
                      }}>
                        {PERMISSION_OPTIONS.find(p => p.value === perm)?.label || perm}
                      </span>
                    ))}
                  </div>
                  {/* 操作 */}
                  {invite.status === 'active' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                      <button
                        onClick={() => handleRevoke(invite.id, invite.code)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: 'rgba(239,68,68,0.1)', color: 'var(--danger, #ef4444)', fontSize: 12,
                        }}
                      >
                        <Trash2 size={12} /> 撤销
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 生成邀请码面板 */}
      {showGenerate && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowGenerate(false)}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 12, width: 340, maxWidth: '90%',
            border: '1px solid var(--border-primary)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }} onClick={e => e.stopPropagation()}>
            {/* 标题 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '1px solid var(--border-primary)',
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>生成邀请码</span>
              <button onClick={() => setShowGenerate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-quaternary)', fontSize: 18 }}>&times;</button>
            </div>
            {/* 表单 */}
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>有效期类型</label>
                <select
                  value={generateData.type}
                  onChange={(e) => setGenerateData({ ...generateData, type: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)',
                    background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                  }}
                >
                  <option value="year">1年有效期</option>
                  <option value="permanent">永久有效</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>最大使用次数</label>
                <input
                  type="number" min="1" max="100"
                  value={generateData.max_uses}
                  onChange={(e) => setGenerateData({ ...generateData, max_uses: parseInt(e.target.value) || 1 })}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)',
                    background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>授予权限</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PERMISSION_OPTIONS.map((opt) => {
                    const active = generateData.permissions.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => togglePermission(opt.value)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          border: `1px solid ${active ? 'var(--primary)' : 'var(--border-primary)'}`,
                          background: active ? 'var(--primary-10, rgba(99,102,241,0.1))' : 'var(--bg-secondary)',
                          color: active ? 'var(--primary)' : 'var(--text-tertiary)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* 按钮 */}
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px' }}>
              <button
                onClick={() => setShowGenerate(false)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--border-primary)',
                  background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                  background: generating ? 'var(--bg-tertiary)' : 'var(--primary)',
                  color: generating ? 'var(--text-quaternary)' : '#fff',
                  fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <RefreshCw size={14} style={{ animation: generating ? 'spin 0.8s linear infinite' : 'none' }} />
                {generating ? '生成中...' : '生成'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
