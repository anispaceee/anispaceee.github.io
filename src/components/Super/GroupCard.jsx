import { Link } from 'react-router-dom';
import { Users, MessageCircle } from 'lucide-react';
import './GroupCard.css';

/**
 * GroupCard - 小组卡片组件
 * 用于超展开功能中展示小组信息
 * @param {Object} group - 小组数据
 * @param {string} group.id - 小组ID
 * @param {string} group.name - 小组名称
 * @param {string} group.title - 小组标题
 * @param {string} [group.icon] - 小组图标URL
 * @param {string} [group.desc] - 小组简介
 * @param {number} [group.members] - 成员数
 * @param {number} [group.topics] - 话题数
 * @param {number} [group.posts] - 帖子数
 * @param {boolean} [group.nsfw] - 是否为NSFW小组
 */
export default function GroupCard({ group }) {
  const {
    id,
    name,
    title,
    icon,
    desc,
    members = 0,
    topics = 0,
    nsfw = false,
  } = group;

  // 截断简介到100字符
  const truncatedDesc = desc && desc.length > 100 ? desc.slice(0, 100) + '...' : desc;

  return (
    <Link to={`/super/group/${name}`} className="gc-card">
      <div className="gc-icon">
        {icon ? (
          <img src={icon} alt={title || name} loading="lazy" />
        ) : (
          <div className="gc-icon-placeholder">
            <span>{(title || name || '?')[0]}</span>
          </div>
        )}
      </div>

      <div className="gc-content">
        <div className="gc-header">
          <h3 className="gc-title">{title || name}</h3>
          {nsfw && <span className="gc-nsfw-badge">NSFW</span>}
        </div>

        {truncatedDesc && (
          <p className="gc-desc">{truncatedDesc}</p>
        )}

        <div className="gc-stats">
          <span className="gc-stat">
            <Users size={14} />
            <span>{members.toLocaleString()}</span>
          </span>
          <span className="gc-stat">
            <MessageCircle size={14} />
            <span>{topics.toLocaleString()}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}