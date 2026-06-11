import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { mediaSourceManager } from '../../services/media/MediaSourceManager';
import { ConnectionStatus } from '../../services/media/types';
import { ArrowLeft, Plus, Server, Wifi, WifiOff, Trash2, RefreshCw, Settings, Loader2, X, Check } from 'lucide-react';
import './SourceManager.css';

const DEFAULT_SOURCE_IDS = ['kuapi', 'bfzy', 'guangsu', 'sdzy'];

const CONNECTION_STATUS_TEXT = {
  [ConnectionStatus.AVAILABLE]: '连接正常',
  [ConnectionStatus.UNAVAILABLE]: '连接失败',
  [ConnectionStatus.TIMEOUT]: '连接超时',
  testing: '测试中...',
};

const CONNECTION_STATUS_ICON = {
  [ConnectionStatus.AVAILABLE]: <Wifi size={14} />,
  [ConnectionStatus.UNAVAILABLE]: <WifiOff size={14} />,
  [ConnectionStatus.TIMEOUT]: <WifiOff size={14} />,
  testing: <Loader2 size={14} className="sm-spinning" />,
};

export default function SourceManager() {
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState([]);
  const [factories, setFactories] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedFactory, setSelectedFactory] = useState(null);
  const [newSourceParams, setNewSourceParams] = useState({});
  const [connectionStatuses, setConnectionStatuses] = useState({});
  const [loading, setLoading] = useState(true);

  const loadRegistrations = useCallback(() => {
    const regs = mediaSourceManager.getRegistrations();
    const disabled = JSON.parse(localStorage.getItem('acg_v2_sources_disabled') || '[]');
    setRegistrations(regs.map(r => ({ ...r, disabled: disabled.includes(r.sourceId) })));
    setFactories(mediaSourceManager.getFactories());
  }, []);

  useEffect(() => {
    loadRegistrations();
    setLoading(false);
  }, [loadRegistrations]);

  const handleTestConnection = async (sourceId) => {
    setConnectionStatuses(prev => ({ ...prev, [sourceId]: 'testing' }));
    const source = mediaSourceManager.getSource(sourceId);
    if (!source) {
      setConnectionStatuses(prev => ({ ...prev, [sourceId]: ConnectionStatus.UNAVAILABLE }));
      return;
    }
    const status = await source.checkConnection();
    setConnectionStatuses(prev => ({ ...prev, [sourceId]: status }));
  };

  const handleToggle = (sourceId) => {
    mediaSourceManager.toggleSource(sourceId);
    loadRegistrations();
  };

  const handleAddSource = () => {
    if (!selectedFactory) return;
    const factory = mediaSourceManager.getFactory(selectedFactory);
    if (!factory) return;

    const sourceId = `${factory.factoryId}_${Date.now()}`;
    const config = { arguments: {} };
    for (const param of factory.parameters) {
      config.arguments[param.name] = newSourceParams[param.name] || param.default;
    }

    mediaSourceManager.addRegistration({
      sourceId,
      factoryId: factory.factoryId,
      config,
      enabled: true,
    });

    setShowAddForm(false);
    setSelectedFactory(null);
    setNewSourceParams({});
    loadRegistrations();
  };

  const handleDelete = (sourceId) => {
    mediaSourceManager.removeRegistration(sourceId);
    loadRegistrations();
  };

  const handleFactorySelect = (factoryId) => {
    setSelectedFactory(factoryId);
    setNewSourceParams({});
  };

  const handleParamChange = (paramName, value) => {
    setNewSourceParams(prev => ({ ...prev, [paramName]: value }));
  };

  const isDefaultSource = (sourceId) => DEFAULT_SOURCE_IDS.includes(sourceId);

  const selectedFactoryData = selectedFactory
    ? factories.find(f => f.factoryId === selectedFactory)
    : null;

  const canCreate = selectedFactoryData && selectedFactoryData.parameters
    .filter(p => p.required)
    .every(p => newSourceParams[p.name]?.toString().trim());

  if (loading) {
    return (
      <div className="source-manager">
        <div className="sm-loading">
          <Loader2 size={32} className="sm-spinning" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="source-manager">
      {/* Header */}
      <div className="sm-header">
        <button className="sm-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div className="sm-header-title">
          <Settings size={20} />
          <h1>源管理</h1>
        </div>
        <button className="sm-btn sm-btn-add" onClick={() => setShowAddForm(true)}>
          <Plus size={16} />
          <span>添加源</span>
        </button>
      </div>

      {/* Source List */}
      {registrations.length === 0 ? (
        <div className="sm-empty">
          <Server size={48} />
          <p>暂无已注册的源</p>
          <button className="sm-btn sm-btn-add" onClick={() => setShowAddForm(true)}>
            <Plus size={16} />
            <span>添加第一个源</span>
          </button>
        </div>
      ) : (
        <div className="sm-source-list">
          {registrations.map(reg => {
            const source = mediaSourceManager.getSource(reg.sourceId);
            const info = source?.info || {};
            const status = connectionStatuses[reg.sourceId];
            const isDefault = isDefaultSource(reg.sourceId);

            return (
              <div key={reg.sourceId} className={`sm-source-card ${reg.disabled ? 'sm-source-disabled' : ''}`}>
                <div className="sm-source-info">
                  <div className="sm-source-name-row">
                    <span className="sm-source-name">{info.displayName || reg.sourceId}</span>
                    <span className="sm-source-badge">{reg.factoryId}</span>
                  </div>
                  {info.websiteUrl && (
                    <span className="sm-source-url">{info.websiteUrl}</span>
                  )}
                </div>

                <div className="sm-source-status">
                  {status ? (
                    <span className={`sm-status-indicator sm-status-${status}`}>
                      {CONNECTION_STATUS_ICON[status]}
                      <span>{CONNECTION_STATUS_TEXT[status]}</span>
                    </span>
                  ) : (
                    <span className="sm-status-indicator sm-status-idle">
                      <RefreshCw size={14} />
                      <span>未测试</span>
                    </span>
                  )}
                </div>

                <div className="sm-source-actions">
                  <label className="sm-toggle">
                    <input
                      type="checkbox"
                      className="sm-toggle-input"
                      checked={!reg.disabled}
                      onChange={() => handleToggle(reg.sourceId)}
                    />
                    <span className="sm-toggle-slider" />
                  </label>

                  <button
                    className="sm-btn sm-btn-test"
                    onClick={() => handleTestConnection(reg.sourceId)}
                    disabled={status === 'testing'}
                  >
                    {status === 'testing' ? (
                      <Loader2 size={14} className="sm-spinning" />
                    ) : (
                      <Wifi size={14} />
                    )}
                    <span>测试</span>
                  </button>

                  {!isDefault && (
                    <button
                      className="sm-btn sm-btn-delete"
                      onClick={() => handleDelete(reg.sourceId)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Source Modal */}
      {showAddForm && (
        <div className="sm-modal" onClick={() => { setShowAddForm(false); setSelectedFactory(null); setNewSourceParams({}); }}>
          <div className="sm-modal-content" onClick={e => e.stopPropagation()}>
            <div className="sm-modal-header">
              <h2>添加新源</h2>
              <button
                className="sm-modal-close"
                onClick={() => { setShowAddForm(false); setSelectedFactory(null); setNewSourceParams({}); }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="sm-modal-body">
              {/* Factory Selector */}
              <div className="sm-param-group">
                <label className="sm-param-label">源类型</label>
                <select
                  className="sm-factory-select"
                  value={selectedFactory || ''}
                  onChange={e => handleFactorySelect(e.target.value)}
                >
                  <option value="">选择源类型...</option>
                  {factories.map(f => (
                    <option key={f.factoryId} value={f.factoryId}>
                      {f.info.displayName} {f.allowMultipleInstances ? '' : '（仅限一个）'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Parameters */}
              {selectedFactoryData && (
                <>
                  {selectedFactoryData.info.description && (
                    <p className="sm-factory-desc">{selectedFactoryData.info.description}</p>
                  )}
                  {selectedFactoryData.parameters.map(param => (
                    <div key={param.name} className="sm-param-group">
                      <label className="sm-param-label">
                        {param.displayName}
                        {param.required && <span className="sm-param-required">*</span>}
                      </label>
                      {param.type === 'select' && param.options ? (
                        <select
                          className="sm-param-input"
                          value={newSourceParams[param.name] || param.default || ''}
                          onChange={e => handleParamChange(param.name, e.target.value)}
                        >
                          <option value="">请选择...</option>
                          {param.options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : param.type === 'boolean' ? (
                        <label className="sm-toggle">
                          <input
                            type="checkbox"
                            className="sm-toggle-input"
                            checked={!!(newSourceParams[param.name] ?? param.default ?? false)}
                            onChange={e => handleParamChange(param.name, e.target.checked)}
                          />
                          <span className="sm-toggle-slider" />
                        </label>
                      ) : (
                        <input
                          type={param.type === 'number' ? 'number' : 'text'}
                          className="sm-param-input"
                          placeholder={param.displayName}
                          value={newSourceParams[param.name] ?? param.default ?? ''}
                          onChange={e => handleParamChange(param.name, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="sm-modal-footer">
              <button
                className="sm-btn sm-btn-cancel"
                onClick={() => { setShowAddForm(false); setSelectedFactory(null); setNewSourceParams({}); }}
              >
                取消
              </button>
              <button
                className="sm-btn sm-btn-create"
                onClick={handleAddSource}
                disabled={!canCreate}
              >
                <Check size={16} />
                <span>创建</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
