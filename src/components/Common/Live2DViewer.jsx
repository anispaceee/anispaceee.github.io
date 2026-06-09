import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Application } from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';
import { X, ChevronDown, Smile, Play, RotateCw, Maximize2, Minimize2, MousePointer, Keyboard, Sparkles, AlertCircle, Image } from 'lucide-react';
import './Live2DViewer.css';

const CUBISM4_CDN = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';

const MODEL_REGISTRY = {
  haru_greeter: {
    id: 'haru_greeter',
    name: 'Haru',
    description: 'Cubism 4 示例模型 - 问候姿态',
    url: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json',
    version: 4,
    fallbackImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="400" fill="%23fef2f6"%3E%3Crect width="300" height="400" rx="12"/%3E%3Ctext x="150" y="190" text-anchor="middle" fill="%23e886a2" font-size="40"%3E🌸%3C/text%3E%3Ctext x="150" y="230" text-anchor="middle" fill="%23d4b8c0" font-size="14"%3EHaru%3C/text%3E%3C/svg%3E',
    expectedWidth: 470,
    expectedHeight: 710,
  },
  shizuku: {
    id: 'shizuku',
    name: '猫羽雫',
    description: 'Cubism 2 经典模型',
    url: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model.json',
    version: 2,
    fallbackImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="400" fill="%23f0f7ff"%3E%3Crect width="300" height="400" rx="12"/%3E%3Ctext x="150" y="190" text-anchor="middle" fill="%237eb8da" font-size="40"%3E🐱%3C/text%3E%3Ctext x="150" y="230" text-anchor="middle" fill="%23a0c4e0" font-size="14"%3E猫羽雫%3C/text%3E%3C/svg%3E',
    expectedWidth: 350,
    expectedHeight: 650,
  },
  hiyori: {
    id: 'hiyori',
    name: '日向',
    description: 'Cubism 4 官方模型',
    url: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/hiyori/hiyori_pro_t10.model3.json',
    version: 4,
    fallbackImage: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="400" fill="%23f0fff0"%3E%3Crect width="300" height="400" rx="12"/%3E%3Ctext x="150" y="190" text-anchor="middle" fill="%2368d391" font-size="40"%3E☀️%3C/text%3E%3Ctext x="150" y="230" text-anchor="middle" fill="%239ae6b4" font-size="14"%3E日向%3C/text%3E%3C/svg%3E',
    expectedWidth: 450,
    expectedHeight: 870,
  },
};

const MODEL_LIST = Object.values(MODEL_REGISTRY);

function validateModelMapping(modelId, loadedModel) {
  if (!loadedModel) return { valid: false, reason: '模型对象为空' };
  const registry = MODEL_REGISTRY[modelId];
  if (!registry) return { valid: false, reason: `未找到ID为 ${modelId} 的注册信息` };
  if (!loadedModel.width || !loadedModel.height) return { valid: false, reason: '模型尺寸信息缺失' };
  return { valid: true, registry };
}

let cubismCoreLoaded = false;
let cubismCoreLoading = null;

function loadCubismCore() {
  if (cubismCoreLoaded) return Promise.resolve();
  if (cubismCoreLoading) return cubismCoreLoading;
  cubismCoreLoading = new Promise((resolve, reject) => {
    if (window.Live2DCubismCore) { cubismCoreLoaded = true; resolve(); return; }
    const script = document.createElement('script');
    script.src = CUBISM4_CDN;
    script.onload = () => { cubismCoreLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Cubism Core 加载失败'));
    document.head.appendChild(script);
  });
  return cubismCoreLoading;
}

const Live2DViewer = forwardRef(function Live2DViewer({ modelId, width = 500, height = 600, autoInteract = true, onModelLoad, onModelError }, ref) {
  const canvasRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [validationResult, setValidationResult] = useState(null);

  const modelConfig = MODEL_REGISTRY[modelId] || MODEL_LIST[0];

  useImperativeHandle(ref, () => ({
    getModel: () => modelRef.current,
    expression: (name) => modelRef.current?.expression(name),
    motion: (group, index, priority) => modelRef.current?.motion(group, index, priority),
    focus: (x, y) => modelRef.current?.focus(x, y),
    tap: (x, y) => modelRef.current?.tap(x, y),
  }));

  useEffect(() => {
    let destroyed = false;

    const init = async () => {
      try {
        setLoadingProgress(10);
        await loadCubismCore();
        if (destroyed) return;
        setLoadingProgress(30);

        const app = new Application({
          view: canvasRef.current,
          width,
          height,
          backgroundAlpha: 0,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
        appRef.current = app;
        setLoadingProgress(50);

        const model = await Live2DModel.from(modelConfig.url, { autoInteract });
        if (destroyed) { model.destroy(); app.destroy(true); return; }
        setLoadingProgress(80);

        const validation = validateModelMapping(modelId, model);
        setValidationResult(validation);
        if (!validation.valid) {
          console.warn(`[Live2D] 模型验证警告: ${validation.reason}`);
        }

        const padding = 0.85;
        const scaleX = (width / model.width) * padding;
        const scaleY = (height / model.height) * padding;
        const scale = Math.min(scaleX, scaleY);
        model.scale.set(scale);
        model.anchor.set(0.5, 0.5);
        model.x = width / 2;
        model.y = height / 2;

        model.on('hit', (hitAreas) => {
          if (hitAreas.includes('Head')) {
            const expressions = model.expressions;
            if (expressions && expressions.length > 0) {
              const randomExp = expressions[Math.floor(Math.random() * expressions.length)];
              model.expression(randomExp.name || randomExp);
              setTimeout(() => model.expression(), 3000);
            }
          }
          if (hitAreas.includes('Body')) {
            const motionGroups = Object.keys(model.motions || {});
            const tapMotions = motionGroups.filter(g => g.toLowerCase().includes('tap') || g.toLowerCase().includes('body'));
            if (tapMotions.length > 0) model.motion(tapMotions[Math.floor(Math.random() * tapMotions.length)]);
          }
        });

        app.stage.addChild(model);
        modelRef.current = model;
        setLoadingProgress(100);
        setLoaded(true);
        if (onModelLoad) onModelLoad(model);
      } catch (err) {
        console.error('[Live2D] 初始化失败');
        if (!destroyed) {
          setError(err.message || '模型加载失败');
          if (onModelError) onModelError(err);
        }
      }
    };

    init();

    return () => {
      destroyed = true;
      modelRef.current = null;
      if (appRef.current) {
        try { appRef.current.destroy(true); } catch {}
        appRef.current = null;
      }
    };
  }, [modelId, width, height, autoInteract, onModelLoad, onModelError, modelConfig.url]);

  return (
    <div className="live2d-viewer-canvas-wrap" style={{ width, height }}>
      <canvas ref={canvasRef} style={{ width, height }} />
      {!loaded && !error && (
        <div className="live2d-viewer-loading">
          <div className="live2d-viewer-loading-icon"><Sparkles size={24} /></div>
          <div className="live2d-viewer-loading-bar">
            <div className="live2d-viewer-loading-fill" style={{ width: `${loadingProgress}%` }} />
          </div>
          <span className="live2d-viewer-loading-text">
            {loadingProgress < 30 ? '加载核心引擎...' : loadingProgress < 80 ? `加载 ${modelConfig.name}...` : '初始化渲染...'}
          </span>
        </div>
      )}
      {error && (
        <div className="live2d-viewer-error">
          <img src={modelConfig.fallbackImage} alt={modelConfig.name} className="live2d-viewer-fallback" loading="lazy" />
          <div className="live2d-viewer-error-info">
            <AlertCircle size={16} />
            <span>模型加载失败</span>
            <button className="live2d-viewer-retry" onClick={() => { setError(null); setLoaded(false); setLoadingProgress(0); }}>
              <RotateCw size={14} /> 重试
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default function Live2DPage() {
  const viewerRef = useRef(null);
  const [currentModelId, setCurrentModelId] = useState('haru_greeter');
  const [showPanel, setShowPanel] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);
  const [mouseTracking, setMouseTracking] = useState(true);
  const [showExpressions, setShowExpressions] = useState(false);
  const [showMotions, setShowMotions] = useState(false);

  const handleModelLoad = useCallback((model) => {
    setModelInfo({
      expressions: model.expressions || [],
      motions: model.motions || {},
      width: model.width,
      height: model.height,
    });
  }, []);

  const switchModel = (id) => {
    setModelInfo(null);
    setShowExpressions(false);
    setShowMotions(false);
    setCurrentModelId(id);
  };

  const triggerExpression = (name) => {
    if (viewerRef.current) {
      viewerRef.current.expression(name);
      setTimeout(() => viewerRef.current?.expression(), 3000);
    }
  };

  const triggerMotion = (group, index = 0) => {
    if (viewerRef.current) viewerRef.current.motion(group, index, 3);
  };

  const resetExpression = () => {
    if (viewerRef.current) viewerRef.current.expression();
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!viewerRef.current) return;
      switch (e.key) {
        case '1': case '2': case '3': case '4': case '5':
          const expIdx = parseInt(e.key) - 1;
          if (modelInfo?.expressions?.[expIdx]) triggerExpression(modelInfo.expressions[expIdx].name || modelInfo.expressions[expIdx]);
          break;
        case 'r': case 'R': resetExpression(); break;
        case ' ':
          e.preventDefault();
          const motionGroups = Object.keys(modelInfo?.motions || {});
          if (motionGroups.length > 0) triggerMotion(motionGroups[Math.floor(Math.random() * motionGroups.length)]);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modelInfo]);

  const currentModel = MODEL_REGISTRY[currentModelId];
  const viewerWidth = isFullscreen ? window.innerWidth - 320 : 500;
  const viewerHeight = isFullscreen ? window.innerHeight - 80 : 600;

  return (
    <div className={`live2d-page ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="live2d-page-header">
        <div className="live2d-page-title">
          <Sparkles size={20} />
          <h1>Live2D 展示</h1>
          <span className="live2d-model-badge">Cubism {currentModel.version}</span>
          {currentModel && <span className="live2d-model-name-badge">{currentModel.name}</span>}
        </div>
        <div className="live2d-page-actions">
          <button className="live2d-action-btn" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? '退出全屏' : '全屏'}>
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div className="live2d-page-body">
        <div className="live2d-viewer-section">
          <Live2DViewer
            ref={viewerRef}
            modelId={currentModelId}
            width={viewerWidth}
            height={viewerHeight}
            autoInteract={mouseTracking}
            onModelLoad={handleModelLoad}
          />
          <div className="live2d-viewer-hints">
            <span><MousePointer size={12} /> 鼠标移动：头部跟随</span>
            <span>点击模型：触发动作/表情</span>
            <span><Keyboard size={12} /> 1-5：切换表情 · 空格：随机动作 · R：重置</span>
          </div>
        </div>

        <div className="live2d-control-panel">
          <div className="live2d-panel-section">
            <h3 className="live2d-panel-title" onClick={() => setShowPanel(!showPanel)}>
              模型选择 <ChevronDown size={14} className={showPanel ? 'rotated' : ''} />
            </h3>
            {showPanel && (
              <div className="live2d-model-list">
                {MODEL_LIST.map(m => (
                  <button key={m.id} className={`live2d-model-item ${currentModelId === m.id ? 'active' : ''}`} onClick={() => switchModel(m.id)}>
                    <span className="live2d-model-name">{m.name}</span>
                    <span className="live2d-model-desc">{m.description}</span>
                    <span className="live2d-model-ver">Cubism {m.version}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="live2d-panel-section">
            <h3 className="live2d-panel-title" onClick={() => setMouseTracking(!mouseTracking)}>
              <MousePointer size={14} /> 鼠标追踪 {mouseTracking ? 'ON' : 'OFF'}
            </h3>
          </div>

          {modelInfo && modelInfo.expressions.length > 0 && (
            <div className="live2d-panel-section">
              <h3 className="live2d-panel-title" onClick={() => setShowExpressions(!showExpressions)}>
                <Smile size={14} /> 表情切换 ({modelInfo.expressions.length}) <ChevronDown size={14} className={showExpressions ? 'rotated' : ''} />
              </h3>
              {showExpressions && (
                <div className="live2d-expression-list">
                  {modelInfo.expressions.map((exp, i) => (
                    <button key={i} className="live2d-expr-btn" onClick={() => triggerExpression(exp.name || exp)}>
                      {exp.name || exp}
                    </button>
                  ))}
                  <button className="live2d-expr-btn reset" onClick={resetExpression}>默认</button>
                </div>
              )}
            </div>
          )}

          {modelInfo && Object.keys(modelInfo.motions).length > 0 && (
            <div className="live2d-panel-section">
              <h3 className="live2d-panel-title" onClick={() => setShowMotions(!showMotions)}>
                <Play size={14} /> 动作播放 ({Object.keys(modelInfo.motions).length}组) <ChevronDown size={14} className={showMotions ? 'rotated' : ''} />
              </h3>
              {showMotions && (
                <div className="live2d-motion-list">
                  {Object.entries(modelInfo.motions).map(([group, motions]) => (
                    <div key={group} className="live2d-motion-group">
                      <span className="live2d-motion-group-name">{group}</span>
                      <div className="live2d-motion-items">
                        {Array.isArray(motions) && motions.map((_, i) => (
                          <button key={i} className="live2d-motion-btn" onClick={() => triggerMotion(group, i)}>
                            #{i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {modelInfo && (
            <div className="live2d-panel-section">
              <h3 className="live2d-panel-title">模型信息</h3>
              <div className="live2d-model-info">
                <span>名称：{currentModel.name}</span>
                <span>Cubism 版本：{currentModel.version}</span>
                <span>表情数：{modelInfo.expressions.length}</span>
                <span>动作组：{Object.keys(modelInfo.motions).length}</span>
                <span>原始尺寸：{Math.round(modelInfo.width)}×{Math.round(modelInfo.height)}</span>
                <span>注册ID：{currentModel.id}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { Live2DViewer, MODEL_REGISTRY, MODEL_LIST, loadCubismCore, validateModelMapping };
