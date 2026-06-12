import { useCallback } from 'react';
import { X } from 'lucide-react';
import './ReaderSettings.css';

const STORAGE_KEY = 'musashi_reader_settings';

const THEME_COLORS = [
  { key: 'white',  label: '白色', bg: '#ffffff' },
  { key: 'beige',  label: '米色', bg: '#fdf6e3' },
  { key: 'green',  label: '绿色', bg: '#f0f4e8' },
];

const DEFAULT_SETTINGS = {
  fontSize: 16,
  lineHeight: 1.8,
  nightMode: false,
  themeColor: 'white',
};

export function loadReaderSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export default function ReaderSettings({ settings, onChange, onClose }) {
  const handleChange = useCallback((key, value) => {
    const next = { ...settings, [key]: value };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    onChange(next);
  }, [settings, onChange]);

  return (
    <>
      <div className="rs-overlay" onClick={onClose} />
      <div className="rs-panel">
        <div className="rs-header">
          <span className="rs-title">阅读设置</span>
          <button className="rs-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* 字号 */}
        <div className="rs-row">
          <label className="rs-label">
            字号
            <span className="rs-value">{settings.fontSize}px</span>
          </label>
          <input
            type="range"
            className="rs-slider"
            min={14}
            max={24}
            step={1}
            value={settings.fontSize}
            onChange={(e) => handleChange('fontSize', Number(e.target.value))}
          />
        </div>

        {/* 行距 */}
        <div className="rs-row">
          <label className="rs-label">
            行距
            <span className="rs-value">{settings.lineHeight}</span>
          </label>
          <input
            type="range"
            className="rs-slider"
            min={1.5}
            max={2.5}
            step={0.1}
            value={settings.lineHeight}
            onChange={(e) => handleChange('lineHeight', Number(e.target.value))}
          />
        </div>

        {/* 夜间模式 */}
        <div className="rs-toggle-row">
          <span className="rs-toggle-label">夜间模式</span>
          <button
            className={`rs-toggle${settings.nightMode ? ' active' : ''}`}
            onClick={() => handleChange('nightMode', !settings.nightMode)}
          >
            <span className="rs-toggle-knob" />
          </button>
        </div>

        {/* 主题色 */}
        <div className="rs-row">
          <span className="rs-label">主题色</span>
          <div className="rs-theme-colors">
            {THEME_COLORS.map(({ key, label, bg }) => (
              <button
                key={key}
                className={`rs-theme-swatch${settings.themeColor === key ? ' active' : ''}`}
                style={{ background: bg }}
                title={label}
                onClick={() => handleChange('themeColor', key)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
