import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { MusashiService } from '../../services/musashiApi';
import { Gamepad2, BookOpen, Palette, ArrowLeft, Loader2 } from 'lucide-react';
import ImageUploader from './ImageUploader';
import './WorkCreate.css';

const WORK_TYPES = [
  {
    key: 'galgame',
    label: 'Galgame',
    icon: Gamepad2,
    description: '视觉小说、文字冒险游戏，支持多分支剧情与资源下载',
  },
  {
    key: 'novel',
    label: '小说',
    icon: BookOpen,
    description: '轻小说、网文、同人创作，支持章节管理与阅读进度',
  },
  {
    key: 'manga',
    label: '漫画',
    icon: Palette,
    description: '原创漫画、四格、条漫，支持多话多页图片展示',
  },
];

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

export default function WorkCreate() {
  const { isAuthenticated } = useApp();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    coverUrl: '',
    tags: '',
    status: 'ongoing',
    visibility: 'public',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isAuthenticated) {
    return (
      <div className="work-create">
        <div className="work-create-auth-hint">请先登录后发布作品</div>
      </div>
    );
  }

  const handleTypeSelect = (type) => {
    setSelectedType(type);
    setStep(2);
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('标题不能为空');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const data = {
        type: selectedType,
        title: form.title.trim(),
        description: form.description.trim(),
        coverUrl: form.coverUrl.trim(),
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        status: form.status,
        visibility: form.visibility,
      };
      const result = await MusashiService.createWork(data);
      navigate(`/musashi/${result.id || result._id}/edit`);
    } catch (err) {
      setError(err.message || '创建失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="work-create">
      {step === 1 && (
        <>
          <h2 className="work-create-heading">选择作品类型</h2>
          <div className="work-type-grid">
            {WORK_TYPES.map(({ key, label, icon: Icon, description }) => (
              <button
                key={key}
                className={`work-type-card${selectedType === key ? ' selected' : ''}`}
                onClick={() => handleTypeSelect(key)}
              >
                <Icon size={28} className="work-type-icon" />
                <span className="work-type-label">{label}</span>
                <span className="work-type-desc">{description}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="work-create-header">
            <button className="work-back-btn" onClick={() => setStep(1)}>
              <ArrowLeft size={16} />
              返回
            </button>
            <h2 className="work-create-heading">填写基础信息</h2>
          </div>

          <div className="work-form">
            <label className="work-form-label">
              标题 <span className="work-required">*</span>
              <input
                className="work-form-input"
                type="text"
                placeholder="输入作品标题"
                value={form.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
                maxLength={100}
              />
            </label>

            <label className="work-form-label">
              简介
              <textarea
                className="work-form-textarea"
                placeholder="简要描述你的作品"
                value={form.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                rows={4}
                maxLength={2000}
              />
            </label>

            <ImageUploader
              value={form.coverUrl}
              onChange={(url) => handleFormChange('coverUrl', url)}
              label="封面图"
              placeholder="https://example.com/cover.jpg"
              variant="cover"
            />

            <label className="work-form-label">
              标签
              <input
                className="work-form-input"
                type="text"
                placeholder="用逗号分隔，如：恋爱,校园,奇幻"
                value={form.tags}
                onChange={(e) => handleFormChange('tags', e.target.value)}
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

            {error && <div className="work-form-error">{error}</div>}

            <div className="work-form-actions">
              <button
                className="work-btn work-btn-secondary"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                返回
              </button>
              <button
                className="work-btn work-btn-primary"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? <Loader2 size={16} className="spin" /> : '创建作品'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
