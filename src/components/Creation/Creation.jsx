import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { StorageService, UserService } from '../../services/api';
import './Creation.css';

const categories = [
  { key: 'all', label: '全部', icon: '🎨' },
  { key: 'art', label: '绘画', icon: '🖌️' },
  { key: 'novel', label: '小说', icon: '📖' },
  { key: 'game', label: '游戏', icon: '🎮' },
];

const filterOptions = [
  { key: 'all', label: '全部作品' },
  { key: 'works', label: '作品展示' },
  { key: 'commission', label: '约稿' },
];

export default function Creation() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showPublish, setShowPublish] = useState(false);

  const filteredCreations = useMemo(() => {
    let items = [...mockCreations];

    if (activeCategory !== 'all') {
      items = items.filter(c => c.category === activeCategory);
    }

    if (activeFilter === 'works') {
      items = items.filter(c => !c.isCommission);
    } else if (activeFilter === 'commission') {
      items = items.filter(c => c.isCommission);
    }

    return items;
  }, [activeCategory, activeFilter]);

  const getUser = (userId) => UserService.getById(userId);

  const getCategoryLabel = (cat) => {
    const map = { art: '绘画', novel: '小说', game: '游戏' };
    return map[cat] || cat;
  };

  return (
    <div className="creation-page">
      <div className="creation-container">
        <div className="creation-header">
          <div className="creation-header-left">
            <h1 className="creation-title">🎨 创作区</h1>
            <p className="creation-subtitle">发布作品 · 发现创作者 · 约稿定制</p>
          </div>
          <button className="publish-btn" onClick={() => setShowPublish(!showPublish)}>
            ✏️ 发布作品
          </button>
        </div>

        {showPublish && (
          <div className="publish-form">
            <h3>发布新作品</h3>
            <div className="publish-type-select">
              <button className="publish-type-btn">🖌️ 绘画</button>
              <button className="publish-type-btn">📖 小说</button>
              <button className="publish-type-btn">🎮 游戏</button>
            </div>
            <input type="text" placeholder="作品标题" className="form-input" />
            <textarea placeholder="作品描述..." className="form-textarea" rows={4} />
            <div className="publish-upload">
              <div className="upload-area">
                <span>📷</span>
                <p>点击或拖拽上传图片</p>
              </div>
            </div>
            <input type="text" placeholder="标签（用空格分隔）" className="form-input" />
            <div className="publish-commission-toggle">
              <label>
                <input type="checkbox" /> 这是约稿信息
              </label>
            </div>
            <div className="form-actions">
              <button className="form-cancel" onClick={() => setShowPublish(false)}>取消</button>
              <button className="form-submit">发布</button>
            </div>
          </div>
        )}

        <div className="creation-toolbar">
          <div className="creation-categories">
            {categories.map(cat => (
              <button
                key={cat.key}
                className={`category-btn ${activeCategory === cat.key ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.key)}
              >
                <span>{cat.icon}</span> {cat.label}
              </button>
            ))}
          </div>
          <div className="creation-filters">
            {filterOptions.map(opt => (
              <button
                key={opt.key}
                className={`filter-btn ${activeFilter === opt.key ? 'active' : ''}`}
                onClick={() => setActiveFilter(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="creation-grid">
          {filteredCreations.map(item => {
            const user = getUser(item.userId);
            return (
              <Link to={`/creation/work/${item.id}`} key={item.id} className="creation-work-card">
                {item.isCommission && (
                  <div className="commission-badge">约稿</div>
                )}
                {item.images && item.images.length > 0 ? (
                  <div className="work-cover">
                    <img src={item.images[0]} alt={item.title} />
                    {item.images.length > 1 && (
                      <span className="work-img-count">📷 {item.images.length}</span>
                    )}
                  </div>
                ) : (
                  <div className="work-cover text-cover">
                    <span>{item.category === 'novel' ? '📖' : '🎮'}</span>
                    {item.words && <span className="work-words">{(item.words / 10000).toFixed(1)}万字</span>}
                    {item.progress && <span className="work-progress">{item.progress}</span>}
                  </div>
                )}
                <div className="work-body">
                  <h3 className="work-title">{item.title}</h3>
                  <p className="work-desc">{item.description}</p>
                  <div className="work-tags">
                    {item.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="work-tag">#{tag}</span>
                    ))}
                  </div>
                  <div className="work-footer">
                    <div className="work-author">
                      <img src={user?.avatar} alt="" className="work-author-avatar" />
                      <span className="work-author-name">{user?.name}</span>
                    </div>
                    <div className="work-stats">
                      <span>❤️ {item.likes}</span>
                      <span>👁 {item.views}</span>
                    </div>
                  </div>
                  {item.isCommission && item.commissionInfo && (
                    <div className="commission-info">
                      <div className="commission-price">💰 {item.commissionInfo.price}</div>
                      <div className="commission-slots">
                        剩余 {item.commissionInfo.available}/{item.commissionInfo.slots} 位
                      </div>
                      <div className="commission-deadline">⏰ {item.commissionInfo.deadline}</div>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
