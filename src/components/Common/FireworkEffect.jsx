import { useEffect, useState, useRef } from 'react';

const FIREWORK_KEY = 'anispace_firework';

export function isFireworkOn() {
  const v = localStorage.getItem(FIREWORK_KEY);
  return v === null || v === '1';
}

export function setFireworkOn(val) {
  localStorage.setItem(FIREWORK_KEY, val ? '1' : '0');
  window.dispatchEvent(new CustomEvent('firework-setting-change', { detail: val }));
}

export default function FireworkEffect() {
  const [enabled, setEnabled] = useState(() => isFireworkOn());
  const initializedRef = useRef(false);

  // 监听设置变化
  useEffect(() => {
    const handler = (e) => setEnabled(e.detail);
    window.addEventListener('firework-setting-change', handler);
    return () => window.removeEventListener('firework-setting-change', handler);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // 关闭时：隐藏 canvas
      const canvas = document.getElementById('anispace-firework-canvas');
      if (canvas) canvas.style.display = 'none';
      return;
    }

    // 开启时：显示 canvas
    const canvas = document.getElementById('anispace-firework-canvas');
    if (canvas) canvas.style.display = '';

    // 只初始化一次
    if (initializedRef.current) return;

    let cancelled = false;

    import('mouse-firework').then((mod) => {
      if (cancelled) return;
      const firework = mod.default || mod;
      if (typeof firework !== 'function') return;

      // 初始化后给 canvas 加 id 方便后续查找
      setTimeout(() => {
        const fwCanvas = document.querySelector('canvas[style*="pointer-events:none"]');
        if (fwCanvas && !fwCanvas.id) fwCanvas.id = 'anispace-firework-canvas';
      }, 100);

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

      initializedRef.current = true;
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [enabled]);

  return null;
}
