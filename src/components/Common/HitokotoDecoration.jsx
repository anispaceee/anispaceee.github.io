import { useState, useEffect, useCallback } from 'react';
import { HitokotoService } from '../../services/HitokotoService';
import './HitokotoDecoration.css';

const COLORS = [
  'rgba(232, 134, 162, 0.35)',
  'rgba(184, 154, 212, 0.30)',
  'rgba(126, 184, 218, 0.30)',
  'rgba(143, 212, 164, 0.28)',
  'rgba(247, 185, 142, 0.30)',
  'rgba(232, 134, 162, 0.25)',
  'rgba(184, 154, 212, 0.22)',
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48];

function generateLayout(count) {
  // 左右严格对称
  const leftCount = Math.ceil(count / 2);
  const rightCount = count - leftCount;

  const positions = [];

  // 左侧区域：0%-25% 宽度
  const leftCols = 2;
  const leftRows = Math.ceil(leftCount / leftCols);
  for (let i = 0; i < leftCount; i++) {
    const col = i % leftCols;
    const row = Math.floor(i / leftCols);
    const cellWidth = 25 / leftCols;
    const cellHeight = 100 / leftRows;

    const x = (col + 0.5) * cellWidth + (Math.random() - 0.5) * cellWidth * 0.15;
    const y = (row + 0.5) * cellHeight + (Math.random() - 0.5) * cellHeight * 0.15;

    positions.push({
      left: `${x}%`,
      top: `${y}%`,
      fontSize: FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: i * 0.05,
    });
  }

  // 右侧区域：75%-100% 宽度
  const rightCols = 2;
  const rightRows = Math.ceil(rightCount / rightCols);
  for (let i = 0; i < rightCount; i++) {
    const col = i % rightCols;
    const row = Math.floor(i / rightCols);
    const cellWidth = 25 / rightCols;
    const cellHeight = 100 / rightRows;

    const x = 75 + (col + 0.5) * cellWidth + (Math.random() - 0.5) * cellWidth * 0.15;
    const y = (row + 0.5) * cellHeight + (Math.random() - 0.5) * cellHeight * 0.15;

    positions.push({
      left: `${x}%`,
      top: `${y}%`,
      fontSize: FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: (leftCount + i) * 0.05,
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
            fontWeight: item.layout.fontSize > 30 ? 700 : item.layout.fontSize > 20 ? 600 : 400,
            transform: 'translate(-50%, -50%)',
            maxWidth: item.layout.fontSize > 30 ? '280px' : '200px',
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
