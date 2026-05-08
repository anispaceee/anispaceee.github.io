import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { VideoService, DanmakuService, VideoCommentService, UserService } from '../../services/api';
import { ArrowLeft, Eye, Heart, MessageCircle, Share2, Star, ThumbsUp, ChevronDown, ChevronUp, Send, Play, Film, Clock, User } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import './VideoDetail.css';

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, openAuth } = useApp();

  const [video, setVideo] = useState(null);
  const [danmakus, setDanmakus] = useState([]);
  const [comments, setComments] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [danmakuFilter, setDanmakuFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('comments');

  useEffect(() => {
    const v = VideoService.getById(id);
    if (!v) return;
    setVideo(v);
    VideoService.incrementViews(id);
    const dm = DanmakuService.getByVideoId(id);
    setDanmakus(dm);
    const cm = VideoCommentService.getByVideoId(id);
    setComments(cm);
    const recs = VideoService.getAll()
      .filter(r => r.id !== parseInt(id) && r.category === v.category)
      .sort(() => Math.random() - 0.5)
      .slice(0, 8);
    setRecommendations(recs);
  }, [id]);

  const handleDanmakuSend = useCallback((text, color) => {
    if (!isAuthenticated) { openAuth(); return; }
    const newDm = DanmakuService.add(id, {
      userId: currentUser.id,
      userName: currentUser.name,
      text,
      color,
      time: 0,
      type: 'scroll',
    });
    setDanmakus(prev => [...prev, newDm]);
  }, [id, isAuthenticated, currentUser, openAuth]);

  const handleLike = () => {
    if (!isAuthenticated) { openAuth(); return; }
    if (liked) return;
    VideoService.toggleLike(id);
    setLiked(true);
    setVideo(prev => prev ? { ...prev, likes: prev.likes + 1 } : prev);
  };

  const handleFavorite = () => {
    if (!isAuthenticated) { openAuth(); return; }
    setFavorited(!favorited);
  };

  const handleComment = () => {
    if (!commentText.trim()) return;
    if (!isAuthenticated) { openAuth(); return; }
    const newComment = VideoCommentService.add(id, {
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar || '',
      content: commentText.trim(),
    });
    setComments(prev => [newComment, ...prev]);
    setCommentText('');
  };

  const handleReply = (commentId) => {
    if (!replyText.trim()) return;
    if (!isAuthenticated) { openAuth(); return; }
    const newReply = VideoCommentService.addReply(commentId, {
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar || '',
      content: replyText.trim(),
    });
    setComments(prev => prev.map(c => {
      if (c.id === commentId) {
        return { ...c, replies: [...(c.replies || []), newReply] };
      }
      return c;
    }));
    setReplyText('');
    setReplyTo(null);
  };

  const formatCount = (n) => {
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return String(n);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 2592000000) return `${Math.floor(diff / 86400000)}天前`;
    return d.toLocaleDateString('zh-CN');
  };

  const filteredDanmakus = danmakuFilter === 'all'
    ? danmakus
    : danmakus.filter(d => d.color === danmakuFilter);

  if (!video) {
    return (
      <div className="vd-page">
        <div className="vd-not-found">
          <Film size={48} />
          <h2>视频不存在</h2>
          <button className="vd-back-btn" onClick={() => navigate('/video')}>
            <ArrowLeft size={16} /> 返回影视区
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vd-page">
      <div className="vd-layout">
        <div className="vd-main">
          <div className="vd-player-section">
            <VideoPlayer
              src={video.videoUrl}
              title={video.title}
              autoPlay={true}
              danmakus={danmakus.map(d => ({ text: d.text, color: d.color, type: d.type, time: d.time }))}
              onDanmakuSend={handleDanmakuSend}
            />
          </div>

          <div className="vd-info-section">
            <h1 className="vd-title">{video.title}</h1>
            <div className="vd-stats">
              <span className="vd-stat"><Eye size={15} /> {formatCount(video.views)}</span>
              <span className="vd-stat"><MessageCircle size={15} /> {formatCount(video.danmakuCount || danmakus.length)}</span>
              <span className="vd-stat"><Clock size={15} /> {video.createdAt}</span>
            </div>

            <div className="vd-actions">
              <button className={`vd-action-btn ${liked ? 'liked' : ''}`} onClick={handleLike}>
                <ThumbsUp size={18} /> {liked ? '已点赞' : '点赞'} {formatCount(video.likes)}
              </button>
              <button className={`vd-action-btn ${favorited ? 'favorited' : ''}`} onClick={handleFavorite}>
                <Star size={18} /> {favorited ? '已收藏' : '收藏'}
              </button>
              <button className="vd-action-btn">
                <Share2 size={18} /> 分享
              </button>
            </div>

            <div className="vd-uploader">
              <div className="vd-uploader-avatar">
                {video.author?.charAt(0) || 'U'}
              </div>
              <div className="vd-uploader-info">
                <span className="vd-uploader-name">{video.author}</span>
                <span className="vd-uploader-desc">UP主</span>
              </div>
              <button className="vd-follow-btn">关注</button>
            </div>

            {video.description && (
              <div className="vd-description">
                <div className={`vd-desc-content ${showFullDesc ? 'expanded' : ''}`}>
                  {video.description}
                </div>
                {video.description.length > 80 && (
                  <button className="vd-desc-toggle" onClick={() => setShowFullDesc(!showFullDesc)}>
                    {showFullDesc ? <><ChevronUp size={14} /> 收起</> : <><ChevronDown size={14} /> 展开</>}
                  </button>
                )}
              </div>
            )}

            {video.tags && video.tags.length > 0 && (
              <div className="vd-tags">
                {video.tags.map(tag => (
                  <span key={tag} className="vd-tag">{tag}</span>
                ))}
              </div>
            )}
          </div>

          <div className="vd-tabs">
            <button className={`vd-tab ${activeTab === 'comments' ? 'active' : ''}`} onClick={() => setActiveTab('comments')}>
              评论 {VideoCommentService.getCount(id)}
            </button>
            <button className={`vd-tab ${activeTab === 'danmaku' ? 'active' : ''}`} onClick={() => setActiveTab('danmaku')}>
              弹幕列表 {danmakus.length}
            </button>
          </div>

          {activeTab === 'comments' && (
            <div className="vd-comments">
              <div className="vd-comment-input">
                <div className="vd-comment-avatar">
                  {isAuthenticated && currentUser ? currentUser.name.charAt(0) : '?'}
                </div>
                <div className="vd-comment-input-wrap">
                  <input
                    type="text"
                    className="vd-comment-field"
                    placeholder={isAuthenticated ? '写下你的评论...' : '登录后即可评论'}
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleComment()}
                    disabled={!isAuthenticated}
                  />
                  <button className="vd-comment-send" onClick={handleComment} disabled={!commentText.trim() || !isAuthenticated}>
                    <Send size={14} />
                  </button>
                </div>
              </div>

              <div className="vd-comment-list">
                {comments.length === 0 ? (
                  <div className="vd-empty">暂无评论，快来抢沙发吧~</div>
                ) : (
                  comments.map(comment => (
                    <div key={comment.id} className="vd-comment">
                      <div className="vd-comment-avatar-sm">
                        {comment.userName?.charAt(0) || 'U'}
                      </div>
                      <div className="vd-comment-body">
                        <div className="vd-comment-header">
                          <span className="vd-comment-name">{comment.userName}</span>
                          <span className="vd-comment-time">{formatDate(comment.createdAt)}</span>
                        </div>
                        <p className="vd-comment-text">{comment.content}</p>
                        <div className="vd-comment-actions">
                          <button className="vd-comment-action" onClick={() => VideoCommentService.likeComment(comment.id)}>
                            <ThumbsUp size={12} /> {comment.likes || 0}
                          </button>
                          <button className="vd-comment-action" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>
                            <MessageCircle size={12} /> 回复
                          </button>
                        </div>

                        {replyTo === comment.id && (
                          <div className="vd-reply-input">
                            <input
                              type="text"
                              placeholder={`回复 ${comment.userName}...`}
                              value={replyText}
                              onChange={e => setReplyText(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleReply(comment.id)}
                            />
                            <button onClick={() => handleReply(comment.id)} disabled={!replyText.trim()}>
                              <Send size={12} />
                            </button>
                          </div>
                        )}

                        {comment.replies && comment.replies.length > 0 && (
                          <div className="vd-replies">
                            {comment.replies.map(reply => (
                              <div key={reply.id} className="vd-reply">
                                <div className="vd-reply-avatar">{reply.userName?.charAt(0) || 'U'}</div>
                                <div className="vd-reply-body">
                                  <span className="vd-reply-name">{reply.userName}</span>
                                  <span className="vd-reply-text">{reply.content}</span>
                                  <span className="vd-reply-time">{formatDate(reply.createdAt)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'danmaku' && (
            <div className="vd-danmaku-list">
              <div className="vd-danmaku-filters">
                <button className={`vd-dm-filter ${danmakuFilter === 'all' ? 'active' : ''}`} onClick={() => setDanmakuFilter('all')}>全部</button>
                <button className={`vd-dm-filter ${danmakuFilter === '#FFFFFF' ? 'active' : ''}`} onClick={() => setDanmakuFilter('#FFFFFF')}>白色</button>
                <button className={`vd-dm-filter ${danmakuFilter === '#FE0302' ? 'active' : ''}`} onClick={() => setDanmakuFilter('#FE0302')}>红色</button>
                <button className={`vd-dm-filter ${danmakuFilter === '#FFD302' ? 'active' : ''}`} onClick={() => setDanmakuFilter('#FFD302')}>黄色</button>
                <button className={`vd-dm-filter ${danmakuFilter === '#00CD00' ? 'active' : ''}`} onClick={() => setDanmakuFilter('#00CD00')}>绿色</button>
                <button className={`vd-dm-filter ${danmakuFilter === '#426ABE' ? 'active' : ''}`} onClick={() => setDanmakuFilter('#426ABE')}>蓝色</button>
              </div>
              <div className="vd-danmaku-table">
                <div className="vd-danmaku-header">
                  <span className="vd-dm-time">时间</span>
                  <span className="vd-dm-content">弹幕内容</span>
                  <span className="vd-dm-user">发送者</span>
                  <span className="vd-dm-date">日期</span>
                </div>
                {filteredDanmakus.length === 0 ? (
                  <div className="vd-empty">暂无弹幕</div>
                ) : (
                  filteredDanmakus.map(d => (
                    <div key={d.id} className="vd-danmaku-row">
                      <span className="vd-dm-time">{formatTime(d.time)}</span>
                      <span className="vd-dm-content" style={{ color: d.color === '#FFFFFF' ? 'var(--text-primary)' : d.color }}>{d.text}</span>
                      <span className="vd-dm-user">{d.userName}</span>
                      <span className="vd-dm-date">{formatDate(d.createdAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="vd-sidebar">
          <h3 className="vd-sidebar-title">推荐视频</h3>
          <div className="vd-rec-list">
            {recommendations.map(rec => (
              <div key={rec.id} className="vd-rec-card" onClick={() => navigate(`/video/${rec.id}`)}>
                <div className="vd-rec-cover">
                  <Play size={20} />
                  <span className="vd-rec-duration">{rec.duration}</span>
                </div>
                <div className="vd-rec-info">
                  <h4 className="vd-rec-title">{rec.title}</h4>
                  <div className="vd-rec-meta">
                    <span><Eye size={11} /> {formatCount(rec.views)}</span>
                    <span><User size={11} /> {rec.author}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
