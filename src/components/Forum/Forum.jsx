import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ForumService, UserService } from '../../services/api';
import { safeUrl, sanitizeHtml } from '../../utils/sanitize.js';
import { MessageCircle, Gamepad2, Tv, BookOpen, Coffee, Plus, Search, Users, FileText, TrendingUp, Clock, Heart, Image, Video, X, Eye, Bold, Italic, Link as LinkIcon, List, Quote, AlertCircle, Upload, Loader2, Flame, Hash } from 'lucide-react';
import UserAvatar from '../Common/UserAvatar';
import './Forum.css';

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

const BOARDS = [
  {
    key: 'anime',
    label: '动画',
    icon: Tv,
    color: 'var(--tag-anime)',
    description: '新番讨论 · 旧番回顾 · MAD·AMV',
    subs: [
      { key: 'anime-new', label: '新番讨论', description: '当季新番讨论' },
      { key: 'anime-classic', label: '旧番回顾', description: '经典作品回顾' },
      { key: 'anime-mad', label: 'MAD·AMV', description: '二次创作视频' },
    ],
  },
  {
    key: 'game',
    label: '游戏',
    icon: Gamepad2,
    color: 'var(--tag-game)',
    description: '单机·主机 · 手游 · 网游',
    subs: [
      { key: 'game-pc', label: '单机·主机', description: 'PC/主机游戏讨论' },
      { key: 'game-mobile', label: '手游', description: '手机游戏讨论' },
      { key: 'game-online', label: '网游', description: '网络游戏讨论' },
    ],
  },
  {
    key: 'novel',
    label: '小说',
    icon: BookOpen,
    color: 'var(--tag-novel)',
    description: '轻小说 · 网文 · 同人',
    subs: [
      { key: 'novel-light', label: '轻小说', description: '日本轻小说讨论' },
      { key: 'novel-web', label: '网文', description: '网络小说讨论' },
      { key: 'novel-doujin', label: '同人', description: '同人创作讨论' },
    ],
  },
  {
    key: 'chat',
    label: '吹水',
    icon: Coffee,
    color: 'var(--tag-chat)',
    description: '日常闲聊 · 活动公告',
    subs: [
      { key: 'chat-daily', label: '日常闲聊', description: '随意聊天灌水' },
      { key: 'chat-activity', label: '活动公告', description: '社区活动与公告' },
    ],
  },
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

function PostPreview({ title, content, images, videoUrl, category }) {
  const renderContent = (text) => {
    if (!text) return null;
    let html = sanitizeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
        safeUrl(url) ? `<img src="${safeUrl(url)}" alt="${alt}" style="max-width:100%;border-radius:8px;margin:8px 0" loading="lazy" />` : ''
      )
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) =>
        safeUrl(url) ? `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text
      )
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n/g, '<br/>');
    html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
    return <div className="preview-content" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div className="post-preview">
      <div className="preview-header">
        <span className={`post-cat-tag ${category}`}>{({ game: '游戏', anime: '动画', novel: '小说', chat: '吹水' })[category]}</span>
        <h3 className="preview-title">{title || '帖子标题预览'}</h3>
      </div>
      {renderContent(content)}
      {images && images.length > 0 && (
        <div className="preview-images">
          {images.map((img, i) => (
            <img key={i} src={img.preview} alt="" className="preview-img" loading="lazy" />
          ))}
        </div>
      )}
      {videoUrl && (
        <div className="preview-video">
          <video src={videoUrl} controls className="preview-video-player" />
        </div>
      )}
    </div>
  );
}

export default function Forum() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const [activeBoard, setActiveBoard] = useState(null);
  const [activeSub, setActiveSub] = useState(null);
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
    videoUrl: '',
  });
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const data = await ForumService.getPosts(1, 100);
        setPosts(data.posts || []);
      } catch {
        setPosts([]);
      } finally {
        setLoadingPosts(false);
      }
    };
    loadPosts();
  }, []);

  const filteredPosts = useMemo(() => {
    let filtered = [...posts];
    if (activeBoard) {
      filtered = filtered.filter(p => p.category === activeBoard);
    }
    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.tags && p.tags.some(t => t.includes(searchQuery)))
      );
    }
    switch (sortBy) {
      case 'hot': filtered.sort((a, b) => (b.views || 0) - (a.views || 0)); break;
      case 'replies': filtered.sort((a, b) => (b.replies_count || 0) - (a.replies_count || 0)); break;
      default: break;
    }
    return filtered;
  }, [activeBoard, sortBy, searchQuery, posts]);

  const getUser = (userId) => UserService.getById(userId);
  const getPostAuthor = (post) => {
    if (post.author_name) return { name: post.author_name, avatar: post.author_avatar };
    return getUser(post.author_id);
  };
  const getCategoryLabel = (cat) => ({ game: '游戏', anime: '动画', novel: '小说', chat: '吹水' }[cat] || cat);

  const validatePost = useCallback(() => {
    const errors = [];
    if (!newPost.title.trim()) errors.push({ type: 'format', message: '请输入帖子标题' });
    else if (newPost.title.length > 100) errors.push({ type: 'format', message: '标题不能超过100个字符' });
    if (!newPost.content.trim()) errors.push({ type: 'format', message: '请输入帖子内容' });
    if (newPost.images.length > MAX_IMAGES) errors.push({ type: 'format', message: `最多上传${MAX_IMAGES}张图片` });
    return errors;
  }, [newPost]);

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const errors = [];
    const validFiles = [];

    files.forEach(file => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        errors.push({ type: 'format', message: `${file.name} 格式不支持，仅支持 JPG/PNG` });
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        errors.push({ type: 'format', message: `${file.name} 超过10MB限制` });
        return;
      }
      validFiles.push(file);
    });

    if (errors.length > 0) {
      setSubmitError(errors);
      return;
    }

    const remaining = MAX_IMAGES - newPost.images.length;
    const toProcess = validFiles.slice(0, remaining);

    toProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setNewPost(prev => ({
          ...prev,
          images: [...prev.images, { file, preview: ev.target.result, name: file.name }],
        }));
      };
      reader.readAsDataURL(file);
    });

    setSubmitError(null);
    e.target.value = '';
  };

  const handleVideoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      setSubmitError([{ type: 'format', message: '视频格式不支持，仅支持 MP4/WebM' }]);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setSubmitError([{ type: 'format', message: '视频文件超过200MB限制' }]);
      e.target.value = '';
      return;
    }

    const url = URL.createObjectURL(file);
    setNewPost(prev => ({ ...prev, videoUrl: url }));
    setSubmitError(null);
    e.target.value = '';
  };

  const removeImage = (index) => {
    setNewPost(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const removeVideo = () => {
    if (newPost.videoUrl) URL.revokeObjectURL(newPost.videoUrl);
    setNewPost(prev => ({ ...prev, videoUrl: '' }));
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

      const created = await ForumService.createPost({
        title: newPost.title.trim(),
        content: newPost.content.trim(),
        category: newPost.category,
        tags,
      });

      setPosts(prev => [created, ...prev]);

      setShowNewPost(false);
      setShowPreview(false);
      setNewPost({ title: '', content: '', category: 'chat', tags: '', images: [], videoUrl: '' });
      setSubmitError(null);
    } catch (err) {
      setSubmitError([{ type: 'network', message: err.message || '发帖失败，请重试' }]);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    if (newPost.videoUrl) URL.revokeObjectURL(newPost.videoUrl);
    setNewPost({ title: '', content: '', category: 'chat', tags: '', images: [], videoUrl: '' });
    setShowNewPost(false);
    setShowPreview(false);
    setSubmitError(null);
  };

  const renderError = (error, index) => {
    const icon = error.type === 'network' ? <AlertCircle size={14} />
      : error.type === 'format' ? <AlertCircle size={14} />
      : error.type === 'auth' ? <AlertCircle size={14} />
      : <AlertCircle size={14} />;
    const colorClass = error.type === 'network' ? 'error-network'
      : error.type === 'format' ? 'error-format'
      : error.type === 'auth' ? 'error-auth'
      : 'error-default';
    return (
      <div key={index} className={`form-error-item ${colorClass}`}>
        {icon}
        <span>{error.message}</span>
        {error.type === 'network' && <span className="form-error-hint">请检查网络后重试</span>}
        {error.type === 'format' && <span className="form-error-hint">请修改后重新提交</span>}
        {error.type === 'auth' && <span className="form-error-hint">点击此处登录</span>}
      </div>
    );
  };

  // 计算热门帖子（按浏览量前5）
  const hotPosts = useMemo(() => {
    return [...posts].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  }, [posts]);

  // 计算热门标签
  const hotTags = useMemo(() => {
    const tagMap = {};
    posts.forEach(p => {
      if (p.tags) p.tags.forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
    });
    return Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([tag]) => tag);
  }, [posts]);

  return (
    <div className="forum-page">
      <div className="forum-layout">
        {/* 左栏 7fr */}
        <div className="forum-main">
          <div className="forum-header">
            <h1 className="forum-title"><MessageCircle size={22} /> 交流区</h1>
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
                    <div className="form-media-row">
                      <div className="form-media-upload">
                        <button type="button" className="media-upload-btn" onClick={() => imageInputRef.current?.click()} disabled={newPost.images.length >= MAX_IMAGES}>
                          <Image size={16} /> 添加图片 ({newPost.images.length}/{MAX_IMAGES})
                        </button>
                        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png" multiple onChange={handleImageSelect} hidden />
                        <span className="media-hint">JPG/PNG，单张≤10MB</span>
                      </div>
                      <div className="form-media-upload">
                        <button type="button" className="media-upload-btn" onClick={() => videoInputRef.current?.click()} disabled={!!newPost.videoUrl}>
                          <Video size={16} /> 添加视频
                        </button>
                        <input ref={videoInputRef} type="file" accept="video/mp4,video/webm" onChange={handleVideoSelect} hidden />
                        <span className="media-hint">MP4/WebM，≤200MB</span>
                      </div>
                    </div>

                    {newPost.images.length > 0 && (
                      <div className="form-image-previews">
                        {newPost.images.map((img, i) => (
                          <div key={i} className="form-image-thumb">
                            <img src={img.preview} alt="" loading="lazy" />
                            <button className="form-image-remove" onClick={() => removeImage(i)}><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                    )}

                    {newPost.videoUrl && (
                      <div className="form-video-preview">
                        <video src={newPost.videoUrl} className="form-video-thumb" muted />
                        <button className="form-video-remove" onClick={removeVideo}><X size={14} /> 移除视频</button>
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
                  videoUrl={newPost.videoUrl}
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
              <div className="forum-loading"><Loader2 size={24} className="spin" /> 加载中...</div>
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
              const boardPosts = posts.filter(p => p.category === board.key);
              return (
                <div key={board.key} className="sidebar-board-item" style={{ '--board-color': board.color }} onClick={() => setActiveBoard(activeBoard === board.key ? null : board.key)}>
                  <div className="sidebar-board-color" />
                  <Icon size={16} />
                  <div className="sidebar-board-info">
                    <span className="sidebar-board-name">{board.label}</span>
                    <span className="sidebar-board-count">{boardPosts.length} 帖</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 热门帖子 */}
          <div className="sidebar-section">
            <h3 className="sidebar-section-title"><Flame size={14} /> 热门帖子</h3>
            {hotPosts.map((post, idx) => {
              const author = getPostAuthor(post);
              return (
                <Link to={`/forum/post/${post.id}`} key={post.id} className="sidebar-hot-item">
                  <span className="sidebar-hot-rank">{idx + 1}</span>
                  <div className="sidebar-hot-info">
                    <span className="sidebar-hot-title">{post.title}</span>
                    <span className="sidebar-hot-meta"><Eye size={10} /> {post.views || 0}</span>
                  </div>
                </Link>
              );
            })}
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
