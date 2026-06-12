import { useState } from 'react';
import { MusashiService } from '../../services/musashiApi';
import { Plus, Edit3, Trash2, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react';

export default function ChapterManager({ workId, chapters, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editingChapter, setEditingChapter] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ chapter_number: '', title: '', content: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const openAddForm = () => {
    setEditingChapter(null);
    setForm({
      chapter_number: chapters.length + 1,
      title: '',
      content: '',
    });
    setError('');
    setShowForm(true);
  };

  const openEditForm = (ch) => {
    setEditingChapter(ch);
    setForm({
      chapter_number: ch.chapter_number || ch.order || '',
      title: ch.title || '',
      content: ch.content || '',
    });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingChapter(null);
    setForm({ chapter_number: '', title: '', content: '' });
    setError('');
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('章节标题不能为空');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const data = {
        chapter_number: Number(form.chapter_number) || undefined,
        title: form.title.trim(),
        content: form.content,
      };
      if (editingChapter) {
        await MusashiService.updateChapter(workId, editingChapter.id, data);
      } else {
        await MusashiService.addChapter(workId, data);
      }
      closeForm();
      onRefresh();
    } catch (err) {
      setError(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await MusashiService.deleteChapter(workId, deleteTarget.id);
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      setError(err.message || '删除失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReorder = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;
    const newOrder = [...chapters];
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    try {
      await MusashiService.reorderChapters(workId, newOrder.map(ch => ch.id));
      onRefresh();
    } catch {}
  };

  return (
    <div className="cm-section">
      <div className="cm-header">
        <h3 className="cm-title">章节管理</h3>
        <button className="work-btn work-btn-primary work-btn-sm" onClick={openAddForm}>
          <Plus size={14} /> 添加章节
        </button>
      </div>

      {chapters.length === 0 && (
        <div className="cm-empty">暂无章节，点击上方按钮添加</div>
      )}

      <div className="cm-list">
        {chapters.map((ch, i) => (
          <div key={ch.id || i} className="cm-item">
            <span className="cm-item-idx">{ch.chapter_number || i + 1}</span>
            <span className="cm-item-title">{ch.title || `第${i + 1}章`}</span>
            {ch.word_count != null && (
              <span className="cm-item-meta">{ch.word_count} 字</span>
            )}
            <div className="cm-item-actions">
              <button
                className="cm-action-btn"
                onClick={() => handleReorder(i, 'up')}
                disabled={i === 0}
                title="上移"
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="cm-action-btn"
                onClick={() => handleReorder(i, 'down')}
                disabled={i === chapters.length - 1}
                title="下移"
              >
                <ChevronDown size={14} />
              </button>
              <button className="cm-action-btn" onClick={() => openEditForm(ch)} title="编辑">
                <Edit3 size={14} />
              </button>
              <button className="cm-action-btn cm-action-danger" onClick={() => setDeleteTarget(ch)} title="删除">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ─── 添加/编辑表单弹窗 ─── */}
      {showForm && (
        <div className="cm-overlay" onClick={closeForm}>
          <div className="cm-dialog" onClick={e => e.stopPropagation()}>
            <div className="cm-dialog-header">
              <h3>{editingChapter ? '编辑章节' : '添加章节'}</h3>
              <button className="cm-dialog-close" onClick={closeForm}>
                <X size={18} />
              </button>
            </div>
            <div className="cm-dialog-body">
              <label className="work-form-label">
                章节序号
                <input
                  className="work-form-input"
                  type="number"
                  min={1}
                  value={form.chapter_number}
                  onChange={e => setForm(prev => ({ ...prev, chapter_number: e.target.value }))}
                />
              </label>
              <label className="work-form-label">
                标题 <span className="work-required">*</span>
                <input
                  className="work-form-input"
                  type="text"
                  placeholder="章节标题"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </label>
              <label className="work-form-label">
                正文
                <textarea
                  className="work-form-textarea cm-content-textarea"
                  placeholder="输入章节正文内容"
                  value={form.content}
                  onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
                  rows={10}
                />
              </label>
              {error && <div className="work-form-error">{error}</div>}
            </div>
            <div className="cm-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={closeForm} disabled={submitting}>
                取消
              </button>
              <button className="work-btn work-btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : editingChapter ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 删除确认弹窗 ─── */}
      {deleteTarget && (
        <div className="cm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="cm-dialog" onClick={e => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>确定要删除章节「{deleteTarget.title || `第${deleteTarget.chapter_number}章`}」吗？此操作无法撤销。</p>
            <div className="cm-dialog-actions">
              <button className="work-btn work-btn-secondary" onClick={() => setDeleteTarget(null)} disabled={submitting}>
                取消
              </button>
              <button className="work-btn work-btn-danger" onClick={handleDelete} disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
