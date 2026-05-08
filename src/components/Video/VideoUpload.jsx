import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { VideoService } from '../../services/api';
import { Upload, X, Play, Pause, Image, Tag, Settings, FileText, Check, AlertCircle, Clock, Eye, Trash2, Edit3, Film } from 'lucide-react';
import './VideoUpload.css';

const VIDEO_FORMATS = ['video/mp4', 'video/avi', 'video/x-matroska', 'video/webm', 'video/quicktime'];
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const HOT_TAGS = ['动画', '游戏', 'MAD', 'AMV', '解说', '实况', '翻唱', '舞蹈', '鬼畜', '日常', '教程', '评测'];
const CATEGORIES = [
  { key: 'anime', label: '动画', subs: ['番剧', 'MAD·AMV', 'MMD·3D', '短片·手书·配音'] },
  { key: 'game', label: '游戏', subs: ['单机游戏', '电子竞技', '手机游戏', '网络游戏', '桌游棋牌'] },
  { key: 'novel', label: '小说', subs: ['轻小说', '网文', '有声书', '同人'] },
  { key: 'life', label: '生活', subs: ['日常', '美食', '萌宠', '手工', '绘画'] },
  { key: 'tech', label: '科技', subs: ['教程', '评测', '数码', '编程'] },
];

const PRIVACY_OPTIONS = [
  { key: 'public', label: '公开' },
  { key: 'followers', label: '仅粉丝可见' },
  { key: 'private', label: '仅自己可见' },
];

export default function VideoUpload() {
  const { currentUser, isAuthenticated, openAuth } = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  const [step, setStep] = useState(1);
  const [videoFile, setVideoFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [form, setForm] = useState({
    title: '', description: '', tags: [], category: '', subCategory: '',
    privacy: 'public', allowRepost: true, allowDanmaku: true, allowComment: true, allowDownload: false,
  });
  const [coverImage, setCoverImage] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState({});
  const [activeTab, setActiveTab] = useState('upload');
  const [submittedVideoId, setSubmittedVideoId] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all');

  const myVideos = isAuthenticated && currentUser
    ? VideoService.getAll().filter(v => v.authorId === currentUser.id || v.userId === currentUser.id)
    : [];

  const filteredHistory = historyFilter === 'all'
    ? myVideos
    : myVideos.filter(v => {
        if (historyFilter === 'published') return true;
        if (historyFilter === 'draft') return v.status === 'draft';
        return true;
      });

  if (!isAuthenticated) {
    return (
      <div className="video-upload-page">
        <div className="vu-auth-prompt">
          <Play size={48} />
          <h2>请先登录</h2>
          <p>登录后即可投稿视频</p>
          <button className="vu-login-btn" onClick={openAuth}>立即登录</button>
        </div>
      </div>
    );
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!VIDEO_FORMATS.includes(file.type) && !file.name.match(/\.(mp4|avi|mkv|webm|mov)$/i)) {
      setErrors(prev => ({ ...prev, file: '不支持的视频格式，请上传 MP4/AVI/MKV/WebM 格式' }));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrors(prev => ({ ...prev, file: '文件大小超过 2GB 限制' }));
      return;
    }
    setVideoFile(file);
    setErrors(prev => ({ ...prev, file: '' }));
    simulateUpload();
  };

  const simulateUpload = () => {
    setUploadStatus('uploading');
    setUploadProgress(0);
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 8 + 2;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setUploadStatus('done');
        setStep(2);
      }
      setUploadProgress(Math.min(progress, 100));
      setUploadSpeed(Math.floor(Math.random() * 5000 + 2000));
    }, 300);
  };

  const handlePauseResume = () => {
    setUploadStatus(prev => prev === 'uploading' ? 'paused' : 'uploading');
  };

  const handleCancel = () => {
    setVideoFile(null);
    setUploadProgress(0);
    setUploadStatus('idle');
  };

  const handleCoverSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setCoverPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const addTag = (tag) => {
    if (form.tags.length >= 10) return;
    const trimmed = tag.trim();
    if (trimmed && !form.tags.includes(trimmed)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, trimmed] }));
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const validateForm = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = '请输入视频标题';
    else if (form.title.length > 100) errs.title = '标题不能超过100个字符';
    if (!form.category) errs.category = '请选择分类';
    if (form.tags.length === 0) errs.tags = '请至少添加一个标签';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    if (!currentUser) return;
    const video = VideoService.add({
      title: form.title,
      description: form.description,
      tags: form.tags,
      category: form.category,
      subCategory: form.subCategory,
      privacy: form.privacy,
      cover: coverPreview || '',
      authorId: currentUser.id,
      author: currentUser.name,
      allowDanmaku: form.allowDanmaku,
      allowComment: form.allowComment,
    });
    setSubmittedVideoId(video.id);
    setStep(3);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatTime = (seconds) => {
    if (seconds <= 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const remainingTime = uploadSpeed > 0 && videoFile
    ? (videoFile.size * (1 - uploadProgress / 100)) / uploadSpeed
    : 0;

  const resetForm = () => {
    setStep(1);
    setVideoFile(null);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadStatus('idle');
    setForm({ title: '', description: '', tags: [], category: '', subCategory: '', privacy: 'public', allowRepost: true, allowDanmaku: true, allowComment: true, allowDownload: false });
    setCoverPreview('');
    setCoverImage(null);
    setTagInput('');
    setErrors({});
    setSubmittedVideoId(null);
  };

  return (
    <div className="video-upload-page">
      <div className="vu-container">
        <div className="vu-tabs">
          <button className={`vu-tab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
            <Upload size={16} /> 投稿视频
          </button>
          <button className={`vu-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <FileText size={16} /> 投稿历史
          </button>
        </div>

        {activeTab === 'history' && (
          <div className="vu-history">
            <div className="vu-history-filter">
              {[
                { key: 'all', label: '全部' },
                { key: 'published', label: '已发布' },
                { key: 'draft', label: '草稿' },
              ].map(f => (
                <button key={f.key} className={`vu-filter-btn ${historyFilter === f.key ? 'active' : ''}`} onClick={() => setHistoryFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            <div className="vu-history-list">
              {filteredHistory.length === 0 ? (
                <div className="vu-history-empty">
                  <Film size={32} />
                  <p>暂无投稿记录</p>
                </div>
              ) : (
                filteredHistory.map(v => (
                  <div key={v.id} className="vu-history-item" onClick={() => navigate(`/video/${v.id}`)}>
                    <div className="vu-history-thumb">
                      {v.cover ? <img src={v.cover} alt="" /> : <Play size={24} />}
                    </div>
                    <div className="vu-history-info">
                      <h3>{v.title}</h3>
                      <div className="vu-history-meta">
                        <span className="vu-status vu-status-published">已发布</span>
                        <span><Clock size={12} /> {v.createdAt}</span>
                        {v.views > 0 && <span><Eye size={12} /> {v.views}</span>}
                      </div>
                    </div>
                    <div className="vu-history-actions">
                      <button className="vu-action-btn" title="编辑" onClick={e => { e.stopPropagation(); }}><Edit3 size={16} /></button>
                      <button className="vu-action-btn danger" title="删除" onClick={e => { e.stopPropagation(); VideoService.delete(v.id); }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="vu-steps">
            <div className={`vu-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
              <span className="vu-step-num">{step > 1 ? <Check size={14} /> : 1}</span> 上传视频
            </div>
            <div className="vu-step-line" />
            <div className={`vu-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
              <span className="vu-step-num">{step > 2 ? <Check size={14} /> : 2}</span> 编辑信息
            </div>
            <div className="vu-step-line" />
            <div className={`vu-step ${step >= 3 ? 'active' : ''} ${step > 3 ? 'done' : ''}`}>
              <span className="vu-step-num"><Check size={14} /></span> 投稿完成
            </div>
          </div>
        )}

        {activeTab === 'upload' && step === 1 && (
          <div className="vu-upload-area">
            {!videoFile ? (
              <div className="vu-drop-zone" onClick={() => fileInputRef.current?.click()}>
                <Upload size={48} />
                <h3>拖拽视频文件到此处，或点击上传</h3>
                <p>支持 MP4、AVI、MKV、WebM 格式，最大 2GB</p>
                <input ref={fileInputRef} type="file" accept=".mp4,.avi,.mkv,.webm,.mov" onChange={handleFileSelect} hidden />
                {errors.file && <p className="vu-error"><AlertCircle size={14} /> {errors.file}</p>}
              </div>
            ) : (
              <div className="vu-upload-progress">
                <div className="vu-file-info">
                  <Play size={20} />
                  <div>
                    <p className="vu-file-name">{videoFile.name}</p>
                    <p className="vu-file-size">{formatSize(videoFile.size)}</p>
                  </div>
                </div>
                <div className="vu-progress-bar-wrap">
                  <div className="vu-progress-bar" style={{ width: `${uploadProgress}%` }} />
                </div>
                <div className="vu-progress-info">
                  <span>{uploadProgress.toFixed(1)}%</span>
                  <span>{formatSize(uploadSpeed)}/s</span>
                  <span>剩余 {formatTime(remainingTime)}</span>
                </div>
                <div className="vu-progress-actions">
                  {uploadStatus !== 'done' && (
                    <button className="vu-btn vu-btn-secondary" onClick={handlePauseResume}>
                      {uploadStatus === 'uploading' ? <><Pause size={14} /> 暂停</> : <><Play size={14} /> 继续</>}
                    </button>
                  )}
                  {uploadStatus !== 'done' && (
                    <button className="vu-btn vu-btn-danger" onClick={handleCancel}><X size={14} /> 取消</button>
                  )}
                  {uploadStatus === 'done' && <span className="vu-done-badge"><Check size={16} /> 上传完成</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'upload' && step === 2 && (
          <div className="vu-form">
            <div className="vu-form-main">
              <div className="vu-form-group">
                <label>视频标题 <span className="vu-required">*</span></label>
                <input className={`vu-input ${errors.title ? 'error' : ''}`} placeholder="请输入视频标题（最多100字）"
                  value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} maxLength={100} />
                <span className="vu-char-count">{form.title.length}/100</span>
                {errors.title && <p className="vu-error">{errors.title}</p>}
              </div>

              <div className="vu-form-group">
                <label>视频简介</label>
                <textarea className="vu-textarea" placeholder="介绍一下你的视频吧..." rows={4}
                  value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} />
              </div>

              <div className="vu-form-group">
                <label>标签 <span className="vu-required">*</span>（最多10个）</label>
                <div className="vu-tags-input">
                  {form.tags.map(tag => (
                    <span key={tag} className="vu-tag">{tag}<button onClick={() => removeTag(tag)}><X size={12} /></button></span>
                  ))}
                  {form.tags.length < 10 && (
                    <input placeholder="输入标签后回车" value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }} />
                  )}
                </div>
                <div className="vu-hot-tags">
                  <span className="vu-hot-label">热门：</span>
                  {HOT_TAGS.filter(t => !form.tags.includes(t)).slice(0, 8).map(tag => (
                    <button key={tag} className="vu-hot-tag" onClick={() => addTag(tag)}>{tag}</button>
                  ))}
                </div>
                {errors.tags && <p className="vu-error">{errors.tags}</p>}
              </div>

              <div className="vu-form-group">
                <label>分类 <span className="vu-required">*</span></label>
                <div className="vu-category-select">
                  <select className={`vu-select ${errors.category ? 'error' : ''}`} value={form.category}
                    onChange={e => setForm(prev => ({ ...prev, category: e.target.value, subCategory: '' }))}>
                    <option value="">请选择分类</option>
                    {CATEGORIES.map(cat => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
                  </select>
                  {form.category && (
                    <select className="vu-select" value={form.subCategory}
                      onChange={e => setForm(prev => ({ ...prev, subCategory: e.target.value }))}>
                      <option value="">请选择子分类</option>
                      {CATEGORIES.find(c => c.key === form.category)?.subs.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
                {errors.category && <p className="vu-error">{errors.category}</p>}
              </div>
            </div>

            <div className="vu-form-sidebar">
              <div className="vu-form-group">
                <label>视频封面</label>
                <div className="vu-cover-upload" onClick={() => coverInputRef.current?.click()}>
                  {coverPreview ? (
                    <img src={coverPreview} alt="cover" className="vu-cover-preview" />
                  ) : (
                    <div className="vu-cover-placeholder">
                      <Image size={32} />
                      <span>上传封面</span>
                      <span className="vu-cover-hint">建议 16:9 比例</span>
                    </div>
                  )}
                  <input ref={coverInputRef} type="file" accept="image/jpeg,image/png" onChange={handleCoverSelect} hidden />
                </div>
              </div>

              <div className="vu-form-group">
                <label><Settings size={14} /> 投稿设置</label>
                <div className="vu-settings">
                  <div className="vu-setting-item">
                    <span>隐私设置</span>
                    <select className="vu-select-sm" value={form.privacy}
                      onChange={e => setForm(prev => ({ ...prev, privacy: e.target.value }))}>
                      {PRIVACY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  </div>
                  <label className="vu-toggle"><input type="checkbox" checked={form.allowRepost} onChange={e => setForm(prev => ({ ...prev, allowRepost: e.target.checked }))} /><span>允许转载</span></label>
                  <label className="vu-toggle"><input type="checkbox" checked={form.allowDanmaku} onChange={e => setForm(prev => ({ ...prev, allowDanmaku: e.target.checked }))} /><span>允许弹幕</span></label>
                  <label className="vu-toggle"><input type="checkbox" checked={form.allowComment} onChange={e => setForm(prev => ({ ...prev, allowComment: e.target.checked }))} /><span>允许评论</span></label>
                  <label className="vu-toggle"><input type="checkbox" checked={form.allowDownload} onChange={e => setForm(prev => ({ ...prev, allowDownload: e.target.checked }))} /><span>允许下载</span></label>
                </div>
              </div>
            </div>

            <div className="vu-form-actions">
              <button className="vu-btn vu-btn-secondary" onClick={() => setStep(1)}>上一步</button>
              <button className="vu-btn vu-btn-primary" onClick={handleSubmit}>提交投稿</button>
            </div>
          </div>
        )}

        {activeTab === 'upload' && step === 3 && (
          <div className="vu-complete">
            <div className="vu-complete-icon"><Check size={48} /></div>
            <h2>投稿成功！</h2>
            <p>视频已直接发布，无需审核</p>
            <div className="vu-complete-status">
              <span className="vu-status vu-status-published">已发布</span>
            </div>
            <div className="vu-complete-actions">
              {submittedVideoId && (
                <button className="vu-btn vu-btn-primary" onClick={() => navigate(`/video/${submittedVideoId}`)}>查看视频</button>
              )}
              <button className="vu-btn vu-btn-secondary" onClick={resetForm}>继续投稿</button>
              <button className="vu-btn vu-btn-secondary" onClick={() => setActiveTab('history')}>查看投稿历史</button>
              <button className="vu-btn vu-btn-secondary" onClick={() => navigate('/video')}>返回影视区</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
