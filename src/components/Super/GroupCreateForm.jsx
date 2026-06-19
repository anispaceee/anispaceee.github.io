import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, Globe, Lock, EyeOff } from 'lucide-react';
import { SuperService } from '../../services/SuperService';
import { useApp } from '../../context/AppContext';
import './GroupCreateForm.css';

/**
 * GroupCreateForm - 创建小组表单组件
 * 用于创建新的 Bangumi 小组
 */
export default function GroupCreateForm() {
  const navigate = useNavigate();
  const { isAuthenticated, openAuth, bangumiBound } = useApp();

  // 表单状态
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [icon, setIcon] = useState('');
  const [accessible, setAccessible] = useState(true);
  const [nsfw, setNsfw] = useState(false);

  // 提交状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 表单验证
  const [nameError, setNameError] = useState(null);
  const [titleError, setTitleError] = useState(null);

  // 验证小组名称（英文标识）
  const validateName = useCallback((value) => {
    if (!value.trim()) {
      setNameError('小组名称不能为空');
      return false;
    }
    if (value.length > 50) {
      setNameError('小组名称不能超过 50 个字符');
      return false;
    }
    // 英文标识：只允许字母、数字、下划线、连字符
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      setNameError('小组名称只能包含字母、数字、下划线和连字符');
      return false;
    }
    setNameError(null);
    return true;
  }, []);

  // 验证小组标题
  const validateTitle = useCallback((value) => {
    if (!value.trim()) {
      setTitleError('小组标题不能为空');
      return false;
    }
    if (value.length > 50) {
      setTitleError('小组标题不能超过 50 个字符');
      return false;
    }
    setTitleError(null);
    return true;
  }, []);

  // 处理名称输入
  const handleNameChange = useCallback((e) => {
    const value = e.target.value;
    setName(value);
    validateName(value);
  }, [validateName]);

  // 处理标题输入
  const handleTitleChange = useCallback((e) => {
    const value = e.target.value;
    setTitle(value);
    validateTitle(value);
  }, [validateTitle]);

  // 提交创建小组
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    // 检查登录状态
    if (!isAuthenticated) {
      openAuth();
      return;
    }

    // 检查 Bangumi 绑定状态
    if (!bangumiBound) {
      setError('请先绑定 Bangumi 账号才能创建小组');
      return;
    }

    // 验证表单
    const nameValid = validateName(name);
    const titleValid = validateTitle(title);
    if (!nameValid || !titleValid) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await SuperService.createGroup(
        name.trim(),
        title.trim(),
        desc.trim(),
        icon.trim(),
        accessible,
        nsfw
      );

      // 创建成功，跳转到小组详情页
      if (res.id) {
        navigate(`/super/group/${res.id}`);
      } else {
        // 如果没有返回 ID，跳转到超展开首页
        navigate('/super');
      }
    } catch (err) {
      setError(err.message || '创建小组失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [name, title, desc, icon, accessible, nsfw, isAuthenticated, bangumiBound, openAuth, validateName, validateTitle, navigate]);

  return (
    <div className="gcf-page">
      {/* 返回链接 */}
      <Link to="/super" className="gcf-back-link">
        <ArrowLeft size={16} />
        <span>返回小组列表</span>
      </Link>

      {/* 页面标题 */}
      <div className="gcf-header">
        <h1 className="gcf-title">创建小组</h1>
        <p className="gcf-subtitle">创建一个新的 Bangumi 小组，开始你的讨论社区</p>
      </div>

      {/* 表单 */}
      <form className="gcf-form" onSubmit={handleSubmit}>
        {/* 小组名称（英文标识） */}
        <div className="gcf-field">
          <label className="gcf-label">
            <span className="gcf-label-text">小组名称</span>
            <span className="gcf-label-hint">（英文标识，用于 URL）</span>
          </label>
          <input
            type="text"
            className={`gcf-input ${nameError ? 'gcf-input-error' : ''}`}
            value={name}
            onChange={handleNameChange}
            placeholder="例如：anime_discussion"
            maxLength={50}
            disabled={loading}
          />
          {nameError && (
            <div className="gcf-field-error">
              <AlertCircle size={14} />
              <span>{nameError}</span>
            </div>
          )}
        </div>

        {/* 小组标题（显示名称） */}
        <div className="gcf-field">
          <label className="gcf-label">
            <span className="gcf-label-text">小组标题</span>
            <span className="gcf-label-hint">（显示名称）</span>
          </label>
          <input
            type="text"
            className={`gcf-input ${titleError ? 'gcf-input-error' : ''}`}
            value={title}
            onChange={handleTitleChange}
            placeholder="例如：动画讨论区"
            maxLength={50}
            disabled={loading}
          />
          {titleError && (
            <div className="gcf-field-error">
              <AlertCircle size={14} />
              <span>{titleError}</span>
            </div>
          )}
        </div>

        {/* 小组简介 */}
        <div className="gcf-field">
          <label className="gcf-label">
            <span className="gcf-label-text">小组简介</span>
          </label>
          <textarea
            className="gcf-textarea"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="描述小组的主题、讨论内容..."
            rows={4}
            disabled={loading}
          />
        </div>

        {/* 小组图标 URL */}
        <div className="gcf-field">
          <label className="gcf-label">
            <span className="gcf-label-text">小组图标</span>
            <span className="gcf-label-hint">（可选，输入图片 URL）</span>
          </label>
          <input
            type="text"
            className="gcf-input"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="例如：https://example.com/icon.png"
            disabled={loading}
          />
          {/* 图标预览 */}
          {icon && (
            <div className="gcf-icon-preview">
              <img
                src={icon}
                alt="图标预览"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* 公开小组复选框 */}
        <div className="gcf-checkbox-field">
          <label className="gcf-checkbox-label">
            <input
              type="checkbox"
              checked={accessible}
              onChange={(e) => setAccessible(e.target.checked)}
              disabled={loading}
            />
            <span className="gcf-checkbox-box">
              {accessible ? <Globe size={16} /> : <Lock size={16} />}
            </span>
            <span className="gcf-checkbox-text">
              {accessible ? '公开小组' : '私有小组'}
            </span>
            <span className="gcf-checkbox-hint">
              {accessible ? '所有人可见' : '仅成员可见'}
            </span>
          </label>
        </div>

        {/* NSFW 内容复选框 */}
        <div className="gcf-checkbox-field">
          <label className="gcf-checkbox-label">
            <input
              type="checkbox"
              checked={nsfw}
              onChange={(e) => setNsfw(e.target.checked)}
              disabled={loading}
            />
            <span className="gcf-checkbox-box gcf-nsfw-icon">
              <EyeOff size={16} />
            </span>
            <span className="gcf-checkbox-text">
              NSFW 内容
            </span>
            <span className="gcf-checkbox-hint">
              包含成人内容，需特殊标记
            </span>
          </label>
        </div>

        {/* 全局错误提示 */}
        {error && (
          <div className="gcf-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* 提交按钮 */}
        <div className="gcf-actions">
          <button
            type="submit"
            className="gcf-submit-btn"
            disabled={loading || nameError || titleError || !name.trim() || !title.trim()}
          >
            {loading ? (
              <Loader2 size={16} className="gcf-spinning" />
            ) : null}
            <span>{loading ? '创建中...' : '创建小组'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}