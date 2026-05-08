import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Tv, Book, Gamepad2, Plus, ExternalLink, Loader2, AlertCircle, Newspaper, Calendar, Tag, TrendingUp } from 'lucide-react';
import './NewsZone.css';

const NEWS_TABS = [
  { key: 'anime', label: '动画', icon: Tv, color: '#409eff' },
  { key: 'novel', label: '小说', icon: Book, color: '#67c23a' },
  { key: 'game', label: '游戏', icon: Gamepad2, color: '#e6a23c' },
];

const MOCK_NEWS = {
  anime: [
    { id: 1, title: '2026年4月新番导视：30+部新番一览', category: '新番导视', date: '2026-04-01', source: 'ANISpace 编辑部', summary: '2026年4月新番季即将到来，本季将有多部重磅作品开播，包括多部续作和全新IP改编动画。', cover: '' },
    { id: 2, title: '《咒术回战》第三季制作决定', category: '新作速报', date: '2026-03-28', source: 'MANTANWEB', summary: '官方宣布《咒术回战》动画第三季制作决定，将继续由MAPPA负责制作。', cover: '' },
    { id: 3, title: '《葬送的芙莉莲》获第50届漫画大赏', category: '业界动态', date: '2026-03-25', source: 'ORICON', summary: '《葬送的芙莉莲》荣获第50届讲谈社漫画大赏，同时动画版全球播放量突破5亿。', cover: '' },
    { id: 4, title: '京都动画新作企划发表会定档6月', category: '业界动态', date: '2026-03-20', source: '京阿尼官网', summary: '京都动画宣布将于6月举办新作发表会，届时将公开多部新制作企划。', cover: '' },
    { id: 5, title: '《鬼灭之刃》无限城篇剧场版三部作确认', category: '新作速报', date: '2026-03-15', source: '集英社', summary: 'ufotable确认《鬼灭之刃》无限城篇将以三部剧场版形式上映。', cover: '' },
  ],
  novel: [
    { id: 6, title: '第33届电击小说大赏获奖作品公布', category: '文学赏', date: '2026-03-30', source: '电击文库', summary: '第33届电击小说大赏评选结果揭晓，大赏作品将于年内出版。', cover: '' },
    { id: 7, title: '《86-不存在的战区-》新卷发售决定', category: '新作发售', date: '2026-03-25', source: '电击文库', summary: '安里阿萨所著轻小说《86-不存在的战区-》新卷将于5月发售。', cover: '' },
    { id: 8, title: 'MF文库J 20周年纪念企划启动', category: '业界动态', date: '2026-03-20', source: 'MF文库J', summary: 'MF文库J启动20周年纪念企划，将推出多部人气作品的新作和联动活动。', cover: '' },
    { id: 9, title: '《狼与香辛料》新作小说连载开始', category: '新作速报', date: '2026-03-15', source: '电击文库', summary: '支仓冻砂宣布《狼与香辛料》系列新作小说开始连载，故事延续赫萝与罗伦斯的旅程。', cover: '' },
  ],
  game: [
    { id: 10, title: '《恋爱，我就借走咯》宣布官方中文版', category: '新作发售', date: '2026-04-01', source: 'Hikarinagi', summary: 'Galgame新作《恋爱，我就借走咯》宣布将推出官方中文版，预计年内发售。', cover: '' },
    { id: 11, title: '《久我山栞的死法手账》Steam正式发售', category: '新作发售', date: '2026-03-30', source: 'Laplacian', summary: 'Laplacian第七作《久我山栞的死法手账》正式于Steam平台发售，国区售价69元，首发优惠20%。', cover: '' },
    { id: 12, title: 'Liar-soft宣布两款新作制作计划', category: '业界动态', date: '2026-03-28', source: 'Liar-soft', summary: 'Liar-soft宣布将制作两款未命名新作，第一部由海原望导演、中村哲也原画，第二部为《エヴァーメイデン》系列续作。', cover: '' },
    { id: 13, title: '《几度相逢若初见》官中定档本周发售', category: '新作发售', date: '2026-03-25', source: '发行商公告', summary: '备受期待的Galgame《几度相逢若初见》官方中文版定档本周发售，支持Steam平台。', cover: '' },
    { id: 14, title: 'Key社新作企划情报解禁', category: '业界动态', date: '2026-03-20', source: 'Key/Visual Arts', summary: 'Key社宣布新作企划情报将于下月解禁，麻枝准将担任剧本创作。', cover: '' },
  ],
};

export default function NewsZone() {
  const [activeTab, setActiveTab] = useState('anime');
  const [newsList, setNewsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({ title: '', source: '', link: '', category: '' });

  useEffect(() => {
    fetchNews(activeTab);
  }, [activeTab]);

  const fetchNews = async (category) => {
    setLoading(true);
    try {
      const customNews = localStorage.getItem('acg_custom_news');
      const custom = customNews ? JSON.parse(customNews) : [];
      const categoryCustom = custom.filter(n => n.category === category);
      
      const mockData = MOCK_NEWS[category] || [];
      setNewsList([...categoryCustom, ...mockData]);
    } catch (err) {
      setNewsList(MOCK_NEWS[category] || []);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitApply = () => {
    if (!applyForm.title.trim() || !applyForm.link.trim()) {
      alert('请填写完整信息');
      return;
    }
    const saved = localStorage.getItem('acg_custom_news');
    const applications = saved ? JSON.parse(saved) : [];
    applications.push({
      ...applyForm,
      id: Date.now(),
      category: activeTab,
      date: new Date().toISOString().split('T')[0],
      summary: '',
      cover: '',
    });
    localStorage.setItem('acg_custom_news', JSON.stringify(applications));
    setApplyForm({ title: '', source: '', link: '', category: '' });
    setShowApplyModal(false);
    fetchNews(activeTab);
  };

  const getCategoryColor = (cat) => {
    const colors = {
      '新番导视': '#409eff',
      '新作速报': '#e6a23c',
      '业界动态': '#67c23a',
      '新作发售': '#f56c6c',
      '文学赏': '#909399',
    };
    return colors[cat] || '#409eff';
  };

  const currentNews = newsList;

  return (
    <div className="news-zone">
      <div className="news-zone-header">
        <div className="news-zone-title">
          <Newspaper size={20} />
          <h2>业界资讯</h2>
          <span className="news-zone-subtitle">二次元业界动态 · 新作发售 · 新番导视</span>
        </div>
        <button className="news-apply-btn" onClick={() => setShowApplyModal(true)}>
          <Plus size={14} /> 提交资讯
        </button>
      </div>

      <div className="news-tabs">
        {NEWS_TABS.map(tab => (
          <button
            key={tab.key}
            className={`news-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            style={{ '--news-color': tab.color }}
          >
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="news-loading"><Loader2 size={16} className="spinning" /> 加载资讯中...</div>
      ) : (
        <div className="news-list">
          {currentNews.length === 0 ? (
            <div className="news-empty">暂无资讯</div>
          ) : (
            currentNews.map(news => (
              <div key={news.id} className="news-item">
                <div className="news-item-content">
                  <div className="news-item-header">
                    <span className="news-item-category" style={{ backgroundColor: getCategoryColor(news.category) }}>
                      {news.category}
                    </span>
                    <span className="news-item-date"><Calendar size={10} /> {news.date}</span>
                    <span className="news-item-source">{news.source}</span>
                  </div>
                  <h3 className="news-item-title">{news.title}</h3>
                  {news.summary && <p className="news-item-summary">{news.summary}</p>}
                  {news.link && (
                    <a href={news.link} target="_blank" rel="noopener noreferrer" className="news-item-link">
                      <ExternalLink size={12} /> 查看原文
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showApplyModal && (
        <div className="news-apply-overlay" onClick={() => setShowApplyModal(false)}>
          <div className="news-apply-modal" onClick={e => e.stopPropagation()}>
            <div className="news-apply-header">
              <h3>提交资讯</h3>
              <button className="news-apply-close" onClick={() => setShowApplyModal(false)}>×</button>
            </div>
            <div className="news-apply-body">
              <div className="news-form-group">
                <label>资讯标题 *</label>
                <input type="text" placeholder="例如：XX新作发售" value={applyForm.title} onChange={e => setApplyForm(prev => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="news-form-group">
                <label>来源</label>
                <input type="text" placeholder="例如：电击文库" value={applyForm.source} onChange={e => setApplyForm(prev => ({ ...prev, source: e.target.value }))} />
              </div>
              <div className="news-form-group">
                <label>链接地址 *</label>
                <input type="url" placeholder="https://..." value={applyForm.link} onChange={e => setApplyForm(prev => ({ ...prev, link: e.target.value }))} />
              </div>
            </div>
            <div className="news-apply-footer">
              <button className="news-apply-cancel" onClick={() => setShowApplyModal(false)}>取消</button>
              <button className="news-apply-submit" onClick={handleSubmitApply}>提交</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
