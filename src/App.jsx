import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { lazy, Suspense, Component, useState, useEffect } from 'react'
import Layout from './components/Layout/Layout'
import HomePage from './pages/HomePage'
import OAuthCallback from './pages/OAuthCallback'
import WorldChannel from './components/WorldChannel/WorldChannel'
import Forum from './components/Forum/Forum'
import PostDetail from './components/Forum/PostDetail'
import InfoDetail from './components/Info/InfoDetail'
import HikarinagiDetail from './components/Info/HikarinagiDetail'
import UserProfilePage from './components/Profile/UserProfilePage'
import VideoPlayer from './components/Video/VideoPlayer'
import Mailbox from './components/Mailbox/Mailbox'
import Guestbook from './components/Guestbook/Guestbook'
import MusicPlayer from './components/Music/MusicPlayer'
import MinimizedBar from './components/Layout/MinimizedBar'
import LoginNotificationBar from './components/Layout/LoginNotificationBar'
import { useMusic, FALLBACK_COVER } from './context/MusicContext'
import { Play, Pause, SkipBack, SkipForward, Music, Brain, Coffee, Globe, Users, Bell, Gamepad2, Send, Link2, Mail } from 'lucide-react'
import Amadeus from './components/Amadeus/Amadeus'
import FriendSpace from './components/FriendSpace/FriendSpace'
import Notifications from './components/Notification/Notifications'
import TouchGalApp from './components/TouchGal/TouchGalApp'
import Club from './components/Club/Club'
import Wiki from './components/Wiki/Wiki'
import FriendLinks from './components/FriendLinks/FriendLinks'
import MusashiHome from './components/Musashi/MusashiHome';
import WorkDetail from './components/Musashi/WorkDetail';
import WorkCreate from './components/Musashi/WorkCreate';
import WorkEdit from './components/Musashi/WorkEdit';
import NovelReader from './components/Musashi/NovelReader';
import MangaReader from './components/Musashi/MangaReader';
import MyWorks from './components/Musashi/MyWorks';
import NewsDetail from './components/NewsZone/NewsDetail'
import NewsZone from './components/NewsZone/NewsZone'
import NewsEditor from './components/NewsZone/NewsEditor'
import AuthModal from './components/Common/AuthModal'
import Live2DWidget from './components/Common/Live2DWidget'
import FireworkEffect from './components/Common/FireworkEffect'
import DockBar from './components/Layout/DockBar'
import AppWindow from './components/Layout/AppWindow'
import { WindowManagerProvider, useWindowManager } from './context/WindowManager'
import { MusicProvider } from './context/MusicContext'
import { StorageService, WorldChannelService, FriendPostService } from './services/api'
import { useApp } from './context/AppContext'
import { initMediaSources } from './services/media/initSources'

// 社交模式守卫：社交功能关闭时显示提示
function SocialGuard({ children }) {
  const { socialMode, toggleSocialMode } = useApp();
  if (socialMode) return children;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, color: 'var(--text-secondary)' }}>
      <MessageCircle size={48} style={{ color: 'var(--text-quaternary)' }} />
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>社交功能已关闭</h2>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 320, textAlign: 'center' }}>
        当前处于安静模式，社交功能已隐藏。你可以在 Dock 设置中重新开启。
      </p>
      <button
        onClick={() => toggleSocialMode(true)}
        style={{ padding: '8px 24px', borderRadius: 20, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        开启社交功能
      </button>
    </div>
  );
}

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
            style={{ padding: '8px 20px', borderRadius: 20, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text-primary)', marginLeft: 12 }}
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

function NavigateToInfoDetail() {
  const { subjectId } = useParams();
  return <Navigate to={`/info/2/${subjectId}`} replace />;
}

const savedTheme = StorageService.get('acg_theme', '');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

function WindowLayer() {
  const { windows } = useWindowManager();
  const { socialMode } = useApp();
  // 社交功能关闭时，这些窗口不渲染
  const socialWindowIds = ['world', 'club', 'friends', 'mailbox'];
  return (
    <>
      {Object.values(windows).map(win => {
        if (!win.open) return null;
        if (!socialMode && socialWindowIds.includes(win.id)) return null;
        return (
          <AppWindow key={win.id} id={win.id}>
            {win.id === 'music' && <MusicPlayer />}
            {win.id === 'friends' && <FriendSpace />}
            {win.id === 'amadeus' && <Amadeus />}
            {win.id === 'world' && <WorldChannel />}
            {win.id === 'notifications' && <Notifications />}
            {win.id === 'touchgal' && <TouchGalApp />}
            {win.id === 'club' && <Club />}
            {win.id === 'links' && <FriendLinks />}
            {win.id === 'mailbox' && <Mailbox />}
          </AppWindow>
        );
      })}
    </>
  );
}

// 各APP的lucide图标映射
const APP_ICONS = {
  music: Music,
  friends: Users,
  amadeus: Brain,
  world: Globe,
  notifications: Bell,
  touchgal: Gamepad2,
  club: Coffee,
  links: Link2,
  mailbox: Mail,
};

// 音乐未播放时的歌单选择小组件
function MusicPlaylistWidget() {
  const { savedPlaylists, loadSavedPlaylist, playSong } = useMusic();
  const [expanded, setExpanded] = useState(false);

  if (savedPlaylists.length === 0) {
    return <span className="minimized-bar-title">暂无歌单</span>;
  }

  if (!expanded) {
    return (
      <span className="minimized-bar-title minimized-bar-clickable" onClick={e => { e.stopPropagation(); setExpanded(true); }}>
        选择歌单 ▾
      </span>
    );
  }

  return (
    <div className="minimized-bar-playlist" onClick={e => e.stopPropagation()}>
      {savedPlaylists.slice(0, 3).map(pl => (
        <button
          key={pl.id}
          className="minimized-bar-playlist-item"
          onClick={() => {
            loadSavedPlaylist(pl);
            if (pl.songs?.length > 0) playSong(pl.songs[0]);
            setExpanded(false);
          }}
        >
          {pl.name}
        </button>
      ))}
    </div>
  );
}

// Tea Time! 最小化小组件
function ClubMinimizedWidget() {
  const [latestMsg, setLatestMsg] = useState(null);
  useEffect(() => {
    const clubs = StorageService.get('acg_clubs', []);
    if (clubs.length > 0) {
      const allMsgs = clubs.flatMap(c => (c.messages || []).filter(m => m.type !== 'system'));
      allMsgs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (allMsgs.length > 0) setLatestMsg(allMsgs[0]);
    }
  }, []);
  if (!latestMsg) return <span className="minimized-bar-title">Tea Time！</span>;
  return (
    <div className="minimized-bar-info">
      <span className="minimized-bar-name">{latestMsg.content}</span>
      <span className="minimized-bar-artist">{latestMsg.userId || '系统'}</span>
    </div>
  );
}

// Navi 最小化小组件：发送框
function NaviMinimizedWidget() {
  const { openWindow } = useWindowManager();
  const [input, setInput] = useState('');
  const handleSend = (e) => {
    e.stopPropagation();
    if (!input.trim()) return;
    // 将消息存入sessionStorage，Navi打开时读取
    sessionStorage.setItem('navi_pending_msg', input.trim());
    openWindow('amadeus');
    setInput('');
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSend(e);
    e.stopPropagation();
  };
  return (
    <div className="minimized-bar-navi" onClick={e => e.stopPropagation()}>
      <input
        className="minimized-bar-input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="问 Navi..."
      />
      <button className="minimized-bar-btn minimized-bar-btn-send" onClick={handleSend}>
        <Send size={14} />
      </button>
    </div>
  );
}

// 世界线最小化小组件
function WorldMinimizedWidget() {
  const [latestPost, setLatestPost] = useState(null);
  useEffect(() => {
    WorldChannelService.getMessages(1, 1).then(data => {
      const msgs = data.messages || [];
      if (msgs.length > 0) setLatestPost(msgs[0]);
    }).catch(() => {});
  }, []);
  if (!latestPost) return <span className="minimized-bar-title">世界线</span>;
  return (
    <div className="minimized-bar-info">
      <span className="minimized-bar-name">{latestPost.author_name || '匿名'}</span>
      <span className="minimized-bar-artist">{latestPost.content?.slice(0, 30) || ''}</span>
    </div>
  );
}

// D-Mail 最小化小组件：显示未读数和最新邮件
function MailboxMinimizedWidget() {
  const { mailUnreadCount } = useApp();
  const [latestMail, setLatestMail] = useState(null);
  useEffect(() => {
    const mails = StorageService.get('acg_mails', []);
    const inbox = mails.filter(m => m.folder === 'inbox' || !m.folder);
    if (inbox.length > 0) {
      inbox.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setLatestMail(inbox[0]);
    }
  }, []);
  return (
    <div className="minimized-bar-info">
      <span className="minimized-bar-name">
        {mailUnreadCount > 0 ? `${mailUnreadCount} 封未读` : 'D-Mail'}
      </span>
      <span className="minimized-bar-artist">
        {latestMail ? (latestMail.subject || latestMail.from?.name || '').slice(0, 25) : '暂无新邮件'}
      </span>
    </div>
  );
}

// LeMU 最小化小组件
function LeMUMinimizedWidget() {
  const { currentUser, isAuthenticated } = useApp();
  const [latestPost, setLatestPost] = useState(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    FriendPostService.getFeed(1, 1).then(data => {
      const posts = data.posts || [];
      if (posts.length > 0) setLatestPost(posts[0]);
    }).catch(() => {});
  }, [isAuthenticated]);
  if (!latestPost) return <span className="minimized-bar-title">LeMU</span>;
  return (
    <div className="minimized-bar-info">
      <span className="minimized-bar-name">{latestPost.author_name || '好友'}</span>
      <span className="minimized-bar-artist">{latestPost.content?.slice(0, 30) || ''}</span>
    </div>
  );
}

function MinimizedBars() {
  const { windows, openWindow } = useWindowManager();
  const { currentSong, playing, togglePlay, playNext, playPrev, savedPlaylists, loadSavedPlaylist, playSong } = useMusic();
  const { socialMode } = useApp();

  // 社交功能关闭时，过滤社交窗口
  const socialWindowIds = ['world', 'club', 'friends', 'mailbox'];

  // 音乐横条：窗口最小化时显示（无论是否播放）
  const musicVisible = windows.music?.open && windows.music?.minimized;
  // 其他APP：仅最小化时显示（社交模式关闭时过滤社交窗口）
  const otherMinimized = Object.values(windows).filter(w => w.open && w.minimized && w.id !== 'music' && (socialMode || !socialWindowIds.includes(w.id)));
  // 音乐窗口未打开但有歌曲在播放时也显示
  const musicPlayingNoWindow = currentSong && !windows.music?.open;

  // 构建横条列表，音乐在最底部
  const bars = [];
  if (musicVisible || musicPlayingNoWindow) {
    bars.push({ id: 'music' });
  }
  otherMinimized.forEach(w => {
    bars.push({ id: w.id });
  });

  if (bars.length === 0) return null;

  const renderBarContent = (barId, bottom) => {
    const IconComp = APP_ICONS[barId];

    switch (barId) {
      case 'music':
        if (currentSong) {
          return (
            <MinimizedBar key="music" id="music" icon={<Music size={18} />} title="音乐" bottom={bottom}>
              <img
                src={currentSong.albumCover || FALLBACK_COVER}
                alt=""
                className="minimized-bar-cover"
                loading="lazy"
                onError={e => { e.target.src = FALLBACK_COVER; }}
              />
              <div className="minimized-bar-info">
                <span className="minimized-bar-name">{currentSong.name}</span>
                <span className="minimized-bar-artist">{currentSong.artists}</span>
              </div>
              <div className="minimized-bar-controls">
                <button className="minimized-bar-btn" onClick={playPrev} title="上一首">
                  <SkipBack size={14} />
                </button>
                <button className="minimized-bar-btn minimized-bar-btn-play" onClick={togglePlay} title={playing ? '暂停' : '播放'}>
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button className="minimized-bar-btn" onClick={playNext} title="下一首">
                  <SkipForward size={14} />
                </button>
              </div>
            </MinimizedBar>
          );
        }
        // 未播放时显示歌单选择
        return (
          <MinimizedBar key="music" id="music" icon={<Music size={18} />} title="音乐" bottom={bottom}>
            <MusicPlaylistWidget />
          </MinimizedBar>
        );

      case 'club':
        return (
          <MinimizedBar key="club" id="club" icon={<Coffee size={18} />} title="Tea Time！" bottom={bottom}>
            <ClubMinimizedWidget />
          </MinimizedBar>
        );

      case 'amadeus':
        return (
          <MinimizedBar key="amadeus" id="amadeus" icon={<Brain size={18} />} title="Navi" bottom={bottom}>
            <NaviMinimizedWidget />
          </MinimizedBar>
        );

      case 'world':
        return (
          <MinimizedBar key="world" id="world" icon={<Globe size={18} />} title="世界线" bottom={bottom}>
            <WorldMinimizedWidget />
          </MinimizedBar>
        );

      case 'friends':
        return (
          <MinimizedBar key="friends" id="friends" icon={<Users size={18} />} title="LeMU" bottom={bottom}>
            <LeMUMinimizedWidget />
          </MinimizedBar>
        );

      case 'mailbox':
        return (
          <MinimizedBar key="mailbox" id="mailbox" icon={<Mail size={18} />} title="D-Mail" bottom={bottom}>
            <MailboxMinimizedWidget />
          </MinimizedBar>
        );

      default: {
        const DefaultIcon = IconComp || Bell;
        return (
          <MinimizedBar key={barId} id={barId} icon={<DefaultIcon size={18} />} title={barId} bottom={bottom} />
        );
      }
    }
  };

  return (
    <>
      {bars.map((bar, index) => {
        const bottom = 80 + index * 56;
        return renderBarContent(bar.id, bottom);
      })}
    </>
  );
}

function AppInner() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/bangumi" element={<OAuthCallback />} />
          <Route path="/auth/github" element={<OAuthCallback />} />
          <Route path="/world" element={<SocialGuard><WorldChannel /></SocialGuard>} />
          <Route path="/forum" element={<SocialGuard><Forum /></SocialGuard>} />
          <Route path="/forum/post/:id" element={<SocialGuard><PostDetail /></SocialGuard>} />
          <Route path="/info/hikarinagi/:type/:id" element={<HikarinagiDetail />} />
          <Route path="/info/:type/:id" element={<InfoDetail />} />
          <Route path="/wiki" element={<Wiki />} />
          <Route path="/links" element={<Navigate to="/" replace />} />
          <Route path="/musashi/new" element={<WorkCreate />} />
          <Route path="/musashi/:workId/edit" element={<WorkEdit />} />
          <Route path="/musashi/:workId/read" element={<NovelReader />} />
          <Route path="/musashi/:workId/read/:chapter" element={<NovelReader />} />
          <Route path="/musashi/:workId/comic" element={<MangaReader />} />
          <Route path="/musashi/:workId/comic/:chapter" element={<MangaReader />} />
          <Route path="/musashi/my-works" element={<MyWorks />} />
          <Route path="/musashi/:workId" element={<WorkDetail />} />
          <Route path="/musashi" element={<MusashiHome />} />
          <Route path="/news" element={<NewsZone />} />
          <Route path="/news/editor" element={<NewsEditor />} />
          <Route path="/news/:id" element={<NewsDetail />} />
          <Route path="/profile" element={<UserProfilePage />} />
          <Route path="/user/:userId" element={<UserProfilePage />} />
          <Route path="/video/play/:subjectId/:episodeId" element={<VideoPlayerErrorBoundary><VideoPlayer /></VideoPlayerErrorBoundary>} />
          <Route path="/video/subject/:subjectId" element={<NavigateToInfoDetail />} />
          <Route path="/guestbook" element={<SocialGuard><Guestbook /></SocialGuard>} />
          <Route path="/music" element={<MusicPlayer />} />
          <Route path="/friends" element={<SocialGuard><FriendSpace /></SocialGuard>} />
          <Route path="/navi" element={<Amadeus />} />
          <Route path="/live2d" element={<Suspense fallback={<div style={{padding:40,textAlign:'center',color:'var(--text-quaternary)'}}>雨何时停？</div>}><Live2DPage /></Suspense>} />
        </Route>
      </Routes>
      <AuthModal />
      <FireworkEffect />
      <Live2DWidget />
      <WindowLayer />
      <MinimizedBars />
      <LoginNotificationBar />
      <DockBar />
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
