import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { MusashiService } from '../../services/musashiApi';
import {
  Eye, Heart, Bookmark, Edit3, Trash2,
  Globe, GlobeLock, Loader2, AlertCircle, Plus,
} from 'lucide-react';
import './MyWorks.css';

const TYPE_CONFIG = {
  galgame: { label: 'Galgame', color: '#ff9f43' },
  novel:   { label: '小说',   color: '#9b59b6' },
  manga:   { label: '漫画',   color: '#00a1d6' },
};

const STATUS_MAP = {
  ongoing:  '连载中',
  completed: '已完结',
  hiatus:   '搁置',
};

export default function MyWorks() {
  const navigate = useNavigate();
  const { isAuthenticated, currentUser } = useApp();

  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ─── 加载我的作品 ───
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await MusashiService.getMyWorks();
        if (!cancelled) {
          setWorks(Array.isArray(data) ? data : (data.works || data.data || []));
        }
      } catch (err) {
        if (!cancelled) setError(err.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ─── 删除作品 ───
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await MusashiService.deleteWork(deleteTarget.id || deleteTarget._id);
      setWorks((prev) => prev.filter((w) => (w.id || w._id) !== (deleteTarget.id || deleteTarget._id)));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || '删除失败');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  // ─── 切换可见性 ───
  const handleToggleVisibility = useCallback(async (work) => {
    const workId = work.id || work._id;
    const newVisible = !work.is_visible;
    try {
      await MusashiService.updateWork(workId, { is_visible: newVisible });
      setWorks((prev) =>
        prev.map((w) =>
          (w.id || w._id) === workId ? { ...w, is_visible: newVisible } : w
        )
      );
    } catch (err) {
      setError(err.message || '操作失败');
    }
  }, []);

  // ─── 未登录 ───
  if (!isAuthenticated) {
    return (
      <div className="mw-page">
        <div className="mw-empty">
          <AlertCircle size={48} />
          <p>请先登录</p>
        </div>
      </div>
    );
  }

  // ─── 加载中 ───
  if (loading) {
    return (
      <div className="mw-page">
        <div className="mw-loading">
          <Loader2 size={32} className="mw-spinning" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  // ─── 错误 ───
  if (error && works.length === 0) {
    return (
      <div className="mw-page">
        <div className="mw-empty">
          <AlertCircle size={48} />
          <p>{error}</p>
          <button className="mw-retry-btn" onClick={() => window.location.reload()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mw-page">
      <div className="mw-header">
        <h1 className="mw-title">我的作品</h1>
        <button
          className="mw-create-btn"
          onClick={() => navigate('/musashi/new')}
        >
          <Plus size={16} />
          发布作品
        </button>
      </div>

      {works.length === 0 ? (
        <div className="mw-empty">
          <p>你还没有发布作品，点击发布第一个作品吧</p>
          <button
            className="mw-create-btn"
            onClick={() => navigate('/musashi/new')}
          >
            <Plus size={16} />
            发布作品
          </button>
        </div>
      ) : (
        <div className="mw-list">
          {works.map((work) => {
            const workId = work.id || work._id;
            const typeInfo = TYPE_CONFIG[work.type] || { label: work.type, color: '#999' };
            const statusLabel = STATUS_MAP[work.status] || work.status;

            return (
              <div key={workId} className="mw-item">
                {/* 封面缩略图 */}
                <div className="mw-item-cover">
                  {work.cover_image ? (
                    <img src={work.cover_image} alt={work.title} loading="lazy" />
                  ) : (
                    <div className="mw-cover-placeholder">
                      <span>{(work.title || '?')[0]}</span>
                    </div>
                  )}
                </div>

                {/* 信息 */}
                <div className="mw-item-info">
                  <div className="mw-item-title-row">
                    <h3 className="mw-item-title">{work.title}</h3>
                    <span className="mw-type-badge" style={{ background: typeInfo.color }}>
                      {typeInfo.label}
                    </span>
                    <span className={`mw-status-badge${work.status === 'ongoing' ? ' ongoing' : ''}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mw-item-stats">
                    <span className="mw-stat"><Eye size={14} /> {work.view_count ?? 0}</span>
                    <span className="mw-stat"><Heart size={14} /> {work.like_count ?? 0}</span>
                    <span className="mw-stat"><Bookmark size={14} /> {work.favorite_count ?? 0}</span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="mw-item-actions">
                  <button
                    className="mw-action-btn mw-edit-btn"
                    onClick={() => navigate(`/musashi/${workId}/edit`)}
                    title="编辑"
                  >
                    <Edit3 size={14} />
                    编辑
                  </button>
                  <button
                    className="mw-action-btn mw-visibility-btn"
                    onClick={() => handleToggleVisibility(work)}
                    title={work.is_visible ? '设为隐藏' : '设为可见'}
                  >
                    {work.is_visible ? <Globe size={14} /> : <GlobeLock size={14} />}
                    {work.is_visible ? '公开' : '隐藏'}
                  </button>
                  <button
                    className="mw-action-btn mw-delete-btn"
                    onClick={() => setDeleteTarget(work)}
                    title="删除"
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="mw-confirm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="mw-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="mw-confirm-title">确认删除</h3>
            <p className="mw-confirm-text">
              确定要删除「{deleteTarget.title}」吗？此操作不可撤销。
            </p>
            <div className="mw-confirm-actions">
              <button
                className="mw-confirm-cancel"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                取消
              </button>
              <button
                className="mw-confirm-delete"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 size={14} className="mw-spinning" /> : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
