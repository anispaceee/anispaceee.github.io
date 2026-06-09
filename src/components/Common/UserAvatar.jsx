import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { UserService } from '../../services/api';
import './UserAvatar.css';

const FALLBACK_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="%23f9f3f5"%3E%3Crect width="40" height="40" rx="20"/%3E%3Ctext x="20" y="24" text-anchor="middle" fill="%23c8bfcc" font-size="12"%3E%3F%3C/text%3E%3C/svg%3E';

export default function UserAvatar({ userId, src, alt, size = 40, className = '' }) {
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();
  const [failed, setFailed] = useState(false);

  const isSelf = currentUser && userId === currentUser.id;

  const handleClick = useCallback(async () => {
    if (!userId) return;
    if (isSelf) {
      navigate('/profile');
      return;
    }
    try {
      const profile = await UserService.getProfile(userId);
      if (profile.private) {
        showToast?.('该用户已设置隐私保护');
        return;
      }
      navigate(`/profile/${userId}`);
    } catch (err) {
      if (err?.private) {
        showToast?.('该用户已设置隐私保护');
      } else {
        navigate(`/profile/${userId}`);
      }
    }
  }, [userId, isSelf, navigate, showToast]);

  return (
    <img
      src={failed ? FALLBACK_AVATAR : (src || FALLBACK_AVATAR)}
      alt={alt || ''}
      className={`user-avatar ${className}`}
      style={{ width: size, height: size }}
      loading="lazy"
      onError={() => setFailed(true)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
    />
  );
}
