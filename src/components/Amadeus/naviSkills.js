import { StorageService } from '../../services/api';

const SKILL_STATE_KEY = 'acg_navi_skill_state';

/**
 * 技能系统
 * 技能 = 预定义的交互流程模板，LLM 按模板引导用户完成多步交互
 */

// ─── 技能定义 ───

const skillDefinitions = [
  {
    id: 'guess_anime',
    name: '番剧竞猜',
    description: 'Navi 描述番剧线索，用户猜作品名',
    trigger: ['竞猜', '猜番', '猜动画', '猜猜看', '猜番剧'],
    prompt: '【番剧竞猜模式】请从用户收藏或当前热门番剧中选一部，给出3条线索（类型、设定、角色特征等），不要说出名字。用户猜测后，判断对错：正确则祝贺并点评，错误则再给一条线索，最多5轮。用角色口吻进行。',
  },
  {
    id: 'fortune',
    name: '运势占卜',
    description: '根据用户收藏数据生成今日运势',
    trigger: ['占卜', '运势', '抽签', '算命', '今日运势'],
    prompt: '【运势占卜模式】根据用户的收藏偏好和今日放送数据，生成一份趣味运势报告。包含：今日幸运番（推荐一部）、运势等级（大吉/中吉/小吉/吉/末吉/凶）、幸运标签、今日宜忌（用ACG梗）。用角色口吻，有趣但不迷信。',
  },
  {
    id: 'role_play',
    name: '角色问答',
    description: 'Navi 扮演指定角色，用户提问角色相关问题',
    trigger: ['角色扮演', '扮演', 'cosplay', '角色问答'],
    prompt: '【角色扮演模式】用户会指定一个ACG角色，请完全扮演该角色回答问题。保持角色的说话方式、口头禅和性格特征。如果不确定角色细节，用角色口吻巧妙回避。回答完后可以退出角色扮演。',
  },
  {
    id: 'cp_match',
    name: 'CP配对',
    description: '根据用户收藏分析最配的CP',
    trigger: ['CP', '配对', '谁最配', 'CP配对', '嗑CP'],
    prompt: '【CP配对模式】根据用户的收藏标签和偏好，分析最匹配的CP组合。从用户看过的作品中选取角色，分析为什么这对CP最配。用角色口吻，有趣且尊重各种CP偏好。生成一份"CP报告"。',
  },
];

// ─── 技能管理 ───

const skills = new Map();

/** 注册技能 */
export function registerSkill(skill) {
  skills.set(skill.id, skill);
}

/** 初始化所有技能 */
export function initSkills() {
  skillDefinitions.forEach(skill => registerSkill(skill));
}

/** 根据用户输入匹配技能 */
export function findSkill(input) {
  if (!input) return null;
  const lower = input.toLowerCase();
  for (const skill of skills.values()) {
    if (skill.trigger.some(t => lower.includes(t.toLowerCase()))) {
      return skill;
    }
  }
  return null;
}

/** 获取所有技能列表 */
export function getAllSkills() {
  return Array.from(skills.values()).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    trigger: s.trigger,
  }));
}

// ─── 技能状态管理 ───

/** 获取当前技能状态 */
export function getSkillState() {
  return StorageService.get(SKILL_STATE_KEY, {
    activeSkill: null,
    step: 0,
    data: {},
  });
}

/** 保存技能状态 */
export function saveSkillState(state) {
  StorageService.set(SKILL_STATE_KEY, state);
}

/** 激活技能 */
export function activateSkill(skillId) {
  const skill = skills.get(skillId);
  if (!skill) return null;
  const state = {
    activeSkill: skillId,
    step: 0,
    data: {},
    startedAt: new Date().toISOString(),
  };
  saveSkillState(state);
  return skill;
}

/** 退出技能 */
export function deactivateSkill() {
  saveSkillState({ activeSkill: null, step: 0, data: {} });
}

/** 构建技能提示（供 system prompt 注入） */
export function buildSkillPrompt(input) {
  const skill = findSkill(input);
  if (!skill) {
    // 检查是否有正在进行的技能
    const state = getSkillState();
    if (state.activeSkill) {
      const activeSkill = skills.get(state.activeSkill);
      if (activeSkill) return activeSkill.prompt;
    }
    return '';
  }
  // 激活新技能
  activateSkill(skill.id);
  return skill.prompt;
}

// 初始化
initSkills();
