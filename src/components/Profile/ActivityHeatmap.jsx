import { useMemo } from 'react';
import './ActivityHeatmap.css';

const COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];

function getColor(count) {
  if (count === 0) return COLORS[0];
  if (count <= 2) return COLORS[1];
  if (count <= 5) return COLORS[2];
  if (count <= 8) return COLORS[3];
  return COLORS[4];
}

export default function ActivityHeatmap({ data = [], year }) {
  const displayYear = year || new Date().getFullYear();

  // 将数据转为 Map<dateStr, count>
  const dataMap = useMemo(() => {
    const map = new Map();
    data.forEach(d => map.set(d.date, d.count));
    return map;
  }, [data]);

  // 生成 52 周 x 7 天的网格
  const weeks = useMemo(() => {
    const result = [];
    const startDate = new Date(displayYear, 0, 1);
    // 找到第一个周日
    const dayOfWeek = startDate.getDay();
    const firstSunday = new Date(startDate);
    firstSunday.setDate(startDate.getDate() - dayOfWeek);

    for (let w = 0; w < 53; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(firstSunday);
        cellDate.setDate(firstSunday.getDate() + w * 7 + d);
        const dateStr = cellDate.toISOString().split('T')[0];
        const inYear = cellDate.getFullYear() === displayYear;
        week.push({
          date: dateStr,
          count: inYear ? (dataMap.get(dateStr) || 0) : -1,
          inYear,
        });
      }
      result.push(week);
    }
    return result;
  }, [dataMap, displayYear]);

  // 月份标签
  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const firstDay = week.find(d => d.inYear);
      if (firstDay) {
        const month = new Date(firstDay.date).getMonth();
        if (month !== lastMonth) {
          labels.push({ index: i, label: `${month + 1}月` });
          lastMonth = month;
        }
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div className="activity-heatmap">
      <div className="heatmap-months">
        {monthLabels.map((m, i) => (
          <span key={i} className="heatmap-month-label" style={{ gridColumn: m.index + 1 }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="heatmap-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap-week">
            {week.map((day, di) => (
              <div
                key={di}
                className={`heatmap-cell ${day.inYear ? '' : 'heatmap-cell-empty'}`}
                style={{ backgroundColor: day.inYear ? getColor(day.count) : 'transparent' }}
                title={day.inYear ? `${day.date}: ${day.count} 次操作` : ''}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-legend">
        <span className="heatmap-legend-text">少</span>
        {COLORS.map((color, i) => (
          <div key={i} className="heatmap-legend-cell" style={{ backgroundColor: color }} />
        ))}
        <span className="heatmap-legend-text">多</span>
      </div>
    </div>
  );
}
