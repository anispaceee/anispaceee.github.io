import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Maximize2 } from 'lucide-react';
import './IllustrationGallery.css';

export default function IllustrationGallery({ illustrations = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (!illustrations.length) return null;

  const current = illustrations[activeIndex];
  const total = illustrations.length;

  const goPrev = () => setActiveIndex((i) => (i - 1 + total) % total);
  const goNext = () => setActiveIndex((i) => (i + 1) % total);

  return (
    <div className="ill-gallery-section">
      <h2 className="ill-gallery-title">作品画廊 ({total} 张)</h2>

      {/* 主图展示 */}
      <div className="ill-gallery-main">
        <img
          src={current?.image_url || current?.url}
          alt={current?.caption || `作品图 ${activeIndex + 1}`}
          className="ill-gallery-main-img"
        />
        {current?.caption && (
          <div className="ill-gallery-caption">{current.caption}</div>
        )}
        <button className="ill-gallery-lightbox-btn" onClick={() => setLightbox(true)} title="全屏查看">
          <Maximize2 size={18} />
        </button>
        {total > 1 && (
          <>
            <button className="ill-gallery-arrow ill-gallery-prev" onClick={goPrev}>
              <ChevronLeft size={24} />
            </button>
            <button className="ill-gallery-arrow ill-gallery-next" onClick={goNext}>
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      {/* 缩略图列表 */}
      {total > 1 && (
        <div className="ill-gallery-thumbs">
          {illustrations.map((img, idx) => (
            <button
              key={img.id || idx}
              className={`ill-gallery-thumb${idx === activeIndex ? ' active' : ''}`}
              onClick={() => setActiveIndex(idx)}
            >
              <img src={img.image_url || img.url} alt={img.caption || `缩略图 ${idx + 1}`} />
            </button>
          ))}
        </div>
      )}

      {/* 灯箱全屏 */}
      {lightbox && (
        <div className="ill-lightbox" onClick={() => setLightbox(false)}>
          <button className="ill-lightbox-close" onClick={() => setLightbox(false)}>
            <X size={24} />
          </button>
          <img
            src={current?.image_url || current?.url}
            alt={current?.caption || '全屏查看'}
            className="ill-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          {total > 1 && (
            <>
              <button
                className="ill-lightbox-arrow ill-lightbox-prev"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
              >
                <ChevronLeft size={32} />
              </button>
              <button
                className="ill-lightbox-arrow ill-lightbox-next"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
              >
                <ChevronRight size={32} />
              </button>
            </>
          )}
          <div className="ill-lightbox-counter">
            {activeIndex + 1} / {total}
          </div>
        </div>
      )}
    </div>
  );
}