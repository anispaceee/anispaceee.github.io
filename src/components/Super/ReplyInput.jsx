import { useState } from 'react';
import { Send, X, Loader2 } from 'lucide-react';

/**
 * ReplyInput - 回复输入组件
 * 用于 TopicDetail 页面中发表回复
 * @param {Function} onSubmit - 提交回调 (content, related)
 * @param {number|null} related - 关联楼层 ID
 * @param {string} relatedAuthor - 关联楼层作者名
 * @param {boolean} disabled - 是否禁用
 * @param {boolean} loading - 是否正在提交
 * @param {Function} onClearRelated - 清除关联回调
 */
export default function ReplyInput({
  onSubmit,
  related = null,
  relatedAuthor = '',
  disabled = false,
  loading = false,
  onClearRelated,
}) {
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (!content.trim() || disabled || loading) return;
    onSubmit && onSubmit(content.trim(), related);
    setContent('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="ri-container">
      {/* 回复关联提示 */}
      {related && (
        <div className="ri-related-bar">
          <span className="ri-related-text">
            回复 <strong>{relatedAuthor}</strong> (#{related} 楼)
          </span>
          <button className="ri-clear-btn" onClick={onClearRelated}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 输入区 */}
      <div className="ri-input-area">
        <textarea
          className="ri-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? '请先登录后再回复' : '写下你的回复... (Ctrl+Enter 发送)'}
          disabled={disabled || loading}
          rows={4}
        />

        {/* 发送按钮 */}
        <button
          className="ri-send-btn"
          onClick={handleSubmit}
          disabled={!content.trim() || disabled || loading}
        >
          {loading ? (
            <Loader2 size={18} className="ri-spinning" />
          ) : (
            <Send size={18} />
          )}
          <span>{loading ? '发送中...' : '发送'}</span>
        </button>
      </div>

      {/* 提示 */}
      <div className="ri-hint">
        <span>支持 Markdown 格式，Ctrl+Enter 快捷发送</span>
      </div>
    </div>
  );
}