import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { BangumiService } from '../../services/api';
import { mediaSourceManager } from '../../services/media/MediaSourceManager';
import { danmakuService } from '../../services/media/DanmakuService';
import { ArrowLeft, Play, Server, ChevronLeft, ChevronRight, Loader2, List, Layers } from 'lucide-react';
import './VideoPlayer.css';

// Dynamic imports for DPlayer and Hls - loaded on demand
let DPlayer, Hls;
const loadPlayerLibs = Promise.all([
  import('dplayer').then(m => { DPlayer = m.default; }).catch(e => console.error('[VideoPlayer] DPlayer load failed:', e)),
  import('hls.js').then(m => { Hls = m.default; }).catch(e => console.error('[VideoPlayer] Hls.js load failed:', e)),
]);

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
  const [danmakuList, setDanmakuList] = useState([]);
  const [torrentProgress, setTorrentProgress] = useState(null); // { progress, downloadSpeed, numPeers }
  const [debugInfo, setDebugInfo] = useState(''); // 可见调试信息

  const playerRef = useRef(null);
  const playerContainerRef = useRef(null);
  const hlsRef = useRef(null);
  const torrentRef = useRef(null);
  const coverRef = useRef('');

  // Fetch subject detail, episodes, and media matches
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError('');
      setCurrentMedia(null);
      setMediaMatches([]);
      setDanmakuList([]);

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
        // MacCMS 源优先使用中文名，所以把 name_cn 放在前面
        const subjectNames = [];
        if (sub?.name_cn) subjectNames.push(sub.name_cn);
        if (sub?.name) subjectNames.push(sub.name);

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

        console.log('[VideoPlayer] 开始搜索资源, request:', request);
        const registeredSources = mediaSourceManager.getRegistrations().map(r => `${r.sourceId}(enabled:${r.enabled})`);
        const enabledSources = mediaSourceManager.getEnabledSources().map(s => `${s.sourceId}(${s.info.displayName})`);
        console.log('[VideoPlayer] 已注册源:', registeredSources);
        console.log('[VideoPlayer] 可用源:', enabledSources);
        setDebugInfo(`搜索: ${request.subjectNames.join('/')} EP${request.episodeSort}\n已注册: ${registeredSources.join(', ')}\n可用: ${enabledSources.join(', ')}`);

        // 4. Call mediaSourceManager.fetchAll
        let result;
        try {
          result = await mediaSourceManager.fetchAll(request);
        } catch (err) {
          console.error('[VideoPlayer] mediaSourceManager.fetchAll crashed:', err);
          result = { results: [], errors: [{ sourceId: 'unknown', error: err.message || '资源搜索崩溃' }] };
        }
        if (cancelled) return;
        setMediaMatches(result.results || []);

        const errInfo = result.errors?.length > 0 ? `\n错误: ${result.errors.map(e => `${e.sourceId}: ${e.error}`).join('; ')}` : '';
        const matchInfo = result.results?.length > 0 ? `\n匹配: ${result.results.slice(0, 3).map(m => `${m.media.title} [${m.media.download?.kind}]`).join('; ')}` : '\n匹配: 无';
        setDebugInfo(prev => prev + `\n结果: ${result.results?.length || 0}条` + matchInfo + errInfo);

        console.log('[VideoPlayer] 资源搜索完成:', {
          total: result.results?.length || 0,
          errors: result.errors?.length || 0,
          errorDetails: result.errors,
          matchDetails: result.results?.slice(0, 3).map(m => ({
            title: m.media.title,
            sourceId: m.media.sourceId,
            url: m.media.download?.url?.substring(0, 80),
          })),
        });

        // 4.5 Fetch danmaku using Bangumi episode ID
        const bangumiEpId = currentEp?.id ? String(currentEp.id) : '';
        if (bangumiEpId) {
          try {
            const danmaku = await danmakuService.fetchDanmaku(bangumiEpId);
            if (!cancelled) setDanmakuList(danmaku);
          } catch (err) {
            console.warn('[VideoPlayer] danmaku fetch failed:', err);
          }
        }

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
          // 优先选择 HTTP 流（MacCMS 源），其次磁力链接
          const httpMatch = matches.find(m => m.media.download?.kind === 'http');
          setCurrentMedia((httpMatch || matches[0]).media);
        } else {
          console.warn('[VideoPlayer] 未找到任何可用资源');
        }
      } catch (err) {
        console.error('[VideoPlayer] fetch error:', err);
        if (!cancelled) setError(`获取视频信息失败: ${err.message || '未知错误'}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [subjectId, episodeId, sourceId, mediaId]);

  // Initialize DPlayer / WebTorrent when currentMedia changes
  useEffect(() => {
    if (!currentMedia?.download?.url || !playerContainerRef.current) return;

    const url = currentMedia.download.url;
    const downloadKind = currentMedia.download?.kind || 'http';
    setPlayError('');
    setTorrentProgress(null);

    // Destroy old player, HLS instance, and torrent client
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    if (torrentRef.current) {
      torrentRef.current.destroy();
      torrentRef.current = null;
    }

    if (downloadKind === 'magnet') {
      // WebTorrent BT playback (dynamic import to avoid Node.js stream crash at startup)
      const initWebTorrent = async () => {
        try {
          const { default: WebTorrent } = await import('webtorrent');
          const client = new WebTorrent();
          torrentRef.current = client;

          client.add(url, (torrent) => {
            // Find the largest video file
            const file = torrent.files.sort((a, b) => b.length - a.length)[0];
            if (!file) {
              setPlayError('种子中未找到视频文件');
              return;
            }

            // Create a video element for WebTorrent to render into
            const container = playerContainerRef.current;
            const videoEl = document.createElement('video');
            videoEl.style.width = '100%';
            videoEl.style.height = '100%';
            videoEl.controls = true;
            videoEl.autoplay = true;
            container.appendChild(videoEl);

            file.renderTo(videoEl, (err) => {
              if (err) {
                setPlayError('视频渲染失败: ' + err.message);
              }
            });

            // Track progress
            torrent.on('download', () => {
              setTorrentProgress({
                progress: Math.round(torrent.progress * 100),
                downloadSpeed: Math.round(torrent.downloadSpeed / 1024),
                numPeers: torrent.numPeers,
              });
            });

            torrent.on('error', (err) => {
              setPlayError('种子下载失败: ' + err.message);
            });
          });

          client.on('error', (err) => {
            setPlayError('WebTorrent 错误: ' + err.message);
          });
        } catch (err) {
          setPlayError('WebTorrent 加载失败，浏览器可能不支持 BT 播放');
        }
      };
      initWebTorrent();

      return () => {
        if (torrentRef.current) {
          torrentRef.current.destroy();
          torrentRef.current = null;
        }
        // Remove any video elements added by WebTorrent
        const container = playerContainerRef.current;
        if (container) {
          const videos = container.querySelectorAll('video:not(.dplayer-video)');
          videos.forEach(v => v.remove());
        }
      };
    } else {
      // HTTP/HLS playback - wait for DPlayer and Hls to load
      const initPlayer = async () => {
        try {
          await loadPlayerLibs;
        } catch (e) {
          console.error('[VideoPlayer] Failed to load player libs:', e);
        }
        if (!DPlayer) {
          setPlayError('DPlayer 加载失败，请刷新页面重试');
          return;
        }

        // Detect HLS: check both original URL and the proxied URL path
        // Worker proxy URLs contain the original URL as a query param, e.g. /api/video/stream?url=...index.m3u8
        const isM3U8 = /\.m3u8(\?|$)/i.test(url) || /\.m3u8/i.test(decodeURIComponent(url));
        console.log('[VideoPlayer] 初始化播放器, url:', url.substring(0, 120), 'isM3U8:', isM3U8, 'Hls available:', !!Hls);

        try {
          const playerConfig = {
            container: playerContainerRef.current,
            video: {
              url,
              pic: coverRef.current,
            },
            autoplay: true,
            theme: '#fb7299',
            screenshot: true,
            hotkey: true,
            preload: 'auto',
            volume: 0.7,
          };

          // DPlayer 1.27 auto-detects HLS when window.Hls exists and URL ends with .m3u8
          // For proxied URLs where .m3u8 is in the query param, we need customType
          if (isM3U8 && Hls) {
            // Make Hls available globally so DPlayer can detect it
            window.Hls = Hls;
            // Use customType for proxied m3u8 URLs (where .m3u8 is in query param, not path)
            playerConfig.video.type = 'customHls';
            playerConfig.customType = {
              customHls: (video, src) => {
                if (Hls.isSupported()) {
                  const hls = new Hls({
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60,
                  });
                  hls.loadSource(src);
                  hls.attachMedia(video);
                  hlsRef.current = hls;
                  hls.on(Hls.Events.ERROR, (_event, data) => {
                    if (data.fatal) {
                      console.error('[VideoPlayer] HLS fatal error:', data.type, data.details);
                      switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                          console.warn('[VideoPlayer] Network error, trying to recover...');
                          hls.startLoad();
                          break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                          console.warn('[VideoPlayer] Media error, trying to recover...');
                          hls.recoverMediaError();
                          break;
                        default:
                          setPlayError('视频加载失败，请尝试切换播放源或剧集');
                          hls.destroy();
                          break;
                      }
                    }
                  });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                  // Safari native HLS support
                  video.src = src;
                }
              },
            };
          }

          // Add danmaku only if we have data
          if (danmakuList.length > 0) {
            playerConfig.danmaku = {
              id: `${subjectId}_${episodeId}`,
              maximum: 1000,
              bottom: '10%',
              unlimited: false,
            };
            playerConfig.apiBackend = {
              read: (endpoint, callback) => {
                callback({
                  data: danmakuList.map(d => ({
                    time: d.time,
                    type: d.type,
                    color: parseInt(d.color.replace('#', ''), 16),
                    author: d.author,
                    text: d.text,
                  })),
                });
              },
              send: (endpoint, danmaku, callback) => {
                callback();
              },
            };
          }

          const dp = new DPlayer(playerConfig);

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
        } catch (err) {
          console.error('[VideoPlayer] DPlayer init error:', err);
          setPlayError('播放器初始化失败: ' + (err.message || '未知错误'));
        }
      };
      initPlayer();

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
    }
  }, [currentMedia, subjectId, episodeId, danmakuList]);

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
      {/* Debug info panel */}
      {debugInfo && (
        <pre style={{
          position: 'fixed', bottom: 10, left: 10, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)', color: '#0f0', padding: '10px',
          borderRadius: '8px', fontSize: '11px', maxWidth: '500px',
          whiteSpace: 'pre-wrap', maxHeight: '200px', overflow: 'auto',
          fontFamily: 'monospace',
        }}>{debugInfo}</pre>
      )}

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

          {/* Torrent progress info */}
          {torrentProgress && (
            <div className="vp-torrent-info">
              <span>缓冲: {torrentProgress.progress}%</span>
              <span>速度: {torrentProgress.downloadSpeed} KB/s</span>
              <span>节点: {torrentProgress.numPeers}</span>
            </div>
          )}

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
