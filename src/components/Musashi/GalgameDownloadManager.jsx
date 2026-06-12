import { useState } from 'react';
import { MusashiService } from '../../services/musashiApi';
import { Plus, Edit3, Trash2, X, Loader2, ImagePlus } from 'lucide-react';

const PLATFORM_OPTIONS = [
  { key: 'windows', label: 'Windows' },
  { key: 'mac', label: 'Mac' },
  { key: 'linux', label: 'Linux' },
  { key: 'android', label: 'Android' },
  { key: 'ios', label: 'iOS' },
  { key: 'other', label: '其他' },
];

const EMPTY_DOWNLOAD_FORM = {
  platform: 'windows',
  version: '',
  url: '',
  file_size: '',
  password: '',
};

export default function GalgameDownloadManager({ workId, downloads, previews, onRefresh }) {
  // ─── 下载链接状态 ───
  const [showDlForm, setShowDlForm] = useState(false);
  const [editingDl, setEditingDl] = useState(null);
  const [dlForm, setDlForm] = useState({ ...EMPTY_DOWNLOAD_FORM });
  const [dlError, setDlError] = useState('');
  const [deleteDlTarget, setDeleteDlTarget] = useState(null);

  // ─── 预览图状态 ───
  const [showPreviewForm, setShowPreviewForm] = useState(false);
  const [previewForm, setPreviewForm] = useState({ image_url: '', caption: '' });
  const [previewError, setPreviewError] = useState('');
  const [deletePreviewTarget, setDeletePreviewTarget] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  // ─── 下载链接操作 ───
  const openAddDl = () => {
    setEditingDl(null);
    setDlForm({ ...EMPTY_DOWNLOAD_FORM });
    setDlError('');
    setShowDlForm(true);
  };

  const openEditDl = (dl) => {
    setEditingDl(dl);
    setDlForm({
      platform: dl.platform || 'windows',
      version: dl.version || '',
      url: dl.url || '',
      file_size: dl.file_size || '',
      password: dl.password || '',
    });
    setDlError('');
    setShowDlForm(true);
  };

  const closeDlForm = () => {
    setShowDlForm(false);
    setEditingDl(null);
    setDlForm({ ...EMPTY_DOWNLOAD_FORM });
    setDlError('');
  };

  const handleDlSubmit = async () => {
    if (!dlForm.url.trim()) {
      setDlError('下载链接不能为空');
      return;
    }
    setDlError('');
    setSubmitting(true);
    try {
      const data = {
        platform: dlForm.platform,
        version: dlForm.version.trim(),
        url: dlForm.url.trim(),
        file_size: dlForm.file_size.trim(),
        password: dlForm.password.trim(),
      };
      if (editingDl) {
        await MusashiService.updateDownload(workId, editingDl.id, data);
      } else {
        await MusashiService.addDownload(workId, data);
      }
      closeDlForm();
      onRefresh();
    } catch (err) {
      setDlError(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDl = async () => {
    if (!deleteDlTarget) return;
    setSubmitting(true);
    try {
      await MusashiService.deleteDownload(workId, deleteDlTarget.id);
      setDeleteDlTarget(null);
      onRefresh();
    } catch {} finally {
      setSubmitting(false);
    }
  };

  // ─── 预览图操作 ───
  const openPreviewForm = () => {
    setPreviewForm({ image_url: '', caption: '' });
    setPreviewError('');
    setShowPreviewForm(true);
  };

  const handlePreviewSubmit = async () => {
    if (!previewForm.image_url.trim()) {
      setPreviewError('图片 URL 不能为空');
      return;
    }
    setPreviewError('');
    setSubmitting(true);
    try {
      await MusashiService.addPreview(workId, {
        image_url: previewForm.image_url.trim(),
        caption: previewForm.caption.trim(),
      });
      setShowPreviewForm(false);
      setPreviewForm({ image_url: '', caption: '' });
      onRefresh();
    } catch (err) {
      setPreviewError(err.message || '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePreview = async () => {
    if (!deletePreviewTarget) return;
    setSubmitting(true);
    try {
      await MusashiService.deletePreview(workId, deletePreviewTarget.id);
      setDeletePreviewTarget(null);
      onRefresh();
    } catch {} finally {
      setSubmitting(false);
    }
  };

  const platformLabel = (key) => {
    const found = PLATFORM_OPTIONS.find(p => p.key === key);
    return found ? found.label : key;
  };

  const dlList = Array.isArray(downloads) ? downloads : [];
  const pvList = Array.isArray(previews) ? previews : [];

  return (
    <div className="cm-section">
      {/* ─── 下载链接管理 ─── */}
      <div className="cm-header">
        <h3 className="cm-title">下载链接</h3>
        <button className="work-btn work-btn-primary work-btn-sm" onClick={openAddDl}>
          <Plus size={14} /> 添加下载链接
        </button>
      </div>

      {dlList.length === 0 && (
        <div className="cm-empty">暂无下载链接</div>
      )}

      <div className="gdm-dl-list">
        {dlList.map((dl, i) => (
          <div key={dl.id || i} className="gdm-dl-item">
            <div className="gdm-dl-info">
              <span className="gdm-dl-platform">{platformLabel(dl.platform)}</span>
              <span className="gdm-dl-version">v{dl.version || '1.0'}</span>
              {dl.file_size && <span className="gdm-dl-size">{dl.file_size}</span>}
              {dl.password && <span className="gdm-dl-pwd">密码: {dl.password}</span>}
            </div>
            <div className="gdm-dl-actions">
              <button className="cm-action-btn" onClick={() => openEditDl(dl)} title="编辑">
                <Edit3 size={14} />
              </button>
              <button className="cm-action-btn cm-action-danger" onClick={() => setDeleteDlTarget(dl)} title="删除">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ─── 预览图管理 ─── */}
      <div className="cm-header" style={{ marginTop: 24 }}>
        <h3 className="cm-title">预览图</h3>
        <button className="work-btn work-btn-primary work-btn-sm" onClick={openPreviewForm}>
          <ImagePlus size={14} /> 上传预览图
        </button>
      </div>

      {pvList.length === 0 && (
        <div className="cm-empty">暂无预览图</div>
      )}

      <div className="gdm-preview-grid">
        {pvList.map((pv, i) => (
          <div key={pv.id || i} className="gdm-preview-item">
            <img
              src={typeof pv === 'string' ? pv : (pv.image_url || pv.imageUrl)}
              alt={pv.caption || `预览 ${i + 1}`}
              className="gdm-preview-thumb"
            />
            <button
              className="gdm-preview-del"
              onClick={() => setDeletePreviewTarget(typeof pv === 'string' ? { id: `preview-${i}`, image_url: pv } : pv)}
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* ─── 下载链接表单弹窗 ─── */}
      {showDlForm && (
        <div className="cm-overlay" onClick={closeDlForm}>
          <div className="cm-dialog" onClick={e => e.stopPropagation()}>
            <div className="cm-dialog-header">
              <h3>{editingDl ? '编辑下载链接' : '添加下载链接'}</h3>
              <button className="cm-dialog-close" onClick={closeDlForm}>
                <X size={18} />
              </button>
            </div>
            <div className="cm-dialog-body">
              <label className="work-form-label">
                平台
                <div className="work-form-pills">
                  {PLATFORM_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      className={`work-pill${dlForm.platform === key ? ' active' : ''}`}
                      onClick={() => setDlForm(prev => ({ ...prev, platform: key }))}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="work-form-label">
                版本
                <input
                  className="work-form-input"
                  type="text"
                  placeholder="如 1.0"
                  value={dlForm.version}
                  onChange={e => setDlForm(prev => ({ ...prev, version: e.target.value }))}
                />
              </label>
              <label className="work-form-label">
                下载 URL <span className="work-required">*</span>
                <input
                  className="work-form-input"
                  type="text"
                  placeholder="https://example.com/download"
                  value={dlForm.url}
                  onChange={e => setDlForm(prev => ({ ...prev, url: e.target.value }))}
                />
              </label>
              <label className="work-form-label">
                文件大小
                <input
                  className="work-form-input"
                  type="text"
                  placeholder="如 1.2 GB"
                  value={dlForm.file_size}
                  onChange={e => setDlForm(prev => ({ ...prev, file_size: e.target.value }))}
                />
              </label>
              <label className="work-form-label">
                解压密码
                <input
                  className="work-form-input"
                  type="text"
                  placeholder="选填"
                  value={dlForm.password}
                  onChange={e => setDlForm(prev => ({ ...prev, password: e.target.value }))}
                />
              </label>
              {dlError && <div className="work-form-error">{dlError}</div>}
            </div>
            <div className="cm-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={closeDlForm} disabled={submitting}>
                取消
              </button>
              <button className="work-btn work-btn-primary" onClick={handleDlSubmit} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : editingDl ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 预览图表单弹窗 ─── */}
      {showPreviewForm && (
        <div className="cm-overlay" onClick={() => setShowPreviewForm(false)}>
          <div className="cm-dialog" onClick={e => e.stopPropagation()}>
            <div className="cm-dialog-header">
              <h3>上传预览图</h3>
              <button className="cm-dialog-close" onClick={() => setShowPreviewForm(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="cm-dialog-body">
              <label className="work-form-label">
                图片 URL <span className="work-required">*</span>
                <input
                  className="work-form-input"
                  type="text"
                  placeholder="https://example.com/preview.jpg"
                  value={previewForm.image_url}
                  onChange={e => setPreviewForm(prev => ({ ...prev, image_url: e.target.value }))}
                />
              </label>
              <label className="work-form-label">
                说明
                <input
                  className="work-form-input"
                  type="text"
                  placeholder="选填"
                  value={previewForm.caption}
                  onChange={e => setPreviewForm(prev => ({ ...prev, caption: e.target.value }))}
                />
              </label>
              {previewError && <div className="work-form-error">{previewError}</div>}
            </div>
            <div className="cm-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={() => setShowPreviewForm(false)} disabled={submitting}>
                取消
              </button>
              <button className="work-btn work-btn-primary" onClick={handlePreviewSubmit} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 删除下载链接确认弹窗 ─── */}
      {deleteDlTarget && (
        <div className="cm-overlay" onClick={() => setDeleteDlTarget(null)}>
          <div className="cm-dialog" onClick={e => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>确定要删除此下载链接吗？</p>
            <div className="cm-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={() => setDeleteDlTarget(null)} disabled={submitting}>
                取消
              </button>
              <button className="work-btn work-btn-danger" onClick={handleDeleteDl} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 删除预览图确认弹窗 ─── */}
      {deletePreviewTarget && (
        <div className="cm-overlay" onClick={() => setDeletePreviewTarget(null)}>
          <div className="cm-dialog" onClick={e => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>确定要删除此预览图吗？</p>
            <div className="cm-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={() => setDeletePreviewTarget(null)} disabled={submitting}>
                取消
              </button>
              <button className="work-btn work-btn-danger" onClick={handleDeletePreview} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
