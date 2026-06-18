import { StorageService } from '../../services/api';

const AFFINITY_KEY_PREFIX = 'acg_navi_affinity_';

// 好感度等级定义
const LEVELS = [
  { name: 'stranger', label: '陌生', min: 0, max: 20 },
  { name: 'familiar', label: '熟悉', min: 21, max: 50 },
  { name: 'intimate', label: '亲密', min: 51, max: 80 },
  { name: 'bond', label: '羁绊', min: 81, max: 100 },
];

// 各等级的对话风格提示
const LEVEL_PROMPTS = {
  stranger: '与用户保持礼貌但有距离的对话风格，使用标准敬语。',
  familiar: '可以开始使用昵称称呼用户，偶尔主动搭话，语气更轻松。',
  intimate: '使用专属台词，主动推荐内容，记住用户偏好，语气亲昵。',
  bond: '深度对话，解锁隐藏话题，特殊问候语，像老朋友一样交流。',
};

/**
 * 好感度系统
 * 每个人格独立计算好感度
 */
class AffinityStore {
  constructor(personaId) {
    this.personaId = personaId;
    this.key = `${AFFINITY_KEY_PREFIX}${personaId}`;
  }

  _load() {
    return StorageService.get(this.key, {
      score: 0,
      level: 'stranger',
      lastInteraction: null,
      streakDays: 0,
      totalConversations: 0,
      giftsReceived: [],
      lastStreakCheck: null,
    });
  }

  _save(data) {
    StorageService.set(this.key, data);
  }

  /** 获取好感度数据 */
  get() {
    const data = this._load();
    // 检查连续天数衰减
    this._checkStreakDecay(data);
    // 更新等级
    data.level = this._calcLevel(data.score);
    this._save(data);
    return data;
  }

  /** 增加好感度 */
  addScore(delta) {
    const data = this._load();
    data.score = Math.max(0, Math.min(100, data.score + delta));
    data.level = this._calcLevel(data.score);
    this._save(data);
    return data;
  }

  /** 记录一次互动 */
  recordInteraction() {
    const data = this._load();
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    data.totalConversations = (data.totalConversations || 0) + 1;

    // 连续天数计算
    if (data.lastInteraction) {
      const lastDate = data.lastInteraction.split('T')[0];
      if (lastDate === today) {
        // 同一天，不增加连续天数
      } else {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (lastDate === yesterday) {
          data.streakDays = (data.streakDays || 0) + 1;
          // 连续奖励
          if (data.streakDays > 1) {
            data.score = Math.min(100, data.score + 2);
          }
        } else {
          // 中断了，重新计数
          data.streakDays = 1;
        }
      }
    } else {
      data.streakDays = 1;
    }

    // 每次对话 +1
    data.score = Math.min(100, data.score + 1);
    data.lastInteraction = now;
    data.level = this._calcLevel(data.score);
    this._save(data);
    return data;
  }

  /** 添加礼物 */
  addGift(item) {
    const data = this._load();
    data.giftsReceived = data.giftsReceived || [];
    data.giftsReceived.push({ item, timestamp: new Date().toISOString() });
    // 最多保留 50 个礼物记录
    if (data.giftsReceived.length > 50) {
      data.giftsReceived = data.giftsReceived.slice(-50);
    }
    this._save(data);
  }

  /** 检查连续天数衰减 */
  _checkStreakDecay(data) {
    if (!data.lastInteraction) return;
    const now = new Date();
    const last = new Date(data.lastInteraction);
    const daysSince = Math.floor((now - last) / 86400000);

    if (daysSince > 3) {
      // 超过3天未互动，每天衰减1分
      const decay = Math.min(daysSince - 3, data.score);
      data.score = Math.max(0, data.score - decay);
      data.streakDays = 0;
    }
  }

  /** 计算等级 */
  _calcLevel(score) {
    for (const level of LEVELS) {
      if (score >= level.min && score <= level.max) return level.name;
    }
    return 'stranger';
  }

  /** 获取等级标签 */
  getLevelLabel(levelName) {
    const level = LEVELS.find(l => l.name === levelName);
    return level ? level.label : '陌生';
  }

  /** 获取等级对应的对话风格提示 */
  getLevelPrompt(levelName) {
    return LEVEL_PROMPTS[levelName] || LEVEL_PROMPTS.stranger;
  }

  /** 构建好感度注入文本（供 system prompt 使用） */
  buildAffinityContext() {
    const data = this.get();
    const label = this.getLevelLabel(data.level);
    const gifts = (data.giftsReceived || []).slice(-5).map(g => g.item).join('、');
    const stylePrompt = this.getLevelPrompt(data.level);

    return `【好感度】当前与用户的好感度：${data.score}（${label}）。连续互动 ${data.streakDays} 天。总对话次数 ${data.totalConversations}。${gifts ? `已收到礼物：${gifts}。` : ''}
根据好感度等级调整对话风格：${stylePrompt}`;
  }

  /** 清空好感度 */
  reset() {
    StorageService.remove(this.key);
  }
}

/**
 * 获取指定人格的好感度存储实例
 * @param {string} personaId - 人格 ID
 * @returns {AffinityStore}
 */
export function getAffinityStore(personaId) {
  return new AffinityStore(personaId);
}

export { LEVELS, LEVEL_PROMPTS };
