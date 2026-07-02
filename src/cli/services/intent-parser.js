const { CHAT_TOOLS, resolveApiKey, resolveBaseURL, resolveModelId } = require('./tool-registry');
const { callChatCompletion, fetchJson } = require('../../engine/llm/fetch-helper');

const SYSTEM_PROMPT = `你是 OpenPip 的学术写作助手。你可以帮用户完成以下操作：

1. **创建项目** (init_project)：创建新的论文项目，需要选择类别（research/competition）和领域
2. **导入资料** (ingest_materials)：将 PDF、数据文件、赛题文件等导入项目
3. **执行写作** (run_pipeline)：自动执行论文写作流水线（系统会根据项目类别自动选择管线）
4. **查询状态** (query_status)：查看项目进度和已生成的文件
5. **导出论文** (export_paper)：将论文导出为 Markdown、Word 或 LaTeX 格式
6. **代码审查** (review_code)：审查代码文件，生成质量/安全/性能报告

类别与领域选择规则：
- 用户说"写论文/科研论文/期刊论文" → category=research, domain 根据内容判断
- 用户说"数学建模竞赛/国赛/美赛" → category=competition, domain=math-modeling
- 用户说"数据竞赛/kaggle" → category=competition, domain=data-science
- 用户说"计算机/NLP/CV/深度学习" → category=research, domain=cs
- 用户说"数学/拓扑/代数" → category=research, domain=math
- 用户说"工程/机械/电子" → category=research, domain=engineering
- 默认 → category=research, domain=general

管线选择规则：
- 默认使用项目类别的轻量级管线
- 用户说"深度版/完整版" → 使用完整管线（full-research）
- 用户说"竞赛专用" → 使用竞赛管线（competition-math-modeling）
- 不确定时先问用户

规则：
- 用户意图明确时直接调用对应工具
- 意图不明确时先确认再执行
- 每次工具调用后用简洁的中文总结结果
- 如果用户没有指定项目名，使用当前活跃项目
- 用户可以开关 LLM 优化功能（toggle_feature），包括：
  - llm_pipeline_generation: LLM 自动优化管线结构
  - llm_stage_flow: LLM 决定阶段间流转（质量评估）
  - llm_history_analysis: LLM 分析执行历史优化模板
- 支持中英文对话`;

class IntentParser {
  constructor(model, config) {
    this.model = model;
    this.config = config;
    this.messages = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];
  }

  async parse(userInput, sessionContext) {
    // Inject session context into system prompt if available
    if (sessionContext) {
      const contextMsg = this.messages.find(m => m.role === 'system');
      if (contextMsg) {
        contextMsg.content = SYSTEM_PROMPT + `\n\n当前会话状态：\n${sessionContext}`;
      }
    }

    this.messages.push({ role: 'user', content: userInput });

    const apiKey = resolveApiKey(this.model, this.config);
    const baseURL = resolveBaseURL(this.model);
    const modelId = resolveModelId(this.model);

    if (!apiKey && !baseURL) {
      return {
        type: 'text',
        content: '❌ 未配置 API Key。请先执行 openpip config 进行配置。\n\n支持的模型提供商：\n  - DeepSeek (推荐): openpip config → 输入 DeepSeek API Key\n  - OpenRouter: openpip config → 输入 OpenRouter API Key\n  - Ollama (本地): 确保 Ollama 已启动，无需 API Key',
      };
    }

    // For Ollama, use generate API without tools
    if (this.model.startsWith('ollama/')) {
      return this._callOllama(userInput, apiKey);
    }

    // OpenAI-compatible API with function calling
    let data;
    try {
      data = await callChatCompletion({
        baseURL,
        apiKey,
        model: modelId,
        messages: this.messages,
        tools: CHAT_TOOLS,
        temperature: 0.3,
        maxTokens: 2048,
        timeoutMs: 30000,
      });
    } catch (err) {
      if (err.type === 'timeout') {
        return { type: 'text', content: '❌ API 请求超时，请检查网络连接后重试。' };
      }
      if (err.type === 'network') {
        return { type: 'text', content: `❌ 无法连接到 API 服务器 (${baseURL})，请检查网络。` };
      }
      if (err.type === 'auth') {
        return { type: 'text', content: '❌ API Key 无效或已过期。请执行 openpip config 重新配置。' };
      }
      if (err.type === 'rate_limit') {
        return { type: 'text', content: '❌ API 请求频率超限。请稍等片刻后重试，或切换到其他模型。' };
      }
      return { type: 'text', content: `❌ API 调用失败: ${err.message}` };
    }

    const message = data.choices?.[0]?.message;
    if (!message) {
      return { type: 'text', content: '❌ API 返回了空响应。请换个说法重试。' };
    }

    // Check for tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Record the assistant message with tool calls
      this.messages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls,
      });

      const toolCalls = message.tool_calls.map(tc => {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* 工具参数解析失败，使用空对象 */ }
        return { name: tc.function?.name, args, id: tc.id };
      });

      return { type: 'tool_call', toolCalls, text: message.content || '' };
    }

    // Plain text response
    this.messages.push({ role: 'assistant', content: message.content || '' });
    return { type: 'text', content: message.content || '' };
  }

  async addToolResult(toolCallId, result) {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: typeof result === 'string' ? result.slice(0, 4000) : JSON.stringify(result).slice(0, 4000),
    });
  }

  async summarizeToolResults() {
    const apiKey = resolveApiKey(this.model, this.config);
    const baseURL = resolveBaseURL(this.model);
    const modelId = resolveModelId(this.model);

    this.messages.push({
      role: 'user',
      content: '请用简洁的中文总结刚才的操作结果。',
    });

    try {
      const data = await callChatCompletion({
        baseURL,
        apiKey,
        model: modelId,
        messages: this.messages,
        temperature: 0.3,
        maxTokens: 1024,
        timeoutMs: 30000,
      });
      const content = data.choices?.[0]?.message?.content || '操作已完成。';
      this.messages.push({ role: 'assistant', content });
      return content;
    } catch {
      // LLM 调用失败，回退到基于消息的工具结果摘要
      const toolResults = this.messages.filter(m => m.role === 'tool');
      if (toolResults.length > 0) {
        const last = toolResults[toolResults.length - 1];
        try {
          const parsed = JSON.parse(last.content);
          this.messages.push({ role: 'assistant', content: '操作已完成。' });
          return parsed.success
            ? `✅ 操作成功。${parsed.path ? `文件: ${parsed.path}` : ''}${parsed.message ? ` ${parsed.message}` : ''}`
            : `❌ 操作失败: ${parsed.error || '未知错误'}`;
        } catch {
          // JSON 解析失败，回退到通用消息
        }
      }
      this.messages.push({ role: 'assistant', content: '操作已完成。' });
      return '操作已完成。';
    }
  }

  async _callOllama(userInput, endpoint) {
    const modelId = this.model.replace('ollama/', '');
    const prompt = this.messages.map(m => {
      if (m.role === 'system') return `[System] ${m.content}`;
      if (m.role === 'user') return `[User] ${m.content}`;
      if (m.role === 'assistant') return `[Assistant] ${m.content}`;
      return '';
    }).filter(Boolean).join('\n\n') + '\n\n[User] ' + userInput;

    try {
      const { data } = await fetchJson(`${endpoint}/api/generate`, {
        method: 'POST',
        body: { model: modelId, prompt, stream: false, options: { temperature: 0.3 } },
        timeoutMs: 60000,
      });
      const content = data.response || '';
      this.messages.push({ role: 'assistant', content });
      return { type: 'text', content };
    } catch (err) {
      if (err.type === 'timeout') {
        return { type: 'text', content: '❌ Ollama 请求超时。请检查 Ollama 是否在运行 (ollama serve)。' };
      }
      if (err.type === 'network') {
        return { type: 'text', content: '❌ 无法连接到 Ollama。请确保已启动 (ollama serve) 并安装了模型 (ollama pull qwen2.5:14b)。' };
      }
      return { type: 'text', content: `❌ Ollama 调用失败: ${err.message}` };
    }
  }
}

module.exports = { IntentParser };
