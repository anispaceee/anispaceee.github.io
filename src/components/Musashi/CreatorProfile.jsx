import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MusashiService } from '../../services/musashiApi';
import UserAvatar from '../Common/UserAvatar';
import {
  ArrowLeft, Image, BookOpen, Palette, Gamepad2,
  Eye, Heart, Bookmark, Loader2, User,
} from 'lucide-react';
import './CreatorProfile.css';

const TYPE_TABS = [
  { key: 'illustration', label: '插画', icon: Image },
  { key: 'novel', label: '小说', icon: BookOpen },
  { key: 'manga', label: '漫画', icon: Palette },
  { key: 'galgame', label: 'Galgame', icon: Gamepad2 },
];

export default function CreatorProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('illustration');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await MusashiService.getPortfolio(userId);
        if (!cancelled) {
          setProfile(data);
          // 自动切到有作品的tab
          const tabOrder = ['illustration', 'novel', 'manga', 'galgame'];
          for (const t of tabOrder) {
            if (data.portfolio?.[t]?.length > 0) {
              setActiveTab(t);
              break;
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="cp-page">
        <div className="cp-loading">
          <Loader2 size={32} className="cp-spinning" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="cp-page">
        <div className="cp-error">
          <p>{error || '创作者不存在'}</p>
          <Link to="/musashi">返回武藏也</Link>
        </div>
      </div>
    );
  }

  const { user, stats, portfolio } = profile;
  const currentWorks = portfolio?.[activeTab] || [];

  return (
    <div className="cp-page">
      <div className="cp-back">
        <Link to="/musashi">
          <ArrowLeft size={16} />
          返回武藏也
        </Link>
      </div>

      {/* 横幅 */}
      <div className="cp-banner">
        {user.banner_image ? (
          <img src={user.banner_image} alt="" className="cp-banner-img" />
        ) : (
          <div className="cp-banner-placeholder" />
        )}
      </div>

      {/* 创作者信息 */}
      <div className="cp-profile-header">
        <div className="cp-avatar-wrap">
          <UserAvatar
            userId={user.id}
            src={user.avatar}
            alt={user.name}
            size={72}
          />
        </div>
        <div className="cp-profile-info">
          <h1 className="cp-name">{user.name}</h1>
          {user.bio && <p className="cp-bio">{user.bio}</p>}
          <div className="cp-commission-status">
            {user.commission_status === 'open' ? (
              <span className="cp-comm-badge open">约稿开放中</span>
            ) : (
              <span className="cp-comm-badge closed">暂不接稿</span>
            )}
          </div>
        </div>
      </div>

      {/* 统计面板 */}
      <div className="cp-stats">
        <div className="cp-stat-item">
          <User size={16} />
          <span className="cp-stat-value">{stats.total_works}</span>
          <span className="cp-stat-label">作品</span>
        </div>
        <div className="cp-stat-item">
          <Eye size={16} />
          <span className="cp-stat-value">{stats.total_views?.toLocaleString() || 0}</span>
          <span className="cp-stat-label">浏览</span>
        </div>
        <div className="cp-stat-item">
          <Heart size={16} />
          <span className="cp-stat-value">{stats.total_likes?.toLocaleString() || 0}</span>
          <span className="cp-stat-label">赞</span>
        </div>
        <div className="cp-stat-item">
          <Bookmark size={16} />
          <span className="cp-stat-value">{stats.total_favorites?.toLocaleString() || 0}</span>
          <span className="cp-stat-label">收藏</span>
        </div>
      </div>

      {/* 作品集 Tab */}
      <div className="cp-tabs">
        {TYPE_TABS.map(tab => {
          const count = portfolio?.[tab.key]?.length || 0;
          return (
            <button
              key={tab.key}
              className={`cp-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <tab.icon size={14} />
              <span>{tab.label}</span>
              <span className="cp-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 作品画廊 */}
      <div className="cp-gallery">
        {currentWorks.length === 0 ? (
          <div className="cp-empty-tab">
            <p>暂无{activeTab === 'illustration' ? '插画' : activeTab === 'novel' ? '小说' : activeTab === 'manga' ? '漫画' : 'Galgame'}作品</p>
          </div>
        ) : (
          <div className="cp-gallery-grid">
            {currentWorks.map(work => (
              <div
                key={work.id}
                className="cp-work-card"
                onClick={() => navigate(`/musashi/${work.id}`)}
              >
                <div className="cp-work-cover">
                  {work.cover_image ? (
                    <img src={work.cover_image} alt={work.title} loading="lazy" />
                  ) : (
                    <div className="cp-work-cover-placeholder">
                      {(work.title || '?')[0]}
                    </div>
                  )}
                  <div className="cp-work-overlay">
                    <span className="cp-work-views">
                      <Eye size={12} /> {work.view_count || 0}
                    </span>
                    <span className="cp-work-likes">
                      <Heart size={12} /> {work.like_count || work.likes_count || 0}
                    </span>
                  </div>
                </div>
                <div className="cp-work-title">{work.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}