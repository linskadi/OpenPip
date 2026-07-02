const { existsSync } = require('fs');
const { resolve } = require('path');
const { getResolver } = require('../resource-resolver');
const { loadYaml, safeReadFile } = require('../utils');
const { loadKnowledge, loadKnowledgeByClassification } = require('../knowledge/knowledge');
const { DEFAULT_MODEL } = require('../constants');
let loadKnowledgeHybrid;
try {
  loadKnowledgeHybrid = require('../knowledge/knowledge-rag').loadKnowledgeHybrid;
} catch (err) {
  console.warn(`[roles/loader] knowledge-rag 模块加载失败: ${err.message}`);
}

const SUBTASK_TO_TASK_TYPE = {
  draft: 'writing',
  polish: 'polish',
  summary: 'summarize',
  format: 'formatting',
  figure: 'figure',
  'competition-draft': 'writing',
  replan: 'outline',
};

const AGENT_TO_TASK_TYPE = {
  researcher: 'research',
  planner: 'outline',
  writer: 'writing',
  reviewer: 'review',
  coder: 'analysis',
  formatter: 'formatting',
};

const CORE_RULES_BY_ROLE = {
  writer: ['writing/academic-style.md', 'writing/forbidden-words.md', 'writing/zero-hallucination-rules.md', 'format/formula.md'],
  formatter: ['writing/academic-style.md', 'format/gb7714.md', 'format/formula.md', 'figure/academic-figure-rules.md'],
  reviewer: ['writing/zero-hallucination-rules.md', 'writing/academic-style.md', 'fallacies.md'],
  researcher: ['writing/zero-hallucination-rules.md'],
  planner: ['writing/academic-style.md', 'writing/zero-hallucination-rules.md'],
  orchestrator: ['writing/agent-collaboration-rules.md'],
  coder: [],
};

/**
 * 加载角色配置与 Prompt（使用 ResourceResolver 分层覆盖）
 * @param {string} name - 角色名
 * @param {string} projectRoot - 项目根目录
 * @param {string} query - RAG 查询文本
 * @param {object|null} classification - 分类对象 { firstClass, subClass }
 */
function loadRole(name, projectRoot, query = '', classification = null) {
  const resolver = getResolver(projectRoot);

  // ── 角色 YAML（REPLACE 策略） ──
  const yamlPath = resolver.resolveRoleConfig(name);
  if (!yamlPath) {
    const candidates = resolver.listRoles ? resolver.listRoles() : [];
    const hint = candidates.length > 0
      ? `\n  可用的角色: ${candidates.join(', ')}`
      : `\n  请确认 role-configs/ 目录下存在 ${name}.yaml`;
    throw new Error(`角色 '${name}' 配置文件未找到${hint}`);
  }

  // ── 角色 Prompt（REPLACE 策略） ──
  const promptPath = resolver.resolveRolePrompt(name);
  if (!promptPath) {
    throw new Error(`角色 '${name}' 提示词文件未找到\n  请确认 role-prompts/ 目录下存在 ${name}.md`);
  }

  // ── 加载 YAML 配置 ──
  const parsed = loadYaml(yamlPath, null);
  if (!parsed) {
    throw new Error(`角色 '${name}' 配置文件解析失败: ${yamlPath}`);
  }

  // ── 知识文件（EXTEND 策略：三层累加） ──
  let knowledgeContent = '';
  let knowledgeFiles = parsed.knowledge || [];

  // 分类过滤知识文件
  if (classification && classification.firstClass) {
    const classificationMapPath = resolver.resolveClassificationMap();
    const filtered = loadKnowledgeByClassification(knowledgeFiles, classification, classificationMapPath);
    if (filtered.length < knowledgeFiles.length) {
      const removed = knowledgeFiles.filter(k => !filtered.includes(k));
      console.log(`  📋 分类知识过滤: [${name}] 移除了 ${removed.join(', ')}`);
    }
    knowledgeFiles = filtered;
  }

  if (knowledgeFiles.length > 0) {
    // 收集所有层的知识目录
    const knowledgeDirs = resolver.resolveKnowledgeDirs();

    // 验证知识文件存在于至少一个目录中
    const missing = [];
    for (const k of knowledgeFiles) {
      let found = false;
      for (const dir of knowledgeDirs) {
        if (existsSync(resolve(dir, k))) { found = true; break; }
      }
      if (!found) missing.push(k);
    }
    if (missing.length > 0) {
      console.warn(`  ⚠️ [${name}] 知识文件缺失（不中断）: ${missing.join(', ')}`);
    }

    // 使用主知识目录加载内容（knowledge.js 需要单个 dir 参数）
    const primaryKnowledgeDir = knowledgeDirs.length > 0 ? knowledgeDirs[knowledgeDirs.length - 1] : null;

    if (query && loadKnowledgeHybrid && primaryKnowledgeDir) {
      const coreRules = CORE_RULES_BY_ROLE[name] || ['writing/academic-style.md'];
      knowledgeContent = loadKnowledgeHybrid(knowledgeFiles, primaryKnowledgeDir, query, {
        coreRules,
        topK: 5,
        agentName: name,
      });
    } else if (primaryKnowledgeDir) {
      knowledgeContent = loadKnowledge(knowledgeFiles, primaryKnowledgeDir);
    }
  }

  return {
    name,
    model: parsed.model || DEFAULT_MODEL,
    temperature: parsed.temperature || 0.7,
    topP: parsed.topP,
    prompt: parsed.prompt || `${name}.md`,
    knowledge: knowledgeFiles,
    promptText: safeReadFile(promptPath) || '',
    _knowledgeContent: knowledgeContent,
    ensemble: parsed.ensemble || null,
    modes: parsed.modes || null,
    subtasks: parsed.subtasks || null,
    tools: parsed.tools || null,
  };
}

// @deprecated v0.2.0 - 使用 loadRole 代替
const loadAgent = loadRole;

module.exports = { loadRole, loadAgent, SUBTASK_TO_TASK_TYPE, AGENT_TO_TASK_TYPE, CORE_RULES_BY_ROLE };
