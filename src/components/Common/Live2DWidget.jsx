import { useState, useEffect, useCallback } from 'react';
import './Live2DWidget.css';

const LIVE2D_CORE_JS = '/live2d.min.js';
const MODEL_CDN = 'https://cdn.jsdelivr.net/gh/fghrsh/live2d_api@1.0.1/';

const MODEL_LIST = [
  { id: 0, name: 'Pio', textures: ['Potion-Maker/Pio'] },
  { id: 1, name: 'Tia', textures: ['Potion-Maker/Tia'] },
  { id: 2, name: '22娘', textures: ['bilibili-live/22'] },
  { id: 3, name: '33娘', textures: ['bilibili-live/33'] },
  { id: 4, name: '雫', textures: ['ShizukuTalk/shizuku-48', 'ShizukuTalk/shizuku-pajama'] },
  { id: 5, name: '涅普缇努', textures: ['HyperdimensionNeptunia/neptune_classic', 'HyperdimensionNeptunia/nepnep', 'HyperdimensionNeptunia/neptune_santa', 'HyperdimensionNeptunia/nepmaid', 'HyperdimensionNeptunia/nepswim'] },
  { id: 6, name: '诺瓦露', textures: ['HyperdimensionNeptunia/noir_classic', 'HyperdimensionNeptunia/noir_santa', 'HyperdimensionNeptunia/noir_swim'] },
  { id: 7, name: '布兰', textures: ['HyperdimensionNeptunia/blanc_classic', 'HyperdimensionNeptunia/blanc_swim'] },
  { id: 8, name: '贝露', textures: ['HyperdimensionNeptunia/vert_classic', 'HyperdimensionNeptunia/vert_swim'] },
  { id: 9, name: '丛云', textures: ['KantaiCollection/murakumo'] },
];

let coreLoaded = false;
let coreLoading = false;

function loadCoreScript() {
  return new Promise((resolve, reject) => {
    if (coreLoaded && window.loadlive2d) {
      resolve();
      return;
    }
    if (coreLoading) {
      let waited = 0;
      const check = setInterval(() => {
        if (coreLoaded && window.loadlive2d) { clearInterval(check); resolve(); return; }
        // 另一处加载失败（onerror 会把 coreLoading 置回 false）→ 停止轮询并 reject，避免 interval 泄漏
        if (!coreLoading) { clearInterval(check); reject(new Error('Failed to load live2d core')); return; }
        waited += 100;
        if (waited >= 15000) { clearInterval(check); reject(new Error('Live2D core load timeout')); }
      }, 100);
      return;
    }
    coreLoading = true;
    const script = document.createElement('script');
    script.src = LIVE2D_CORE_JS;
    script.async = true;
    script.onload = () => {
      coreLoaded = true;
      coreLoading = false;
      resolve();
    };
    script.onerror = () => {
      coreLoading = false;
      reject(new Error('Failed to load live2d core'));
    };
    document.head.appendChild(script);
  });
}

// 一言 API
async function fetchHitokoto(setTip) {
  try {
    const res = await fetch('https://v1.hitokoto.cn');
    const data = await res.json();
    setTip(data.hitokoto, 6000);
  } catch {
    setTip('一言获取失败~', 3000);
  }
}

export default function Live2DWidget() {
  const [visible, setVisible] = useState(() => {
    const saved = localStorage.getItem('waifu-display');
    return !(saved && Date.now() - Number(saved) <= 86400000);
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [currentModel, setCurrentModel] = useState(() => Number(localStorage.getItem('modelId')) || 0);
  const [currentTexture, setCurrentTexture] = useState(() => Number(localStorage.getItem('modelTexturesId')) || 0);
  const [tip, setTip] = useState('');
  const [tipKey, setTipKey] = useState(0);
  const [showSwitcher, setShowSwitcher] = useState(false);

  const showTip = useCallback((text, duration = 4000) => {
    setTip(text);
    setTipKey(prev => prev + 1);
    setTimeout(() => setTip(''), duration);
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!visible || isMobile) return;

    let cancelled = false;

    const loadModel = async () => {
      try {
        await loadCoreScript();
        if (cancelled) return;

        if (window.loadlive2d) {
          const canvas = document.getElementById('live2d-canvas');
          if (canvas) {
            const model = MODEL_LIST[currentModel];
            const texturePath = model.textures[currentTexture] || model.textures[0];
            const url = MODEL_CDN + 'model/' + texturePath + '/index.json';
            window.loadlive2d('live2d-canvas', url);
            setLoaded(true);
            setError(false);
            localStorage.setItem('modelId', String(currentModel));
            localStorage.setItem('modelTexturesId', String(currentTexture));
          }
        } else {
          setError(true);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Live2D load failed:', e);
          setError(true);
        }
      }
    };

    const timer = setTimeout(loadModel, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [visible, isMobile, currentModel, currentTexture]);

  // 初始欢迎语
  useEffect(() => {
    if (visible && !isMobile) {
      const hour = new Date().getHours();
      let greeting = '';
      if (hour < 6) greeting = '夜深了，注意休息哦~';
      else if (hour < 9) greeting = '早上好！新的一天开始了~';
      else if (hour < 12) greeting = '上午好！今天也要元气满满~';
      else if (hour < 14) greeting = '中午好，记得吃饭哦~';
      else if (hour < 18) greeting = '下午好！来和我玩吧~';
      else if (hour < 22) greeting = '晚上好！今天辛苦了~';
      else greeting = '夜深了，早点休息吧~';
      showTip(greeting, 6000);
    }
  }, [visible, isMobile]);

  const switchModel = () => {
    const next = (currentModel + 1) % MODEL_LIST.length;
    setCurrentModel(next);
    setCurrentTexture(0);
    setLoaded(false);
    setShowSwitcher(false);
    showTip(MODEL_LIST[next].name + ' 来啦~');
  };

  const switchTexture = () => {
    const model = MODEL_LIST[currentModel];
    if (model.textures.length <= 1) {
      showTip('我还没有其他衣服呢！');
      return;
    }
    const next = (currentTexture + 1) % model.textures.length;
    setCurrentTexture(next);
    setLoaded(false);
    showTip('我的新衣服好看嘛？');
  };

  const takePhoto = () => {
    if (window.Live2D) {
      window.Live2D.captureName = 'live2d-photo.png';
      window.Live2D.captureFrame = true;
      showTip('照好了嘛，是不是很可爱呢？');
    }
  };

  const handleQuit = () => {
    localStorage.setItem('waifu-display', String(Date.now()));
    showTip('愿你有一天能与重要的人重逢。', 2000);
    setTimeout(() => setVisible(false), 2000);
  };

  if (!visible || isMobile) {
    if (!visible && !isMobile) {
      return (
        <div className="live2d-toggle" onClick={() => { localStorage.removeItem('waifu-display'); setVisible(true); }}>
          <span>看板娘</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="live2d-widget">
      {tip && <div className="live2d-tip" key={tipKey}>{tip}</div>}

      <div className="live2d-tool">
        <button className="live2d-tool-btn" onClick={() => fetchHitokoto(showTip)} title="一言">
          <svg viewBox="0 0 512 512"><path d="M512 240c0 114.9-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6C73.6 471.1 44.7 480 16 480c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4l0 0 0 0 0 0 0 0 .3-.3c.3-.3 .7-.7 1.3-1.4c1.1-1.2 2.8-3.1 4.9-5.7c4.1-5 9.6-12.4 15.2-21.6c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208z"/></svg>
        </button>
        <button className="live2d-tool-btn" onClick={switchModel} title="切换模型">
          <svg viewBox="0 0 512 512"><path d="M399 384.2C376.9 345.8 335.4 320 288 320H224c-47.4 0-88.9 25.8-111 64.2c35.2 39.2 86.2 63.8 143 63.8s107.8-24.7 143-63.8zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 16a72 72 0 1 0 0-144 72 72 0 1 0 0 144z"/></svg>
        </button>
        <button className="live2d-tool-btn" onClick={switchTexture} title="切换衣服">
          <svg viewBox="0 0 512 512"><path d="M320 64A64 64 0 1 0 192 64a64 64 0 1 0 128 0zm-96 96c-35.3 0-64 28.7-64 64v48c0 17.7 14.3 32 32 32h1.8l11.1 99.5c1.8 16.2 15.5 28.5 31.8 28.5h38.7c16.3 0 30-12.3 31.8-28.5L318.2 304H320c17.7 0 32-14.3 32-32V224c0-35.3-28.7-64-64-64H224zM132.3 394.2c13-2.4 21.7-14.9 19.3-27.9s-14.9-21.7-27.9-19.3c-32.4 5.9-60.9 14.2-82 24.8c-10.5 5.3-20.3 11.7-27.8 19.6C6.4 399.5 0 410.5 0 424c0 21.4 15.5 36.1 29.1 45c14.7 9.6 34.3 17.3 56.4 23.4C130.2 504.7 190.4 512 256 512s125.8-7.3 170.4-19.6c22.1-6.1 41.8-13.8 56.4-23.4c13.7-8.9 29.1-23.6 29.1-45c0-13.5-6.4-24.5-14-32.6c-7.5-7.9-17.3-14.3-27.8-19.6c-21-10.6-49.5-18.9-82-24.8c-13-2.4-25.5 6.3-27.9 19.3s6.3 25.5 19.3 27.9c30.2 5.5 53.7 12.8 69 20.5c3.2 1.6 5.8 3.1 7.9 4.5c3.6 2.4 3.6 7.2 0 9.6c-8.8 5.7-23.1 11.8-43 17.3C374.3 457 318.5 464 256 464s-118.3-7-157.7-17.9c-19.9-5.5-34.2-11.6-43-17.3c-3.6-2.4-3.6-7.2 0-9.6c2.1-1.4 4.8-2.9 7.9-4.5c15.3-7.7 38.8-14.9 69-20.5z"/></svg>
        </button>
        <button className="live2d-tool-btn" onClick={takePhoto} title="截图">
          <svg viewBox="0 0 512 512"><path d="M220.6 121.2L271.1 96 448 96v96H333.2c-21.9-15.1-48.5-24-77.2-24s-55.2 8.9-77.2 24H64V128H192c9.9 0 19.7-2.3 28.6-6.8zM0 128V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H271.1c-9.9 0-19.7 2.3-28.6 6.8L192 64H160V48c0-8.8-7.2-16-16-16H80c-8.8 0-16 7.2-16 16l0 16C28.7 64 0 92.7 0 128zM168 304a88 88 0 1 1 176 0 88 88 0 1 1 -176 0z"/></svg>
        </button>
        <button className="live2d-tool-btn" onClick={() => setShowSwitcher(!showSwitcher)} title="模型列表">
          <svg viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336h24V272H216c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24H216c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>
        </button>
        <button className="live2d-tool-btn live2d-tool-quit" onClick={handleQuit} title="关闭">
          <svg viewBox="0 0 384 512"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
        </button>
      </div>

      {showSwitcher && (
        <div className="live2d-switcher">
          {MODEL_LIST.map((m, i) => (
            <button
              key={m.id}
              className={`live2d-switch-btn ${currentModel === i ? 'active' : ''}`}
              onClick={() => {
                setCurrentModel(i);
                setCurrentTexture(0);
                setLoaded(false);
                setShowSwitcher(false);
                showTip(m.name + ' 来啦~');
              }}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      <div className="live2d-canvas-wrap">
        <canvas
          id="live2d-canvas"
          className="live2d-canvas"
          width="240"
          height="300"
        />
        {!loaded && !error && (
          <div className="live2d-loading">
            <span className="live2d-loading-text">少女祈祷中...</span>
          </div>
        )}
        {error && (
          <div className="live2d-loading">
            <span className="live2d-loading-text">加载失败</span>
            <button className="live2d-retry-btn" onClick={() => { setLoaded(false); setError(false); }}>
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
