import { useEffect, useState } from 'react';

const FIREWORK_KEY = 'anispace_firework';

export function isFireworkOn() {
  const v = localStorage.getItem(FIREWORK_KEY);
  return v === null || v === '1';
}

export function setFireworkOn(val) {
  localStorage.setItem(FIREWORK_KEY, val ? '1' : '0');
  // 派发自定义事件，让 FireworkEffect 实时响应
  window.dispatchEvent(new CustomEvent('firework-setting-change', { detail: val }));
}

export default function FireworkEffect() {
  const [enabled, setEnabled] = useState(() => isFireworkOn());

  // 监听设置变化
  useEffect(() => {
    const handler = (e) => setEnabled(e.detail);
    window.addEventListener('firework-setting-change', handler);
    return () => window.removeEventListener('firework-setting-change', handler);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // 关闭时：移除事件监听 + 隐藏 canvas
      const canvas = document.querySelector('canvas[style*="pointer-events:none"]');
      if (canvas) canvas.style.display = 'none';
      return;
    }

    // 开启时：显示 canvas + 初始化烟花
    const canvas = document.querySelector('canvas[style*="pointer-events:none"]');
    if (canvas) canvas.style.display = '';

    let cancelled = false;

    import('mouse-firework').then((mod) => {
      if (cancelled) return;
      const firework = mod.default || mod;
      if (typeof firework !== 'function') return;

      firework({
        excludeElements: [],
        particles: [
          {
            shape: 'circle',
            move: ['emit'],
            easing: 'easeOutExpo',
            colors: [
              'rgba(232,134,162,.9)',
              'rgba(255,182,185,.9)',
              'rgba(250,227,217,.9)',
              'rgba(187,222,214,.9)',
            ],
            number: 30,
            duration: [1200, 1800],
            shapeOptions: {
              radius: [16, 32],
            },
          },
          {
            shape: 'circle',
            move: ['diffuse'],
            easing: 'easeOutExpo',
            colors: ['#FFF'],
            number: 1,
            duration: [1200, 1800],
            shapeOptions: {
              radius: 20,
              alpha: 0.5,
              lineWidth: 6,
            },
          },
        ],
      });
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [enabled]);

  return null;
}
