import { useState } from 'react';
import { MusashiService } from '../../services/musashiApi';
import { Plus, Trash2, ChevronDown, ChevronRight, X, Loader2, ImagePlus } from 'lucide-react';
import ImageUploader from './ImageUploader';

export default function MangaChapterManager({ workId, chapters, onRefresh }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ chapter_number: '', title: '' });
  const [addError, setAddError] = useState('');

  const [expandedChapter, setExpandedChapter] = useState(null);
  const [showPageForm, setShowPageForm] = useState(null); // chapterId
  const [pageForm, setPageForm] = useState({ image_url: '', page_number: '' });
  const [pageError, setPageError] = useState('');

  const [deleteChapterTarget, setDeleteChapterTarget] = useState(null);
  const [deletePageTarget, setDeletePageTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ─── 添加话 ───
  const handleAddChapter = async () => {
    if (!addForm.title.trim()) {
      setAddError('标题不能为空');
      return;
    }
    setAddError('');
    setSubmitting(true);
    try {
      await MusashiService.addMangaChapter(workId, {
        chapter_number: Number(addForm.chapter_number) || undefined,
        title: addForm.title.trim(),
      });
      setShowAddForm(false);
      setAddForm({ chapter_number: '', title: '' });
      onRefresh();
    } catch (err) {
      setAddError(err.message || '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 删除话 ───
  const handleDeleteChapter = async () => {
    if (!deleteChapterTarget) return;
    setSubmitting(true);
    try {
      await MusashiService.deleteMangaChapter(workId, deleteChapterTarget.id);
      setDeleteChapterTarget(null);
      setExpandedChapter(null);
      onRefresh();
    } catch {} finally {
      setSubmitting(false);
    }
  };

  // ─── 添加页面 ───
  const handleAddPage = async (chapterId) => {
    if (!pageForm.image_url.trim()) {
      setPageError('图片 URL 不能为空');
      return;
    }
    setPageError('');
    setSubmitting(true);
    try {
      await MusashiService.addMangaPage(workId, chapterId, {
        image_url: pageForm.image_url.trim(),
        page_number: Number(pageForm.page_number) || undefined,
      });
      setShowPageForm(null);
      setPageForm({ image_url: '', page_number: '' });
      onRefresh();
    } catch (err) {
      setPageError(err.message || '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 删除页面 ───
  const handleDeletePage = async () => {
    if (!deletePageTarget) return;
    setSubmitting(true);
    try {
      await MusashiService.deleteMangaPage(workId, deletePageTarget.id);
      setDeletePageTarget(null);
      onRefresh();
    } catch {} finally {
      setSubmitting(false);
    }
  };

  const toggleExpand = (chId) => {
    setExpandedChapter(prev => prev === chId ? null : chId);
  };

  return (
    <div className="cm-section">
      <div className="cm-header">
        <h3 className="cm-title">话数管理</h3>
        <button className="work-btn work-btn-primary work-btn-sm" onClick={() => setShowAddForm(true)}>
          <Plus size={14} /> 添加话
        </button>
      </div>

      {chapters.length === 0 && (
        <div className="cm-empty">暂无话数，点击上方按钮添加</div>
      )}

      <div className="cm-list">
        {chapters.map((ch, i) => {
          const pages = Array.isArray(ch.pages) ? ch.pages : [];
          const isExpanded = expandedChapter === ch.id;

          return (
            <div key={ch.id || i} className="mcm-chapter-block">
              <div className="cm-item">
                <button className="mcm-expand-btn" onClick={() => toggleExpand(ch.id)}>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span className="cm-item-idx">{ch.chapter_number || i + 1}</span>
                <span className="cm-item-title">{ch.title || `第${i + 1}话`}</span>
                {ch.page_count != null && (
                  <span className="cm-item-meta">{ch.page_count} 页</span>
                )}
                <div className="cm-item-actions">
                  <button
                    className="cm-action-btn cm-action-danger"
                    onClick={() => setDeleteChapterTarget(ch)}
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* ─── 展开的页面列表 ─── */}
              {isExpanded && (
                <div className="mcm-pages">
                  {pages.length > 0 && (
                    <div className="mcm-page-grid">
                      {pages.map((page, pi) => (
                        <div key={page.id || pi} className="mcm-page-item">
                          <img
                            src={page.image_url || page.imageUrl}
                            alt={`第${page.page_number || pi + 1}页`}
                            className="mcm-page-thumb"
                          />
                          <span className="mcm-page-num">P{page.page_number || pi + 1}</span>
                          <button
                            className="mcm-page-del"
                            onClick={() => setDeletePageTarget(page)}
                            title="删除页面"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {pages.length === 0 && (
                    <div className="mcm-pages-empty">暂无页面</div>
                  )}

                  {/* 上传页面按钮/表单 */}
                  {showPageForm === ch.id ? (
                    <div className="mcm-page-form">
                      <ImageUploader
                        value={pageForm.image_url}
                        onChange={(url) => setPageForm(prev => ({ ...prev, image_url: url }))}
                        label="页面图片"
                        placeholder="https://example.com/page.jpg"
                        variant="page"
                      />
                      <label className="work-form-label">
                        页码
                        <input
                          className="work-form-input mcm-page-num-input"
                          type="number"
                          min={1}
                          placeholder="页码"
                          value={pageForm.page_number}
                          onChange={e => setPageForm(prev => ({ ...prev, page_number: e.target.value }))}
                        />
                      </label>
                      {pageError && <div className="work-form-error">{pageError}</div>}
                      <div className="mcm-page-form-actions">
                        <button
                          className="work-btn work-btn-secondary work-btn-sm"
                          onClick={() => { setShowPageForm(null); setPageForm({ image_url: '', page_number: '' }); setPageError(''); }}
                        >
                          取消
                        </button>
                        <button
                          className="work-btn work-btn-primary work-btn-sm"
                          onClick={() => handleAddPage(ch.id)}
                          disabled={submitting}
                        >
                          {submitting ? <Loader2 size={14} className="spin" /> : '添加'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="work-btn work-btn-secondary work-btn-sm mcm-add-page-btn"
                      onClick={() => setShowPageForm(ch.id)}
                    >
                      <ImagePlus size={14} /> 上传页面
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── 添加话弹窗 ─── */}
      {showAddForm && (
        <div className="cm-overlay" onClick={() => setShowAddForm(false)}>
          <div className="cm-dialog" onClick={e => e.stopPropagation()}>
            <div className="cm-dialog-header">
              <h3>添加话</h3>
              <button className="cm-dialog-close" onClick={() => setShowAddForm(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="cm-dialog-body">
              <label className="work-form-label">
                话数序号
                <input
                  className="work-form-input"
                  type="number"
                  min={1}
                  value={addForm.chapter_number}
                  onChange={e => setAddForm(prev => ({ ...prev, chapter_number: e.target.value }))}
                />
              </label>
              <label className="work-form-label">
                标题 <span className="work-required">*</span>
                <input
                  className="work-form-input"
                  type="text"
                  placeholder="话数标题"
                  value={addForm.title}
                  onChange={e => setAddForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </label>
              {addError && <div className="work-form-error">{addError}</div>}
            </div>
            <div className="cm-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={() => setShowAddForm(false)} disabled={submitting}>
                取消
              </button>
              <button className="work-btn work-btn-primary" onClick={handleAddChapter} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 删除话确认弹窗 ─── */}
      {deleteChapterTarget && (
        <div className="cm-overlay" onClick={() => setDeleteChapterTarget(null)}>
          <div className="cm-dialog" onClick={e => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>确定要删除「{deleteChapterTarget.title || `第${deleteChapterTarget.chapter_number}话`}」及其所有页面吗？此操作无法撤销。</p>
            <div className="cm-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={() => setDeleteChapterTarget(null)} disabled={submitting}>
                取消
              </button>
              <button className="work-btn work-btn-danger" onClick={handleDeleteChapter} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 删除页面确认弹窗 ─── */}
      {deletePageTarget && (
        <div className="cm-overlay" onClick={() => setDeletePageTarget(null)}>
          <div className="cm-dialog" onClick={e => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>确定要删除第 {deletePageTarget.page_number} 页吗？</p>
            <div className="cm-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={() => setDeletePageTarget(null)} disabled={submitting}>
                取消
              </button>
              <button className="work-btn work-btn-danger" onClick={handleDeletePage} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
