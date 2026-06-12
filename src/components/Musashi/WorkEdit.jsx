import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MusashiService } from '../../services/musashiApi';
import { useApp } from '../../context/AppContext';
import ChapterManager from './ChapterManager';
import MangaChapterManager from './MangaChapterManager';
import GalgameDownloadManager from './GalgameDownloadManager';
import { ArrowLeft, Loader2, Trash2, AlertCircle } from 'lucide-react';
import './WorkEdit.css';

const STATUS_OPTIONS = [
  { key: 'ongoing', label: '连载中' },
  { key: 'completed', label: '已完结' },
  { key: 'hiatus', label: '搁置' },
];

const VISIBILITY_OPTIONS = [
  { key: 'public', label: '公开' },
  { key: 'unlisted', label: '不列出' },
  { key: 'private', label: '私密' },
];

const TYPE_LABELS = {
  galgame: 'Galgame',
  novel: '小说',
  manga: '漫画',
};

export default function WorkEdit() {
  const { workId } = useParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated } = useApp();

  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    coverUrl: '',
    tags: '',
    status: 'ongoing',
    visibility: 'public',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [chapters, setChapters] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // ─── 加载作品详情 ───
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await MusashiService.getWork(workId);
        if (!cancelled) {
          setWork(data);
          setForm({
            title: data.title || '',
            description: data.description || '',
            coverUrl: data.cover_image || data.coverUrl || '',
            tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
            status: data.status || 'ongoing',
            visibility: data.visibility || 'public',
          });
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

  // ─── 加载章节列表 ───
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
  }, [work, workId, refreshKey]);

  // ─── 权限检查 ───
  const isAuthor = currentUser && work && (currentUser.id === work.author_id || currentUser.id === work.authorId);

  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setSaveError('标题不能为空');
      return;
    }
    setSaveError('');
    setSaving(true);
    try {
      const data = {
        title: form.title.trim(),
        description: form.description.trim(),
        coverUrl: form.coverUrl.trim(),
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        status: form.status,
        visibility: form.visibility,
      };
      await MusashiService.updateWork(workId, data);
      // 重新加载作品详情
      const updated = await MusashiService.getWork(workId);
      setWork(updated);
    } catch (err) {
      setSaveError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await MusashiService.deleteWork(workId);
      navigate('/musashi/my');
    } catch (err) {
      setSaveError(err.message || '删除失败');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  // ─── 加载中 ───
  if (loading) {
    return (
      <div className="work-edit">
        <div className="work-edit-loading">
          <Loader2 size={32} className="spin" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !work) {
    return (
      <div className="work-edit">
        <div className="work-edit-error">
          <AlertCircle size={48} />
          <h2>{error || '作品不存在'}</h2>
          <button className="work-btn work-btn-secondary" onClick={() => navigate('/musashi')}>
            返回武藏也
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isAuthor) {
    return (
      <div className="work-edit">
        <div className="work-edit-error">
          <AlertCircle size={48} />
          <h2>无权编辑此作品</h2>
          <button className="work-btn work-btn-secondary" onClick={() => navigate(`/musashi/${workId}`)}>
            返回作品页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="work-edit">
      {/* ─── 头部 ─── */}
      <div className="work-edit-header">
        <button className="work-back-btn" onClick={() => navigate(`/musashi/${workId}`)}>
          <ArrowLeft size={16} />
          返回作品
        </button>
        <h2 className="work-edit-heading">编辑作品</h2>
        <span className="work-edit-type-badge">{TYPE_LABELS[work.type] || work.type}</span>
      </div>

      {/* ─── 基础信息表单 ─── */}
      <div className="work-form">
        <label className="work-form-label">
          标题 <span className="work-required">*</span>
          <input
            className="work-form-input"
            type="text"
            placeholder="输入作品标题"
            value={form.title}
            onChange={e => handleFormChange('title', e.target.value)}
            maxLength={100}
          />
        </label>

        <label className="work-form-label">
          简介
          <textarea
            className="work-form-textarea"
            placeholder="简要描述你的作品"
            value={form.description}
            onChange={e => handleFormChange('description', e.target.value)}
            rows={4}
            maxLength={2000}
          />
        </label>

        <label className="work-form-label">
          封面图 URL
          <input
            className="work-form-input"
            type="text"
            placeholder="https://example.com/cover.jpg"
            value={form.coverUrl}
            onChange={e => handleFormChange('coverUrl', e.target.value)}
          />
        </label>

        <label className="work-form-label">
          标签
          <input
            className="work-form-input"
            type="text"
            placeholder="用逗号分隔，如：恋爱,校园,奇幻"
            value={form.tags}
            onChange={e => handleFormChange('tags', e.target.value)}
          />
        </label>

        <label className="work-form-label">
          状态
          <div className="work-form-pills">
            {STATUS_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                className={`work-pill${form.status === key ? ' active' : ''}`}
                onClick={() => handleFormChange('status', key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </label>

        <label className="work-form-label">
          可见性
          <div className="work-form-pills">
            {VISIBILITY_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                className={`work-pill${form.visibility === key ? ' active' : ''}`}
                onClick={() => handleFormChange('visibility', key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </label>

        {saveError && <div className="work-form-error">{saveError}</div>}

        <div className="work-form-actions">
          <button
            className="work-btn work-btn-secondary"
            onClick={() => navigate(`/musashi/${workId}`)}
            disabled={saving}
          >
            返回
          </button>
          <button
            className="work-btn work-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={16} className="spin" /> : '保存修改'}
          </button>
        </div>
      </div>

      {/* ─── 类型对应管理器 ─── */}
      <div className="work-edit-section">
        {work.type === 'novel' && (
          <ChapterManager workId={workId} chapters={chapters} onRefresh={handleRefresh} />
        )}
        {work.type === 'manga' && (
          <MangaChapterManager workId={workId} chapters={chapters} onRefresh={handleRefresh} />
        )}
        {work.type === 'galgame' && (
          <GalgameDownloadManager
            workId={workId}
            downloads={Array.isArray(work.downloads) ? work.downloads : []}
            previews={Array.isArray(work.preview_images) ? work.preview_images : []}
            onRefresh={handleRefresh}
          />
        )}
      </div>

      {/* ─── 删除作品 ─── */}
      <div className="work-edit-danger-zone">
        <h3 className="work-edit-danger-title">危险操作</h3>
        <button
          className="work-btn work-btn-danger"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 size={14} />
          删除作品
        </button>
      </div>

      {/* ─── 删除确认弹窗 ─── */}
      {showDeleteConfirm && (
        <div className="work-edit-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="work-edit-dialog" onClick={e => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>删除后无法恢复，确定要删除作品「{work.title}」吗？</p>
            <div className="work-edit-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                取消
              </button>
              <button
                className="work-btn work-btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 size={14} className="spin" /> : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
