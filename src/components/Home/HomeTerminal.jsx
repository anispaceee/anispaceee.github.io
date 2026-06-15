import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { BangumiService, WorldChannelService, MailService } from '../../services/api';
import { runCommand } from './terminalCommands';
import './HomeTerminal.css';

export default function HomeTerminal() {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]); // OutputLine[]
  const [cmdHistory, setCmdHistory] = useState([]); // 仅成功输入的命令文本
  const [cursor, setCursor] = useState(-1); // -1 表示停在当前输入
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  // 输出增长时自动滚到底部
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [history]);

  const print = useCallback((lines) => {
    const arr = Array.isArray(lines) ? lines : [lines];
    setHistory(prev => [...prev, ...arr]);
  }, []);

  const replaceLine = useCallback((id, newLine) => {
    setHistory(prev => prev.map(line => line._id === id ? newLine : line));
  }, []);

  const clear = useCallback(() => setHistory([]), []);

  const submit = useCallback(async () => {
    const raw = input.trim();
    if (!raw) return;
    setHistory(prev => [...prev, { type: 'input', text: raw }]);
    setCmdHistory(prev => [...prev, raw]);
    setCursor(-1);
    setInput('');
    const ctx = {
      navigate, currentUser, print, replaceLine, clear,
      services: { BangumiService, WorldChannelService, MailService },
    };
    const out = await runCommand(raw, ctx);
    if (out.length) print(out);
  }, [input, navigate, currentUser, print, replaceLine, clear]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { submit(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const next = cursor === -1 ? cmdHistory.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setInput(cmdHistory[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cursor === -1) return;
      const next = cursor + 1;
      if (next >= cmdHistory.length) { setCursor(-1); setInput(''); }
      else { setCursor(next); setInput(cmdHistory[next]); }
    }
  };

  return (
    <div className="home-terminal-window" onClick={() => inputRef.current?.focus()}>
      <div className="home-terminal-titlebar">
        <div className="home-terminal-controls">
          <span className="home-terminal-ctrl close" />
          <span className="home-terminal-ctrl minimize" />
          <span className="home-terminal-ctrl maximize" />
        </div>
        <span className="home-terminal-title">Terminal — ANISpace</span>
      </div>
      <div className="home-terminal-body">
        <div className="home-terminal-output" ref={outputRef}>
          <div className="home-terminal-line">Welcome to ANISpace Terminal v1.0.0</div>
          <div className="home-terminal-line hint">Type 'help' for available commands.</div>
          {history.map((entry, i) => {
            if (entry.type === 'input') {
              return (
                <div key={i} className="home-terminal-line">
                  <span className="home-terminal-prompt">$ </span><span>{entry.text}</span>
                </div>
              );
            }
            if (entry.type === 'link') {
              const go = (e) => { e.stopPropagation(); navigate(entry.to, { state: entry.state }); };
              return (
                <div
                  key={i}
                  className="home-terminal-line link"
                  role="link"
                  tabIndex={0}
                  onClick={go}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } }}
                >
                  {entry.text}
                </div>
              );
            }
            return (
              <div key={i} className={`home-terminal-line ${entry.type === 'error' ? 'error' : ''}`}>
                <span className="home-terminal-response">{entry.text}</span>
              </div>
            );
          })}
        </div>
        <div className="home-terminal-input-line">
          <span className="home-terminal-prompt">$ </span>
          <input
            ref={inputRef}
            type="text"
            className="home-terminal-input"
            aria-label="终端命令输入"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
