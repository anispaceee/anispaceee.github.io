import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Tv, Loader2, ChevronDown, Sparkles, Gamepad2 } from 'lucide-react';
import { AniBTService } from '../../services/api';
import HikarinagiService from '../../services/HikarinagiService';
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
  const [monthlyGals, setMonthlyGals] = useState([]);
  const [monthlyGalsLoading, setMonthlyGalsLoading] = useState(false);

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

  // 加载 Galgame 月度发售
  useEffect(() => {
    setMonthlyGalsLoading(true);
    HikarinagiService.galgame.getMonthlyReleases()
      .then(res => {
        const items = res?.items || res?.data || (Array.isArray(res) ? res : []);
        setMonthlyGals(Array.isArray(items) ? items.slice(0, 20) : []);
      })
      .catch(() => setMonthlyGals([]))
      .finally(() => setMonthlyGalsLoading(false));
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

      {/* Galgame 月度发售 */}
      {monthlyGals.length > 0 && (
        <div className="schedule-day-section">
          <div className="schedule-day-header">
            <h3 className="schedule-day-title">
              <Sparkles size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> Galgame 月度发售
            </h3>
            <span className="schedule-day-count">{monthlyGals.length} 部</span>
          </div>
          <div className="schedule-card-grid">
            {monthlyGals.map(gal => {
              const galId = gal.galId || gal.id || gal._id;
              const galName = gal.transTitle || (Array.isArray(gal.originTitle) ? gal.originTitle[0] : gal.originTitle) || '';
              const galCover = gal.cover || '';
              const galScore = gal.rate || gal.score || 0;
              return (
                <Link key={galId} to={`/info/hikarinagi/galgame/${galId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="subject-card">
                    <div className="subject-card-cover">
                      {galCover ? (
                        <img src={galCover} alt={galName} className="subject-card-img" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />
                      ) : (
                        <div style={{ width: '100%', aspectRatio: '3/4', background: 'var(--border-secondary)', borderRadius: 'var(--radius-sm)' }} />
                      )}
                      {galScore > 0 && <div className="subject-card-score">⭐ {Number(galScore).toFixed(1)}</div>}
                      <span className="subject-card-type type-game"><Gamepad2 size={10} /> Gal</span>
                    </div>
                    <div className="subject-card-info">
                      <div className="subject-card-name">{galName}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {monthlyGalsLoading && (
        <div className="schedule-day-section">
          <div className="schedule-day-header">
            <h3 className="schedule-day-title"><Sparkles size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> Galgame 月度发售</h3>
          </div>
          <div className="schedule-card-grid">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      )}
    </div>
  );
}
