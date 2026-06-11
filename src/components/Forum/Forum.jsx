import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ForumService } from '../../services/api';
import { renderMarkdown } from '../../utils/renderMarkdown';
import { MessageCircle, Gamepad2, Tv, BookOpen, Coffee, Plus, Search, TrendingUp, Clock, Heart, Image, X, Eye, Bold, Italic, Link as LinkIcon, List, Quote, AlertCircle, Loader2, Flame, Hash } from 'lucide-react';
import UserAvatar from '../Common/UserAvatar';
import './Forum.css';

const MAX_IMAGES = 5;

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

function RichTextEditor({ value, onChange, placeholder }) {
  const textareaRef = useRef(null);

  const insertMarkdown = (prefix, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);
    const newText = value.substring(0, start) + prefix + selected + suffix + value.substring(end);
    onChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const toolbarActions = [
    { icon: <Bold size={14} />, title: '粗体', action: () => insertMarkdown('**', '**') },
    { icon: <Italic size={14} />, title: '斜体', action: () => insertMarkdown('*', '*') },
    { icon: <LinkIcon size={14} />, title: '链接', action: () => insertMarkdown('[', '](url)') },
    { icon: <List size={14} />, title: '列表', action: () => insertMarkdown('- ') },
    { icon: <Quote size={14} />, title: '引用', action: () => insertMarkdown('> ') },
  ];

  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        {toolbarActions.map((btn, i) => (
          <button key={i} className="rich-toolbar-btn" title={btn.title} type="button" onClick={btn.action}>
            {btn.icon}
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="rich-textarea"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={8}
      />
    </div>
  );
}

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

export default function Forum() {
  const { isAuthenticated, openAuth } = useApp();
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

  return (
    <div className="forum-page">
      <div className="forum-layout">
        {/* 左栏 7fr */}
        <div className="forum-main">
          <div className="forum-header">
            <h1 className="forum-title"><MessageCircle size={22} /> 放課後</h1>
            <button className="new-post-btn" onClick={() => { if (!isAuthenticated) { openAuth(); return; } setShowNewPost(!showNewPost); }}>
              <Plus size={16} /> 发帖
            </button>
          </div>

          {/* 搜索栏 pill */}
          <div className="forum-search-bar-pill">
            <Search size={16} />
            <input type="text" placeholder="搜索帖子..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>

          {/* 排序 pills */}
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
                          <Image size={16} /> 添加 ({newPost.images.length}/{MAX_IMAGES})
                        </button>
                      </div>
                      <span className="media-hint">输入图片链接地址，支持 JPG/PNG/WebP/GIF</span>
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
                <button className="form-submit" onClick={handleNewPost} disabled={submitting}>
                  {submitting ? <><Loader2 size={14} className="spin" /> 发布中...</> : '发布'}
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
                return (
                  <Link to={`/forum/post/${post.id}`} key={post.id} className="forum-post-card">
                    <UserAvatar userId={post.author_id} src={author?.avatar} alt={author?.name} size={40} className="post-user-avatar" />
                    <div className="post-card-body">
                      <div className="post-card-header">
                        <span className={`post-cat-tag ${post.category}`}>{getCategoryLabel(post.category)}</span>
                        <h3 className="post-card-title">{post.title}</h3>
                      </div>
                      <p className="post-card-content">{post.content}</p>
                      <div className="post-card-footer">
                        <span className="post-author">{author?.name}</span>
                        <span className="post-time">{post.created_at}</span>
                        <span className="post-stat"><MessageCircle size={11} /> {post.replies_count || 0}</span>
                        <span className="post-stat"><Eye size={11} /> {post.views || 0}</span>
                        <span className="post-stat"><Heart size={11} /> {post.likes || 0}</span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* 右栏 3fr sticky */}
        <div className="forum-sidebar">
          {/* 板块列表 */}
          <div className="sidebar-section">
            <h3 className="sidebar-section-title">板块</h3>
            {BOARDS.map(board => {
              const Icon = board.icon;
              return (
                <div key={board.key} className="sidebar-board-item" style={{ '--board-color': board.color }} onClick={() => setActiveBoard(activeBoard === board.key ? null : board.key)}>
                  <div className="sidebar-board-color" />
                  <Icon size={16} />
                  <div className="sidebar-board-info">
                    <span className="sidebar-board-name">{board.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 热门帖子 */}
          <div className="sidebar-section">
            <h3 className="sidebar-section-title"><Flame size={14} /> 热门帖子</h3>
            {hotPosts.map((post, idx) => (
              <Link to={`/forum/post/${post.id}`} key={post.id} className="sidebar-hot-item">
                <span className="sidebar-hot-rank">{idx + 1}</span>
                <div className="sidebar-hot-info">
                  <span className="sidebar-hot-title">{post.title}</span>
                  <span className="sidebar-hot-meta"><Eye size={10} /> {post.views || 0}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* 热门标签 */}
          {hotTags.length > 0 && (
            <div className="sidebar-section">
              <h3 className="sidebar-section-title"><Hash size={14} /> 热门标签</h3>
              <div className="sidebar-tag-cloud">
                {hotTags.map(tag => (
                  <button key={tag} className="sidebar-tag-pill" onClick={() => setSearchQuery(tag)}>{tag}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
