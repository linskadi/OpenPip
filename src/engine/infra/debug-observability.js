const { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } = require('fs');
const { resolve } = require('path');
const { loadJsonFile } = require('../utils');
const { globalTraceContext, generateTraceId } = require('./tracing');

// 执行追踪器（记录 LLM 调用、工具调用、Token 消耗，用于成本分析与调试）
class ExecutionTracer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.tracesDir = resolve(projectRoot, 'papers', 'traces');
    this.traces = [];
    this.currentTrace = null;
  }

  startTrace(operation, metadata = {}) {
    const traceId = generateTraceId();
    globalTraceContext.setTraceId(traceId);
    
    this.currentTrace = {
      id: traceId,
      trace_id: traceId,
      operation,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: null,
      status: 'running',
      metadata,
      steps: [],
      tokens: { input: 0, output: 0, total: 0 },
      toolCalls: [],
      llm_calls: [],
    };

    return this.currentTrace.id;
  }

  step(name, data = {}) {
    if (!this.currentTrace) return;

    this.currentTrace.steps.push({
      name,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  recordToolCall(toolName, input, output, duration) {
    if (!this.currentTrace) return;

    this.currentTrace.toolCalls.push({
      tool: toolName,
      input: typeof input === 'string' ? input.substring(0, 500) : input,
      output: typeof output === 'string' ? output.substring(0, 500) : output,
      duration,
      timestamp: new Date().toISOString(),
    });
  }

  recordLLMCall(callData) {
    if (!this.currentTrace) return;

    this.currentTrace.llm_calls.push({
      request_id: callData.request_id,
      model: callData.model,
      prompt_tokens: callData.prompt_tokens || 0,
      completion_tokens: callData.completion_tokens || 0,
      total_tokens: callData.total_tokens || 0,
      duration_ms: callData.duration_ms || 0,
      status: callData.status || 'completed',
      error: callData.error || null,
      timestamp: new Date().toISOString(),
    });

    this.currentTrace.tokens.input += callData.prompt_tokens || 0;
    this.currentTrace.tokens.output += callData.completion_tokens || 0;
    this.currentTrace.tokens.total += (callData.prompt_tokens || 0) + (callData.completion_tokens || 0);
  }

  recordTokens(input, output) {
    if (!this.currentTrace) return;

    this.currentTrace.tokens.input += input;
    this.currentTrace.tokens.output += output;
    this.currentTrace.tokens.total += input + output;
  }

  endTrace(status = 'completed') {
    if (!this.currentTrace) return null;

    this.currentTrace.endTime = new Date().toISOString();
    this.currentTrace.duration = new Date(this.currentTrace.endTime) - new Date(this.currentTrace.startTime);
    this.currentTrace.status = status;
    this.currentTrace.request_count = globalTraceContext.getRequestCount();

    this.traces.push(this.currentTrace);
    this.saveTrace(this.currentTrace);

    const trace = this.currentTrace;
    this.currentTrace = null;
    globalTraceContext.reset();

    return trace;
  }

  saveTrace(trace) {
    if (!existsSync(this.tracesDir)) {
      mkdirSync(this.tracesDir, { recursive: true });
    }

    const traceFile = resolve(this.tracesDir, `${trace.id}.json`);
    writeFileSync(traceFile, JSON.stringify(trace, null, 2));
  }

  getTrace(traceId) {
    const traceFile = resolve(this.tracesDir, `${traceId}.json`);
    return loadJsonFile(traceFile, null);
  }

  listTraces(limit = 50) {
    if (!existsSync(this.tracesDir)) return [];

    const files = readdirSync(this.tracesDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    return files.map(f => {
      const content = readFileSync(resolve(this.tracesDir, f), 'utf-8');
      return JSON.parse(content);
    });
  }

  generateReport(traceId) {
    const trace = this.getTrace(traceId);
    if (!trace) return null;

    let report = `# 执行追踪报告

## 基本信息
- **操作**: ${trace.operation}
- **状态**: ${trace.status}
- **开始时间**: ${trace.startTime}
- **结束时间**: ${trace.endTime}
- **耗时**: ${(trace.duration / 1000).toFixed(2)}s

## Token 使用
- **输入**: ${trace.tokens.input}
- **输出**: ${trace.tokens.output}
- **总计**: ${trace.tokens.total}

## 执行步骤

`;

    for (const step of trace.steps) {
      report += `### ${step.name}\n`;
      report += `- 时间: ${step.timestamp}\n`;
      if (step.data) {
        report += `- 数据: ${JSON.stringify(step.data)}\n`;
      }
      report += '\n';
    }

    if (trace.toolCalls.length > 0) {
      report += '## 工具调用\n\n';
      report += '| 工具 | 耗时 | 时间 |\n';
      report += '|------|------|------|\n';

      for (const call of trace.toolCalls) {
        report += `| ${call.tool} | ${call.duration}ms | ${call.timestamp} |\n`;
      }
    }

    return report;
  }
}

module.exports = {
  ExecutionTracer,
};
