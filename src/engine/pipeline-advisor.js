const { resolve, dirname } = require('path');
const { existsSync, writeFileSync, mkdirSync } = require('fs');
const { loadJsonFile, extractJsonFromText } = require('./utils');

const DEFAULT_FEATURES = {
  llm_pipeline_generation: true,   // LLM 决定管线结构
  llm_stage_flow: true,            // LLM 决定阶段间流转
  llm_history_analysis: true,      // LLM 分析执行历史优化模板
};

class PipelineAdvisor {
  constructor(config) {
    this.config = config;
    this.features = { ...DEFAULT_FEATURES, ...config?.features };
  }

  isEnabled(feature) {
    return this.features[feature] === true;
  }

  setFeature(feature, value) {
    this.features[feature] = value;
  }

  setFeatures(features) {
    this.features = { ...DEFAULT_FEATURES, ...features };
  }

  getFeatures() {
    return { ...this.features };
  }

  // ── 任务 1：LLM 生成管线 ──

  generatePipeline(topic, category, _existingStages) {
    const stages = [
      { id: 'research', desc: '文献调研，生成研究简报' },
      { id: 'skeleton', desc: '设计论文大纲' },
      { id: 'code', desc: '编写并执行建模代码（仅竞赛/数据类需要）' },
      { id: 'draft', desc: '逐章撰写正文' },
      { id: 'figure', desc: '生成学术图表' },
      { id: 'summary', desc: '生成结构化摘要' },
      { id: 'review', desc: '多角度审稿评审' },
      { id: 'evolve', desc: '分析审稿反馈，自动改进' },
      { id: 'revise', desc: '基于审稿意见修改论文' },
      { id: 'format', desc: '格式化论文' },
      { id: 'export', desc: '导出为 LaTeX/PDF' },
    ];

    const prompt = `你是一个学术写作流水线规划专家。根据论文主题和类别，决定需要哪些写作阶段。

论文主题：${topic || '未指定'}
论文类别：${category}

可用阶段及说明：
${stages.map(s => `- ${s.id}: ${s.desc}`).join('\n')}

规则：
- 所有论文都需要 research、skeleton、draft、review、export
- 只有竞赛/数据类论文才需要 code 阶段
- 图表丰富的论文需要 figure 阶段
- 综述类论文可以跳过 code 和 figure
- 轻量级模式跳过 evolve 和 summary
- 完整模式包含所有阶段

请输出 JSON 格式：
{
  "stages": ["research", "skeleton", "draft", "review", "export"],
  "reason": "选择这些阶段的原因",
  "params": {
    "draft.minWords": 6000,
    "review.ensemble": true,
    "figure.enabled": false
  }
}`;

    return { prompt, stages };
  }

  parsePipelineFromLLM(llmResponse) {
    const parsed = extractJsonFromText(llmResponse);
    if (parsed) {
      return {
        stages: parsed.stages || [],
        reason: parsed.reason || '',
        params: parsed.params || {},
      };
    }
    // Fallback: return default lightweight pipeline
    return { stages: ['research', 'skeleton', 'draft', 'review', 'export'], reason: '解析失败，使用默认', params: {} };
  }

  // ── 任务 2：LLM 决定阶段间流转 ──

  parseFlowDecision(llmResponse) {
    const parsed = extractJsonFromText(llmResponse);
    if (parsed) {
      return {
        decision: parsed.decision || 'proceed',
        reason: parsed.reason || '',
        feedback: parsed.feedback || '',
        score: parsed.score || 80,
      };
    }
    return { decision: 'proceed', reason: '解析失败，默认继续', feedback: '', score: 80 };
  }

  // ── 配置持久化 ──

  static loadFeatures(projectDir) {
    const configPath = resolve(projectDir, '.openpip', 'features.json');
    return loadJsonFile(configPath, DEFAULT_FEATURES);
  }

  static saveFeatures(projectDir, features) {
    const configPath = resolve(projectDir, '.openpip', 'features.json');
    const dir = dirname(configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(features, null, 2), 'utf-8');
  }
}

module.exports = { PipelineAdvisor, DEFAULT_FEATURES };
