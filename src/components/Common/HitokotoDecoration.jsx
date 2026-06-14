import { useState, useEffect, useCallback } from 'react';
import { HitokotoService } from '../../services/HitokotoService';
import './HitokotoDecoration.css';

const COLORS = [
  'rgba(232, 134, 162, 0.15)',  // 粉色
  'rgba(184, 154, 212, 0.12)',  // 紫色
  'rgba(126, 184, 218, 0.12)',  // 蓝色
  'rgba(143, 212, 164, 0.10)',  // 绿色
  'rgba(247, 185, 142, 0.12)',  // 橙色
  'rgba(232, 134, 162, 0.10)',  // 浅粉
  'rgba(184, 154, 212, 0.08)',  // 浅紫
];

const FONT_SIZES = [14, 16, 18, 20, 24, 28, 32, 36, 42, 48];

function generatePosition(index, total) {
  // 生成随机但分散的位置，避免重叠
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);

  const cellWidth = 100 / cols;
  const cellHeight = 100 / rows;

  // 在单元格内随机偏移
  const offsetX = (Math.random() * 0.6 + 0.2) * cellWidth;
  const offsetY = (Math.random() * 0.6 + 0.2) * cellHeight;

  return {
    left: `${col * cellWidth + offsetX}%`,
    top: `${row * cellHeight + offsetY}%`,
  };
}

function generateStyle(index, total) {
  const pos = generatePosition(index, total);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const fontSize = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)];
  const rotation = (Math.random() - 0.5) * 10; // -5° to +5°

  return {
    position: 'absolute',
    left: pos.left,
    top: pos.top,
    color,
    fontSize: `${fontSize}px`,
    fontWeight: fontSize > 30 ? 700 : fontSize > 20 ? 600 : 400,
    transform: `rotate(${rotation}deg)`,
    maxWidth: '300px',
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
    userSelect: 'none',
    pointerEvents: 'none',
    transition: 'opacity 0.5s ease',
  };
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
    setItems(hitokotos.map((h, i) => ({
      key: `${h.id}-${Date.now()}-${i}`,
      text: h.text,
      from: h.from,
      style: generateStyle(i, hitokotos.length),
    })));
  }, [count]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (items.length === 0) return null;

  return (
    <div className="hitokoto-decoration">
      {items.map(item => (
        <div key={item.key} style={item.style} className="hitokoto-item">
          {item.text}
          {item.from && (
            <span className="hitokoto-from">—— {item.from}</span>
          )}
        </div>
      ))}
    </div>
  );
}
