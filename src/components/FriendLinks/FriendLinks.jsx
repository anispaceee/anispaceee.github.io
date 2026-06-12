import { ExternalLink, Heart } from 'lucide-react';
import './FriendLinks.css';

const LINKS = [
  {
    name: 'Bangumi',
    url: 'https://bgm.tv',
    desc: '番组计划 — ACG 收藏与评分社区',
    logo: 'https://bgm.tv/img/favicon.ico',
  },
  {
    name: 'TouchGal',
    url: 'https://www.touchgal.ink',
    desc: 'Galgame 资源与交流平台',
    logo: 'https://www.touchgal.ink/favicon.ico',
  },
  {
    name: '真红小站',
    url: 'https://www.shinnku.com',
    desc: 'Galgame 资源站',
    logo: 'https://www.shinnku.com/favicon.ico',
  },
  {
    name: '轻小说文库',
    url: 'https://www.wenku8.net/',
    desc: '轻小说下载',
    logo: 'https://www.wenku8.net/favicon.ico',
  },
  {
    name: 'HikariNagi',
    url: 'https://www.hikarinagi.org/?orderby=modified',
    desc: '光凪 — ACG 资源聚合',
    logo: 'https://www.hikarinagi.org/favicon.ico',
  },
  {
    name: 'AniBT',
    url: 'https://anibt.net/',
    desc: '番组放送时刻表 — 当季番剧时间线',
    logo: 'https://anibt.net/favicon.ico',
  },
  {
    name: '同萌',
    url: 'https://www.ai2.moe/',
    desc: 'ACG 同萌社 — 二次元综合论坛',
    logo: 'https://www.ai2.moe/favicon.ico',
  },
  {
    name: '紫缘社',
    url: 'https://galzy.moe/',
    desc: 'Galgame 数据库 — 标签检索与评分',
    logo: 'https://galzy.moe/favicon.ico',
  },
  {
    name: 'ACGDB',
    url: 'https://acgdb.de/',
    desc: 'ACG 资源目录 — OpenList 驱动',
    logo: 'https://acgdb.de/favicon.ico',
  },
];

export default function FriendLinks() {
  return (
    <div className="friend-links-page">
      <div className="friend-links-header">
        <h1 className="friend-links-title">
          <Heart size={24} className="friend-links-title-icon" />
          友情链接
        </h1>
        <p className="friend-links-subtitle">与 ANISpace 志趣相投的站点</p>
      </div>

      <div className="friend-links-grid">
        {LINKS.map(link => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="friend-link-card"
          >
            <img
              src={link.logo}
              alt={link.name}
              className="friend-link-logo"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
            />
            <span className="friend-link-logo-fallback">{link.name[0]}</span>
            <div className="friend-link-info">
              <span className="friend-link-name">
                {link.name}
                <ExternalLink size={13} className="friend-link-external" />
              </span>
              <span className="friend-link-desc">{link.desc}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
