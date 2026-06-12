import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv, Loader2, ChevronDown, Star } from 'lucide-react';
import { AniBTService } from '../../services/api';
import './AnimeSchedule.css';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const FORMAT_TAGS = {
  '漫画改': '#f09199',
  '轻小说改': '#a78bfa',
  '原创': '#34d399',
  '游戏改': '#60a5fa',
  '小说改': '#fbbf24',
  '动态漫画': '#94a3b8',
  '热血': '#ef4444',
  '搞笑': '#fbbf24',
  '校园': '#60a5fa',
  '恋爱': '#f09199',
  '奇幻': '#a78bfa',
  '战斗': '#ef4444',
  '异世界': '#8b5cf6',
  '卖肉': '#f09199',
  '喜剧': '#fbbf24',
};

function getFormatTag(kind) {
  if (!kind) return null;
  const tag = Object.keys(FORMAT_TAGS).find(t => kind.includes(t));
  return tag ? { label: tag, color: FORMAT_TAGS[tag] } : null;
}

function getSecondTag(kind) {
  if (!kind) return null;
  const first = getFormatTag(kind);
  const remaining = first ? kind.replace(first.label, '') : kind;
  const tag = Object.keys(FORMAT_TAGS).find(t => remaining.includes(t) && (!first || t !== first.label));
  return tag ? { label: tag, color: FORMAT_TAGS[tag] } : null;
}

export default function AnimeSchedule() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const loadData = useCallback(async (season = '') => {
    setLoading(true);
    setError(null);
    try {
      const result = await AniBTService.getSeasonAnime(season);
      if (result?.ok && result?.data) {
        setData(result.data);
        if (result.data.availableSeasons) {
          setAvailableSeasons(result.data.availableSeasons);
        }
        if (!activeDay) {
          const today = new Date().getDay();
          setActiveDay(today === 0 ? 7 : today);
        }
      } else {
        setError('获取放送数据失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [activeDay]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowSeasonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSeasonChange = (season) => {
    setSelectedSeason(season);
    setShowSeasonDropdown(false);
    setActiveDay(null);
    loadData(season);
  };

  const scrollToDay = (dayIndex) => {
    setActiveDay(dayIndex);
    const el = document.getElementById(`schedule-day-${dayIndex}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  if (loading && !data) {
    return (
      <div className="anime-schedule-loading">
        <Loader2 size={24} className="spinning" />
        <span>加载放送表中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="anime-schedule-error">
        <span>{error}</span>
        <button onClick={() => loadData(selectedSeason)}>重试</button>
      </div>
    );
  }

  const byWeekday = data?.byWeekday || [];
  const currentSeason = data?.currentSeason || '';
  const today = new Date().getDay();
  const todayNum = today === 0 ? 7 : today;

  return (
    <div className="anime-schedule">
      {/* 顶部工具栏 — AniBT 风格：星期标签 + 季度选择 */}
      <div className="schedule-toolbar">
        <div className="schedule-weekday-nav">
          {WEEKDAYS.map((label, idx) => {
            const dayNum = idx === 0 ? 7 : idx;
            const isToday = dayNum === todayNum;
            return (
              <button
                key={idx}
                className={`schedule-day-btn ${activeDay === dayNum ? 'active' : ''} ${isToday ? 'today' : ''}`}
                onClick={() => scrollToDay(dayNum)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="schedule-season-selector" ref={dropdownRef}>
          <button
            className="schedule-season-btn"
            onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
          >
            <Tv size={14} />
            {selectedSeason || currentSeason || '当季'}
            <ChevronDown size={14} className={showSeasonDropdown ? 'rotated' : ''} />
          </button>
          {showSeasonDropdown && (
            <div className="schedule-season-dropdown">
              <button
                className={`schedule-season-option ${!selectedSeason ? 'active' : ''}`}
                onClick={() => handleSeasonChange('')}
              >
                当前季度
              </button>
              {availableSeasons.map(s => (
                <button
                  key={s}
                  className={`schedule-season-option ${selectedSeason === s ? 'active' : ''}`}
                  onClick={() => handleSeasonChange(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 放送表主体 — AniBT 风格紧凑列表 */}
      <div className="schedule-content">
        {byWeekday.map((dayGroup) => {
          const dayNum = dayGroup.weekday ?? 7;
          const isToday = dayNum === todayNum;

          return (
            <div
              key={dayNum}
              id={`schedule-day-${dayNum}`}
              className={`schedule-day-section ${isToday ? 'today' : ''}`}
            >
              {/* 日期标题 */}
              <div className="schedule-day-header">
                <h3 className="schedule-day-title">
                  {dayGroup.weekdayLabel || WEEKDAYS[dayNum === 7 ? 0 : dayNum]}
                  {isToday && <span className="schedule-today-badge">今天</span>}
                </h3>
              </div>

              {/* 番剧列表 — AniBT 风格：每行一个番剧 */}
              <div className="schedule-anime-list">
                {dayGroup.animes?.map((anime) => {
                  const formatTag = getFormatTag(anime.kind);
                  const secondTag = getSecondTag(anime.kind);
                  return (
                    <div
                      key={anime.bgmId || anime.animeId}
                      className="schedule-anime-row"
                      onClick={() => navigate(`/info/2/${anime.bgmId}`)}
                    >
                      {/* 播出时间 */}
                      <span className="schedule-row-time">
                        {formatTime(anime.airingAt)}
                      </span>

                      {/* 封面缩略图 */}
                      <div className="schedule-row-cover">
                        <img
                          src={anime.cover || ''}
                          alt=""
                          loading="lazy"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </div>

                      {/* 制作公司 + 标题 + 标签 */}
                      <div className="schedule-row-info">
                        <span className="schedule-row-studio">
                          {anime.studio || ''}
                        </span>
                        <span className="schedule-row-title">
                          {anime.title?.chinese || anime.title?.primary || anime.title?.japanese || '未知'}
                        </span>
                        {anime.format && anime.format !== 'TV' && (
                          <span className="schedule-row-format">{anime.format}</span>
                        )}
                        {formatTag && (
                          <span className="schedule-row-tag" style={{ backgroundColor: formatTag.color }}>
                            {formatTag.label}
                          </span>
                        )}
                        {secondTag && (
                          <span className="schedule-row-tag" style={{ backgroundColor: secondTag.color }}>
                            {secondTag.label}
                          </span>
                        )}
                        {anime.rating > 0 && (
                          <span className="schedule-row-rating">
                            <Star size={9} /> {anime.rating}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
