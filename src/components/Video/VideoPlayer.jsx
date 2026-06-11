import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import DPlayer from 'dplayer';
import Hls from 'hls.js';
import { BangumiService } from '../../services/api';
import { mediaSourceManager } from '../../services/media/MediaSourceManager';
import { ArrowLeft, Play, Server, ChevronLeft, ChevronRight, Loader2, List, Layers } from 'lucide-react';
import './VideoPlayer.css';

export default function VideoPlayer() {
  const { subjectId, episodeId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sourceId = searchParams.get('sourceId') || '';
  const mediaId = searchParams.get('mediaId') || '';

  const [subject, setSubject] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [mediaMatches, setMediaMatches] = useState([]);
  const [currentMedia, setCurrentMedia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playError, setPlayError] = useState('');
  const [showEpList, setShowEpList] = useState(false);
  const [showSourceList, setShowSourceList] = useState(false);

  const playerRef = useRef(null);
  const playerContainerRef = useRef(null);
  const hlsRef = useRef(null);
  const coverRef = useRef('');

  // Fetch subject detail, episodes, and media matches
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError('');
      setCurrentMedia(null);
      setMediaMatches([]);

      try {
        // 1. Fetch subject detail
        const sub = await BangumiService.getSubjectDetail(subjectId);
        if (cancelled) return;
        setSubject(sub);
        coverRef.current = sub?.images?.large || sub?.images?.common || '';

        // 2. Fetch episodes
        const eps = await BangumiService.getSubjectEpisodes(subjectId).catch(() => []);
        if (cancelled) return;
        setEpisodes(Array.isArray(eps) ? eps : []);

        // 3. Build MediaFetchRequest
        const subjectNames = [];
        if (sub?.name) subjectNames.push(sub.name);
        if (sub?.name_cn) subjectNames.push(sub.name_cn);

        const request = {
          subjectId: String(subjectId),
          subjectNames,
          episodeSort: String(episodeId || ''),
          episodeName: '',
        };

        // Find the current episode to get its name
        const currentEp = Array.isArray(eps)
          ? eps.find(ep => String(ep.sort || ep.episode_sort) === String(episodeId))
          : null;
        if (currentEp) {
          request.episodeName = currentEp.name_cn || currentEp.name || '';
        }

        // 4. Call mediaSourceManager.fetchAll
        const result = await mediaSourceManager.fetchAll(request);
        if (cancelled) return;
        setMediaMatches(result.results || []);

        // 5. Find the specific media by sourceId + mediaId from query params
        const matches = result.results || [];
        if (sourceId && mediaId) {
          const found = matches.find(
            m => m.media.sourceId === sourceId && m.media.mediaId === mediaId
          );
          if (found) {
            setCurrentMedia(found.media);
          } else if (matches.length > 0) {
            // Fallback to first match with same sourceId
            const sameSource = matches.find(m => m.media.sourceId === sourceId);
            setCurrentMedia((sameSource || matches[0]).media);
          }
        } else if (matches.length > 0) {
          // No specific source/media specified, use first match
          setCurrentMedia(matches[0].media);
        }
      } catch (err) {
        if (!cancelled) setError('获取视频信息失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [subjectId, episodeId, sourceId, mediaId]);

  // Initialize DPlayer when currentMedia changes
  useEffect(() => {
    if (!currentMedia?.download?.url || !playerContainerRef.current) return;

    const url = currentMedia.download.url;
    setPlayError('');

    // Destroy old player and HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    const isM3U8 = /\.m3u8(\?|$)/i.test(url);

    const dp = new DPlayer({
      container: playerContainerRef.current,
      video: {
        url,
        type: isM3U8 ? 'hls' : 'auto',
        customType: isM3U8 ? {
          hls: (video, src) => {
            if (Hls.isSupported()) {
              const hls = new Hls();
              hls.loadSource(src);
              hls.attachMedia(video);
              hlsRef.current = hls;
              hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                  setPlayError('视频加载失败，请尝试切换播放源或剧集');
                }
              });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = src;
            }
          },
        } : undefined,
        pic: coverRef.current,
      },
      autoplay: true,
      theme: '#fb7299',
      screenshot: true,
      hotkey: true,
      preload: 'auto',
      volume: 0.7,
    });

    // Listen for DPlayer error events
    dp.on('error', () => {
      setPlayError('视频播放失败，请尝试切换播放源或剧集');
    });

    // Save playback progress
    const progressKey = `acg_v2_progress_${subjectId}_${episodeId}_${currentMedia?.sourceId}`;
    dp.on('timeupdate', () => {
      const currentTime = dp.video.currentTime;
      const duration = dp.video.duration;
      if (duration > 0 && currentTime > 5) {
        localStorage.setItem(progressKey, JSON.stringify({
          time: currentTime,
          duration,
          updatedAt: Date.now(),
        }));
      }
    });

    // Restore playback progress
    dp.on('loadedmetadata', () => {
      try {
        const saved = JSON.parse(localStorage.getItem(progressKey));
        if (saved?.time && saved?.duration) {
          const ratio = saved.time / saved.duration;
          if (ratio > 0.05 && ratio < 0.95) {
            dp.seek(saved.time);
          }
        }
      } catch {}
    });

    playerRef.current = dp;

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [currentMedia, subjectId, episodeId]);

  // Group media matches by sourceId
  const sourceGroups = useMemo(() => {
    const map = new Map();
    for (const match of mediaMatches) {
      const sid = match.media.sourceId;
      if (!map.has(sid)) {
        const source = mediaSourceManager.getSource(sid);
        const displayName = source?.info?.displayName || sid;
        map.set(sid, { sourceId: sid, displayName, matches: [] });
      }
      map.get(sid).matches.push(match);
    }
    return Array.from(map.values());
  }, [mediaMatches]);

  // Current episode info
  const currentEpisode = useMemo(() => {
    return episodes.find(
      ep => String(ep.sort || ep.episode_sort) === String(episodeId)
    );
  }, [episodes, episodeId]);

  // Current source display name
  const currentSourceName = useMemo(() => {
    if (!currentMedia?.sourceId) return '';
    const source = mediaSourceManager.getSource(currentMedia.sourceId);
    return source?.info?.displayName || currentMedia.sourceId;
  }, [currentMedia]);

  // Episode switch: navigate to new URL
  const handleEpisodeSwitch = useCallback((ep) => {
    const epSort = ep.sort || ep.episode_sort;
    const sid = currentMedia?.sourceId || sourceId;
    navigate(`/video/play/${subjectId}/${epSort}?sourceId=${sid}`);
    setShowEpList(false);
  }, [navigate, subjectId, currentMedia, sourceId]);

  // Source switch: update currentMedia directly
  const handleSourceSwitch = useCallback((match) => {
    setCurrentMedia(match.media);
    setShowSourceList(false);
  }, []);

  // Previous / Next episode
  const handlePrevEpisode = useCallback(() => {
    if (!currentEpisode) return;
    const idx = episodes.findIndex(
      ep => String(ep.sort || ep.episode_sort) === String(episodeId)
    );
    if (idx > 0) {
      handleEpisodeSwitch(episodes[idx - 1]);
    }
  }, [episodes, currentEpisode, episodeId, handleEpisodeSwitch]);

  const handleNextEpisode = useCallback(() => {
    if (!currentEpisode) return;
    const idx = episodes.findIndex(
      ep => String(ep.sort || ep.episode_sort) === String(episodeId)
    );
    if (idx < episodes.length - 1) {
      handleEpisodeSwitch(episodes[idx + 1]);
    }
  }, [episodes, currentEpisode, episodeId, handleEpisodeSwitch]);

  const currentEpIdx = episodes.findIndex(
    ep => String(ep.sort || ep.episode_sort) === String(episodeId)
  );

  // Loading state
  if (loading) {
    return (
      <div className="vp-loading">
        <Loader2 size={32} className="vp-spinning" />
        <p>正在加载视频信息...</p>
      </div>
    );
  }

  // Error state
  if (error || !subject) {
    return (
      <div className="vp-error">
        <p>{error || '未找到该条目'}</p>
        <button onClick={() => navigate(-1)}>返回</button>
      </div>
    );
  }

  const displayName = subject.name_cn || subject.name;

  return (
    <div className={`video-player ${showEpList ? 'vp-sidebar-open' : ''} ${showSourceList ? 'vp-source-sidebar-open' : ''}`}>
      {/* Header */}
      <div className="vp-header">
        <button className="vp-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> 返回
        </button>
        <h1 className="vp-title">{displayName}</h1>
        <div className="vp-header-actions">
          <button
            className={`vp-toggle-btn ${showEpList ? 'active' : ''}`}
            onClick={() => { setShowEpList(!showEpList); setShowSourceList(false); }}
            title="剧集列表"
          >
            <List size={16} />
            <span>剧集</span>
          </button>
          <button
            className={`vp-toggle-btn ${showSourceList ? 'active' : ''}`}
            onClick={() => { setShowSourceList(!showSourceList); setShowEpList(false); }}
            title="资源切换"
          >
            <Layers size={16} />
            <span>资源</span>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="vp-main">
        <div className="vp-content">
          {/* Player */}
          <div className="vp-player-wrap">
            <div ref={playerContainerRef} className="vp-player" />
            {playError && (
              <div className="vp-play-error">
                <p>{playError}</p>
                <button onClick={() => setPlayError('')}>关闭</button>
              </div>
            )}
            {!currentMedia?.download?.url && !loading && (
              <div className="vp-play-error">
                <p>暂无可播放的资源</p>
                <button onClick={() => navigate(-1)}>返回</button>
              </div>
            )}
          </div>

          {/* Info bar below player */}
          <div className="vp-info">
            <div className="vp-info-left">
              <div className="vp-ep-nav">
                <button
                  className="vp-ep-nav-btn"
                  onClick={handlePrevEpisode}
                  disabled={currentEpIdx <= 0}
                  title="上一集"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="vp-ep-current">
                  {currentEpisode
                    ? `第${currentEpisode.sort || currentEpisode.episode_sort || '?'}话`
                    : `第${episodeId}话`}
                </span>
                <button
                  className="vp-ep-nav-btn"
                  onClick={handleNextEpisode}
                  disabled={currentEpIdx < 0 || currentEpIdx >= episodes.length - 1}
                  title="下一集"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              {currentEpisode?.name_cn && (
                <span className="vp-ep-name">{currentEpisode.name_cn}</span>
              )}
            </div>
            <div className="vp-info-right">
              {currentSourceName && (
                <span className="vp-source-label">
                  <Server size={12} /> {currentSourceName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Episode sidebar */}
        <div className="vp-sidebar vp-ep-sidebar">
          <div className="vp-sidebar-header">
            <h3>剧集列表</h3>
            <button className="vp-sidebar-close" onClick={() => setShowEpList(false)}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="vp-ep-list">
            {episodes.map((ep, idx) => {
              const epSort = ep.sort || ep.episode_sort || (idx + 1);
              const epName = ep.name_cn || ep.name || '';
              const isActive = String(epSort) === String(episodeId);
              return (
                <button
                  key={ep.id || idx}
                  className={`vp-ep-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleEpisodeSwitch(ep)}
                >
                  <span className="vp-ep-sort">{epSort}</span>
                  {epName && <span className="vp-ep-label">{epName}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Source sidebar */}
        <div className="vp-sidebar vp-source-sidebar">
          <div className="vp-sidebar-header">
            <h3>资源切换</h3>
            <button className="vp-sidebar-close" onClick={() => setShowSourceList(false)}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="vp-source-list">
            {sourceGroups.length === 0 && (
              <div className="vp-source-empty">暂无资源</div>
            )}
            {sourceGroups.map(group => (
              <div key={group.sourceId} className="vp-source-group">
                <div className="vp-source-group-header">
                  <Server size={14} />
                  <span>{group.displayName}</span>
                  <span className="vp-source-count">{group.matches.length}</span>
                </div>
                <div className="vp-source-items">
                  {group.matches.map((match, idx) => {
                    const isActive = currentMedia?.sourceId === match.media.sourceId
                      && currentMedia?.mediaId === match.media.mediaId;
                    const isExact = match.matchKind === 'exact';
                    const props = match.media.properties || {};
                    return (
                      <button
                        key={`${match.media.mediaId}_${idx}`}
                        className={`vp-source-item ${isActive ? 'active' : ''}`}
                        onClick={() => handleSourceSwitch(match)}
                      >
                        <div className="vp-source-item-main">
                          <span className={`vp-match-tag ${isExact ? 'exact' : 'fuzzy'}`}>
                            {isExact ? '精确' : '模糊'}
                          </span>
                          <span className="vp-source-item-title">{match.media.title}</span>
                        </div>
                        <div className="vp-source-item-props">
                          {props.resolution && <span className="vp-prop">{props.resolution}</span>}
                          {props.subtitleGroup && <span className="vp-prop">{props.subtitleGroup}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overlay for closing sidebars on mobile */}
      {(showEpList || showSourceList) && (
        <div
          className="vp-overlay"
          onClick={() => { setShowEpList(false); setShowSourceList(false); }}
        />
      )}
    </div>
  );
}
