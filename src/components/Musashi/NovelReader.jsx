import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, X, ChevronLeft, ChevronRight, List, Loader2 } from 'lucide-react';
import { MusashiService } from '../../services/musashiApi';
import { renderMarkdown } from '../../utils/renderMarkdown';
import ReaderSettings, { loadReaderSettings } from './ReaderSettings';
import './NovelReader.css';

export default function NovelReader() {
  const { workId, chapter: chapterParam } = useParams();
  const navigate = useNavigate();

  // ─── State ───
  const [work, setWork] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [chapterContent, setChapterContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(() => loadReaderSettings());

  const contentRef = useRef(null);
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

        const chaptersData = await MusashiService.getChapters(workId);
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
                  // Scroll to saved position after content loads
                  if (progress.scroll_position) {
                    setTimeout(() => {
                      if (contentRef.current) {
                        contentRef.current.scrollTop = progress.scroll_position;
                      }
                    }, 100);
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

  // ─── Load chapter content ───
  useEffect(() => {
    if (!currentChapter) return;
    let cancelled = false;
    async function loadContent() {
      try {
        const data = await MusashiService.getChapter(workId, currentChapter.id || currentChapter._id);
        if (!cancelled) {
          setChapterContent(data);
          // Scroll to top on chapter change
          if (contentRef.current) {
            contentRef.current.scrollTop = 0;
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || '章节加载失败');
      }
    }
    loadContent();
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
    const wrapper = contentRef.current;
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
        return;
      }
      if (e.key === 'ArrowLeft') {
        goToPrevChapter();
      } else if (e.key === 'ArrowRight') {
        goToNextChapter();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // ─── Navigation helpers ───
  const currentIndex = chapters.findIndex(
    (c) => String(c.id || c._id) === String(currentChapter?.id || currentChapter?._id)
  );

  const goToPrevChapter = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentChapter(chapters[currentIndex - 1]);
    }
  }, [currentIndex, chapters]);

  const goToNextChapter = useCallback(() => {
    if (currentIndex < chapters.length - 1) {
      setCurrentChapter(chapters[currentIndex + 1]);
    }
  }, [currentIndex, chapters]);

  const goToChapter = useCallback((ch) => {
    setCurrentChapter(ch);
  }, []);

  const exitReader = useCallback(() => {
    document.body.classList.remove('reader-mode');
    navigate(`/musashi/${workId}`);
  }, [navigate, workId]);

  // ─── Theme class ───
  const themeClass = settings.nightMode ? 'night-mode' : '';
  const themeAttr = settings.nightMode ? '' : settings.themeColor;

  // ─── Render ───
  if (loading) {
    return (
      <div className="nr-reader" data-theme={themeAttr}>
        <div className="nr-loading">
          <Loader2 size={32} className="nr-spinning" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (error && !work) {
    return (
      <div className="nr-reader" data-theme={themeAttr}>
        <div className="nr-error">
          <p>{error}</p>
          <button className="nr-error-retry" onClick={() => window.location.reload()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  const contentHtml = chapterContent
    ? (chapterContent.content_html || renderMarkdown(chapterContent.content || ''))
    : '';

  return (
    <div className={`nr-reader ${themeClass}`} data-theme={settings.nightMode ? '' : settings.themeColor}>
      {/* Top Bar */}
      <div className="nr-topbar">
        <div className="nr-topbar-left">
          <button
            className="nr-icon-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            title="章节目录"
          >
            <List size={18} />
          </button>
          <span className="nr-topbar-title">{work?.title || ''}</span>
        </div>
        <div className="nr-topbar-right">
          <button
            className="nr-icon-btn"
            onClick={() => setShowSettings((v) => !v)}
            title="阅读设置"
          >
            <Settings size={18} />
          </button>
          <button className="nr-exit-btn" onClick={exitReader} title="退出阅读 (Esc)">
            <X size={14} />
            退出
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="nr-body">
        {/* Sidebar */}
        <div className={`nr-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
          <div className="nr-sidebar-title">章节目录</div>
          {chapters.map((ch, idx) => {
            const chId = ch.id || ch._id;
            const isActive = String(chId) === String(currentChapter?.id || currentChapter?._id);
            return (
              <button
                key={chId || idx}
                className={`nr-chapter-item${isActive ? ' active' : ''}`}
                onClick={() => goToChapter(ch)}
              >
                {ch.title || `第${idx + 1}章`}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="nr-content-wrapper" ref={contentRef}>
          <div
            className="nr-content"
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            {currentChapter && (
              <h2 className="nr-chapter-title">{currentChapter.title || ''}</h2>
            )}
            {chapterContent ? (
              <div
                className="nr-content-body"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            ) : (
              <div className="nr-loading">
                <Loader2 size={24} className="nr-spinning" />
                <p>加载章节内容...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="nr-bottom-nav">
        <button
          className="nr-nav-btn"
          disabled={currentIndex <= 0}
          onClick={goToPrevChapter}
        >
          <ChevronLeft size={16} />
          上一章
        </button>
        <span className="nr-nav-info">
          {currentIndex >= 0 ? `${currentIndex + 1} / ${chapters.length}` : ''}
        </span>
        <button
          className="nr-nav-btn"
          disabled={currentIndex < 0 || currentIndex >= chapters.length - 1}
          onClick={goToNextChapter}
        >
          下一章
          <ChevronRight size={16} />
        </button>
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
