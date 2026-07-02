const { detectPlatform, getAvailableTools, loadMatrix } = require('./platform-detector');
const { loadTierMatrix } = require('../llm/model-router');

const TASK_TYPE_LABELS = {
  writing: '论文撰写',
  analysis: '数据分析',
  formatting: '格式排版',
  figure: '图表生成',
  review: '审稿修订',
  research: '文献调研',
  outline: '大纲设计',
  polish: '学术润色',
  summarize: '摘要生成',
  integrity: '完整性检查',
};

const TASK_TYPE_INSTRUCTIONS = {
  writing: '请以学术论文的标准进行撰写，使用第三人称和被动语态，确保逻辑严密、论据充分。',
  analysis: '请对数据进行深入分析，使用适当的方法论，确保结论可靠并有数据支撑。',
  formatting: '请按照 GB/T 7714-2015 标准进行格式排版，确保参考文献、公式编号、图表编号规范。',
  figure: '请生成高质量的学术图表，确保标注清晰、配色专业、数据准确。',
  review: '请从审稿人角度进行严格审查，指出问题并给出具体修改建议。',
  research: '请进行全面的文献调研，覆盖核心文献和最新进展，提供结构化的调研结果。',
  outline: '请设计逻辑清晰的论文大纲，确保各章节衔接自然、层次分明。',
  polish: '请对文本进行学术润色，去除AI痕迹和口语化表达，提升学术规范性。',
  summarize: '请生成简洁准确的摘要，涵盖研究目的、方法、结果和结论。',
  integrity: '请对论文进行完整性检查，确保各部分前后一致、无遗漏。',
};

function getPromptVariant(agentName, modelTier) {
  if (modelTier === 'L3') return 'concise';
  if (modelTier === 'L0') return 'strict';
  return 'standard';
}

function assemblePrompt(agentName, taskType, modelTier, platform, availableTools) {
  if (!platform) platform = detectPlatform();
  if (!availableTools) {
    const matrix = loadMatrix();
    availableTools = getAvailableTools(platform, matrix);
  }

  const variant = getPromptVariant(agentName, modelTier);
  const taskLabel = TASK_TYPE_LABELS[taskType] || taskType;
  const taskInstruction = TASK_TYPE_INSTRUCTIONS[taskType] || '';

  const toolNames = availableTools.map((t) => t.name).join(', ');
  const toolSummary = availableTools.length > 0
    ? `可用工具（${availableTools.length}个）: ${toolNames}`
    : '无可用工具';

  const tierInstructions = {
    strict: '严格遵循规则，使用全量知识库，输出后需进行后置校验。',
    standard: '按标准流程执行，按需检索知识库。',
    concise: '自由发挥，简洁输出，无需过多约束。',
  };

  const parts = [
    `## 任务类型: ${taskLabel}`,
    taskInstruction ? `## 任务要求\n${taskInstruction}` : '',
    `## 模型层级: ${modelTier} (${variant})`,
    `## 策略指令\n${tierInstructions[variant] || tierInstructions.standard}`,
  ];

  // 仅对需要环境信息的 agent 注入运行时信息
  const NEEDS_ENVIRONMENT = ['coder', 'formatter'];
  if (NEEDS_ENVIRONMENT.includes(agentName)) {
    parts.push(`## 运行环境\n- 操作系统: ${platform.os} ${platform.osVersion}\n- 运行时: Python=${platform.runtimes.python}, LaTeX=${platform.runtimes.latex}, Pandoc=${platform.runtimes.pandoc}, Git=${platform.runtimes.git}\n- 权限: admin=${platform.permissions.admin}, writable=${platform.permissions.workspaceWritable}\n- 网络: online=${platform.network.online}, private=${platform.network.privateMode}`);
    parts.push(`## 可用工具\n${toolSummary}`);
  }

  // 对内容生成 agent 注入写作指导
  const NEEDS_WRITING_GUIDE = ['writer', 'planner', 'researcher'];
  if (NEEDS_WRITING_GUIDE.includes(agentName)) {
    parts.push('## 写作要求\n使用第三人称和被动语态，确保逻辑严密、论据充分。每段遵循 Claim → Evidence → Warrant → Transition 结构。');
  }

  // 对 reviewer 注入审稿标准
  if (agentName === 'reviewer') {
    parts.push('## 审稿标准\n重点关注：贡献清晰度、论证严密性、实验严谨性、over-claiming。Critical issues 应明确标注。');
  }

  return parts.filter(Boolean).join('\n\n');
}

module.exports = { assemblePrompt, getPromptVariant, loadTierMatrix, TASK_TYPE_LABELS, TASK_TYPE_INSTRUCTIONS };
