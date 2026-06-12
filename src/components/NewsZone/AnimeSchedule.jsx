import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv, Loader2, ChevronDown, Clock, Star, ExternalLink } from 'lucide-react';
import { AniBTService } from '../../services/api';
import './AnimeSchedule.css';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const KIND_LABELS = {
  TV: 'TV',
  OVA: 'OVA',
  MOVIE: '剧场版',
  WEB: 'Web',
  MUSIC: '音乐',
  OTHER: '其他',
};

const FORMAT_TAGS = {
  '漫画改': '#f09199',
  '轻小说改': '#a78bfa',
  '原创': '#34d399',
  '游戏改': '#60a5fa',
  '小说改': '#fbbf24',
  '动态漫画': '#94a3b8',
};

function getFormatTag(kind) {
  if (!kind) return null;
  const tag = Object.keys(FORMAT_TAGS).find(t => kind.includes(t));
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
  const scheduleRef = useRef(null);
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
        if (!activeDay && result.data.currentSeason) {
          const today = new Date().getDay();
          setActiveDay(today === 0 ? 7 : today);
        }
      } else {
        setError('获取放送数据失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [activeDay]);

  useEffect(() => {
    loadData();
  }, []);

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
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getSeasonLabel = (seasonStr) => {
    if (!seasonStr) return '当季';
    return seasonStr;
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

  return (
    <div className="anime-schedule" ref={scheduleRef}>
      {/* 顶部工具栏 */}
      <div className="schedule-toolbar">
        <div className="schedule-weekday-nav">
          {WEEKDAYS.map((label, idx) => {
            const dayNum = idx === 0 ? 7 : idx;
            const today = new Date().getDay();
            const isToday = dayNum === (today === 0 ? 7 : today);
            return (
              <button
                key={idx}
                className={`schedule-day-btn ${activeDay === dayNum ? 'active' : ''} ${isToday ? 'today' : ''}`}
                onClick={() => scrollToDay(dayNum)}
              >
                {label}
                {isToday && <span className="schedule-today-dot" />}
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
            {getSeasonLabel(selectedSeason || currentSeason)}
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

      {/* 放送表主体 */}
      <div className="schedule-content">
        {byWeekday.map((dayGroup) => {
          const dayNum = dayGroup.weekday ?? 7;
          const today = new Date().getDay();
          const isToday = dayNum === (today === 0 ? 7 : today);

          return (
            <div
              key={dayNum}
              id={`schedule-day-${dayNum}`}
              className={`schedule-day-section ${isToday ? 'today' : ''}`}
            >
              <div className="schedule-day-header">
                <h3 className="schedule-day-title">
                  {dayGroup.weekdayLabel || WEEKDAYS[dayNum === 7 ? 0 : dayNum]}
                  {isToday && <span className="schedule-today-badge">今天</span>}
                </h3>
                <span className="schedule-day-count">{dayGroup.animes?.length || 0} 部</span>
              </div>

              <div className="schedule-anime-list">
                {dayGroup.animes?.map((anime) => {
                  const formatTag = getFormatTag(anime.kind);
                  return (
                    <div
                      key={anime.bgmId || anime.animeId}
                      className="schedule-anime-item"
                      onClick={() => navigate(`/info/2/${anime.bgmId}`)}
                    >
                      <div className="schedule-anime-cover">
                        <img
                          src={anime.cover || ''}
                          alt=""
                          loading="lazy"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </div>
                      <div className="schedule-anime-info">
                        <div className="schedule-anime-time">
                          <Clock size={11} />
                          {formatTime(anime.airingAt)}
                        </div>
                        <h4 className="schedule-anime-title">
                          {anime.title?.chinese || anime.title?.primary || anime.title?.japanese || '未知'}
                        </h4>
                        <div className="schedule-anime-meta">
                          {anime.format && (
                            <span className="schedule-anime-format">{KIND_LABELS[anime.format] || anime.format}</span>
                          )}
                          {formatTag && (
                            <span className="schedule-anime-tag" style={{ backgroundColor: formatTag.color }}>
                              {formatTag.label}
                            </span>
                          )}
                          {anime.rating > 0 && (
                            <span className="schedule-anime-rating">
                              <Star size={10} /> {anime.rating}
                            </span>
                          )}
                        </div>
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
