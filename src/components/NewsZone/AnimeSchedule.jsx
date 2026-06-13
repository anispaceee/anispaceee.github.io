import { useState, useEffect, useCallback, useRef } from 'react';
import { Tv, Loader2, ChevronDown } from 'lucide-react';
import { AniBTService } from '../../services/api';
import { SubjectCard, SkeletonCard } from '../Common/CommonComponents';
import './AnimeSchedule.css';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function toSubjectCardItem(anime) {
  return {
    id: anime.bgmId,
    name: anime.title?.japanese || anime.title?.primary || '',
    name_cn: anime.title?.chinese || anime.title?.primary || '未知标题',
    images: anime.cover ? { common: anime.cover, medium: anime.cover, large: anime.cover } : {},
    rating: anime.rating ? { score: anime.rating } : {},
    type: 2,
    summary: anime.kind || '',
    tags: [],
    _anibtAiringAt: anime.airingAt || 0,
  };
}

export default function AnimeSchedule() {
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

      <div className="schedule-content">
        {byWeekday.map((dayGroup) => {
          const dayNum = dayGroup.weekday ?? 7;
          const isToday = dayNum === todayNum;
          const items = (dayGroup.animes || []).map(toSubjectCardItem);

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
                <span className="schedule-day-count">{items.length} 部</span>
              </div>

              <div className="schedule-card-grid">
                {loading ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />) :
                  items.map(item => (
                    <SubjectCard
                      key={item.id}
                      item={item}
                      type="anime"
                      linkTo={`/info/2/${item.id}`}
                    />
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
