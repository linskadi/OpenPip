const { formatDuration } = require('../utils');
const { globalTraceContext } = require('../infra/tracing');
const { defaultLogger } = require('../infra/logger');
const { resolveProvider, resolveApiKey, resolveModelId } = require('./provider-config');
const { fetchJson, callChatCompletion } = require('./fetch-helper');
const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');

// LLM 调用超时与 token 上限
const CHAT_TIMEOUT_MS = 120000;       // 主聊天补全：2 分钟
const TOOL_CALL_TIMEOUT_MS = 30000;   // 工具调用：30 秒
const CHAT_MAX_TOKENS = 8192;         // 主聊天补全最大输出
const TOOL_CALL_MAX_TOKENS = 4096;    // 工具调用最大输出

// Budget tracker for multi-agent pipelines
const budgetTracker = {
  totalTokens: 0,
  totalCost: 0,
  budgetLimit: null,
  costPerToken: 0.000002, // Default cost estimate
  agentUsage: {},

  reset(budgetLimit) {
    this.totalTokens = 0;
    this.totalCost = 0;
    this.budgetLimit = budgetLimit || null;
    this.agentUsage = {};
  },

  record(agentName, tokens, extra) {
    this.totalTokens += tokens;
    this.totalCost += tokens * this.costPerToken;
    if (!this.agentUsage[agentName]) this.agentUsage[agentName] = { tokens: 0, cost: 0, promptTokens: 0, completionTokens: 0 };
    this.agentUsage[agentName].tokens += tokens;
    this.agentUsage[agentName].cost += tokens * this.costPerToken;
    if (extra) {
      if (extra.promptTokens) this.agentUsage[agentName].promptTokens += extra.promptTokens;
      if (extra.completionTokens) this.agentUsage[agentName].completionTokens += extra.completionTokens;
    }
  },

  isOverBudget() {
    return this.budgetLimit !== null && this.totalCost >= this.budgetLimit;
  },

  getRemainingBudget() {
    return this.budgetLimit !== null ? this.budgetLimit - this.totalCost : Infinity;
  },

  getReport() {
    return {
      totalTokens: this.totalTokens,
      totalCost: this.totalCost.toFixed(4),
      budgetLimit: this.budgetLimit,
      remaining: this.getRemainingBudget().toFixed(4),
      byAgent: this.agentUsage,
    };
  },

  getStageReport() {
    const byStage = {};
    for (const [agent, usage] of Object.entries(this.agentUsage)) {
      if (!byStage[agent]) byStage[agent] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
      byStage[agent].promptTokens += usage.promptTokens || 0;
      byStage[agent].completionTokens += usage.completionTokens || 0;
      byStage[agent].totalTokens += usage.tokens;
      byStage[agent].cost += usage.cost;
    }
    return byStage;
  },
};

async function callLLM(model, prompt, config) {
  if (typeof model === 'object' && model !== null && !Array.isArray(model)) {
    const opts = model;
    model = opts.model;
    prompt = opts.prompt;
    config = opts.config;
  }
  if (!config || !config.api_keys) {
    throw new Error('[LLM] 配置无效: config 或 config.api_keys 为空');
  }

  const requestId = globalTraceContext.nextRequestId();
  const traceId = globalTraceContext.getTraceId();
  const startTime = Date.now();
  const isOllama = model.startsWith('ollama/');

  defaultLogger.debug('LLM request start', {
    request_id: requestId,
    trace_id: traceId,
    model,
    prompt_length: prompt?.length || 0,
  });

  if (isOllama) {
    const endpoint = resolveApiKey(model, config);
    const modelName = resolveModelId(model);
    const temperature = config?.temperature !== undefined ? config.temperature : 0.7;
    let data;
    try {
      const result = await fetchJson(`${endpoint}/api/generate`, {
        method: 'POST',
        body: { model: modelName, prompt, stream: false, options: { temperature } },
        timeoutMs: CHAT_TIMEOUT_MS,
      });
      data = result.data;
    } catch (err) {
      const logPayload = {
        request_id: requestId,
        trace_id: traceId,
        model,
        error: err.message,
        duration_ms: Date.now() - startTime,
      };
      if (err.status !== undefined) {
        logPayload.http_status = err.status;
      }
      if (err.type === 'parse') {
        defaultLogger.error('LLM response parse failed', logPayload);
      } else {
        defaultLogger.error('LLM request failed', logPayload);
      }
      throw new Error(`[Ollama/${modelName}] ${err.message}`);
    }
    const ollamaUsage = {
      promptTokens: data.prompt_eval_count || 0,
      completionTokens: data.eval_count || 0,
    };
    const duration = Date.now() - startTime;
    budgetTracker.record(model, ollamaUsage.promptTokens + ollamaUsage.completionTokens, ollamaUsage);
    defaultLogger.info('LLM request completed', {
      request_id: requestId,
      trace_id: traceId,
      model,
      prompt_tokens: ollamaUsage.promptTokens,
      completion_tokens: ollamaUsage.completionTokens,
      total_tokens: ollamaUsage.promptTokens + ollamaUsage.completionTokens,
      duration_ms: duration,
    });
    return data.response || '';
  }

  const { apiKey, baseURL, modelId } = resolveProvider(model, config);

  if (!apiKey) {
    defaultLogger.error('LLM missing API key', {
      request_id: requestId,
      trace_id: traceId,
      model,
    });
    throw new Error(`[LLM] 未配置 ${model} 的 API Key。请运行 openpip config 设置。`);
  }

  const temperature = config?.temperature !== undefined ? config.temperature : 0.7;
  let data;
  try {
    data = await callChatCompletion({
      baseURL,
      apiKey,
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      maxTokens: CHAT_MAX_TOKENS,
      timeoutMs: CHAT_TIMEOUT_MS,
    });
  } catch (err) {
    const logPayload = {
      request_id: requestId,
      trace_id: traceId,
      model,
      error: err.message,
      duration_ms: Date.now() - startTime,
    };
    if (err.status !== undefined) {
      logPayload.http_status = err.status;
    }
    if (err.type === 'parse') {
      defaultLogger.error('LLM response parse failed', logPayload);
    } else {
      defaultLogger.error('LLM request failed', logPayload);
    }
    throw new Error(`[LLM/${model}] ${err.message}`);
  }
  const usage = data.usage || {};
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const duration = Date.now() - startTime;
  budgetTracker.record(model, promptTokens + completionTokens, { promptTokens, completionTokens });
  defaultLogger.info('LLM request completed', {
    request_id: requestId,
    trace_id: traceId,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    duration_ms: duration,
  });
  return data.choices?.[0]?.message?.content || '';
}

async function callLLMWithRetry(model, prompt, config, retries = 2) {
  if (typeof model === 'object' && model !== null && !Array.isArray(model)) {
    const opts = model;
    model = opts.model;
    prompt = opts.prompt;
    config = opts.config;
    retries = opts.retries ?? 2;
  }
  if (budgetTracker.isOverBudget()) {
    throw new Error(`[LLM] 预算已超限。已使用 $${budgetTracker.totalCost.toFixed(4)} / 限额 $${budgetTracker.budgetLimit}`);
  }
  for (let i = 0; i <= retries; i++) {
    try {
      return await callLLM(model, prompt, config);
    } catch (err) {
      const isRateLimit = err.message.includes('429') || err.message.includes('限流');
      const isNetwork = err.message.includes('网络') || err.message.includes('超时') || err.message.includes('ETIMEDOUT');

      if (i < retries) {
        const baseDelay = isRateLimit ? 10000 : isNetwork ? 5000 : 2000;
        const delay = baseDelay * (i + 1);
        const reason = isRateLimit ? '限流等待' : isNetwork ? '网络重试' : '重试';
        defaultLogger.warn(`⚠️ ${reason} (${i + 1}/${retries}): ${err.message}`);
        defaultLogger.warn(`   等待 ${formatDuration(delay)} 后重试...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        const fallback = config.fallback?.[model.split('/')[0]];
        if (fallback && fallback !== model) {
          defaultLogger.warn(`🔄 降级到备用模型: ${fallback}`);
          try { return await callLLM(fallback, prompt, config); } catch {
            throw new Error(`[LLM] 所有模型均失败。主模型: ${err.message}`);
          }
        }
        throw err;
      }
    }
  }
}

const ARXIV_TOOL = {
  type: 'function',
  function: {
    name: 'arxiv_search',
    description: 'Search arXiv for academic papers by keyword query',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "machine learning transformer")' },
        maxResults: { type: 'number', description: 'Maximum number of results (default 5, max 10)' },
      },
      required: ['query'],
    },
  },
};

const READ_FILES_TOOL = {
  type: 'function',
  function: {
    name: 'read_project_files',
    description: 'List and read files in the project directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root (e.g. "data/train.csv")' },
        maxLines: { type: 'number', description: 'Maximum lines to read (default 20)' },
      },
      required: ['path'],
    },
  },
};

const BUILTIN_TOOLS = {
  arxiv_search: async (args) => {
    const { searchArxiv, formatArxivResults } = require('../roles/tools/arxiv-search');
    const result = await searchArxiv(args.query, args.maxResults || 5);
    return formatArxivResults(result);
  },
  read_project_files: async (args, projectRoot, project) => {
    const fullPath = resolve(projectRoot, 'papers', project, args.path);
    if (!existsSync(fullPath)) return `文件不存在: ${args.path}`;
    const content = readFileSync(fullPath, 'utf-8');
    const maxLines = args.maxLines || 20;
    const lines = content.split('\n').slice(0, maxLines);
    return lines.join('\n') + (content.split('\n').length > maxLines ? `\n... (${content.split('\n').length - maxLines} more lines)` : '');
  },
};

async function callLLMWithTools(model, prompt, config, options = {}) {
  if (typeof model === 'object' && model !== null && !Array.isArray(model)) {
    const opts = model;
    model = opts.model;
    prompt = opts.prompt;
    config = opts.config;
    options = opts.options || {};
  }
  const { tools = ['arxiv_search'], projectRoot, project } = options;

  const selectedTools = tools
    .map(name => {
      if (name === 'arxiv_search') return ARXIV_TOOL;
      if (name === 'read_project_files') return READ_FILES_TOOL;
      return null;
    })
    .filter(Boolean);

  const messages = [
    { role: 'system', content: 'You are a research assistant. Use the provided tools to gather information.' },
    { role: 'user', content: prompt },
  ];

  let finalContent = '';
  const maxToolRounds = 5;

  if (!config || !config.api_keys) {
    throw new Error('[LLM] 配置无效: config 或 config.api_keys 为空');
  }

  const { apiKey, baseURL, modelId } = resolveProvider(model, config);

  if (!apiKey) throw new Error(`[LLM] 未配置 ${model} 的 API Key`);

  const toolTemperature = config?.temperature !== undefined ? config.temperature : 0.3;
  for (let round = 0; round < maxToolRounds; round++) {
    let data;
    try {
      data = await callChatCompletion({
        baseURL,
        apiKey,
        model: modelId,
        messages,
        tools: selectedTools.length > 0 ? selectedTools : undefined,
        temperature: toolTemperature,
        maxTokens: TOOL_CALL_MAX_TOKENS,
        timeoutMs: TOOL_CALL_TIMEOUT_MS,
      });
    } catch (err) {
      if (err.type === 'parse') {
        throw new Error(`[LLM/${model}] 响应解析失败`);
      }
      if (err.type === 'unknown' && err.data?.error) {
        throw new Error(`[LLM/${model}] ${err.data.error.message || JSON.stringify(err.data.error)}`);
      }
      throw new Error(`[LLM/${model}] 请求失败: ${err.message}`);
    }

    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message) throw new Error(`[LLM/${model}] 响应无 choices`);

    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push({ role: 'assistant', content: message.content || '', tool_calls: message.tool_calls });

      for (const tc of message.tool_calls) {
        const fnName = tc.function?.name;
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* 工具参数 JSON 解析失败，使用空对象 */ }

        let result = '';
        if (BUILTIN_TOOLS[fnName]) {
          try {
            result = await BUILTIN_TOOLS[fnName](args, projectRoot, project);
          } catch (err) {
            result = `工具执行错误: ${err.message}`;
          }
        } else {
          result = `未知工具: ${fnName}`;
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result.slice(0, 8000),
        });
        defaultLogger.debug('Tool call', { fnName, resultLength: result.length });
      }
    } else {
      finalContent = message.content || '';
      break;
    }
  }

  if (!finalContent && messages.length > 2) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'tool') {
      messages.push({ role: 'user', content: '请根据收集到的信息提供最终回答。' });
      try {
        const data = await callChatCompletion({
          baseURL,
          apiKey,
          model: modelId,
          messages,
          temperature: 0.3,
          maxTokens: TOOL_CALL_MAX_TOKENS,
          timeoutMs: TOOL_CALL_TIMEOUT_MS,
        });
        finalContent = data.choices?.[0]?.message?.content || '';
      } catch { /* 最终回答生成失败时使用已收集的工具结果 */ }
    }
  }

  return finalContent;
}

module.exports = { callLLM, callLLMWithRetry, callLLMWithTools, budgetTracker };
