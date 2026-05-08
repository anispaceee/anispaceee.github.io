import { useRef, useEffect, useCallback, useState } from 'react';

const DANMAKU_COLORS = ['#FFFFFF', '#FE0302', '#FF7204', '#FFD302', '#00CD00', '#019899', '#426ABE', '#89D5FF', '#CC0273', '#222222'];
const DANMAKU_FONT_SIZES = { small: 18, medium: 25, large: 32 };
const DANMAKU_SPEED = { slow: 1.5, medium: 2.5, fast: 4 };
const TRACK_HEIGHT = 36;
const MAX_TRACKS = 12;

export function useDanmakuEngine(containerRef) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const danmakusRef = useRef([]);
  const tracksRef = useRef(Array.from({ length: MAX_TRACKS }, () => []));
  const [danmakuList, setDanmakuList] = useState([]);
  const [showDanmaku, setShowDanmaku] = useState(true);
  const [danmakuOpacity, setDanmakuOpacity] = useState(0.8);
  const [danmakuFontSize, setDanmakuFontSize] = useState('medium');
  const [danmakuSpeed, setDanmakuSpeed] = useState('medium');
  const [danmakuDensity, setDanmakuDensity] = useState(50);
  const [danmakuCount, setDanmakuCount] = useState(0);

  const findAvailableTrack = useCallback((time) => {
    for (let i = 0; i < MAX_TRACKS; i++) {
      const track = tracksRef.current[i];
      if (track.length === 0) return i;
      const last = track[track.length - 1];
      if (last && last.x < -last.width * 0.3) return i;
    }
    const minTrack = tracksRef.current.reduce((min, track, i) => {
      const lastX = track.length > 0 ? track[track.length - 1].x : -Infinity;
      return lastX < min.x ? { i, x: lastX } : min;
    }, { i: 0, x: Infinity });
    return minTrack.i;
  }, []);

  const addDanmaku = useCallback((text, options = {}) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const fontSize = DANMAKU_FONT_SIZES[options.fontSize || danmakuFontSize];
    ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    const width = ctx.measureText(text).width + 20;
    const track = findAvailableTrack();
    const danmaku = {
      id: Date.now() + Math.random(),
      text,
      x: canvas.width + 10,
      y: track * TRACK_HEIGHT + TRACK_HEIGHT / 2 + fontSize / 3,
      track,
      width,
      fontSize,
      color: options.color || '#FFFFFF',
      speed: DANMAKU_SPEED[options.speed || danmakuSpeed],
      type: options.type || 'scroll',
      opacity: options.opacity || danmakuOpacity,
      createdAt: Date.now(),
    };
    tracksRef.current[track].push(danmaku);
    danmakusRef.current.push(danmaku);
    setDanmakuCount(prev => prev + 1);
  }, [danmakuFontSize, danmakuSpeed, danmakuOpacity, findAvailableTrack]);

  const loadDanmakus = useCallback((danmakus) => {
    setDanmakuList(danmakus);
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showDanmaku) {
      animFrameRef.current = requestAnimationFrame(render);
      return;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    danmakusRef.current = danmakusRef.current.filter(d => {
      d.x -= d.speed;
      if (d.x < -d.width - 50) {
        tracksRef.current[d.track] = tracksRef.current[d.track].filter(t => t.id !== d.id);
        return false;
      }
      ctx.save();
      ctx.globalAlpha = d.opacity;
      ctx.font = `bold ${d.fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      if (d.color === '#FFFFFF' || d.color === '#ffffff') {
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
      }
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, d.x, d.y);
      ctx.restore();
      return true;
    });

    animFrameRef.current = requestAnimationFrame(render);
  }, [showDanmaku]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const container = containerRef?.current;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (containerRef?.current) observer.observe(containerRef.current);
    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
    };
  }, [render, containerRef]);

  useEffect(() => {
    tracksRef.current = Array.from({ length: MAX_TRACKS }, () => []);
    danmakusRef.current = [];
  }, []);

  const clearDanmakus = useCallback(() => {
    danmakusRef.current = [];
    tracksRef.current = Array.from({ length: MAX_TRACKS }, () => []);
  }, []);

  return {
    canvasRef,
    addDanmaku,
    loadDanmakus,
    clearDanmakus,
    showDanmaku, setShowDanmaku,
    danmakuOpacity, setDanmakuOpacity,
    danmakuFontSize, setDanmakuFontSize,
    danmakuSpeed, setDanmakuSpeed,
    danmakuDensity, setDanmakuDensity,
    danmakuCount,
    DANMAKU_COLORS,
  };
}
