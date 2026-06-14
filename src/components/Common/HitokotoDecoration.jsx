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
  // 计算网格：宽屏偏向更多列
  const cols = Math.ceil(Math.sqrt(count * 1.8));
  const rows = Math.ceil(count / cols);
  const cellWidth = 100 / cols;
  const cellHeight = 100 / rows;

  const positions = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // 单元格中心 + 微小随机偏移（避免完全对齐但不会超出单元格）
    const jitterX = (Math.random() - 0.5) * cellWidth * 0.3;
    const jitterY = (Math.random() - 0.5) * cellHeight * 0.3;

    const centerX = (col + 0.5) * cellWidth + jitterX;
    const centerY = (row + 0.5) * cellHeight + jitterY;

    // 随机字号和颜色
    const fontSize = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const rotation = 0;
    const delay = i * 0.06;

    positions.push({
      left: `${centerX}%`,
      top: `${centerY}%`,
      color,
      fontSize,
      rotation,
      delay,
      maxWidth: fontSize > 30 ? '400px' : '280px',
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
            transform: `translate(-50%, -50%) rotate(${item.layout.rotation}deg)`,
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
