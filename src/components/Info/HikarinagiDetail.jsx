import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import HikarinagiService from '../../services/HikarinagiService';
import { Star, ArrowLeft, Download, ExternalLink, Tag, Calendar, Users, Loader2, AlertCircle, Sparkles, BookText, Gamepad2 } from 'lucide-react';
import './InfoDetail.css';

const FALLBACK_COVER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="280" fill="%23f9f3f5"%3E%3Crect width="200" height="280" rx="10"/%3E%3Ctext x="100" y="140" text-anchor="middle" fill="%23d4b8c0" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';

export default function HikarinagiDetail() {
  const { type, id } = useParams(); // type = 'galgame' | 'lightnovel'
  const location = useLocation();
  const navigate = useNavigate();
  const preview = location.state?.preview;

  const [data, setData] = useState(null);
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info');

  const isGal = type === 'galgame';
  const service = isGal ? HikarinagiService.galgame : HikarinagiService.lightnovel;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');

    Promise.all([
      service.getById(id).catch(err => { throw err; }),
      isGal
        ? HikarinagiService.galgame.getDownloadInfo(id).catch(() => null)
        : Promise.resolve(null),
      isGal
        ? HikarinagiService.galgame.getRelated(id).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([detail, dlInfo, relItems]) => {
        setData(detail);
        setDownloadInfo(dlInfo);
        setRelated(Array.isArray(relItems) ? relItems : (relItems?.items || relItems?.data || []));
      })
      .catch(err => {
        setError(err.message || '加载失败');
      })
      .finally(() => setLoading(false));
  }, [id, type]);

  if (loading) {
    return (
      <div className="detail-loading">
        <Loader2 size={32} className="spinning" />
        <span>加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="detail-error-state">
        <AlertCircle size={32} />
        <p>{error}</p>
        <button onClick={() => navigate(-1)}><ArrowLeft size={14} /> 返回</button>
      </div>
    );
  }

  if (!data) return null;

  // Galgame 格式: galId, transTitle, originTitle[], cover, producers[], tags[], rate, introduction, releaseDate, bangumiGameId
  // LightNovel 格式: novelId, name, name_cn, cover, author{}, bunko{}, tags[], rate, introduction
  const hkId = isGal ? (data.galId || data.id) : (data.novelId || data.id);
  const name = isGal
    ? (data.transTitle || (Array.isArray(data.originTitle) ? data.originTitle[0] : data.originTitle) || '')
    : (data.name_cn || data.name || '');
  const originalName = isGal
    ? (Array.isArray(data.originTitle) ? data.originTitle.filter(t => t !== name).join(' / ') : (data.originTitle || ''))
    : (data.name || '');
  const cover = data.cover || data.headCover || preview?.image || '';
  const score = data.rate || data.score || 0;
  const summary = data.introduction || data.summary || '';
  const tags = (data.tags || []).map(t => t.tag?.name || (typeof t === 'string' ? t : '')).filter(Boolean);
  const officialUrl = data.officialUrl || '';
  const releaseDate = data.releaseDate || data.date || '';
  const bangumiId = data.bangumiGameId || data.bangumiNovelId || null;

  return (
    <div className="detail-page">
      {/* 背景模糊 */}
      {cover && (
        <div className="detail-bg-blur" style={{ backgroundImage: `url(${cover})` }} />
      )}

      <div className="detail-container">
        {/* 返回按钮 */}
        <button className="detail-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> 返回
        </button>

        {/* 主信息区 */}
        <div className="detail-header">
          <div className="detail-cover-col">
            <img
              src={cover || FALLBACK_COVER}
              alt={name}
              className="detail-cover"
              onError={e => { e.target.src = FALLBACK_COVER; }}
            />
          </div>
          <div className="detail-info-col">
            <div className="detail-title-row">
              <h1 className="detail-title">{name}</h1>
              {originalName && originalName !== name && (
                <span className="detail-original-name">{originalName}</span>
              )}
            </div>

            <div className="detail-meta-row">
              <span className="detail-type-badge">
                {isGal ? <><Gamepad2 size={12} /> Galgame</> : <><BookText size={12} /> 轻小说</>}
              </span>
              <span className="detail-source-badge">
                <Sparkles size={10} /> Hikarinagi
              </span>
              {score > 0 && (
                <span className="detail-score">
                  <Star size={14} fill="#ffc107" /> {Number(score).toFixed(1)}
                </span>
              )}
              {releaseDate && (
                <span className="detail-date">
                  <Calendar size={12} /> {releaseDate}
                </span>
              )}
            </div>

            {tags.length > 0 && (
              <div className="detail-tags">
                {tags.slice(0, 12).map((tagName, i) => (
                  tagName ? <span key={i} className="detail-tag"><Tag size={9} /> {tagName}</span> : null
                ))}
              </div>
            )}

            {officialUrl && (
              <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="detail-official-link">
                <ExternalLink size={12} /> 官方网站
              </a>
            )}
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="detail-tabs">
          <button className={`detail-tab ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
            简介
          </button>
          {isGal && downloadInfo && (
            <button className={`detail-tab ${activeTab === 'download' ? 'active' : ''}`} onClick={() => setActiveTab('download')}>
              <Download size={12} /> 下载信息
            </button>
          )}
          {related.length > 0 && (
            <button className={`detail-tab ${activeTab === 'related' ? 'active' : ''}`} onClick={() => setActiveTab('related')}>
              相关推荐
            </button>
          )}
        </div>

        {/* Tab 内容 */}
        <div className="detail-tab-content">
          {activeTab === 'info' && (
            <div className="detail-summary">
              {summary ? (
                <div className="detail-summary-text" dangerouslySetInnerHTML={{ __html: summary.replace(/\n/g, '<br/>') }} />
              ) : (
                <p className="detail-no-summary">暂无简介</p>
              )}
            </div>
          )}

          {activeTab === 'download' && downloadInfo && (
            <div className="detail-download-info">
              {typeof downloadInfo === 'string' ? (
                <div dangerouslySetInnerHTML={{ __html: downloadInfo.replace(/\n/g, '<br/>') }} />
              ) : Array.isArray(downloadInfo) ? (
                <div className="detail-download-list">
                  {downloadInfo.map((item, i) => (
                    <div key={i} className="detail-download-item">
                      {item.name || item.title || `下载源 ${i + 1}`}
                      {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /></a>}
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="detail-download-raw">{JSON.stringify(downloadInfo, null, 2)}</pre>
              )}
            </div>
          )}

          {activeTab === 'related' && related.length > 0 && (
            <div className="detail-related-grid">
              {related.map(item => {
                const rId = item.galId || item.novelId || item.id || item._id;
                const rName = item.transTitle || item.name_cn || item.name || (Array.isArray(item.originTitle) ? item.originTitle[0] : '') || '';
                const rCover = item.cover || '';
                return (
                  <Link
                    key={rId}
                    to={`/info/hikarinagi/${type}/${rId}`}
                    className="detail-related-card"
                  >
                    <img src={rCover || FALLBACK_COVER} alt={rName} onError={e => { e.target.src = FALLBACK_COVER; }} loading="lazy" />
                    <span>{rName}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
