function classifyHttpError(status, message) {
  if (status === 401 || status === 403) {
    return { type: 'auth', message: `认证失败 (HTTP ${status}): API Key 无效或已过期。` };
  }
  if (status === 429) {
    return { type: 'rate_limit', message: '请求限流 (HTTP 429): API 调用频率过高，请稍后重试。' };
  }
  if (status >= 500) {
    return { type: 'server', message: `服务端错误 (HTTP ${status}): API 服务暂时不可用。` };
  }
  return { type: 'unknown', message: message || `HTTP ${status}` };
}

function classifyFetchError(err) {
  if (err.name === 'TypeError' && (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.cause?.code === 'ENOTFOUND')) {
    return { type: 'network', message: `网络连接失败: ${err.message}。请检查网络连接或API地址是否正确。` };
  }
  if (err.name === 'AbortError' || err.name === 'TimeoutError' || err.code === 'ETIMEDOUT') {
    return { type: 'timeout', message: `请求超时: ${err.message}。API响应时间过长。` };
  }
  return { type: 'unknown', message: err.message };
}

async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs,
    signal: userSignal,
  } = options;

  const fetchOptions = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body !== undefined) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  if (timeoutMs !== undefined && userSignal === undefined) {
    fetchOptions.signal = AbortSignal.timeout(timeoutMs);
  } else if (userSignal !== undefined) {
    fetchOptions.signal = userSignal;
  }

  let res;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err) {
    const classified = classifyFetchError(err);
    const error = new Error(classified.message);
    error.type = classified.type;
    error.cause = err;
    throw error;
  }

  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    const error = new Error(`API 响应解析失败: ${res.status} ${res.statusText}`);
    error.type = 'parse';
    error.status = res.status;
    error.cause = parseErr;
    throw error;
  }

  if (!res.ok) {
    const errorMessage = data.error?.message || JSON.stringify(data.error) || res.statusText;
    const classified = classifyHttpError(res.status, errorMessage);
    const error = new Error(classified.message);
    error.type = classified.type;
    error.status = res.status;
    error.data = data;
    throw error;
  }

  if (data.error) {
    const errorMessage = data.error.message || JSON.stringify(data.error);
    const classified = classifyHttpError(res.status, errorMessage);
    const error = new Error(classified.message);
    error.type = classified.type;
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return { data, response: res };
}

async function callChatCompletion({ baseURL, apiKey, model, messages, tools, temperature, maxTokens, signal, timeoutMs }) {
  const url = `${baseURL}/chat/completions`;
  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const { data } = await fetchJson(url, {
    method: 'POST',
    headers,
    body,
    timeoutMs,
    signal,
  });

  return data;
}

module.exports = { fetchJson, callChatCompletion, classifyHttpError, classifyFetchError };
