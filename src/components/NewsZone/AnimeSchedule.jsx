import { useState, useEffect, useCallback, useRef } from 'react';
import { Tv, Loader2, ChevronDown } from 'lucide-react';
import { BangumiService } from '../../services/api';
import { BangumiDataService } from '../../services/BangumiDataService';
import './AnimeSchedule.css';

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function formatAirTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

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
    _airingTime: anime.airingTime || '',
  };
}

function getCurrentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  let season;
  if (month >= 1 && month <= 3) season = 1;
  else if (month >= 4 && month <= 6) season = 2;
  else if (month >= 7 && month <= 9) season = 3;
  else season = 4;
  return { year, season };
}

function parseSeasonStr(seasonStr) {
  if (!seasonStr) return getCurrentSeason();
  const match = seasonStr.match(/(\d{4})\s*[年]\s*?(春|夏|秋|冬)/);
  if (!match) return getCurrentSeason();
  const year = parseInt(match[1], 10);
  const seasonMap = { '冬': 1, '春': 2, '夏': 3, '秋': 4 };
  const season = seasonMap[match[2]] || 1;
  return { year, season };
}

function generateAvailableSeasons() {
  const { year, season } = getCurrentSeason();
  const seasonLabels = { 1: '冬', 2: '春', 3: '夏', 4: '秋' };
  const seasons = [];
  // 往前2季，往后1季
  for (let dy = -1; dy <= 1; dy++) {
    for (let s = 1; s <= 4; s++) {
      const y = year + dy;
      if (dy === -1 && s > season) continue;
      if (dy === 0 && s > season + 1) continue;
      if (dy === 1) continue; // 未来季暂不显示
      seasons.push(`${y}年${seasonLabels[s]}`);
    }
  }
  // 确保当前季在列表中
  const currentLabel = `${year}年${seasonLabels[season]}`;
  if (!seasons.includes(currentLabel)) seasons.push(currentLabel);
  // 也加上下一季
  let nextSeason = season + 1;
  let nextYear = year;
  if (nextSeason > 4) { nextSeason = 1; nextYear = year + 1; }
  const nextLabel = `${nextYear}年${seasonLabels[nextSeason]}`;
  if (!seasons.includes(nextLabel)) seasons.push(nextLabel);

  return seasons.reverse(); // 最新的在前
}

export default function AnimeSchedule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const dropdownRef = useRef(null);

  const loadData = useCallback(async (season = '') => {
    setLoading(true);
    setError(null);
    try {
      // 1. 从 BangumiDataService 获取 bangumi-data
      await BangumiDataService.fetchData();

      // 2. 计算当前季度
      const { year: curYear, season: curSeason } = getCurrentSeason();
      const seasonLabels = { 1: '冬', 2: '春', 3: '夏', 4: '秋' };
      const currentSeason = `${curYear}年${seasonLabels[curSeason]}`;

      // 3. 解析用户选择的季度
      const { year, season: seasonNum } = parseSeasonStr(season || currentSeason);

      // 4. 获取当季番剧
      const items = await BangumiDataService.getSeasonItems(year, seasonNum);

      // 5. 按星期分组（1=周一...7=周日）
      const groups = {};
      for (let i = 1; i <= 7; i++) {
        groups[i] = { weekday: i, weekdayLabel: WEEKDAY_LABELS[i - 1], animes: [] };
      }

      const bgmIds = [];
      items.forEach(item => {
        // 提取 bgmId
        const bgmSite = item.sites?.find(s => s.site === 'bangumi');
        const bgmId = bgmSite ? parseInt(bgmSite.id, 10) : null;
        if (!bgmId) return;

        // 解析放送时间
        const beginDate = item.begin ? new Date(item.begin) : null;
        let weekday = 1;
        let airingTime = '';
        if (beginDate) {
          const day = beginDate.getDay(); // 0=周日
          weekday = day === 0 ? 7 : day;
          airingTime = formatAirTime(item.begin);
        }

        // 解析标题
        const title = typeof item.title === 'string'
          ? { primary: item.title }
          : {
              japanese: item.title?.ja || item.title?.en || '',
              chinese: item.title?.['zh-Hans'] || item.title?.['zh-CN'] || '',
              primary: item.title?.ja || item.title?.en || item.title?.['zh-Hans'] || '',
            };

        const anime = {
          bgmId,
          title,
          cover: '',
          rating: null,
          kind: item.type || '',
          airingAt: beginDate ? beginDate.getTime() : 0,
          airingTime,
        };

        groups[weekday].animes.push(anime);
        bgmIds.push(bgmId);
      });

      // 6. 批量补充封面图（分批50个）
      const uniqueIds = [...new Set(bgmIds)];
      const batchSize = 50;
      const coverMap = {};
      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(id => BangumiService.getSubject(id).catch(() => null))
        );
        results.forEach((res, idx) => {
          if (res.status === 'fulfilled' && res.value) {
            const subject = res.value;
            const id = batch[idx];
            coverMap[id] = subject.images?.common || subject.images?.medium || '';
          }
        });
      }

      // 将封面图写入分组
      Object.values(groups).forEach(group => {
        group.animes.forEach(anime => {
          if (coverMap[anime.bgmId]) {
            anime.cover = coverMap[anime.bgmId];
          }
        });
      });

      // 7. 生成可用季度列表
      const seasons = generateAvailableSeasons();

      // 8. 设置状态
      const byWeekday = Object.values(groups);
      setData({ byWeekday, currentSeason });
      setAvailableSeasons(seasons);
    } catch {
      setError('获取放送数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

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
    setWeekOffset(0);
    loadData(season);
  };

  const getWeekDates = () => {
    const now = new Date();
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1 + weekOffset * 7);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
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
  const weekDates = getWeekDates();
  const todayStr = new Date().toISOString().slice(0, 10);

  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

  return (
    <div className="anime-schedule">
      {/* 工具栏 */}
      <div className="schedule-toolbar">
        <div className="schedule-week-nav">
          <button className="schedule-nav-btn" onClick={() => setWeekOffset(w => w - 1)}>◀ 上一周</button>
          <span className="schedule-week-label">{weekLabel}</span>
          <button className="schedule-nav-btn" onClick={() => setWeekOffset(w => w + 1)}>下一周 ▶</button>
          {weekOffset !== 0 && <button className="schedule-today-btn" onClick={() => setWeekOffset(0)}>回到本周</button>}
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

      {/* 周历网格 */}
      <div className="schedule-calendar-grid">
        {byWeekday.map((dayGroup, idx) => {
          const dayNum = dayGroup.weekday ?? 7;
          const dateStr = weekDates[idx]?.toISOString().slice(0, 10);
          const isToday = dateStr === todayStr;
          const items = (dayGroup.animes || []).map(toSubjectCardItem);
          return (
            <div key={dayNum} className={`schedule-calendar-day ${isToday ? 'today' : ''}`}>
              <div className="schedule-day-head">
                <span className={`schedule-day-name ${isToday ? 'today' : ''}`}>{dayGroup.weekdayLabel}</span>
                <span className="schedule-day-date">{weekDates[idx] ? `${weekDates[idx].getMonth() + 1}/${weekDates[idx].getDate()}` : ''}</span>
              </div>
              <div className="schedule-day-items">
                {items.length === 0 ? (
                  <div className="schedule-day-empty">暂无番剧</div>
                ) : (
                  items.map(item => (
                    <a key={item.id || Math.random()} className="schedule-anime-card" href={`/info/2/${item.id}`} onClick={(e) => { e.preventDefault(); window.location.href = `/info/2/${item.id}`; }}>
                      <div className="schedule-anime-cover">
                        {item.images?.large || item.images?.common ? (
                          <img src={item.images.large || item.images.common} alt={item.name_cn} loading="lazy" />
                        ) : (
                          <div className="schedule-anime-cover-placeholder">无封面</div>
                        )}
                      </div>
                      <div className="schedule-anime-info">
                        <span className="schedule-anime-title">{item.name_cn}</span>
                        <span className="schedule-anime-time">{item._airingTime || ''}</span>
                      </div>
                    </a>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 数据来源声明 */}
      <div className="schedule-attribution">
        放送数据来自 <a href="https://github.com/bangumi-data/bangumi-data" target="_blank" rel="noopener noreferrer">bangumi-data</a> · 条目信息来自 <a href="https://bangumi.tv" target="_blank" rel="noopener noreferrer">Bangumi</a>
      </div>
    </div>
  );
}
