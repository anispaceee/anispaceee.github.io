import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect, useCallback, Component } from 'react'
import Layout from './components/Layout/Layout'
import HomePage from './pages/HomePage'
import OAuthCallback from './pages/OAuthCallback'
import WorldChannel from './components/WorldChannel/WorldChannel'
import Forum from './components/Forum/Forum'
import PostDetail from './components/Forum/PostDetail'
import InfoDetail from './components/Info/InfoDetail'
import UserProfilePage from './components/Profile/UserProfilePage'
import VideoHome from './components/Video/VideoHome'
import SubjectDetail from './components/Video/SubjectDetail'
import VideoPlayer from './components/Video/VideoPlayer'
import SourceManager from './components/Video/SourceManager'
import Mailbox from './components/Mailbox/Mailbox'
import Guestbook from './components/Guestbook/Guestbook'
import MusicPlayer from './components/Music/MusicPlayer'
import MiniPlayer from './components/Music/MiniPlayer'
import Amadeus from './components/Amadeus/Amadeus'
import FriendSpace from './components/FriendSpace/FriendSpace'
import Notifications from './components/Notification/Notifications'
import TouchGalApp from './components/TouchGal/TouchGalApp'
import Club from './components/Club/Club'
import Wiki from './components/Wiki/Wiki'
import FriendLinks from './components/FriendLinks/FriendLinks'
import NewsDetail from './components/NewsZone/NewsDetail'
import AuthModal from './components/Common/AuthModal'
import Live2DWidget from './components/Common/Live2DWidget'
import FireworkEffect from './components/Common/FireworkEffect'
import DockBar from './components/Layout/DockBar'
import AppWindow from './components/Layout/AppWindow'
import { WindowManagerProvider, useWindowManager } from './context/WindowManager'
import { MusicProvider } from './context/MusicContext'
import { StorageService } from './services/api'
import { initMediaSources } from './services/media/initSources'

// Error Boundary to prevent white screen when a component crashes
class VideoPlayerErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[VideoPlayerErrorBoundary] Component crashed:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <h2>播放器加载失败</h2>
          <p style={{ color: 'var(--text-quaternary)', fontSize: 13, margin: '12px 0' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.history.back(); }}
            style={{ padding: '8px 20px', borderRadius: 20, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            返回
          </button>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '8px 20px', borderRadius: 20, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text-primary)', marginLeft: 8 }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Initialize media sources on app load (wrapped in try-catch to prevent app crash)
try {
  initMediaSources()
} catch (err) {
  console.error('[App] initMediaSources failed:', err);
}

const Live2DPage = lazy(() => import('./components/Common/Live2DViewer'))

const savedTheme = StorageService.get('acg_theme', '');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

function WindowLayer() {
  const { windows } = useWindowManager();
  return (
    <>
      {Object.values(windows).map(win => {
        if (!win.open) return null;
        return (
          <AppWindow key={win.id} id={win.id}>
            {win.id === 'music' && <MusicPlayer />}
            {win.id === 'friends' && <FriendSpace />}
            {win.id === 'amadeus' && <Amadeus />}
            {win.id === 'world' && <WorldChannel />}
            {win.id === 'notifications' && <Notifications />}
            {win.id === 'touchgal' && <TouchGalApp />}
          </AppWindow>
        );
      })}
    </>
  );
}

function AppInner() {
  const [live2dVisible, setLive2dVisible] = useState(true);
  const { windows } = useWindowManager();

  const handleToggleLive2D = useCallback(() => {
    setLive2dVisible(prev => !prev);
  }, []);

  const anyWindowOpen = Object.values(windows).some(w => w.open && !w.minimized);

  useEffect(() => {
    if (anyWindowOpen) setLive2dVisible(false);
    else setLive2dVisible(true);
  }, [anyWindowOpen]);

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/bangumi" element={<OAuthCallback />} />
          <Route path="/auth/github" element={<OAuthCallback />} />
          <Route path="/world" element={<WorldChannel />} />
          <Route path="/forum" element={<Forum />} />
          <Route path="/forum/post/:id" element={<PostDetail />} />
          <Route path="/info/:type/:id" element={<InfoDetail />} />
          <Route path="/club" element={<Club />} />
          <Route path="/wiki" element={<Wiki />} />
          <Route path="/links" element={<FriendLinks />} />
          <Route path="/news/:id" element={<NewsDetail />} />
          <Route path="/profile" element={<UserProfilePage />} />
          <Route path="/user/:userId" element={<UserProfilePage />} />
          <Route path="/video" element={<VideoHome />} />
          <Route path="/video/subject/:subjectId" element={<SubjectDetail />} />
          <Route path="/video/play/:subjectId/:episodeId" element={<VideoPlayerErrorBoundary><VideoPlayer /></VideoPlayerErrorBoundary>} />
          <Route path="/video/sources" element={<SourceManager />} />
          <Route path="/mailbox" element={<Mailbox />} />
          <Route path="/guestbook" element={<Guestbook />} />
          <Route path="/music" element={<MusicPlayer />} />
          <Route path="/friends" element={<FriendSpace />} />
          <Route path="/navi" element={<Amadeus />} />
          <Route path="/live2d" element={<Suspense fallback={<div style={{padding:40,textAlign:'center',color:'var(--text-quaternary)'}}>雨何时停？</div>}><Live2DPage /></Suspense>} />
        </Route>
      </Routes>
      <AuthModal />
      <FireworkEffect />
      {live2dVisible && <Live2DWidget />}
      <WindowLayer />
      <MiniPlayer />
      <DockBar
        live2dVisible={live2dVisible}
        onToggleLive2D={handleToggleLive2D}
      />
    </>
  )
}

function App() {
  return (
    <WindowManagerProvider>
      <MusicProvider>
        <AppInner />
      </MusicProvider>
    </WindowManagerProvider>
  )
}

export default App
