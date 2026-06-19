import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, X } from 'lucide-react';
import { streamLLM } from '../../Amadeus/llmClient.js';

const QUICK_PROMPTS = [
  '我当时看这部作品时的感受？',
  '帮我总结这篇笔记的核心观点',
  '基于这篇笔记推荐我相关作品',
];

/**
 * 嵌入式 Navi 对话面板
 * @param {object|null} currentNote - 当前打开的笔记（用于注入上下文）
 * @param {array} insights - 关联条目历史短评 [{ subject_name, score, content }]
 * @param {string} prefillQuestion - 预填问题（按条触发时传入）
 * @param {boolean} open - 面板是否展开
 * @param {() => void} onClose - 关闭面板
 */
export default function NaviChatPanel({ currentNote, insights = [], prefillQuestion = '', open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  // llmConfig：使用 glm4 走 Worker 代理内置 Key
  const llmConfig = { provider: 'glm4', model: 'glm-4-flash', apiKey: '', apiBase: '' };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  // 按条触发：预填问题
  useEffect(() => {
    if (prefillQuestion) {
      setInput(prefillQuestion);
    }
  }, [prefillQuestion]);

  const buildSystemPrompt = useCallback(() => {
    if (!currentNote) {
      return '你是用户的创作助手 Navi，帮助用户整理和回顾对作品的感悟。请用简洁、温暖的语气回答。';
    }
    const lines = [];
    lines.push('你是用户的创作助手 Navi。以下是用户的笔记内容和关联条目的历史短评，请基于这些上下文回答用户的问题。');
    lines.push('');
    lines.push('【当前笔记】');
    lines.push(`标题：${currentNote.title || '（无标题）'}`);
    lines.push('内容：');
    for (const block of (currentNote.blocks || [])) {
      if (['text', 'quote'].includes(block.type)) lines.push(block.content || '');
      else if (['h1', 'h2', 'h3'].includes(block.type)) lines.push(`${'#'.repeat(Number(block.type[1]))} ${block.content || ''}`);
      else if (block.type === 'todo') lines.push(`- [${block.checked ? 'x' : ' '}] ${block.content || ''}`);
      else if (block.type === 'divider') lines.push('---');
      else if (block.type === 'image') lines.push(`[图片]`);
      else if (block.type === 'subject-link') lines.push(`[条目: ${block.subject_name || ''}]`);
    }
    lines.push('');
    lines.push('【关联条目历史短评】');
    if (insights.length > 0) {
      insights.forEach((it, i) => {
        const score = it.score ? `（评分：${it.score}）` : '';
        lines.push(`${i + 1}. ${it.subject_name || '未知'}${score}："${it.content || ''}"`);
      });
    } else {
      lines.push('（暂无关联短评）');
    }
    return lines.join('\n');
  }, [currentNote, insights]);

  const send = useCallback(async (question) => {
    if (!question.trim() || streaming) return;
    const userMsg = { role: 'user', content: question.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);
    setStreamText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const systemPrompt = buildSystemPrompt();
      let full = '';
      await streamLLM(llmConfig, systemPrompt, newMessages, {
        signal: controller.signal,
        onToken: (delta) => {
          full += delta;
          setStreamText(full);
        },
      });
      setMessages(prev => [...prev, { role: 'assistant', content: full || '...' }]);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: `（Navi 暂时无法回复：${err.message}）` }]);
      }
    } finally {
      setStreaming(false);
      setStreamText('');
      abortRef.current = null;
    }
  }, [messages, streaming, buildSystemPrompt]);

  const handleSend = () => send(input);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  if (!open) return null;

  return (
    <div className="cs-navi-panel">
      <div className="cs-navi-header">
        <div className="cs-navi-title">
          <Sparkles size={14} /> Navi 对话
          {currentNote && <span className="cs-navi-context-badge">已注入笔记上下文</span>}
        </div>
        <button className="cs-navi-close" onClick={onClose}><X size={14} /></button>
      </div>

      <div className="cs-navi-quick-prompts">
        {QUICK_PROMPTS.map((q) => (
          <button key={q} className="cs-quick-prompt" onClick={() => send(q)} disabled={streaming}>
            {q}
          </button>
        ))}
      </div>

      <div className="cs-navi-messages" ref={scrollRef}>
        {messages.length === 0 && !streaming && (
          <div className="cs-navi-empty">
            <Sparkles size={32} />
            <p>向 Navi 提问吧！我会基于你当前的笔记和关联短评来回答。</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`cs-navi-msg ${m.role}`}>
            <div className="cs-navi-msg-avatar">{m.role === 'user' ? '我' : 'N'}</div>
            <div className="cs-navi-msg-content">{m.content}</div>
          </div>
        ))}
        {streaming && (
          <div className="cs-navi-msg assistant">
            <div className="cs-navi-msg-avatar">N</div>
            <div className="cs-navi-msg-content">
              {streamText || <Loader2 size={14} className="cs-spin" />}
            </div>
          </div>
        )}
      </div>

      <div className="cs-navi-input-area">
        <textarea
          className="cs-navi-input"
          placeholder="输入问题...（Enter 发送，Shift+Enter 换行）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={streaming}
        />
        {streaming ? (
          <button className="cs-btn cs-btn-danger" onClick={handleStop}>停止</button>
        ) : (
          <button className="cs-btn cs-btn-primary" onClick={handleSend} disabled={!input.trim()}>
            <Send size={14} /> 发送
          </button>
        )}
      </div>
    </div>
  );
}
