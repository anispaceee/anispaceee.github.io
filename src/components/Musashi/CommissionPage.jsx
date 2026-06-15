import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MusashiService } from '../../services/musashiApi';
import { Briefcase, ArrowLeft, Plus, Clock, DollarSign, Loader2, Image, BookOpen, Palette, Gamepad2 } from 'lucide-react';
import './CommissionPage.css';

const CATEGORY_TABS = [
  { key: '', label: '全部', icon: null },
  { key: 'illustration', label: '插画', icon: Image },
  { key: 'novel', label: '小说', icon: BookOpen },
  { key: 'manga', label: '漫画', icon: Palette },
  { key: 'galgame', label: 'Galgame', icon: Gamepad2 },
];

export default function CommissionPage() {
  const navigate = useNavigate();
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const limit = 20;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await MusashiService.getCommissions({ page, limit, category, status: 'open' });
        if (!cancelled) {
          setCommissions(data.commissions || []);
          setTotal(data.total || 0);
        }
      } catch {
        if (!cancelled) setCommissions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [page, category]);

  const totalPages = Math.ceil(total / limit);

  const formatDeadline = (d) => {
    if (!d) return '不限';
    const date = new Date(d);
    const now = new Date();
    const days = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    if (days <= 0) return '已截止';
    if (days === 1) return '明天截止';
    return `${days}天后截止`;
  };

  return (
    <div className="cop-page">
      <div className="cop-header">
        <Link to="/musashi" className="cop-back">
          <ArrowLeft size={16} />
          返回武藏也
        </Link>
        <h1 className="cop-title">
          <Briefcase size={24} />
          约稿广场
        </h1>
        <button className="cop-create-btn" onClick={() => navigate('/musashi/commissions/new')}>
          <Plus size={14} />
          发布企划
        </button>
      </div>

      {/* 分类 */}
      <div className="cop-categories">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.key}
            className={`cop-cat-btn${category === tab.key ? ' active' : ''}`}
            onClick={() => { setCategory(tab.key); setPage(1); }}
          >
            {tab.icon && <tab.icon size={14} />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="cop-loading"><Loader2 size={32} className="cop-spinning" /><p>加载中...</p></div>
      ) : commissions.length === 0 ? (
        <div className="cop-empty"><Briefcase size={48} /><p>暂无约稿企划</p></div>
      ) : (
        <div className="cop-list">
          {commissions.map(comm => (
            <div
              key={comm.id}
              className="cop-item"
              onClick={() => navigate(`/musashi/commissions/${comm.id}`)}
            >
              <div className="cop-item-header">
                <span className="cop-item-category">{comm.category}</span>
                <span className="cop-item-status open">募集中</span>
              </div>
              <h3 className="cop-item-title">{comm.title}</h3>
              <p className="cop-item-desc">{comm.description?.slice(0, 100) || '暂无描述'}</p>
              <div className="cop-item-meta">
                <span className="cop-item-creator">
                  <img src={comm.creator_avatar} alt="" className="cop-item-avatar" />
                  {comm.creator_name}
                </span>
                {comm.budget_min && (
                  <span className="cop-item-budget">
                    <DollarSign size={12} />
                    {comm.budget_min}{comm.budget_max ? ` - ${comm.budget_max}` : '以上'}
                  </span>
                )}
                <span className="cop-item-deadline">
                  <Clock size={12} />
                  {formatDeadline(comm.deadline)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="cop-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}
    </div>
  );
}