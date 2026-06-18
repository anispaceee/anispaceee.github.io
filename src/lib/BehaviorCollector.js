/**
 * ANISpace 前端行为采集器
 * 批量上报用户行为，10秒窗口合并请求
 */
import { apiRequest } from '../services/api';

class BehaviorCollector {
  constructor() {
    this.queue = [];
    this.flushInterval = 10000;
    this.timer = null;
    this.pageEnterTime = Date.now();
    this.currentPage = '';
  }

  /** 记录行为 */
  track(action, targetType = '', targetId = 0, metadata = {}) {
    this.queue.push({
      action,
      target_type: targetType,
      target_id: targetId,
      metadata: { ...metadata, _ts: Date.now() },
    });
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.flushInterval);
    }
    if (this.queue.length >= 20) this.flush();
  }

  /** 批量上报 */
  async flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    try {
      await apiRequest('/api/behavior/batch', {
        method: 'POST',
        body: JSON.stringify({ actions: batch }),
      });
    } catch {
      // 上报失败，丢弃不重试
    }
    if (this.queue.length === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 页面进入追踪 */
  trackPageEnter(pageName) {
    this.currentPage = pageName;
    this.pageEnterTime = Date.now();
  }

  /** 页面离开追踪 */
  trackPageLeave() {
    const duration = Date.now() - this.pageEnterTime;
    if (duration > 2000 && this.currentPage) {
      this.track('page_stay', 'page', 0, {
        page: this.currentPage,
        duration_ms: duration,
      });
    }
  }

  /** 条目浏览 */
  trackViewSubject(subjectId, type, source = '') {
    this.track('view_subject', type, subjectId, { source });
  }

  /** 搜索点击 */
  trackSearchClick(query, subjectId, position, type = '') {
    this.track('search_click', type, subjectId, { query, position });
  }

  /** 收藏操作 */
  trackMarkCollection(subjectId, status, type = '') {
    this.track('mark_collection', type, subjectId, { status, subject_id: subjectId });
  }

  /** 评分操作 */
  trackRate(subjectId, rating, type = '') {
    this.track('rate', type, subjectId, { rating });
  }

  /** 帖子浏览 */
  trackViewPost(postId, board = '') {
    this.track('view_post', 'post', postId, { board });
  }

  /** 资讯点击 */
  trackNewsClick(newsId, source = '', category = '') {
    this.track('news_click', 'news', newsId, { source, category });
  }

  /** 推荐点击 */
  trackRecommendClick(targetId, scene, position, reason, type = '') {
    this.track('recommend_click', type, targetId, { scene, position, reason });
  }

  /** Navi 对话 */
  trackNaviChat(turnCount, hasRecommend) {
    this.track('navi_chat', 'ai', 0, { turn_count: turnCount, has_recommend: hasRecommend });
  }

  /** 滚动深度 */
  trackScrollDepth(page, depthPct) {
    this.track('scroll_depth', 'page', 0, { page, depth_pct: depthPct });
  }
}

// 单例导出
export const behaviorCollector = new BehaviorCollector();

// 页面卸载时刷新
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    behaviorCollector.trackPageLeave();
    behaviorCollector.flush();
  });
}