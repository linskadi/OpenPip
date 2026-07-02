const { FORBIDDEN_WORDS } = require('../constants');

// ============================================================
// 常量定义
// ============================================================

// 禁用词检测
const FORBIDDEN_WORD_PENALTY = 10;

// 引用密度检查
const MIN_CITATIONS_PER_PARA = 2;
const MAX_CITATIONS_PER_PARA = 4;
const NO_CITATION_DEFAULT_SCORE = 80;
const MIN_PARAGRAPH_LENGTH = 50;

// 字数检查

// 一致性检查
const CONSISTENCY_ISSUE_PENALTY = 20;

// 论证质量
const CRITICAL_ARG_PENALTY = 30;
const MINOR_ARG_PENALTY = 5;

// 叙事连贯性
const NARRATIVE_MIN_CHARS = 200;
const NARRATIVE_SHORT_TEXT_SCORE = 50;
const CRITICAL_NARRATIVE_PENALTY = 25;
const MINOR_NARRATIVE_PENALTY = 5;

// ============================================================
// 指标注册表
// 每个指标: { name, weight, check(text, options) => { score, pass, issues } }
// ============================================================

const metricRegistry = new Map();

function registerMetric(name, fn, weight = 1) {
  metricRegistry.set(name, { name, fn, weight });
}

function getMetric(name) {
  return metricRegistry.get(name);
}

function getAllMetrics() {
  return [...metricRegistry.values()];
}

function unregisterMetric(name) {
  metricRegistry.delete(name);
}

// ============================================================
// 内置指标
// ============================================================

// 禁用词检测
registerMetric('forbidden_words', (text) => {
  const found = [];
  for (const word of FORBIDDEN_WORDS) {
    if (text.includes(word)) found.push(word);
  }
  const score = found.length === 0 ? 100 : Math.max(0, 100 - found.length * FORBIDDEN_WORD_PENALTY);
  return { score, pass: found.length === 0, issues: found.map(w => `禁用词: "${w}"`) };
}, 2);

// 引用密度检查（每段2-4篇）
registerMetric('citation_density', (text) => {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > MIN_PARAGRAPH_LENGTH);
  const issues = [];
  let totalParagraphs = 0;
  let underCited = 0;
  let overCited = 0;

  for (const para of paragraphs) {
    const citationMatches = para.match(/\[\d+(?:,\s*\d+)*\]/g) || [];
    if (citationMatches.length === 0) continue;
    totalParagraphs++;
    if (citationMatches.length < MIN_CITATIONS_PER_PARA) {
      underCited++;
      const preview = para.substring(0, 60).replace(/\n/g, ' ');
      issues.push(`引用不足（${citationMatches.length}篇）: "${preview}..."`);
    }
    if (citationMatches.length > MAX_CITATIONS_PER_PARA) {
      overCited++;
      const preview = para.substring(0, 60).replace(/\n/g, ' ');
      issues.push(`引用过多（${citationMatches.length}篇）: "${preview}..."`);
    }
  }

  if (totalParagraphs === 0) {
    return { score: NO_CITATION_DEFAULT_SCORE, pass: true, issues: ['未检测到含引用的段落'] };
  }

  const problemRate = (underCited + overCited) / totalParagraphs;
  const score = Math.round(Math.max(0, 100 - problemRate * 100));
  return { score, pass: score >= 60, issues };
}, 1);

// 字数检查
registerMetric('word_count', (text, options = {}) => {
  const minWords = options.minWords || 2000;
  const count = text.replace(/\s+/g, '').length;
  const score = count >= minWords ? 100 : Math.round((count / minWords) * 100);
  const issues = count < minWords ? [`字数 ${count} < 要求 ${minWords}`] : [];
  return { score, pass: count >= minWords, count, minWords, issues };
}, 1);

// 公式编号连续性
registerMetric('formula_numbering', (text) => {
  const regex = /\\label\{eq:(\d+)-(\d+)\}/g;
  const numbers = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    numbers.push(parseInt(match[2]));
  }
  const issues = [];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] !== numbers[i - 1] + 1) {
      issues.push(`公式编号跳号: ${numbers[i - 1]} -> ${numbers[i]}`);
    }
  }
  const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * CONSISTENCY_ISSUE_PENALTY);
  return { score, pass: issues.length === 0, issues };
}, 1);

// 术语一致性
const { checkTerminologyConsistency: checkTermConsistency } = require('./terminology');
registerMetric('terminology_consistency', (text, options = {}) => {
  const projectRoot = options.projectRoot || process.cwd();
  return checkTermConsistency(text, projectRoot);
}, 1);

// 图表/公式一致性
const { runConsistencyCheck } = require('./consistency-checker');
registerMetric('figure_formula_consistency', (text) => {
  const result = runConsistencyCheck(text);
  const score = result.issues.length === 0 ? 100 : Math.max(0, 100 - result.issues.length * CONSISTENCY_ISSUE_PENALTY);
  return { score, pass: result.issues.length === 0, issues: result.issues };
}, 1.5);

// 论证质量
const { extractClaims } = require('./claim-extractor');
const { checkArgumentation } = require('./argumentation-checker');
registerMetric('argumentation_quality', (text) => {
  const claims = extractClaims(text);
  const results = checkArgumentation(text, claims);
  const criticalIssues = results.filter(r => r.severity === 'critical' && !r.pass);
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const score = totalIssues === 0 ? 100 : Math.max(0, 100 - criticalIssues.length * CRITICAL_ARG_PENALTY - (totalIssues - criticalIssues.length) * MINOR_ARG_PENALTY);
  return { score, pass: criticalIssues.length === 0, issues: results.filter(r => !r.pass).map(r => `${r.description}: ${r.issues.length} issues`) };
}, 2);

// 叙事连贯性
const { checkNarrative } = require('./narrative-checker');
const { extractPromises } = require('./promise-extractor');
const { parseSections } = require('../utils');
registerMetric('narrative_coherence', (text) => {
  const charCount = text.replace(/\s+/g, '').length;
  if (charCount < NARRATIVE_MIN_CHARS) {
    return { score: NARRATIVE_SHORT_TEXT_SCORE, pass: false, issues: ['文本过短，无法评估叙事连贯性（需至少200字）'] };
  }
  const promises = extractPromises(text);
  const sections = parseSections(text).map(s => ({ title: s.title, text: s.content }));
  const results = checkNarrative(text, promises, sections);
  const criticalIssues = results.filter(r => r.severity === 'critical' && !r.pass);
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const score = totalIssues === 0 ? 100 : Math.max(0, 100 - criticalIssues.length * CRITICAL_NARRATIVE_PENALTY - (totalIssues - criticalIssues.length) * MINOR_NARRATIVE_PENALTY);
  return { score, pass: criticalIssues.length === 0, issues: results.filter(r => !r.pass).map(r => `${r.description}: ${r.issues.length} issues`) };
}, 1.5);

// ============================================================
// 组合判定
// ============================================================

// 加权平均模式
function weightedAverage(results, metricMap) {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [name, result] of Object.entries(results)) {
    const metric = metricMap.get(name);
    const weight = metric ? metric.weight : 1;
    weightedSum += result.score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

// 全部通过模式
function allPass(results) {
  return Object.values(results).every(r => r.pass);
}

// ============================================================
// 核心接口（保持原有签名兼容）
// ============================================================

function qualityCheck(text, options = {}) {
  const mode = options.mode || 'weighted'; // 'weighted' or 'all_pass'
  const enabledMetrics = options.metrics || [...metricRegistry.keys()];
  const results = {};

  for (const name of enabledMetrics) {
    const metric = metricRegistry.get(name);
    if (!metric) continue;
    results[name] = metric.fn(text, options);
  }

  const compositeScore = mode === 'weighted'
    ? weightedAverage(results, metricRegistry)
    : undefined;
  const pass = allPass(results);

  return { pass, results, compositeScore };
}

// 向后兼容的单独检查函数
function checkForbiddenWords(text) {
  return metricRegistry.get('forbidden_words').fn(text);
}

function checkTerminologyConsistency(text) {
  return metricRegistry.get('terminology_consistency').fn(text);
}

function checkFormulaNumbering(text) {
  return metricRegistry.get('formula_numbering').fn(text);
}

function checkWordCount(text, minWords) {
  return metricRegistry.get('word_count').fn(text, { minWords });
}

module.exports = {
  qualityCheck,
  checkForbiddenWords,
  checkTerminologyConsistency,
  checkFormulaNumbering,
  checkWordCount,
  registerMetric,
  getMetric,
  getAllMetrics,
  unregisterMetric,
};
