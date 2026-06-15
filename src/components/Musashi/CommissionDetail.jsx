import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MusashiService } from '../../services/musashiApi';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, Clock, DollarSign, User, Send, Loader2 } from 'lucide-react';
import './CommissionDetail.css';

export default function CommissionDetail() {
  const { commId } = useParams();
  const navigate = useNavigate();
  const { user } = useApp();

  const [commission, setCommission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [respondMsg, setRespondMsg] = useState('');
  const [respondPrice, setRespondPrice] = useState('');
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await MusashiService.getCommission(commId);
        if (!cancelled) setCommission(data);
      } catch {
        if (!cancelled) setCommission(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [commId]);

  const handleRespond = async () => {
    if (!respondMsg.trim()) return;
    setResponding(true);
    try {
      await MusashiService.respondCommission(commId, {
        message: respondMsg,
        price: respondPrice ? Number(respondPrice) : null,
      });
      setRespondMsg('');
      setRespondPrice('');
      // 刷新
      const updated = await MusashiService.getCommission(commId);
      setCommission(updated);
    } catch (err) {
      alert(err.message || '应征失败');
    } finally {
      setResponding(false);
    }
  };

  if (loading) {
    return <div className="cod-page"><div className="cod-loading"><Loader2 size={32} className="cod-spinning" /><p>加载中...</p></div></div>;
  }

  if (!commission) {
    return <div className="cod-page"><div className="cod-loading"><p>企划不存在</p><Link to="/musashi/commissions">返回约稿广场</Link></div></div>;
  }

  const isOwner = user?.id === commission.creator_id;

  return (
    <div className="cod-page">
      <div className="cod-back">
        <Link to="/musashi/commissions"><ArrowLeft size={16} />返回约稿广场</Link>
      </div>

      <div className="cod-main">
        <div className="cod-header">
          <span className="cod-category">{commission.category}</span>
          <span className={`cod-status ${commission.status}`}>
            {commission.status === 'open' ? '募集中' : '已关闭'}
          </span>
        </div>

        <h1 className="cod-title">{commission.title}</h1>

        <div className="cod-meta">
          {commission.budget_min && (
            <span className="cod-budget">
              <DollarSign size={14} />
              预算: {commission.budget_min}{commission.budget_max ? ` - ${commission.budget_max}` : '以上'}
            </span>
          )}
          {commission.deadline && (
            <span className="cod-deadline">
              <Clock size={14} />
              截止: {new Date(commission.deadline).toLocaleDateString('zh-CN')}
            </span>
          )}
        </div>

        <div className="cod-creator" onClick={() => navigate(`/musashi/creator/${commission.creator_id}`)}>
          <img src={commission.creator_avatar} alt="" className="cod-creator-avatar" />
          <span>{commission.creator_name}</span>
        </div>

        <div className="cod-desc">{commission.description}</div>

        {commission.requirements && (
          <div className="cod-requirements">
            <h3>需求说明</h3>
            <p>{commission.requirements}</p>
          </div>
        )}
      </div>

      {/* 应征表单 */}
      {!isOwner && commission.status === 'open' && (
        <div className="cod-respond">
          <h3>应征此企划</h3>
          <textarea
            className="cod-respond-msg"
            value={respondMsg}
            onChange={(e) => setRespondMsg(e.target.value)}
            placeholder="介绍你的想法、经验和优势..."
            rows={4}
          />
          <div className="cod-respond-row">
            <input
              className="cod-respond-price"
              type="number"
              value={respondPrice}
              onChange={(e) => setRespondPrice(e.target.value)}
              placeholder="报价（可选）"
            />
            <button
              className="cod-respond-btn"
              onClick={handleRespond}
              disabled={!respondMsg.trim() || responding}
            >
              {responding ? <Loader2 size={14} className="cod-spinning" /> : <Send size={14} />}
              提交应征
            </button>
          </div>
        </div>
      )}

      {/* 应征列表 */}
      {commission.responses && commission.responses.length > 0 && (
        <div className="cod-responses">
          <h3>应征列表 ({commission.responses.length})</h3>
          {commission.responses.map(resp => (
            <div key={resp.id} className="cod-response-item">
              <div className="cod-response-header">
                <img src={resp.responder_avatar} alt="" className="cod-response-avatar" />
                <span className="cod-response-name">{resp.responder_name}</span>
                {resp.price && <span className="cod-response-price">报价: {resp.price}</span>}
              </div>
              <p className="cod-response-msg">{resp.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}