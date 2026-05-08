import { useParams, Link } from 'react-router-dom';
import { mockCreations, mockUsers } from '../../data/mockData';
import './CreationDetail.css';

export default function CreationDetail() {
  const { id } = useParams();
  const item = mockCreations.find(c => c.id === parseInt(id));

  if (!item) {
    return (
      <div className="creation-detail-page">
        <div className="creation-not-found">
          <span>🔍</span>
          <h2>作品不存在</h2>
          <Link to="/creation" className="back-link">返回创作区</Link>
        </div>
      </div>
    );
  }

  const user = mockUsers.find(u => u.id === item.userId);
  const categoryLabel = item.category === 'art' ? '绘画' : item.category === 'novel' ? '小说' : '游戏';

  return (
    <div className="creation-detail-page">
      <div className="creation-detail-container">
        <div className="creation-detail-back">
          <Link to="/creation">← 返回创作区</Link>
        </div>

        <div className="creation-detail-card">
          <div className="cd-top">
            <div className="cd-left">
              {item.images && item.images.length > 0 ? (
                <div className="cd-images">
                  {item.images.map((img, i) => (
                    <img key={i} src={img} alt="" className="cd-image" />
                  ))}
                </div>
              ) : (
                <div className="cd-no-image">
                  <span>{item.category === 'novel' ? '📖' : '🎮'}</span>
                </div>
              )}
            </div>
            <div className="cd-right">
              <div className="cd-badges">
                <span className={`cd-cat ${item.category}`}>{categoryLabel}</span>
                {item.isCommission && <span className="cd-commission-badge">约稿</span>}
              </div>
              <h1 className="cd-title">{item.title}</h1>
              <div className="cd-author-row">
                <img src={user?.avatar} alt="" className="cd-author-avatar" />
                <div>
                  <span className="cd-author-name">{user?.name}</span>
                  <span className="cd-author-level">Lv.{user?.level}</span>
                </div>
                <span className="cd-time">{item.timestamp}</span>
              </div>
              <div className="cd-stats-row">
                <span>❤️ {item.likes}</span>
                <span>👁 {item.views}</span>
              </div>
              <div className="cd-tags">
                {item.tags.map(tag => (
                  <span key={tag} className="cd-tag">#{tag}</span>
                ))}
              </div>
              <div className="cd-description">
                <h3>作品描述</h3>
                <p>{item.description}</p>
              </div>
              {item.chapters && (
                <div className="cd-meta-item">
                  <span className="cd-meta-label">章节数</span>
                  <span>{item.chapters} 章</span>
                </div>
              )}
              {item.words && (
                <div className="cd-meta-item">
                  <span className="cd-meta-label">字数</span>
                  <span>{(item.words / 10000).toFixed(1)} 万字</span>
                </div>
              )}
              {item.progress && (
                <div className="cd-meta-item">
                  <span className="cd-meta-label">开发进度</span>
                  <span>{item.progress}</span>
                </div>
              )}
            </div>
          </div>

          {item.isCommission && item.commissionInfo && (
            <div className="cd-commission-section">
              <h2>💰 约稿信息</h2>
              <div className="commission-details">
                <div className="commission-detail-item">
                  <span className="commission-label">约稿类型</span>
                  <span className="commission-value">{item.commissionInfo.type}</span>
                </div>
                <div className="commission-detail-item">
                  <span className="commission-label">价格</span>
                  <span className="commission-value price">{item.commissionInfo.price}</span>
                </div>
                <div className="commission-detail-item">
                  <span className="commission-label">剩余名额</span>
                  <span className="commission-value">{item.commissionInfo.available}/{item.commissionInfo.slots}</span>
                </div>
                <div className="commission-detail-item">
                  <span className="commission-label">预计工期</span>
                  <span className="commission-value">{item.commissionInfo.deadline}</span>
                </div>
              </div>
              <button className="commission-apply-btn">申请约稿</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
