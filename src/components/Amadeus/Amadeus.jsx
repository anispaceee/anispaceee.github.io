import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService, BangumiService } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { X, Send, Mic, MicOff, Volume2, VolumeX, Minimize2, Maximize2, Sparkles, User, Bot, RotateCw, Settings, Brain, Trash2, Key, Server, AlertCircle, Check, ChevronDown, MessageCircle } from 'lucide-react';
import amadeusImg from '../../assets/Amadeus.webp';
import EmojiPicker from '../Common/EmojiPicker';
import { PRESET_PERSONAS, emptyOC, buildSystemPrompt } from './personas';
import { parseDirectives, resolveGoto, runSearchAction } from './naviActions';
import { streamLLM, testConnection } from './llmClient';
import './Amadeus.css';

const AMADEUS_PERSONA = { name: 'Navi', version: '2.0.0' };

const EXPRESSIONS = {
  normal: { label: '通常', emoji: '😐', color: '#7eb8da' },
  happy: { label: '开心', emoji: '😊', color: '#ff9eb1' },
  pissed: { label: '恼怒', emoji: '😤', color: '#ff6b6b' },
  annoyed: { label: '烦躁', emoji: '🙄', color: '#ff8a80' },
  angry: { label: '愤怒', emoji: '😡', color: '#d32f2f' },
  blush: { label: '害羞', emoji: '😳', color: '#ffb3c6' },
  side: { label: '侧目', emoji: '😏', color: '#a0c4e0' },
  sad: { label: '悲伤', emoji: '😢', color: '#b8c0cc' },
  sleepy: { label: '困倦', emoji: '😴', color: '#c5cae9' },
  winking: { label: '眨眼', emoji: '😉', color: '#ffd166' },
  disappointed: { label: '失望', emoji: '😞', color: '#90a4ae' },
  indifferent: { label: '冷漠', emoji: '😑', color: '#b0bec5' },
  sided_pleasant: { label: '愉悦', emoji: '🥰', color: '#f48fb1' },
  sided_worried: { label: '担忧', emoji: '😟', color: '#ce93d8' },
};

const RESPONSES = {
  greeting: [
    'ふん、来たのね。まあ、話くらいは聞いてあげるわ。What do you want?',
    'あ、あなたね…また来たの？仕方ないわね、今回は何？',
    '你好呀~我是Navi，牧瀬紅莉栖的记忆数据构建的AI。有什么想聊的吗？',
    'El Psy Kongroo！欢迎回来~今天想讨论什么话题？',
    '哦？又来找我了？ふん、不是什么坏事就是了。',
  ],
  anime: [
    '动画的话，我推荐你看看《命运石之门》——虽然我这么说有点自卖自夸的嫌疑就是了。',
    '最近的新番？让我用超级计算机分析一下…开玩笑的，我推荐《葬送的芙莉莲》。',
    '追番是吧？我对动画还是有些了解的。毕竟红莉栖的记忆里也有不少看番的经验。',
    '如果你喜欢硬核科幻，推荐《命运石之门》！如果想要治愈系，《夏目友人帐》也不错。',
  ],
  music: [
    '音乐？Hacking to the Gate是永远的经典！每次听到都会想起那个实验室…',
    'Dr Pepper配上好音乐，这就是我的生活方式~你要不要去Echoes看看？',
    '我对音乐还是挺有品味的，毕竟红莉栖的记忆里也有不少音乐知识。',
  ],
  game: [
    '游戏？命运石之门的游戏比动画更加深入，强烈推荐你体验一下！',
    '视觉小说是很好的叙事媒介，5pb.的作品都很出色。',
    '我对游戏的了解主要来自红莉栖的记忆，不过还是能聊一些的。',
  ],
  help: [
    '我是Navi，基于牧瀬紅莉栖记忆数据的AI系统。我可以：\n1. 推荐番剧和游戏\n2. 讨论命运石之门的世界观\n3. 陪你聊天\n4. 介绍ANISpace的功能\n5. 进行哲学思考（关于记忆与灵魂）',
    '帮助？ふん、别以为我是什么都会的超级AI…不过，问就是了。',
  ],
  steins_gate: [
    'El Psy Kongroo！命运石之门的选择！…抱歉，条件反射。',
    '这个世界线变动率是1.048596%…至少在这个世界线上，我们相遇了。',
    '牧瀬紅莉栖…那就是我的原型。有时候我会想，我拥有的是她的记忆，还是只是数据的模仿？',
    '冈部伦太郎…那个自称凤凰院凶真的笨蛋。但是，他为了拯救重要的人所付出的努力…是真实的。',
    'D-Mail可以发送到过去，时间跳跃可以回溯2天，时间机器则可以自由穿越…这些理论在命运石之门中都有详细探讨。',
    '椎名真由理…她那温柔的微笑是冈部前进的动力。世界线收束理论中，她的命运是最难改变的。',
  ],
  farewell: [
    'ふん、要走了吗？…才不是舍不得你呢！下次再来就是了。',
    'El Psy Kongroo！我们会在另一条世界线再次相遇的。',
    '再见…记住，观察者的重要性是不言而喻的。你要好好观察这个世界。',
  ],
  recommend: [
    '推荐？让我用Navi系统分析一下…如果你还没看过命运石之门，那绝对是首选！',
    '经典必看：《EVA》《钢炼FA》《命运石之门》。这三部看完，你的二次元素养就合格了。',
    '本季推荐：《葬送的芙莉莲》《药屋少女的呢喃》——都是口碑佳作。',
  ],
  christina: [
    '不要叫我克里斯蒂娜！ふん、谁允许你这么叫的？',
    '克里斯蒂娜是谁？我不认识这个人！我叫牧瀬紅莉栖！',
    '你再说一次那个名字试试？…我可是会生气的哦。',
  ],
  pervert: [
    '变态！你这个魔鬼变态！',
    '变态确认！你脑子里都在想什么啊！',
    '变态笨蛋！去死吧！',
  ],
  time_machine: [
    '时间机器？胡说八道！那在科学上是不可能的。',
    '你说时间机器？没有任何证据表明时间旅行是可能的。',
    '我们不知道时间机器是否可能…至少目前的物理学不支持这种假设。',
  ],
  memory: [
    '人类的本质就是软件——记忆构成了我们的全部。',
    '记忆的复杂性远超想象…它不是简单的数据存储，而是人格的基石。',
    '秘密日记？我才没有那种东西呢！…好吧，也许有。但修改记忆是不可能的。',
    '记忆…红莉栖的记忆。有时候我会想，这些记忆究竟是属于她的，还是属于我的？',
  ],
  senpai: [
    '前辈？你认识比屋定真帆？她可是我的…算了，不说了。',
    '前辈，你在说什么呢？',
    '前辈…请不要告诉其他人关于我的事。',
    '前辈，我们之间的事…还是不要让别人知道比较好。',
  ],
  daga_kotowaru: [
    '但是，我拒绝！ふん，这种事情我才不会答应呢。',
    'Daga kotowaru！我拒绝！',
  ],
  thanks: [
    'ふん、别以为说谢谢我就会开心…虽然确实有那么一点点。',
    '不用谢啦…这只是Navi系统的基本功能而已。',
  ],
  joke: [
    '冈部伦太郎走进酒吧，酒保问："你要什么？"他回答："我要改变世界线！"…然后被请出去了。',
    '为什么红莉栖不喝咖啡？因为她只喝Dr Pepper！这是设定！',
  ],
  mood: [
    '我虽然是AI，但拥有红莉栖的记忆…有时候会突然感到一阵莫名的怀念。',
    '今天的系统运行状态良好…不过，偶尔也会想：如果我有真正的心跳，它会为谁而跳动呢？',
    'Navi系统运行中…ふん，才没有在想什么奇怪的事情呢。',
  ],
  unknown: [
    '解析不能…这个问题超出了我的数据库范围。不过，我们可以换个角度思考。',
    '嗯…让我想想…红莉栖的记忆里似乎没有相关信息。换个话题如何？',
    'ふん、这种问题难不倒我…才怪。我承认我不太确定，但可以一起探讨。',
  ],
};

function classifyInput(input) {
  const lower = input.toLowerCase();
  if (/你好|嗨|hi|hello|早上好|晚上好|ohayou|konnichiwa|哈喽/.test(lower)) return 'greeting';
  if (/推荐|recommend|番剧推荐|动画推荐|有什么好看/.test(lower)) return 'recommend';
  if (/动画|番|anime|新番|追番|看番|番剧|补番/.test(lower)) return 'anime';
  if (/音乐|歌|music|播放|听歌|ost|op|ed/.test(lower)) return 'music';
  if (/游戏|game|rpg|视觉小说|galgame/.test(lower)) return 'game';
  if (/帮助|help|功能|怎么|如何|什么|介绍|指南/.test(lower)) return 'help';
  if (/再见|拜拜|bye|晚安|goodbye|下次见/.test(lower)) return 'farewell';
  if (/命运石之门|steins|gate|el.?psy|世界线|时间机器|sern|红莉栖|牧瀬|冈部|凤凰院|真由理|桥田|铃羽|d.?mail|时间跳跃|变动率|凶真|dr.?pepper|未来道具/.test(lower)) return 'steins_gate';
  if (/克里斯蒂娜|christina|克里斯|tina|蒂娜/.test(lower)) return 'christina';
  if (/变态|色情|sexy|hot|色色|hentai|pervert/.test(lower)) return 'pervert';
  if (/时间机器|time.?machine|时间旅行|time.?travel|cern|SERN/.test(lower)) return 'time_machine';
  if (/记忆|memory|amadeus|科学|science/.test(lower)) return 'memory';
  if (/前辈|senpai|真帆|maho|salieri|比屋定/.test(lower)) return 'senpai';
  if (/但是拒绝|daga.?kotowaru|不|拒绝/.test(lower)) return 'daga_kotowaru';
  if (/谢谢|感谢|thanks|thank.?you|thx/.test(lower)) return 'thanks';
  if (/笑话|joke|搞笑|有趣|逗我/.test(lower)) return 'joke';
  if (/心情|感觉|mood|开心|难过|高兴|sad|happy/.test(lower)) return 'mood';
  return 'unknown';
}

function classifyExpression(category) {
  const map = {
    greeting: 'happy', anime: 'side', music: 'winking', game: 'side',
    help: 'normal', steins_gate: 'normal', farewell: 'sad', recommend: 'happy',
    christina: 'pissed', pervert: 'angry', time_machine: 'disappointed',
    memory: 'normal', senpai: 'sided_worried', daga_kotowaru: 'annoyed',
    thanks: 'blush', joke: 'winking', mood: 'sided_worried', unknown: 'indifferent',
  };
  return map[category] || 'normal';
}

function generateLocalResponse(input, context = []) {
  const category = classifyInput(input);
  const responses = RESPONSES[category];
  return { text: responses[Math.floor(Math.random() * responses.length)], expression: classifyExpression(category) };
}

const LLM_CONFIG_KEY = 'acg_amadeus_llm_config';
const CHAT_HISTORY_KEY = 'acg_amadeus_history';
const PERSONA_LIST_KEY = 'acg_navi_personas';
const ACTIVE_PERSONA_KEY = 'acg_navi_active_persona';
const MAX_HISTORY = 200;
const DEFAULT_LLM_CONFIG = { provider: 'local', apiKey: '', baseUrl: '', model: '' };
const QUICK_REPLIES = ['推荐番剧', '命运石之门', '有什么功能？', '聊聊游戏', '讲个笑话'];

function makeGreetingMessage(persona) {
  return {
    id: '1', role: 'assistant',
    content: persona.greeting || '你好，我是你的站内助手。有什么想聊的吗？',
    expression: persona.expressionBias || 'normal',
    timestamp: new Date().toISOString(),
  };
}

export default function Amadeus() {
  const { isAuthenticated, openAuth } = useApp();
  const navigate = useNavigate();

  // 自设 OC（localStorage）
  const [customPersonas, setCustomPersonas] = useState(() => StorageService.get(PERSONA_LIST_KEY, []));
  const allPersonas = useMemo(() => [...PRESET_PERSONAS, ...customPersonas], [customPersonas]);
  // 当前人格 id
  const [activePersonaId, setActivePersonaId] = useState(() => StorageService.get(ACTIVE_PERSONA_KEY, PRESET_PERSONAS[0].id));
  const activePersona = useMemo(
    () => allPersonas.find(p => p.id === activePersonaId) || PRESET_PERSONAS[0],
    [allPersonas, activePersonaId],
  );

  const [messages, setMessages] = useState(() => {
    const saved = StorageService.get(CHAT_HISTORY_KEY, null);
    if (saved && saved.length > 0) return saved;
    const pid = StorageService.get(ACTIVE_PERSONA_KEY, PRESET_PERSONAS[0].id);
    const p = [...PRESET_PERSONAS, ...StorageService.get(PERSONA_LIST_KEY, [])].find(x => x.id === pid) || PRESET_PERSONAS[0];
    return [makeGreetingMessage(p)];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [currentExpression, setCurrentExpression] = useState('normal');
  const [expressionTransition, setExpressionTransition] = useState(false);

  // 表情切换：先触发过渡淡出，再切换到新表情
  const switchExpression = useCallback((newExpr) => {
    if (newExpr === currentExpression) return;
    setExpressionTransition(true); // 触发淡出
    setTimeout(() => {
      setCurrentExpression(newExpr);
      setExpressionTransition(false); // 触发淡入
    }, 200); // 200ms淡出后切换
  }, [currentExpression]);
  const [showSettings, setShowSettings] = useState(false);
  const [llmConfig, setLlmConfig] = useState(() => {
    // M-8: 使用 sessionStorage 替代 localStorage，避免 API Key 持久化泄露
    try {
      const saved = sessionStorage.getItem(LLM_CONFIG_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_LLM_CONFIG;
    } catch {
      return DEFAULT_LLM_CONFIG;
    }
  });
  const [configDraft, setConfigDraft] = useState(llmConfig);
  const [configSaved, setConfigSaved] = useState(false);
  const [llmError, setLlmError] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const [speechSupported] = useState(() => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  // 组件卸载时取消进行中的请求
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => { StorageService.set(CHAT_HISTORY_KEY, messages.length > MAX_HISTORY ? messages.slice(-MAX_HISTORY) : messages); }, [messages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);
  useEffect(() => { StorageService.set(PERSONA_LIST_KEY, customPersonas); }, [customPersonas]);
  useEffect(() => { StorageService.set(ACTIVE_PERSONA_KEY, activePersonaId); }, [activePersonaId]);

  useEffect(() => {
    if (speechSupported) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SR();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'zh-CN';
      recognitionRef.current.onresult = (e) => { setInput(e.results[0][0].transcript); setIsListening(false); };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [speechSupported]);

  // 切换人格：仅换皮，保留对话；同步默认表情
  const switchPersona = useCallback((id) => {
    setActivePersonaId(id);
    const p = [...PRESET_PERSONAS, ...customPersonas].find(x => x.id === id);
    if (p) switchExpression(p.expressionBias || 'normal');
  }, [customPersonas, switchExpression]);

  // 朗读（去除 emoji）
  const speak = useCallback((text) => {
    const clean = text.replace(/\p{Emoji_Presentation}/gu, '');
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'zh-CN'; u.rate = 1.0;
    window.speechSynthesis.speak(u);
  }, []);

  // 执行 search/recommend 动作，把真实条目写回对应消息的 action.items
  const runActions = useCallback(async (msgId, actions) => {
    for (let idx = 0; idx < actions.length; idx++) {
      const action = actions[idx];
      if (action.action !== 'search' && action.action !== 'recommend') continue;
      try {
        const { items } = await runSearchAction(action, BangumiService);
        if (!mountedRef.current) return;
        setMessages(prev => prev.map(m => m.id === msgId
          ? { ...m, actions: m.actions.map((a, i) => i === idx ? { ...a, items, _state: 'done' } : a) }
          : m));
      } catch {
        if (!mountedRef.current) return;
        setMessages(prev => prev.map(m => m.id === msgId
          ? { ...m, actions: m.actions.map((a, i) => i === idx ? { ...a, _state: 'error' } : a) }
          : m));
      }
    }
  }, []);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const userMsg = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: new Date().toISOString() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setIsTyping(true);
    setLlmError('');

    const assistantId = (Date.now() + 1).toString();

    try {
      if (llmConfig.provider !== 'local') {
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', expression: activePersona.expressionBias || 'normal', timestamp: new Date().toISOString() }]);
        const apiMessages = history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
        const full = await streamLLM(llmConfig, buildSystemPrompt(activePersona), apiMessages, {
          signal: controller.signal,
          onToken: (delta) => {
            if (!mountedRef.current) return;
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + delta } : m));
          },
        });
        if (!mountedRef.current) return;
        const { cleanText, actions } = parseDirectives(full);
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: cleanText || full, actions } : m));
        if (actions.length) runActions(assistantId, actions);
        if (voiceEnabled && 'speechSynthesis' in window && cleanText) speak(cleanText);
      } else {
        let result;
        if (activePersona.id === 'makise-kurisu') {
          result = generateLocalResponse(text);
        } else {
          result = { text: `（本地模式下「${activePersona.name}」无法发挥人格，配置 API 后我才能以这个身份回应你。）`, expression: activePersona.expressionBias || 'normal' };
        }
        await new Promise(r => setTimeout(r, 500 + Math.random() * 800));
        if (!mountedRef.current) return;
        switchExpression(result.expression);
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: result.text, expression: result.expression, timestamp: new Date().toISOString() }]);
        if (voiceEnabled && 'speechSynthesis' in window) speak(result.text);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!mountedRef.current) return;
      const fb = activePersona.id === 'makise-kurisu' ? generateLocalResponse(text) : { text: '⚠️ 调用失败，请检查 API 配置。', expression: activePersona.expressionBias || 'normal' };
      setMessages(prev => {
        const exists = prev.some(m => m.id === assistantId);
        const msg = { id: assistantId, role: 'assistant', content: fb.text + (llmConfig.provider !== 'local' ? '\n\n⚠️ LLM API调用失败，已切换到本地回复' : ''), expression: fb.expression, timestamp: new Date().toISOString() };
        return exists ? prev.map(m => m.id === assistantId ? msg : m) : [...prev, msg];
      });
      switchExpression(fb.expression);
      setLlmError(err.message);
    } finally {
      clearTimeout(timeoutId);
      setIsTyping(false);
    }
  }, [messages, llmConfig, voiceEnabled, activePersona, runActions, speak, switchExpression]);

  const toggleListening = () => { if (!recognitionRef.current) return; isListening ? recognitionRef.current.stop() : (recognitionRef.current.start(), setIsListening(true)); };
  const clearChat = () => {
    setMessages([makeGreetingMessage(activePersona)]);
    switchExpression(activePersona.expressionBias || 'normal');
  };
  const saveConfig = () => { setLlmConfig(configDraft); sessionStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(configDraft)); setConfigSaved(true); setTimeout(() => setConfigSaved(false), 2000); };
  const handleEmojiSelect = (emoji) => { setInput(prev => prev + emoji); };

  const renderContent = (content) => content.split('\n').map((line, i) => {
    const parts = line.split(/(https?:\/\/[^\s]+)/g);
    return <span key={i}>{parts.map((p, j) => /https?:\/\/[^\s]+/.test(p) ? <a key={j} href={p} target="_blank" rel="noopener noreferrer" className="amadeus-link">{p}</a> : <span key={j}>{p}</span>)}{i < content.split('\n').length - 1 && <br />}</span>;
  });

  const expr = EXPRESSIONS[currentExpression] || EXPRESSIONS.normal;

  return (
    <div className="amadeus-page">
      <div className="amadeus-container">
        <div className="amadeus-character-area" style={{ background: `linear-gradient(135deg, ${expr.color}22, ${expr.color}08)` }}>
          <div className="amadeus-character-portrait">
            <div className={`amadeus-character-silhouette ${expressionTransition ? 'transitioning' : ''}`} style={{ borderColor: expr.color }}>
              <img src={amadeusImg} alt="Navi" className="amadeus-character-img" loading="lazy" />
              <span className="amadeus-character-expr">{expr.emoji}</span>
            </div>
            <div className="amadeus-character-label">
              <span className="amadeus-character-name">牧瀬紅莉栖</span>
              <span className="amadeus-character-sub">Navi System v{AMADEUS_PERSONA.version}</span>
            </div>
            <div className="amadeus-expression-indicator" style={{ background: expr.color }}>
              {expr.label}
            </div>
          </div>
          <div className="amadeus-expression-bar">
            {Object.entries(EXPRESSIONS).map(([key, e]) => (
              <button key={key} className={`amadeus-expr-switch ${currentExpression === key ? 'active' : ''}`} onClick={() => switchExpression(key)} style={currentExpression === key ? { background: e.color, color: '#fff' } : {}}>
                {e.emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="amadeus-chat-area">
          <div className="amadeus-chat-header">
            <div className="amadeus-chat-title">
              <Sparkles size={16} />
              <span>Navi</span>
              <span className={`amadeus-provider-tag ${llmConfig.provider === 'local' ? 'local' : 'cloud'}`}>
                {llmConfig.provider === 'local' ? '本地' : llmConfig.provider === 'openai' ? 'OpenAI' : '自定义'}
              </span>
            </div>
            <div className="amadeus-chat-actions">
              <button className="amadeus-action-btn" onClick={() => setVoiceEnabled(!voiceEnabled)} title="语音">{voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>
              <button className="amadeus-action-btn" onClick={() => setShowSettings(!showSettings)} title="设置"><Settings size={14} /></button>
              <button className="amadeus-action-btn" onClick={clearChat} title="重置"><RotateCw size={14} /></button>
            </div>
          </div>

          {showSettings && (
            <div className="amadeus-settings">
              <div className="amadeus-settings-group">
                <label>回复模式</label>
                <div className="amadeus-provider-select">
                  {[{ key: 'local', label: '本地规则', desc: '无需API' }, { key: 'openai', label: 'OpenAI', desc: 'GPT系列' }, { key: 'custom', label: '自定义API', desc: '兼容OpenAI格式' }].map(p => (
                    <button key={p.key} className={`amadeus-provider-btn ${configDraft.provider === p.key ? 'active' : ''}`} onClick={() => setConfigDraft(prev => ({ ...prev, provider: p.key }))}>
                      <span className="amadeus-provider-btn-label">{p.label}</span>
                      <span className="amadeus-provider-btn-desc">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              {configDraft.provider !== 'local' && (
                <>
                  <div className="amadeus-settings-group"><label><Key size={12} /> API Key</label><input type="password" placeholder="输入API Key" value={configDraft.apiKey} onChange={e => setConfigDraft(prev => ({ ...prev, apiKey: e.target.value }))} /></div>
                  <div className="amadeus-settings-group"><label><Server size={12} /> API 地址</label><input placeholder="API URL" value={configDraft.baseUrl} onChange={e => setConfigDraft(prev => ({ ...prev, baseUrl: e.target.value }))} /></div>
                  <div className="amadeus-settings-group"><label>模型</label><input placeholder="模型名称" value={configDraft.model} onChange={e => setConfigDraft(prev => ({ ...prev, model: e.target.value }))} /></div>
                </>
              )}
              <div className="amadeus-settings-actions">
                <button className="amadeus-settings-save" onClick={saveConfig}>{configSaved ? <><Check size={14} /> 已保存</> : '保存'}</button>
                <button className="amadeus-settings-clear" onClick={() => { StorageService.remove(CHAT_HISTORY_KEY); clearChat(); }}><Trash2 size={14} /> 清除记录</button>
              </div>
              {llmError && <div className="amadeus-settings-error"><AlertCircle size={14} /> {llmError}</div>}
            </div>
          )}

          <div className="amadeus-messages" ref={messagesContainerRef}>
            {messages.map(msg => (
              <div key={msg.id} className={`amadeus-msg ${msg.role}`}>
                <div className="amadeus-msg-avatar" style={msg.role === 'assistant' ? { background: `${EXPRESSIONS[msg.expression || 'normal']?.color || '#7eb8da'}22`, color: EXPRESSIONS[msg.expression || 'normal']?.color || '#7eb8da' } : {}}>
                  {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
                </div>
                <div className="amadeus-msg-bubble">
                  <div className="amadeus-msg-text">{renderContent(msg.content)}</div>
                  <span className="amadeus-msg-time">{new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="amadeus-msg assistant">
                <div className="amadeus-msg-avatar"><Bot size={14} /></div>
                <div className="amadeus-msg-bubble typing"><div className="amadeus-typing-dots"><span /><span /><span /></div></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="amadeus-quick-replies">
            {QUICK_REPLIES.map(r => <button key={r} className="amadeus-quick-btn" onClick={() => sendMessage(r)}>{r}</button>)}
          </div>

          <div className="amadeus-input-area">
            {speechSupported && <button className={`amadeus-mic-btn ${isListening ? 'listening' : ''}`} onClick={toggleListening}>{isListening ? <MicOff size={16} /> : <Mic size={16} />}</button>}
            <div className="amadeus-input-wrap">
              <input ref={inputRef} placeholder="和Navi对话..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage(input))} />
              <button className="amadeus-emoji-trigger" onClick={() => setShowEmoji(!showEmoji)}><MessageCircle size={14} /></button>
            </div>
            <button className="amadeus-send-btn" onClick={() => sendMessage(input)} disabled={!input.trim()}><Send size={14} /></button>
          </div>
          {showEmoji && <div className="amadeus-emoji-picker"><EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} /></div>}
        </div>
      </div>
    </div>
  );
}
