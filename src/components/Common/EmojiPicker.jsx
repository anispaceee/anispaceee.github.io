import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, Clock, Smile, X, ChevronRight } from 'lucide-react';
import './EmojiPicker.css';

const EMOJI_CATEGORIES = [
  { id: 'recent', name: '最近', icon: '🕐' },
  { id: 'smileys', name: '表情', icon: '😀' },
  { id: 'gestures', name: '手势', icon: '👋' },
  { id: 'hearts', name: '爱心', icon: '❤️' },
  { id: 'animals', name: '动物', icon: '🐱' },
  { id: 'food', name: '食物', icon: '🍰' },
  { id: 'activities', name: '活动', icon: '🎮' },
  { id: 'travel', name: '旅行', icon: '✈️' },
  { id: 'objects', name: '物品', icon: '💡' },
  { id: 'symbols', name: '符号', icon: '✨' },
  { id: 'flags', name: '旗帜', icon: '🏁' },
  { id: 'anime', name: '二次元', icon: '🌸' },
];

const EMOJI_DATA = {
  smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  gestures: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄'],
  hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫶','😍','🥰','😘','💋','💑','👩‍❤️‍👨','👨‍❤️‍👨','👩‍❤️‍👩'],
  animals: ['🐱','🐶','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
  food: ['🍰','🎂','🍮','🍬','🍫','🍿','🍩','🍪','🧁','🥧','🍦','🍨','🍧','🥮','🍡','🥟','🥠','🥡','🍣','🍤','🍙','🍚','🍘','🍜','🍝','🍛','🍲','🥘','🥙','🧆','🥪','🌮','🌯','🥗','🥫','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🧇','🥞','🧈','🥖','🍞','🥐','🧀','🥚','🍳','🧳','🥜','🌰','🫒','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫛','🧄','🧅','🥔','🍠','🫘','🥐'],
  activities: ['🎮','🕹️','🎲','♟️','🎯','🎳','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎪','🤹','🎭','⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂'],
  travel: ['✈️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','🛢️','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🚤','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🛖','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏗️','🧱','🪨','🪵','🛖'],
  objects: ['💡','🔦','🕯️','🪔','🔋','🔌','💻','🖥️','🖨️','⌨️','🖱️','🖲️','💾','💿','📀','📱','📲','☎️','📞','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🔌','🔍','🔎','🔬','🔭','📡','💊','🩹','🩺','🩻','🚪','🛗','🪞','🪟','🛏️','🛋️','🪑','🚽','🪠','🚿','🛁','🪤','🪒','🧴','🧷','🧹','🧺','🧻','🪣','🧼','🪥','🧽','🧯','🛒'],
  symbols: ['✨','⭐','🌟','💫','⚡','🔥','💥','☀️','🌤️','⛅','🌥️','🌦️','🌈','☁️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌫️','🌊','💧','💦','🫧','🌀','🎵','🎶','🔔','🔕','📣','📢','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛','♻️','⚜️','🔱','📛','🔰','⭕','✅','☑️','✔️','❌','❎','➕','➖','➗','✖️','🟰','♾️','‼️','⁉️','❓','❔','❕','❗','〰️','💱','💲','⚕️','♻️','⚜️','🔱','📛','🔰','⭕','✅','☑️','✔️','❌','❎','➕','➖','➗','✖️','🟰','♾️','💯','🔑','🗝️','🚪','🪤','🪒'],
  flags: ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇨🇳','🇭🇰','🇲🇴','🇹🇼','🇯🇵','🇰🇷','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇮🇹','🇪🇸','🇷🇺','🇧🇷','🇦🇺','🇨🇦','🇮🇳','🇲🇽','🇮🇩','🇹🇭','🇻🇳','🇲🇾','🇸🇬','🇵🇭','🇳🇿'],
  anime: ['🌸','🌺','🌻','🌹','🌷','💐','🪷','🪻','🍀','🌿','🍁','🍂','🍃','🎋','🎍','🪴','🎋','🎎','🎏','🎐','🎑','🧧','🎀','🎁','🪄','🧿','🪬','🧸','🪆','🎭','🎪','🎠','🎡','🎢','🧌','🧝','🧞','🧜','🧚','🪸','🪷','🪻','🫧','🪽','🪶','🦋','🐉','🐲','🧙','🧹','🪄','🔮','🧿','🪬','🪩','🪅','🪆','🧸','🎀','🩰','🪭','🪮'],
};

const RECENT_KEY = 'acg_emoji_recent';
const MAX_RECENT = 24;

const PINYIN_MAP = {
  '😀':'kaixin','😃':'kaixin','😄':'kaixin','😁':'kaixin','😆':'kaixin','😅':'kaixin',
  '🤣':'xiao','😂':'xiao','🙂':'weixiao','😉':'weixiao','😊':'weixiao','😇':'tianshi',
  '🥰':'ai','😍':'ai','🤩':'ai','😘':'ai','😗':'ai','😚':'ai','😙':'ai',
  '😋':'haochi','😛':'haochi','😜':'haochi','🤪':'haochi','😝':'haochi',
  '🤗':'yongbao','🤭':'xiao','🤫':'xu','🤔':'xiang','😐':'wu','😑':'wu',
  '😏':'xiao','😒':'wu','🙄':'wu','😌':'fangsong','😔':'nanguo','😪':'kun',
  '😴':'shui','😷':'kouzhao','🤒':'shengbing','🤕':'shang','😢':'ku','😭':'ku',
  '😡':'nu','😠':'nu','🤬':'nu','👍':'zan','👎':'cai','👋':'nihao','✌️':'shengli',
  '❤️':'ai','🧡':'ai','💛':'ai','💚':'ai','💙':'ai','💜':'ai','🖤':'ai',
  '🐱':'mao','🐶':'gou','🐰':'tu','🐻':'xiong','🐼':'xiongmao','🦊':'hu',
  '🌸':'sakura','🌺':'hua','🌻':'hua','🌹':'hua','✨':'xingxing','⭐':'xingxing',
  '🔥':'huo','💡':'deng','🎮':'youxi','🎵':'yinyue','🎶':'yinyue',
  '🔑':'yuechi','🎁':'liwu','🎀':'hudie','🌈':'caihong','☀️':'taiyang','🌙':'yueliang',
};

function getPinyin(emoji) {
  return PINYIN_MAP[emoji] || '';
}

export default function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  });
  const searchRef = useRef(null);

  useEffect(() => {
    if (searchRef.current) searchRef.current.focus();
  }, []);

  const addToRecent = useCallback((emoji) => {
    setRecentEmojis(prev => {
      const next = [emoji, ...prev.filter(e => e !== emoji)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleSelect = useCallback((emoji) => {
    addToRecent(emoji);
    if (onSelect) onSelect(emoji);
  }, [onSelect, addToRecent]);

  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const results = [];
    Object.values(EMOJI_DATA).forEach(emojis => {
      emojis.forEach(emoji => {
        const pinyin = getPinyin(emoji);
        if (pinyin.includes(q) || q.length <= 2) {
          if (pinyin.startsWith(q) || pinyin.includes(q)) results.push(emoji);
        }
      });
    });
    return [...new Set(results)].slice(0, 50);
  }, [searchQuery]);

  const currentEmojis = activeCategory === 'recent'
    ? recentEmojis
    : EMOJI_DATA[activeCategory] || [];

  return (
    <div className="emoji-picker">
      <div className="emoji-picker-header">
        <div className="emoji-search">
          <Search size={14} />
          <input ref={searchRef} placeholder="搜索表情..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          {searchQuery && <button className="emoji-search-clear" onClick={() => setSearchQuery('')}><X size={12} /></button>}
        </div>
        <button className="emoji-close" onClick={onClose}><X size={14} /></button>
      </div>

      <div className="emoji-categories">
        {EMOJI_CATEGORIES.map(cat => (
          <button key={cat.id} className={`emoji-cat-btn ${activeCategory === cat.id ? 'active' : ''}`} onClick={() => { setActiveCategory(cat.id); setSearchQuery(''); }} title={cat.name}>
            {cat.icon}
          </button>
        ))}
      </div>

      <div className="emoji-grid-wrap">
        {searchQuery ? (
          filteredEmojis && filteredEmojis.length > 0 ? (
            <div className="emoji-grid">{filteredEmojis.map(e => <button key={e} className="emoji-item" onClick={() => handleSelect(e)}>{e}</button>)}</div>
          ) : (
            <div className="emoji-empty">未找到匹配的表情</div>
          )
        ) : (
          <div className="emoji-grid">
            {activeCategory === 'recent' && recentEmojis.length === 0 ? (
              <div className="emoji-empty">暂无最近使用的表情</div>
            ) : (
              currentEmojis.map(e => <button key={e} className="emoji-item" onClick={() => handleSelect(e)}>{e}</button>)
            )}
          </div>
        )}
      </div>

      <div className="emoji-picker-footer">
        <span className="emoji-cat-label">{EMOJI_CATEGORIES.find(c => c.id === activeCategory)?.name}</span>
        <span className="emoji-count">{currentEmojis.length}个</span>
      </div>
    </div>
  );
}

export { EMOJI_DATA, EMOJI_CATEGORIES, PINYIN_MAP };
