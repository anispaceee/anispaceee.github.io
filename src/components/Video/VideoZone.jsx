import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Settings, Plus, Trash2, Film, Loader2, X, Server } from 'lucide-react';
import { VideoSourceService } from '../../services/videoSource';
import { useApp } from '../../context/AppContext';
import './VideoZone.css';

const FALLBACK_IMG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="112" fill="none">' +
  '<rect width="200" height="112" rx="8" fill="%23f0f0f0"/>' +
  '<text x="100" y="60" text-anchor="middle" fill="%23ccc" font-size="14">No Image</text>' +
  '</svg>'
);

export default function VideoZone() {
  const navigate = useNavigate();
  const { openAuth } = useApp();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [showSourceManager, setShowSourceManager] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [sourcesVersion, setSourcesVersion] = useState(0);

  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await VideoSourceService.searchAll(keyword.trim());
      setResults(data.groups);
      setFailedCount(data.failedCount);
    } catch (err) {
      setResults([]);
      setFailedCount(0);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleAddSource = () => {
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    VideoSourceService.addSource({ name: newSourceName.trim(), baseUrl: newSourceUrl.trim() });
    setNewSourceName('');
    setNewSourceUrl('');
    setSourcesVersion(v => v + 1);
  };

  const handleToggleSource = (id) => {
    VideoSourceService.toggleSource(id);
    setSourcesVersion(v => v + 1);
  };

  const handleRemoveSource = (id) => {
    VideoSourceService.removeSource(id);
    setSourcesVersion(v => v + 1);
  };

  const sources = VideoSourceService.getSources();

  return (
    <div className="video-zone">
      <div className="vz-header">
        <h1>影视区</h1>
        <p className="vz-desc">聚合多源搜索，一键播放</p>
      </div>

      <div className="vz-search-bar">
        <div className="vz-search-input-wrap">
          <Search size={18} className="vz-search-icon" />
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索番剧、电影、动漫..."
            className="vz-search-input"
          />
          {keyword && <button className="vz-clear-btn" onClick={() => { setKeyword(''); setResults([]); setSearched(false); }}><X size={16} /></button>}
        </div>
        <button className="vz-search-btn" onClick={handleSearch} disabled={loading || !keyword.trim()}>
          {loading ? <Loader2 size={18} className="vz-spinning" /> : '搜索'}
        </button>
        <button className="vz-source-btn" onClick={() => setShowSourceManager(true)} title="源管理">
          <Settings size={16} /> 源管理
        </button>
      </div>

      {/* Results */}
      <div className="vz-results">
        {!searched && !loading && (
          <div className="vz-empty">
            <Film size={48} />
            <p>输入关键词搜索影视资源</p>
          </div>
        )}

        {loading && (
          <div className="vz-loading">
            <Loader2 size={32} className="vz-spinning" />
            <p>正在搜索多个影源...</p>
          </div>
        )}

        {!loading && searched && failedCount > 0 && (
          <div className="vz-failed-hint">
            <span>{failedCount} 个影源请求失败，已显示成功的源结果</span>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="vz-empty">
            <p>未找到相关资源，试试其他关键词</p>
          </div>
        )}

        {!loading && results.map(group => (
          <div key={group.sourceId} className="vz-source-group">
            <div className="vz-source-header">
              <Server size={14} />
              <span className="vz-source-name">{group.sourceName}</span>
              <span className="vz-source-count">{group.results.length} 个结果</span>
              {group.error && <span className="vz-source-error">（请求失败）</span>}
            </div>
            <div className="vz-grid">
              {group.results.map(item => (
                <div key={`${group.sourceId}-${item.vodId}`} className="vz-card" onClick={() => navigate(`/video/${group.sourceId}/${item.vodId}`)}>
                  <div className="vz-card-cover">
                    <img src={item.cover || FALLBACK_IMG} alt={item.title} onError={e => { e.target.src = FALLBACK_IMG; }} loading="lazy" />
                    {item.remarks && <span className="vz-card-remarks">{item.remarks}</span>}
                  </div>
                  <div className="vz-card-info">
                    <h3 className="vz-card-title">{item.title}</h3>
                    <div className="vz-card-meta">
                      {item.year && <span>{item.year}</span>}
                      {item.area && <span>{item.area}</span>}
                      {item.category && <span>{item.category}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Source Manager Modal */}
      {showSourceManager && (
        <div className="vz-modal-overlay" onClick={() => setShowSourceManager(false)}>
          <div className="vz-modal" onClick={e => e.stopPropagation()}>
            <div className="vz-modal-header">
              <h2>影源管理</h2>
              <button onClick={() => setShowSourceManager(false)}><X size={20} /></button>
            </div>
            <div className="vz-modal-body">
              {sources.map(s => (
                <div key={s.id} className="vz-source-item">
                  <div className="vz-source-item-info">
                    <span className="vz-source-item-name">{s.name}</span>
                    <span className="vz-source-item-url">{s.baseUrl}</span>
                  </div>
                  <div className="vz-source-item-actions">
                    <button
                      className={`vz-toggle-btn ${s.enabled !== false && !VideoSourceService._isDefaultDisabled(s.id) ? 'active' : ''}`}
                      onClick={() => handleToggleSource(s.id)}
                    >
                      {s.enabled !== false && !VideoSourceService._isDefaultDisabled(s.id) ? '已启用' : '已禁用'}
                    </button>
                    {s.id.startsWith('custom_') && (
                      <button className="vz-delete-btn" onClick={() => handleRemoveSource(s.id)}><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              ))}
              <div className="vz-add-source">
                <h3>添加自定义源</h3>
                <input type="text" placeholder="源名称" value={newSourceName} onChange={e => setNewSourceName(e.target.value)} />
                <input type="text" placeholder="API 地址（如 https://example.com）" value={newSourceUrl} onChange={e => setNewSourceUrl(e.target.value)} />
                <button className="vz-add-btn" onClick={handleAddSource} disabled={!newSourceName.trim() || !newSourceUrl.trim()}>
                  <Plus size={14} /> 添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
