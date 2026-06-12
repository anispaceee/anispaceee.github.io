import { useState, useEffect } from 'react';
import { Users, Loader2, Copy, Check, ExternalLink, Clock, Tag } from 'lucide-react';
import { AniBTService } from '../../services/api';
import './FansubGroups.css';

const RESOLUTION_COLORS = {
  '4K': '#a78bfa',
  '1080p': '#f09199',
  '720p': '#60a5fa',
  '480p': '#94a3b8',
};

const LANGUAGE_LABELS = {
  CHS: '简中',
  CHT: '繁中',
  JP: '日语',
  EN: '英语',
};

const SUBTITLE_LABELS = {
  EMBEDDED: '内嵌',
  EXTERNAL: '外挂',
  BUILT_IN: '内封',
  NONE: '无字幕',
};

export default function FansubGroupsPanel({ bgmId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedMagnet, setCopiedMagnet] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  useEffect(() => {
    if (!bgmId) return;
    loadData();
  }, [bgmId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await AniBTService.getAnimeGroups(bgmId);
      if (result?.ok && result?.data) {
        setData(result.data);
        // 默认展开第一个字幕组
        if (result.data.groups?.length > 0) {
          setExpandedGroups(new Set([result.data.groups[0].slug]));
        }
      } else {
        setError('暂无字幕组数据');
      }
    } catch {
      setError('获取字幕组数据失败');
    } finally {
      setLoading(false);
    }
  };

  const copyMagnet = async (magnet, releaseId) => {
    if (!magnet) return;
    try {
      await navigator.clipboard.writeText(magnet);
      setCopiedMagnet(releaseId);
      setTimeout(() => setCopiedMagnet(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = magnet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedMagnet(releaseId);
      setTimeout(() => setCopiedMagnet(null), 2000);
    }
  };

  const toggleGroup = (slug) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}分钟前`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}天前`;
    return d.toLocaleDateString('zh-CN');
  };

  if (loading) {
    return (
      <div className="fansub-loading">
        <Loader2 size={20} className="spinning" />
        <span>加载字幕组数据...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fansub-empty">
        <Users size={32} />
        <p>{error}</p>
        <button onClick={loadData}>重试</button>
      </div>
    );
  }

  const groups = data?.groups || [];

  if (groups.length === 0) {
    return (
      <div className="fansub-empty">
        <Users size={32} />
        <p>暂无字幕组发布此番剧</p>
        <a
          href={`https://anibt.net/api/anime/groups?bgmId=${bgmId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fansub-ext-link"
        >
          <ExternalLink size={12} /> 在 AniBT 查看
        </a>
      </div>
    );
  }

  return (
    <div className="fansub-groups">
      <div className="fansub-header">
        <h3><Users size={16} /> 字幕组资源</h3>
        <span className="fansub-count">{groups.length} 个字幕组</span>
        <a
          href={`https://anibt.net/api/anime/groups?bgmId=${bgmId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fansub-ext-link"
        >
          <ExternalLink size={12} /> AniBT
        </a>
      </div>

      <div className="fansub-group-list">
        {groups.map(group => {
          const isExpanded = expandedGroups.has(group.slug);
          return (
            <div key={group.slug} className={`fansub-group ${isExpanded ? 'expanded' : ''}`}>
              <div className="fansub-group-header" onClick={() => toggleGroup(group.slug)}>
                <div className="fansub-group-info">
                  <span className="fansub-group-name">{group.name}</span>
                  <span className="fansub-group-status">{group.status}</span>
                  {group.lastUpdatedAt && (
                    <span className="fansub-group-time">
                      <Clock size={10} /> {formatTime(group.lastUpdatedAt)}
                    </span>
                  )}
                </div>
                <span className="fansub-group-count">{group.items?.length || 0} 条</span>
              </div>

              {isExpanded && (
                <div className="fansub-release-list">
                  {group.items?.map((item, idx) => (
                    <div key={item.releaseId || idx} className="fansub-release">
                      <div className="fansub-release-main">
                        <span className="fansub-release-ep">
                          {item.episodeKey ? `第${item.episodeKey}话` : ''}
                        </span>
                        <span className="fansub-release-title">{item.title}</span>
                      </div>
                      <div className="fansub-release-tags">
                        {item.resolution && (
                          <span
                            className="fansub-tag resolution"
                            style={{ backgroundColor: RESOLUTION_COLORS[item.resolution] || '#94a3b8' }}
                          >
                            {item.resolution}
                          </span>
                        )}
                        {item.language?.map(lang => (
                          <span key={lang} className="fansub-tag language">{LANGUAGE_LABELS[lang] || lang}</span>
                        ))}
                        {item.subtitle && item.subtitle !== 'NONE' && (
                          <span className="fansub-tag subtitle">{SUBTITLE_LABELS[item.subtitle] || item.subtitle}</span>
                        )}
                      </div>
                      <div className="fansub-release-actions">
                        {item.magnet && (
                          <button
                            className={`fansub-copy-btn ${copiedMagnet === item.releaseId ? 'copied' : ''}`}
                            onClick={(e) => { e.stopPropagation(); copyMagnet(item.magnet, item.releaseId); }}
                            title="复制磁力链接"
                          >
                            {copiedMagnet === item.releaseId ? <Check size={12} /> : <Copy size={12} />}
                            {copiedMagnet === item.releaseId ? '已复制' : '磁力'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
