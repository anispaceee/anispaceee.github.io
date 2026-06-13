import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, X, ChevronDown, Loader2 } from 'lucide-react';
import { MusashiService } from '../../services/musashiApi';
import ReaderSettings, { loadReaderSettings } from './ReaderSettings';
import './MangaReader.css';

export default function MangaReader() {
  const { workId, chapter: chapterParam } = useParams();
  const navigate = useNavigate();

  // ─── State ───
  const [work, setWork] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showChapterSelect, setShowChapterSelect] = useState(false);
  const [settings, setSettings] = useState(() => loadReaderSettings());

  const scrollRef = useRef(null);
  const saveTimerRef = useRef(null);

  // ─── Enter / Exit reader mode ───
  useEffect(() => {
    document.body.classList.add('reader-mode');
    return () => {
      document.body.classList.remove('reader-mode');
    };
  }, []);

  // ─── Load work details & chapters ───
  useEffect(() => {
    let cancelled = false;
    async function loadWork() {
      setLoading(true);
      setError('');
      try {
        const workData = await MusashiService.getWork(workId);
        if (cancelled) return;
        setWork(workData);

        const chaptersData = await MusashiService.getMangaChapters(workId);
        if (cancelled) return;
        const list = Array.isArray(chaptersData) ? chaptersData : (chaptersData.chapters || chaptersData.data || []);
        setChapters(list);

        // Determine initial chapter
        if (chapterParam) {
          const found = list.find((c) => String(c.id || c._id) === String(chapterParam));
          if (found) {
            setCurrentChapter(found);
          } else if (list.length > 0) {
            setCurrentChapter(list[0]);
          }
        } else {
          // Try to restore progress
          try {
            const progress = await MusashiService.getProgress(workId);
            if (!cancelled && progress) {
              // 优先用 chapter_id，其次用 chapter_number
              const progressKey = progress.chapter_id || progress.chapter_number;
              if (progressKey) {
                const found = list.find((c) =>
                  String(c.id || c._id) === String(progressKey) ||
                  String(c.chapter_number) === String(progressKey)
                );
                if (found) {
                  setCurrentChapter(found);
                  if (progress.scroll_position) {
                    setTimeout(() => {
                      if (scrollRef.current) {
                        scrollRef.current.scrollTop = progress.scroll_position;
                      }
                    }, 200);
                  }
                  return;
                }
              }
            }
          } catch { /* no progress, fall through */ }
          if (list.length > 0) {
            setCurrentChapter(list[0]);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadWork();
    return () => { cancelled = true; };
  }, [workId, chapterParam]);

  // ─── Load chapter pages ───
  useEffect(() => {
    if (!currentChapter) return;
    let cancelled = false;
    async function loadPages() {
      try {
        const data = await MusashiService.getChapter(workId, currentChapter.id || currentChapter._id);
        if (!cancelled) {
          const pageList = Array.isArray(data?.pages) ? data.pages
            : Array.isArray(data) ? data
            : [];
          setPages(pageList);
          // Scroll to top on chapter change
          if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || '画数加载失败');
      }
    }
    loadPages();
    return () => { cancelled = true; };
  }, [workId, currentChapter]);

  // ─── Save reading progress (debounce 500ms) ───
  const saveProgress = useCallback((scrollPos) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!currentChapter) return;
      try {
        await MusashiService.updateProgress(workId, {
          chapter_id: currentChapter.id || currentChapter._id,
          chapter_number: currentChapter.chapter_number || currentIndex + 1,
          scroll_position: scrollPos,
        });
      } catch { /* silently fail */ }
    }, 500);
  }, [workId, currentChapter, currentIndex]);

  // ─── Scroll handler ───
  useEffect(() => {
    const wrapper = scrollRef.current;
    if (!wrapper) return;
    const handleScroll = () => {
      saveProgress(wrapper.scrollTop);
    };
    wrapper.addEventListener('scroll', handleScroll, { passive: true });
    return () => wrapper.removeEventListener('scroll', handleScroll);
  }, [saveProgress]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        exitReader();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // ─── Navigation helpers ───
  const currentIndex = chapters.findIndex(
    (c) => String(c.id || c._id) === String(currentChapter?.id || currentChapter?._id)
  );

  const goToChapter = useCallback((ch) => {
    setCurrentChapter(ch);
    setShowChapterSelect(false);
  }, []);

  const exitReader = useCallback(() => {
    document.body.classList.remove('reader-mode');
    navigate(`/musashi/${workId}`);
  }, [navigate, workId]);

  // ─── Theme class ───
  const themeClass = settings.nightMode ? 'night-mode' : '';

  // ─── Image width style ───
  const imageWidthStyle = settings.imageWidth
    ? { maxWidth: `${settings.imageWidth}px` }
    : {};

  // ─── Render ───
  if (loading) {
    return (
      <div className="mr-reader">
        <div className="mr-loading">
          <Loader2 size={32} className="mr-spinning" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error && !work) {
    return (
      <div className="mr-reader">
        <div className="mr-error">
          <p>{error}</p>
          <button className="mr-error-retry" onClick={() => window.location.reload()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`mr-reader ${themeClass}`}>
      {/* Top Bar */}
      <div className="mr-topbar">
        <div className="mr-topbar-left">
          <span className="mr-topbar-title">{work?.title || ''}</span>

          {/* Chapter Selector */}
          <div className="mr-chapter-selector">
            <button
              className="mr-chapter-btn"
              onClick={() => setShowChapterSelect((v) => !v)}
            >
              {currentChapter?.title || `第${currentIndex + 1}话`}
              <ChevronDown size={14} />
            </button>
            {showChapterSelect && (
              <>
                <div className="mr-chapter-overlay" onClick={() => setShowChapterSelect(false)} />
                <div className="mr-chapter-dropdown">
                  {chapters.map((ch, idx) => {
                    const chId = ch.id || ch._id;
                    const isActive = String(chId) === String(currentChapter?.id || currentChapter?._id);
                    return (
                      <button
                        key={chId || idx}
                        className={`mr-chapter-option${isActive ? ' active' : ''}`}
                        onClick={() => goToChapter(ch)}
                      >
                        {ch.title || `第${idx + 1}话`}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mr-topbar-right">
          <button
            className="mr-icon-btn"
            onClick={() => setShowSettings((v) => !v)}
            title="阅读设置"
          >
            <Settings size={18} />
          </button>
          <button className="mr-exit-btn" onClick={exitReader} title="退出阅读 (Esc)">
            <X size={14} />
            退出
          </button>
        </div>
      </div>

      {/* Pages */}
      <div className="mr-pages-wrapper" ref={scrollRef}>
        <div className="mr-pages" style={imageWidthStyle}>
          {pages.length > 0 ? (
            pages.map((page, idx) => (
              <img
                key={page.id || idx}
                className="mr-page-img"
                src={page.image_url || page.url || page}
                alt={`第${idx + 1}页`}
                loading="lazy"
              />
            ))
          ) : (
            <div className="mr-loading">
              <Loader2 size={24} className="mr-spinning" />
              <p>加载页面...</p>
            </div>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <ReaderSettings
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
