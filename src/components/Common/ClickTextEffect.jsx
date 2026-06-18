import { useEffect, useState, useRef } from 'react';

const CLICK_TEXT_KEY = 'anispace_click_text';

// 红莲教团爆裂魔法台词（来自 wweiyi2004.github.io）
const DEFAULT_TEXTS = [
  '向那比黑更黑比暗更暗的深渊中',
  '祈求吾之深红闪光',
  '觉醒之时已然降至',
  '堕入无谬境界的真理啊',
  '化作无穷的扭曲现界吧',
  '起舞吧 起舞吧 起舞吧！',
  '吾之魔力奔流所求之物即崩坏',
  '无人能及之崩坏',
  '森罗万象皆归尘土',
  '从深渊前来吧！',
  'Explosion！',
];

export function isClickTextOn() {
  const v = localStorage.getItem(CLICK_TEXT_KEY);
  return v === null || v === '1';
}

export function setClickTextOn(val) {
  localStorage.setItem(CLICK_TEXT_KEY, val ? '1' : '0');
  window.dispatchEvent(new CustomEvent('click-text-setting-change', { detail: val }));
}

function randomColor() {
  return '#' + Array.from({ length: 6 }, () => '0123456789abcdef'[Math.floor(16 * Math.random())]).join('');
}

export default function ClickTextEffect() {
  const [enabled, setEnabled] = useState(() => isClickTextOn());
  const indexRef = useRef(0);

  useEffect(() => {
    const handler = (e) => setEnabled(e.detail);
    window.addEventListener('click-text-setting-change', handler);
    return () => window.removeEventListener('click-text-setting-change', handler);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e) => {
      const span = document.createElement('span');
      const textIndex = indexRef.current;
      indexRef.current = (indexRef.current + 1) % DEFAULT_TEXTS.length;
      span.textContent = DEFAULT_TEXTS[textIndex];

      const { pageX, pageY } = e;

      // 先隐藏添加到 DOM 以测量宽度
      span.style.cssText = `
        position: absolute;
        visibility: hidden;
        font-weight: bold;
        font-size: 15px;
        word-break: break-word;
        pointer-events: none;
        z-index: 150;
      `;
      document.body.appendChild(span);

      const width = span.offsetWidth;
      const clientWidth = document.documentElement.clientWidth;
      const left = Math.min(Math.max(pageX - width / 2, 10), clientWidth - width - 10);

      const color = randomColor();
      span.style.cssText = `
        z-index: 150;
        top: ${pageY - 20}px;
        left: ${left}px;
        position: absolute;
        font-weight: bold;
        color: ${color};
        cursor: default;
        font-size: 15px;
        word-break: break-word;
        visibility: visible;
        pointer-events: none;
        transition: none;
      `;

      const startTime = performance.now();
      const animate = (now) => {
        const elapsed = now - startTime;
        if (elapsed < 800) {
          const t = elapsed / 800;
          span.style.top = (pageY - 20 - 30 * t) + 'px';
          span.style.opacity = 1 - t;
          requestAnimationFrame(animate);
        } else {
          span.remove();
        }
      };
      requestAnimationFrame(animate);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [enabled]);

  return null;
}
