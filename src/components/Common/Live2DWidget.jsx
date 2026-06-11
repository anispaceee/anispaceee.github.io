import { useState, useEffect } from 'react';
import { X, Minus } from 'lucide-react';
import './Live2DWidget.css';

const LIVE2D_CORE_JS = 'https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/live2d.min.js';
const CDN_PATH = 'https://fastly.jsdelivr.net/gh/fghrsh/live2d_api/';

const MODEL_LIST = [
  { id: 0, name: '猫羽雫', model: 'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/shizuku/model.json' },
  { id: 1, name: '和泉纱雾', model: 'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/sagiri/model.json' },
  { id: 2, name: '蕾姆', model: 'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/rem/model.json' },
  { id: 3, name: '黑猫', model: 'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/blackcat/model.json' },
  { id: 4, name: '白猫', model: 'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/whitecat/model.json' },
  { id: 5, name: '初音未来', model: 'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/kurumi/model.json' },
  { id: 6, name: '小早川', model: 'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/koharu/model.json' },
  { id: 7, name: '初濑', model: 'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/hijiki/model.json' },
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
      const check = setInterval(() => {
        if (coreLoaded && window.loadlive2d) { clearInterval(check); resolve(); }
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

export default function Live2DWidget() {
  const [visible, setVisible] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [currentModel, setCurrentModel] = useState(0);
  const [showSwitcher, setShowSwitcher] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!visible || minimized || isMobile) return;

    let cancelled = false;

    const loadModel = async () => {
      try {
        await loadCoreScript();
        if (cancelled) return;

        if (window.loadlive2d) {
          const canvas = document.getElementById('live2d-canvas');
          if (canvas) {
            window.loadlive2d('live2d-canvas', MODEL_LIST[currentModel].model);
            setLoaded(true);
            setError(false);
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

    const timer = setTimeout(loadModel, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [visible, minimized, isMobile, currentModel]);

  const switchModel = (index) => {
    setCurrentModel(index);
    setLoaded(false);
    setError(false);
    setShowSwitcher(false);
  };

  if (!visible || isMobile) return null;

  if (minimized) {
    return (
      <button className="live2d-restore-btn" onClick={() => setMinimized(false)} title="显示看板娘">
        (◕‿◕)
      </button>
    );
  }

  return (
    <div className="live2d-widget">
      <div className="live2d-controls">
        <button className="live2d-ctrl-btn" onClick={() => setShowSwitcher(!showSwitcher)} title="切换模型">
          🔄
        </button>
        <button className="live2d-ctrl-btn" onClick={() => setMinimized(true)} title="最小化">
          <Minus size={12} />
        </button>
        <button className="live2d-ctrl-btn" onClick={() => setVisible(false)} title="隐藏">
          <X size={12} />
        </button>
      </div>

      {showSwitcher && (
        <div className="live2d-switcher">
          {MODEL_LIST.map((m, i) => (
            <button
              key={m.id}
              className={`live2d-switch-btn ${currentModel === i ? 'active' : ''}`}
              onClick={() => switchModel(i)}
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
          width="280"
          height="350"
        />
        {!loaded && !error && (
          <div className="live2d-loading">
            <span className="live2d-loading-text">看板娘加载中…雨何时停？</span>
          </div>
        )}
        {error && (
          <div className="live2d-loading">
            <span className="live2d-loading-text">加载失败</span>
            <button className="live2d-retry-btn" onClick={() => { setLoaded(false); setError(false); setCurrentModel(prev => prev); }}>
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
