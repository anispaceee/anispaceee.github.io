import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DPlayer from 'dplayer';
import Hls from 'hls.js';
import { safeUrl } from '../../utils/sanitize.js';
import { VideoSourceService } from '../../services/videoSource';
import { StorageService } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, Play, Server, MessageSquare, Send } from 'lucide-react';
import './VideoDetail.css';

const FALLBACK_IMG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect fill="%23333" width="200" height="300"/><text fill="%23666" x="100" y="150" text-anchor="middle" font-size="14">No Image</text></svg>';

export default function VideoDetail() {
  const { sourceId, vodId } = useParams();
  const navigate = useNavigate();
  const { currentUser, openAuth } = useApp();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [currentSourceIdx, setCurrentSourceIdx] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const playerRef = useRef(null);
  const playerContainerRef = useRef(null);

  // Fetch detail
  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      setError('');
      try {
        const result = await VideoSourceService.getDetail(sourceId, vodId);
        if (result.error) {
          setError(result.error);
        } else {
          setDetail(result);
          // Auto select first episode of first source
          if (result.episodes?.length > 0 && result.episodes[0].episodes?.length > 0) {
            setCurrentSourceIdx(0);
            setCurrentEpisode(result.episodes[0].episodes[0]);
          }
        }
      } catch (err) {
        setError('获取视频信息失败');
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [sourceId, vodId]);

  // Fetch comments
  useEffect(() => {
    const key = `video_${sourceId}_${vodId}`;
    const stored = StorageService.get('acg_video_comments', []);
    setComments(stored.filter(c => c.videoKey === key));
  }, [sourceId, vodId]);

  // Initialize DPlayer when episode changes
  useEffect(() => {
    if (!currentEpisode?.url || !playerContainerRef.current) return;

    // M-7: 校验视频 URL 仅允许安全协议
    const url = safeUrl(currentEpisode.url);
    if (!url) return;

    // Destroy old player
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    const isM3U8 = url.includes('.m3u8');

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
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = src;
            }
          },
        } : undefined,
        pic: detail?.cover || '',
      },
      autoplay: true,
      theme: '#fb7299',
      screenshot: true,
      hotkey: true,
      preload: 'auto',
      volume: 0.7,
    });

    playerRef.current = dp;

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [currentEpisode, detail?.cover]);

  const handleEpisodeClick = useCallback((ep, sourceIdx) => {
    setCurrentSourceIdx(sourceIdx);
    setCurrentEpisode(ep);
  }, []);

  const handleComment = useCallback(() => {
    if (!currentUser) { openAuth(); return; }
    if (!commentText.trim()) return;
    const key = `video_${sourceId}_${vodId}`;
    const comment = {
      id: Date.now(),
      videoKey: key,
      userId: currentUser.id,
      username: currentUser.username || currentUser.name,
      avatar: currentUser.avatar,
      content: commentText.trim(),
      createdAt: new Date().toISOString(),
      likes: 0,
    };
    const stored = StorageService.get('acg_video_comments', []);
    stored.push(comment);
    StorageService.set('acg_video_comments', stored);
    setComments(prev => [...prev, comment]);
    setCommentText('');
  }, [currentUser, commentText, sourceId, vodId, openAuth]);

  if (loading) return <div className="vd-loading">加载中...</div>;
  if (error) return <div className="vd-error"><p>{error}</p><button onClick={() => navigate(-1)}>返回</button></div>;
  if (!detail) return <div className="vd-error"><p>未找到视频</p></div>;

  return (
    <div className="video-detail">
      <div className="vd-back">
        <button onClick={() => navigate(-1)}><ArrowLeft size={18} /> 返回</button>
      </div>

      {/* Player */}
      <div className="vd-player-wrap">
        <div ref={playerContainerRef} className="vd-player" />
      </div>

      {/* Info */}
      <div className="vd-info">
        <h1 className="vd-title">{detail.title}</h1>
        <div className="vd-meta">
          {detail.year && <span>{detail.year}</span>}
          {detail.area && <span>{detail.area}</span>}
          {detail.category && <span>{detail.category}</span>}
          {detail.remarks && <span className="vd-remarks">{detail.remarks}</span>}
        </div>
        {detail.description && <p className="vd-desc">{detail.description}</p>}
        <div className="vd-source-label">
          <Server size={14} /> 来源：{detail.sourceName}
        </div>
      </div>

      {/* Episodes */}
      {detail.episodes?.length > 0 && (
        <div className="vd-episodes">
          {detail.episodes.map((group, gIdx) => (
            <div key={gIdx} className="vd-ep-group">
              <h3 className="vd-ep-source">播放源：{group.source}</h3>
              <div className="vd-ep-list">
                {group.episodes.map((ep, epIdx) => (
                  <button
                    key={epIdx}
                    className={`vd-ep-btn ${currentSourceIdx === gIdx && currentEpisode?.url === ep.url ? 'active' : ''}`}
                    onClick={() => handleEpisodeClick(ep, gIdx)}
                  >
                    {ep.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comments */}
      <div className="vd-comments">
        <h2><MessageSquare size={18} /> 评论</h2>
        <div className="vd-comment-input">
          <input
            type="text"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder={currentUser ? '写下你的评论...' : '登录后评论'}
            onKeyDown={e => e.key === 'Enter' && handleComment()}
          />
          <button onClick={handleComment} disabled={!commentText.trim()}><Send size={16} /></button>
        </div>
        <div className="vd-comment-list">
          {comments.length === 0 && <p className="vd-no-comments">暂无评论</p>}
          {comments.map(c => (
            <div key={c.id} className="vd-comment">
              <img src={c.avatar || FALLBACK_IMG} alt="" className="vd-comment-avatar" loading="lazy" onError={e => { e.target.src = FALLBACK_IMG; }} />
              <div className="vd-comment-body">
                <span className="vd-comment-name">{c.username}</span>
                <span className="vd-comment-time">{new Date(c.createdAt).toLocaleDateString()}</span>
                <p className="vd-comment-text">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
