import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { CollectionMarkService, StorageService } from '../../services/api';
import { TrendingUp, Star, Calendar, Clock, Award, Activity, BarChart3, PieChart, Zap, Heart, BookOpen, Gamepad2, Tv } from 'lucide-react';
import './ProfileStats.css';

const SCORE_RANGES = [
  { range: '9-10 分', label: '神作', color: '#f56c6c' },
  { range: '7-8 分', label: '推荐', color: '#e6a23c' },
  { range: '5-6 分', label: '一般', color: '#909399' },
  { range: '3-4 分', label: '较差', color: '#67c23a' },
  { range: '1-2 分', label: '很差', color: '#409eff' },
];

const STATS_CACHE_KEY = 'acg_profile_stats_cache';
const CACHE_TTL = 5 * 60 * 1000;

function getStatsCache(userId) {
  const cached = StorageService.get(`${STATS_CACHE_KEY}_${userId}`);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) return null;
  return cached.data;
}

function setStatsCache(userId, data) {
  StorageService.set(`${STATS_CACHE_KEY}_${userId}`, { data, timestamp: Date.now() });
}

const memoryCache = new Map();

export default function ProfileStats() {
  const { currentUser } = useApp();
  const [stats, setStats] = useState({
    totalWatched: 0,
    totalPlaying: 0,
    totalRead: 0,
    totalTimeSpent: 0,
    averageScore: 0,
    scoreDistribution: [],
    activityData: [],
    typeDistribution: [],
    recentActivity: [],
    markCounts: { wish: 0, collect: 0, doing: 0, on_hold: 0, dropped: 0 },
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('all');
  const refreshTimerRef = useRef(null);

  useEffect(() => {
    fetchStats();
    refreshTimerRef.current = setInterval(() => fetchStats(true), 5 * 60 * 1000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [currentUser, timeRange]);

  const fetchStats = (fromCache = false) => {
    const userId = currentUser?.id || 'guest';

    if (fromCache) {
      const memCached = memoryCache.get(userId);
      if (memCached && Date.now() - memCached.timestamp < CACHE_TTL) return;
    }

    const memCached = memoryCache.get(userId);
    if (memCached && Date.now() - memCached.timestamp < 60000) {
      setStats(memCached.data);
      return;
    }

    const lsCached = getStatsCache(userId);
    if (lsCached && Date.now() - lsCached.timestamp < CACHE_TTL) {
      setStats(lsCached.data);
      memoryCache.set(userId, { data: lsCached.data, timestamp: lsCached.timestamp });
      return;
    }

    const markCounts = CollectionMarkService.getMarkCounts(userId);
    const allMarks = CollectionMarkService.getUserMarks(userId);

    const anime = allMarks.filter(m => m.subjectType === 2);
    const novel = allMarks.filter(m => m.subjectType === 1);
    const game = allMarks.filter(m => m.subjectType === 4);

    const ratingData = StorageService.get('acg_ratings') || [];
    const userRatings = ratingData.filter(r => r.userId === userId);
    const scores = userRatings.map(r => r.score).filter(s => s > 0);
    if (scores.length === 0) {
      const markScores = allMarks.filter(m => m.userScore && m.userScore > 0).map(m => m.userScore);
      scores.push(...markScores);
    }
    const avgScore = scores.length > 0
      ? (scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(1)
      : 0;

    const scoreDist = SCORE_RANGES.map(range => {
      const [min, max] = range.range.split('-').map(n => parseInt(n));
      const count = scores.filter(s => s >= min && s <= max).length;
      return { name: range.label, value: count, color: range.color };
    });

    const typeDist = [
      { name: '动画', value: anime.length, color: '#409eff' },
      { name: '小说', value: novel.length, color: '#67c23a' },
      { name: '游戏', value: game.length, color: '#e6a23c' },
    ];

    const now = Date.now();
    const timeRanges = { week: 7 * 24 * 60 * 60 * 1000, month: 30 * 24 * 60 * 60 * 1000, year: 365 * 24 * 60 * 60 * 1000, all: Infinity };
    const cutoff = now - timeRanges[timeRange];

    const recentItems = allMarks.filter(item => {
      const markedAt = new Date(item.updatedAt || item.createdAt || now).getTime();
      return markedAt > cutoff;
    }).sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || now).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || now).getTime();
      return bTime - aTime;
    }).slice(0, 10);

    const activityData = generateActivityData(allMarks, timeRange);
    const totalTime = anime.length * 24 * 60 + novel.length * 10 * 60 + game.length * 30 * 60;

    const statsData = {
      totalWatched: anime.length,
      totalPlaying: game.length,
      totalRead: novel.length,
      totalTimeSpent: totalTime,
      averageScore: avgScore,
      scoreDistribution: scoreDist,
      activityData,
      typeDistribution: typeDist,
      recentActivity: recentItems,
      markCounts,
    };

    setStats(statsData);
    setStatsCache(userId, statsData);
    memoryCache.set(userId, { data: statsData, timestamp: Date.now() });
  };

  const generateActivityData = (items, range) => {
    const days = range === 'week' ? 7 : range === 'month' ? 30 : range === 'year' ? 12 : 7;
    const data = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

      const dayItems = items.filter(item => {
        const itemDate = new Date(item.updatedAt || item.createdAt || Date.now());
        return itemDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) === dateStr;
      });

      data.push({ date: dateStr, count: dayItems.length });
    }

    return data;
  };

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 100) return `${Math.floor(hours / 24)}天 ${hours % 24}小时`;
    return `${hours}小时 ${mins}分钟`;
  };

  const SimpleBarChart = ({ data }) => {
    const maxValue = Math.max(...data.map(d => d.value), 1);
    return (
      <div className="simple-bar-chart">
        {data.map((item, i) => (
          <div key={i} className="bar-item">
            <div className="bar-label">{item.name}</div>
            <div className="bar-wrap">
              <div className="bar-fill" style={{ width: `${(item.value / maxValue) * 100}%`, backgroundColor: item.color }}>
                <span className="bar-fill-label">{item.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const SimplePieChart = ({ data }) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return <div className="no-data">暂无数据</div>;

    const radius = 50;
    const strokeWidth = 16;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const segments = data.map((item, i) => {
      const pct = item.value / total;
      const dashArray = `${pct * circumference} ${(1 - pct) * circumference}`;
      const seg = { ...item, pct, dashArray, offset };
      offset += pct * circumference;
      return seg;
    });

    return (
      <div className="pie-chart-container">
        <svg viewBox="0 0 140 140" className="svg-pie-chart">
          {segments.map((seg, i) => (
            <circle key={i} cx="70" cy="70" r={radius} fill="none"
              stroke={seg.color} strokeWidth={strokeWidth}
              strokeDasharray={seg.dashArray}
              strokeDashoffset={-seg.offset}
              strokeLinecap="round" className="pie-segment" />
          ))}
          <text x="70" y="68" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text-primary)">{total}</text>
          <text x="70" y="82" textAnchor="middle" fontSize="9" fill="var(--text-quaternary)">总计</text>
        </svg>
        <div className="pie-legend-list">
          {data.map((item, i) => (
            <div key={i} className="pie-legend-item">
              <div className="pie-legend-dot" style={{ backgroundColor: item.color }} />
              <span className="pie-legend-name">{item.name}</span>
              <span className="pie-legend-pct">{((item.value / total) * 100).toFixed(1)}%</span>
              <span className="pie-legend-val">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const SimpleLineChart = ({ data }) => {
    const maxValue = Math.max(...data.map(d => d.count), 1);
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (d.count / maxValue) * 100;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="simple-line-chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="line-svg">
          <polyline fill="none" stroke="#409eff" strokeWidth="2" points={points} vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 100 - (d.count / maxValue) * 100;
            return <circle key={i} cx={x} cy={y} r="3" fill="#409eff" />;
          })}
        </svg>
        <div className="line-labels">
          {data.map((d, i) => <span key={i} className="line-label">{d.date}</span>)}
        </div>
      </div>
    );
  };

  return (
    <div className="profile-stats">
      <div className="profile-stats-header">
        <h2 className="profile-stats-title"><Activity size={20} /> 数据统计</h2>
        <div className="profile-stats-controls">
          <select value={timeRange} onChange={e => setTimeRange(e.target.value)} className="time-range-select">
            <option value="week">最近 7 天</option>
            <option value="month">最近 30 天</option>
            <option value="year">最近 1 年</option>
            <option value="all">全部时间</option>
          </select>
        </div>
      </div>

      <div className="profile-stats-tabs">
        <button className={`profile-stat-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <Award size={14} /> 总览
        </button>
        <button className={`profile-stat-tab ${activeTab === 'score' ? 'active' : ''}`} onClick={() => setActiveTab('score')}>
          <Star size={14} /> 评分
        </button>
        <button className={`profile-stat-tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
          <TrendingUp size={14} /> 活动
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="profile-stats-content">
          <div className="profile-stats-cards">
            <div className="profile-stat-card">
              <div className="stat-card-icon anime"><TrendingUp size={24} /></div>
              <div className="stat-card-info">
                <span className="stat-card-value">{stats.totalWatched}</span>
                <span className="stat-card-label">已看动画</span>
              </div>
            </div>
            <div className="profile-stat-card">
              <div className="stat-card-icon game"><Award size={24} /></div>
              <div className="stat-card-info">
                <span className="stat-card-value">{stats.totalPlaying}</span>
                <span className="stat-card-label">已玩游戏</span>
              </div>
            </div>
            <div className="profile-stat-card">
              <div className="stat-card-icon novel"><Calendar size={24} /></div>
              <div className="stat-card-info">
                <span className="stat-card-value">{stats.totalRead}</span>
                <span className="stat-card-label">已读小说</span>
              </div>
            </div>
            <div className="profile-stat-card">
              <div className="stat-card-icon time"><Clock size={24} /></div>
              <div className="stat-card-info">
                <span className="stat-card-value">{formatTime(stats.totalTimeSpent)}</span>
                <span className="stat-card-label">总耗时</span>
              </div>
            </div>
          </div>

          <div className="profile-marks-summary-row">
            {Object.entries(stats.markCounts).map(([key, count]) => (
              <div key={key} className={`mark-stat-badge mark-stat-${key}`}>
                <span className="mark-stat-num">{count}</span>
                <span className="mark-stat-label">{key === 'wish' ? '想看/读/玩' : key === 'collect' ? '看过/读/玩' : key === 'doing' ? '在看/读/玩' : CollectionMarkService.MARK_LABELS[key]}</span>
              </div>
            ))}
          </div>

          <div className="profile-charts-row">
            <div className="profile-chart-card">
              <h3 className="chart-card-title"><PieChart size={16} /> 内容类型分布</h3>
              <SimplePieChart data={stats.typeDistribution} />
            </div>
            <div className="profile-chart-card">
              <h3 className="chart-card-title"><BarChart3 size={16} /> 平均评分</h3>
              <div className="profile-avg-score">
                <div className="avg-score-circle" style={{ '--score-deg': (stats.averageScore / 10) * 360 }}>
                  <span className="avg-score-value">{stats.averageScore}</span>
                  <span className="avg-score-label">/ 10</span>
                </div>
                <div className="avg-score-bars">
                  {SCORE_RANGES.map((range, i) => (
                    <div key={i} className="avg-score-bar-wrap">
                      <div className="avg-score-bar" style={{ backgroundColor: range.color }} />
                      <span className="avg-score-bar-label">{range.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'score' && (
        <div className="profile-stats-content">
          <div className="profile-chart-card full-width">
            <h3 className="chart-card-title"><BarChart3 size={16} /> 评分分布</h3>
            <SimpleBarChart data={stats.scoreDistribution} />
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="profile-stats-content">
          <div className="profile-chart-card full-width">
            <h3 className="chart-card-title"><TrendingUp size={16} /> 活动趋势</h3>
            <SimpleLineChart data={stats.activityData} />
          </div>
          <div className="profile-chart-card full-width">
            <h3 className="chart-card-title">最近活动</h3>
            <div className="profile-recent-activity">
              {stats.recentActivity.length === 0 ? (
                <div className="no-activity">暂无活动记录</div>
              ) : (
                stats.recentActivity.map((item, i) => (
                  <div key={i} className="activity-item">
                    <img src={item.subjectImage || ''} alt="" className="activity-cover" loading="lazy" />
                    <div className="activity-info">
                      <span className="activity-name">{item.subjectName || `条目 #${item.subjectId}`}</span>
                      <span className="activity-meta">
                        {item.subjectType === 2 ? '动画' : item.subjectType === 4 ? '游戏' : '小说'}
                        <span className={`activity-mark mark-${item.mark}`}>{CollectionMarkService.getMarkLabels(item.subjectType)[item.mark]}</span>
                        {item.userScore && <span className="activity-score">⭐ {item.userScore}</span>}
                      </span>
                    </div>
                    <span className="activity-time">
                      {new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
