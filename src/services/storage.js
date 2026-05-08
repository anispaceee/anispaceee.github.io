const STORAGE_KEYS = {
  AUTH_TOKEN: 'acg_auth_token',
  CURRENT_USER: 'acg_current_user',
  USERS: 'acg_users',
  POSTS: 'acg_posts',
  WORLD_MESSAGES: 'acg_world_messages',
  FOLLOWS: 'acg_follows',
  LIKES: 'acg_likes',
  FAVORITES: 'acg_favorites',
  COMMENTS: 'acg_comments',
  RATINGS: 'acg_ratings',
  NOTIFICATIONS: 'acg_notifications',
  MESSAGES: 'acg_messages',
  CREATIONS: 'acg_creations',
  COMMISSIONS: 'acg_commissions',
  BANGUMI_CACHE: 'acg_bangumi_cache',
  COLLECTION_MARKS: 'acg_collection_marks',
  PRIVATE_MESSAGES: 'acg_private_messages',
  VIDEOS: 'acg_videos',
  DANMAKUS: 'acg_danmakus',
  VIDEO_COMMENTS: 'acg_video_comments',
  MAILBOX: 'acg_mailbox',
};

function get(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  localStorage.removeItem(key);
}

export const StorageService = {
  get, set, remove, STORAGE_KEYS,
};
