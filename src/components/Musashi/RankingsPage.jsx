import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MusashiService } from '../../services/musashiApi';
import { TrendingUp, Star, Eye, Loader2, ArrowLeft } from 'lucide-react';
import './RankingsPage.css';

const CATEGORIES = [
  { key: 'all', label: '综合' },
  { key: 'illustration', label: '插画' },
  { key: 'novel', label: '小说' },
  { key: 'manga', label: '漫画' },
  { key: 'galgame', label: 'Galgame' },
];

const RANK_TYPES = [
  { key: 'daily', label: '日榜' },
  { key: 'weekly', label: '周榜' },
  { key: 'monthly', label: '月榜' },
];

export default function RankingsPage() {
  const navigate = useNavigate();
  const [rankType, setRankType] = useState('daily');
  const [category, setCategory] = useState('all');
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await MusashiService.getRankings({ type: rankType, category, limit: 50 });
        if (!cancelled) setRankings(data.rankings || []);
      } catch {
        if (!cancelled) setRankings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [rankType, category]);

  const getRankClass = (rank) => {
    if (rank === 1) return 'rank-gold';
    if (rank === 2) return 'rank-silver';
    if (rank === 3) return 'rank-bronze';
    return '';
  };

  return (
    <div className="rp-page">
      <div className="rp-header">
        <Link to="/musashi" className="rp-back">
          <ArrowLeft size={16} />
          返回武藏也
        </Link>
        <h1 className="rp-title">
          <TrendingUp size={24} />
          排行榜
        </h1>
      </div>

      {/* 时间范围 */}
      <div className="rp-tabs">
        {RANK_TYPES.map(rt => (
          <button
            key={rt.key}
            className={`rp-tab${rankType === rt.key ? ' active' : ''}`}
            onClick={() => setRankType(rt.key)}
          >
            {rt.label}
          </button>
        ))}
      </div>

      {/* 分类 */}
      <div className="rp-categories">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            className={`rp-cat-btn${category === cat.key ? ' active' : ''}`}
            onClick={() => setCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 排行榜列表 */}
      {loading ? (
        <div className="rp-loading">
          <Loader2 size={32} className="rp-spinning" />
          <p>加载中...</p>
        </div>
      ) : rankings.length === 0 ? (
        <div className="rp-empty">
          <TrendingUp size={48} />
          <p>暂无排行数据</p>
        </div>
      ) : (
        <div className="rp-list">
          {rankings.map((item, idx) => (
            <div
              key={item.work_id || idx}
              className="rp-item"
              onClick={() => navigate(`/musashi/${item.work_id}`)}
            >
              <div className={`rp-rank ${getRankClass(idx + 1)}`}>
                {idx + 1}
              </div>
              <div className="rp-cover">
                {item.cover_image ? (
                  <img src={item.cover_image} alt={item.title} />
                ) : (
                  <div className="rp-cover-placeholder">{(item.title || '?')[0]}</div>
                )}
              </div>
              <div className="rp-info">
                <div className="rp-item-title">{item.title}</div>
                <div className="rp-item-meta">
                  <span className="rp-item-author">{item.author_name}</span>
                  <span className="rp-item-type">{item.type}</span>
                </div>
              </div>
              <div className="rp-score">
                <Star size={14} fill="#f59e0b" color="#f59e0b" />
                <span>{Math.round(item.score)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}