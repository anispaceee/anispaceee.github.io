/** 取请求端点：openai 缺省官方地址，custom 必须显式配置 baseUrl。 */
function endpointOf(config) {
  if (config.provider === 'openai') return config.baseUrl || 'https://api.openai.com/v1/chat/completions';
  return config.baseUrl;
}

function defaultModel(config) {
  return config.model || (config.provider === 'openai' ? 'gpt-3.5-turbo' : 'default');
}

/**
 * 统一 LLM 调用：优先流式（SSE），响应不是事件流时回落整段 JSON。
 * @param config { provider, apiKey, baseUrl, model }
 * @param systemPrompt 角色 system prompt
 * @param messages [{ role, content }]（已是 user/assistant 历史）
 * @param onToken(delta) 每个增量文本片段回调
 * @returns 完整文本
 */
export async function streamLLM(config, systemPrompt, messages, { signal, onToken } = {}) {
  const url = endpointOf(config);
  if (!url) throw new Error('请配置 API 地址');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({
      model: defaultModel(config),
      messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-10)],
      max_tokens: 800,
      temperature: 0.8,
      stream: true,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`API 请求失败: ${res.status}`);

  const ctype = res.headers.get('content-type') || '';
  // 非事件流：整段兜底
  if (!ctype.includes('text/event-stream') || !res.body) {
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || data.response || data.content || '...';
    if (onToken && text) onToken(text);
    return text;
  }

  // SSE 流式解析
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) { full += delta; onToken?.(delta); }
      } catch { /* 跳过心跳/注释等非 JSON 行 */ }
    }
  }
  return full || '...';
}

/** 发送一条最短请求测试连接，成功返回 true，失败抛错。 */
export async function testConnection(config, signal) {
  const url = endpointOf(config);
  if (!url) throw new Error('请配置 API 地址');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({ model: defaultModel(config), messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
    signal,
  });
  if (!res.ok) throw new Error(`连接失败: ${res.status}`);
  return true;
}
