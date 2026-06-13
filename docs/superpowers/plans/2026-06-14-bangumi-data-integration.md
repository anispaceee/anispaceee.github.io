# bangumi-data 集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 bangumi-data 开源数据集集成到 ANISpace，实现放送表周历视图和条目详情页多平台播放链接。

**Architecture:** 前端直接从 unpkg CDN 获取 bangumi-data JSON 数据，localStorage 缓存 24h。通过 bgmId 关联 bangumi-data 与 Bangumi API 数据。放送表从列表视图重构为周历视图，详情页新增播放平台区域。

**Tech Stack:** React, bangumi-data CDN (unpkg), localStorage, CSS Variables

---

### Task 1: 创建 BangumiDataService 服务模块

**Files:**
- Create: `src/services/BangumiDataService.js`

- [ ] **Step 1: 创建 BangumiDataService.js**

```js
// src/services/BangumiDataService.js

const CDN_URL = 'https://unpkg.com/bangumi-data@0.3/dist/data.json';
const CACHE_KEY = 'anispace_bangumi_data';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export const BangumiDataService = {
  _data: null,

  async fetchData(forceRefresh = false) {
    if (!forceRefresh && this._data) return this._data;

    // 尝试从 localStorage 读取缓存
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            this._data = data;
            return data;
          }
        }
      } catch { /* 缓存损坏，忽略 */ }
    }

    // 从 CDN 获取
    const res = await fetch(CDN_URL);
    if (!res.ok) throw new Error(`bangumi-data fetch failed: ${res.status}`);
    const data = await res.json();

    // 写入缓存
    this._data = data;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch { /* localStorage 满了，忽略 */ }

    return data;
  },

  async getSeasonItems(year, season) {
    const data = await this.fetchData();
    if (!data?.items) return [];

    // season: 1=冬(1-3月), 2=春(4-6月), 3=夏(7-9月), 4=秋(10-12月)
    const monthRanges = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] };
    const months = monthRanges[season];
    if (!months) return [];

    return data.items.filter(item => {
      if (!item.begin) return false;
      const d = new Date(item.begin);
      return d.getFullYear() === year && months.includes(d.getMonth() + 1);
    });
  },

  async getSitesByBgmId(bgmId) {
    const data = await this.fetchData();
    if (!data?.items) return null;

    const item = data.items.find(item =>
      item.sites?.some(s => s.site === 'bangumi' && String(s.id) === String(bgmId))
    );
    return item || null;
  },

  async getItemsByWeekDate(dateStr) {
    const data = await this.fetchData();
    if (!data?.items) return [];

    return data.items.filter(item => {
      if (!item.begin) return false;
      const itemDate = item.begin.slice(0, 10);
      return itemDate === dateStr;
    });
  },

  generatePlatformUrl(siteKey, id) {
    const data = this._data;
    if (!data?.siteMeta?.[siteKey]) return null;
    const template = data.siteMeta[siteKey].urlTemplate;
    if (!template) return null;
    return template.replace('{{id}}', id);
  },

  getSiteMeta() {
    return this._data?.siteMeta || {};
  },

  clearCache() {
    this._data = null;
    localStorage.removeItem(CACHE_KEY);
  }
};
```

- [ ] **Step 2: 验证服务模块**

在浏览器控制台或临时测试中验证 `BangumiDataService.fetchData()` 能正确获取数据。

---

### Task 2: 放送表周历视图 — 数据层改造

**Files:**
- Modify: `src/components/NewsZone/AnimeSchedule.jsx`

- [ ] **Step 1: 重构 AnimeSchedule.jsx 数据加载逻辑**

将 `AniBTService.getSeasonAnime` 替换为双数据源融合逻辑：

1. 从 bangumi-data 获取当季番剧列表（放送时间 + bgmId）
2. 从 Bangumi API 批量获取封面图和评分（通过 bgmId）
3. AniBT 继续提供字幕组资源信息

在 `AnimeSchedule.jsx` 顶部添加导入和辅助函数：

```js
import { BangumiService } from '../../services/api';
import { BangumiDataService } from '../../services/BangumiDataService';
```

修改 `loadData` 函数：

```js
const loadData = useCallback(async (season = '') => {
  setLoading(true);
  setError(null);
  try {
    // 1. 获取 bangumi-data
    const bgData = await BangumiDataService.fetchData();

    // 2. 计算当前季度
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentSeason = Math.ceil(currentMonth / 3);

    // 3. 解析用户选择的季度
    let targetYear = currentYear;
    let targetSeason = currentSeason;
    if (season) {
      const parts = season.match(/(\d{4})年(\d)月/);
      if (parts) {
        targetYear = parseInt(parts[1]);
        targetSeason = parseInt(parts[2]);
      }
    }

    // 4. 获取当季番剧
    const seasonItems = await BangumiDataService.getSeasonItems(targetYear, targetSeason);

    // 5. 按星期分组
    const byWeekday = [];
    for (let day = 1; day <= 7; day++) {
      const dayItems = seasonItems.filter(item => {
        if (!item.begin) return false;
        const d = new Date(item.begin);
        let jsDay = d.getDay();
        // JS: 0=周日, 1=周一... bangumi-data 用 ISO 日期
        // 映射到 1=周一...7=周日
        return (jsDay === 0 ? 7 : jsDay) === day;
      });
      byWeekday.push({
        weekday: day,
        weekdayLabel: WEEKDAYS[day === 7 ? 0 : day],
        animes: dayItems.map(item => {
          const bgmSite = item.sites?.find(s => s.site === 'bangumi');
          const cnTitle = item.titleTranslate?.['zh-Hans']?.[0] || item.title;
          return {
            bgmId: bgmSite?.id ? parseInt(bgmSite.id) : null,
            title: {
              japanese: item.title,
              chinese: cnTitle,
              primary: cnTitle || item.title,
            },
            cover: null, // 后续从 Bangumi API 补充
            rating: null,
            kind: item.type || '',
            airingAt: item.begin ? new Date(item.begin).getTime() : 0,
            airingTime: item.begin ? formatAirTime(item.begin) : '',
            _bangumiDataItem: item, // 保留原始数据
          };
        }),
      });
    }

    // 6. 批量补充封面图（通过 BangumiService 搜索 bgmId）
    const bgmIds = seasonItems
      .map(item => item.sites?.find(s => s.site === 'bangumi')?.id)
      .filter(Boolean)
      .map(Number);
    const uniqueIds = [...new Set(bgmIds)];

    // 分批获取（每批 50 个，避免请求过多）
    const subjectMap = {};
    for (let i = 0; i < uniqueIds.length; i += 50) {
      const batch = uniqueIds.slice(i, i + 50);
      const results = await Promise.allSettled(
        batch.map(id => BangumiService.getSubjectInfo(id).catch(() => null))
      );
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled' && r.value) {
          subjectMap[batch[idx]] = r.value;
        }
      });
    }

    // 7. 补充封面和评分到 byWeekday
    byWeekday.forEach(day => {
      day.animes.forEach(anime => {
        if (anime.bgmId && subjectMap[anime.bgmId]) {
          const subject = subjectMap[anime.bgmId];
          anime.cover = subject.images?.large || subject.images?.common || null;
          anime.rating = subject.rating?.score || null;
        }
      });
    });

    // 8. 生成可用季度列表
    const availableSeasons = [];
    for (let y = currentYear; y >= currentYear - 1; y--) {
      for (let s = 4; s >= 1; s--) {
        if (y === currentYear && s > currentSeason) continue;
        availableSeasons.push(`${y}年${s}月`);
      }
    }

    setData({ byWeekday, currentSeason: `${targetYear}年${targetSeason}月`, availableSeasons });

    if (!activeDay) {
      const today = new Date().getDay();
      setActiveDay(today === 0 ? 7 : today);
    }
  } catch {
    setError('获取放送数据失败');
  } finally {
    setLoading(false);
  }
}, [activeDay]);
```

添加辅助函数：

```js
function formatAirTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
```

- [ ] **Step 2: 更新 toSubjectCardItem 适配新数据**

```js
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
```

---

### Task 3: 放送表周历视图 — UI 改造

**Files:**
- Modify: `src/components/NewsZone/AnimeSchedule.jsx`
- Modify: `src/components/NewsZone/AnimeSchedule.css`

- [ ] **Step 1: 重写 AnimeSchedule.jsx 渲染逻辑**

将当前的按星期分组列表改为周历网格视图：

```jsx
export default function AnimeSchedule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [availableSeasons, setAvailableSeasons] = useState([]);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const dropdownRef = useRef(null);

  const loadData = useCallback(async (season = '') => {
    // ... Task 2 中的 loadData 实现
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
    setWeekOffset(0);
    loadData(season);
  };

  // 计算当前周的日期范围
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

  const weekDates = getWeekDates();
  const today = new Date();
  const todayNum = today.getDay() === 0 ? 7 : today.getDay();
  const todayStr = today.toISOString().slice(0, 10);

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
    <div className="anime-schedule">
      {/* 顶部工具栏 */}
      <div className="schedule-toolbar">
        <div className="schedule-week-nav">
          <button className="schedule-nav-btn" onClick={() => setWeekOffset(w => w - 1)}>
            ◀ 上一周
          </button>
          <span className="schedule-week-label">
            {weekDates[0].getMonth() + 1}月{weekDates[0].getDate()}日 — {weekDates[6].getMonth() + 1}月{weekDates[6].getDate()}日
          </span>
          <button className="schedule-nav-btn" onClick={() => setWeekOffset(w => w + 1)}>
            下一周 ▶
          </button>
          {weekOffset !== 0 && (
            <button className="schedule-today-btn" onClick={() => setWeekOffset(0)}>
              回到本周
            </button>
          )}
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
            <div
              key={dayNum}
              className={`schedule-calendar-day ${isToday ? 'today' : ''}`}
            >
              <div className="schedule-day-head">
                <span className={`schedule-day-name ${isToday ? 'today' : ''}`}>
                  {dayGroup.weekdayLabel || WEEKDAYS[dayNum === 7 ? 0 : dayNum]}
                </span>
                <span className="schedule-day-date">
                  {weekDates[idx] ? `${weekDates[idx].getMonth() + 1}/${weekDates[idx].getDate()}` : ''}
                </span>
              </div>

              <div className="schedule-day-items">
                {items.length === 0 ? (
                  <div className="schedule-day-empty">暂无番剧</div>
                ) : (
                  items.map(item => (
                    <a
                      key={item.id || Math.random()}
                      className="schedule-anime-card"
                      href={`/info/2/${item.id}`}
                      onClick={(e) => { e.preventDefault(); window.location.href = `/info/2/${item.id}`; }}
                    >
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
    </div>
  );
}
```

- [ ] **Step 2: 重写 AnimeSchedule.css 为周历样式**

```css
.anime-schedule {
  padding: 0;
}

.anime-schedule-loading,
.anime-schedule-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--text-tertiary);
  font-size: 14px;
}

.anime-schedule-error button {
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-primary);
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.anime-schedule-error button:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* ── 工具栏 ── */

.schedule-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-card);
  backdrop-filter: blur(var(--blur-md));
  border-bottom: 1px solid var(--border-primary);
}

.schedule-week-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.schedule-nav-btn {
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-primary);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.schedule-nav-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.schedule-week-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 160px;
  text-align: center;
}

.schedule-today-btn {
  padding: 5px 12px;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.schedule-today-btn:hover {
  background: var(--primary-hover);
}

/* ── 季度选择器 ── */

.schedule-season-selector {
  position: relative;
}

.schedule-season-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid var(--border-primary);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.schedule-season-btn:hover {
  border-color: var(--primary);
}

.schedule-season-btn .rotated {
  transform: rotate(180deg);
}

.schedule-season-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 140px;
  max-height: 260px;
  overflow-y: auto;
  background: var(--bg-card);
  backdrop-filter: blur(var(--blur-md));
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  z-index: 20;
  padding: 4px;
}

.schedule-season-option {
  display: block;
  width: 100%;
  padding: 7px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.schedule-season-option:hover {
  background: var(--primary-bg);
  color: var(--text-primary);
}

.schedule-season-option.active {
  background: var(--primary);
  color: white;
}

/* ── 周历网格 ── */

.schedule-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  padding: 16px;
  min-height: 400px;
}

.schedule-calendar-day {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 8px;
  min-height: 200px;
  transition: all 0.2s;
}

.schedule-calendar-day.today {
  border: 2px solid var(--primary);
}

.schedule-day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-primary);
}

.schedule-day-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.schedule-day-name.today {
  color: var(--primary);
}

.schedule-day-date {
  font-size: 10px;
  color: var(--text-quaternary);
}

.schedule-day-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.schedule-day-empty {
  text-align: center;
  color: var(--text-quaternary);
  font-size: 11px;
  padding: 20px 0;
}

/* ── 番剧卡片 ── */

.schedule-anime-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.schedule-anime-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.schedule-anime-cover {
  height: 80px;
  overflow: hidden;
  background: var(--bg-input);
}

.schedule-anime-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.schedule-anime-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-quaternary);
  font-size: 10px;
}

.schedule-anime-info {
  padding: 4px 6px;
}

.schedule-anime-title {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.schedule-anime-time {
  display: block;
  font-size: 9px;
  color: var(--text-tertiary);
}

/* ── 响应式 ── */

@media (max-width: 1024px) {
  .schedule-calendar-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 640px) {
  .schedule-toolbar {
    flex-direction: column;
    gap: 8px;
  }

  .schedule-week-nav {
    width: 100%;
    justify-content: center;
    flex-wrap: wrap;
  }

  .schedule-calendar-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    padding: 8px;
  }

  .schedule-anime-cover {
    height: 60px;
  }
}
```

- [ ] **Step 3: 验证放送表周历视图**

在浏览器中打开放送表页面，确认：
- 7 列网格正确显示
- 当天列粉色边框高亮
- 番剧卡片带封面图
- 周导航和季度选择器正常工作

---

### Task 4: 条目详情页 — 多平台播放链接

**Files:**
- Modify: `src/components/Info/InfoDetail.jsx`
- Modify: `src/components/Info/InfoDetail.css`

- [ ] **Step 1: 在 InfoDetail.jsx 中添加 BangumiDataService 导入和播放平台组件**

在文件顶部导入区添加：

```js
import { BangumiDataService } from '../../services/BangumiDataService';
```

在 `InfoDetail` 组件内部添加播放平台状态和加载逻辑：

```js
const [platformLinks, setPlatformLinks] = useState(null);

useEffect(() => {
  if (!id) return;
  let cancelled = false;
  BangumiDataService.getSitesByBgmId(id).then(item => {
    if (cancelled || !item?.sites) return;
    const links = [];
    const siteMeta = BangumiDataService.getSiteMeta();
    item.sites.forEach(site => {
      if (site.site === 'bangumi') return; // 跳过 Bangumi 自身
      const meta = siteMeta[site.site];
      if (!meta || meta.type !== 'onair') return; // 仅展示播放平台
      const url = BangumiDataService.generatePlatformUrl(site.site, site.id);
      if (url) {
        links.push({
          key: site.site,
          title: meta.title,
          url,
          regions: meta.regions || [],
        });
      }
    });
    if (!cancelled) setPlatformLinks(links);
  });
  return () => { cancelled = true; };
}, [id]);
```

- [ ] **Step 2: 在侧边栏添加播放平台区域**

在 `detail-sidebar-actions` div 之后（收藏操作区域之后），添加播放平台区域：

```jsx
{/* 播放平台 */}
{platformLinks && platformLinks.length > 0 && (
  <div className="detail-platform-links">
    <h4 className="detail-platform-title">播放平台</h4>
    <div className="detail-platform-list">
      {platformLinks.map(link => (
        <a
          key={link.key}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`detail-platform-btn platform-${link.key}`}
        >
          {link.title}
          {link.regions.length > 0 && (
            <span className="detail-platform-region">{link.regions.join('/')}</span>
          )}
        </a>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: 在 InfoDetail.css 中添加播放平台样式**

```css
/* ── 播放平台 ── */

.detail-platform-links {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-input);
  border-radius: var(--radius-md);
}

.detail-platform-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px;
}

.detail-platform-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-platform-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
  color: white;
  text-decoration: none;
  transition: all 0.2s;
}

.detail-platform-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
  color: white;
}

.detail-platform-region {
  font-size: 9px;
  opacity: 0.8;
}

/* 平台品牌色 */
.platform-bilibili { background: #00a1d6; }
.platform-bilibili_hk_mo_tw { background: #00a1d6; }
.platform-bilibili_hk_mo { background: #00a1d6; }
.platform-bilibili_tw { background: #00a1d6; }
.platform-acfun { background: #e53935; }
.platform-netflix { background: #e50914; }
.platform-gamer { background: #ff6b00; }
.platform-youku { background: #1a9cff; }
.platform-qq { background: #ff6600; }
.platform-iqiyi { background: #00c800; }
.platform-nicovideo { background: #231815; }
.platform-mgtv { background: #ff8601; }
.platform-letv { background: #e5171d; }
.platform-disneyplus { background: #113ccf; }
.platform-amazon { background: #ff9900; }
.platform-hulu { background: #1ce783; color: #000; }
.platform-crunchyroll { background: #f47521; }
.platform-bahamut { background: #0a7cba; }
```

- [ ] **Step 4: 验证详情页播放平台**

打开一个动画条目详情页，确认：
- 播放平台区域正确显示
- 各平台按钮颜色正确
- 点击按钮能跳转到对应平台页面
- 无播放数据的条目不显示该区域

---

### Task 5: 数据来源声明

**Files:**
- Modify: `src/components/NewsZone/AnimeSchedule.jsx`

- [ ] **Step 1: 在放送表底部添加数据来源声明**

根据 bangumi-data CC BY 4.0 许可证要求，在放送表底部添加数据来源声明：

在 `AnimeSchedule` 组件的 return 中，`schedule-calendar-grid` div 之后添加：

```jsx
<div className="schedule-attribution">
  放送数据来自 <a href="https://github.com/bangumi-data/bangumi-data" target="_blank" rel="noopener noreferrer">bangumi-data</a> · 条目信息来自 <a href="https://bangumi.tv" target="_blank" rel="noopener noreferrer">Bangumi</a>
</div>
```

在 `AnimeSchedule.css` 中添加：

```css
.schedule-attribution {
  text-align: center;
  padding: 16px;
  font-size: 11px;
  color: var(--text-quaternary);
}

.schedule-attribution a {
  color: var(--text-link);
  text-decoration: none;
}

.schedule-attribution a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 2: 最终验证**

完整测试所有功能：
1. 放送表周历视图正常显示
2. 周导航和季度切换正常
3. 条目详情页播放平台正确显示
4. 数据来源声明正确显示
5. 亮色/暗色主题下 UI 正常
