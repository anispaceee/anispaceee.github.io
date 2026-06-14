// src/services/HitokotoService.js
// 主数据源：Animechan（高质量动漫台词，含角色+作品名）
// 降级数据源：一言 Hitokoto（国内可达，质量一般）
// 最终降级：硬编码经典台词

const ANIMECHAN_ENDPOINT = 'https://api.animechan.io/v1/quotes/random';
const HITOKOTO_ENDPOINT = 'https://v1.hitokoto.cn/';
const CACHE_KEY = 'anispace_anime_quotes_cache';
const CACHE_SIZE = 30;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时

// 硬编码经典台词作为最终降级
const FALLBACK_QUOTES = [
  { id: 'f1', text: '不管前方的路有多苦，只要走的方向正确，不管多么崎岖不平，都比站在原地更接近幸福。', from: '千与千寻', fromWho: '宫崎骏', source: 'fallback' },
  { id: 'f2', text: '我一定会回来的！', from: '名侦探柯南', fromWho: '灰原哀', source: 'fallback' },
  { id: 'f3', text: '只要你不放弃，奇迹就一定会发生。', from: '火影忍者', fromWho: '漩涡鸣人', source: 'fallback' },
  { id: 'f4', text: '这个世界是残酷的，但也是美丽的。', from: '进击的巨人', fromWho: '艾伦·耶格尔', source: 'fallback' },
  { id: 'f5', text: '错的不是我，是这个世界。', from: '反叛的鲁路修', fromWho: '鲁路修', source: 'fallback' },
  { id: 'f6', text: '无论何时，无论何地，我都会在你身边。', from: '你的名字', fromWho: '宫水三叶', source: 'fallback' },
  { id: 'f7', text: '即使世界背叛了你，我也会站在你身后背叛全世界。', from: '叛逆的鲁路修', fromWho: 'C.C.', source: 'fallback' },
  { id: 'f8', text: '只要有想见的人，就不再是孤身一人了。', from: '夏目友人帐', fromWho: '夏目贵志', source: 'fallback' },
  { id: 'f9', text: '不要低头，既然有必须做的事，就只看着前方。', from: '钢之炼金术师', fromWho: '罗伊·马斯坦', source: 'fallback' },
  { id: 'f10', text: '所谓长大，就是把原本看重的东西看轻一点，原本看轻的东西看重一点。', from: '龙猫', fromWho: '宫崎骏', source: 'fallback' },
  { id: 'f11', text: '人生就像一盒巧克力，你永远不知道下一颗是什么味道。', from: '银魂', fromWho: '坂田银时', source: 'fallback' },
  { id: 'f12', text: '我可是资深拖延症患者啊！', from: '银魂', fromWho: '坂田银时', source: 'fallback' },
  { id: 'f13', text: '只要活着，总会找到出路的。', from: '海贼王', fromWho: '蒙奇·D·路飞', source: 'fallback' },
  { id: 'f14', text: '我要成为海贼王！', from: '海贼王', fromWho: '蒙奇·D·路飞', source: 'fallback' },
  { id: 'f15', text: '不管夜晚多么黑暗，黎明总会到来。', from: '进击的巨人', fromWho: '阿尔敏', source: 'fallback' },
  { id: 'f16', text: '我们都在命运之湖上划船，各自寻找着属于自己的答案。', from: '命运石之门', fromWho: '冈部伦太郎', source: 'fallback' },
  { id: 'f17', text: '这一切都是命运石之门的选择！', from: '命运石之门', fromWho: '冈部伦太郎', source: 'fallback' },
  { id: 'f18', text: '就算再痛苦，只要活着，好事一定会发生。', from: '四月是你的谎言', fromWho: '宫园薰', source: 'fallback' },
  { id: 'f19', text: '或许前路永夜，即便如此我也要前进。', from: '四月是你的谎言', fromWho: '有马公生', source: 'fallback' },
  { id: 'f20', text: '人如果没有梦想，那和咸鱼有什么区别？', from: '灌篮高手', fromWho: '樱木花道', source: 'fallback' },
  { id: 'f21', text: '教练，我想打篮球！', from: '灌篮高手', fromWho: '三井寿', source: 'fallback' },
  { id: 'f22', text: '真相永远只有一个！', from: '名侦探柯南', fromWho: '江户川柯南', source: 'fallback' },
  { id: 'f23', text: '我是要成为火影的男人！', from: '火影忍者', fromWho: '漩涡鸣人', source: 'fallback' },
  { id: 'f24', text: '不管你有多厉害，总有比你更强的人。', from: '龙珠', fromWho: '孙悟空', source: 'fallback' },
  { id: 'f25', text: '我的征途是星辰大海。', from: '银河英雄传说', fromWho: '莱因哈特', source: 'fallback' },
  { id: 'f26', text: '不要停止奔跑，不要回顾来路，来路无可眷恋，值得期待的只有前方。', from: '鬼灭之刃', fromWho: '灶门炭治郎', source: 'fallback' },
  { id: 'f27', text: '即使被绝望所困，也要向前迈进。', from: '咒术回战', fromWho: '虎杖悠仁', source: 'fallback' },
  { id: 'f28', text: '我回来了。', from: '龙猫', fromWho: '草壁梅', source: 'fallback' },
  { id: 'f29', text: '世界是美丽的，即便它充满了悲伤和泪水。', from: 'CLANNAD', fromWho: '冈崎朋也', source: 'fallback' },
  { id: 'f30', text: '能哭的地方只有厕所和爸爸的怀里。', from: 'CLANNAD', fromWho: '冈崎汐', source: 'fallback' },
];

export const HitokotoService = {
  _cache: [],
  _cacheIndex: 0,

  async fetchQuotes() {
    let quotes = [];

    // 优先尝试 Animechan（高质量，约10条）
    try {
      const animechanQuotes = await this._fetchAnimechan();
      if (animechanQuotes.length > 0) {
        quotes.push(...animechanQuotes);
      }
    } catch { /* Animechan 失败 */ }

    // 用一言补充到30条（限速请求）
    if (quotes.length < CACHE_SIZE) {
      try {
        const hitokotoQuotes = await this._fetchHitokoto(CACHE_SIZE - quotes.length);
        if (hitokotoQuotes.length > 0) {
          const existingTexts = new Set(quotes.map(q => q.text));
          const newQuotes = hitokotoQuotes.filter(q => !existingTexts.has(q.text));
          quotes.push(...newQuotes);
        }
      } catch { /* 一言也失败 */ }
    }

    // 用硬编码台词补充
    if (quotes.length < CACHE_SIZE) {
      const existingTexts = new Set(quotes.map(q => q.text));
      const fallback = FALLBACK_QUOTES.filter(q => !existingTexts.has(q.text));
      quotes.push(...fallback);
    }

    // 截取到目标数量
    quotes = quotes.slice(0, CACHE_SIZE);

    if (quotes.length > 0) {
      this._cache = quotes;
      this._cacheIndex = 0;
      this._saveCache(quotes);
      return quotes;
    }

    // 最后尝试 localStorage 缓存
    return this._loadCache();
  },

  async _fetchAnimechan() {
    // Animechan 免费版 5次/小时，只请求2个动漫避免超限
    const popularAnime = [
      'Naruto', 'One Piece', 'Attack on Titan', 'Death Note',
      'Fullmetal Alchemist', 'Steins;Gate', 'Cowboy Bebop',
      'Neon Genesis Evangelion', 'Code Geass', 'Gintama',
      'Hunter x Hunter', 'Demon Slayer', 'Jujutsu Kaisen',
      'Your Lie in April', 'Sword Art Online', 'Tokyo Ghoul',
      'Mob Psycho 100', 'Vinland Saga', 'Spy x Family',
      'Chainsaw Man', 'Bleach', 'Dragon Ball',
    ];

    const shuffled = popularAnime.sort(() => Math.random() - 0.5).slice(0, 2);

    const allQuotes = [];
    for (const anime of shuffled) {
      try {
        const res = await fetch(`https://api.animechan.io/v1/quotes?anime=${encodeURIComponent(anime)}`);
        if (!res.ok) continue;
        const data = await res.json();
        const items = data?.data || data || [];
        if (Array.isArray(items)) allQuotes.push(...items);
      } catch { /* skip */ }
    }

    if (allQuotes.length === 0) return [];

    const seen = new Set();
    const unique = allQuotes.filter(q => {
      const key = q.content || q.quote || '';
      if (seen.has(key) || !key) return false;
      seen.add(key);
      return true;
    });

    return unique.map(q => ({
      id: q.id || Math.random().toString(36).slice(2),
      text: q.content || q.quote || '',
      from: q.anime?.name || q.anime || '',
      fromWho: q.character?.name || q.character || '',
      source: 'animechan',
    }));
  },

  async _fetchHitokoto(needCount) {
    // 一言2QPS限制，分批请求
    const batchSize = 2;
    const items = [];
    for (let batch = 0; batch < Math.ceil(needCount / batchSize); batch++) {
      const batchPromises = [];
      for (let j = 0; j < batchSize && items.length + batchPromises.length < needCount; j++) {
        batchPromises.push(
          fetch(`${HITOKOTO_ENDPOINT}?c=a&encode=json`)
            .then(res => {
              if (!res.ok) throw new Error('Hitokoto fetch failed');
              return res.json();
            })
            .catch(() => null)
        );
      }
      if (batch > 0) {
        await new Promise(r => setTimeout(r, 600));
      }
      const results = await Promise.allSettled(batchPromises);
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          items.push(r.value);
        }
      }
      // 如果这批全部失败，停止请求
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
      if (successCount === 0) break;
    }

    return items.map(item => ({
      id: item.id,
      text: item.hitokoto,
      from: item.from,
      fromWho: item.from_who,
      source: 'hitokoto',
    }));
  },

  _saveCache(quotes) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: quotes,
        timestamp: Date.now(),
      }));
    } catch { /* ignore */ }
  },

  _loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      const cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY);
        return [];
      }
      this._cache = cached.data || [];
      this._cacheIndex = 0;
      return this._cache;
    } catch {
      return [];
    }
  },

  getRandomHitokoto() {
    if (this._cache.length === 0) return null;
    const idx = Math.floor(Math.random() * this._cache.length);
    return this._cache[idx];
  },

  getUniqueHitokotos(count) {
    if (this._cache.length === 0) return [];
    const shuffled = [...this._cache].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  },

  getNextHitokoto() {
    if (this._cache.length === 0) return null;
    if (this._cacheIndex >= this._cache.length) {
      this._cacheIndex = 0;
    }
    return this._cache[this._cacheIndex++];
  },

  async ensureCache() {
    if (this._cache.length === 0) {
      const cached = this._loadCache();
      if (cached.length > 0) return;
      await this.fetchQuotes();
    }
  },
};
