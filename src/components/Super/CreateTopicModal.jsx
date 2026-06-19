import { useState, useCallback } from 'react';
import { X, Send, Loader2, AlertCircle } from 'lucide-react';
import MarkdownEditor from '../Common/MarkdownEditor/MarkdownEditor';
import './GroupDetail.css';

/**
 * CreateTopicModal - 发帖弹窗组件
 * @param {Object} props
 * @param {Function} props.onClose - 关闭弹窗回调
 * @param {Function} props.onSubmit - 提交话题回调 (title, content) => Promise<void>
 * @param {boolean} props.loading - 外部加载状态（可选）
 */
export default function CreateTopicModal({ onClose, onSubmit, loading: externalLoading = false }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isLoading = loading || externalLoading;

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      setError('标题不能为空');
      return;
    }
    if (!content.trim()) {
      setError('内容不能为空');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit(title.trim(), content.trim());
      // 提交成功后由父组件处理关闭
    } catch (err) {
      setError(err.message || '发表话题失败');
    } finally {
      setLoading(false);
    }
  }, [title, content, onSubmit]);

  const handleClose = useCallback(() => {
    if (isLoading) return; // 加载中不允许关闭
    setTitle('');
    setContent('');
    setError(null);
    onClose();
  }, [isLoading, onClose]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  return (
    <div className="gd-modal-overlay" onClick={handleOverlayClick}>
      <div className="gd-modal" onClick={e => e.stopPropagation()}>
        <div className="gd-modal-header">
          <h3 className="gd-modal-title">发表话题</h3>
          <button
            className="gd-modal-close"
            onClick={handleClose}
            disabled={isLoading}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <div className="gd-modal-body">
          <div className="gd-modal-field">
            <label className="gd-modal-label">标题</label>
            <input
              type="text"
              className="gd-modal-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="请输入话题标题..."
              maxLength={200}
              disabled={isLoading}
            />
          </div>

          <div className="gd-modal-field">
            <label className="gd-modal-label">内容（支持 Markdown）</label>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="请输入话题内容，支持 Markdown 语法..."
              height={200}
              compact
            />
          </div>

          {error && (
            <div className="gd-modal-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="gd-modal-footer">
          <button
            className="gd-modal-btn gd-modal-cancel"
            onClick={handleClose}
            disabled={isLoading}
            type="button"
          >
            取消
          </button>
          <button
            className="gd-modal-btn gd-modal-submit"
            onClick={handleSubmit}
            disabled={isLoading || !title.trim() || !content.trim()}
            type="button"
          >
            {isLoading ? (
              <Loader2 size={16} className="gd-spinning" />
            ) : (
              <Send size={16} />
            )}
            <span>发表</span>
          </button>
        </div>
      </div>
    </div>
  );
}