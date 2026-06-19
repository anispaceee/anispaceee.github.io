import { Clock, MessageCircle } from 'lucide-react';
import { renderMarkdown } from '../../utils/renderMarkdown';

/**
 * PostItem - 帖子楼层组件
 * 用于 TopicDetail 页面中展示单个帖子/回复
 * @param {Object} post - 帖子数据
 * @param {number} floor - 楼层号
 * @param {Function} onReply - 回复按钮回调
 */
export default function PostItem({ post, floor, onReply }) {
  const {
    id,
    author,
    author_avatar,
    content,
    created_at,
    related,
  } = post;

  // 格式化时间
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;

    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}-${day}`;
  };

  const authorName = author || '匿名用户';
  const avatarUrl = author_avatar || '';

  return (
    <div className="pi-item">
      {/* 楼层号 */}
      <div className="pi-floor">
        <span className="pi-floor-num">{floor}</span>
        <span className="pi-floor-label">楼</span>
      </div>

      {/* 用户头像 */}
      <div className="pi-avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt={authorName} loading="lazy" />
        ) : (
          <div className="pi-avatar-placeholder">
            <span>{authorName[0]}</span>
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div className="pi-body">
        {/* 头部：用户名 + 时间 */}
        <div className="pi-header">
          <span className="pi-author">{authorName}</span>
          <span className="pi-time">
            <Clock size={12} />
            <span>{formatTime(created_at)}</span>
          </span>
        </div>

        {/* 回复关联提示 */}
        {related && (
          <div className="pi-related">
            <MessageCircle size={12} />
            <span>回复 #{related} 楼</span>
          </div>
        )}

        {/* 帖子内容 */}
        <div
          className="pi-content"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content || '') }}
        />

        {/* 操作按钮 */}
        <div className="pi-actions">
          <button className="pi-reply-btn" onClick={() => onReply && onReply(id, authorName)}>
            <MessageCircle size={14} />
            <span>回复</span>
          </button>
        </div>
      </div>
    </div>
  );
}