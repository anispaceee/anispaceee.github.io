import { useState, useCallback } from 'react';
import { Plus, X, GripVertical, Upload, Link as LinkIcon, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import './IllustrationUploader.css';

export default function IllustrationUploader({ images = [], onChange, max = 20 }) {
  const [urlInput, setUrlInput] = useState('');
  const [captionInput, setCaptionInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState(null);

  const addByUrl = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;
    if (images.length >= max) return;
    onChange([...images, { url, caption: captionInput.trim(), sort_order: images.length }]);
    setUrlInput('');
    setCaptionInput('');
    setShowUrlInput(false);
  }, [urlInput, captionInput, images, max, onChange]);

  const removeImage = useCallback((idx) => {
    const updated = images.filter((_, i) => i !== idx);
    onChange(updated.map((img, i) => ({ ...img, sort_order: i })));
  }, [images, onChange]);

  const moveUp = useCallback((idx) => {
    if (idx === 0) return;
    const updated = [...images];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    onChange(updated.map((img, i) => ({ ...img, sort_order: i })));
  }, [images, onChange]);

  const moveDown = useCallback((idx) => {
    if (idx === images.length - 1) return;
    const updated = [...images];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    onChange(updated.map((img, i) => ({ ...img, sort_order: i })));
  }, [images, onChange]);

  const handleDragStart = (e, idx) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === dropIdx) return;
    const updated = [...images];
    const [moved] = updated.splice(draggedIdx, 1);
    updated.splice(dropIdx, 0, moved);
    onChange(updated.map((img, i) => ({ ...img, sort_order: i })));
    setDraggedIdx(null);
  };

  return (
    <div className="illustration-uploader">
      <div className="ill-uploader-label">
        作品图片 <span className="ill-uploader-count">({images.length}/{max})</span>
      </div>

      {images.length > 0 && (
        <div className="ill-uploader-grid">
          {images.map((img, idx) => (
            <div
              key={idx}
              className={`ill-uploader-item${draggedIdx === idx ? ' dragging' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={() => setDraggedIdx(null)}
            >
              <div className="ill-item-drag-handle">
                <GripVertical size={14} />
              </div>
              <img
                src={img.url}
                alt={img.caption || `作品图 ${idx + 1}`}
                className="ill-item-thumb"
                onError={(e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" fill="%23666"><rect width="120" height="120"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999" font-size="12">加载失败</text></svg>'; }}
              />
              <div className="ill-item-overlay">
                <button
                  className="ill-item-btn"
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  title="上移"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  className="ill-item-btn"
                  onClick={() => moveDown(idx)}
                  disabled={idx === images.length - 1}
                  title="下移"
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  className="ill-item-btn ill-item-btn-danger"
                  onClick={() => removeImage(idx)}
                  title="删除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="ill-item-index">{idx + 1}</div>
            </div>
          ))}
        </div>
      )}

      {images.length < max && (
        <div className="ill-uploader-add">
          {!showUrlInput ? (
            <button
              className="ill-add-btn"
              onClick={() => setShowUrlInput(true)}
              type="button"
            >
              <Plus size={20} />
              <span>添加图片</span>
            </button>
          ) : (
            <div className="ill-url-form">
              <div className="ill-url-row">
                <input
                  className="ill-url-input"
                  type="text"
                  placeholder="输入图片URL (支持 ImgBB / 图床链接)"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addByUrl()}
                />
              </div>
              <div className="ill-url-row">
                <input
                  className="ill-url-input"
                  type="text"
                  placeholder="图片说明（可选）"
                  value={captionInput}
                  onChange={(e) => setCaptionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addByUrl()}
                />
              </div>
              <div className="ill-url-actions">
                <button className="ill-url-confirm" onClick={addByUrl} type="button">
                  <LinkIcon size={14} />
                  添加
                </button>
                <button
                  className="ill-url-cancel"
                  onClick={() => { setShowUrlInput(false); setUrlInput(''); setCaptionInput(''); }}
                  type="button"
                >
                  <X size={14} />
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="ill-uploader-hint">
        支持拖拽排序。建议使用 ImgBB 等图床上传后粘贴链接。
      </div>
    </div>
  );
}