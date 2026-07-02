const { join } = require('path');
const { loadYaml } = require('../utils');
const { DEFAULT_MODEL } = require('../constants');

const TIER_MATRIX_PATH = join(__dirname, '..', '..', '..', '..', 'config', 'model-tier-matrix.yaml');

// Agent → Tier 映射（fallback，YAML 不可用时使用）
// 优先从 model-tier-matrix.yaml 的 agentTierReference 读取
const AGENT_TIER_MAP = {
  orchestrator: 'L0',
  researcher: 'L1',
  planner: 'L1',
  writer: 'L1',
  coder: 'L1',
  reviewer: 'L2',
  formatter: 'L0',
  'contribution-architect': 'L1',
  'adversarial-researcher': 'L2',
  'code-reviewer': 'L2',
};

// Complexity scoring: estimate task complexity 0-1
function scoreComplexity(taskDescription) {
  if (!taskDescription) return 0.5;
  const text = taskDescription.toLowerCase();
  let score = 0.3;
  if (text.includes('创新') || text.includes('方法') || text.includes('理论')) score += 0.2;
  if (text.includes('实验') || text.includes('数据') || text.includes('分析')) score += 0.15;
  if (text.includes('润色') || text.includes('格式') || text.includes('检查')) score -= 0.15;
  if (text.includes('综述') || text.includes('总结')) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

function loadTierMatrix() {
  return loadYaml(TIER_MATRIX_PATH, null);
}

function getTierModels(tier, matrix) {
  if (!matrix || !matrix.tiers || !matrix.tiers[tier]) return [];
  return matrix.tiers[tier].models || [];
}

function getDefaultTier(taskType, matrix) {
  if (!matrix || !matrix.taskDefaults) return 'L1';
  return matrix.taskDefaults[taskType] || 'L1';
}

// YAML 优先的 Agent→Tier 映射：先从配置文件读取，不可用时回退到硬编码
function resolveAgentTier(agentName, matrix) {
  if (matrix?.agentTierReference?.[agentName]) {
    return matrix.agentTierReference[agentName];
  }
  return AGENT_TIER_MAP[agentName] || null;
}

// Task-aware routing: use agent type to determine tier
function routeModelForAgent(agentName, taskDescription, userPreference, budget) {
  const matrix = loadTierMatrix();

  // Determine tier from agent type or task complexity
  let tier;
  if (userPreference) {
    tier = typeof userPreference === 'string' && userPreference.startsWith('L') ? userPreference : null;
  }
  if (!tier && agentName) {
    tier = resolveAgentTier(agentName, matrix);
  }
  if (!tier) {
    const complexity = scoreComplexity(taskDescription);
    tier = complexity > 0.6 ? 'L2' : complexity < 0.3 ? 'L0' : 'L1';
  }

  const variant = tier === 'L0' ? 'strict' : tier === 'L3' ? 'concise' : 'standard';

  // Fallback when tier matrix config is absent
  if (!matrix) {
    return { model: DEFAULT_MODEL, tier, promptVariant: variant };
  }

  let candidates = getTierModels(tier, matrix);
  // 预算过滤（与 routeModel 行为一致）
  if (budget !== undefined && budget !== null) {
    const affordable = candidates.filter((m) => m.costPer1kTokens === undefined || m.costPer1kTokens <= budget);
    candidates = affordable.length > 0 ? affordable : candidates;
  }
  const modelId = candidates.length > 0 ? candidates[0].id : DEFAULT_MODEL;

  return { model: modelId, tier, promptVariant: variant };
}

function routeModel(taskType, userPreference, budget) {
  const matrix = loadTierMatrix();

  let tier;
  let modelId;

  if (userPreference) {
    if (typeof userPreference === 'string') {
      if (userPreference.startsWith('L')) {
        tier = userPreference;
      } else if (matrix) {
        for (const [t, config] of Object.entries(matrix.tiers)) {
          const found = config.models.find((m) => m.id === userPreference);
          if (found) { tier = t; modelId = found.id; break; }
        }
        if (!tier) tier = getDefaultTier(taskType, matrix);
      }
    } else if (typeof userPreference === 'object') {
      tier = userPreference.tier || (matrix ? getDefaultTier(taskType, matrix) : 'L1');
      modelId = userPreference.model;
    }
  } else {
    tier = matrix ? getDefaultTier(taskType, matrix) : 'L1';
  }

  if (!tier) tier = 'L1';

  const variant = tier === 'L0' ? 'strict' : tier === 'L3' ? 'concise' : 'standard';

  // Fallback when tier matrix config is absent
  if (!matrix) {
    return { model: modelId || DEFAULT_MODEL, tier, promptVariant: variant };
  }

  if (!modelId) {
    const candidates = getTierModels(tier, matrix);
    if (budget !== undefined && budget !== null) {
      const affordable = candidates.filter((m) => m.costPer1kTokens === undefined || m.costPer1kTokens <= budget);
      modelId = affordable.length > 0 ? affordable[affordable.length - 1].id : (candidates[candidates.length - 1]?.id || DEFAULT_MODEL);
    } else {
      modelId = candidates.length > 0 ? candidates[0].id : DEFAULT_MODEL;
    }
  }

  return { model: modelId, tier, promptVariant: variant };
}

function routeHybridModel(taskStages, userPreference, budget) {
  const results = {};
  for (const [stage, taskType] of Object.entries(taskStages)) {
    results[stage] = routeModel(taskType, userPreference, budget);
  }
  return results;
}

// --- S5: 路由缓存 ---
const routeCache = new Map();
function routeCached(agentName, taskDescription, userPreference, budget) {
  const key = `${agentName}:${taskDescription?.slice(0, 20)}`;
  if (routeCache.has(key)) return routeCache.get(key);
  const result = routeModelForAgent(agentName, taskDescription, userPreference, budget);
  routeCache.set(key, result);
  return result;
}

module.exports = {
  routeModel, routeModelForAgent, routeHybridModel,
  loadTierMatrix, scoreComplexity, AGENT_TIER_MAP,
  routeCached,
};
