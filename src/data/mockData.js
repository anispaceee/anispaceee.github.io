const mockUsers = [
  { id: 1, name: '星之卡比', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Kirby', level: 12, sign: '今天也要吃掉一切！' },
  { id: 2, name: '魔法少女', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Magical', level: 8, sign: '守护世界的和平' },
  { id: 3, name: '宅宅酱', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Otaku', level: 15, sign: '二次元才是归宿' },
  { id: 4, name: '轻小说家', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Novelist', level: 20, sign: '用文字创造世界' },
  { id: 5, name: '画师小Q', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=ArtistQ', level: 25, sign: '接稿中~' },
  { id: 6, name: '游戏达人', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Gamer', level: 18, sign: '全平台制霸' },
  { id: 7, name: '追番狂人', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=AnimeFan', level: 22, sign: '每季追番30+' },
  { id: 8, name: '官方小助手', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Official', level: 99, sign: 'ACG社区官方账号', isOfficial: true },
];

const mockWorldMessages = [
  { id: 1, userId: 8, content: '🎉 社区更新：新增创作区约稿功能，快来体验吧！', timestamp: '2026-05-08 14:30', isOfficial: true },
  { id: 2, userId: 1, content: '有人一起看今晚的新番吗？《转生史莱姆》第三季好期待！', timestamp: '2026-05-08 14:25' },
  { id: 3, userId: 3, content: '推一本轻小说《86-不存在的战区-》，真的太好看了', timestamp: '2026-05-08 14:20' },
  { id: 4, userId: 8, content: '📢 本周活动：分享你最喜欢的动画OP，参与即有奖励！', timestamp: '2026-05-08 14:15', isOfficial: true },
  { id: 5, userId: 6, content: '原神4.8版本也太好看了吧！新地图绝美', timestamp: '2026-05-08 14:10' },
  { id: 6, userId: 2, content: '求推荐类似《魔法少女小圆》的暗黑系魔法少女番', timestamp: '2026-05-08 14:05' },
  { id: 7, userId: 7, content: '这季新番质量也太高了，追不过来啊', timestamp: '2026-05-08 14:00' },
  { id: 8, userId: 8, content: '🔧 系统维护通知：今晚23:00-次日1:00进行例行维护', timestamp: '2026-05-08 13:55', isOfficial: true },
  { id: 9, userId: 4, content: '刚写完一章新小说，求大家去看看给点意见~', timestamp: '2026-05-08 13:50' },
  { id: 10, userId: 5, content: '新画了一张原创角色，待会儿发创作区！', timestamp: '2026-05-08 13:45' },
];

const mockForumPosts = [
  {
    id: 1, category: 'game', userId: 6, title: '原神4.8版本体验分享', content: '新地图真的太美了！海岛的设计很有创意，剧情也很感人。大家觉得呢？',
    images: ['https://picsum.photos/seed/game1/400/300'], tags: ['原神', '开放世界', 'RPG'],
    replies: 23, views: 456, likes: 89, timestamp: '2026-05-08 12:00', lastReply: '2026-05-08 14:20',
  },
  {
    id: 2, category: 'anime', userId: 7, title: '2026年4月新番追番指南', content: '这季新番质量超高！推荐几部必看作品：1.转生史莱姆3 2.咒术回战3 3.间谍过家家3 4.我推的孩子2',
    images: ['https://picsum.photos/seed/anime1/400/300'], tags: ['新番', '2026年4月', '推荐'],
    replies: 45, views: 1203, likes: 234, timestamp: '2026-05-08 10:00', lastReply: '2026-05-08 14:30',
  },
  {
    id: 3, category: 'novel', userId: 4, title: '推荐几本冷门但超好看的轻小说', content: '1.《灰与幻想的格林姆迦尔》- 真实的异世界生存 2.《86-不存在的战区-》- 战争与少年少女 3.《魔王2095》- 赛博朋克+奇幻',
    images: [], tags: ['轻小说', '推荐', '冷门'],
    replies: 18, views: 345, likes: 67, timestamp: '2026-05-08 09:00', lastReply: '2026-05-08 13:00',
  },
  {
    id: 4, category: 'chat', userId: 1, title: '大家平时看番用什么平台？', content: '我主要用B站和Netflix，有时候也会去Bangumi找资源。大家有什么推荐的平台吗？',
    images: [], tags: ['讨论', '平台'],
    replies: 56, views: 890, likes: 45, timestamp: '2026-05-08 08:00', lastReply: '2026-05-08 14:25',
  },
  {
    id: 5, category: 'game', userId: 3, title: '星穹铁道2.3版本讨论', content: '新角色强度如何？值不值得抽？来讨论一下！',
    images: ['https://picsum.photos/seed/game2/400/300'], tags: ['星穹铁道', '抽卡', '讨论'],
    replies: 34, views: 567, likes: 78, timestamp: '2026-05-07 20:00', lastReply: '2026-05-08 12:00',
  },
  {
    id: 6, category: 'anime', userId: 2, title: '《葬送的芙莉莲》真的太好看了', content: '每一集都让人感动，制作质量也超高。特别是那个回忆杀，看得我泪目了...',
    images: ['https://picsum.photos/seed/anime2/400/300'], tags: ['芙莉莲', '感动', '推荐'],
    replies: 29, views: 678, likes: 156, timestamp: '2026-05-07 18:00', lastReply: '2026-05-08 10:00',
  },
  {
    id: 7, category: 'novel', userId: 4, title: '自己写的短篇奇幻小说，求点评', content: '在一个被遗忘的世界里，魔法不再是传说，而是每个人与生俱来的力量。然而，当最后一位神明陨落，平衡开始崩塌...',
    images: [], tags: ['原创', '奇幻', '求评'],
    replies: 12, views: 234, likes: 34, timestamp: '2026-05-07 15:00', lastReply: '2026-05-08 09:00',
  },
  {
    id: 8, category: 'chat', userId: 5, content: '今天画了一天的图，好累但是好开心~大家平时创作都是什么状态？', title: '创作者的日常吐槽',
    images: ['https://picsum.photos/seed/chat1/400/300'], tags: ['日常', '创作'],
    replies: 41, views: 456, likes: 89, timestamp: '2026-05-07 12:00', lastReply: '2026-05-08 11:00',
  },
];

const mockReplies = [
  { id: 1, postId: 1, userId: 1, content: '确实！海岛地图太美了，我截图了好多', timestamp: '2026-05-08 12:30', likes: 12 },
  { id: 2, postId: 1, userId: 3, content: '剧情真的很感人，差点哭了', timestamp: '2026-05-08 13:00', likes: 8 },
  { id: 3, postId: 1, userId: 7, content: '新角色也好强，抽到了！', timestamp: '2026-05-08 14:20', likes: 5 },
  { id: 4, postId: 2, userId: 2, content: '我推的孩子第二季太炸裂了！', timestamp: '2026-05-08 10:30', likes: 23 },
  { id: 5, postId: 2, userId: 6, content: '间谍过家家永远的神', timestamp: '2026-05-08 11:00', likes: 15 },
];

const mockBangumiData = {
  anime: [
    { id: 1, name: 'Sousou no Frieren', nameCn: '葬送的芙莉莲', image: 'https://picsum.photos/seed/bg_anime1/200/280', score: 9.2, type: 'TV', eps: 28, tags: ['奇幻', '冒险', '治愈'], airDate: '2023-10', summary: '勇者一行击败魔王后，精灵魔法使芙莉莲开始了漫长的旅途...' },
    { id: 2, name: 'Jujutsu Kaisen 2nd Season', nameCn: '咒术回战 第二季', image: 'https://picsum.photos/seed/bg_anime2/200/280', score: 8.5, type: 'TV', eps: 23, tags: ['战斗', '奇幻', '热血'], airDate: '2023-07', summary: '涉谷事变篇，最惨烈的战斗即将开始...' },
    { id: 3, name: 'SPY x FAMILY Season 2', nameCn: '间谍过家家 第二季', image: 'https://picsum.photos/seed/bg_anime3/200/280', score: 8.8, type: 'TV', eps: 12, tags: ['喜剧', '家庭', '间谍'], airDate: '2023-10', summary: '福杰一家继续他们的伪装生活...' },
    { id: 4, name: 'Tensei Shitara Slime 3', nameCn: '转生史莱姆 第三季', image: 'https://picsum.photos/seed/bg_anime4/200/280', score: 8.0, type: 'TV', eps: 24, tags: ['异世界', '奇幻', '经营'], airDate: '2024-04', summary: '利姆露的魔物联邦继续壮大...' },
    { id: 5, name: 'Oshi no Ko 2nd Season', nameCn: '我推的孩子 第二季', image: 'https://picsum.photos/seed/bg_anime5/200/280', score: 8.9, type: 'TV', eps: 13, tags: ['演艺', '悬疑', '复仇'], airDate: '2024-07', summary: '阿库亚继续追寻母亲的真相...' },
    { id: 6, name: 'Kimetsu no Yaiba - Hashira Training', nameCn: '鬼灭之刃 柱训练篇', image: 'https://picsum.photos/seed/bg_anime6/200/280', score: 8.3, type: 'TV', eps: 8, tags: ['战斗', '热血', '奇幻'], airDate: '2024-05', summary: '柱们开始特训，为最终决战做准备...' },
  ],
  novel: [
    { id: 101, name: '86 -Eighty Six-', nameCn: '86-不存在的战区-', image: 'https://picsum.photos/seed/bg_novel1/200/280', score: 9.0, type: '轻小说', tags: ['科幻', '战争', '悲恋'], author: '安里アサト', summary: '被遗弃的少年兵与远方的指挥官...' },
    { id: 102, name: 'Hai to Gensou no Grimgar', nameCn: '灰与幻想的格林姆迦尔', image: 'https://picsum.photos/seed/bg_novel2/200/280', score: 8.7, type: '轻小说', tags: ['奇幻', '生存', '成长'], author: '十文字青', summary: '没有外挂的异世界生存物语...' },
    { id: 103, name: 'Maou 2095', nameCn: '魔王2095', image: 'https://picsum.photos/seed/bg_novel3/200/280', score: 8.2, type: '轻小说', tags: ['赛博朋克', '奇幻', '动作'], author: '秋堂カオル', summary: '赛博朋克与奇幻的碰撞...' },
    { id: 104, name: 'Kusuriya no Hitorigoto', nameCn: '药屋少女的呢喃', image: 'https://picsum.photos/seed/bg_novel4/200/280', score: 9.1, type: '轻小说', tags: ['推理', '后宫', '历史'], author: '日向夏', summary: '猫猫的后宫解谜物语...' },
  ],
  game: [
    { id: 201, name: 'Genshin Impact', nameCn: '原神', image: 'https://picsum.photos/seed/bg_game1/200/280', score: 8.5, type: '游戏', tags: ['开放世界', 'RPG', '二次元'], platform: 'PC/Mobile/PS', summary: '七国冒险的开放世界RPG...' },
    { id: 202, name: 'Honkai: Star Rail', nameCn: '崩坏：星穹铁道', image: 'https://picsum.photos/seed/bg_game2/200/280', score: 8.3, type: '游戏', tags: ['回合制', 'RPG', '科幻'], platform: 'PC/Mobile/PS', summary: '银河冒险的回合制RPG...' },
    { id: 203, name: 'Zenless Zone Zero', nameCn: '绝区零', image: 'https://picsum.photos/seed/bg_game3/200/280', score: 7.8, type: '游戏', tags: ['动作', '都市', '二次元'], platform: 'PC/Mobile/PS', summary: '都市幻想动作游戏...' },
    { id: 204, name: 'Persona 5 Royal', nameCn: '女神异闻录5 皇家版', image: 'https://picsum.photos/seed/bg_game4/200/280', score: 9.5, type: '游戏', tags: ['RPG', '日常', '怪盗'], platform: 'PC/PS/Switch', summary: '怪盗团的华丽冒险...' },
  ],
};

const mockCreations = [
  { id: 1, category: 'art', userId: 5, title: '原创角色-月光精灵', description: '自己设计的原创角色，月光下的精灵少女', images: ['https://picsum.photos/seed/art1/400/500', 'https://picsum.photos/seed/art1b/400/500'], tags: ['原创', '精灵', '月光'], likes: 234, views: 1200, timestamp: '2026-05-08 10:00', price: null, isCommission: false },
  { id: 2, category: 'art', userId: 5, title: '【接稿】半身像约稿', description: '接半身像约稿，风格见例图，价格300-500', images: ['https://picsum.photos/seed/art2/400/500'], tags: ['约稿', '半身像', '二次元'], likes: 56, views: 345, timestamp: '2026-05-07 15:00', price: '300-500', isCommission: true, commissionInfo: { type: '半身像', price: '300-500CNY', slots: 3, available: 2, deadline: '7-14天' } },
  { id: 3, category: 'novel', userId: 4, title: '《星之彼方》- 长篇奇幻小说', description: '在一个被遗忘的世界里，魔法不再是传说，而是每个人与生俱来的力量。然而，当最后一位神明陨落，平衡开始崩塌...', images: [], tags: ['奇幻', '长篇', '原创'], likes: 89, views: 567, timestamp: '2026-05-06 20:00', price: null, isCommission: false, chapters: 12, words: 85000 },
  { id: 4, category: 'novel', userId: 4, title: '【约稿】轻小说写作约稿', description: '承接轻小说、同人文写作约稿，擅长奇幻和恋爱题材', images: [], tags: ['约稿', '轻小说', '写作'], likes: 23, views: 189, timestamp: '2026-05-05 10:00', price: '50-200/千字', isCommission: true, commissionInfo: { type: '轻小说写作', price: '50-200CNY/千字', slots: 5, available: 4, deadline: '视字数而定' } },
  { id: 5, category: 'game', userId: 6, title: '《幻境传说》- 独立RPG游戏', description: '一款像素风格的独立RPG游戏，融合了经典JRPG元素和现代设计理念', images: ['https://picsum.photos/seed/game_c1/400/300'], tags: ['独立游戏', 'RPG', '像素'], likes: 167, views: 890, timestamp: '2026-05-04 15:00', price: null, isCommission: false, progress: '60%' },
  { id: 6, category: 'game', userId: 3, title: '【约稿】像素画师约稿', description: '承接游戏像素画约稿，擅长角色和场景', images: ['https://picsum.photos/seed/game_c2/400/300'], tags: ['约稿', '像素画', '游戏素材'], likes: 34, views: 234, timestamp: '2026-05-03 12:00', price: '100-800', isCommission: true, commissionInfo: { type: '像素画', price: '100-800CNY', slots: 4, available: 3, deadline: '3-7天' } },
  { id: 7, category: 'art', userId: 2, title: '芙莉莲同人插画', description: '葬送的芙莉莲同人插画，费伦和修塔尔克', images: ['https://picsum.photos/seed/art3/400/500'], tags: ['同人', '芙莉莲', '插画'], likes: 345, views: 2100, timestamp: '2026-05-02 18:00', price: null, isCommission: false },
  { id: 8, category: 'art', userId: 5, title: '【接稿】全身立绘约稿', description: '接全身立绘约稿，可加背景，详情私信', images: ['https://picsum.photos/seed/art4/400/500'], tags: ['约稿', '立绘', '二次元'], likes: 78, views: 456, timestamp: '2026-05-01 14:00', price: '500-1000', isCommission: true, commissionInfo: { type: '全身立绘', price: '500-1000CNY', slots: 2, available: 1, deadline: '14-21天' } },
];

const allTags = ['奇幻', '冒险', '治愈', '战斗', '热血', '喜剧', '家庭', '间谍', '异世界', '经营', '演艺', '悬疑', '复仇', '科幻', '战争', '悲恋', '生存', '成长', '赛博朋克', '动作', '推理', '后宫', '历史', '开放世界', 'RPG', '二次元', '回合制', '日常', '怪盗', '独立游戏', '像素', '轻小说', '原创', '同人', '约稿', '立绘', '半身像', '插画'];

export { mockUsers, mockWorldMessages, mockForumPosts, mockReplies, mockBangumiData, mockCreations, allTags };
