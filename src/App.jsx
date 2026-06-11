import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react'
import Layout from './components/Layout/Layout'
import HomePage from './pages/HomePage'
import OAuthCallback from './pages/OAuthCallback'
import WorldChannel from './components/WorldChannel/WorldChannel'
import Forum from './components/Forum/Forum'
import PostDetail from './components/Forum/PostDetail'
import InfoDetail from './components/Info/InfoDetail'
import UserProfilePage from './components/Profile/UserProfilePage'
import VideoZone from './components/Video/VideoZone'
import VideoDetail from './components/Video/VideoDetail'
import Mailbox from './components/Mailbox/Mailbox'
import Guestbook from './components/Guestbook/Guestbook'
import MusicPlayer from './components/Music/MusicPlayer'
import Amadeus from './components/Amadeus/Amadeus'
import FriendSpace from './components/FriendSpace/FriendSpace'
import Notifications from './components/Notification/Notifications'
import TouchGalApp from './components/TouchGal/TouchGalApp'
import Club from './components/Club/Club'
import Wiki from './components/Wiki/Wiki'
import NewsDetail from './components/NewsZone/NewsDetail'
import AuthModal from './components/Common/AuthModal'
import Live2DWidget from './components/Common/Live2DWidget'
import DockBar from './components/Layout/DockBar'
import AppWindow from './components/Layout/AppWindow'
import { WindowManagerProvider, useWindowManager } from './context/WindowManager'
import { StorageService } from './services/api'

const Live2DPage = lazy(() => import('./components/Common/Live2DViewer'))

const savedTheme = StorageService.get('acg_theme', '');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

const MUSIC_STATE_KEY = 'acg_music_state';

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
  const [musicState, setMusicState] = useState(() => {
    const saved = localStorage.getItem(MUSIC_STATE_KEY);
    if (saved) { try { return JSON.parse(saved); } catch {} }
    return { playing: false, name: '', artist: '', cover: '', volume: 0.7, muted: false };
  });
  const audioRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(MUSIC_STATE_KEY, JSON.stringify(musicState));
  }, [musicState]);

  const handleToggleLive2D = useCallback(() => {
    setLive2dVisible(prev => !prev);
  }, []);

  const handleMusicControl = useCallback((action, value) => {
    switch (action) {
      case 'toggle':
        setMusicState(prev => ({ ...prev, playing: !prev.playing }));
        break;
      case 'prev':
      case 'next':
        break;
      case 'volume':
        setMusicState(prev => ({ ...prev, volume: value, muted: value === 0 }));
        break;
    }
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
          <Route path="/news/:id" element={<NewsDetail />} />
          <Route path="/profile" element={<UserProfilePage />} />
          <Route path="/user/:userId" element={<UserProfilePage />} />
          <Route path="/video" element={<VideoZone />} />
          <Route path="/video/:sourceId/:vodId" element={<VideoDetail />} />
          <Route path="/mailbox" element={<Mailbox />} />
          <Route path="/guestbook" element={<Guestbook />} />
          <Route path="/music" element={<MusicPlayer />} />
          <Route path="/friends" element={<FriendSpace />} />
          <Route path="/navi" element={<Amadeus />} />
          <Route path="/live2d" element={<Suspense fallback={<div style={{padding:40,textAlign:'center',color:'var(--text-quaternary)'}}>雨何时停？</div>}><Live2DPage /></Suspense>} />
        </Route>
      </Routes>
      <AuthModal />
      {live2dVisible && <Live2DWidget />}
      <WindowLayer />
      <DockBar
        live2dVisible={live2dVisible}
        onToggleLive2D={handleToggleLive2D}
        musicState={musicState}
        onMusicControl={handleMusicControl}
      />
    </>
  )
}

function App() {
  return (
    <WindowManagerProvider>
      <AppInner />
    </WindowManagerProvider>
  )
}

export default App
