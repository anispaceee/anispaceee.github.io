import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MusashiService } from '../../services/musashiApi';
import { useApp } from '../../context/AppContext';
import UserAvatar from '../Common/UserAvatar';
import {
  Eye, Heart, Bookmark, Flag, Edit3,
  ChevronLeft, ChevronRight, Download,
  BookOpen, BookImage, AlertCircle, Loader2,
  X,
} from 'lucide-react';
import './WorkDetail.css';

const TYPE_CONFIG = {
  galgame: { label: 'Galgame', color: '#ff9f43' },
  novel:   { label: '小说',   color: '#9b59b6' },
  manga:   { label: '漫画',   color: '#00a1d6' },
};

const STATUS_MAP = {
  ongoing:  '连载中',
  completed: '已完结',
  hiatus:   '搁置',
};

const REPORT_REASONS = [
  '色情低俗',
  '违法违规',
  '侵权抄袭',
  '垃圾广告',
  '恶意骚扰',
  '其他',
];

export default function WorkDetail() {
  const { workId } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, openAuth } = useApp();

  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 互动状态
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);

  // 阅读进度
  const [progress, setProgress] = useState(null);

  // Galgame 轮播
  const [previewIndex, setPreviewIndex] = useState(0);

  // 小说章节 / 漫画画数
  const [chapters, setChapters] = useState([]);

  // 评论区
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  // 举报弹窗
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);

  // ─── 加载作品详情 ───
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await MusashiService.getWork(workId);
        if (!cancelled) {
          setWork(data);
          setLiked(!!data.is_liked);
          setFavorited(!!data.is_favorited);
          setLikeCount(data.like_count ?? 0);
          setFavoriteCount(data.favorite_count ?? 0);
          setViewCount(data.view_count ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [workId]);

  // ─── 记录浏览 ───
  useEffect(() => {
    if (workId) {
      MusashiService.recordView(workId).catch(() => {});
    }
  }, [workId]);

  // ─── 加载阅读进度 ───
  useEffect(() => {
    if (!isAuthenticated || !workId) return;
    MusashiService.getProgress(workId)
      .then(data => { if (data) setProgress(data); })
      .catch(() => {});
  }, [workId, isAuthenticated]);

  // ─── 加载章节/画数 ───
  useEffect(() => {
    if (!work) return;
    const loader = work.type === 'novel'
      ? MusashiService.getChapters(workId)
      : work.type === 'manga'
        ? MusashiService.getMangaChapters(workId)
        : null;
    if (!loader) return;
    loader
      .then(data => { setChapters(Array.isArray(data) ? data : (data.chapters || data.data || [])); })
      .catch(() => { setChapters([]); });
  }, [work, workId]);

  // ─── 加载评论 ───
  useEffect(() => {
    if (!workId) return;
    MusashiService.getComments(workId)
      .then(data => { setComments(Array.isArray(data) ? data : (data.comments || data.data || [])); })
      .catch(() => { setComments([]); });
  }, [workId]);

  // ─── 互动 ───
  const handleToggleLike = useCallback(async () => {
    if (!isAuthenticated) { openAuth(); return; }
    try {
      const result = await MusashiService.toggleLike(workId);
      setLiked(result.liked);
      setLikeCount(prev => result.liked ? prev + 1 : Math.max(0, prev - 1));
    } catch {}
  }, [workId, isAuthenticated, openAuth]);

  const handleToggleFavorite = useCallback(async () => {
    if (!isAuthenticated) { openAuth(); return; }
    try {
      const result = await MusashiService.toggleFavorite(workId);
      setFavorited(result.favorited);
      setFavoriteCount(prev => result.favorited ? prev + 1 : Math.max(0, prev - 1));
    } catch {}
  }, [workId, isAuthenticated, openAuth]);

  // ─── 举报 ───
  const handleReport = useCallback(async () => {
    if (!reportReason) return;
    setReporting(true);
    try {
      await MusashiService.reportWork(workId, reportReason);
      setShowReport(false);
      setReportReason('');
    } catch {}
    setReporting(false);
  }, [workId, reportReason]);

  // ─── 评论 ───
  const handleAddComment = useCallback(async () => {
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    setCommentError('');
    try {
      await MusashiService.addComment(workId, newComment.trim());
      const data = await MusashiService.getComments(workId);
      setComments(Array.isArray(data) ? data : (data.comments || data.data || []));
      setNewComment('');
    } catch (err) {
      setCommentError(err.message || '评论失败');
    } finally {
      setSubmittingComment(false);
    }
  }, [workId, newComment]);

  // ─── 轮播 ───
  const previews = Array.isArray(work?.preview_images) ? work.preview_images.slice(0, 20) : [];
  const handlePrevPreview = useCallback(() => {
    setPreviewIndex(i => (i - 1 + previews.length) % previews.length);
  }, [previews.length]);
  const handleNextPreview = useCallback(() => {
    setPreviewIndex(i => (i + 1) % previews.length);
  }, [previews.length]);

  // ─── 判断是否作者 ───
  const isAuthor = currentUser && work && (currentUser.id === work.author_id || currentUser.id === work.authorId);

  // ─── 加载中 ───
  if (loading) {
    return (
      <div className="wd-page">
        <div className="wd-loading">
          <Loader2 size={32} className="wd-spinning" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !work) {
    return (
      <div className="wd-page">
        <div className="wd-not-found">
          <AlertCircle size={48} />
          <h2>{error || '作品不存在'}</h2>
          <Link to="/musashi" className="wd-back-link">返回武藏也</Link>
        </div>
      </div>
    );
  }

  const typeInfo = TYPE_CONFIG[work.type] || { label: work.type, color: '#999' };
  const statusLabel = STATUS_MAP[work.status] || work.status;
  const tags = Array.isArray(work.tags) ? work.tags : [];

  // 下载链接按平台分组
  const downloads = Array.isArray(work.downloads) ? work.downloads : [];
  const groupedDownloads = downloads.reduce((acc, dl) => {
    const platform = (dl.platform || 'other').toLowerCase();
    if (!acc[platform]) acc[platform] = [];
    acc[platform].push(dl);
    return acc;
  }, {});

  // 章节总字数 / 漫画总页数
  const totalWordCount = work.type === 'novel'
    ? chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0)
    : 0;
  const totalPageCount = work.type === 'manga'
    ? chapters.reduce((sum, ch) => sum + (ch.page_count || 0), 0)
    : 0;

  return (
    <div className="wd-page">
      <div className="wd-back">
        <Link to="/musashi">← 返回武藏也</Link>
      </div>

      {/* ─── 顶部：封面 + 基本信息 ─── */}
      <div className="wd-hero">
        <div className="wd-cover-area">
          {work.cover_image ? (
            <img src={work.cover_image} alt={work.title} className="wd-cover-img" />
          ) : (
            <div className="wd-cover-placeholder">
              <span>{(work.title || '?')[0]}</span>
            </div>
          )}
        </div>

        <div className="wd-info-area">
          <div className="wd-badges">
            <span className="wd-type-badge" style={{ background: typeInfo.color }}>
              {typeInfo.label}
            </span>
            {statusLabel && (
              <span className="wd-status-badge">{statusLabel}</span>
            )}
          </div>

          <h1 className="wd-title">{work.title}</h1>

          <div className="wd-author-row" onClick={() => work.author_id && navigate(`/user/${work.author_id}`)}>
            <UserAvatar
              userId={work.author_id}
              src={work.author_avatar}
              alt={work.author_name || '匿名'}
              size={32}
            />
            <span className="wd-author-name">{work.author_name || '匿名'}</span>
          </div>

          {tags.length > 0 && (
            <div className="wd-tags">
              {tags.map((tag, i) => (
                <span key={i} className="wd-tag">{tag}</span>
              ))}
            </div>
          )}

          {work.description && (
            <p className="wd-desc">{work.description}</p>
          )}

          <div className="wd-stats">
            <span className="wd-stat"><Eye size={14} /> {viewCount}</span>
            <span className="wd-stat"><Heart size={14} /> {likeCount}</span>
            <span className="wd-stat"><Bookmark size={14} /> {favoriteCount}</span>
          </div>

          <div className="wd-actions">
            <button
              className={`wd-action-btn wd-like-btn${liked ? ' active' : ''}`}
              onClick={handleToggleLike}
            >
              <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
              {liked ? '已赞' : '点赞'}
            </button>
            <button
              className={`wd-action-btn wd-fav-btn${favorited ? ' active' : ''}`}
              onClick={handleToggleFavorite}
            >
              <Bookmark size={16} fill={favorited ? 'currentColor' : 'none'} />
              {favorited ? '已收藏' : '收藏'}
            </button>
            {isAuthenticated && (
              <button className="wd-action-btn wd-report-btn" onClick={() => setShowReport(true)}>
                <Flag size={14} /> 举报
              </button>
            )}
            {isAuthor && (
              <button className="wd-action-btn wd-edit-btn" onClick={() => navigate(`/musashi/${workId}/edit`)}>
                <Edit3 size={14} /> 编辑
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Galgame 特有区域 ─── */}
      {work.type === 'galgame' && (
        <div className="wd-section">
          {/* 预览图轮播 */}
          {previews.length > 0 && (
            <div className="wd-preview-carousel">
              <h2 className="wd-section-title">预览图</h2>
              <div className="wd-carousel-wrapper">
                <img src={previews[previewIndex]} alt={`预览 ${previewIndex + 1}`} className="wd-carousel-img" />
                {previews.length > 1 && (
                  <>
                    <button className="wd-carousel-arrow wd-carousel-prev" onClick={handlePrevPreview}>
                      <ChevronLeft size={20} />
                    </button>
                    <button className="wd-carousel-arrow wd-carousel-next" onClick={handleNextPreview}>
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}
              </div>
              {previews.length > 1 && (
                <div className="wd-carousel-dots">
                  {previews.map((_, i) => (
                    <span
                      key={i}
                      className={`wd-carousel-dot${i === previewIndex ? ' active' : ''}`}
                      onClick={() => setPreviewIndex(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 下载链接 */}
          {Object.keys(groupedDownloads).length > 0 && (
            <div className="wd-downloads">
              <h2 className="wd-section-title">下载</h2>
              {Object.entries(groupedDownloads).map(([platform, items]) => (
                <div key={platform} className="wd-download-group">
                  <h3 className="wd-download-platform">{platformLabel(platform)}</h3>
                  <div className="wd-download-list">
                    {items.map((dl, i) => (
                      <div key={dl.id || i} className="wd-download-item">
                        <div className="wd-download-info">
                          <span className="wd-download-version">v{dl.version || '1.0'}</span>
                          {dl.file_size && <span className="wd-download-size">{dl.file_size}</span>}
                        </div>
                        <div className="wd-download-right">
                          {dl.password && (
                            <span className="wd-download-pwd">解压密码：{dl.password}</span>
                          )}
                          <a
                            href={dl.url}
                            className="wd-download-btn"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download size={14} /> 下载
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 小说特有区域 ─── */}
      {work.type === 'novel' && (
        <div className="wd-section">
          <div className="wd-novel-header">
            <h2 className="wd-section-title">章节目录</h2>
            {totalWordCount > 0 && (
              <span className="wd-total-count">共 {totalWordCount.toLocaleString()} 字</span>
            )}
          </div>

          <div className="wd-read-actions">
            {progress && progress.chapter ? (
              <button
                className="wd-read-btn"
                onClick={() => navigate(`/musashi/${workId}/read/${progress.chapter}`)}
              >
                <BookOpen size={16} /> 继续阅读 第{progress.chapter}章
              </button>
            ) : (
              <button
                className="wd-read-btn"
                onClick={() => navigate(`/musashi/${workId}/read`)}
              >
                <BookOpen size={16} /> 开始阅读
              </button>
            )}
          </div>

          {chapters.length > 0 && (
            <div className="wd-chapter-list">
              {chapters.map((ch, i) => (
                <div
                  key={ch.id || i}
                  className="wd-chapter-item"
                  onClick={() => navigate(`/musashi/${workId}/read/${ch.id || i + 1}`)}
                >
                  <span className="wd-chapter-idx">{i + 1}</span>
                  <span className="wd-chapter-title">{ch.title || `第${i + 1}章`}</span>
                  {ch.word_count != null && (
                    <span className="wd-chapter-words">{ch.word_count} 字</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 漫画特有区域 ─── */}
      {work.type === 'manga' && (
        <div className="wd-section">
          <div className="wd-manga-header">
            <h2 className="wd-section-title">话数列表</h2>
            {totalPageCount > 0 && (
              <span className="wd-total-count">共 {totalPageCount} 页</span>
            )}
          </div>

          <div className="wd-read-actions">
            {progress && progress.chapter ? (
              <button
                className="wd-read-btn"
                onClick={() => navigate(`/musashi/${workId}/comic/${progress.chapter}`)}
              >
                <BookImage size={16} /> 继续阅读 第{progress.chapter}话
              </button>
            ) : (
              <button
                className="wd-read-btn"
                onClick={() => navigate(`/musashi/${workId}/comic`)}
              >
                <BookImage size={16} /> 开始阅读
              </button>
            )}
          </div>

          {chapters.length > 0 && (
            <div className="wd-chapter-list">
              {chapters.map((ch, i) => (
                <div
                  key={ch.id || i}
                  className="wd-chapter-item"
                  onClick={() => navigate(`/musashi/${workId}/comic/${ch.id || i + 1}`)}
                >
                  <span className="wd-chapter-idx">{i + 1}</span>
                  <span className="wd-chapter-title">{ch.title || `第${i + 1}话`}</span>
                  {ch.page_count != null && (
                    <span className="wd-chapter-words">{ch.page_count} 页</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 评论区 ─── */}
      <div className="wd-comments-section">
        <h2 className="wd-section-title">评论 ({comments.length})</h2>

        <div className="wd-comment-form">
          {commentError && (
            <div className="wd-comment-error">
              <AlertCircle size={14} />
              <span>{commentError}</span>
            </div>
          )}
          <textarea
            className="wd-comment-input"
            placeholder={isAuthenticated ? '写下你的评论...' : '请先登录后再评论'}
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            rows={3}
            disabled={!isAuthenticated}
          />
          <button
            className="wd-comment-submit"
            onClick={isAuthenticated ? handleAddComment : () => openAuth()}
            disabled={!newComment.trim() || submittingComment}
          >
            {submittingComment ? '提交中...' : isAuthenticated ? '评论' : '登录后评论'}
          </button>
        </div>

        <div className="wd-comments-list">
          {comments.map(comment => (
            <div key={comment.id} className="wd-comment-item">
              <UserAvatar
                userId={comment.author_id}
                src={comment.author_avatar}
                alt={comment.author_name || '匿名'}
                size={36}
              />
              <div className="wd-comment-body">
                <div className="wd-comment-header">
                  <span className="wd-comment-name">{comment.author_name || '匿名'}</span>
                  <span className="wd-comment-time">{comment.created_at}</span>
                </div>
                <div className="wd-comment-content">{comment.content}</div>
              </div>
            </div>
          ))}
          {comments.length === 0 && (
            <div className="wd-comments-empty">暂无评论，来说点什么吧</div>
          )}
        </div>
      </div>

      {/* ─── 举报弹窗 ─── */}
      {showReport && (
        <div className="wd-report-overlay" onClick={() => setShowReport(false)}>
          <div className="wd-report-dialog" onClick={e => e.stopPropagation()}>
            <div className="wd-report-header">
              <h3>举报作品</h3>
              <button className="wd-report-close" onClick={() => setShowReport(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="wd-report-reasons">
              {REPORT_REASONS.map(reason => (
                <button
                  key={reason}
                  className={`wd-report-reason${reportReason === reason ? ' active' : ''}`}
                  onClick={() => setReportReason(reason)}
                >
                  {reason}
                </button>
              ))}
            </div>
            <div className="wd-report-actions">
              <button className="wd-btn-secondary" onClick={() => setShowReport(false)}>取消</button>
              <button
                className="wd-btn-primary wd-report-confirm"
                onClick={handleReport}
                disabled={!reportReason || reporting}
              >
                {reporting ? <Loader2 size={14} className="wd-spinning" /> : '提交举报'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function platformLabel(platform) {
  const map = {
    windows: 'Windows',
    mac: 'Mac',
    linux: 'Linux',
    android: 'Android',
    ios: 'iOS',
    other: '其他',
  };
  return map[platform] || platform;
}
