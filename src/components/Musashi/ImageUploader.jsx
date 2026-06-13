import { useState, useRef, useCallback } from 'react';
import { ImagePlus, X, Loader2, Link } from 'lucide-react';
import './ImageUploader.css';

/**
 * 通用图片上传组件
 * 支持文件选择器上传（通过 /api/uploads → ImgBB）和手动输入 URL
 *
 * @param {object} props
 * @param {string} props.value - 当前图片 URL
 * @param {function} props.onChange - URL 变化回调 (url: string) => void
 * @param {string} [props.placeholder] - URL 输入框占位文本
 * @param {string} [props.label] - 标签文本
 * @param {boolean} [props.required] - 是否必填
 * @param {number} [props.maxSizeMB=5] - 最大文件大小 MB
 * @param {'cover'|'preview'|'page'} [props.variant='cover'] - 变体，影响预览样式
 */
export default function ImageUploader({
  value,
  onChange,
  placeholder = 'https://example.com/image.jpg',
  label = '图片',
  required = false,
  maxSizeMB = 5,
  variant = 'cover',
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [inputMode, setInputMode] = useState(value ? 'url' : 'upload'); // 'upload' | 'url'
  const fileInputRef = useRef(null);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 校验文件类型
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    // 校验文件大小
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`图片大小不能超过 ${maxSizeMB}MB`);
      return;
    }

    setError('');
    setUploading(true);
    try {
      const token = sessionStorage.getItem('acg_jwt_token');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `上传失败 ${res.status}`);
      }

      const data = await res.json();
      onChange(data.url);
    } catch (err) {
      setError(err.message || '上传失败');
    } finally {
      setUploading(false);
      // 重置 input 以便再次选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [maxSizeMB, onChange]);

  const handleUrlChange = useCallback((e) => {
    onChange(e.target.value);
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange('');
    setError('');
  }, [onChange]);

  return (
    <div className="iu-wrapper">
      {label && (
        <div className="iu-label">
          {label}
          {required && <span className="work-required">*</span>}
        </div>
      )}

      {/* 模式切换 */}
      <div className="iu-mode-tabs">
        <button
          type="button"
          className={`iu-mode-tab${inputMode === 'upload' ? ' active' : ''}`}
          onClick={() => setInputMode('upload')}
        >
          <ImagePlus size={14} />
          上传图片
        </button>
        <button
          type="button"
          className={`iu-mode-tab${inputMode === 'url' ? ' active' : ''}`}
          onClick={() => setInputMode('url')}
        >
          <Link size={14} />
          输入链接
        </button>
      </div>

      {/* 上传模式 */}
      {inputMode === 'upload' && (
        <div className="iu-upload-area">
          {value ? (
            <div className={`iu-preview iu-preview--${variant}`}>
              <img src={value} alt="预览" className="iu-preview-img" />
              <button type="button" className="iu-preview-remove" onClick={handleClear}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="iu-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 size={20} className="spin" />
                  <span>上传中...</span>
                </>
              ) : (
                <>
                  <ImagePlus size={20} />
                  <span>选择图片</span>
                  <span className="iu-upload-hint">最大 {maxSizeMB}MB</span>
                </>
              )}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="iu-file-input"
          />
        </div>
      )}

      {/* URL 输入模式 */}
      {inputMode === 'url' && (
        <div className="iu-url-area">
          <input
            type="text"
            className="work-form-input"
            placeholder={placeholder}
            value={value || ''}
            onChange={handleUrlChange}
          />
          {value && (
            <div className={`iu-preview iu-preview--${variant}`}>
              <img src={value} alt="预览" className="iu-preview-img" />
              <button type="button" className="iu-preview-remove" onClick={handleClear}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {error && <div className="work-form-error">{error}</div>}
    </div>
  );
}
