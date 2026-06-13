import { useState, useCallback } from 'react';
import { Star } from 'lucide-react';
import './StarRating.css';

/**
 * 星级评分组件
 *
 * @param {object} props
 * @param {number} props.value - 当前评分 (1-5, 0 表示未评分)
 * @param {number} props.average - 平均评分
 * @param {number} props.count - 评分人数
 * @param {boolean} props.interactive - 是否可交互（登录用户）
 * @param {function} props.onRate - 评分回调 (rating: number) => void
 * @param {'small'|'medium'|'large'} props.size - 尺寸
 */
export default function StarRating({
  value = 0,
  average = 0,
  count = 0,
  interactive = false,
  onRate,
  size = 'medium',
}) {
  const [hoverRating, setHoverRating] = useState(0);

  const handleClick = useCallback((rating) => {
    if (!interactive || !onRate) return;
    // 点击已选中的同一评分则取消
    onRate(rating === value ? 0 : rating);
  }, [interactive, onRate, value]);

  const displayRating = hoverRating || value;

  const sizeMap = {
    small: 14,
    medium: 18,
    large: 24,
  };

  const iconSize = sizeMap[size] || 18;

  return (
    <div className="sr-wrapper">
      <div className="sr-stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`sr-star${interactive ? ' interactive' : ''}${star <= displayRating ? ' filled' : ''}${star <= average && !displayRating ? ' avg' : ''}`}
            onClick={() => handleClick(star)}
            onMouseEnter={() => interactive && setHoverRating(star)}
            onMouseLeave={() => interactive && setHoverRating(0)}
            disabled={!interactive}
          >
            <Star
              size={iconSize}
              fill={star <= displayRating ? 'currentColor' : 'none'}
            />
          </button>
        ))}
      </div>
      {(average > 0 || count > 0) && (
        <div className="sr-info">
          {average > 0 && <span className="sr-average">{average.toFixed(1)}</span>}
          {count > 0 && <span className="sr-count">({count}人评分)</span>}
        </div>
      )}
    </div>
  );
}
