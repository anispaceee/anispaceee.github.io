import { useState, useEffect, useCallback } from 'react';
import { HitokotoService } from '../../services/HitokotoService';
import './HitokotoDecoration.css';

const COLORS = [
  'rgba(232, 134, 162, 0.32)',
  'rgba(184, 154, 212, 0.28)',
  'rgba(126, 184, 218, 0.28)',
  'rgba(143, 212, 164, 0.25)',
  'rgba(247, 185, 142, 0.28)',
  'rgba(232, 134, 162, 0.22)',
  'rgba(184, 154, 212, 0.20)',
];

// 适配窄列的字号范围，去掉过大字号减少堆叠
const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20];

/**
 * 改进的布局算法：
 * - 每侧3列（原来2列），大幅减少垂直堆叠
 * - 侧边区域 0-30% / 70-100%（原来 0-25% / 75-100%）
 * - 跳过顶部12%避免和横幅重叠
 * - 小随机偏移保持自然感
 */
function generateLayout(count) {
  const TOP_START = 12; // 跳过顶部12%（banner区域）
  const HEIGHT_RANGE = 100 - TOP_START;
  const LEFT_ZONE_WIDTH = 30; // 左侧区域宽度 0-30%
  const RIGHT_ZONE_START = 70; // 右侧区域起始 70%
  const RIGHT_ZONE_WIDTH = 30; // 右侧区域宽度 70-100%
  const COLS_PER_SIDE = 3; // 每侧3列

  const leftCount = Math.ceil(count / 2);
  const rightCount = count - leftCount;
  const positions = [];

  // 左侧区域
  const leftRows = Math.ceil(leftCount / COLS_PER_SIDE);
  for (let i = 0; i < leftCount; i++) {
    const col = i % COLS_PER_SIDE;
    const row = Math.floor(i / COLS_PER_SIDE);
    const cellWidth = LEFT_ZONE_WIDTH / COLS_PER_SIDE;
    const cellHeight = HEIGHT_RANGE / leftRows;

    const x = (col + 0.5) * cellWidth + (Math.random() - 0.5) * cellWidth * 0.2;
    const y = TOP_START + (row + 0.5) * cellHeight + (Math.random() - 0.5) * cellHeight * 0.15;

    positions.push({
      left: `${x}%`,
      top: `${y}%`,
      fontSize: FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: i * 0.04,
    });
  }

  // 右侧区域
  const rightRows = Math.ceil(rightCount / COLS_PER_SIDE);
  for (let i = 0; i < rightCount; i++) {
    const col = i % COLS_PER_SIDE;
    const row = Math.floor(i / COLS_PER_SIDE);
    const cellWidth = RIGHT_ZONE_WIDTH / COLS_PER_SIDE;
    const cellHeight = HEIGHT_RANGE / rightRows;

    const x = RIGHT_ZONE_START + (col + 0.5) * cellWidth + (Math.random() - 0.5) * cellWidth * 0.2;
    const y = TOP_START + (row + 0.5) * cellHeight + (Math.random() - 0.5) * cellHeight * 0.15;

    positions.push({
      left: `${x}%`,
      top: `${y}%`,
      fontSize: FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: (leftCount + i) * 0.04,
    });
  }

  return positions;
}

export default function HitokotoDecoration({ count = 4 }) {
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    await HitokotoService.ensureCache();

    // 不重复地获取台词
    const hitokotos = HitokotoService.getUniqueHitokotos(count);
    if (hitokotos.length === 0) return;

    const layout = generateLayout(hitokotos.length);
    setItems(hitokotos.map((h, i) => ({
      key: `${h.id}-${Date.now()}-${i}`,
      text: h.text,
      from: h.from,
      fromWho: h.fromWho,
      layout: layout[i],
    })));
  }, [count]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (items.length === 0) return null;

  return (
    <div className="hitokoto-decoration">
      {items.map(item => (
        <div
          key={item.key}
          className="hitokoto-item"
          style={{
            left: item.layout.left,
            top: item.layout.top,
            color: item.layout.color,
            fontSize: `${item.layout.fontSize}px`,
            fontWeight: item.layout.fontSize >= 18 ? 600 : 400,
            transform: 'translate(-50%, -50%)',
            maxWidth: item.layout.fontSize >= 18 ? '180px' : '150px',
            animationDelay: `${item.layout.delay}s`,
          }}
        >
          {item.text}
          <span className="hitokoto-from">
            {item.fromWho && `${item.fromWho} · `}{item.from}
          </span>
        </div>
      ))}
    </div>
  );
}
