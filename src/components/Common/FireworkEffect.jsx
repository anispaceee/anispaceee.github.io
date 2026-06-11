import { useEffect } from 'react';

const FIREWORK_KEY = 'anispace_firework';

function isFireworkOn() {
  const v = localStorage.getItem(FIREWORK_KEY);
  return v === null || v === '1';
}

export default function FireworkEffect() {
  useEffect(() => {
    if (!isFireworkOn()) return;

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
    }).catch(() => {
      // mouse-firework 加载失败时静默忽略
    });

    return () => { cancelled = true; };
  }, []);

  return null;
}
