import { useState, useEffect, useRef, useCallback } from 'react';
import { Feather, Clock, Sparkles, ArrowLeft, Loader2, Save } from 'lucide-react';
import { CreativeSpaceService } from '../../../services/api.js';
import CreativeNoteList from './CreativeNoteList.jsx';
import NotionBlockEditor from './NotionBlockEditor.jsx';
import InsightTimeline from './InsightTimeline.jsx';
import NaviChatPanel from './NaviChatPanel.jsx';
import './CreativeSpace.css';

/**
 * 创作空间主容器
 * @param {number} userId - 当前用户 ID
 * @param {boolean} isSelf - 是否是自己
 */
export default function CreativeSpace({ userId, isSelf }) {
  const [view, setView] = useState('list'); // list | editor | timeline
  const [notes, setNotes] = useState([]);
  const [currentNote, setCurrentNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved'
  const [naviOpen, setNaviOpen] = useState(false);
  const [prefillQuestion, setPrefillQuestion] = useState('');
  const [insights, setInsights] = useState([]);
  const saveTimerRef = useRef(null);
  const currentNoteRef = useRef(null);

  // 加载笔记列表
  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CreativeSpaceService.list();
      setNotes(data.notes || []);
    } catch (err) {
      console.error('加载笔记失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSelf) loadNotes();
  }, [isSelf, loadNotes]);

  // 同步 currentNote 到 ref（供 debounce 回调读取最新值）
  useEffect(() => {
    currentNoteRef.current = currentNote;
  }, [currentNote]);

  // 自动保存：debounce 1.5s
  const scheduleSave = useCallback((note) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      if (!note || !note.id) return;
      setSaving(true);
      try {
        const updated = await CreativeSpaceService.update(note.id, {
          title: note.title,
          blocks: note.blocks,
          linked_subject_ids: note.linked_subject_ids || [],
          linked_subjects_snapshot: note.linked_subjects_snapshot || [],
          tags: note.tags || [],
          is_pinned: note.is_pinned || 0,
        });
        setCurrentNote(prev => prev ? { ...prev, updated_at: updated.updated_at } : prev);
        setSaveStatus('saved');
        // 刷新列表中的该笔记
        setNotes(prev => prev.map(n => n.id === note.id ? { ...n, title: note.title, blocks: note.blocks, updated_at: updated.updated_at } : n));
      } catch (err) {
        console.error('保存失败:', err);
        setSaveStatus('');
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, []);

  // 编辑器内容变更回调
  const handleEditorChange = useCallback((patch) => {
    if (!currentNoteRef.current) return;
    const updated = { ...currentNoteRef.current, ...patch };
    setCurrentNote(updated);
    scheduleSave(updated);
  }, [scheduleSave]);

  // 新建笔记
  const handleCreate = useCallback(async () => {
    try {
      const note = await CreativeSpaceService.create({
        title: '',
        blocks: [{ id: 'block-' + Date.now().toString(36), type: 'text', content: '' }],
        linked_subject_ids: [],
        linked_subjects_snapshot: [],
        tags: [],
        is_pinned: 0,
      });
      setNotes(prev => [note, ...prev]);
      setCurrentNote(note);
      setView('editor');
      setSaveStatus('');
    } catch (err) {
      console.error('新建笔记失败:', err);
    }
  }, []);

  // 打开笔记
  const handleOpen = useCallback(async (note) => {
    setView('editor');
    setCurrentNote(note);
    setSaveStatus('');
    // 加载完整详情（确保 blocks 完整）
    try {
      const full = await CreativeSpaceService.get(note.id);
      setCurrentNote(full);
    } catch (err) {
      console.error('加载笔记详情失败:', err);
    }
  }, []);

  // 返回列表
  const handleBack = useCallback(() => {
    // 切换前 flush 保存
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (currentNoteRef.current) {
        CreativeSpaceService.update(currentNoteRef.current.id, {
          title: currentNoteRef.current.title,
          blocks: currentNoteRef.current.blocks,
          linked_subject_ids: currentNoteRef.current.linked_subject_ids || [],
          linked_subjects_snapshot: currentNoteRef.current.linked_subjects_snapshot || [],
          tags: currentNoteRef.current.tags || [],
          is_pinned: currentNoteRef.current.is_pinned || 0,
        }).catch(() => {});
      }
    }
    setView('list');
    setCurrentNote(null);
    loadNotes();
  }, [loadNotes]);

  // 打开 Navi 对话（按条触发）
  const handleAskNavi = useCallback((question) => {
    setPrefillQuestion(question || '');
    setNaviOpen(true);
  }, []);

  // 加载关联条目短评作为 Navi 上下文
  useEffect(() => {
    if (naviOpen && currentNote && insights.length === 0) {
      CreativeSpaceService.getTimeline().then(data => {
        // 只取与当前笔记关联条目相关的短评
        const linkedIds = currentNote.linked_subject_ids || [];
        const related = (data.timeline || []).filter(t => linkedIds.includes(t.subject_id));
        setInsights(related);
      }).catch(() => {});
    }
  }, [naviOpen, currentNote, insights.length]);

  if (!isSelf) return null;

  return (
    <div className="cs-creative-space">
      <div className="cs-toolbar">
        <div className="cs-toolbar-left">
          {view === 'editor' && (
            <button className="cs-btn cs-btn-ghost" onClick={handleBack}>
              <ArrowLeft size={14} /> 返回列表
            </button>
          )}
          {view === 'editor' && currentNote && (
            <span className="cs-save-status">
              {saving || saveStatus === 'saving' ? (
                <><Loader2 size={12} className="cs-spin" /> 保存中...</>
              ) : saveStatus === 'saved' ? (
                <><Save size={12} /> 已保存</>
              ) : null}
            </span>
          )}
        </div>
        <div className="cs-toolbar-right">
          {view === 'list' && (
            <>
              <button className="cs-btn cs-btn-ghost" onClick={() => setView('timeline')}>
                <Clock size={14} /> 感悟时间线
              </button>
              <button className="cs-btn cs-btn-primary" onClick={handleCreate}>
                <Feather size={14} /> 新建笔记
              </button>
            </>
          )}
          {view === 'editor' && (
            <button className="cs-btn cs-btn-ghost" onClick={() => setNaviOpen(!naviOpen)}>
              <Sparkles size={14} /> {naviOpen ? '收起 Navi' : '问 Navi'}
            </button>
          )}
          {view === 'timeline' && (
            <button className="cs-btn cs-btn-ghost" onClick={() => setView('list')}>
              <ArrowLeft size={14} /> 返回列表
            </button>
          )}
        </div>
      </div>

      <div className={`cs-main ${naviOpen ? 'with-navi' : ''}`}>
        <div className="cs-content">
          {view === 'list' && (
            <CreativeNoteList
              notes={notes}
              loading={loading}
              onOpen={handleOpen}
              onCreate={handleCreate}
            />
          )}
          {view === 'editor' && currentNote && (
            <>
              <NotionBlockEditor
                note={currentNote}
                onChange={handleEditorChange}
              />
              <div className="cs-editor-quick-ask">
                <button className="cs-btn cs-btn-ghost" onClick={() => handleAskNavi('我当时看这部作品时的感受？')}>
                  <Sparkles size={12} /> 问 Navi：当时的感受？
                </button>
                <button className="cs-btn cs-btn-ghost" onClick={() => handleAskNavi('帮我总结这篇笔记的核心观点')}>
                  <Sparkles size={12} /> 问 Navi：总结笔记
                </button>
              </div>
            </>
          )}
          {view === 'timeline' && <InsightTimeline />}
        </div>

        {naviOpen && (
          <div className="cs-navi-wrap">
            <NaviChatPanel
              currentNote={currentNote}
              insights={insights}
              prefillQuestion={prefillQuestion}
              open={naviOpen}
              onClose={() => { setNaviOpen(false); setPrefillQuestion(''); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
