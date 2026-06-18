import { StorageService, BangumiService, CollectionMarkService } from '../../services/api';

const CRON_STATE_KEY = 'acg_navi_cron_state';
const GREETING_KEY = 'acg_navi_greeting_today';
const CHECK_INTERVAL = 60 * 1000; // 每分钟检查一次

/**
 * 定时调度系统
 * 管理：新番提醒、每日问候、收藏更新检查
 */
class NaviCron {
  constructor() {
    this._timer = null;
    this._listeners = new Set();
    this._config = this._loadConfig();
  }

  _loadConfig() {
    return StorageService.get(CRON_STATE_KEY, {
      newAnimeReminder: true,
      dailyGreeting: true,
      reminderTime: '10:00', // 新番提醒时间
    });
  }

  _saveConfig() {
    StorageService.set(CRON_STATE_KEY, this._config);
  }

  /** 更新配置 */
  updateConfig(updates) {
    Object.assign(this._config, updates);
    this._saveConfig();
  }

  /** 获取配置 */
  getConfig() {
    return { ...this._config };
  }

  /** 注册事件监听器 */
  on(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /** 触发事件 */
  _emit(event, data) {
    this._listeners.forEach(cb => {
      try { cb(event, data); } catch { /* 静默 */ }
    });
  }

  /** 启动定时检查 */
  start() {
    if (this._timer) return;
    // 首次立即检查
    this._check();
    this._timer = setInterval(() => this._check(), CHECK_INTERVAL);
  }

  /** 停止定时检查 */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** 每分钟检查 */
  async _check() {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateStr = now.toISOString().split('T')[0];

    // 新番提醒
    if (this._config.newAnimeReminder && timeStr === this._config.reminderTime) {
      await this._checkNewAnime(dateStr);
    }

    // 每日问候
    if (this._config.dailyGreeting) {
      const lastGreeting = StorageService.get(GREETING_KEY, '');
      if (lastGreeting !== dateStr) {
        // 标记今天已问候（防止重复）
        StorageService.set(GREETING_KEY, dateStr);
        this._emit('daily_greeting', { date: dateStr, hour: now.getHours() });
      }
    }
  }

  /** 检查今日新番更新 */
  async _checkNewAnime(dateStr) {
    try {
      const calendarData = await BangumiService.getCalendar();
      if (!Array.isArray(calendarData)) return;

      const today = new Date(dateStr).getDay();
      const weekdayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const cnMap = ['日', '一', '二', '三', '四', '五', '六'];
      const todayData = calendarData.find(d =>
        d.weekday?.en === weekdayMap[today] || d.weekday?.cn === cnMap[today]
      );

      if (!todayData?.items) return;

      // 获取用户"在看"收藏
      const userId = this._getCurrentUserId();
      if (!userId) return;

      const collections = await CollectionMarkService.getByUserId(userId);
      const watchingIds = new Set(
        (collections || []).filter(c => c.status === 'doing').map(c => Number(c.subject_id))
      );

      // 找出今日更新且用户在追的番
      const updates = todayData.items.filter(item => watchingIds.has(Number(item.id)));

      if (updates.length > 0) {
        this._emit('new_anime', {
          date: dateStr,
          items: updates.map(item => ({
            id: item.id,
            name: item.name_cn || item.name,
            score: item.rating?.score || 0,
          })),
        });
      }
    } catch { /* 静默 */ }
  }

  /** 获取当前用户 ID（从 sessionStorage） */
  _getCurrentUserId() {
    try {
      const user = JSON.parse(sessionStorage.getItem('acg_current_user') || '{}');
      return user?.id || null;
    } catch {
      return null;
    }
  }

  /** 请求浏览器通知权限 */
  static async requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  /** 发送浏览器通知 */
  static sendNotification(title, body, onClick) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const notif = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'navi-cron',
    });
    if (onClick) notif.onclick = onClick;
    return notif;
  }
}

/** 单例 */
export const naviCron = new NaviCron();

/**
 * 生成每日问候文本
 * @param {number} hour - 当前小时
 * @param {object} siteData - 站内实时数据
 * @param {object} affinityData - 好感度数据
 * @returns {string} 问候文本
 */
export function generateGreeting(hour, siteData, affinityData) {
  const timeGreet = hour < 6 ? '夜深了'
    : hour < 9 ? '早上好'
    : hour < 12 ? '上午好'
    : hour < 14 ? '中午好'
    : hour < 18 ? '下午好'
    : hour < 22 ? '晚上好'
    : '夜深了';

  const level = affinityData?.level || 'stranger';
  const levelGreet = level === 'bond' ? '，又见面了呢'
    : level === 'intimate' ? '，今天也请多关照'
    : level === 'familiar' ? ''
    : '';

  let extra = '';
  if (siteData?.todayBroadcast?.length > 0) {
    const top3 = siteData.todayBroadcast.slice(0, 3).map(i => i.name).join('、');
    extra = `今天有${siteData.todayBroadcast.length}部番剧更新，比如${top3}等。`;
  }

  return `${timeGreet}${levelGreet}！${extra}`;
}
