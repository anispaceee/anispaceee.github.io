import { useState, useRef, useEffect } from 'react';
import { useWindowManager } from '../../context/WindowManager';
import { Gamepad2, RotateCw, ExternalLink, Home, Search, Star, X, Loader2, AlertCircle } from 'lucide-react';
import './TouchGalApp.css';

const BOOKMARKS_KEY = 'acg_touchgal_bookmarks';

export function openTouchGal(url = 'https://www.touchgal.top') {
  const event = new CustomEvent('openTouchGal', { detail: { url } });
  window.dispatchEvent(event);
}

export default function TouchGalApp({ initialUrl = 'https://www.touchgal.top' }) {
  const { closeWindow } = useWindowManager();
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookmarks, setBookmarks] = useState(() => {
    const saved = localStorage.getItem(BOOKMARKS_KEY);
    return saved ? JSON.parse(saved) : [
      { id: '1', title: 'TouchGal首页', url: 'https://www.touchgal.top' },
      { id: '2', title: 'Bangumi', url: 'https://bangumi.tv' },
    ];
  });
  const iframeRef = useRef(null);

  useEffect(() => {
    const handleOpen = (e) => {
      const { url: newUrl } = e.detail || {};
      if (newUrl) {
        setUrl(newUrl);
        setInputUrl(newUrl);
        setLoading(true);
        setError(null);
      }
    };
    window.addEventListener('openTouchGal', handleOpen);
    return () => window.removeEventListener('openTouchGal', handleOpen);
  }, []);

  const handleLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleError = () => {
    setLoading(false);
    setError('无法加载页面，请检查网络连接');
  };

  const navigateTo = (newUrl) => {
    let finalUrl = newUrl;
    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
      finalUrl = 'https://' + newUrl;
    }
    setUrl(finalUrl);
    setInputUrl(finalUrl);
    setLoading(true);
    setError(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      navigateTo(inputUrl);
    }
  };

  const refresh = () => {
    setLoading(true);
    setError(null);
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  };

  const goHome = () => {
    navigateTo('https://www.touchgal.top');
  };

  const openExternal = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const toggleBookmark = () => {
    const exists = bookmarks.find(b => b.url === url);
    if (exists) {
      const updated = bookmarks.filter(b => b.url !== url);
      setBookmarks(updated);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
    } else {
      const newBookmark = { id: Date.now().toString(), title: url, url };
      const updated = [...bookmarks, newBookmark];
      setBookmarks(updated);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
    }
  };

  const isBookmarked = bookmarks.some(b => b.url === url);

  return (
    <div className="touchgal-app">
      <div className="touchgal-toolbar">
        <div className="touchgal-brand">
          <Gamepad2 size={18} />
          <span>TouchGal</span>
        </div>
        <div className="touchgal-url-bar">
          <input
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入网址..."
          />
        </div>
        <div className="touchgal-actions">
          <button className="touchgal-btn" onClick={goHome} title="首页">
            <Home size={16} />
          </button>
          <button className="touchgal-btn" onClick={refresh} title="刷新">
            {loading ? <Loader2 size={16} className="spin" /> : <RotateCw size={16} />}
          </button>
          <button className={`touchgal-btn ${isBookmarked ? 'active' : ''}`} onClick={toggleBookmark} title="收藏">
            <Star size={16} fill={isBookmarked ? 'var(--primary)' : 'none'} />
          </button>
          <button className="touchgal-btn" onClick={openExternal} title="外部打开">
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      <div className="touchgal-bookmarks">
        {bookmarks.map(bm => (
          <button key={bm.id} className="touchgal-bm-btn" onClick={() => navigateTo(bm.url)}>
            {bm.title}
          </button>
        ))}
      </div>

      <div className="touchgal-content">
        {loading && (
          <div className="touchgal-loading">
            <Loader2 size={24} className="spin" />
            <span>雨，何时才能停？</span>
          </div>
        )}
        {error && (
          <div className="touchgal-error">
            <AlertCircle size={32} />
            <p>{error}</p>
            <button onClick={refresh}>重试</button>
            <button onClick={openExternal}>在外部打开</button>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={url}
          className="touchgal-iframe"
          title="TouchGal"
          sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </div>
  );
}
