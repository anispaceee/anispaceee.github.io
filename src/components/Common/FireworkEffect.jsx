import { useEffect, useState, useRef } from 'react';

const FIREWORK_KEY = 'anispace_firework';

// 拦截 addEventListener 捕获烟花库注册的回调
let capturedCallback = null;
const origAddEventListener = document.addEventListener.bind(document);
document.addEventListener = function(type, listener, options) {
  if ((type === 'click' || type === 'touchstart') && !capturedCallback) {
    capturedCallback = listener;
  }
  return origAddEventListener(type, listener, options);
};

const PARTICLE_CONFIG = [
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
];

export function isFireworkOn() {
  const v = localStorage.getItem(FIREWORK_KEY);
  return v === null || v === '1';
}

export function setFireworkOn(val) {
  localStorage.setItem(FIREWORK_KEY, val ? '1' : '0');
  window.dispatchEvent(new CustomEvent('firework-setting-change', { detail: val }));
}

function startFirework() {
  import('mouse-firework').then((mod) => {
    const firework = mod.default || mod;
    if (typeof firework !== 'function') return;
    firework({ excludeElements: [], particles: PARTICLE_CONFIG });
    // 给 canvas 加 id
    setTimeout(() => {
      const fwCanvas = document.querySelector('canvas[style*="pointer-events:none"]');
      if (fwCanvas && !fwCanvas.id) fwCanvas.id = 'anispace-firework-canvas';
    }, 100);
  }).catch(() => {});
}

function stopFirework() {
  // 移除库注册的 click/touchstart 监听器
  if (capturedCallback) {
    document.removeEventListener('click', capturedCallback, false);
    document.removeEventListener('touchstart', capturedCallback, false);
    capturedCallback = null;
  }
  // 隐藏 canvas
  const canvas = document.getElementById('anispace-firework-canvas');
  if (canvas) canvas.style.display = 'none';
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
      if (initializedRef.current) {
        stopFirework();
      }
      return;
    }

    // 开启时
    if (initializedRef.current) {
      // 已经初始化过，重新启动
      const canvas = document.getElementById('anispace-firework-canvas');
      if (canvas) canvas.style.display = '';
      startFirework(); // 库会自动移除旧监听器再注册新的
      return;
    }

    // 首次初始化
    startFirework();
    initializedRef.current = true;
  }, [enabled]);

  return null;
}
