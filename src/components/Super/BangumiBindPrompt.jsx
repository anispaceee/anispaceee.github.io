import { Link } from 'react-router-dom';
import { AlertCircle, ExternalLink } from 'lucide-react';
import './BangumiBindPrompt.css';

/**
 * BangumiBindPrompt - 提示用户绑定 Bangumi 账号的卡片组件
 * 用于超展开功能中，当用户未绑定 Bangumi 账号时显示
 */
export default function BangumiBindPrompt() {
  return (
    <div className="bangumi-bind-prompt">
      <div className="bangumi-bind-prompt-icon">
        <AlertCircle size={24} />
      </div>
      <div className="bangumi-bind-prompt-content">
        <h3 className="bangumi-bind-prompt-title">需要绑定 Bangumi 账号</h3>
        <p className="bangumi-bind-prompt-desc">
          超展开功能需要您的 Bangumi 账号来获取小组数据。请先到个人主页的账号绑定设置中绑定 Bangumi 账号。
        </p>
      </div>
      <div className="bangumi-bind-prompt-actions">
        <Link to="/profile" className="bangumi-bind-prompt-btn primary">
          前往个人主页
        </Link>
        <a
          href="https://bgm.tv"
          target="_blank"
          rel="noopener noreferrer"
          className="bangumi-bind-prompt-btn secondary"
        >
          <ExternalLink size={14} />
          <span>访问 Bangumi 官网</span>
        </a>
      </div>
    </div>
  );
}