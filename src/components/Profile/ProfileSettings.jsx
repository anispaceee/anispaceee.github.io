import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { UserService } from '../../services/api';
import { X, Shield, MessageSquare, Database } from 'lucide-react';
import './ProfileSettings.css';

export default function ProfileSettings({ onClose }) {
  const { currentUser } = useApp();
  const [settings, setSettings] = useState({
    allow_profile_view: true,
    allow_comments_public: true,
    auto_enrich: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentUser) {
      UserService.getProfile(currentUser.id).then(profile => {
        setSettings({
          allow_profile_view: profile.allow_profile_view ?? true,
          allow_comments_public: profile.allow_comments_public ?? true,
          auto_enrich: profile.auto_enrich ?? true,
        });
      }).catch(() => {});
    }
  }, [currentUser]);

  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    try {
      await UserService.updateSettings(currentUser.id, settings);
      onClose();
    } catch {} finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-settings-overlay" onClick={onClose}>
      <div className="profile-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="profile-settings-header">
          <h2>设置</h2>
          <button className="profile-settings-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="profile-settings-body">
          <div className="profile-settings-item">
            <div className="profile-settings-info">
              <Shield size={16} />
              <div>
                <div className="profile-settings-label">允许其他人查看主页</div>
                <div className="profile-settings-desc">关闭后，其他用户点击你的头像将看到隐私提示</div>
              </div>
            </div>
            <label className="profile-settings-toggle">
              <input type="checkbox" checked={settings.allow_profile_view} onChange={e => setSettings(s => ({ ...s, allow_profile_view: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="profile-settings-item">
            <div className="profile-settings-info">
              <MessageSquare size={16} />
              <div>
                <div className="profile-settings-label">公开我的评论</div>
                <div className="profile-settings-desc">关闭后，其他用户无法在你的主页看到你的条目评论</div>
              </div>
            </div>
            <label className="profile-settings-toggle">
              <input type="checkbox" checked={settings.allow_comments_public} onChange={e => setSettings(s => ({ ...s, allow_comments_public: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="profile-settings-item">
            <div className="profile-settings-info">
              <Database size={16} />
              <div>
                <div className="profile-settings-label">标记时自动收录条目</div>
                <div className="profile-settings-desc">开启后，标记条目时自动将完整数据存入后端数据库，提升后续搜索和加载速度</div>
              </div>
            </div>
            <label className="profile-settings-toggle">
              <input type="checkbox" checked={settings.auto_enrich} onChange={e => setSettings(s => ({ ...s, auto_enrich: e.target.checked }))} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
        <div className="profile-settings-footer">
          <button className="profile-settings-cancel" onClick={onClose}>取消</button>
          <button className="profile-settings-save" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
