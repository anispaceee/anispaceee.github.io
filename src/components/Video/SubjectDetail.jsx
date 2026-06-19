import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, Play, ExternalLink, Users, ChevronRight, Loader2, MessageSquare } from 'lucide-react';
import { BangumiService } from '../../services/api';
import { mediaSourceManager } from '../../services/media/MediaSourceManager';
import MediaMatchList from './MediaMatchList';
import './SubjectDetail.css';

const FALLBACK_IMG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" fill="none">' +
  '<rect width="200" height="280" rx="8" fill="%23f0f0f0"/>' +
  '<text x="100" y="140" text-anchor="middle" fill="%23ccc" font-size="14">No Image</text>' +
  '</svg>'
);

const FALLBACK_AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="none">' +
  '<rect width="80" height="80" rx="40" fill="%23e0e0e0"/>' +
  '<text x="40" y="44" text-anchor="middle" fill="%23999" font-size="12">N/A</text>' +
  '</svg>'
);

function renderStars(score) {
  const full = Math.floor(score / 2);
  const half = score % 2 >= 1 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <span className="sd-stars">
      {Array.from({ length: full }, (_, i) => <Star key={`f${i}`} size={14} className="sd-star filled" />)}
      {half > 0 && <Star key="h" size={14} className="sd-star half" />}
      {Array.from({ length: empty }, (_, i) => <Star key={`e${i}`} size={14} className="sd-star empty" />)}
    </span>
  );
}

export default function SubjectDetail() {
  const { subjectId } = useParams();
  const navigate = useNavigate();

  const [subject, setSubject] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [persons, setPersons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [mediaMatches, setMediaMatches] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaErrors, setMediaErrors] = useState([]);
  const [showMagnetPanel, setShowMagnetPanel] = useState(false);
  const [allEpisodeMedia, setAllEpisodeMedia] = useState({});
  const [magnetPanelLoading, setMagnetPanelLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError('');
      try {
        // Fetch subject detail first (required)
        const sub = await BangumiService.getSubjectDetail(subjectId);
        if (cancelled) return;
        setSubject(sub);

        // Fetch supplementary data independently (each can fail gracefully)
        const [chars, pers, eps, cmts] = await Promise.all([
          BangumiService.getSubjectCharacters(subjectId).catch(() => []),
          BangumiService.getSubjectPersons(subjectId).catch(() => []),
          BangumiService.getSubjectEpisodes(subjectId).catch(() => []),
          BangumiService.getSubjectComments(subjectId, 20, 0).catch(() => ({ comments: [] })),
        ]);
        if (cancelled) return;
        setCharacters(Array.isArray(chars) ? chars : []);
        setPersons(Array.isArray(pers) ? pers : []);
        setEpisodes(Array.isArray(eps) ? eps : []);
        setComments(cmts.comments || []);
      } catch (err) {
        console.error('SubjectDetail fetch error:', err);
        if (!cancelled) setError(`获取条目信息失败: ${err.message || '未知错误'}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [subjectId]);

  const handleEpisodeClick = useCallback(async (ep) => {
    setSelectedEpisode(ep);
    setMediaLoading(true);
    setMediaMatches([]);
    setMediaErrors([]);

    const subjectNames = [];
    if (subject?.name_cn) subjectNames.push(subject.name_cn);
    if (subject?.name) subjectNames.push(subject.name);

    const request = {
      subjectId: String(subjectId),
      subjectNames,
      episodeSort: String(ep.sort || ep.episode_sort || ''),
      episodeName: ep.name || ep.name_cn || '',
    };

    try {
      const result = await mediaSourceManager.fetchAll(request);
      setMediaMatches(result.results || []);
      setMediaErrors(result.errors || []);
    } catch {
      setMediaMatches([]);
      setMediaErrors([{ sourceId: 'unknown', error: '资源查询失败' }]);
    } finally {
      setMediaLoading(false);
    }
  }, [subject, subjectId]);

  const handleWatchInSite = useCallback(async () => {
    if (episodes.length === 0) {
      navigate(`/video/play/${subjectId}/1`);
      return;
    }

    setShowMagnetPanel(true);
    setMagnetPanelLoading(true);
    setAllEpisodeMedia({});

    const subjectNames = [];
    if (subject?.name_cn) subjectNames.push(subject.name_cn);
    if (subject?.name) subjectNames.push(subject.name);

    const epsToSearch = episodes.slice(0, 5);
    const results = {};

    await Promise.all(epsToSearch.map(async (ep) => {
      const epSort = String(ep.sort || ep.episode_sort || '');
      const request = {
        subjectId: String(subjectId),
        subjectNames,
        episodeSort: epSort,
        episodeName: ep.name || ep.name_cn || '',
      };
      try {
        const result = await mediaSourceManager.fetchAll(request);
        results[epSort] = result.results || [];
      } catch {
        results[epSort] = [];
      }
    }));

    setAllEpisodeMedia(results);
    setMagnetPanelLoading(false);
  }, [episodes, subject, subjectId, navigate]);

  if (loading) {
    return (
      <div className="sd-loading">
        <Loader2 size={32} className="sd-spinning" />
        <p>正在加载条目信息...</p>
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="sd-error">
        <p>{error || '未找到该条目'}</p>
        <button onClick={() => navigate(-1)}>返回</button>
      </div>
    );
  }

  const displayName = subject.name_cn || subject.name;
  const score = subject.rating?.score || 0;
  const tags = Array.isArray(subject.tags)
    ? subject.tags.map(t => typeof t === 'string' ? t : t.name).filter(Boolean)
    : [];
  const coverUrl = subject.images?.large || subject.images?.common || FALLBACK_IMG;

  return (
    <div className="subject-detail">
      {/* Top Section: Cover + Info */}
      <div className="sd-top">
        <div className="sd-cover">
          <img
            src={coverUrl}
            alt={displayName}
            onError={e => { e.target.src = FALLBACK_IMG; }}
            loading="lazy"
          />
        </div>
        <div className="sd-info">
          <h1 className="sd-title">{displayName}</h1>
          {subject.name && subject.name_cn && subject.name !== subject.name_cn && (
            <p className="sd-original-name">{subject.name}</p>
          )}
          <div className="sd-rating">
            {renderStars(score)}
            <span className="sd-score">{score > 0 ? score.toFixed(1) : '暂无评分'}</span>
            {subject.rating?.total > 0 && (
              <span className="sd-rating-count">{subject.rating.total} 人评分</span>
            )}
          </div>
          <div className="sd-meta">
            {subject.type && (
              <span className="sd-meta-tag">{BangumiService.getTypeLabel(subject.type)}</span>
            )}
            {subject.air_date && <span className="sd-meta-tag">{subject.air_date}</span>}
            {subject.eps > 0 && <span className="sd-meta-tag">{subject.eps} 话</span>}
          </div>
          {tags.length > 0 && (
            <div className="sd-tags">
              {tags.slice(0, 10).map(tag => (
                <span key={tag} className="sd-tag-pill">{tag}</span>
              ))}
            </div>
          )}
          {subject.summary && (
            <p className="sd-summary">{subject.summary}</p>
          )}
          <div className="sd-actions">
            <button className="sd-watch-btn" onClick={handleWatchInSite}>
              <Play size={16} /> 站内观看
            </button>
            <a
              className="sd-bangumi-link"
              href={BangumiService.buildBangumiUrl(subjectId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} /> Bangumi主页
            </a>
          </div>
        </div>
      </div>

      {/* Magnet Link Panel */}
      {showMagnetPanel && (
        <section className="sd-section sd-magnet-panel">
          <div className="sd-magnet-panel-header">
            <h2 className="sd-section-title"><Play size={18} /> 站内资源</h2>
            <button className="sd-magnet-panel-close" onClick={() => setShowMagnetPanel(false)}>
              ✕
            </button>
          </div>
          {magnetPanelLoading && (
            <div className="sd-media-loading">
              <Loader2 size={24} className="sd-spinning" />
              <p>正在搜索资源...</p>
            </div>
          )}
          {!magnetPanelLoading && Object.entries(allEpisodeMedia).map(([epSort, matches]) => (
            <div key={epSort} className="sd-magnet-ep-group">
              <h3 className="sd-magnet-ep-title">第{epSort}话</h3>
              <MediaMatchList
                matches={matches}
                subjectId={subjectId}
                episodeId={epSort}
              />
            </div>
          ))}
          {!magnetPanelLoading && Object.keys(allEpisodeMedia).length === 0 && (
            <div className="mml-empty">未找到资源</div>
          )}
        </section>
      )}

      {/* Characters Section */}
      {characters.length > 0 && (
        <section className="sd-section">
          <h2 className="sd-section-title"><Users size={18} /> 角色</h2>
          <div className="sd-characters-scroll">
            {characters.map((c, idx) => {
              const charImg = c.images?.large || c.images?.medium || c.image || FALLBACK_IMG;
              const charName = c.name_cn || c.name || '';
              const actorName = c.actors?.[0]?.name_cn || c.actors?.[0]?.name || '';
              return (
                <div key={c.id || idx} className="sd-character-card">
                  <img
                    src={charImg}
                    alt={charName}
                    onError={e => { e.target.src = FALLBACK_IMG; }}
                    loading="lazy"
                  />
                  <span className="sd-char-name">{charName}</span>
                  {actorName && <span className="sd-actor-name">CV: {actorName}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Staff Section */}
      {persons.length > 0 && (
        <section className="sd-section">
          <h2 className="sd-section-title"><Users size={18} /> 制作人员</h2>
          <div className="sd-staff-grid">
            {persons.slice(0, 20).map((p, idx) => {
              const personImg = p.images?.large || p.images?.medium || p.image || FALLBACK_AVATAR;
              const personName = p.name_cn || p.name || '';
              const role = p.jobs?.[0] || p.career?.[0] || '';
              return (
                <div key={p.id || idx} className="sd-staff-card">
                  <img
                    src={personImg}
                    alt={personName}
                    onError={e => { e.target.src = FALLBACK_AVATAR; }}
                    loading="lazy"
                  />
                  <span className="sd-staff-name">{personName}</span>
                  {role && <span className="sd-staff-role">{role}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Episodes Section */}
      {episodes.length > 0 && (
        <section className="sd-section">
          <h2 className="sd-section-title"><Play size={18} /> 剧集列表</h2>
          <div className="sd-episode-list">
            {episodes.map((ep, idx) => {
              const epSort = ep.sort || ep.episode_sort || (idx + 1);
              const epName = ep.name_cn || ep.name || '';
              const isActive = selectedEpisode?.id === ep.id ||
                (selectedEpisode?.sort === epSort && selectedEpisode?.name === ep.name);
              return (
                <button
                  key={ep.id || idx}
                  className={`sd-episode-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleEpisodeClick(ep)}
                >
                  <span className="sd-ep-sort">{epSort}</span>
                  {epName && <span className="sd-ep-name">{epName}</span>}
                  <ChevronRight size={14} className="sd-ep-arrow" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Resource Results Section */}
      {(selectedEpisode || mediaLoading) && (
        <section className="sd-section sd-resource-section">
          <h2 className="sd-section-title">
            <Play size={18} /> 资源结果
            {selectedEpisode && (
              <span className="sd-resource-ep">
                — 第{selectedEpisode.sort || selectedEpisode.episode_sort || '?'}话
              </span>
            )}
          </h2>
          {mediaLoading && (
            <div className="sd-media-loading">
              <Loader2 size={24} className="sd-spinning" />
              <p>正在查询资源...</p>
            </div>
          )}
          {!mediaLoading && mediaErrors.length > 0 && (
            <div className="sd-media-errors">
              {mediaErrors.map((e, i) => (
                <span key={i} className="sd-media-error">{e.sourceId}: {e.error}</span>
              ))}
            </div>
          )}
          {!mediaLoading && (
            <MediaMatchList
              matches={mediaMatches}
              subjectId={subjectId}
              episodeId={String(selectedEpisode?.sort || selectedEpisode?.episode_sort || '')}
            />
          )}
        </section>
      )}

      {/* Comments Section */}
      {comments.length > 0 && (
        <section className="sd-section">
          <h2 className="sd-section-title"><MessageSquare size={18} /> 评论</h2>
          <div className="sd-comments-list">
            {comments.map((c, idx) => {
              const avatar = c.user?.avatar?.large || c.user?.avatar?.medium || FALLBACK_AVATAR;
              const userName = c.user?.nickname || c.user?.username || '匿名';
              return (
                <div key={c.id || idx} className="sd-comment">
                  <img
                    src={avatar}
                    alt={userName}
                    className="sd-comment-avatar"
                    onError={e => { e.target.src = FALLBACK_AVATAR; }}
                    loading="lazy"
                  />
                  <div className="sd-comment-body">
                    <div className="sd-comment-header">
                      <span className="sd-comment-name">{userName}</span>
                      {c.rating && (
                        <span className="sd-comment-rating">
                          <Star size={12} className="sd-star filled" /> {c.rating}
                        </span>
                      )}
                    </div>
                    <p className="sd-comment-text">{c.comment || c.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
