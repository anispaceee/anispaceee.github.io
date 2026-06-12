import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ForumService } from '../../services/api';
import { renderMarkdown } from '../../utils/renderMarkdown';
import RichTextEditor from '../Common/RichTextEditor';
import { ForumLeftSidebar, ForumRightSidebar } from './ForumSidebar';
import { MessageCircle, Gamepad2, Tv, BookOpen, Coffee, Plus, Search, TrendingUp, Clock, Heart, Image, X, Eye, Bold, Italic, Upload, Link as LinkIcon, List, Quote, AlertCircle, Loader2 } from 'lucide-react';
import UserAvatar from '../Common/UserAvatar';
import './Forum.css';

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const BOARDS = [
  { key: 'anime', label: '动画', icon: Tv, color: 'var(--tag-anime)', description: '新番讨论 · 旧番回顾 · MAD·AMV' },
  { key: 'game', label: '游戏', icon: Gamepad2, color: 'var(--tag-game)', description: '单机·主机 · 手游 · 网游' },
  { key: 'novel', label: '小说', icon: BookOpen, color: 'var(--tag-novel)', description: '轻小说 · 网文 · 同人' },
  { key: 'chat', label: '吹水', icon: Coffee, color: 'var(--tag-chat)', description: '日常闲聊 · 活动公告' },
];

const sortOptions = [
  { key: 'latest', label: '最新', icon: Clock },
  { key: 'hot', label: '最热', icon: TrendingUp },
  { key: 'replies', label: '回复', icon: MessageCircle },
];

function PostPreview({ title, content, images, category }) {
  return (
    <div className="post-preview">
      <div className="preview-header">
        <span className={`post-cat-tag ${category}`}>{({ game: '游戏', anime: '动画', novel: '小说', chat: '吹水' })[category]}</span>
        <h3 className="preview-title">{title || '帖子标题预览'}</h3>
      </div>
      <div className="preview-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
      {images && images.length > 0 && (
        <div className="preview-images">
          {images.map((img, i) => (
            <img key={i} src={typeof img === 'string' ? img : img.preview} alt="" className="preview-img" loading="lazy" />
          ))}
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
  return dateStr;
}

export default function Forum() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [activeBoard, setActiveBoard] = useState(null);
  const [sortBy, setSortBy] = useState('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewPost, setShowNewPost] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    category: 'chat',
    tags: '',
    images: [],
  });
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageInputMode, setImageInputMode] = useState('upload'); // 'upload' | 'url'
  const imageInputRef = useRef(null);

  // 从后端加载帖子（带 category 和 sort 参数）
  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const data = await ForumService.getPosts(1, 100, activeBoard || '', sortBy);
      setPosts(data.posts || []);
    } catch {
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  }, [activeBoard, sortBy]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // 前端仅做搜索过滤（搜索仍为前端功能，后端无全文搜索）
  const filteredPosts = useMemo(() => {
    if (!searchQuery) return posts;
    const q = searchQuery.toLowerCase();
    return posts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      (p.tags && Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q)))
    );
  }, [searchQuery, posts]);

  const getPostAuthor = (post) => {
    if (post.author_name) return { name: post.author_name, avatar: post.author_avatar };
    return { name: '未知用户', avatar: '' };
  };
  const getCategoryLabel = (cat) => ({ game: '游戏', anime: '动画', novel: '小说', chat: '吹水' }[cat] || cat);

  const validatePost = useCallback(() => {
    const errors = [];
    if (!newPost.title.trim()) errors.push({ type: 'format', message: '请输入帖子标题' });
    else if (newPost.title.length > 100) errors.push({ type: 'format', message: '标题不能超过100个字符' });
    if (!newPost.content.trim()) errors.push({ type: 'format', message: '请输入帖子内容' });
    if (newPost.images.length > MAX_IMAGES) errors.push({ type: 'format', message: `最多添加${MAX_IMAGES}张图片` });
    return errors;
  }, [newPost]);

  const handleImageFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_IMAGES - newPost.images.length;
    if (remaining <= 0) {
      setSubmitError([{ type: 'format', message: `最多添加${MAX_IMAGES}张图片` }]);
      return;
    }

    const toUpload = files.slice(0, remaining);
    setUploadingImages(true);
    setSubmitError(null);

    for (const file of toUpload) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setSubmitError([{ type: 'format', message: `${file.name} 格式不支持` }]);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setSubmitError([{ type: 'format', message: `${file.name} 超过10MB` }]);
        continue;
      }

      try {
        const result = await ForumService.uploadImage(file);
        setNewPost(prev => ({
          ...prev,
          images: [...prev.images, result.url],
        }));
      } catch (err) {
        setSubmitError([{ type: 'network', message: `${file.name} 上传失败: ${err.message}` }]);
      }
    }

    setUploadingImages(false);
    e.target.value = '';
  };

  const addImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    if (newPost.images.length >= MAX_IMAGES) {
      setSubmitError([{ type: 'format', message: `最多添加${MAX_IMAGES}张图片` }]);
      return;
    }
    try {
      new URL(url);
    } catch {
      setSubmitError([{ type: 'format', message: '请输入有效的图片 URL' }]);
      return;
    }
    setNewPost(prev => ({
      ...prev,
      images: [...prev.images, url],
    }));
    setImageUrlInput('');
    setSubmitError(null);
  };

  const removeImage = (index) => {
    setNewPost(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleNewPost = async () => {
    const errors = validatePost();
    if (errors.length > 0) {
      setSubmitError(errors);
      return;
    }

    if (!isAuthenticated) {
      setSubmitError([{ type: 'auth', message: '请先登录后再发帖' }]);
      openAuth();
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const tags = newPost.tags.trim() ? newPost.tags.trim().split(/\s+/) : [];

      // 图片直接使用 URL 列表
      const imageUrls = newPost.images;

      const created = await ForumService.createPost({
        title: newPost.title.trim(),
        content: newPost.content.trim(),
        category: newPost.category,
        tags,
        images: imageUrls,
      });

      setPosts(prev => [created, ...prev]);

      setShowNewPost(false);
      setShowPreview(false);
      setNewPost({ title: '', content: '', category: 'chat', tags: '', images: [] });
      setSubmitError(null);
    } catch (err) {
      setSubmitError([{ type: 'network', message: err.message || '发帖失败，请重试' }]);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setNewPost({ title: '', content: '', category: 'chat', tags: '', images: [] });
    setShowNewPost(false);
    setShowPreview(false);
    setSubmitError(null);
  };

  const renderError = (error, index) => {
    const colorClass = error.type === 'network' ? 'error-network'
      : error.type === 'format' ? 'error-format'
      : error.type === 'auth' ? 'error-auth'
      : 'error-default';
    return (
      <div key={index} className={`form-error-item ${colorClass}`}>
        <AlertCircle size={14} />
        <span>{error.message}</span>
        {error.type === 'network' && <span className="form-error-hint">请检查网络后重试</span>}
        {error.type === 'format' && <span className="form-error-hint">请修改后重新提交</span>}
        {error.type === 'auth' && <span className="form-error-hint">点击此处登录</span>}
      </div>
    );
  };

  // 热门帖子（综合热度前5）
  const hotPosts = useMemo(() => {
    return [...posts]
      .sort((a, b) => ((b.views || 0) + (b.likes || 0) * 3 + (b.replies_count || 0) * 5) - ((a.views || 0) + (a.likes || 0) * 3 + (a.replies_count || 0) * 5))
      .slice(0, 5);
  }, [posts]);

  // 热门标签
  const hotTags = useMemo(() => {
    const tagMap = {};
    posts.forEach(p => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      tags.forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
    });
    return Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([tag]) => tag);
  }, [posts]);

  // 统计各板块帖子数
  const boardPostCounts = useMemo(() => {
    const counts = {};
    BOARDS.forEach(b => { counts[b.key] = 0; });
    posts.forEach(p => {
      if (counts[p.category] !== undefined) counts[p.category]++;
    });
    return counts;
  }, [posts]);

  return (
    <div className="forum-page">
      <ForumLeftSidebar posts={posts} activeBoard={activeBoard} onBoardChange={setActiveBoard} onNewPost={() => setShowNewPost(!showNewPost)} />

      {/* ─── 中间栏：帖子列表 ─── */}
      <main className="forum-main">
        {/* 页面头部 */}
        <div className="forum-header">
          <h1 className="forum-title"><MessageCircle size={22} /> 放課後</h1>
          <div className="forum-toolbar">
            <div className="forum-search-bar-pill">
              <Search size={16} />
              <input type="text" placeholder="搜索帖子..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="forum-sort-pills">
              {sortOptions.map(opt => {
                const Icon = opt.icon;
                return (
                  <button key={opt.key} className={`sort-pill ${sortBy === opt.key ? 'active' : ''}`} onClick={() => setSortBy(opt.key)}>
                    <Icon size={13} /> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 板块标签（移动端可见） */}
        <div className="forum-board-cards">
          <button className={`forum-board-chip ${!activeBoard ? 'active' : ''}`} onClick={() => setActiveBoard(null)}>全部</button>
          {BOARDS.map(board => (
            <button key={board.key} className={`forum-board-chip ${activeBoard === board.key ? 'active' : ''}`} onClick={() => setActiveBoard(activeBoard === board.key ? null : board.key)}>
              {board.label}
            </button>
          ))}
        </div>

        {/* 发帖表单 */}
        {showNewPost && (
          <div className="new-post-form">
            <div className="form-header">
              <h3>发布新帖</h3>
              <div className="form-mode-tabs">
                <button className={`form-mode-tab ${!showPreview ? 'active' : ''}`} onClick={() => setShowPreview(false)}>编辑</button>
                <button className={`form-mode-tab ${showPreview ? 'active' : ''}`} onClick={() => setShowPreview(true)}>
                  <Eye size={12} /> 预览
                </button>
              </div>
            </div>

            {submitError && submitError.length > 0 && (
              <div className="form-errors">
                {submitError.map((err, i) => renderError(err, i))}
              </div>
            )}

            {!showPreview ? (
              <>
                <div className="form-row">
                  <select value={newPost.category} onChange={e => setNewPost({ ...newPost, category: e.target.value })} className="form-select">
                    {BOARDS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                  </select>
                </div>
                <input type="text" placeholder="帖子标题（最多100字）" value={newPost.title} onChange={e => setNewPost({ ...newPost, title: e.target.value })} className="form-input" maxLength={100} />
                <span className="form-char-count">{newPost.title.length}/100</span>
                <RichTextEditor
                  value={newPost.content}
                  onChange={val => setNewPost({ ...newPost, content: val })}
                  placeholder="帖子内容（支持 Markdown 格式：**粗体** *斜体* [链接](url) > 引用 - 列表）"
                />

                <div className="form-media-section">
                  <div className="form-media-upload">
                    <div className="image-mode-tabs">
                      <button type="button" className={`image-mode-tab ${imageInputMode === 'upload' ? 'active' : ''}`} onClick={() => setImageInputMode('upload')}>
                        <Upload size={14} /> 本地上传
                      </button>
                      <button type="button" className={`image-mode-tab ${imageInputMode === 'url' ? 'active' : ''}`} onClick={() => setImageInputMode('url')}>
                        <LinkIcon size={14} /> 图片链接
                      </button>
                    </div>

                    {imageInputMode === 'upload' ? (
                      <>
                        <button type="button" className="media-upload-btn" onClick={() => imageInputRef.current?.click()} disabled={newPost.images.length >= MAX_IMAGES || uploadingImages}>
                          <Upload size={16} /> {uploadingImages ? '上传中...' : `选择图片 (${newPost.images.length}/${MAX_IMAGES})`}
                        </button>
                        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={handleImageFileSelect} hidden />
                        <span className="media-hint">JPG/PNG/GIF/WebP，单张≤10MB，通过 ImgBB 托管</span>
                      </>
                    ) : (
                      <>
                        <div className="image-url-input-row">
                          <input
                            type="text"
                            placeholder="输入图片 URL，回车添加"
                            value={imageUrlInput}
                            onChange={e => setImageUrlInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addImageUrl(); } }}
                            className="form-input image-url-input"
                            disabled={newPost.images.length >= MAX_IMAGES}
                          />
                          <button type="button" className="media-upload-btn" onClick={addImageUrl} disabled={newPost.images.length >= MAX_IMAGES || !imageUrlInput.trim()}>
                            <Image size={16} /> 添加
                          </button>
                        </div>
                        <span className="media-hint">输入图片链接地址</span>
                      </>
                    )}
                  </div>

                  {newPost.images.length > 0 && (
                    <div className="form-image-previews">
                      {newPost.images.map((url, i) => (
                        <div key={i} className="form-image-thumb">
                          <img src={url} alt="" loading="lazy" onError={e => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23ddd" width="80" height="80"/><text x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="12">加载失败</text></svg>'; }} />
                          <button className="form-image-remove" onClick={() => removeImage(i)}><X size={10} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <input type="text" placeholder="标签（空格分隔，如：推荐 讨论 新番）" value={newPost.tags} onChange={e => setNewPost({ ...newPost, tags: e.target.value })} className="form-input" />
                </div>
              </>
            ) : (
              <PostPreview
                title={newPost.title}
                content={newPost.content}
                images={newPost.images}
                category={newPost.category}
              />
            )}

            <div className="form-actions">
              <button className="form-cancel" onClick={resetForm}>取消</button>
              <button className="form-submit" onClick={handleNewPost} disabled={submitting || uploadingImages}>
                {submitting || uploadingImages ? <><Loader2 size={14} className="spin" /> 发布中...</> : '发布'}
              </button>
            </div>
          </div>
        )}

        {/* 帖子列表 */}
        <div className="forum-posts">
          {loadingPosts ? (
            <div className="forum-loading"><Loader2 size={24} className="spin" /> 雨何时停？</div>
          ) : filteredPosts.length === 0 ? (
            <div className="forum-empty"><p>没有找到相关帖子</p></div>
          ) : (
            filteredPosts.map(post => {
              const author = getPostAuthor(post);
              const postImages = Array.isArray(post.images) ? post.images : [];
              const postTags = Array.isArray(post.tags) ? post.tags : [];
              const hasImage = postImages.length > 0;
              return (
                <Link to={`/forum/post/${post.id}`} key={post.id} className={`forum-post-card ${hasImage ? 'has-image' : ''}`}>
                  {hasImage && (
                    <div className="post-card-cover">
                      <img src={typeof postImages[0] === 'string' ? postImages[0] : postImages[0]?.preview} alt="" className="post-cover-img" loading="lazy" />
                      {postImages.length > 1 && <span className="post-cover-count">+{postImages.length - 1}</span>}
                    </div>
                  )}
                  <div className="post-card-body">
                    <div className="post-card-top">
                      <UserAvatar userId={post.author_id} src={author?.avatar} alt={author?.name} size={28} className="post-user-avatar" />
                      <span className="post-author">{author?.name}</span>
                      <span className="post-time-sep">·</span>
                      <span className="post-time">{timeAgo(post.created_at)}</span>
                      <div className="post-card-stats">
                        <span className="post-stat"><Heart size={12} /> {post.likes || 0}</span>
                        <span className="post-stat"><MessageCircle size={12} /> {post.replies_count || 0}</span>
                        <span className="post-stat"><Eye size={12} /> {post.views || 0}</span>
                      </div>
                    </div>
                    <h3 className="post-card-title">{post.title}</h3>
                    <p className="post-card-content">{post.content}</p>
                    <div className="post-card-bottom">
                      <span className={`post-cat-tag ${post.category}`}>{getCategoryLabel(post.category)}</span>
                      {postTags.length > 0 && (
                        <div className="post-card-tags">
                          {postTags.slice(0, 4).map(tag => (
                            <span key={tag} className="post-tag-pill">{tag}</span>
                          ))}
                          {postTags.length > 4 && <span className="post-tag-pill more">+{postTags.length - 4}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </main>

      <ForumRightSidebar posts={posts} hotPosts={hotPosts} hotTags={hotTags} onTagClick={setSearchQuery} />
    </div>
  );
}
