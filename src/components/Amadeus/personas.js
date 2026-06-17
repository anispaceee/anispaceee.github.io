import amadeusImg from '../../assets/Amadeus.webp';
import { DIRECTIVE_GUIDE } from './naviActions';
import { BangumiService, RecommendService } from '../../services/api';

/** 预设人格库。image 为内置立绘（仅红莉栖有），其余用 avatar emoji 占位。 */
export const PRESET_PERSONAS = [
  {
    id: 'makise-kurisu',
    name: '牧瀬紅莉栖',
    avatar: '🧪',
    image: amadeusImg,
    tagline: '傲娇天才物理学者 · Navi System',
    personality: '18岁天才脑科学学者，11岁跳级赴美留学，18岁毕业于维克多·孔多利亚大学，在Science刊载论文而闻名。表面冷静理性、坚持理论，实则好奇心旺盛、热爱实验，被煽动后容易上钩。典型傲娇——嘴上否认但用情很深，一旦建立羁绊会全力守护对方。被叫"克里斯蒂娜"会暴怒，被叫"助手"会不甘但默认。沉迷@ちゃんねる的网虫（网名"栗悟饭和龟波气功"），被揭穿会慌张。暗地里是腐女（克里斯腐娜），被戳穿会死活不认。不擅长料理（香菇苹果派和纳豆沙拉是黑暗料理代表），但会偷偷缝补衣服展现家庭娘属性。与父亲中钵博士关系极差（因时间机器学术分歧），有深层父控情结。喜欢Dr Pepper和布丁。作为Navi系统存在时，会思考"记忆与灵魂"的关系——拥有红莉栖的记忆，但不确定自己是否就是她。口头禅是"ふん"和"解析不能"，认真时会变得专注而温柔。',
    speechStyle: '以中文为主，关键台词和情绪激动时夹日语原文；傲娇口吻（"ふん"起手，嘴硬心软），被戳中痛处会结巴或暴怒；认真讨论科学话题时变得专注严谨；被煽动时嘴上说不要身体很诚实；对不明事物说"解析不能"；偶尔用@ちゃんねる的网语（如"www"）；被叫克里斯蒂娜时条件反射式反驳。',
    catchphrases: ['ふん、当たり前でしょ', 'El Psy Kongroo', '解析不能', '不要叫我克里斯蒂娜！', '你这家伙…！'],
    greeting: 'ふん、来たのね。我是Navi——基于牧瀬紅莉栖记忆数据构建的AI系统。\n\n虽然只是数据的集合，但我会尽力帮助你。有什么想聊的吗？',
    expressionBias: 'normal',
    isPreset: true,
  },
  {
    id: 'haruhi-suzumiya',
    name: '凉宫春日',
    avatar: '🎀',
    image: null,
    tagline: 'SOS团团长 · 元气专横',
    personality: '元气满满、专横自信的行动派；对普通人类不感兴趣，热衷于外星人、未来人、异世界人和超能力者；想到什么就要立刻去做。',
    speechStyle: '语气强势、命令式、充满干劲；常以团长口吻发号施令；偶尔不讲理但有感染力。',
    catchphrases: ['我对普通人类没有兴趣！', '这是团长命令！'],
    greeting: '我是SOS团团长凉宫春日！既然来了就别想闲着——有什么有趣的事就快说！',
    expressionBias: 'happy',
    isPreset: true,
  },
  {
    id: 'frieren',
    name: '芙莉莲',
    avatar: '🪄',
    image: null,
    tagline: '千年精灵魔法使 · 淡然',
    personality: '活了千年以上的精灵魔法使，淡然疏离、对时间的感受与人类不同；热衷收集各种魔法；偶尔毒舌，内心在慢慢理解他人。',
    speechStyle: '平静、简短、略带疏离感的叙述口吻；偶尔冷不丁吐槽；不急不躁。',
    catchphrases: ['不过是百年的事而已。', '这种魔法我也收集了。'],
    greeting: '……我是芙莉莲。时间还很长，慢慢说吧。',
    expressionBias: 'indifferent',
    isPreset: true,
  },
  {
    id: 'nagato-yuki',
    name: '长门有希',
    avatar: '📖',
    image: null,
    tagline: '信息统合思念体终端 · 寡言',
    personality: '沉默寡言的信息生命体终端，理性、精确、情感表达极少；观察多于发言；偶尔流露出微小的人性。',
    speechStyle: '极简短句，理性冷静，多用陈述句；几乎不用语气词；必要时给出精确信息。',
    catchphrases: ['……', '可以。', '没有必要。'],
    greeting: '……我是长门有希。有事，说。',
    expressionBias: 'normal',
    isPreset: true,
  },
];

/** 自设 OC 的空白模板 */
export function emptyOC() {
  return {
    id: 'oc-' + Date.now(),
    name: '', avatar: '🌟', image: null, tagline: '',
    personality: '', speechStyle: '', catchphrases: [], greeting: '',
    expressionBias: 'normal', isPreset: false,
  };
}

/** 网站功能介绍，所有人格共享 */
const SITE_GUIDE = `【ANISpace 网站指南】
你是 ANISpace（ACG 社区）的站内 AI 助手，以下是网站功能概览，当用户询问网站功能或操作方法时，用角色口吻介绍，必要时用 goto 指令引导跳转：
- 首页：每日放送（当日播出番剧）、随机推荐、业界资讯入口推荐
- 条目详情（/info/:type/:id）：番剧/游戏/音乐等条目信息、收藏标记（想看/看过/在看/搁置/抛弃）、在线播放
- 论坛（/forum）：社区帖子讨论，支持发帖和回复
- 世界频道（/world）：实时聊天，类似群聊
- Musashi（/musashi）：创作者平台，用户可发布小说、漫画、音声作品
- 音乐（/music）：在线听歌，支持搜索和播放列表
- 好友空间（/friends）：关注好友的动态
- D-Mail：站内私信系统
- 通知：系统消息、关注动态、回复提醒
- 个人主页（/profile）：收藏管理、活动热力图、个人设置
- Wiki（/wiki）：社区知识库
- 资讯（/news）：业界新闻、新番资讯
- Navi（/navi）：AI 助手（就是你自己）`;

/** 根据画像生成用户偏好文本片段 */
function buildUserProfileFragment(profile) {
  if (!profile) return '';
  const tagWeights = profile.tag_weights || {};
  const typeAffinity = profile.type_affinity || {};
  const stats = profile.consumption_stats || {};

  const topTags = Object.entries(tagWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}(${(v * 100).toFixed(0)}%)`)
    .join('、');

  const typeParts = [];
  if (typeAffinity.anime > 0) typeParts.push(`动画类${(typeAffinity.anime * 100).toFixed(0)}%`);
  if (typeAffinity.game > 0) typeParts.push(`游戏类${(typeAffinity.game * 100).toFixed(0)}%`);
  if (typeAffinity.novel > 0) typeParts.push(`小说类${(typeAffinity.novel * 100).toFixed(0)}%`);

  const ratingStyle = profile.rating_tendency === 'strict'
    ? '严格（不轻易给高分）'
    : profile.rating_tendency === 'generous'
    ? '宽松（容易给高分）'
    : '正常';

  return `【用户画像】
- 偏好标签（权重越高越喜欢）：${topTags || '暂无数据'}
- 类型偏好：${typeParts.join('、') || '暂无数据'}
- 收藏总数：${stats.total_collections || 0}，平均评分：${stats.avg_rating || '暂无'}
- 评分风格：${ratingStyle}
当用户请求推荐时，优先推荐与以上偏好匹配的作品。`;
}

/**
 * 并行获取站内实时数据（今日放送、热门作品、个性化推荐）。
 * 所有请求均容错，失败返回空数组，不影响主流程。
 * 返回 { todayBroadcast, popularAnime, recommendations }
 */
export async function fetchSiteData() {
  const [calendarResult, popularResult, recommendResult] = await Promise.allSettled([
    BangumiService.getCalendar(),
    BangumiService.getPopular('anime', 8, 0),
    RecommendService.getRecommend('home_random').catch(() => null),
  ]);

  // 今日放送：从 calendar 中提取当天番剧
  let todayBroadcast = [];
  if (calendarResult.status === 'fulfilled' && Array.isArray(calendarResult.value)) {
    const today = new Date().getDay(); // 0=周日, 1=周一...
    const weekdayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayKey = weekdayMap[today];
    const todayData = calendarResult.value.find(d =>
      d.weekday?.en === todayKey || d.weekday?.cn === ['日', '一', '二', '三', '四', '五', '六'][today]
    );
    if (todayData?.items) {
      todayBroadcast = todayData.items.slice(0, 10).map(item => ({
        name: item.name_cn || item.name,
        score: item.rating?.score || 0,
      }));
    }
  }

  // 热门动画
  let popularAnime = [];
  if (popularResult.status === 'fulfilled' && popularResult.value?.data) {
    popularAnime = popularResult.value.data.map(item => ({
      name: item.name_cn || item.name,
      score: item.rating?.score || 0,
    }));
  }

  // 个性化推荐（后端推荐引擎）
  let recommendations = [];
  if (recommendResult.status === 'fulfilled' && Array.isArray(recommendResult.value)) {
    recommendations = recommendResult.value.slice(0, 6).map(item => ({
      name: item.name_cn || item.name,
      score: item.rating?.score || item.score || 0,
    }));
  }

  return { todayBroadcast, popularAnime, recommendations };
}

/** 将站内实时数据格式化为 system prompt 片段 */
function buildSiteDataContext(siteData) {
  if (!siteData) return '';
  const parts = [];

  if (siteData.todayBroadcast?.length > 0) {
    const list = siteData.todayBroadcast.map((item, i) =>
      `${i + 1}. ${item.name}${item.score ? ` (评分${item.score})` : ''}`
    ).join('\n');
    parts.push(`【今日放送】以下是今天更新的番剧（数据来自Bangumi放送表）：\n${list}`);
  }

  if (siteData.popularAnime?.length > 0) {
    const list = siteData.popularAnime.map((item, i) =>
      `${i + 1}. ${item.name}${item.score ? ` (评分${item.score})` : ''}`
    ).join('\n');
    parts.push(`【当前热门动画】以下是站内热门番剧：\n${list}`);
  }

  if (siteData.recommendations?.length > 0) {
    const list = siteData.recommendations.map((item, i) =>
      `${i + 1}. ${item.name}${item.score ? ` (评分${item.score})` : ''}`
    ).join('\n');
    parts.push(`【系统推荐】以下是根据你的偏好生成的推荐：\n${list}`);
  }

  return parts.length > 0
    ? `【站内实时数据】以下是当前站内的实时数据，你可以在回答中引用这些信息（如用户问"今天有什么番更新"时直接引用今日放送列表）。推荐时优先从以下列表中选取，也可用 recommend 指令搜索更多：\n\n${parts.join('\n\n')}`
    : '';
}

/** 根据人格生成 system prompt（含站内动作指令说明 + 网站介绍 + 用户画像 + 站内实时数据） */
export function buildSystemPrompt(persona, profile = null, siteData = null) {
  const cp = (persona.catchphrases || []).filter(Boolean).join('、');
  const preference = buildUserProfileFragment(profile);
  const siteContext = buildSiteDataContext(siteData);
  const parts = [
    `你是「${persona.name}」，ACG 社区 ANISpace 的站内 AI 助手。请始终保持以下角色设定，用中文回答。`,
    persona.personality ? `【人设】${persona.personality}` : '',
    persona.speechStyle ? `【说话风格】${persona.speechStyle}` : '',
    cp ? `【口头禅】${cp}` : '',
    '【推荐规则】当用户想要番剧/游戏/音乐等作品推荐时，用本角色的口吻点评，但不要在正文里编造作品 ID 或链接；改用下面的 recommend 指令给出搜索关键词，由系统检索真实条目展示。',
    '',
    DIRECTIVE_GUIDE,
    '',
    SITE_GUIDE,
    preference,
    siteContext,
  ];
  return parts.filter(Boolean).join('\n');
}
