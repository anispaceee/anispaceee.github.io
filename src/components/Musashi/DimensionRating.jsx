import { useState } from 'react';
import { Star } from 'lucide-react';
import './DimensionRating.css';

const DIMENSIONS = {
  illustration: [
    { key: 'art', label: '画风', description: '构图、色彩、线条表现力' },
    { key: 'creativity', label: '创意', description: '主题构思与原创性' },
    { key: 'technique', label: '技法', description: '绘画技巧与完成度' },
    { key: 'impact', label: '感染力', description: '情感传达与视觉冲击' },
  ],
  novel: [
    { key: 'plot', label: '剧情', description: '情节设计与节奏把控' },
    { key: 'writing', label: '文笔', description: '文字功底与表达力' },
    { key: 'character', label: '人设', description: '角色塑造与成长' },
    { key: 'worldview', label: '世界观', description: '设定完整与合理性' },
  ],
  manga: [
    { key: 'art', label: '画风', description: '分镜、线条、画面表现力' },
    { key: 'plot', label: '剧情', description: '故事逻辑与节奏把控' },
    { key: 'character', label: '人设', description: '角色魅力与辨识度' },
    { key: 'pacing', label: '叙事', description: '叙事节奏与信息密度' },
  ],
  galgame: [
    { key: 'plot', label: '剧情', description: '主线与分支设计质量' },
    { key: 'art', label: '美术', description: '立绘、CG、UI设计' },
    { key: 'music', label: '音乐', description: 'BGM与主题曲质量' },
    { key: 'system', label: '系统', description: 'UI/UX与操作流畅度' },
  ],
};

export default function DimensionRating({ workType, initialScores = {}, onChange, disabled = false }) {
  const dims = DIMENSIONS[workType] || DIMENSIONS.illustration;
  const [scores, setScores] = useState(() => {
    const init = {};
    dims.forEach(d => { init[d.key] = initialScores[d.key] || 0; });
    return init;
  });

  const handleScore = (key, value) => {
    if (disabled) return;
    const updated = { ...scores, [key]: value };
    setScores(updated);
    onChange?.(updated);
  };

  return (
    <div className="dr-panel">
      <div className="dr-title">维度评价</div>
      {dims.map(dim => (
        <div key={dim.key} className="dr-row">
          <div className="dr-label">
            <span className="dr-label-name">{dim.label}</span>
            <span className="dr-label-desc">{dim.description}</span>
          </div>
          <div className="dr-stars">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                className={`dr-star${n <= scores[dim.key] ? ' filled' : ''}${disabled ? ' disabled' : ''}`}
                onClick={() => handleScore(dim.key, n === scores[dim.key] ? 0 : n)}
                title={`${n} 星`}
                type="button"
              >
                <Star
                  size={16}
                  fill={n <= scores[dim.key] ? '#f59e0b' : 'none'}
                  color={n <= scores[dim.key] ? '#f59e0b' : '#ccc'}
                />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}