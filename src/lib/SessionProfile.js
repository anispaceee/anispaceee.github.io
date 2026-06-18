/**
 * ANISpace 实时会话画像
 * 管理当前会话的用户行为上下文，30分钟无活动自动过期
 */
const STORAGE_KEY = 'anispace_session_profile';
const SESSION_TIMEOUT = 30 * 60 * 1000;

class SessionProfile {
  constructor() {
    this.profile = this._load();
    this._checkExpiry();
  }

  /** 记录行为到会话画像 */
  trackAction(type, targetId, metadata = {}) {
    this._checkExpiry();
    this.profile.actions.push({
      type,
      target_id: targetId,
      ts: Date.now(),
      ...metadata,
    });
    if (this.profile.actions.length > 100) {
      this.profile.actions = this.profile.actions.slice(-100);
    }
    this._updateInterests();
    this.profile.session_duration_ms = Date.now() - this.profile.session_start;
    this._save();
  }

  /** 获取当前兴趣标签 */
  getCurrentInterests() {
    this._checkExpiry();
    return this.profile.current_interests || [];
  }

  /** 获取最近浏览的 subject_id 列表 */
  getRecentViewSubjects() {
    this._checkExpiry();
    return this.profile.actions
      .filter(a => a.type === 'view_subject' || a.type === 'search_click')
      .map(a => a.target_id)
      .filter(Boolean)
      .slice(-20);
  }

  /** 获取会话摘要 */
  getSessionSummary() {
    this._checkExpiry();
    return {
      current_interests: this.profile.current_interests,
      recent_views: this.getRecentViewSubjects(),
      session_duration_ms: this.profile.session_duration_ms,
    };
  }

  /** 获取 HTTP header 值 */
  getHeader() {
    const summary = this.getSessionSummary();
    if (summary.current_interests.length === 0 && summary.recent_views.length === 0) {
      return '';
    }
    return JSON.stringify(summary);
  }

  _checkExpiry() {
    if (this.profile.session_start && Date.now() - this.profile.session_start > SESSION_TIMEOUT) {
      this.profile = this._createNew();
      this._save();
    }
  }

  _updateInterests() {
    const tagCount = {};
    for (const action of this.profile.actions) {
      if (action.tags && Array.isArray(action.tags)) {
        for (const tag of action.tags) {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
      }
      if (action.type) {
        tagCount[action.type] = (tagCount[action.type] || 0) + 1;
      }
    }
    this.profile.current_interests = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
  }

  _createNew() {
    return {
      session_id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      session_start: Date.now(),
      actions: [],
      current_interests: [],
      session_duration_ms: 0,
    };
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return this._createNew();
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {}
  }
}

export const sessionProfile = new SessionProfile();