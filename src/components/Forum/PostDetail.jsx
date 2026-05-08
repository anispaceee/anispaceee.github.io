import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { mockForumPosts, mockReplies, mockUsers } from '../../data/mockData';
import './PostDetail.css';

export default function PostDetail() {
  const { id } = useParams();
  const post = mockForumPosts.find(p => p.id === parseInt(id));
  const [replies, setReplies] = useState(mockReplies.filter(r => r.postId === parseInt(id)));
  const [newReply, setNewReply] = useState('');

  const getUser = (userId) => mockUsers.find(u => u.id === userId);

  const getCategoryLabel = (cat) => {
    const map = { game: '游戏', anime: '动画', novel: '小说', chat: '吹水' };
    return map[cat] || cat;
  };

  const handleReply = () => {
    if (!newReply.trim()) return;
    const reply = {
      id: replies.length + 100,
      postId: parseInt(id),
      userId: 1,
      content: newReply.trim(),
      timestamp: new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-'),
      likes: 0,
    };
    setReplies([...replies, reply]);
    setNewReply('');
  };

  if (!post) {
    return (
      <div className="post-detail-page">
        <div className="post-not-found">
          <span>🔍</span>
          <h2>帖子不存在</h2>
          <Link to="/forum" className="back-link">返回交流区</Link>
        </div>
      </div>
    );
  }

  const author = getUser(post.userId);

  return (
    <div className="post-detail-page">
      <div className="post-detail-container">
        <div className="post-detail-back">
          <Link to="/forum">← 返回交流区</Link>
        </div>

        <div className="post-detail-card">
          <div className="detail-header">
            <span className={`post-cat-tag ${post.category}`}>
              {getCategoryLabel(post.category)}
            </span>
            <h1 className="detail-title">{post.title}</h1>
          </div>

          <div className="detail-author">
            <img src={author?.avatar} alt="" className="detail-author-avatar" />
            <div className="detail-author-info">
              <span className="detail-author-name">{author?.name}</span>
              <span className="detail-author-level">Lv.{author?.level}</span>
              <span className="detail-time">{post.timestamp}</span>
            </div>
          </div>

          <div className="detail-content">{post.content}</div>

          {post.images && post.images.length > 0 && (
            <div className="detail-images">
              {post.images.map((img, i) => (
                <img key={i} src={img} alt="" className="detail-img" />
              ))}
            </div>
          )}

          <div className="detail-tags">
            {post.tags.map(tag => (
              <span key={tag} className="post-tag">#{tag}</span>
            ))}
          </div>

          <div className="detail-stats">
            <span>💬 {post.replies} 回复</span>
            <span>👁 {post.views} 浏览</span>
            <span>❤️ {post.likes} 喜欢</span>
          </div>
        </div>

        <div className="replies-section">
          <h2 className="replies-title">回复 ({replies.length})</h2>

          <div className="replies-list">
            {replies.map(reply => {
              const replyUser = getUser(reply.userId);
              return (
                <div key={reply.id} className="reply-item">
                  <img src={replyUser?.avatar} alt="" className="reply-avatar" />
                  <div className="reply-body">
                    <div className="reply-header">
                      <span className="reply-name">{replyUser?.name}</span>
                      <span className="reply-level">Lv.{replyUser?.level}</span>
                      <span className="reply-time">{reply.timestamp}</span>
                    </div>
                    <div className="reply-content">{reply.content}</div>
                    <div className="reply-actions">
                      <span className="reply-like">❤️ {reply.likes}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="reply-form">
            <textarea
              placeholder="写下你的回复..."
              value={newReply}
              onChange={e => setNewReply(e.target.value)}
              className="reply-input"
              rows={3}
            />
            <button className="reply-btn" onClick={handleReply} disabled={!newReply.trim()}>
              回复
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
