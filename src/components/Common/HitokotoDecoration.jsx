import { useState, useEffect, useCallback } from 'react';
import { HitokotoService } from '../../services/HitokotoService';
import './HitokotoDecoration.css';

const COLORS = [
  'rgba(232, 134, 162, 0.35)',  // 粉色
  'rgba(184, 154, 212, 0.30)',  // 紫色
  'rgba(126, 184, 218, 0.30)',  // 蓝色
  'rgba(143, 212, 164, 0.28)',  // 绿色
  'rgba(247, 185, 142, 0.30)',  // 橙色
  'rgba(232, 134, 162, 0.25)',  // 浅粉
  'rgba(184, 154, 212, 0.22)',  // 浅紫
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48];

function generateLayout(count) {
  // 左右两侧各放一半台词，中间留空
  const halfCount = Math.ceil(count / 2);
  const leftCount = halfCount;
  const rightCount = count - halfCount;

  // 左侧区域：0%-22% 宽度，0%-100% 高度
  // 右侧区域：78%-100% 宽度，0%-100% 高度
  const positions = [];

  // 左侧
  const leftCols = 2;
  const leftRows = Math.ceil(leftCount / leftCols);
  for (let i = 0; i < leftCount; i++) {
    const col = i % leftCols;
    const row = Math.floor(i / leftCols);
    const cellWidth = 22 / leftCols;
    const cellHeight = 100 / leftRows;

    const jitterX = (Math.random() - 0.5) * cellWidth * 0.2;
    const jitterY = (Math.random() - 0.5) * cellHeight * 0.2;

    const centerX = (col + 0.5) * cellWidth + jitterX;
    const centerY = (row + 0.5) * cellHeight + jitterY;

    const fontSize = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    positions.push({
      left: `${centerX}%`,
      top: `${centerY}%`,
      color,
      fontSize,
      maxWidth: fontSize > 30 ? '280px' : '200px',
      delay: i * 0.06,
    });
  }

  // 右侧
  const rightCols = 2;
  const rightRows = Math.ceil(rightCount / rightCols);
  for (let i = 0; i < rightCount; i++) {
    const col = i % rightCols;
    const row = Math.floor(i / rightCols);
    const cellWidth = 22 / rightCols;
    const cellHeight = 100 / rightRows;

    const jitterX = (Math.random() - 0.5) * cellWidth * 0.2;
    const jitterY = (Math.random() - 0.5) * cellHeight * 0.2;

    const centerX = 78 + (col + 0.5) * cellWidth + jitterX;
    const centerY = (row + 0.5) * cellHeight + jitterY;

    const fontSize = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    positions.push({
      left: `${centerX}%`,
      top: `${centerY}%`,
      color,
      fontSize,
      maxWidth: fontSize > 30 ? '280px' : '200px',
      delay: (leftCount + i) * 0.06,
    });
  }

  return positions;
}

export default function HitokotoDecoration({ count = 4 }) {
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    await HitokotoService.ensureCache();
    const hitokotos = [];
    for (let i = 0; i < count; i++) {
      const h = HitokotoService.getRandomHitokoto();
      if (h) hitokotos.push(h);
    }
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
            maxWidth: item.layout.maxWidth,
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
