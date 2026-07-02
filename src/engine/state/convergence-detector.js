// 三重收敛检测器（纯 JS，无外部依赖）
// 升级为可组合终止条件系统

const { FORBIDDEN_WORDS } = require('../constants');

// ============================================================
// 默认阈值常量
// ============================================================

// 段落过滤
const MIN_PARAGRAPH_LENGTH = 50;

// 引用密度
const MIN_CITATIONS_PER_PARA = 2;
const CITATION_RATE_THRESHOLD = 0.8;

// 语义相似度
const DEFAULT_SIMILARITY_THRESHOLD = 0.99;

// 分数阈值
const DEFAULT_SCORE_THRESHOLD = 80;

// ============================================================
// 字符频率向量 & 余弦相似度（内部工具）
// ============================================================

function charFrequencyVector(text) {
  const vec = {};
  const clean = text.replace(/\s+/g, '').toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    vec[ch] = (vec[ch] || 0) + 1;
  }
  return vec;
}

function cosineSimilarity(a, b) {
  const vecA = typeof a === 'string' ? charFrequencyVector(a) : a;
  const vecB = typeof b === 'string' ? charFrequencyVector(b) : b;

  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0, normA = 0, normB = 0;

  for (const k of keys) {
    const va = vecA[k] || 0;
    const vb = vecB[k] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ============================================================
// 终止条件注册表（支持用户扩展）
// 每个条件: (reviews, scores, options) => { passed: boolean, reason: string }
// ============================================================

const conditionRegistry = new Map();

function registerCondition(name, fn) {
  conditionRegistry.set(name, fn);
}

function getCondition(name) {
  return conditionRegistry.get(name);
}

// ============================================================
// 内置终止条件
// ============================================================

// 禁用词清零
registerCondition('no_forbidden_words', (reviews, _scores, _options = {}) => {
  if (reviews.length === 0) return { passed: false, reason: '无评审数据' };
  const last = reviews[reviews.length - 1];
  const found = FORBIDDEN_WORDS.filter(w => (typeof last === 'string' ? last : '').includes(w));
  return {
    passed: found.length === 0,
    reason: found.length === 0
      ? '无禁用词'
      : `仍含 ${found.length} 个禁用词: ${found.slice(0, 3).join(', ')}${found.length > 3 ? '...' : ''}`,
  };
});

// 引用密度达标（≥2篇/段）
registerCondition('has_enough_citations', (reviews, _scores, _options = {}) => {
  if (reviews.length === 0) return { passed: false, reason: '无评审数据' };
  const last = reviews[reviews.length - 1];
  const text = typeof last === 'string' ? last : '';
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > MIN_PARAGRAPH_LENGTH);
  let totalWithCitations = 0;
  let underCited = 0;

  for (const para of paragraphs) {
    const citations = para.match(/\[\d+(?:,\s*\d+)*\]/g) || [];
    if (citations.length === 0) continue;
    totalWithCitations++;
    if (citations.length < MIN_CITATIONS_PER_PARA) underCited++;
  }

  if (totalWithCitations === 0) {
    return { passed: false, reason: '未检测到含引用的段落' };
  }

  const rate = 1 - (underCited / totalWithCitations);
  return {
    passed: rate >= CITATION_RATE_THRESHOLD,
    reason: rate >= CITATION_RATE_THRESHOLD
      ? `引用密度 ${(rate * 100).toFixed(0)}% 段落≥${MIN_CITATIONS_PER_PARA}篇引用`
      : `仅 ${(rate * 100).toFixed(0)}% 段落达标，需≥${CITATION_RATE_THRESHOLD * 100}%`,
  };
});

// 语义收敛（余弦>0.99）
registerCondition('converged_semantically', (reviews, _scores, options = {}) => {
  const threshold = options.similarityThreshold || DEFAULT_SIMILARITY_THRESHOLD;
  if (reviews.length < 2) return { passed: false, reason: '轮数不足，无法比较' };

  const last = reviews[reviews.length - 1];
  const prev = reviews[reviews.length - 2];
  const sim = cosineSimilarity(last, prev);

  return {
    passed: sim > threshold,
    reason: sim > threshold
      ? `余弦相似度 ${(sim * 100).toFixed(2)}% > ${(threshold * 100).toFixed(0)}%`
      : `余弦相似度 ${(sim * 100).toFixed(2)}% ≤ ${(threshold * 100).toFixed(0)}%`,
  };
});

// 分数达标（≥80分）
registerCondition('score_above_threshold', (_reviews, scores, options = {}) => {
  const threshold = options.scoreThreshold || DEFAULT_SCORE_THRESHOLD;
  if (scores.length === 0) return { passed: false, reason: '无分数数据' };

  const lastScores = scores[scores.length - 1];
  if (!lastScores || lastScores.length === 0) {
    return { passed: false, reason: '分数数据缺失' };
  }

  const avg = lastScores.reduce((a, b) => a + b, 0) / lastScores.length;
  return {
    passed: avg >= threshold,
    reason: avg >= threshold
      ? `平均分 ${avg.toFixed(1)} ≥ ${threshold}`
      : `平均分 ${avg.toFixed(1)} < ${threshold}`,
  };
});

// ============================================================
// 组合逻辑（内部）
// ============================================================

function combinatorAnd(conditionResults) {
  const allPassed = conditionResults.every(r => r.passed);
  return {
    passed: allPassed,
    reason: allPassed
      ? `所有条件通过: ${conditionResults.map(r => r.reason).join(' | ')}`
      : `未满足: ${conditionResults.filter(r => !r.passed).map(r => r.reason).join(' | ')}`,
  };
}

function combinatorOr(conditionResults) {
  const passed = conditionResults.filter(r => r.passed);
  return {
    passed: passed.length > 0,
    reason: passed.length > 0
      ? `满足条件: ${passed.map(r => r.reason).join(' | ')}`
      : `无条件满足: ${conditionResults.map(r => r.reason).join(' | ')}`,
  };
}

// ============================================================
// 默认条件集
// ============================================================

const DEFAULT_CONDITIONS = [
  'no_forbidden_words',
  'has_enough_citations',
  'converged_semantically',
  'score_above_threshold',
];

// ============================================================
// 核心接口
// ============================================================

function detectConvergence(reviews, _dimensionSets, scoreArrays, options = {}) {
  const conditions = options.conditions || DEFAULT_CONDITIONS;
  const combinator = options.combinator || 'or'; // 'and' | 'or'

  const conditionResults = [];

  for (const name of conditions) {
    const fn = conditionRegistry.get(name);
    if (!fn) {
      console.warn(`  ⚠️ 未知终止条件: ${name}`);
      continue;
    }
    const result = fn(reviews, scoreArrays, options);
    conditionResults.push({ name, ...result });
  }

  // 组合判定
  const combined = combinator === 'and'
    ? combinatorAnd(conditionResults)
    : combinatorOr(conditionResults);

  const reasons = conditionResults.filter(r => r.passed).map(r => `[${r.name}] ${r.reason}`);
  const scores = scoreArrays.length > 0 ? scoreArrays[scoreArrays.length - 1] : [];

  return {
    converged: combined.passed,
    reasons: reasons.length > 0 ? reasons : [combined.reason],
    details: conditionResults,
    scores,
    combinedReason: combined.reason,
  };
}

module.exports = {
  detectConvergence,
  registerCondition,
  getCondition,
};

