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

// 适配窄列的字号范围，加入一些大字号制造层次感
const FONT_SIZES = [13, 14, 15, 16, 18, 20, 22, 24, 28, 32];

/**
 * 自由散布布局：
 * - 不用严格网格，在侧边区域内随机散布
 * - 允许部分堆叠，营造自然凌乱感
 * - 跳过顶部12%避免和横幅重叠
 * - 大字号元素更少，小字号更多
 */
function generateLayout(count) {
  const TOP_START = 12;
  const HEIGHT_RANGE = 100 - TOP_START;

  const leftCount = Math.ceil(count / 2);
  const rightCount = count - leftCount;
  const positions = [];

  // 左侧区域：0-32% 宽度，随机散布
  for (let i = 0; i < leftCount; i++) {
    const x = Math.random() * 28 + 2; // 2%-30%
    const y = TOP_START + Math.random() * HEIGHT_RANGE; // 12%-100%

    // 大字号概率30%，小字号70%
    const fontSizePool = Math.random() < 0.3
      ? FONT_SIZES.filter(s => s >= 22)  // 30% 大字号
      : FONT_SIZES.filter(s => s < 22);  // 70% 小字号
    const fontSize = fontSizePool[Math.floor(Math.random() * fontSizePool.length)];

    positions.push({
      left: `${x}%`,
      top: `${y}%`,
      fontSize,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: i * 0.04,
    });
  }

  // 右侧区域：68-100% 宽度，随机散布
  for (let i = 0; i < rightCount; i++) {
    const x = 68 + Math.random() * 30; // 68%-98%
    const y = TOP_START + Math.random() * HEIGHT_RANGE; // 12%-100%

    const fontSizePool = Math.random() < 0.2
      ? FONT_SIZES.filter(s => s >= 20)
      : FONT_SIZES.filter(s => s < 20);
    const fontSize = fontSizePool[Math.floor(Math.random() * fontSizePool.length)];

    positions.push({
      left: `${x}%`,
      top: `${y}%`,
      fontSize,
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
            maxWidth: item.layout.fontSize >= 28 ? '260px' : item.layout.fontSize >= 22 ? '220px' : '180px',
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
